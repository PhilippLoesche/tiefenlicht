import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, MONSTERS } from '../js/engine/index.js';
import { Rng } from '../js/engine/rng.js';
import { generateLevel } from '../js/engine/mapgen.js';
import { bfs, isPassableOrDoor, isWalkable } from '../js/engine/path.js';
import { checkInvariants } from './helpers.js';

const SEEDS = Number(process.env.GEN_SEEDS ?? 40);

test(`generated levels: ${SEEDS} seeds x 10 depths are connected and sane`, () => {
  for (let s = 0; s < SEEDS; s++) {
    const g = Game.create({ seed: `gen-${s}` });
    for (let depth = 1; depth <= 10; depth++) {
      if (depth > 1) g.enterLevel(depth, 'stairs');
      const lv = g.state.level;
      const W = lv.width, H = lv.height;
      const where = `seed gen-${s} depth ${depth} (${lv.biome})`;
      assert.equal(lv.tiles.length, W * H);
      for (let x = 0; x < W; x++) assert.ok(lv.tiles[x] === 'wall' && lv.tiles[(H - 1) * W + x] === 'wall', `border ${where}`);
      const start = lv.start;
      const dist = bfs(W, H, lv.tiles, start.x, start.y, (i) => isPassableOrDoor(lv.tiles[i]));
      // every walkable tile is reachable
      for (let i = 0; i < W * H; i++) if (isPassableOrDoor(lv.tiles[i])) assert.ok(dist[i] >= 0, `unreachable tile ${i % W},${Math.floor(i / W)} in ${where}`);
      if (depth < 10) {
        assert.ok(lv.stairs, `stairs ${where}`);
        const sd = dist[lv.stairs.y * W + lv.stairs.x];
        assert.ok(sd >= 15, `stairs too close (${sd}) in ${where}`);
      } else {
        assert.equal(lv.biome, 'herz');
        assert.ok(lv.monsters.some((m) => m.id === 'lichtfresser'), `boss ${where}`);
      }
      for (const it of lv.items) {
        assert.ok(isWalkable(lv.tiles[it.y * W + it.x]), `item in wall ${where}`);
        assert.ok(dist[it.y * W + it.x] >= 0, `item unreachable ${where}`);
      }
      for (const m of lv.monsters) {
        assert.ok(isWalkable(lv.tiles[m.y * W + m.x]), `monster in wall ${where}`);
        assert.ok(MONSTERS[m.id].depth[0] <= depth && MONSTERS[m.id].depth[1] >= depth, `${m.id} out of depth ${where}`);
      }
      for (const t of lv.traps) {
        assert.ok(lv.tiles[t.y * W + t.x] === 'floor' || lv.tiles[t.y * W + t.x] === 'fungus', `trap tile ${where}`);
        if (depth >= 9) assert.notEqual(t.kind, 'trap_pit', `pit on depth ${depth}`);
      }
      if (lv.biome === 'pilzgrotte') assert.ok(lv.tiles.includes('fungus'), `fungus ${where}`);
      if (lv.biome === 'hallen') assert.ok(lv.tiles.some((t) => t.startsWith('door')), `doors ${where}`);
      g.state.player.x = start.x; g.state.player.y = start.y;
      checkInvariants(g);
    }
  }
});

test('biomes differ in structure', () => {
  const stats = (depth) => {
    const lv = generateLevel(depth, Rng.fromSeed(`bio-${depth}`));
    const floor = lv.tiles.filter((t) => t !== 'wall').length;
    return { floor, fungus: lv.tiles.filter((t) => t === 'fungus').length, doors: lv.tiles.filter((t) => t.startsWith('door')).length };
  };
  const st = stats(1), cave = stats(5), hall = stats(8);
  assert.equal(st.fungus, 0);
  assert.ok(cave.fungus > 10);
  assert.ok(hall.floor > st.floor, 'halls are bigger than tunnels');
  assert.ok(hall.doors >= 4);
});
