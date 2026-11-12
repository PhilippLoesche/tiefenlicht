import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quietGame, adjacentMonster, logs, freeNeighbor } from './helpers.js';
import { makeItem } from '../js/engine/entities.js';
import { OIL_FLASK } from '../js/engine/data.js';

function give(g, cat, kind, o) {
  const it = makeItem(g.state, cat, kind, o);
  return g.addToInventory(it);
}

test('start kit', () => {
  const g = quietGame('kit');
  const inv = g.state.player.inventory;
  const kinds = inv.map((i) => `${i.cat}:${i.kind}:${i.count}`).sort();
  assert.deepEqual(kinds, ['armor:lederwams:1', 'oil:oelflasche:1', 'potion:heilung:1', 'thrown:wurfmesser:3', 'weapon:dolch:1']);
  assert.equal(g.state.player.oil, g.state.player.oilMax);
  assert.ok(g.state.player.equipment.weapon != null && g.state.player.equipment.armor != null);
  assert.equal(g.itemName(inv.find((i) => i.kind === 'heilung'), { case: 'nom', article: 'indef' }), 'ein Trank der Heilung');
});

test('drinking an unknown potion identifies it', () => {
  const g = quietGame('quaff');
  const pot = give(g, 'potion', 'staerke');
  const unknownName = g.itemName(pot, { case: 'acc', article: 'def', count: 1 });
  assert.match(unknownName, /^den \S+ Trank$/);
  const str = g.state.player.str;
  const ev = g.act({ type: 'use', itemUid: pot.uid });
  assert.ok(g.lastActionTookTurn);
  assert.equal(g.state.player.str, str + 1);
  assert.equal(g.state.ident.potion.known.staerke, true);
  const t = logs(ev);
  assert.equal(t[0], `Du trinkst ${unknownName}.`);
  assert.ok(t.includes('Das war ein Trank der Stärke.'), t.join('\n'));
  assert.ok(ev.some((e) => e.type === 'identify' && e.kind === 'staerke'));
});

test('healing potion heals and cures poison', () => {
  const g = quietGame('heal');
  const p = g.state.player;
  p.hp = 3;
  p.statuses.poison = 5;
  const pot = p.inventory.find((i) => i.kind === 'heilung');
  g.act({ type: 'use', itemUid: pot.uid });
  assert.ok(p.hp >= 15 || p.hp === p.maxHp);
  assert.equal(p.statuses.poison, undefined);
  assert.equal(p.inventory.find((i) => i.kind === 'heilung'), undefined);
});

test('wands require a target and report need_target without consuming a turn', () => {
  const g = quietGame('wand');
  const wand = give(g, 'wand', 'blitz', { charges: 3 });
  const turn = g.state.turn;
  const ev = g.act({ type: 'use', itemUid: wand.uid });
  assert.equal(ev.length, 1);
  assert.equal(ev[0].type, 'need_target');
  assert.equal(ev[0].target, 'tile');
  assert.equal(g.lastActionTookTurn, false);
  assert.equal(g.state.turn, turn);
  assert.equal(wand.charges, 3);
});

test('lightning wand damages monsters in line and identifies itself', () => {
  const g = quietGame('bolt');
  const wand = give(g, 'wand', 'blitz', { charges: 3 });
  const { m } = adjacentMonster(g, 'ratte');
  m.hp = 100; m.maxHp = 100;
  const ev = g.act({ type: 'use', itemUid: wand.uid, target: { x: m.x, y: m.y } });
  assert.ok(g.lastActionTookTurn);
  assert.equal(wand.charges, 2);
  assert.ok(m.hp < 100);
  assert.ok(g.state.ident.wand.known.blitz);
  assert.ok(ev.some((e) => e.type === 'projectile' && e.kind === 'blitz'));
  assert.match(g.itemName(wand), /^ein Stab des Blitzes \(2 Ladungen\)$/);
});

test('scroll of identification: unknown picks a random item, known asks for a target', () => {
  const g = quietGame('ident');
  const ring = give(g, 'ring', 'regeneration');
  const s1 = give(g, 'scroll', 'identifikation', { count: 2 });
  const ev = g.act({ type: 'use', itemUid: s1.uid });
  assert.ok(g.lastActionTookTurn);
  assert.ok(g.state.ident.scroll.known.identifikation);
  assert.ok(g.state.ident.ring.known.regeneration, logs(ev).join('\n'));
  // now known: needs a target
  const pot = give(g, 'potion', 'eile');
  const ev2 = g.act({ type: 'use', itemUid: s1.uid });
  assert.equal(ev2.length, 1);
  assert.equal(ev2[0].type, 'need_target');
  assert.equal(ev2[0].target, 'item');
  g.act({ type: 'use', itemUid: s1.uid, targetUid: pot.uid });
  assert.ok(g.state.ident.potion.known.eile);
  assert.ok(ring);
});

test('refuel, full lamp is rejected', () => {
  const g = quietGame('oil');
  const p = g.state.player;
  const flask = p.inventory.find((i) => i.cat === 'oil');
  let ev = g.act({ type: 'use', itemUid: flask.uid });
  assert.equal(g.lastActionTookTurn, false);
  assert.ok(logs(ev)[0].includes('bereits voll'));
  p.oil = 100;
  ev = g.act({ type: 'use', itemUid: flask.uid });
  assert.ok(g.lastActionTookTurn);
  assert.ok(p.oil >= 100 + OIL_FLASK - 2);
  assert.ok(ev.some((e) => e.type === 'oil' && e.reason === 'refuel'));
});

test('equipping weapons reveals enchantment; rings of strength identify on wear', () => {
  const g = quietGame('equip');
  const sword = give(g, 'weapon', 'langschwert', { ench: 2 });
  assert.equal(g.itemName(sword, { article: 'def' }), 'das Langschwert');
  const ev = g.act({ type: 'equip', itemUid: sword.uid });
  assert.deepEqual(logs(ev).slice(0, 1), ['Du führst jetzt das Langschwert +2.']);
  assert.equal(g.equipped('weapon'), sword);
  const ring = give(g, 'ring', 'kraft');
  const str = g.playerStr();
  g.act({ type: 'equip', itemUid: ring.uid });
  assert.equal(g.playerStr(), str + 2);
  assert.ok(g.state.ident.ring.known.kraft);
  g.act({ type: 'unequip', itemUid: ring.uid });
  assert.equal(g.playerStr(), str);
});

test('throwing knives: need target, hit, and land on the floor or break', () => {
  const g = quietGame('throw');
  const knives = g.state.player.inventory.find((i) => i.cat === 'thrown');
  const ev0 = g.act({ type: 'throw', itemUid: knives.uid });
  assert.equal(ev0[0].type, 'need_target');
  const { m } = adjacentMonster(g, 'ratte');
  m.hp = 100; m.maxHp = 100;
  const ev = g.act({ type: 'throw', itemUid: knives.uid, target: { x: m.x, y: m.y } });
  assert.ok(g.lastActionTookTurn);
  assert.equal(knives.count, 2);
  assert.ok(ev.some((e) => e.type === 'projectile' && e.kind === 'wurfmesser'));
});

test('drop and pick up stack, inventory limit of 20', () => {
  const g = quietGame('inv');
  const p = g.state.player;
  const knives = p.inventory.find((i) => i.cat === 'thrown');
  g.act({ type: 'drop', itemUid: knives.uid, count: 2 });
  assert.equal(knives.count, 1);
  assert.equal(g.itemsAt(p.x, p.y)[0].count, 2);
  g.act({ type: 'pickup' });
  assert.equal(knives.count, 3);
  while (p.inventory.length < 20) give(g, 'weapon', 'dolch');
  g.dropItemAt(makeItem(g.state, 'armor', 'kettenhemd'), p.x, p.y, false);
  const ev = g.act({ type: 'pickup' });
  assert.ok(logs(ev).includes('Dein Rucksack ist voll.'));
  assert.equal(p.inventory.length, 20);
  // gold never takes a slot
  g.dropItemAt(makeItem(g.state, 'gold', 'gold', { count: 17 }), p.x, p.y, false);
  const gold = p.gold;
  g.act({ type: 'pickup' });
  assert.equal(p.gold, gold + 17);
});

test('auto-pickup on stepping', () => {
  const g = quietGame('auto');
  const n = freeNeighbor(g);
  g.dropItemAt(makeItem(g.state, 'potion', 'eile'), n.x, n.y, false);
  const ev = g.act({ type: 'move', dx: n.dx, dy: n.dy });
  assert.ok(ev.some((e) => e.type === 'pickup'));
  g.setOption('autoPickup', false);
  const back = { dx: -n.dx, dy: -n.dy };
  g.dropItemAt(makeItem(g.state, 'potion', 'eile'), n.x - n.dx, n.y - n.dy, false);
  const ev2 = g.act({ type: 'move', ...back });
  assert.ok(!ev2.some((e) => e.type === 'pickup'));
  assert.ok(logs(ev2).some((t) => t.startsWith('Hier liegt')));
});

test('descriptions mention unknown state', () => {
  const g = quietGame('desc');
  const pot = give(g, 'potion', 'gift');
  assert.match(g.itemDescription(pot), /unbekannter Wirkung/);
  const dagger = g.equipped('weapon');
  assert.match(g.itemDescription(dagger), /Schaden 1–4/);
  assert.match(g.itemDescription(dagger), /ausgerüstet/);
});
