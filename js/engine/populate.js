// Fill a freshly generated level with monsters, items, gold and traps.

import { MONSTERS } from './data.js';
import { makeItem, makeMonster, randomItem } from './entities.js';
import { bfs, isPassableOrDoor } from './path.js';

function monsterPool(depth) {
  return Object.entries(MONSTERS)
    .filter(([, d]) => !d.boss && d.depth[0] <= depth && d.depth[1] >= depth)
    .map(([id, d]) => {
      // newcomers (first floor of their range) and leftovers (last floor) are rarer
      let w = d.weight;
      if (depth === d.depth[0] && d.depth[0] > 1) w *= 0.5;
      if (depth === d.depth[1] && d.depth[1] < 10) w *= 0.7;
      return [id, w];
    });
}

/** Choose a monster id for the depth (used for wandering spawns too). */
export function randomMonsterId(rng, depth) {
  return rng.weighted(monsterPool(depth));
}

/**
 * @param {object} st game state (uids, ident)
 * @param {object} level level object being built (tiles, width, height...)
 * @param {import('./rng.js').Rng} rng
 */
export function populateLevel(st, level, rng) {
  const { width: W, height: H, tiles, depth } = level;
  const start = level.start;
  const distFromStart = bfs(W, H, tiles, start.x, start.y, (i) => isPassableOrDoor(tiles[i]));
  const used = new Set([start.y * W + start.x]);
  if (level.stairs) used.add(level.stairs.y * W + level.stairs.x);

  const freeTiles = (minDist = 0, filter = () => true) => {
    const out = [];
    for (let i = 0; i < W * H; i++) {
      if ((tiles[i] !== 'floor' && tiles[i] !== 'fungus') || used.has(i)) continue;
      if (distFromStart[i] < minDist) continue;
      if (filter(i)) out.push(i);
    }
    return out;
  };
  const takeTile = (cands) => {
    if (!cands.length) return -1;
    const i = rng.pick(cands);
    used.add(i);
    return i;
  };
  const near = (i, r) => {
    const x = i % W, y = (i - x) / W;
    const out = [];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue;
      const j = ny * W + nx;
      if ((tiles[j] === 'floor' || tiles[j] === 'fungus') && !used.has(j) && distFromStart[j] >= 0) out.push(j);
    }
    return out;
  };
  const addMonster = (id, i, ai) => {
    const m = makeMonster(st, rng, id, i % W, Math.floor(i / W), ai);
    level.monsters.push(m);
    return m;
  };

  // ---- monsters
  if (level.biome === 'herz') {
    const a = level.arena;
    let bi = a.y * W + a.x;
    if (used.has(bi) || tiles[bi] !== 'floor') bi = takeTile(near(bi, 2));
    used.add(bi);
    addMonster('lichtfresser', bi, 'dormant');
    const guards = ['aschepriester', 'steinwaechter', 'kristallschrecke', 'tiefenwurm', 'aschepriester'];
    for (const ch of level.chambers) {
      const i = takeTile(near(ch.y * W + ch.x, 2));
      if (i >= 0) addMonster(rng.pick(guards), i);
    }
    for (let k = 0; k < 3; k++) {
      const i = takeTile(freeTiles(14));
      if (i >= 0) addMonster(rng.pick(guards), i);
    }
  } else {
    let budget = 6 + Math.floor(depth * 1.4) + rng.int(0, 3);
    while (budget > 0) {
      const id = randomMonsterId(rng, depth);
      const d = MONSTERS[id];
      const i = takeTile(freeTiles(8));
      if (i < 0) break;
      const leader = addMonster(id, i);
      budget--;
      if (d.group && (d.pack || rng.chance(0.6))) {
        const extra = rng.int(d.group[0], d.group[1]) - 1;
        for (let k = 0; k < extra; k++) {
          const j = takeTile(near(i, 2));
          if (j < 0) break;
          addMonster(id, j, leader.ai);
          budget -= 0.5;
        }
      }
    }
  }

  // ---- items
  const itemCount = level.biome === 'herz' ? 2 : rng.int(4, 7);
  for (let k = 0; k < itemCount; k++) {
    const i = takeTile(freeTiles(2));
    if (i < 0) break;
    placeItem(level, randomItem(st, rng, depth), i);
  }
  const oil = level.biome === 'herz' ? 2 : (rng.chance(0.75) ? 1 : 0) + (rng.chance(0.2) ? 1 : 0);
  for (let k = 0; k < oil; k++) {
    const i = takeTile(freeTiles(level.biome === 'herz' ? 0 : 4));
    if (i >= 0) placeItem(level, makeItem(st, 'oil', 'oelflasche'), i);
  }
  if (level.biome === 'herz') {
    const i = takeTile(near(start.y * W + start.x, 3));
    if (i >= 0) placeItem(level, makeItem(st, 'potion', 'heilung'), i);
  }
  const piles = level.biome === 'herz' ? 2 : rng.int(2, 4);
  for (let k = 0; k < piles; k++) {
    const i = takeTile(freeTiles(2));
    if (i < 0) break;
    placeItem(level, makeItem(st, 'gold', 'gold', { count: rng.int(4, 12) + depth * rng.int(2, 6) }), i);
  }

  // ---- traps (hidden)
  if (level.biome !== 'herz') {
    const n = rng.int(1, 2 + Math.floor(depth / 2));
    const kinds = { trap_dart: 4, trap_teleport: 2, trap_alarm: 2, trap_pit: depth >= 9 ? 0 : 2 };
    for (let k = 0; k < n; k++) {
      const i = takeTile(freeTiles(5));
      if (i < 0) break;
      level.traps.push({ x: i % W, y: Math.floor(i / W), kind: rng.weighted(kinds), hidden: true });
    }
  }
}

function placeItem(level, item, i) {
  item.x = i % level.width;
  item.y = Math.floor(i / level.width);
  level.items.push(item);
}
