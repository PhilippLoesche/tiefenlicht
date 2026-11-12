import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/engine/index.js';
import { botAction } from './bot.js';

test('serialize produces plain JSON with a version', () => {
  const g = Game.create({ seed: 'save-1' });
  const s = g.serialize();
  assert.equal(s.version, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
  assert.throws(() => Game.deserialize({ ...s, version: 999 }));
});

test('same seed + same actions = same game', () => {
  const run = () => {
    const g = Game.create({ seed: 'det' });
    const mem = {};
    const out = [];
    for (let i = 0; i < 400 && g.state.status === 'playing'; i++) out.push(JSON.stringify(g.act(botAction(g, mem))));
    return out.join('\n');
  };
  assert.equal(run(), run());
});

test('save mid-run, load, continue: identical event stream', () => {
  for (const seed of ['save-a', 'save-b', 'save-c']) {
    const g = Game.create({ seed });
    const mem = {};
    for (let i = 0; i < 300 && g.state.status === 'playing'; i++) g.act(botAction(g, mem));
    const snap = JSON.stringify(g.serialize());
    const h = Game.deserialize(JSON.parse(snap));
    assert.deepEqual(h.state, g.state);
    const mem2 = structuredClone({ ...mem, ignore: [...(mem.ignore ?? [])] });
    mem2.ignore = new Set(mem2.ignore);
    for (let i = 0; i < 300 && g.state.status === 'playing'; i++) {
      const a1 = botAction(g, mem);
      const a2 = botAction(h, mem2);
      assert.deepEqual(a1, a2);
      assert.deepEqual(h.act(a2), g.act(a1));
    }
    assert.deepEqual(h.serialize(), g.serialize());
  }
});

test('the same level layout for the same seed and depth', () => {
  const a = Game.create({ seed: 'layout' }), b = Game.create({ seed: 'layout' });
  assert.deepEqual(a.state.level.tiles, b.state.level.tiles);
  const c = Game.create({ seed: 'layout-2' });
  assert.notDeepEqual(a.state.level.tiles, c.state.level.tiles);
});
