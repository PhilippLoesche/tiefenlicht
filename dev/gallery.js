import * as ART from '../js/art/index.js';

const {
  BIOMES, BIOME_IDS, TILE_KINDS, SPRITE_IDS, MONSTER_IDS, ITEM_IDS, ICON_IDS, APPEARANCES,
  drawTile, drawSprite, isAnimated, getTileCanvas, blitTile, blitSprite, MASK, LIGHT, cacheStats,
} = ART;

const root = document.getElementById('root');
const DPR = window.devicePixelRatio || 1;
const animated = [];

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function canvas(w, h) {
  const c = el('canvas'); c.width = Math.round(w * DPR); c.height = Math.round(h * DPR);
  c.style.width = w + 'px'; c.style.height = h + 'px';
  const g = c.getContext('2d'); g.scale(DPR, DPR); return [c, g];
}
function cell(parent, label, w, h, draw, anim) {
  const d = el('div', 'cell'); const [c, g] = canvas(w, h);
  d.append(c); if (label) d.append(el('span', null, label)); parent.append(d);
  const run = (t) => { g.clearRect(0, 0, w, h); draw(g, t); };
  run(0); if (anim) animated.push(run);
  return d;
}
function section(title) { root.append(el('h2', null, title)); }
function row(parent = root) { const r = el('div', 'row'); parent.append(r); return r; }

// ------------------------------------------------------------------ tiles per biome
section('Tiles × Biome (48 px, drawTile direct)');
for (const b of BIOME_IDS) {
  root.append(el('h3', null, `${BIOMES[b].name} (${b}) — depth ${BIOMES[b].depths.join('–')}`));
  const r = row();
  cell(r, 'wall top', 48, 48, (g) => drawTile(g, 'wall', 0, 0, 48, { biome: b, seed: 1, mask: 15 }));
  for (let s = 0; s < 4; s++) {
    const seed = [0, 1, 2, 3].map((k) => findSeed('wall', k))[s];
    cell(r, `wall face v${s}`, 48, 48, (g) => drawTile(g, 'wall', 0, 0, 48, { biome: b, seed, faceSouth: true, mask: 15 & ~MASK.S }));
  }
  for (let v = 0; v < 8; v++) {
    const seed = findSeed('floor', v);
    cell(r, `floor v${v}`, 48, 48, (g) => drawTile(g, 'floor', 0, 0, 48, { biome: b, seed }));
  }
  for (const k of TILE_KINDS.filter((k) => k !== 'wall' && k !== 'floor')) {
    cell(r, k, 48, 48, (g, t) => drawTile(g, k, 0, 0, 48, { biome: b, seed: 5, t }), isAnimated(k));
  }
  for (let v = 1; v < 3; v++) { const seed = findSeed('fungus', v); cell(r, `fungus v${v}`, 48, 48, (g, t) => drawTile(g, 'fungus', 0, 0, 48, { biome: b, seed, t }), true); }
}
function findSeed(kind, v) { for (let s = 0; s < 500; s++) if (ART.tileVariant(kind, s) === v) return s; return 0; }

// ------------------------------------------------------------------ wall masks
section('Wall neighbour masks (32 px; N=1 E=2 S=4 W=8, bit = neighbour is wall; face drawn when S is open)');
for (const b of BIOME_IDS) {
  const r = row();
  for (let m = 0; m < 16; m++) {
    cell(r, `${b.slice(0, 4)} m${m}`, 32, 32, (g) => {
      g.fillStyle = BIOMES[b].floor; g.fillRect(0, 0, 32, 32);
      drawTile(g, 'wall', 0, 0, 32, { biome: b, seed: m, mask: m, faceSouth: !(m & MASK.S) });
    });
  }
}

// ------------------------------------------------------------------ mock rooms
section('Mock rooms (cached blits via getTileCanvas / blitSprite)');
const ROOM = [
  '###+###',
  '#.....#',
  '+.....#',
  '#.....#',
  '#######',
];
const BIG = [
  '############',
  '#....#.....#',
  '#.##.#..f..#',
  '#.##.+.....#',
  '#....#..>..#',
  '##+###.....#',
  '#.b.....##.#',
  '############',
];
const roomsWrap = el('div', 'rooms'); root.append(roomsWrap);
const lightToggle = document.getElementById('light');
function drawMap(g, map, ts, b, t, ents, light) {
  const H = map.length, W = map[0].length;
  const isWall = (x, y) => x < 0 || y < 0 || x >= W || y >= H || map[y][x] === '#';
  const special = { '+': 'door_closed', '>': 'stairs_down', b: 'brazier_lit', f: 'fungus', o: 'door_open', B: 'brazier_out' };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ch = map[y][x], seed = x * 7919 + y * 104729;
    if (ch === '#') {
      const mask = (isWall(x, y - 1) ? MASK.N : 0) | (isWall(x + 1, y) ? MASK.E : 0) | (isWall(x, y + 1) ? MASK.S : 0) | (isWall(x - 1, y) ? MASK.W : 0);
      blitTile(g, 'wall', x * ts, y * ts, ts, { biome: b, seed, mask, faceSouth: !isWall(x, y + 1), scale: DPR });
    } else {
      blitTile(g, special[ch] || 'floor', x * ts, y * ts, ts, { biome: b, seed, t, scale: DPR });
    }
  }
  for (const [id, x, y, o] of ents) blitSprite(g, id, x * ts, y * ts, ts, { t, scale: DPR, ...o });
  if (light) {
    const [hx, hy] = light;
    const cx = (hx + 0.5) * ts, cy = (hy + 0.5) * ts;
    g.save(); g.globalCompositeOperation = 'multiply';
    const gr = g.createRadialGradient(cx, cy, ts * 0.5, cx, cy, ts * 4.2);
    gr.addColorStop(0, '#ffe6bf'); gr.addColorStop(0.45, '#d89a5c'); gr.addColorStop(1, BIOMES[b].ambient);
    g.fillStyle = gr; g.fillRect(0, 0, W * ts, H * ts); g.restore();
  }
}
for (const b of BIOME_IDS) {
  const ents = [['hero', 2, 2, {}], [MONSTER_IDS[(BIOME_IDS.indexOf(b) * 4 + 2) % MONSTER_IDS.length], 4, 2, { facing: -1 }], ['potion', 4, 1, { appearance: 'azurblau' }], ['gold', 1, 3, {}]];
  const box = el('div', 'cell');
  const [c, g] = canvas(7 * 48, 5 * 48); box.append(c); box.append(el('span', null, `${b} 7×5 @48`)); roomsWrap.append(box);
  animated.push((t) => { g.clearRect(0, 0, 7 * 48, 5 * 48); drawMap(g, ROOM, 48, b, t, ents, lightToggle.checked ? [2, 2] : null); });
  const ents2 = [['hero', 6, 3, {}], ['ratte', 3, 6, { facing: -1 }], ['sonnenscherbe', 9, 2, {}]];
  const box2 = el('div', 'cell');
  const [c2, g2] = canvas(12 * 32, 8 * 32); box2.append(c2); box2.append(el('span', null, `${b} 12×8 @32`)); roomsWrap.append(box2);
  animated.push((t) => { g2.clearRect(0, 0, 12 * 32, 8 * 32); drawMap(g2, BIG, 32, b, t, ents2, lightToggle.checked ? [6, 3] : null); });
}

// ------------------------------------------------------------------ sprites
function spriteBlock(ids, title, optsFor = () => ({})) {
  section(title);
  const r = row();
  ids.forEach((id, i) => {
    const d = el('div', 'cell'); const s = el('div', 'sizes');
    const b = BIOME_IDS[i % 4];
    const over = ART.spriteOverflow(id);
    for (const sz of [32, 48]) {
      const oy = Math.ceil(sz * over);
      const [c, g] = canvas(sz, sz + oy); s.append(c);
      const run = (t) => { g.clearRect(0, 0, sz, sz + oy); drawTile(g, 'floor', 0, oy, sz, { biome: b, seed: 0 }); drawSprite(g, id, 0, oy, sz, { t, ...optsFor(id) }); };
      run(0); if (isAnimated(id)) animated.push(run);
    }
    const [c, g] = canvas(96, 96 * (1 + over)); c.classList.add('bg'); s.append(c);
    const run = (t) => { g.clearRect(0, 0, 96, 96 * (1 + over)); drawSprite(g, id, 0, 96 * over, 96, { t, ...optsFor(id) }); };
    run(0); if (isAnimated(id)) animated.push(run);
    d.append(s); d.append(el('span', null, id + (isAnimated(id) ? ' ~' : ''))); r.append(d);
  });
}
spriteBlock(['hero', ...MONSTER_IDS], 'Hero + monsters (32 / 48 on floor, 96 on dark; ~ = animated)');
section('Variants: facing, dormant');
{
  const r = row();
  cell(r, 'hero facing -1', 64, 64, (g, t) => drawSprite(g, 'hero', 0, 0, 64, { t, facing: -1 }), true);
  cell(r, 'hero facing 1', 64, 64, (g, t) => drawSprite(g, 'hero', 0, 0, 64, { t, facing: 1 }), true);
  cell(r, 'schattenhund -1', 64, 64, (g) => drawSprite(g, 'schattenhund', 0, 0, 64, { facing: -1 }));
  cell(r, 'steinwaechter', 64, 64, (g) => drawSprite(g, 'steinwaechter', 0, 0, 64, {}));
  cell(r, 'steinwaechter dormant', 64, 64, (g) => drawSprite(g, 'steinwaechter', 0, 0, 64, { dormant: true }));
  cell(r, 'cached lichtfresser', 64, 64 * 1.4, (g, t) => blitSprite(g, 'lichtfresser', 0, 64 * 0.4, 64, { t, scale: DPR }), true);
  cell(r, 'cached grubengeist', 64, 64, (g, t) => blitSprite(g, 'grubengeist', 0, 0, 64, { t, scale: DPR }), true);
}
spriteBlock(ITEM_IDS, 'Items (32 / 48 on floor, 96 on dark)');

section('Appearances (48 px)');
for (const cat of ['potion', 'wand', 'ring']) {
  const r = row();
  for (const ap of Object.keys(APPEARANCES[cat])) {
    cell(r, `${cat}:${ap}`, 48, 48, (g) => { drawTile(g, 'floor', 0, 0, 48, { biome: 'stollen', seed: 0 }); drawSprite(g, cat, 0, 0, 48, { appearance: ap }); });
  }
}

section('UI icons (24 / 32 / 48, monochrome via opts.color)');
{
  const r = row();
  for (const id of ICON_IDS) {
    const d = el('div', 'cell'); const s = el('div', 'sizes');
    for (const [sz, col] of [[24, '#e8dcc0'], [32, '#ffb454'], [48, '#e8dcc0']]) {
      const [c, g] = canvas(sz, sz); drawSprite(g, id, 0, 0, sz, { color: col, scale: DPR }); s.append(c);
    }
    d.append(s); d.append(el('span', null, id)); r.append(d);
  }
}

// ------------------------------------------------------------------ animation loop
const animToggle = document.getElementById('anim');
const statsEl = document.getElementById('stats');
let last = 0;
function frame(ms) {
  const t = ms / 1000;
  if (animToggle.checked && ms - last > 1000 / 30) { last = ms; for (const f of animated) f(t); }
  const s = cacheStats(); statsEl.textContent = `cache: ${s.tiles} tile canvases, ${s.sprites} sprite canvases`;
  requestAnimationFrame(frame);
}
lightToggle.addEventListener('change', () => { for (const f of animated) f(performance.now() / 1000); });
for (const f of animated) f(0);
requestAnimationFrame(frame);
