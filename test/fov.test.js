import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shadowcast } from '../js/engine/fov.js';
import { Rng } from '../js/engine/rng.js';
import { generateLevel } from '../js/engine/mapgen.js';

function losMap(W, H, opaque, ox, oy) {
  const out = new Uint8Array(W * H);
  shadowcast(ox, oy, Math.max(W, H), (x, y) => x < 0 || y < 0 || x >= W || y >= H || opaque[y * W + x], (x, y) => {
    if (x >= 0 && y >= 0 && x < W && y < H) out[y * W + x] = 1;
  });
  return out;
}

function checkSymmetry(W, H, opaque, rng, samples) {
  const floors = [];
  for (let i = 0; i < W * H; i++) if (!opaque[i]) floors.push(i);
  const cache = new Map();
  const get = (i) => {
    if (!cache.has(i)) cache.set(i, losMap(W, H, opaque, i % W, Math.floor(i / W)));
    return cache.get(i);
  };
  for (let s = 0; s < samples; s++) {
    const a = rng.pick(floors);
    const la = get(a);
    for (const b of floors) {
      if (la[b] !== 1) continue;
      assert.equal(get(b)[a], 1, `asymmetric: ${a % W},${Math.floor(a / W)} sees ${b % W},${Math.floor(b / W)} but not vice versa`);
    }
  }
}

test('shadowcasting is symmetric on random noise maps', () => {
  const rng = Rng.fromSeed('fov');
  for (let k = 0; k < 6; k++) {
    const W = 30, H = 20;
    const opaque = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) opaque[i] = rng.chance(0.25) ? 1 : 0;
    checkSymmetry(W, H, opaque, rng, 25);
  }
});

test('shadowcasting is symmetric on generated levels', () => {
  const rng = Rng.fromSeed('fov-levels');
  for (const depth of [1, 5, 8, 10]) {
    const lv = generateLevel(depth, Rng.fromSeed(`sym-${depth}`));
    const opaque = lv.tiles.map((t) => (t === 'wall' || t === 'door_closed' ? 1 : 0));
    checkSymmetry(lv.width, lv.height, opaque, rng, 15);
  }
});

test('walls block sight and open rooms are fully visible', () => {
  const W = 11, H = 11;
  const opaque = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) opaque[y * W + 5] = 1; // vertical wall
  const l = losMap(W, H, opaque, 2, 5);
  assert.equal(l[5 * W + 5], 1, 'wall itself visible');
  assert.equal(l[5 * W + 7], 0, 'tile behind wall hidden');
  for (let y = 0; y < H; y++) for (let x = 0; x < 5; x++) assert.equal(l[y * W + x], 1);
});
