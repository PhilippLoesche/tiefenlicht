import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quietGame, adjacentMonster, logs } from './helpers.js';
import { MONSTERS } from '../js/engine/data.js';

test('bump attack kills a weak monster, grants xp and counts the kill', () => {
  const g = quietGame('combat-kill');
  const { m, dx, dy } = adjacentMonster(g, 'ratte', 'asleep'); // sleeping targets are always hit
  m.hp = 1;
  const ev = g.act({ type: 'move', dx, dy });
  const atk = ev.find((e) => e.type === 'attack');
  assert.ok(atk && atk.attacker === 0 && atk.target === m.uid);
  assert.equal(atk.killed, true);
  assert.ok(ev.some((e) => e.type === 'die' && e.uid === m.uid));
  assert.ok(logs(ev).includes('Du tötest die Stollenratte.'));
  assert.equal(g.state.level.monsters.length, 0);
  assert.equal(g.state.stats.kills.ratte, 1);
  assert.equal(g.state.player.xp, MONSTERS.ratte.xp);
});

test('monsters attack the player; damage is reduced by armor and never negative', () => {
  const g = quietGame('combat-hit');
  const { m } = adjacentMonster(g, 'troll', 'hunt');
  m.hp = 9999; m.maxHp = 9999;
  const p = g.state.player;
  p.maxHp = 10000; p.hp = 10000;
  let hits = 0, misses = 0, dmg = 0;
  for (let i = 0; i < 200; i++) {
    for (const e of g.act({ type: 'wait' })) {
      if (e.type !== 'attack' || e.target !== 0) continue;
      if (e.result === 'miss') misses++; else { hits++; dmg += e.damage; assert.ok(e.damage >= 0); }
    }
  }
  assert.ok(hits > 50 && misses > 5, `hits ${hits} misses ${misses}`);
  const avg = dmg / hits;
  assert.ok(avg > 3 && avg < 15, `avg ${avg}`);
});

test('player death sets status, cause and run summary', () => {
  const g = quietGame('combat-death');
  const { m } = adjacentMonster(g, 'tiefenwurm', 'hunt');
  m.hp = 9999; m.maxHp = 9999;
  g.state.player.hp = 1;
  let ev = [];
  for (let i = 0; i < 50 && g.state.status === 'playing'; i++) ev = g.act({ type: 'wait' });
  assert.equal(g.state.status, 'dead');
  assert.ok(ev.some((e) => e.type === 'death'));
  const s = g.runSummary();
  assert.equal(s.cause, 'Von einem Tiefenwurm getötet');
  assert.equal(s.causeText, 'Von einem Tiefenwurm getötet auf Ebene 1.');
  assert.ok(s.score > 0);
  const after = g.act({ type: 'wait' });
  assert.equal(after[0].text, 'Das Spiel ist vorbei.');
});

test('slimes split when damaged', () => {
  const g = quietGame('slime');
  const { m, dx, dy } = adjacentMonster(g, 'schleim', 'hunt');
  m.hp = 40; m.maxHp = 40;
  for (let i = 0; i < 10 && g.state.level.monsters.length < 2; i++) g.act({ type: 'move', dx, dy });
  assert.ok(g.state.level.monsters.length >= 2);
  assert.ok(g.state.level.monsters.every((s) => s.id === 'schleim'));
});

test('steinwaechter stays dormant until adjacent', () => {
  const g = quietGame('statue');
  const p = g.state.player;
  const spot = g.randomWalkable((x, y) => Math.max(Math.abs(x - p.x), Math.abs(y - p.y)) === 3 && g.los[g.idx(x, y)]);
  assert.ok(spot);
  const m = g.spawnMonster('steinwaechter', spot.x, spot.y, 'dormant');
  for (let i = 0; i < 20; i++) g.act({ type: 'wait' });
  assert.equal(m.ai, 'dormant');
  assert.equal(m.x, spot.x);
});

test('glimmerdieb steals gold and drops it when killed', () => {
  const g = quietGame('thief');
  const p = g.state.player;
  p.gold = 200;
  const { m, dx, dy } = adjacentMonster(g, 'glimmerdieb', 'hunt');
  for (let i = 0; i < 40 && !m.stolen; i++) g.act({ type: 'wait' });
  assert.ok(m.stolen > 0, 'stole');
  assert.equal(p.gold, 200 - m.stolen);
  // kill it if still around
  if (!m.dead && Math.max(Math.abs(m.x - p.x), Math.abs(m.y - p.y)) === 1) {
    m.hp = 1;
    m.ai = 'asleep';
    g.act({ type: 'move', dx: m.x - p.x, dy: m.y - p.y });
    assert.ok(g.state.level.items.some((it) => it.cat === 'gold'));
  }
  assert.ok(dx !== undefined && dy !== undefined);
});
