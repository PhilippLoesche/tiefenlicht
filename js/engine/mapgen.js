// Level generators, one per biome. Pure functions of (depth, rng).
//
// Output: { biome, width, height, tiles: string[], start:{x,y}, stairs:{x,y}|null,
//           arena?: {x,y}, chambers?: {x,y}[] }

import { MAP_W as W, MAP_H as H, biomeFor } from './data.js';
import { bfs, isWalkable, isPassableOrDoor, DIRS } from './path.js';

const idx = (x, y) => y * W + x;
const inside = (x, y) => x > 0 && y > 0 && x < W - 1 && y < H - 1;

function fill(t) {
  return new Array(W * H).fill(t);
}

function carveRect(t, x, y, w, h, tile = 'floor') {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (inside(xx, yy)) t[idx(xx, yy)] = tile;
}

function passable(t) {
  return (i) => isPassableOrDoor(t[i]);
}

// ------------------------------------------------------------------ stollen
function genStollen(rng) {
  const t = fill('wall');
  const rooms = [];
  const target = rng.int(8, 12);
  for (let i = 0; i < 400 && rooms.length < target; i++) {
    const w = rng.int(4, 11), h = rng.int(3, 7);
    const x = rng.int(2, W - w - 2), y = rng.int(2, H - h - 2);
    if (rooms.some((r) => x - 2 < r.x + r.w && x + w + 2 > r.x && y - 2 < r.y + r.h && y + h + 2 > r.y)) continue;
    rooms.push({ x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) });
  }
  if (rooms.length < 6) return null;
  for (const r of rooms) carveRect(t, r.x, r.y, r.w, r.h);

  // minimum spanning tree over room centres, plus a few loops
  const d2 = (a, b) => (a.cx - b.cx) ** 2 + (a.cy - b.cy) ** 2;
  const inTree = [0];
  const rest = rooms.map((_, i) => i).slice(1);
  const edges = [];
  while (rest.length) {
    let best = null;
    for (const a of inTree) for (const b of rest) {
      const d = d2(rooms[a], rooms[b]);
      if (!best || d < best[2]) best = [a, b, d];
    }
    edges.push([best[0], best[1]]);
    inTree.push(best[1]);
    rest.splice(rest.indexOf(best[1]), 1);
  }
  const loops = rng.int(2, 4);
  for (let k = 0; k < loops; k++) {
    const a = rng.int(0, rooms.length - 1);
    const cands = rooms.map((r, i) => i).filter((i) => i !== a && !edges.some(([p, q]) => (p === a && q === i) || (p === i && q === a)));
    if (!cands.length) continue;
    cands.sort((i, j) => d2(rooms[a], rooms[i]) - d2(rooms[a], rooms[j]));
    edges.push([a, cands[Math.min(cands.length - 1, rng.int(0, 1))]]);
  }
  for (const [a, b] of edges) corridor(t, rooms[a], rooms[b], rng);

  // short dead-end side tunnels (old exploratory shafts)
  const shafts = rng.int(1, 3);
  for (let k = 0; k < shafts; k++) {
    const r = rng.pick(rooms);
    const [dx, dy] = rng.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
    let x = dx > 0 ? r.x + r.w : dx < 0 ? r.x - 1 : rng.int(r.x, r.x + r.w - 1);
    let y = dy > 0 ? r.y + r.h : dy < 0 ? r.y - 1 : rng.int(r.y, r.y + r.h - 1);
    const len = rng.int(3, 7);
    for (let s = 0; s < len && inside(x, y) && x > 1 && y > 1 && x < W - 2 && y < H - 2; s++) {
      t[idx(x, y)] = 'floor';
      x += dx; y += dy;
    }
  }
  placeDoors(t, rooms, rng, 0.3, 0.25);
  return { tiles: t, rooms };
}

function corridor(t, a, b, rng) {
  let x = rng.int(a.x, a.x + a.w - 1), y = rng.int(a.y, a.y + a.h - 1);
  const tx = rng.int(b.x, b.x + b.w - 1), ty = rng.int(b.y, b.y + b.h - 1);
  const horizFirst = rng.chance(0.5);
  const stepX = () => { while (x !== tx) { x += Math.sign(tx - x); t[idx(x, y)] = 'floor'; } };
  const stepY = () => { while (y !== ty) { y += Math.sign(ty - y); t[idx(x, y)] = 'floor'; } };
  if (horizFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
}

/** Put doors on room entrances where the opening is exactly one tile wide. */
function placeDoors(t, rooms, rng, pClosed, pOpen) {
  const isWall = (x, y) => t[idx(x, y)] === 'wall';
  const isFloor = (x, y) => t[idx(x, y)] === 'floor';
  for (const r of rooms) {
    const cands = [];
    for (let x = r.x; x < r.x + r.w; x++) {
      cands.push([x, r.y - 1, 0, -1], [x, r.y + r.h, 0, 1]);
    }
    for (let y = r.y; y < r.y + r.h; y++) {
      cands.push([r.x - 1, y, -1, 0], [r.x + r.w, y, 1, 0]);
    }
    for (const [x, y, ox, oy] of cands) {
      if (!inside(x, y) || !isFloor(x, y)) continue;
      // walls on both sides along the wall line, floor inside and outside
      const sideA = ox === 0 ? isWall(x - 1, y) && isWall(x + 1, y) : isWall(x, y - 1) && isWall(x, y + 1);
      if (!sideA) continue;
      if (!isFloor(x + ox, y + oy) || !isFloor(x - ox, y - oy)) continue;
      const roll = rng.next();
      if (roll < pClosed) t[idx(x, y)] = 'door_closed';
      else if (roll < pClosed + pOpen) t[idx(x, y)] = 'door_open';
    }
  }
}

// ------------------------------------------------------------------ pilzgrotte
function genCaves(rng) {
  let t = new Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    t[idx(x, y)] = !inside(x, y) || rng.chance(0.45) ? 'wall' : 'floor';
  }
  const wallAt = (g, x, y) => (x < 0 || y < 0 || x >= W || y >= H ? true : g[idx(x, y)] === 'wall');
  for (let iter = 0; iter < 5; iter++) {
    const n = t.slice();
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      let c1 = 0, c2 = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (!wallAt(t, x + dx, y + dy)) continue;
        if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) c1++;
        c2++;
      }
      n[idx(x, y)] = c1 >= 5 || (iter < 3 && c2 <= 2) ? 'wall' : 'floor';
    }
    t = n;
  }
  // keep the largest region
  const region = new Int32Array(W * H).fill(-1);
  let best = -1, bestSize = 0, rid = 0;
  for (let i = 0; i < W * H; i++) {
    if (t[i] !== 'floor' || region[i] !== -1) continue;
    const x = i % W, y = (i - x) / W;
    const d = bfs(W, H, t, x, y, (j) => t[j] === 'floor' && region[j] === -1);
    let size = 0;
    for (let j = 0; j < W * H; j++) if (d[j] >= 0) { region[j] = rid; size++; }
    if (size > bestSize) { bestSize = size; best = rid; }
    rid++;
  }
  if (bestSize < W * H * 0.33) return null;
  for (let i = 0; i < W * H; i++) if (t[i] === 'floor' && region[i] !== best) t[i] = 'wall';

  // glowing fungus clusters
  const floors = [];
  for (let i = 0; i < W * H; i++) if (t[i] === 'floor') floors.push(i);
  const clusters = rng.int(10, 16);
  for (let c = 0; c < clusters; c++) {
    const ci = rng.pick(floors);
    const cx = ci % W, cy = (ci - cx) / W;
    const r = rng.int(1, 2);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx, y = cy + dy;
      if (!inside(x, y) || t[idx(x, y)] !== 'floor') continue;
      if (dx * dx + dy * dy <= r * r + 1 && rng.chance(0.55)) t[idx(x, y)] = 'fungus';
    }
  }
  return { tiles: t };
}

// ------------------------------------------------------------------ hallen
function genHallen(rng) {
  const t = fill('wall');
  carveRect(t, 1, 1, W - 2, H - 2);
  const leaves = [];
  const MINW = 7, MINH = 6;
  const split = (x, y, w, h, depth) => {
    const canV = w >= MINW * 2 + 1, canH = h >= MINH * 2 + 1;
    const big = w > 20 || h > 15;
    if ((!canV && !canH) || (!big && depth > 1 && rng.chance(0.35))) { leaves.push({ x, y, w, h }); return; }
    const vertical = canV && (!canH || w / h > 1.2 || (w / h > 0.8 && rng.chance(0.5)));
    if (vertical) {
      const sx = rng.int(x + MINW, x + w - MINW - 1);
      for (let yy = y; yy < y + h; yy++) t[idx(sx, yy)] = 'wall';
      split(x, y, sx - x, h, depth + 1);
      split(sx + 1, y, x + w - sx - 1, h, depth + 1);
      const ys = [];
      for (let yy = y; yy < y + h; yy++) if (t[idx(sx - 1, yy)] === 'floor' && t[idx(sx + 1, yy)] === 'floor') ys.push(yy);
      if (ys.length) t[idx(sx, rng.pick(ys))] = rng.chance(0.85) ? 'door_closed' : 'door_open';
    } else {
      const sy = rng.int(y + MINH, y + h - MINH - 1);
      for (let xx = x; xx < x + w; xx++) t[idx(xx, sy)] = 'wall';
      split(x, y, w, sy - y, depth + 1);
      split(x, sy + 1, w, y + h - sy - 1, depth + 1);
      const xs = [];
      for (let xx = x; xx < x + w; xx++) if (t[idx(xx, sy - 1)] === 'floor' && t[idx(xx, sy + 1)] === 'floor') xs.push(xx);
      if (xs.length) t[idx(rng.pick(xs), sy)] = rng.chance(0.85) ? 'door_closed' : 'door_open';
    }
  };
  split(1, 1, W - 2, H - 2, 0);

  // extra doors for loops
  const extra = rng.int(3, 6);
  for (let k = 0, tries = 0; k < extra && tries < 500; tries++) {
    const x = rng.int(2, W - 3), y = rng.int(2, H - 3);
    if (t[idx(x, y)] !== 'wall') continue;
    const fl = (a, b) => t[idx(a, b)] === 'floor';
    const wl = (a, b) => t[idx(a, b)] === 'wall';
    const horiz = fl(x - 1, y) && fl(x + 1, y) && wl(x, y - 1) && wl(x, y + 1);
    const vert = fl(x, y - 1) && fl(x, y + 1) && wl(x - 1, y) && wl(x + 1, y);
    if (!horiz && !vert) continue;
    t[idx(x, y)] = rng.chance(0.7) ? 'door_closed' : 'door_open';
    k++;
  }

  // pillars in large halls (inset 2 from the walls, spacing 3)
  for (const L of leaves) {
    if (L.w < 8 || L.h < 7 || rng.chance(0.25)) continue;
    const stride = rng.chance(0.5) ? 3 : 4;
    for (let y = L.y + 2; y <= L.y + L.h - 3; y += stride) {
      for (let x = L.x + 2; x <= L.x + L.w - 3; x += stride) t[idx(x, y)] = 'wall';
    }
  }
  return { tiles: t, rooms: leaves };
}

// ------------------------------------------------------------------ herz
function genHerz(rng) {
  const t = fill('wall');
  const cx = 40, cy = 20, rx = 14, ry = 12;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
    if (d < 1 + (rng.next() - 0.5) * 0.25) t[idx(x, y)] = 'floor';
  }
  // smoothing pass
  const s = t.slice();
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    let walls = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (t[idx(x + dx, y + dy)] === 'wall') walls++;
    s[idx(x, y)] = walls >= 5 ? 'wall' : 'floor';
  }
  for (let i = 0; i < W * H; i++) t[i] = s[i];
  // ring of pillars
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    const px = Math.round(cx + Math.cos(a) * rx * 0.55), py = Math.round(cy + Math.sin(a) * ry * 0.55);
    t[idx(px, py)] = 'wall';
  }
  // entry chamber
  const sx = 8, sy = rng.int(17, 23);
  for (let y = sy - 4; y <= sy + 4; y++) for (let x = sx - 5; x <= sx + 5; x++) {
    if (inside(x, y) && ((x - sx) / 5.5) ** 2 + ((y - sy) / 4.2) ** 2 < 1) t[idx(x, y)] = 'floor';
  }
  // winding passage into the arena
  let x = sx + 4, y = sy;
  while (x < cx - rx + 3) {
    t[idx(x, y)] = 'floor';
    if (inside(x, y + 1)) t[idx(x, y + 1)] = 'floor';
    x++;
    if (rng.chance(0.3)) y = Math.max(5, Math.min(H - 7, y + rng.int(-1, 1)));
  }
  // two side chambers north and south
  const chambers = [];
  for (const dir of [-1, 1]) {
    const chx = cx + rng.int(-6, 6), chy = dir < 0 ? 3 : H - 4;
    carveRect(t, chx - 3, chy - 1, 7, 3);
    for (let yy = chy; dir < 0 ? yy < cy : yy > cy; yy -= dir) {
      if (t[idx(chx, yy)] === 'floor' && Math.abs(yy - cy) < ry - 2) break;
      t[idx(chx, yy)] = 'floor';
    }
    chambers.push({ x: chx, y: chy });
  }
  // dead braziers around the arena, one lit in the entry chamber
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const bx = Math.round(cx + Math.cos(a) * rx * 0.8), by = Math.round(cy + Math.sin(a) * ry * 0.8);
    if (t[idx(bx, by)] === 'floor') t[idx(bx, by)] = 'brazier_out';
  }
  t[idx(sx - 3, sy - 2)] = 'brazier_lit';
  return { tiles: t, start: { x: sx, y: sy }, arena: { x: cx, y: cy }, chambers, fixedBraziers: true };
}

const GENERATORS = { stollen: genStollen, pilzgrotte: genCaves, hallen: genHallen, herz: genHerz };

// ------------------------------------------------------------------ common
function reachableCount(t, sx, sy) {
  const d = bfs(W, H, t, sx, sy, passable(t));
  let n = 0;
  for (let i = 0; i < W * H; i++) if (d[i] >= 0) n++;
  return { d, n };
}

function randomFloor(t, rng, ok = () => true) {
  const cands = [];
  for (let i = 0; i < W * H; i++) if (t[i] === 'floor' && ok(i)) cands.push(i);
  return cands.length ? rng.pick(cands) : -1;
}

/**
 * Generate a level for the given depth.
 * @param {number} depth 1..10
 * @param {import('./rng.js').Rng} rng
 */
export function generateLevel(depth, rng) {
  const biome = biomeFor(depth);
  let g = null;
  for (let attempt = 0; attempt < 50 && !g; attempt++) g = GENERATORS[biome](rng, depth);
  if (!g) throw new Error('level generation failed');
  const t = g.tiles;
  // seal the border
  for (let x = 0; x < W; x++) { t[idx(x, 0)] = 'wall'; t[idx(x, H - 1)] = 'wall'; }
  for (let y = 0; y < H; y++) { t[idx(0, y)] = 'wall'; t[idx(W - 1, y)] = 'wall'; }

  let start = g.start;
  if (!start) {
    const i = randomFloor(t, rng);
    start = { x: i % W, y: Math.floor(i / W) };
  }
  t[idx(start.x, start.y)] = 'floor';
  // anything unreachable becomes rock (keeps the map honest)
  let { d } = reachableCount(t, start.x, start.y);
  for (let i = 0; i < W * H; i++) if (d[i] < 0 && t[i] !== 'wall' && !t[i].startsWith('brazier')) t[i] = 'wall';

  let stairs = null;
  if (biome !== 'herz') {
    let max = 0;
    for (let i = 0; i < W * H; i++) if (d[i] > max && isWalkable(t[i])) max = d[i];
    const cands = [];
    for (let i = 0; i < W * H; i++) if (d[i] >= max * 0.75 && t[i] === 'floor') cands.push(i);
    const si = rng.pick(cands);
    t[si] = 'stairs_down';
    stairs = { x: si % W, y: Math.floor(si / W) };
  }

  // a lit brazier (Glutbecken) on some floors
  if (!g.fixedBraziers) {
    const chance = { stollen: 0.35, pilzgrotte: 0.35, hallen: 0.5 }[biome];
    if (rng.chance(chance)) placeBrazier(t, rng, start, stairs);
  }
  return { biome, width: W, height: H, tiles: t, start, stairs, arena: g.arena ?? null, chambers: g.chambers ?? [] };
}

function placeBrazier(t, rng, start, stairs) {
  const before = reachableCount(t, start.x, start.y).n;
  for (let tries = 0; tries < 30; tries++) {
    const i = randomFloor(t, rng, (j) => {
      const x = j % W, y = (j - x) / W;
      if (Math.abs(x - start.x) + Math.abs(y - start.y) < 4) return false;
      if (stairs && Math.abs(x - stairs.x) + Math.abs(y - stairs.y) < 3) return false;
      let open = 0, wallN = 0;
      for (const [dx, dy] of DIRS) {
        const tt = t[idx(x + dx, y + dy)];
        if (tt === 'floor' || tt === 'fungus') open++;
        if (tt.startsWith('door')) return false;
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (t[idx(x + dx, y + dy)] === 'wall') wallN++;
      return open >= 5 && wallN >= 1;
    });
    if (i < 0) return;
    t[i] = 'brazier_lit';
    if (reachableCount(t, start.x, start.y).n === before - 1) return;
    t[i] = 'floor';
  }
}
