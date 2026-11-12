import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng, seedState } from '../js/engine/rng.js';

test('same seed gives the same sequence', () => {
  const a = Rng.fromSeed('morrgrund'), b = Rng.fromSeed('morrgrund');
  for (let i = 0; i < 1000; i++) assert.equal(a.u32(), b.u32());
});

test('different seeds differ', () => {
  const a = Rng.fromSeed('a'), b = Rng.fromSeed('b');
  let same = 0;
  for (let i = 0; i < 100; i++) if (a.u32() === b.u32()) same++;
  assert.ok(same < 3);
});

test('state is a plain array and can be resumed after JSON round trip', () => {
  const a = new Rng(seedState(42));
  for (let i = 0; i < 50; i++) a.next();
  const b = new Rng(JSON.parse(JSON.stringify(a.s)));
  for (let i = 0; i < 200; i++) assert.equal(a.next(), b.next());
  for (const w of a.s) assert.ok(Number.isInteger(w) && w >= 0 && w < 2 ** 32);
});

test('int, roll and weighted stay in range', () => {
  const r = Rng.fromSeed('ranges');
  const seen = new Set();
  for (let i = 0; i < 5000; i++) {
    const v = r.int(3, 7);
    assert.ok(v >= 3 && v <= 7 && Number.isInteger(v));
    seen.add(v);
    const d = r.roll(2, 6, 1);
    assert.ok(d >= 3 && d <= 13);
    const f = r.next();
    assert.ok(f >= 0 && f < 1);
    assert.ok(['x', 'y'].includes(r.weighted({ x: 1, y: 3 })));
  }
  assert.equal(seen.size, 5);
});
