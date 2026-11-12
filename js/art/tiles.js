// Tiefenlicht art — dungeon tiles per biome. Authored in a 100-unit grid.
import {
  TAU, INK, mix, dk, lt, rgba, hash32, rng, P, E, C, R, poly, blob, polyRaw, plineRaw,
  toneFill, penDraw, contactShadow, phase,
} from './core.js';
import { BIOMES, LIGHT, PAL } from './palette.js';

export const TILE_KINDS = [
  'wall', 'floor', 'door_closed', 'door_open', 'stairs_down', 'brazier_lit', 'brazier_out',
  'fungus', 'trap_dart', 'trap_teleport', 'trap_alarm', 'trap_pit',
];
/** Neighbour mask bits (set = that neighbour is a wall). */
export const MASK = { N: 1, E: 2, S: 4, W: 8 };

const VARIANTS = { wall: 4, floor: 8, fungus: 3 };
const KIND_IDX = Object.fromEntries(TILE_KINDS.map((k, i) => [k, i + 1]));
const BIOME_IDX = { stollen: 1, pilzgrotte: 2, hallen: 3, herz: 4 };

/** Animated tile kinds and their loop period in seconds. */
export const TILE_ANIM = { brazier_lit: 1.2, fungus: 3.0 };

/** Seed → visual variant index (the only seed-dependent input to drawing). */
export function tileVariant(kind, seed = 0) {
  const n = VARIANTS[kind] || 1;
  return n === 1 ? 0 : hash32(seed | 0, KIND_IDX[kind] || 0, 77) % n;
}
const q = (x) => Math.round(x * 10) / 10;

// =================================================================== floors
function pebble(ctx, x, y, s, B) {
  x = q(x); y = q(y); s = q(s);
  ctx.fillStyle = dk(B.floorDk, 0.3); ctx.fill(E(x + 0.9, y + 1.3, s, s * 0.72));
  ctx.fillStyle = B.floorHi; ctx.fill(E(x, y, s, s * 0.72));
  ctx.fillStyle = lt(B.floorHi, 0.18); ctx.fill(E(q(x - s * 0.3), q(y - s * 0.28), q(s * 0.42), q(s * 0.26)));
}
function crack(ctx, r, x, y, len, col, w = 1.3) {
  const pts = [x, y]; let a = r() * TAU;
  for (let i = 0; i < 3; i++) { a += (r() - 0.5) * 1.4; x += Math.cos(a) * len / 3; y += Math.sin(a) * len / 3; pts.push(x, y); }
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.stroke(plineRaw(pts));
}

function floorStollen(ctx, B, v, r) {
  ctx.fillStyle = B.floor; ctx.fillRect(0, 0, 100, 100);
  const patches = [0, 1, 1, 2, 1, 2, 0, 1][v];
  for (let i = 0; i < patches; i++) {
    ctx.fillStyle = mix(B.floor, B.floorDk, 0.75);
    ctx.fill(blob(r, 22 + r() * 56, 22 + r() * 56, 9 + r() * 10, 6 + r() * 7, 8, 0.4));
  }
  if (v % 3 === 1) { ctx.fillStyle = mix(B.floor, B.floorHi, 0.45); ctx.fill(blob(r, 25 + r() * 50, 25 + r() * 50, 8 + r() * 6, 5 + r() * 4, 7, 0.4)); }
  const n = [1, 2, 3, 1, 3, 2, 4, 2][v];
  for (let i = 0; i < n; i++) pebble(ctx, 12 + r() * 76, 12 + r() * 76, 1.6 + r() * 2.6, B);
  if (v === 4 || v === 7) crack(ctx, r, 25 + r() * 50, 25 + r() * 50, 22, dk(B.floorDk, 0.25));
}

function floorPilz(ctx, B, v, r) {
  ctx.fillStyle = B.floor; ctx.fillRect(0, 0, 100, 100);
  if (v === 5) { // puddle
    const x = 35 + r() * 30, y = 40 + r() * 25;
    ctx.fillStyle = '#34514e'; ctx.fill(blob(r, x, y, 16, 9, 9, 0.25));
    ctx.fillStyle = '#4c7470'; ctx.fill(E(q(x - 5), q(y - 3), 6, 1.4));
  }
  const m = [1, 2, 0, 2, 1, 1, 3, 1][v];
  for (let i = 0; i < m; i++) {
    const x = 18 + r() * 64, y = 18 + r() * 64, rx = 7 + r() * 9;
    const b = blob(r, x, y, rx, rx * 0.65, 9, 0.45);
    toneFill(ctx, b, mix(B.moss, B.floor, 0.35), mix(B.mossDk, B.floor, 0.4), -1.5, -1.5);
    ctx.fillStyle = mix(B.mossHi, B.floor, 0.3);
    for (let k = 0; k < 3; k++) ctx.fill(C(q(x - rx * 0.4 + r() * rx * 0.8), q(y - rx * 0.25 + r() * rx * 0.4), 1.1));
  }
  const n = [2, 1, 3, 1, 2, 1, 2, 3][v];
  for (let i = 0; i < n; i++) pebble(ctx, 12 + r() * 76, 12 + r() * 76, 1.5 + r() * 2.2, B);
}

function floorHallen(ctx, B, v, r) {
  ctx.fillStyle = B.grout; ctx.fillRect(0, 0, 100, 100);
  const L = [
    [[0, 0, 100, 100]],
    [[0, 0, 100, 50], [0, 50, 100, 50]],
    [[0, 0, 50, 100], [50, 0, 50, 100]],
    [[0, 0, 60, 50], [60, 0, 40, 50], [0, 50, 35, 50], [35, 50, 65, 50]],
  ][v % 4];
  const g = 1.6;
  for (const [x, y, w, h] of L) {
    const c = mix(B.floor, r() < 0.5 ? B.floorDk : B.floorHi, r() * 0.45);
    ctx.fillStyle = mix(c, B.floorDk, 0.6); ctx.fillRect(x + g, y + g, w - 2 * g, h - 2 * g);
    ctx.fillStyle = c; ctx.fillRect(x + g, y + g, w - 2 * g - 1.6, h - 2 * g - 1.6);
    ctx.fillStyle = mix(c, B.floorHi, 0.6); ctx.fillRect(x + g, y + g, w - 2 * g - 1.6, 1.4);
    ctx.fillRect(x + g, y + g, 1.4, h - 2 * g - 1.6);
  }
  if (v >= 6) crack(ctx, r, 20 + r() * 40, 20 + r() * 40, 30, B.grout, 1.4);
  if (v === 5) { ctx.fillStyle = B.grout; ctx.fill(poly([98.4, 70, 98.4, 98.4, 76, 98.4])); }
  if (v === 4) { pebble(ctx, 30 + r() * 40, 30 + r() * 40, 2, B); }
}

function floorHerz(ctx, B, v, r) {
  ctx.fillStyle = B.floor; ctx.fillRect(0, 0, 100, 100);
  const a = 10 + r() * 80, b = 10 + r() * 80;
  const vert = v % 2 === 0;
  const pts = vert ? [a, -2, 102, -2, 102, 102, b, 102] : [-2, a, 102, b, 102, 102, -2, 102];
  ctx.fillStyle = mix(B.floor, v % 3 ? B.floorDk : B.floorHi, 0.55); ctx.fill(polyRaw(pts));
  ctx.strokeStyle = dk(B.floorDk, 0.35); ctx.lineWidth = 1.5;
  ctx.stroke(plineRaw(vert ? [a, 0, b, 100] : [0, a, 100, b]));
  // glossy glint along the cut
  ctx.strokeStyle = B.floorHi; ctx.lineWidth = 1.1;
  ctx.stroke(plineRaw(vert ? [a + 1.8, 8, lerpN(a, b, 0.3) + 1.8, 30] : [8, a + 1.8, 30, lerpN(a, b, 0.3) + 1.8]));
  if (v === 2 || v === 5) {
    const x = 15 + r() * 30, y = 20 + r() * 60, pts2 = [x, y];
    let xx = x, yy = y;
    for (let i = 0; i < 4; i++) { xx += 8 + r() * 8; yy += (r() - 0.5) * 16; pts2.push(xx, yy); }
    ctx.strokeStyle = rgba(B.vein, 0.55); ctx.lineWidth = 1.2; ctx.stroke(plineRaw(pts2));
    ctx.fillStyle = B.veinHi; ctx.fill(C(q(pts2[4]), q(pts2[5]), 1.1));
  }
  if (v === 3 || v === 6) crack(ctx, r, 30 + r() * 40, 30 + r() * 40, 20, dk(B.floorDk, 0.35));
}
const lerpN = (a, b, t) => a + (b - a) * t;

const FLOORS = { stollen: floorStollen, pilzgrotte: floorPilz, hallen: floorHallen, herz: floorHerz };
function drawFloor(ctx, B, v) {
  const r = rng(hash32(BIOME_IDX[B.id], v, 1234));
  FLOORS[B.id](ctx, B, v, r);
}

// =================================================================== walls
function wallTop(ctx, B, v, h, r) {
  ctx.fillStyle = B.top; ctx.fillRect(0, 0, 100, h);
  const id = B.id;
  if (id === 'hallen') {
    // capstones with seams on tile edges
    ctx.fillStyle = mix(B.top, B.topHi, 0.55); ctx.fillRect(3, 3, 94, h - 6);
    ctx.fillStyle = B.top; ctx.fillRect(4.5, 4.5, 92.5, h - 7.5);
    if (h > 60) { ctx.fillStyle = dk(B.top, 0.3); ctx.fillRect(0, 49, 100, 2); ctx.fillStyle = mix(B.top, B.topHi, 0.55); ctx.fillRect(3, 51, 94, 1.3); }
    return;
  }
  const chunks = h > 60 ? 3 : 2;
  for (let i = 0; i < chunks; i++) {
    const cx = 18 + r() * 64, cy = h > 60 ? 16 + r() * 68 : 12 + r() * (h - 24);
    const rx = 9 + r() * 10, ry = Math.min(rx * 0.7, h * 0.3);
    const b = blob(r, cx, cy, rx, ry, 6, 0.45);
    toneFill(ctx, b, mix(B.top, B.topHi, id === 'herz' ? 0.6 : 0.7), dk(B.top, 0.18), -1.8, -1.8);
  }
  if (id === 'herz' && v === 0) {
    const x = 15 + r() * 50, y = 10 + r() * (h - 20);
    ctx.strokeStyle = rgba(B.vein, 0.4); ctx.lineWidth = 1.2; ctx.lineCap = 'round';
    ctx.stroke(plineRaw([x, y, x + 9, y + 4, x + 16, y + 1, x + 26, y + 6]));
  }
  if (id === 'pilzgrotte' && v === 1) {
    ctx.fillStyle = mix(B.mossDk, B.top, 0.4); ctx.fill(blob(r, 30 + r() * 40, h * 0.5, 12, h * 0.18, 8, 0.4));
  }
}

function faceStollen(ctx, B, v, y0, r) {
  ctx.fillStyle = dk(B.faceDk, 0.2); ctx.fillRect(0, y0, 100, 100 - y0);
  // rough hewn rock below the lintel: irregular faceted chunks, dark cracks between
  const top = y0 + 9, bot = 95;
  ctx.save(); ctx.beginPath(); ctx.rect(0, top, 100, bot - top); ctx.clip();
  ctx.fillStyle = mix(B.face, B.faceDk, 0.55); ctx.fillRect(0, top, 100, bot - top);
  const rows = [top + 9, top + 25, top + 40];
  rows.forEach((cy, row) => {
    let x = row % 2 ? -6 + r() * 6 : 2 + r() * 8;
    while (x < 104) {
      const rx = 8 + r() * 9, ry = 6 + r() * 4;
      const ch = blob(r, x + rx, cy + (r() - 0.5) * 4, rx, ry, 6, 0.5);
      const c = mix(B.face, r() < 0.5 ? B.faceHi : B.faceDk, r() * 0.4);
      toneFill(ctx, ch, mix(c, B.faceHi, 0.3), mix(c, B.faceDk, 0.6), -2.4, -2.4);
      x += rx * 2 + 1 + r() * 3;
    }
  });
  ctx.restore();
  // timber posts (variant) and lintel beam (always, continuous)
  const post = (px) => {
    ctx.fillStyle = B.timberDk; ctx.fillRect(px, top, 13, bot - top);
    ctx.fillStyle = B.timber; ctx.fillRect(px, top, 9.5, bot - top);
    ctx.fillStyle = B.timberHi; ctx.fillRect(px, top, 2.2, bot - top);
    ctx.fillStyle = B.timberDk; ctx.fillRect(px + 3.5, top + 14, 3, 1.4); ctx.fillRect(px + 5, top + 30, 2.5, 1.4);
  };
  if (v === 0) post(8);
  if (v === 2) post(78);
  ctx.fillStyle = B.timberDk; ctx.fillRect(0, y0, 100, 10);
  ctx.fillStyle = B.timber; ctx.fillRect(0, y0, 100, 7.2);
  ctx.fillStyle = B.timberHi; ctx.fillRect(0, y0, 100, 2);
  ctx.fillStyle = B.timberDk;
  for (const nx of [[30, 70], [22, 61], [45, 84], [12, 52]][v]) { ctx.fillRect(nx - 1, y0 + 3.2, 2.2, 2.2); }
  if (v === 0 || v === 2) { // post top bracket under beam
    const px = v === 0 ? 8 : 78;
    ctx.fillStyle = B.timberDk; ctx.fillRect(px - 2, y0 + 9, 17, 2.5);
  }
}

function facePilz(ctx, B, v, y0, r) {
  ctx.fillStyle = dk(B.faceDk, 0.25); ctx.fillRect(0, y0, 100, 100 - y0);
  // lumpy stones in two loose rows
  const rows = [y0 + 18, y0 + 39];
  rows.forEach((yy, row) => {
    let x = row ? -4 + r() * 8 : 4 + r() * 8;
    while (x < 100) {
      const w = 13 + r() * 9, hh = 9 + r() * 3;
      const st = E(q(x + w / 2), q(yy + (r() - 0.5) * 3), q(w / 2 + 1.5), q(hh));
      const c = mix(B.face, r() < 0.5 ? B.faceHi : B.faceDk, r() * 0.3);
      ctx.save(); ctx.beginPath(); ctx.rect(0, y0, 100, 95 - y0); ctx.clip();
      toneFill(ctx, st, mix(c, B.faceHi, 0.25), mix(c, B.faceDk, 0.65), -2.4, -2.4);
      ctx.restore();
      x += w + 2;
    }
  });
  // moss fringe dripping from the lip (period divides 100 → seamless)
  ctx.fillStyle = B.mossDk; ctx.fillRect(0, y0, 100, 7);
  ctx.fillStyle = B.moss; ctx.fillRect(0, y0, 100, 5);
  for (let i = 0; i < 8; i++) {
    const cx = i * 12.5 + 6.25, len = 3 + ((i * 7 + v * 3) % 5) * 2;
    ctx.fillStyle = B.mossDk; ctx.fill(E(cx + 0.6, y0 + 6, 5, len));
    ctx.fillStyle = B.moss; ctx.fill(E(cx, y0 + 5, 4.5, len - 1));
  }
  ctx.fillStyle = B.mossHi; ctx.fillRect(0, y0, 100, 1.8);
  // glowing spore specks
  const spores = [[[30, 0.62], [72, 0.8]], [[55, 0.7]], [], [[18, 0.82], [62, 0.55], [84, 0.75]]][v];
  for (const [sx, fy] of spores) {
    const sy = q(y0 + (95 - y0) * fy);
    ctx.fillStyle = rgba(PAL.teal, 0.35); ctx.fill(C(sx, sy, 3.6));
    ctx.fillStyle = '#9af0d6'; ctx.fill(C(sx, sy, 1.6));
  }
}

function faceHallen(ctx, B, v, y0, r) {
  ctx.fillStyle = B.foot; ctx.fillRect(0, y0, 100, 100 - y0);
  const rowH = 13.5; let row = 0;
  for (let y = y0 + 3; y < 95; y += rowH, row++) {
    const h = Math.min(rowH, 95 - y);
    const joints = row % 2 ? [-25, 25, 75, 125] : [0, 50, 100];
    for (let i = 0; i < joints.length - 1; i++) {
      const x = joints[i] + 1, w = joints[i + 1] - joints[i] - 2;
      const c = mix(B.face, r() < 0.5 ? B.faceHi : B.faceDk, r() * 0.3);
      ctx.fillStyle = mix(c, B.faceDk, 0.75); ctx.fillRect(x, y, w, h - 1.5);
      ctx.fillStyle = c; ctx.fillRect(x, y, w - 1.8, h - 3.3);
      ctx.fillStyle = mix(c, B.faceHi, 0.75); ctx.fillRect(x, y, w - 1.8, 1.6);
    }
  }
  if (v === 1) { // chipped block
    ctx.fillStyle = B.foot; ctx.fill(poly([60, y0 + 17, 72, y0 + 17, 70, y0 + 24, 62, y0 + 27]));
  }
  if (v === 3) { // carved ring mark
    ctx.strokeStyle = mix(B.faceDk, B.foot, 0.5); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(50, y0 + 23.5, 4.2, 0, TAU); ctx.stroke();
  }
}

function faceHerz(ctx, B, v, y0, r) {
  const bot = 95;
  const t1 = 20 + r() * 25, t2 = 55 + r() * 25, b1 = 15 + r() * 30, b2 = 55 + r() * 25;
  const facets = [
    [0, y0, t1, y0, b1, bot, 0, bot],
    [t1, y0, t2, y0, b2, bot, b1, bot],
    [t2, y0, 100, y0, 100, bot, b2, bot],
  ];
  const tones = [[B.face, B.faceDk, mix(B.face, B.faceHi, 0.4)], [B.faceDk, mix(B.face, B.faceHi, 0.4), B.face], [mix(B.face, B.faceHi, 0.4), B.face, B.faceDk], [B.face, mix(B.face, B.faceHi, 0.4), B.faceDk]][v];
  facets.forEach((f, i) => { ctx.fillStyle = tones[i]; ctx.fill(polyRaw(f)); });
  // diagonal sub-facet
  ctx.fillStyle = rgba(B.faceHi, 0.35);
  ctx.fill(polyRaw([t1, y0, (t1 + t2) / 2, y0 + 20, b1 + 4, bot]));
  ctx.strokeStyle = B.faceHi; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
  ctx.stroke(plineRaw([t1 + 1, y0 + 2, b1 + 1, bot - 2]));
  ctx.stroke(plineRaw([t2 + 1, y0 + 2, b2 + 1, bot - 2]));
  if (v !== 1) { // faint gold vein
    let x = 10 + r() * 70, y = y0 + 4; const pts = [x, y];
    while (y < bot - 6) { x += (r() - 0.5) * 18; y += 8 + r() * 6; pts.push(Math.max(3, Math.min(97, x)), Math.min(bot - 2, y)); }
    ctx.strokeStyle = rgba(B.vein, 0.8); ctx.lineWidth = 1.6; ctx.stroke(plineRaw(pts));
    ctx.fillStyle = B.veinHi; ctx.fill(C(q(pts[2]), q(pts[3]), 1.3));
  }
}
const FACES = { stollen: faceStollen, pilzgrotte: facePilz, hallen: faceHallen, herz: faceHerz };

const FACE_Y = 42;
function drawWall(ctx, B, v, opts) {
  const face = !!opts.faceSouth;
  const mask = opts.mask == null ? (face ? 15 & ~MASK.S : 15) : opts.mask;
  const h = face ? FACE_Y : 100;
  const r = rng(hash32(BIOME_IDX[B.id], v, face ? 2 : 1, 99));
  wallTop(ctx, B, v, h, r);
  const rim = 7, rimLo = mix(B.top, B.topRim, 0.5);
  if (!(mask & MASK.E)) { ctx.fillStyle = rimLo; ctx.fillRect(100 - rim, 0, rim, h); }
  if (!(mask & MASK.S) && !face) { ctx.fillStyle = rimLo; ctx.fillRect(0, 100 - rim, 100, rim); }
  if (!(mask & MASK.N)) { ctx.fillStyle = B.topRim; ctx.fillRect(0, 0, 100, rim); }
  if (!(mask & MASK.W)) { ctx.fillStyle = B.topRim; ctx.fillRect(0, 0, rim, h); }
  if (face) {
    const r2 = rng(hash32(BIOME_IDX[B.id], v, 7));
    FACES[B.id](ctx, B, v, FACE_Y, r2);
    // top lip catching the light, dark foot where the face meets the floor
    ctx.fillStyle = B.topRim; ctx.fillRect(0, FACE_Y - 3, 100, 3);
    ctx.fillStyle = dk(B.top, 0.4); ctx.fillRect(0, FACE_Y - 0.6, 100, 1.4);
    ctx.fillStyle = B.foot; ctx.fillRect(0, 95, 100, 5);
  }
}

// =================================================================== doors
function doorPost(ctx, B, x, y, w, h, left) {
  const wood = B.id === 'stollen';
  const c = wood ? B.timber : B.face, hi = wood ? B.timberHi : B.faceHi, d = wood ? B.timberDk : B.faceDk;
  ctx.fillStyle = d; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = c; ctx.fillRect(x, y, w - 3, h);
  ctx.fillStyle = hi; ctx.fillRect(x, y, 2.2, h);
  if (B.id === 'hallen') { ctx.fillStyle = B.foot; for (let yy = y + 14; yy < y + h; yy += 14) ctx.fillRect(x, yy, w, 1.5); }
  if (B.id === 'herz') { ctx.fillStyle = B.metal; ctx.fillRect(left ? x + w - 4.5 : x + 2.2, y, 1.6, h); }
}
function doorFrame(ctx, B) {
  ctx.fillStyle = B.top; ctx.fillRect(0, 0, 100, 18);
  ctx.fillStyle = B.topRim; ctx.fillRect(0, 15, 100, 3);
  const wood = B.id === 'stollen';
  // lintel
  ctx.fillStyle = wood ? B.timberDk : B.faceDk; ctx.fillRect(0, 18, 100, 9);
  ctx.fillStyle = wood ? B.timber : B.face; ctx.fillRect(0, 18, 100, 6.5);
  ctx.fillStyle = wood ? B.timberHi : B.faceHi; ctx.fillRect(0, 18, 100, 1.8);
  doorPost(ctx, B, 0, 27, 15, 73, true);
  doorPost(ctx, B, 85, 27, 15, 73, false);
}
function drawDoor(ctx, B, open) {
  drawFloor(ctx, B, 0);
  doorFrame(ctx, B);
  if (!open) {
    const x0 = 15, x1 = 85, y0 = 27, y1 = 100;
    ctx.fillStyle = B.doorDk; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    const pw = (x1 - x0) / 3;
    for (let i = 0; i < 3; i++) {
      const px = x0 + i * pw;
      ctx.fillStyle = B.door; ctx.fillRect(px + 1, y0, pw - 2.5, y1 - y0);
      ctx.fillStyle = B.doorHi; ctx.fillRect(px + 1, y0, 2, y1 - y0);
      ctx.fillStyle = B.doorDk; ctx.fillRect(px + 7 + i * 3, y0 + 16 + i * 9, 1.6, 9); ctx.fillRect(px + 13 - i * 2, y0 + 44 - i * 5, 1.6, 7);
    }
    for (const by of [y0 + 8, y1 - 18]) {
      ctx.fillStyle = dk(B.metal, 0.3); ctx.fillRect(x0, by, x1 - x0, 7);
      ctx.fillStyle = B.metal; ctx.fillRect(x0, by, x1 - x0, 5.4);
      ctx.fillStyle = B.metalHi;
      for (let i = 0; i < 3; i++) ctx.fill(C(x0 + i * pw + pw / 2, by + 2.7, 1.5));
    }
    // ring handle
    ctx.fillStyle = dk(B.metal, 0.2); ctx.fill(C(68, 62, 4));
    ctx.strokeStyle = B.metalHi; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(68, 66, 4.5, 0, TAU); ctx.stroke();
    ctx.fillStyle = B.foot; ctx.fillRect(x0, 96, x1 - x0, 4);
  } else {
    // dark passage with shadow under lintel, door leaf swung against the left post
    ctx.fillStyle = rgba('#05060c', 0.45); ctx.fillRect(15, 27, 70, 73);
    ctx.fillStyle = rgba('#05060c', 0.4); ctx.fillRect(15, 27, 70, 14);
    ctx.fillStyle = B.doorDk; ctx.fill(poly([15, 27, 29, 33, 29, 92, 15, 100]));
    ctx.fillStyle = B.door; ctx.fill(poly([15, 27, 26, 32, 26, 93, 15, 100]));
    ctx.fillStyle = B.doorHi; ctx.fill(poly([15, 27, 17.5, 28.2, 17.5, 98.6, 15, 100]));
    ctx.fillStyle = B.metal; ctx.fill(poly([15, 35, 29, 40, 29, 45, 15, 41])); ctx.fill(poly([15, 82, 29, 79, 29, 84, 15, 88]));
  }
}

// =================================================================== stairs
function drawStairs(ctx, B) {
  drawFloor(ctx, B, 0);
  const frame = R(10, 10, 80, 84, 5);
  toneFill(ctx, frame, mix(B.face, B.faceHi, 0.4), B.faceDk, -2, -2);
  ctx.fillStyle = B.foot; ctx.fillRect(10, 90, 80, 4);
  const voidC = '#06070d';
  ctx.fillStyle = voidC; ctx.fillRect(18, 17, 64, 71);
  const stepH = 15, n = 4;
  for (let k = 0; k < n; k++) {
    const yb = 88 - k * stepH, inset = k * 3.2;
    const x = 18 + inset, w = 64 - inset * 2;
    const c = mix(B.faceHi, voidC, k * 0.22 + 0.02);
    ctx.fillStyle = mix(c, voidC, 0.45); ctx.fillRect(x, yb - 5, w, 5);           // riser
    ctx.fillStyle = c; ctx.fillRect(x, yb - stepH, w, stepH - 5);                   // tread
    ctx.fillStyle = mix(c, '#fff2d2', 0.18); ctx.fillRect(x, yb - stepH, w, 1.8);  // nosing
  }
  // side walls of the shaft (shadow on the right, lit sliver left)
  ctx.fillStyle = rgba(voidC, 0.55); ctx.fill(poly([82, 17, 82, 88, 70, 30]));
  ctx.fillStyle = rgba(B.faceHi, 0.25); ctx.fill(poly([18, 17, 18, 88, 22, 40]));
}

// =================================================================== brazier
const IRON = '#4b4752', IRON_HI = '#7a7484', IRON_DK = '#2e2b35';
function flamePath(cx, base, w, h, sway) {
  const p = new Path2D();
  p.moveTo(cx - w, base);
  p.bezierCurveTo(cx - w * 1.1, base - h * 0.45, cx + sway * 0.4 - w * 0.4, base - h * 0.7, cx + sway, base - h);
  p.bezierCurveTo(cx + sway * 0.3 + w * 0.5, base - h * 0.65, cx + w * 1.15, base - h * 0.4, cx + w, base);
  p.quadraticCurveTo(cx, base + w * 0.35, cx - w, base);
  p.closePath(); return p;
}
function brazierObj(p, o) {
  const lit = o.lit, ph = phase(o.t, 1.2);
  const f1 = Math.sin(ph), f2 = Math.sin(ph * 2 + 1.3), f3 = Math.sin(ph * 3 + 0.4);
  if (lit) {
    p.glow(50, 38, 40, LIGHT.brazier, 0.1 + 0.015 * f2, 3);
  }
  p.line(P('M36 66 L 29 88'), IRON, 3.6);
  p.line(P('M64 66 L 71 88'), IRON, 3.6);
  p.line(P('M50 70 L 50 90'), IRON_DK, 3.2);
  p.tone(P('M23 54 L 77 54 Q 75 72 50 74 Q 25 72 23 54 Z'), IRON_HI, IRON_DK, 0.8);
  p.flat(P('M28 60 L 72 60 L 71 63 L 29 63 Z'), IRON_DK);
  p.tone(R(21, 50, 58, 6.5, 3), IRON_HI, IRON, 0.5);
  if (lit) {
    const sway = f1 * 4 + f3 * 1.5, hh = 1 + 0.06 * f2 + 0.04 * f3;
    p.fill(flamePath(50, 52, 17, 44 * hh, sway), PAL.ember);
    p.flat(flamePath(51, 52, 11.5, 33 * hh, sway * 1.2 + 1), PAL.amber);
    p.flat(flamePath(51, 52, 6, 19 * (1 + 0.1 * f1), sway * 0.8 + 1), '#fff0c0');
    p.flat(flamePath(37 + f2, 52, 5, 16 + 3 * f3, -3 + f1 * 2), PAL.amber);
    p.flat(E(50, 51.5, 24, 3.4), '#ff8a3a');
    for (const [x, y] of [[33, 51], [44, 52.5], [58, 51], [67, 52]]) p.flat(C(x, y, 1.5), '#fff0c0');
  } else {
    p.fill(P('M27 52 Q 34 40 44 44 Q 52 36 60 43 Q 68 41 73 52 Z'), '#6f6a72');
    p.flat(P('M33 52 Q 40 46 48 48 Q 54 44 61 48 Q 66 47 69 52 Z'), '#55505a');
    p.flat(C(46, 49, 2.2), '#2a2530'); p.flat(C(58, 48, 1.8), '#2a2530'); p.flat(C(40, 46, 1.5), '#8a8590');
  }
}
function drawBrazier(ctx, B, lit, t) {
  drawFloor(ctx, B, 0);
  contactShadow(ctx, 50, 88, 26, 5.5, 0.35);
  penDraw(ctx, brazierObj, { lit, t }, 1, 3);
}

// =================================================================== fungus
const SHROOMS = [
  [[40, 76, 1.5, 0], [66, 62, 1.0, 1.7], [62, 88, 0.75, 3.1], [20, 56, 0.7, 4.2]],
  [[56, 74, 1.45, 0.6], [28, 86, 0.95, 2.2], [80, 52, 0.75, 3.6], [28, 50, 0.65, 1.1]],
  [[44, 62, 1.25, 0.3], [68, 86, 1.1, 2.6], [22, 84, 0.8, 4.4], [78, 46, 0.65, 5.2]],
];
function fungusObj(p, o) {
  const set = SHROOMS[o.v] || SHROOMS[0];
  const base = phase(o.t, 3);
  for (const [x, y, s, ph] of set) {
    const pulse = 0.5 + 0.5 * Math.sin(base + ph);
    p.glow(x, y - 12 * s, 20 * s + 3 * pulse, LIGHT.fungus, 0.08 + 0.06 * pulse, 2);
  }
  // draw back-to-front
  const sorted = [...set].sort((a, b) => a[1] - b[1]);
  for (const [x, y, s, ph] of sorted) {
    const pulse = 0.5 + 0.5 * Math.sin(base + ph);
    const w = 11 * s, h = 9 * s, sh = 12 * s;
    p.tone(polyRawMemo(x, y, s), '#d8d0b4', '#9a9078', 0.4);
    const cap = capPath(x, y - sh, w, h);
    const capLit = mix(PAL.teal, '#c8fff0', 0.15 + 0.4 * pulse);
    p.tone(cap, capLit, dk(PAL.teal, 0.3), 0.6 * s);
    p.flat(E(x, y - sh + 0.5, w * 0.85, 1.6 * s), dk(PAL.teal, 0.55));
    p.flat(C(x - w * 0.35, y - sh - h * 0.55, 1.6 * s), '#eafff8');
    p.flat(C(x + w * 0.2, y - sh - h * 0.75, 1.1 * s), '#eafff8');
  }
}
function polyRawMemo(x, y, s) {
  return R(q(x - 3.2 * s), q(y - 13 * s), q(6.4 * s), q(13 * s), q(2.5 * s));
}
function capPath(x, y, w, h) {
  return P(`M${q(x - w)} ${q(y)} C ${q(x - w)} ${q(y - h * 1.35)} ${q(x + w)} ${q(y - h * 1.35)} ${q(x + w)} ${q(y)} Q ${q(x)} ${q(y + h * 0.3)} ${q(x - w)} ${q(y)} Z`);
}
function drawFungus(ctx, B, v, t) {
  drawFloor(ctx, B, 0);
  for (const [x, y, s] of SHROOMS[v]) contactShadow(ctx, x, y, 7 * s, 2.2 * s, 0.3);
  penDraw(ctx, fungusObj, { v, t }, 1, 2.6);
}

// =================================================================== traps
function trapDartObj(p) {
  p.line(P('M30 70 L 66 40'), '#b9c4d2', 2.6);
  p.fill(P('M66 40 L 74 33 L 70 43 Z'), '#e6edf5');
  p.fill(P('M30 70 L 24 70 L 27 76 Z M30 70 L 30 64 L 24 67 Z'), PAL.ember);
}
function drawTrapDart(ctx, B) {
  drawFloor(ctx, B, 0);
  const plate = mix(B.floorHi, '#8f93a3', 0.45);
  ctx.fillStyle = dk(plate, 0.55); ctx.fill(R(19, 21, 62, 60, 5));
  ctx.fillStyle = plate; ctx.fill(R(19, 21, 59, 57, 5));
  ctx.fillStyle = lt(plate, 0.25); ctx.fillRect(23, 21, 51, 2);
  ctx.fillStyle = dk(plate, 0.35); ctx.fill(R(25, 27, 47, 45, 3));
  ctx.fillStyle = plate; ctx.fill(R(26.5, 28.5, 44, 42, 3));
  ctx.fillStyle = '#111420';
  for (const [x, y] of [[33, 36], [48.5, 36], [64, 36], [33, 62], [64, 62]]) ctx.fill(C(x, y, 2.6));
  penDraw(ctx, trapDartObj, {}, 1, 2.2);
}
function drawTrapTeleport(ctx, B) {
  drawFloor(ctx, B, 0);
  const V = '#a678ff', Vd = '#6a44c0';
  ctx.fillStyle = rgba(V, 0.16); ctx.fill(C(50, 52, 36));
  ctx.fillStyle = rgba(V, 0.18); ctx.fill(C(50, 52, 26));
  ctx.lineWidth = 4.5; ctx.strokeStyle = Vd; ctx.beginPath(); ctx.arc(50.8, 53, 31, 0, TAU); ctx.stroke();
  ctx.strokeStyle = V; ctx.beginPath(); ctx.arc(50, 52, 31, 0, TAU); ctx.stroke();
  ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(50, 52, 20, 0, TAU); ctx.stroke();
  ctx.lineCap = 'round'; ctx.lineWidth = 3;
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU + 0.2;
    ctx.beginPath(); ctx.moveTo(50 + Math.cos(a) * 22.5, 52 + Math.sin(a) * 22.5); ctx.lineTo(50 + Math.cos(a) * 28, 52 + Math.sin(a) * 28); ctx.stroke();
  }
  ctx.fillStyle = Vd; ctx.fill(poly([50, 40, 58, 52, 50, 64, 42, 52]));
  ctx.fillStyle = '#e4d6ff'; ctx.fill(poly([50, 43, 55, 52, 50, 61, 45, 52]));
}
function trapAlarmObj(p) {
  p.line(P('M6 50 Q 50 47 94 52'), '#cbbf9e', 1.6);
  p.fill(R(3, 44, 6, 12, 2), '#5a4632'); p.fill(R(91, 46, 6, 12, 2), '#5a4632');
  p.line(P('M50 48 L 50 54'), '#7a6040', 2);
  p.tone(P('M38 80 Q 38 60 42 56 Q 50 50 58 56 Q 62 60 62 80 Z'), '#f0c050', '#a4721e', 0.8);
  p.tone(R(34, 78, 32, 6, 3), '#f0c050', '#a4721e', 0.5);
  p.fill(C(50, 87, 3.6), '#7a5418');
  p.flat(P('M43 74 Q 43 62 47 59 L 49 60 Q 46 64 46 74 Z'), '#ffe7a0');
}
function drawTrapAlarm(ctx, B) {
  drawFloor(ctx, B, 0);
  contactShadow(ctx, 50, 87, 18, 4, 0.35);
  penDraw(ctx, trapAlarmObj, {}, 1, 2.4);
}
function drawTrapPit(ctx, B) {
  drawFloor(ctx, B, 0);
  const hole = P('M20 40 Q 22 22 40 20 Q 54 14 66 22 Q 84 24 82 44 Q 88 62 76 76 Q 62 88 44 84 Q 24 84 18 66 Q 12 52 20 40 Z');
  // rubble rim
  ctx.fillStyle = dk(B.floorDk, 0.25);
  ctx.save(); ctx.translate(1.5, 2.5); ctx.fill(hole); ctx.restore();
  ctx.save(); ctx.translate(-50 * 0.1, -52 * 0.1); ctx.scale(1.1, 1.1);
  ctx.fillStyle = mix(B.floorHi, B.floor, 0.4); ctx.fill(hole); ctx.restore();
  // inner wall (lit far side) and deep void
  ctx.fillStyle = mix(B.floorDk, '#000', 0.15); ctx.fill(hole);
  ctx.save(); ctx.clip(hole);
  ctx.fillStyle = mix(B.floorDk, '#000', 0.4); ctx.translate(0, 7); ctx.fill(hole); ctx.translate(0, 6);
  ctx.fillStyle = '#05060b'; ctx.fill(hole); ctx.restore();
  // spikes glinting in the dark
  ctx.fillStyle = '#8c8578';
  for (const [x, y] of [[36, 64], [48, 70], [60, 62], [42, 54], [56, 52], [66, 72]]) ctx.fill(poly([x - 2.6, y + 3, x, y - 6, x + 2.6, y + 3]));
  ctx.fillStyle = '#c8bfa8';
  for (const [x, y] of [[36, 64], [48, 70], [60, 62], [42, 54], [56, 52], [66, 72]]) ctx.fill(poly([x - 1, y + 1, x, y - 6, x + 0.6, y]));
}

// =================================================================== dispatch
/**
 * Draw a tile into the size×size box at (x,y).
 * opts: { biome, seed, t, faceSouth, mask }
 */
export function drawTile(ctx, kind, x, y, size, opts = {}) {
  const B = BIOMES[opts.biome] || BIOMES.stollen;
  const v = tileVariant(kind, opts.seed || 0);
  ctx.save();
  ctx.translate(x, y); ctx.scale(size / 100, size / 100);
  ctx.beginPath(); ctx.rect(0, 0, 100, 100); ctx.clip();
  switch (kind) {
    case 'wall': drawWall(ctx, B, v, opts); break;
    case 'floor': drawFloor(ctx, B, v); break;
    case 'door_closed': drawDoor(ctx, B, false); break;
    case 'door_open': drawDoor(ctx, B, true); break;
    case 'stairs_down': drawStairs(ctx, B); break;
    case 'brazier_lit': drawBrazier(ctx, B, true, opts.t || 0); break;
    case 'brazier_out': drawBrazier(ctx, B, false, 0); break;
    case 'fungus': drawFungus(ctx, B, v, opts.t || 0); break;
    case 'trap_dart': drawTrapDart(ctx, B); break;
    case 'trap_teleport': drawTrapTeleport(ctx, B); break;
    case 'trap_alarm': drawTrapAlarm(ctx, B); break;
    case 'trap_pit': drawTrapPit(ctx, B); break;
    default:
      ctx.fillStyle = '#ff00ff'; ctx.fillRect(0, 0, 100, 100);
  }
  ctx.restore();
}
