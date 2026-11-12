import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/engine/index.js';
import { quietGame, logs, freeNeighbor } from './helpers.js';
import { makeItem } from '../js/engine/entities.js';

test('lamp burns oil, radius shrinks with oil, empty lamp brings cold', () => {
  const g = quietGame('lamp');
  const p = g.state.player;
  const oil0 = p.oil;
  for (let i = 0; i < 10; i++) g.act({ type: 'wait' });
  assert.equal(p.oil, oil0 - 10);
  assert.equal(g.lightRadius(), 7);
  p.oil = 200; assert.equal(g.lightRadius(), 5);
  p.oil = 80; assert.equal(g.lightRadius(), 3);
  p.oil = 3;
  const ev = [];
  for (let i = 0; i < 4; i++) ev.push(...g.act({ type: 'wait' }));
  assert.ok(logs(ev).some((t) => t.includes('Deine Lampe erlischt')));
  assert.ok(ev.some((e) => e.type === 'interrupt' && e.reason === 'lamp_out'));
  assert.equal(g.lightRadius(), 1);
  const hp = p.hp;
  for (let i = 0; i < 12; i++) g.act({ type: 'wait' });
  assert.ok(p.hp < hp, 'cold damage');
  const rest = g.act({ type: 'rest' });
  assert.equal(g.lastActionTookTurn, false);
  assert.ok(logs(rest)[0].includes('Ohne Licht'));
});

test('visibility requires light; lit braziers are visible from afar; light is 0..1', () => {
  for (let s = 0; s < 40; s++) {
    const g = Game.create({ seed: `brazier-${s}` });
    const lv = g.state.level;
    const bi = lv.tiles.indexOf('brazier_lit');
    if (bi < 0) continue;
    const bx = bi % lv.width, by = Math.floor(bi / lv.width);
    g.state.level.monsters = [];
    // find a floor tile far from the brazier with line of sight to it
    const p = g.state.player;
    for (let i = 0; i < lv.tiles.length; i++) {
      if (lv.tiles[i] !== 'floor') continue;
      const x = i % lv.width, y = Math.floor(i / lv.width);
      if (Math.hypot(x - bx, y - by) < 9) continue;
      p.x = x; p.y = y;
      g.updateVision();
      if (g.los[bi]) break;
    }
    if (!g.los[bi]) continue;
    assert.equal(lv.visible[bi], 1, 'lit brazier visible at distance');
    for (let i = 0; i < lv.tiles.length; i++) {
      assert.ok(lv.light[i] >= 0 && lv.light[i] <= 1);
      if (lv.visible[i]) assert.ok(g.los[i]);
      else assert.equal(lv.light[i], 0);
    }
    // a tile in LOS but neither near the lamp nor any light source is not visible
    let darkInLos = 0;
    for (let i = 0; i < lv.tiles.length; i++) if (g.los[i] && !lv.visible[i]) darkInLos++;
    assert.ok(darkInLos >= 0);
    return;
  }
  assert.fail('no level with visible brazier found');
});

test('bumping a lit brazier refills the lamp once', () => {
  for (let s = 0; s < 40; s++) {
    const g = Game.create({ seed: `refill-${s}` });
    const lv = g.state.level;
    const bi = lv.tiles.indexOf('brazier_lit');
    if (bi < 0) continue;
    g.state.level.monsters = [];
    const bx = bi % lv.width, by = Math.floor(bi / lv.width);
    const p = g.state.player;
    const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => lv.tiles[g.idx(bx + dx, by + dy)] === 'floor');
    p.x = bx + n[0]; p.y = by + n[1];
    g.state.level.traps = [];
    p.oil = 50;
    g.updateVision();
    const ev = g.act({ type: 'move', dx: -n[0], dy: -n[1] });
    assert.ok(p.oil >= p.oilMax - 1, 'refilled (minus one turn of burning)');
    assert.equal(lv.tiles[bi], 'brazier_out');
    assert.ok(ev.some((e) => e.type === 'oil' && e.reason === 'brazier'));
    const ev2 = g.act({ type: 'move', dx: -n[0], dy: -n[1] });
    assert.equal(g.lastActionTookTurn, false);
    assert.ok(logs(ev2)[0].includes('erloschen'));
    return;
  }
  assert.fail('no brazier found');
});

test('statuses expire with events', () => {
  const g = quietGame('status');
  const p = g.state.player;
  g.addStatus(p, 'haste', 3);
  assert.equal(g.playerSpeed(), 20);
  const ev = [];
  for (let i = 0; i < 6; i++) ev.push(...g.act({ type: 'wait' }));
  assert.ok(ev.some((e) => e.type === 'status' && e.status === 'haste' && e.change === 'expired'));
  assert.equal(g.playerSpeed(), 10);
  assert.ok(g.playerStats().statuses.length === 0);
});

test('hasted player acts twice per monster turn', () => {
  const g = quietGame('haste');
  const t0 = g.state.turn;
  g.addStatus(g.state.player, 'haste', 50);
  for (let i = 0; i < 10; i++) g.act({ type: 'wait' });
  assert.equal(g.state.turn - t0, 5);
});

test('descending creates the next level with biome and arrival text', () => {
  const g = quietGame('descend');
  const p = g.state.player;
  const lv = g.state.level;
  p.x = lv.stairs.x; p.y = lv.stairs.y;
  let ev = g.act({ type: 'descend' });
  assert.ok(ev.some((e) => e.type === 'descend' && e.depth === 2 && e.biome === 'stollen'));
  assert.equal(g.state.depth, 2);
  for (const d of [3, 4]) {
    g.state.level.monsters = [];
    p.x = g.state.level.stairs.x; p.y = g.state.level.stairs.y;
    ev = g.act({ type: 'descend' });
    assert.equal(g.state.depth, d);
  }
  assert.equal(g.state.level.biome, 'pilzgrotte');
  assert.ok(logs(ev).some((t) => t.includes('Pilzgrotten')));
  const bad = g.act({ type: 'descend' });
  assert.equal(g.lastActionTookTurn, false);
  assert.ok(logs(bad)[0].includes('kein Weg hinab'));
});

test('invalid actions consume no turn and explain', () => {
  const g = quietGame('invalid');
  const t = g.state.turn;
  for (const a of [{ type: 'nope' }, { type: 'move', dx: 0, dy: 0 }, { type: 'use', itemUid: 9999 }, { type: 'pickup' }, { type: 'unequip', slot: 'ring1' }]) {
    const ev = g.act(a);
    assert.equal(g.lastActionTookTurn, false, JSON.stringify(a));
    assert.ok(ev.some((e) => e.type === 'log' && e.tone === 'warn'), JSON.stringify(a));
  }
  assert.equal(g.state.turn, t);
});

test('traps: hidden until triggered; pit drops you a level', () => {
  const g = quietGame('trap');
  const n = freeNeighbor(g);
  g.state.level.traps.push({ x: n.x, y: n.y, kind: 'trap_pit', hidden: true });
  const ev = g.act({ type: 'move', dx: n.dx, dy: n.dy });
  assert.ok(ev.some((e) => e.type === 'trap' && e.kind === 'trap_pit'));
  assert.equal(g.state.depth, 2);
  assert.ok(ev.some((e) => e.type === 'descend' && e.via === 'pit'));
});

test('rest heals until full and stops when interrupted', () => {
  const g = quietGame('rest');
  const p = g.state.player;
  p.hp = 5;
  const ev = g.act({ type: 'rest' });
  assert.ok(g.lastActionTookTurn);
  assert.equal(p.hp, p.maxHp);
  assert.ok(ev.some((e) => e.type === 'rested'));
  const again = g.act({ type: 'rest' });
  assert.equal(g.lastActionTookTurn, false);
  assert.ok(logs(again)[0].includes('ausgeruht'));
});

test('auto-explore and travel', () => {
  const g = quietGame('explore');
  let steps = 0;
  for (; steps < 3000; steps++) {
    g.state.level.monsters = [];
    const ev = g.act({ type: 'explore' });
    if (ev.some((e) => e.type === 'interrupt' && e.reason === 'explore_done')) break;
    if (!g.lastActionTookTurn && !ev.some((e) => e.type === 'interrupt')) assert.fail('explore stalled: ' + JSON.stringify(ev));
    if (g.state.status !== 'playing' || g.state.depth !== 1) return;
  }
  const lv = g.state.level;
  assert.ok(lv.explored[lv.stairs.y * lv.width + lv.stairs.x], 'stairs found');
  const r = g.autoExplore();
  assert.equal(r.ok, false);
  const path = g.findPath(lv.stairs.x, lv.stairs.y);
  assert.ok(path && path.length > 0);
  for (let i = 0; i < 500; i++) {
    const ev = g.act({ type: 'travel', x: lv.stairs.x, y: lv.stairs.y });
    if (ev.some((e) => e.type === 'interrupt' && e.reason === 'arrived')) break;
  }
  assert.deepEqual([g.state.player.x, g.state.player.y], [lv.stairs.x, lv.stairs.y]);
  assert.match(g.describeTile(lv.stairs.x, lv.stairs.y), /Abstieg/);
});

test('new monster in view interrupts with an event', () => {
  const g = quietGame('interrupt');
  const p = g.state.player;
  const spot = g.randomWalkable((x, y) => g.isVisible(x, y) && Math.max(Math.abs(x - p.x), Math.abs(y - p.y)) >= 2);
  g.spawnMonster('ratte', spot.x, spot.y, 'asleep');
  const ev = g.act({ type: 'wait' });
  assert.ok(ev.some((e) => e.type === 'interrupt' && e.reason === 'monster_appeared'));
  const ev2 = g.act({ type: 'wait' });
  assert.ok(!ev2.some((e) => e.type === 'interrupt' && e.reason === 'monster_appeared'));
  assert.equal(g.autoExplore().ok, false);
  assert.equal(g.targetsInView()[0].id, 'ratte');
  assert.match(g.describeTile(spot.x, spot.y), /^Eine Stollenratte – unverletzt, schläft\./);
});

test('boss level: killing the Lichtfresser drops the shard, picking it up wins', () => {
  const g = quietGame('boss');
  g.enterLevel(10, 'stairs');
  const lv = g.state.level;
  assert.equal(lv.biome, 'herz');
  assert.equal(lv.stairs, null);
  const boss = lv.monsters.find((m) => m.id === 'lichtfresser');
  assert.ok(boss);
  g.damageMonster(boss, 9999, { byPlayer: true });
  const shard = lv.items.find((it) => it.kind === 'sonnenscherbe');
  assert.ok(shard);
  lv.monsters = [];
  const p = g.state.player;
  p.x = shard.x; p.y = shard.y;
  const ev = g.act({ type: 'pickup' });
  assert.equal(g.state.status, 'won');
  assert.ok(ev.some((e) => e.type === 'victory'));
  assert.equal(g.runSummary().won, true);
});

test('query helpers return German data', () => {
  const g = quietGame('queries');
  const s = g.playerStats();
  assert.equal(s.hp, s.maxHp);
  assert.equal(s.lightRadius, 7);
  assert.equal(s.oilPct, 100);
  assert.equal(s.weapon, 'Dolch +0');
  const inv = g.inventoryView();
  assert.ok(inv.some((r) => r.name === '3 Wurfmesser' && r.needsTarget === 'tile'));
  assert.ok(inv.some((r) => r.name === 'Trank der Heilung'));
  assert.equal(g.describeTile(g.state.player.x, g.state.player.y).startsWith('Das bist du.'), true);
  assert.equal(g.describeTile(0, 0), 'Unerforschte Dunkelheit.');
  const p = g.state.player;
  const sword = makeItem(g.state, 'weapon', 'kurzschwert');
  g.dropItemAt(sword, p.x, p.y, false);
  g.updateVision();
  assert.match(g.describeTile(p.x, p.y), /Hier liegt ein Kurzschwert\./);
});
