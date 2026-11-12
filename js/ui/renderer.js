// Map renderer: cached tile/sprite blits, a smooth coloured light map
// (computed at 2 samples per tile, upscaled with smoothing and multiplied over
// the tiles), additive glows, entities with tweens, particles, projectiles,
// floating numbers and the interaction overlays (path preview, targeting).
import { BIOMES, LIGHT, MASK, getTileCanvas, getSpriteCanvas, clearCache } from '../art/index.js';

const S = 2; // light samples per tile and axis
// Headroom: everything drawn under the light map is pre-brightened by K and the light map is divided by K,
// so the lamp pool can exceed the art's base brightness with a single multiply pass (no extra dodge pass).
const K = 1.5;
const VS = 4; // void mask samples per tile and axis
const MIN_TS = 24, MAX_TS = 72;
export const TILE_LIMITS = [MIN_TS, MAX_TS];
const ANIM_TILES = new Set(['brazier_lit', 'fungus']);
const FONT_UI = '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif';

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
const mix = (a, b, k) => a + (b - a) * k;
const falloff = (d, r) => { const v = 1 - (d / (r + 0.5)) ** 2; return v > 0 ? v : 0; };

const C_LAMP = rgb(LIGHT.lamp), C_CORE = rgb(LIGHT.lampCore), C_EMBER = rgb('#e2543a');
const C_BRAZIER = rgb(LIGHT.brazier), C_FUNGUS = rgb(LIGHT.fungus);

function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function glowTexture(hex, size = 128) {
  const c = makeCanvas(size, size), g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  const [r, gg, b] = rgb(hex).map((v) => Math.round(v * 255));
  for (let k = 0; k <= 10; k++) {
    const t = k / 10, a = Math.pow(1 - t, 2.2);
    gr.addColorStop(t, `rgba(${r},${gg},${b},${a.toFixed(3)})`);
  }
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return c;
}

export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('./anim.js').Anim} anim
   * @param {{demo?: boolean}} opts
   */
  constructor(canvas, anim, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.anim = anim;
    this.demo = !!opts.demo;
    this.game = null;
    this.ts = 48; this.dpr = 1; this.tsd = 48;
    this.vw = 0; this.vh = 0;
    this.camX = 0; this.camY = 0; this.camInit = false; this.camFastUntil = 0;
    this.detached = false;      // the player panned the view away from the hero
    this.camLevel = null;
    this.focusX = 0; this.focusXTarget = 0; this.focusY = 0; this.focusYTarget = 0;
    this.lightR = 0; this.lightRTarget = 7; this.lightRate = 350;
    this.gain = 1; this.gainTarget = 1;
    this.lampTint = 0; this.lampTintTarget = 0;
    this.flick = 0;
    this.heroFacing = 1;
    this.heroHidden = false;
    this.hover = null;          // {x, y}
    this.path = null;           // [{x,y}] preview
    this.targeting = null;      // {cursor:{x,y}, valid, candidates:[{x,y}], line:[{x,y}]}
    this.lowHp = 0;
    this.dimming = 0;           // 0..1 extra darkness (death)
    this.lv = null;
    this.desat = new WeakMap();
    this.brightMap = new WeakMap();
    this.maxDpr = 2;            // backing store cap (phones report 3); lowered adaptively when frames run long
    this.pz = 1;                // live pinch scale on top of the cached tile size
    this.cts = 48;              // cached tile size in device px (integer)
    this.dirty = true;          // something changed: draw the next frame even when idle
    this.lastRender = 0;
    this.fading = false;
    this.vigEl = opts.vignette || null;
    this.vigOpacity = -1;
    this.shadeF = new WeakMap(); this.shadeT = new WeakMap();
    this.white = new WeakMap();
    this.lc = makeCanvas(1, 1);
    this.lctx = this.lc.getContext('2d');
    this.glow = { lamp: glowTexture(LIGHT.lamp), brazier: glowTexture(LIGHT.brazier), fungus: glowTexture(LIGHT.fungus), sun: glowTexture(LIGHT.sunshard), ghost: glowTexture(LIGHT.ghost), corona: glowTexture(LIGHT.corona) };
    this.ents = [];             // reusable draw list
    this.lastT = 0;
    this.shx = 0; this.shy = 0; this.ox = 0; this.oy = 0;
    this.flickSeed = Math.random() * 100;
  }

  // ------------------------------------------------------------ setup
  setTileSize(ts) {
    ts = Math.max(MIN_TS, Math.min(MAX_TS, Math.round(ts)));
    this.dirty = true;
    if (ts === this.ts && this.cts === Math.round(ts * this.dpr)) { this.pz = 1; this.tsd = this.cts; return; }
    this.ts = ts;
    this.cts = this.tsd = Math.round(ts * this.dpr);
    this.pz = 1;
    clearCache(); // old sizes are dropped, so the art caches never grow across zoom levels
    this.lv = null; // force tile canvas rebuild
    if (this.game) this.sync();
  }

  setMaxDpr(v) {
    if (v === this.maxDpr) return;
    this.maxDpr = v;
    this.resize();
  }

  resize() {
    const dpr = Math.min(this.maxDpr, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    const W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(h * dpr));
    if (dpr !== this.dpr) { this.dpr = dpr; this.cts = this.tsd = Math.round(this.ts * dpr); this.pz = 1; clearCache(); this.lv = null; }
    this.dirty = true;
    if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
    this.vw = W; this.vh = H;
    const ctx = this.ctx;
    const big = Math.hypot(W, H) / 2;
    this.hurtGrad = ctx.createRadialGradient(W / 2, H / 2, big * 0.35, W / 2, H / 2, big * 1.02);
    this.hurtGrad.addColorStop(0, 'rgba(226,84,58,0)');
    this.hurtGrad.addColorStop(1, 'rgba(226,84,58,0.85)');
    if (this.game) this.sync();
  }

  setGame(game) {
    this.game = game;
    this.lv = null;
    this.camInit = false;
    this.detached = false;
    this.camLevel = null;
    this.lightR = 0;
    this.anim.clear();
    this.sync();
  }

  /** Rebuild cached per-state data. Call after every act(). */
  sync() {
    const g = this.game;
    if (!g) return;
    const st = g.state, lv = st.level;
    if (this.lv !== lv) this.initLevel(lv);
    const W = lv.width, H = lv.height, biome = lv.biome;
    // traps visible to the player
    this.trapAt.clear();
    for (const t of lv.traps) if (!t.hidden) this.trapAt.set(t.y * W + t.x, t.kind);
    // tile canvases for explored tiles
    const isWall = (x, y) => x < 0 || y < 0 || x >= W || y >= H || (lv.memTiles[y * W + x] ?? 'wall') === 'wall';
    const tsd = this.cts;
    this.dirty = true;
    this.animIdx.length = 0;
    for (let i = 0; i < W * H; i++) {
      this.tf[i] = 1;
      if (!lv.explored[i]) { this.tileCv[i] = null; continue; }
      let kind = lv.memTiles[i];
      const trap = this.trapAt.get(i);
      if (trap && (kind === 'floor')) kind = trap;
      if (ANIM_TILES.has(kind)) { this.tileCv[i] = null; this.tileKind[i] = kind; this.animIdx.push(i); continue; }
      const x = i % W, y = (i - x) / W;
      let opts;
      if (kind === 'wall') {
        const mask = (isWall(x, y - 1) ? MASK.N : 0) | (isWall(x + 1, y) ? MASK.E : 0) | (isWall(x, y + 1) ? MASK.S : 0) | (isWall(x - 1, y) ? MASK.W : 0);
        const south = y + 1 < H ? lv.memTiles[(y + 1) * W + x] : 'wall';
        opts = { biome, seed: this.seeds[i], mask, faceSouth: south != null && south !== 'wall', scale: 1 };
        // wall tops sit in shadow; the soft light map turns this into gentle ambient occlusion
        this.tf[i] = opts.faceSouth ? 1 : 0.72;
        this.tileCv[i] = this.bright(this.shadedWall(getTileCanvas(kind, tsd, opts), opts.faceSouth));
        this.tileKind[i] = kind;
        continue;
      } else opts = { biome, seed: this.seeds[i], scale: 1 };
      this.tileCv[i] = this.bright(getTileCanvas(kind, tsd, opts));
      this.tileKind[i] = kind;
    }
    this.updateVoid();
    // static light colours (recomputed when the map changes)
    if (this.mapVersion !== lv.mapVersion || !this.staticReady) this.computeStatic();
    // entities
    this.monsters = g.visibleMonsters();
    const items = [];
    for (const it of g.visibleItems()) items.push({ x: it.x, y: it.y, v: g.itemVisual(it), sun: it.kind === 'sonnenscherbe' });
    for (const [k, list] of Object.entries(lv.memItems)) {
      const i = +k;
      if (lv.visible[i] || !list.length) continue;
      const it = list[list.length - 1];
      items.push({ x: i % W, y: Math.floor(i / W), v: g.itemVisual(it), mem: true, sun: it.kind === 'sonnenscherbe' });
    }
    this.items = items;
    this.hero = { x: st.player.x, y: st.player.y };
    this.lightRTarget = st.status === 'playing' ? g.lightRadius() : st.status === 'won' ? 13 : 0;
    if (st.status === 'won') this.lightRate = 1400;
    const p = st.player, f = p.oil / p.oilMax;
    this.oilFrac = f;
    this.gainTarget = p.oil <= 0 ? 0.55 : p.statuses.finsternis ? 0.7 : 0.8 + 0.2 * Math.min(1, f / 0.3);
    this.lampTintTarget = p.oil <= 0 ? 0.85 : f < 0.25 ? 0.15 + (0.25 - f) * 2.4 : 0;
    this.lowHp = p.hp / p.maxHp <= 0.3 && st.status === 'playing' ? 1 : 0;
    // glow sources
    this.glows = [];
    for (const i of this.animIdx) if (lv.visible[i]) this.glows.push(i);
  }

  initLevel(lv) {
    const W = lv.width, H = lv.height, N = W * H;
    this.lv = lv;
    this.W = W; this.H = H;
    this.tileCv = new Array(N).fill(null);
    this.tileKind = new Array(N).fill(null);
    this.trapAt = new Map();
    this.animIdx = [];
    this.seeds = new Int32Array(N);
    for (let i = 0; i < N; i++) { const x = i % W, y = (i - x) / W; this.seeds[i] = (x * 7919 + y * 104729 + lv.depth * 31337) & 0x7fffffff; }
    this.visA = new Float32Array(N);
    for (let i = 0; i < N; i++) this.visA[i] = lv.visible[i];
    this.bR = new Float32Array(N); this.bG = new Float32Array(N); this.bB = new Float32Array(N); this.lm = new Float32Array(N);
    this.sR = new Float32Array(N); this.sG = new Float32Array(N); this.sB = new Float32Array(N);
    this.tf = new Float32Array(N).fill(1);
    this.staticReady = false;
    this.lc.width = W * S; this.lc.height = H * S;
    this.img = this.lctx.createImageData(W * S, H * S);
    this.vc = makeCanvas(W * VS, H * VS);
    this.vctx = this.vc.getContext('2d');
    this.vimg = this.vctx.createImageData(W * VS, H * VS);
    this.voidKey = -1;
    this.edge = new Uint8Array(N);   // tiles within the soft explored/never-seen boundary
    const B = BIOMES[lv.biome] || BIOMES.stollen;
    this.amb = rgb(B.ambient);
    const fog = rgb(B.fog);
    this.memC = [Math.min(1, fog[0] * 1.3 + 0.03), Math.min(1, fog[1] * 1.3 + 0.03), Math.min(1, fog[2] * 1.26 + 0.03)];
    this.ambLit = [Math.min(1, fog[0] * 1.4 + 0.08), Math.min(1, fog[1] * 1.4 + 0.05), Math.min(1, fog[2] * 1.32 + 0.02)];
    this.ambCss = B.ambient;
    // a new floor recentres; a rebuild of the same floor (zoom, resize) keeps the view
    if (lv !== this.camLevel) { this.camLevel = lv; this.camInit = false; this.detached = false; }
  }

  computeStatic() {
    const g = this.game, lv = g.state.level, W = lv.width, H = lv.height;
    this.mapVersion = lv.mapVersion;
    this.staticReady = true;
    const sl = g.staticLight();
    const src = [];
    for (let i = 0; i < W * H; i++) {
      const t = lv.tiles[i];
      if (t === 'brazier_lit') src.push([i % W, Math.floor(i / W), 5, C_BRAZIER, 1]);
      else if (t === 'fungus') src.push([i % W, Math.floor(i / W), 2, C_FUNGUS, 0.75]);
    }
    for (let i = 0; i < W * H; i++) {
      const v = sl[i];
      if (!v) { this.sR[i] = this.sG[i] = this.sB[i] = 0; continue; }
      const x = i % W, y = (i - x) / W;
      let r = 0, gg = 0, b = 0, wsum = 0;
      for (const s of src) {
        const dx = x - s[0], dy = y - s[1];
        if (dx > s[2] || dx < -s[2] || dy > s[2] || dy < -s[2]) continue;
        const w = falloff(Math.hypot(dx, dy), s[2]) * s[4];
        if (w <= 0) continue;
        r += s[3][0] * w; gg += s[3][1] * w; b += s[3][2] * w; wsum += w;
      }
      if (wsum > 0) { r /= wsum; gg /= wsum; b /= wsum; } else { r = C_BRAZIER[0]; gg = C_BRAZIER[1]; b = C_BRAZIER[2]; }
      // static light is a little softer than the lamp and keeps its hue
      this.sR[i] = r * v * 1.05; this.sG[i] = gg * v * 1.05; this.sB[i] = b * v * 1.05;
    }
  }

  // ------------------------------------------------------------ coordinates
  originX() { return Math.round(this.vw / 2 + this.focusX * this.dpr - (this.camX + 0.5) * this.tsd + this.shx); }
  originY() { return Math.round(this.vh / 2 + this.focusY * this.dpr - (this.camY + 0.5) * this.tsd + this.shy); }

  /** Fractional tile coordinates under client (CSS) coordinates, from the current camera (not last frame's). */
  tileFloatAtClient(cx, cy) {
    const r = this.canvas.getBoundingClientRect();
    const px = (cx - r.left) * this.dpr, py = (cy - r.top) * this.dpr;
    return { x: (px - this.originX()) / this.tsd, y: (py - this.originY()) / this.tsd };
  }
  /** Tile under client (CSS) coordinates. */
  tileAtClient(cx, cy) {
    const f = this.tileFloatAtClient(cx, cy);
    return { x: Math.floor(f.x), y: Math.floor(f.y) };
  }
  /** CSS position of a tile's top-left corner. */
  clientOfTile(x, y) {
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + (this.originX() + x * this.tsd) / this.dpr, y: r.top + (this.originY() + y * this.tsd) / this.dpr, size: this.tsd / this.dpr };
  }

  /** Should the loop draw this frame? Idle scenes redraw at ~20 fps (lamp flicker, animated tiles). */
  wantsFrame(now) {
    if (this.dirty || this.demo || !this.game || !this.lv) return true;
    const A = this.anim;
    if (A.tweens.size || A.lunges.size || A.flashes.size || A.np || A.floaters.length || A.ghosts.length || A.projectiles.length || A.rings.length || A.pending.length) return true;
    if (now < A.shakeT0 + A.shakeDur || now < A.flashT0 + A.flashDur || now < A.hurtT0 + A.hurtDur) return true;
    if (this.fading || this.lightR !== this.lightRTarget || Math.abs(this.gain - this.gainTarget) > 0.003 || Math.abs(this.lampTint - this.lampTintTarget) > 0.003) return true;
    if (Math.abs(this.focusX - this.focusXTarget) > 0.3 || Math.abs(this.focusY - this.focusYTarget) > 0.3) return true;
    if (!this.detached && this.hero && (Math.abs(this.camX - this.hero.x) > 0.002 || Math.abs(this.camY - this.hero.y) > 0.002)) return true;
    if (this.dimming > 0.001 && this.dimming < 0.99) return true;
    return now - this.lastRender >= 48;
  }

  // ------------------------------------------------------------ pinch zoom
  /** Put world tile coordinate (ax, ay) under client point (cx, cy). */
  camForAnchor(ax, ay, cx, cy) {
    const r = this.canvas.getBoundingClientRect();
    const px = (cx - r.left) * this.dpr, py = (cy - r.top) * this.dpr;
    this.camX = (this.vw / 2 + this.focusX * this.dpr - px + ax * this.tsd) / this.tsd - 0.5;
    this.camY = (this.vh / 2 + this.focusY * this.dpr - py + ay * this.tsd) / this.tsd - 0.5;
    this.clampCam();
    this.dirty = true;
  }
  pinchBegin(cx, cy) {
    if (!this.camInit || !this.lv) return false;
    this.pinchAnchor = this.tileFloatAtClient(cx, cy);
    this.pinchBase = this.ts * this.pz;
    this.detached = true;
    this.dirty = true;
    return true;
  }
  /** Continuous zoom by `scale` relative to the gesture start; the anchored map point follows (cx, cy). */
  pinchMove(scale, cx, cy) {
    if (!this.pinchAnchor) return;
    const ts = Math.max(MIN_TS, Math.min(MAX_TS, this.pinchBase * scale));
    this.pz = (ts * this.dpr) / this.cts;
    this.tsd = this.cts * this.pz;
    this.camForAnchor(this.pinchAnchor.x, this.pinchAnchor.y, cx, cy);
  }
  /** Settle on a crisp tile size (one cache rebuild). Returns the new tile size. */
  pinchEnd(cx, cy) {
    if (!this.pinchAnchor) return this.ts;
    const a = this.tileFloatAtClient(cx, cy);
    this.pinchAnchor = null;
    this.setTileSize(this.tsd / this.dpr);
    this.camForAnchor(a.x, a.y, cx, cy);
    return this.ts;
  }

  // ------------------------------------------------------------ panning
  /** Move the view by a pointer delta in CSS pixels (1:1 with the pointer). Detaches the camera from the hero. */
  panBy(dx, dy) {
    if (!this.camInit || !this.lv) return;
    this.detached = true;
    this.camX -= (dx * this.dpr) / this.tsd;
    this.camY -= (dy * this.dpr) / this.tsd;
    this.clampCam();
    this.dirty = true;
  }
  /** At most about half a screen of void beyond the map edge. */
  clampCam() {
    this.camX = Math.max(0, Math.min(this.W - 1, this.camX));
    this.camY = Math.max(0, Math.min(this.H - 1, this.camY));
  }
  /** Ease back to the hero. Returns true if the view was detached. */
  recenter() {
    if (!this.detached) return false;
    this.detached = false;
    this.camFastUntil = performance.now() + 500;
    this.dirty = true;
    return true;
  }
  /** Change zoom; while detached, keep the point under the pointer (or the view centre) in place. */
  zoomAt(ts, client) {
    if (!this.detached || !client) { this.setTileSize(ts); return; }
    const a = this.tileFloatAtClient(client.x, client.y);
    this.setTileSize(ts);
    const b = this.tileFloatAtClient(client.x, client.y);
    this.camX += a.x - b.x; this.camY += a.y - b.y;
    this.clampCam();
  }

  // ------------------------------------------------------------ frame
  frame(now) {
    const g = this.game;
    const ctx = this.ctx;
    const dt = Math.min(64, this.lastT ? now - this.lastT : 16);
    this.lastT = now;
    this.anim.update(now, dt);
    if (!g || !this.lv) { ctx.fillStyle = '#0b0d14'; ctx.fillRect(0, 0, this.vw, this.vh); return; }
    const lv = this.lv, W = this.W, H = this.H, tsd = this.tsd, cts = this.cts, pz = this.pz, anim = this.anim;
    const reduced = anim.reduced;
    this.dirty = false;
    this.lastRender = now;

    // --- hero display position & camera
    const hp = anim.pos(0, this.hero.x, this.hero.y, now);
    const hx = hp.x, hy = hp.y;
    const kc = reduced ? 1 : 1 - Math.exp(-dt / (this.demo ? 380 : now < this.camFastUntil ? 55 : 85));
    if (!this.camInit) { this.camX = hx; this.camY = hy; this.camInit = true; this.focusX = this.focusXTarget; this.focusY = this.focusYTarget; }
    else if (!this.detached || this.demo) { this.camX += (hx - this.camX) * kc; this.camY += (hy - this.camY) * kc; }
    this.focusX += (this.focusXTarget - this.focusX) * (reduced ? 1 : 1 - Math.exp(-dt / 140));
    this.focusY += (this.focusYTarget - this.focusY) * (reduced ? 1 : 1 - Math.exp(-dt / 140));
    const sh = anim.shakeOffset(now) * tsd;
    this.shx = sh ? (Math.random() - 0.5) * 2 * sh : 0;
    this.shy = sh ? (Math.random() - 0.5) * 2 * sh : 0;
    const ox = this.originX(), oy = this.originY();
    this.ox = ox; this.oy = oy;

    // --- light state animation
    const rk = 1 - Math.exp(-dt / this.lightRate);
    this.lightR += (this.lightRTarget - this.lightR) * rk;
    if (Math.abs(this.lightRTarget - this.lightR) < 0.01) { this.lightR = this.lightRTarget; this.lightRate = 350; }
    this.gain += (this.gainTarget - this.gain) * (1 - Math.exp(-dt / 500));
    this.lampTint += (this.lampTintTarget - this.lampTint) * (1 - Math.exp(-dt / 600));
    const tt = now / 1000 + this.flickSeed;
    const low = this.oilFrac < 0.25 ? (0.25 - this.oilFrac) / 0.25 : 0;
    let fl = Math.sin(tt * 7.3) * 0.5 + Math.sin(tt * 12.9 + 1.3) * 0.3 + Math.sin(tt * 23.1 + 0.4) * 0.2;
    let amp = reduced ? 0.006 : 0.014 + low * 0.05;
    if (!reduced && this.oilFrac > 0 && this.oilFrac <= 0.1) {
      // sputtering: occasional sharp dips
      const s = Math.sin(tt * 1.7) * Math.sin(tt * 2.9 + 2);
      if (s > 0.55) fl -= (s - 0.55) * 6;
    }
    this.flick = fl * amp;

    // --- visibility fade
    const vk = reduced ? 1 : 1 - Math.exp(-dt / 70);
    const visA = this.visA, vis = lv.visible;
    let fading = false;
    for (let i = 0, n = W * H; i < n; i++) {
      const tv = vis[i];
      const a = visA[i];
      if (a !== tv) { const d = tv - a; visA[i] = Math.abs(d) < 0.004 ? tv : a + d * vk; fading = true; }
    }
    this.fading = fading;

    // --- background: the biome's ambient darkness (never flat black)
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.ambCss;
    ctx.fillRect(0, 0, this.vw, this.vh);

    // --- tiles
    const x0 = Math.max(0, Math.floor(-ox / tsd) - 1), y0 = Math.max(0, Math.floor(-oy / tsd) - 1);
    const x1 = Math.min(W - 1, Math.ceil((this.vw - ox) / tsd)), y1 = Math.min(H - 1, Math.ceil((this.vh - oy) / tsd));
    this.view = [x0, y0, x1, y1];
    const tileCv = this.tileCv;
    for (let y = y0; y <= y1; y++) {
      const row = y * W, py = oy + y * tsd;
      const pyi = Math.floor(py), phi = Math.floor(py + tsd) - pyi;
      for (let x = x0; x <= x1; x++) {
        const i = row + x;
        let c = tileCv[i];
        if (!c) {
          if (!lv.explored[i]) continue;
          const kind = this.tileKind[i];
          if (!kind) continue;
          c = this.bright(getTileCanvas(kind, cts, { biome: lv.biome, seed: this.seeds[i], t: vis[i] ? tt : 0, scale: 1 }));
        }
        if (!vis[i]) c = this.memCanvas(c);
        if (pz === 1) ctx.drawImage(c, ox + x * tsd, py);
        else { const pxi = Math.floor(ox + x * tsd); ctx.drawImage(c, pxi, pyi, Math.floor(ox + (x + 1) * tsd) - pxi, phi); } // live pinch: snapped edges, no seams
      }
    }

    // --- items
    for (const it of this.items) {
      if (it.x < x0 || it.x > x1 || it.y < y0 || it.y > y1) continue;
      const c = this.bright(getSpriteCanvas(it.v.sprite, cts, { appearance: it.v.tint || undefined, scale: 1 }));
      ctx.globalAlpha = it.mem ? 0.75 : 1;
      this.blit(c, ox + it.x * tsd, oy + it.y * tsd - (c.overTop || 0) * tsd);
    }
    ctx.globalAlpha = 1;

    // --- creatures (sorted by y)
    const ents = this.ents;
    ents.length = 0;
    for (const m of this.monsters) {
      if (m.detectedOnly) continue;
      const p = anim.pos(m.uid, m.x, m.y, now);
      ents.push({ m, x: p.x, y: p.y, hero: false });
    }
    if (!this.heroHidden) ents.push({ m: null, x: hx, y: hy, hero: true });
    ents.sort((a, b) => a.y - b.y);
    for (const g2 of anim.ghosts) {
      const k = (now - g2.t0) / g2.dur;
      if (k < 0) { ents.push({ ghost: g2, x: g2.x, y: g2.y, a: 1 }); continue; }
      ents.push({ ghost: g2, x: g2.x, y: g2.y + k * 0.1, a: 1 - k });
    }
    for (const e of ents) {
      let c;
      if (e.hero) { e.c = getSpriteCanvas('hero', cts, { t: tt, facing: this.heroFacing, scale: 1 }); continue; } // drawn after the light pass
      if (e.ghost) c = getSpriteCanvas(e.ghost.id, cts, { t: 0, facing: e.ghost.facing, scale: 1 });
      else {
        const m = e.m;
        c = getSpriteCanvas(m.id, cts, { t: tt, facing: hx < m.x - 0.01 ? -1 : 1, dormant: m.ai === 'dormant', scale: 1 });
      }
      e.c = c;
      const sx = ox + e.x * tsd, sy = oy + e.y * tsd - (c.overTop || 0) * tsd;
      const a = (c.alpha || 1) * (e.ghost ? e.a : 1);
      if (a !== 1) ctx.globalAlpha = a;
      this.blit(this.bright(c), sx, sy);
      if (a !== 1) ctx.globalAlpha = 1;
    }

    // --- light map
    this.computeLight(now, hx, hy);
    // one multiply pass, clipped to the visible tiles (the only full-screen blend per frame)
    ctx.globalCompositeOperation = 'multiply';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'low';
    {
      const lx0 = Math.max(0, x0 - 1), ly0 = Math.max(0, y0 - 1), lx1 = Math.min(W, x1 + 2), ly1 = Math.min(H, y1 + 2);
      ctx.drawImage(this.lc, lx0 * S, ly0 * S, (lx1 - lx0) * S, (ly1 - ly0) * S, ox + lx0 * tsd, oy + ly0 * tsd, (lx1 - lx0) * tsd, (ly1 - ly0) * tsd);
      // soft edge to the never-seen dark: source-over, only along the boundary (one strip per run of edge tiles)
      ctx.globalCompositeOperation = 'source-over';
      const ed = this.edge, vc = this.vc;
      for (let y = ly0; y < ly1; y++) {
        const row = y * W;
        for (let x = lx0; x < lx1; x++) {
          if (!ed[row + x]) continue;
          let e2 = x + 1;
          while (e2 < lx1 && ed[row + e2]) e2++;
          const dx0 = Math.floor(ox + x * tsd), dy0 = Math.floor(oy + y * tsd);
          ctx.drawImage(vc, x * VS, y * VS, (e2 - x) * VS, VS, dx0, dy0, Math.floor(ox + e2 * tsd) - dx0, Math.floor(oy + (y + 1) * tsd) - dy0);
          x = e2;
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over';

    // --- additive glows
    ctx.globalCompositeOperation = 'lighter';
    const gain = this.gain * (1 - this.dimming);
    if (!this.heroHidden && this.lightR > 0.2) {
      const r = (this.lightR * 0.8 * (1 + this.flick) + 1.2) * tsd;
      ctx.globalAlpha = Math.min(1, 0.12 * gain + this.lampTint * 0.02);
      ctx.drawImage(this.glow.lamp, ox + (hx + 0.5) * tsd - r, oy + (hy + 0.42) * tsd - r, r * 2, r * 2);
      const r2 = tsd * 0.9;
      ctx.globalAlpha = 0.22 * gain;
      ctx.drawImage(this.glow.lamp, ox + (hx + 0.66) * tsd - r2, oy + (hy + 0.6) * tsd - r2, r2 * 2, r2 * 2);
    }
    for (const i of this.glows) {
      const a = visA[i];
      if (a <= 0.02) continue;
      const x = i % W, y = (i - x) / W;
      if (x < x0 - 3 || x > x1 + 3 || y < y0 - 3 || y > y1 + 3) continue;
      const kind = this.tileKind[i];
      if (kind === 'brazier_lit') {
        const f = 1 + Math.sin(tt * 9 + i) * 0.04 + Math.sin(tt * 17 + i * 3) * 0.03;
        const r = tsd * 3.2 * f;
        ctx.globalAlpha = 0.2 * a;
        ctx.drawImage(this.glow.brazier, ox + (x + 0.5) * tsd - r, oy + (y + 0.4) * tsd - r, r * 2, r * 2);
      } else if (kind === 'fungus') {
        const r = tsd * 1.5 * (1 + Math.sin(tt * 1.6 + i) * 0.06);
        ctx.globalAlpha = 0.11 * a;
        ctx.drawImage(this.glow.fungus, ox + (x + 0.5) * tsd - r, oy + (y + 0.5) * tsd - r, r * 2, r * 2);
      }
    }
    for (const it of this.items) {
      if (!it.sun || it.mem) continue;
      const r = tsd * 2.2 * (1 + Math.sin(tt * 2.2) * 0.08);
      ctx.globalAlpha = 0.35;
      ctx.drawImage(this.glow.sun, ox + (it.x + 0.5) * tsd - r, oy + (it.y + 0.5) * tsd - r, r * 2, r * 2);
    }
    for (const m of this.monsters) {
      if (m.detectedOnly) continue;
      const tex = m.id === 'grubengeist' ? this.glow.ghost : m.id === 'lichtfresser' ? this.glow.corona : m.id === 'dochtmotte' ? this.glow.lamp : null;
      if (!tex) continue;
      const p = anim.pos(m.uid, m.x, m.y, now);
      const r = tsd * (m.id === 'lichtfresser' ? 2.4 : 1.1);
      ctx.globalAlpha = m.id === 'lichtfresser' ? 0.3 : 0.14;
      ctx.drawImage(tex, ox + (p.x + 0.5) * tsd - r, oy + (p.y + 0.4) * tsd - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // --- the lantern bearer is the light: drawn unshaded on top of the light map
    for (const e of ents) {
      if (!e.hero) continue;
      this.blit(e.c, ox + e.x * tsd, oy + e.y * tsd - (e.c.overTop || 0) * tsd);
    }
    // --- creature overlays: lift (seen creatures stay readable in dim light), hit flash, health bars, sleep marks
    for (const e of ents) {
      if (e.ghost) continue;
      if (!e.hero) {
        const c = e.c;
        ctx.globalAlpha = 0.32 * (c.alpha || 1);
        this.blit(c, ox + e.x * tsd, oy + e.y * tsd - (c.overTop || 0) * tsd);
        ctx.globalAlpha = 1;
      }
      const uid = e.hero ? 0 : e.m.uid;
      const fa = anim.flashAmount(uid, now);
      if (fa > 0) {
        ctx.globalAlpha = fa * 0.85;
        this.blit(this.whiteOf(e.c, e.hero ? '#ffe7c4' : '#ffffff'), ox + e.x * tsd, oy + e.y * tsd - (e.c.overTop || 0) * tsd);
        ctx.globalAlpha = 1;
      }
      if (e.hero) continue;
      const m = e.m;
      if (m.hpFraction < 1 && m.ai !== 'dormant') {
        const bw = Math.round(tsd * 0.62), bh = Math.max(3, Math.round(tsd * 0.065));
        const bx = Math.round(ox + (e.x + 0.5) * tsd - bw / 2), by = Math.round(oy + (e.y + 1) * tsd - bh - 1);
        ctx.fillStyle = 'rgba(10,12,20,0.8)';
        ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
        ctx.fillStyle = m.hpFraction > 0.5 ? '#d9c08a' : m.hpFraction > 0.25 ? '#ffb454' : '#e2543a';
        ctx.fillRect(bx, by, Math.max(1, Math.round(bw * m.hpFraction)), bh);
      }
      if (m.ai === 'asleep') {
        const k = ((now / 1400) + m.uid * 0.37) % 1;
        ctx.globalAlpha = Math.sin(k * Math.PI) * 0.9;
        ctx.fillStyle = '#b9c4d2';
        ctx.font = `italic 600 ${Math.round(tsd * 0.26)}px ${FONT_UI}`;
        ctx.fillText('z', ox + (e.x + 0.72 + k * 0.12) * tsd, oy + (e.y + 0.22 - k * 0.22) * tsd);
        ctx.globalAlpha = 1;
      }
    }
    for (const m of this.monsters) {
      if (!m.detectedOnly) continue;
      const pulse = 0.5 + 0.5 * Math.sin(now / 300 + m.uid);
      const cx = ox + (m.x + 0.5) * tsd, cy = oy + (m.y + 0.5) * tsd;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.25 + pulse * 0.25;
      const r = tsd * 0.55;
      ctx.drawImage(this.glow.ghost, cx - r, cy - r, r * 2, r * 2);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.5 + pulse * 0.3;
      ctx.strokeStyle = '#a8eadf';
      ctx.lineWidth = Math.max(1, tsd / 24);
      ctx.beginPath(); ctx.arc(cx, cy, tsd * 0.18, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // --- rings, projectiles, particles
    this.drawRings(now, ox, oy);
    this.drawProjectiles(now, ox, oy);
    this.drawParticles(ox, oy);

    // --- interaction overlays
    if (!this.demo) this.drawOverlays(now, ox, oy);

    // --- floating numbers
    this.drawFloaters(now, ox, oy);

    // --- screen space effects
    ctx.globalAlpha = 1;
    const vig = this.demo ? 1 : 0.55 + this.lampTint * 0.35 + this.dimming * 0.4;
    const vo = Math.round(Math.min(1, vig) * 50) / 50;
    if (vo !== this.vigOpacity && this.vigEl) { this.vigOpacity = vo; this.vigEl.style.opacity = String(vo); }
    let hurt = anim.hurtActive(now);
    if (this.lowHp && !reduced) hurt = Math.max(hurt, 0.12 + 0.1 * Math.sin(now / 420));
    else if (this.lowHp) hurt = Math.max(hurt, 0.14);
    if (hurt > 0.005) { ctx.globalAlpha = Math.min(0.9, hurt); ctx.fillStyle = this.hurtGrad; ctx.fillRect(0, 0, this.vw, this.vh); }
    const fk = (now - anim.flashT0) / (anim.flashDur || 1);
    if (fk >= 0 && fk < 1) { ctx.globalAlpha = anim.flashAlpha * (1 - fk) * (1 - fk); ctx.fillStyle = anim.flashColor; ctx.fillRect(0, 0, this.vw, this.vh); }
    if (this.dimming > 0) { ctx.globalAlpha = this.dimming * 0.55; ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, this.vw, this.vh); }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  computeLight(now, hx, hy) {
    const W = this.W, H = this.H, N = W * H, lv = this.lv;
    const visA = this.visA, expl = lv.explored;
    const bR = this.bR, bG = this.bG, bB = this.bB, lm = this.lm;
    const amb = this.amb, mem = this.memC, al = this.ambLit;
    const sR = this.sR, sG = this.sG, sB = this.sB, tf = this.tf;
    const dim = 1 - this.dimming;
    // never-seen tiles show the ambient-coloured backdrop untouched (neutral light 1, stored pre-scaled by K);
    // next to explored tiles the interpolated light darkens it a little, as before
    const vR = K, vG = K, vB = K;
    for (let i = 0; i < N; i++) {
      const v = visA[i];
      let r, g, b;
      // never-seen tiles are not drawn; the feathered void mask paints them, so they carry the memory value (no bright rim)
      if (!expl[i]) { bR[i] = vR; bG[i] = vG; bB[i] = vB; lm[i] = 0; continue; }
      r = mem[0]; g = mem[1]; b = mem[2];
      const f = tf[i];
      if (v > 0) {
        const lr = (al[0] + sR[i]) * f, lg = (al[1] + sG[i]) * f, lb = (al[2] + sB[i]) * f;
        r += (lr - r) * v; g += (lg - g) * v; b += (lb - b) * v;
      }
      bR[i] = r; bG[i] = g; bB[i] = b; lm[i] = v * dim * f;
    }
    // lamp colour (warmer and redder as the oil runs out)
    const tint = this.lampTint;
    const lampR = mix(C_LAMP[0], C_EMBER[0], tint * 0.6), lampG = mix(C_LAMP[1], C_EMBER[1], tint * 0.6), lampB = mix(C_LAMP[2], C_EMBER[2], tint * 0.6);
    const R = Math.max(0, this.lightR * (1 + this.flick));
    const gain = this.gain * (1 + this.flick * 1.5) * 1.06;
    const cx = hx + 0.5, cy = hy + 0.5;
    const data = this.img.data, inv = 255 / K;
    const boost = 0.34 * this.gain * (1 - this.dimming);
    const SW = W * S, SH = H * S;
    const rr = (R + 0.5) * (R + 0.5);
    for (let sy = 0; sy < SH; sy++) {
      const ty = (sy + 0.5) / S;            // tile coords of the sample
      const fy = ty - 0.5;
      let y0 = Math.floor(fy), wy = fy - y0;
      let y1 = y0 + 1;
      if (y0 < 0) { y0 = 0; wy = 0; } if (y1 >= H) y1 = H - 1;
      const dy = ty - cy, dy2 = dy * dy;
      const r0 = y0 * W, r1 = y1 * W;
      let o = sy * SW * 4;
      for (let sx = 0; sx < SW; sx++, o += 4) {
        const tx = (sx + 0.5) / S;
        const fx = tx - 0.5;
        let x0 = Math.floor(fx), wx = fx - x0;
        let x1 = x0 + 1;
        if (x0 < 0) { x0 = 0; wx = 0; } if (x1 >= W) x1 = W - 1;
        const a = r0 + x0, b2 = r0 + x1, c = r1 + x0, d = r1 + x1;
        const w00 = (1 - wx) * (1 - wy), w10 = wx * (1 - wy), w01 = (1 - wx) * wy, w11 = wx * wy;
        let r = bR[a] * w00 + bR[b2] * w10 + bR[c] * w01 + bR[d] * w11;
        let g = bG[a] * w00 + bG[b2] * w10 + bG[c] * w01 + bG[d] * w11;
        let b = bB[a] * w00 + bB[b2] * w10 + bB[c] * w01 + bB[d] * w11;
        const m = lm[a] * w00 + lm[b2] * w10 + lm[c] * w01 + lm[d] * w11;
        let bo = 0;
        // never-seen tiles carry a neutral K (they are drawn without headroom), so clamp only what the lamp adds
        const base = r > g ? (r > b ? r : b) : (g > b ? g : b);
        const lim = base > 1 ? base : 1;
        if (m > 0.001) {
          const dx = tx - cx;
          const d2 = dx * dx + dy2;
          if (d2 < rr) {
            const l = 1 - d2 / rr;
            const li = Math.pow(l, 1.55) * gain * m;
            const k = l * l;
            bo = k * l * boost * m;
            r += li * (lampR + (C_CORE[0] - lampR) * k);
            g += li * (lampG + (C_CORE[1] - lampG) * k);
            b += li * (lampB + (C_CORE[2] - lampB) * k);
          }
        }
        // hue-preserving clamp at 1, then the lamp boost (what a colour-dodge pass did) uses the K headroom
        let mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
        if (mx > lim) { const k = lim / mx; r *= k; g *= k; b *= k; }
        if (bo > 0) {
          r /= 1 - bo; g /= 1 - bo * 0.84; b /= 1 - bo * 0.59;
          mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
          if (mx > K) { const k = K / mx; r *= k; g *= k; b *= k; }
        }
        data[o] = r * inv; data[o + 1] = g * inv; data[o + 2] = b * inv; data[o + 3] = 255;
      }
    }
    this.lctx.putImageData(this.img, 0, 0);
  }

  /** Feathered mask that paints never-seen space in the ambient darkness, swallowing the explored edge softly. */
  updateVoid() {
    const lv = this.lv, W = this.W, H = this.H, ex = lv.explored;
    let n = 0;
    for (let i = 0; i < W * H; i++) n += ex[i];
    if (n === this.voidKey) return;
    this.voidKey = n;
    const ar = Math.round(this.amb[0] * 255), ag = Math.round(this.amb[1] * 255), ab = Math.round(this.amb[2] * 255);
    const d = this.vimg.data, SW = W * VS, SH = H * VS;
    for (let sy = 0; sy < SH; sy++) {
      const fy = (sy + 0.5) / VS - 0.5;
      let y0 = Math.floor(fy), wy = fy - y0, y1 = y0 + 1;
      if (y0 < 0) { y0 = 0; wy = 0; } if (y1 >= H) y1 = H - 1;
      for (let sx = 0; sx < SW; sx++) {
        const fx = (sx + 0.5) / VS - 0.5;
        let x0 = Math.floor(fx), wx = fx - x0, x1 = x0 + 1;
        if (x0 < 0) { x0 = 0; wx = 0; } if (x1 >= W) x1 = W - 1;
        const e = ex[y0 * W + x0] * (1 - wx) * (1 - wy) + ex[y0 * W + x1] * wx * (1 - wy) + ex[y1 * W + x0] * (1 - wx) * wy + ex[y1 * W + x1] * wx * wy;
        // smoothstep: fully dark below 0.2, fully clear above 0.9
        let t = (e - 0.2) / 0.7; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const a = 1 - t * t * (3 - 2 * t);
        const o = (sy * SW + sx) * 4;
        d[o] = ar; d[o + 1] = ag; d[o + 2] = ab; d[o + 3] = a * 255;
      }
    }
    this.vctx.putImageData(this.vimg, 0, 0);
    // tiles where the mask is neither fully clear nor fully covered by the light map's own darkness
    const ed = this.edge;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let mix = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && ex[ny * W + nx] !== ex[y * W + x]) mix = 1;
      }
      ed[y * W + x] = mix;
    }
  }

  /** Copy of a canvas with its colour multiplied by K (alpha untouched), for drawing under the light map. */
  bright(c) {
    let m = this.brightMap.get(c);
    if (m) return m;
    m = makeCanvas(c.width, c.height);
    const g = m.getContext('2d', { willReadFrequently: true });
    g.drawImage(c, 0, 0);
    try {
      const d = g.getImageData(0, 0, m.width, m.height), p = d.data;
      for (let i = 0; i < p.length; i += 4) { p[i] *= K; p[i + 1] *= K; p[i + 2] *= K; }
      g.putImageData(d, 0, 0);
    } catch { /* keep the plain copy */ }
    m.overTop = c.overTop; m.alpha = c.alpha;
    this.brightMap.set(c, m);
    return m;
  }

  /** drawImage that follows the live pinch scale. */
  blit(c, x, y) {
    if (this.pz === 1) this.ctx.drawImage(c, x, y);
    else this.ctx.drawImage(c, x, y, c.width * this.pz, c.height * this.pz);
  }

  /** Wall tile with its top darkened, so rooms get a clear outline under lamp light. */
  shadedWall(c, face) {
    const key = face ? this.shadeF : this.shadeT;
    let m = key.get(c);
    if (m) return m;
    m = makeCanvas(c.width, c.height);
    const g = m.getContext('2d');
    g.drawImage(c, 0, 0);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = '#7d778e';
    // the art draws the wall top in the upper 42 % when a south face is shown
    g.fillRect(0, 0, c.width, face ? Math.round(c.height * 0.42) : c.height);
    key.set(c, m);
    return m;
  }

  memCanvas(c) {
    let m = this.desat.get(c);
    if (m) return m;
    m = makeCanvas(c.width, c.height);
    const g = m.getContext('2d', { willReadFrequently: true });
    g.drawImage(c, 0, 0);
    try {
      const d = g.getImageData(0, 0, m.width, m.height);
      const p = d.data;
      for (let i = 0; i < p.length; i += 4) {
        const l = p[i] * 0.3 + p[i + 1] * 0.55 + p[i + 2] * 0.15;
        // desaturate, and stretch contrast a little so walls and floors stay apart in the dim memory light
        // (tile canvases arrive pre-brightened by K; the curve is applied in unbrightened units)
        const L = Math.max(0, (l / K - 60) * 1.25 + 60) * K;
        p[i] = L + (p[i] - l) * 0.28; p[i + 1] = L + (p[i + 1] - l) * 0.28; p[i + 2] = L + (p[i + 2] - l) * 0.28 + 6 * K;
      }
      g.putImageData(d, 0, 0);
    } catch { /* tainted canvas cannot happen here; keep the copy */ }
    this.desat.set(c, m);
    return m;
  }

  whiteOf(c, color) {
    let w = this.white.get(c);
    if (w) return w;
    w = makeCanvas(c.width, c.height);
    const g = w.getContext('2d');
    g.drawImage(c, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color; g.fillRect(0, 0, w.width, w.height);
    this.white.set(c, w);
    return w;
  }

  drawRings(now, ox, oy) {
    const ctx = this.ctx, tsd = this.tsd;
    for (const r of this.anim.rings) {
      const k = (now - r.t0) / r.dur;
      if (k < 0 || k >= 1) continue;
      const e = 1 - (1 - k) * (1 - k);
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = Math.max(1, r.width * tsd * (1 - k * 0.6));
      ctx.beginPath();
      ctx.arc(ox + (r.x + 0.5) * tsd, oy + (r.y + 0.5) * tsd, Math.max(0.1, r.r * e * tsd), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawProjectiles(now, ox, oy) {
    const ctx = this.ctx, tsd = this.tsd;
    for (const p of this.anim.projectiles) {
      const k = (now - p.t0) / p.dur;
      if (k < 0 || k >= 1) continue;
      const pts = p.pts, n = pts.length - 1;
      const at = (f) => {
        const u = Math.max(0, Math.min(n, f * n)), i = Math.min(n - 1, Math.floor(u)), w = u - i;
        if (n <= 0) return [pts[0].x, pts[0].y];
        return [pts[i].x + (pts[i + 1].x - pts[i].x) * w, pts[i].y + (pts[i + 1].y - pts[i].y) * w];
      };
      const toS = (q) => [ox + (q[0] + 0.5) * tsd, oy + (q[1] + 0.5) * tsd];
      if (p.kind === 'blitz') {
        // the whole bolt flickers along the path
        ctx.globalCompositeOperation = 'lighter';
        for (let pass = 0; pass < 2; pass++) {
          ctx.globalAlpha = (1 - k) * (pass ? 1 : 0.4);
          ctx.strokeStyle = pass ? '#f4f8ff' : '#7fb8ff';
          ctx.lineWidth = Math.max(1, tsd * (pass ? 0.05 : 0.16));
          ctx.beginPath();
          for (let i = 0; i <= n; i++) {
            const [sx, sy] = toS([pts[i].x, pts[i].y]);
            const j = i === 0 || i === n ? 0 : (Math.sin(now * 0.07 + i * 3.1) * 0.22) * tsd;
            if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx + j, sy - j);
          }
          ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
        continue;
      }
      const head = toS(at(k)), tail = toS(at(Math.max(0, k - 0.18)));
      if (p.kind === 'wurfmesser') {
        const c = getSpriteCanvas('wurfmesser', Math.round(cts * 0.6), { scale: 1 });
        ctx.save();
        ctx.translate(head[0], head[1]);
        ctx.rotate(k * 14);
        ctx.drawImage(c, -c.width / 2, -c.height / 2);
        ctx.restore();
        continue;
      }
      const col = { frost: '#9fe3ff', verbannung: '#c49bff', glutball: '#ff8c42', feuerbolzen: '#ff7a3a' }[p.kind] || '#ffb454';
      const tex = p.kind === 'frost' ? this.glow.ghost : p.kind === 'verbannung' ? this.glow.corona : this.glow.brazier;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = col;
      ctx.lineCap = 'round';
      ctx.lineWidth = tsd * 0.14;
      ctx.beginPath(); ctx.moveTo(tail[0], tail[1]); ctx.lineTo(head[0], head[1]); ctx.stroke();
      const r = tsd * 0.55;
      ctx.globalAlpha = 0.9;
      ctx.drawImage(tex, head[0] - r, head[1] - r, r * 2, r * 2);
      ctx.fillStyle = '#fff6e0';
      ctx.beginPath(); ctx.arc(head[0], head[1], tsd * 0.08, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  drawParticles(ox, oy) {
    const a = this.anim, ctx = this.ctx, tsd = this.tsd;
    if (!a.np) return;
    let mode = -1;
    for (let i = 0; i < a.np; i++) {
      const add = a.add[i];
      if (add !== mode) { ctx.globalCompositeOperation = add ? 'lighter' : 'source-over'; mode = add; }
      const k = a.life[i] / a.maxLife[i];
      ctx.globalAlpha = k < 0.5 ? k * 2 : 1;
      ctx.fillStyle = a.colors[a.col[i]];
      const s = Math.max(1.5, a.size[i] * tsd * (0.5 + k * 0.5));
      ctx.fillRect(ox + (a.px[i] + 0.5) * tsd - s / 2, oy + (a.py[i] + 0.5) * tsd - s / 2, s, s);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  drawOverlays(now, ox, oy) {
    const ctx = this.ctx, tsd = this.tsd, dpr = this.dpr;
    const T = this.targeting;
    if (T) {
      // trajectory
      if (T.line && T.line.length) {
        ctx.fillStyle = T.valid ? '#ffb454' : '#e2543a';
        for (let i = 0; i < T.line.length; i++) {
          const p = T.line[i];
          ctx.globalAlpha = 0.85 - (i / T.line.length) * 0.35;
          ctx.beginPath(); ctx.arc(ox + (p.x + 0.5) * tsd, oy + (p.y + 0.5) * tsd, Math.max(2, tsd * 0.07), 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      for (const c of T.candidates) {
        ctx.strokeStyle = 'rgba(255,180,84,0.55)';
        ctx.lineWidth = Math.max(1.5, 1.5 * dpr);
        ctx.setLineDash([4 * dpr, 4 * dpr]);
        ctx.beginPath(); ctx.arc(ox + (c.x + 0.5) * tsd, oy + (c.y + 0.55) * tsd, tsd * 0.48, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
      const c = T.cursor;
      if (c) {
        const pulse = 0.75 + 0.25 * Math.sin(now / 160);
        const x = ox + c.x * tsd, y = oy + c.y * tsd, s = tsd, k = s * 0.28;
        ctx.strokeStyle = T.valid ? '#ffb454' : '#e2543a';
        ctx.globalAlpha = pulse;
        ctx.lineWidth = Math.max(2, 2 * dpr);
        ctx.beginPath();
        ctx.moveTo(x, y + k); ctx.lineTo(x, y); ctx.lineTo(x + k, y);
        ctx.moveTo(x + s - k, y); ctx.lineTo(x + s, y); ctx.lineTo(x + s, y + k);
        ctx.moveTo(x + s, y + s - k); ctx.lineTo(x + s, y + s); ctx.lineTo(x + s - k, y + s);
        ctx.moveTo(x + k, y + s); ctx.lineTo(x, y + s); ctx.lineTo(x, y + s - k);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      return;
    }
    if (this.path && this.path.length) {
      ctx.fillStyle = '#ffd89a';
      const n = this.path.length;
      for (let i = 0; i < n; i++) {
        const p = this.path[i];
        const last = i === n - 1;
        ctx.globalAlpha = last ? 0.9 : 0.55;
        ctx.beginPath();
        ctx.arc(ox + (p.x + 0.5) * tsd, oy + (p.y + 0.5) * tsd, Math.max(2, tsd * (last ? 0.1 : 0.06)), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    const hv = this.hover;
    if (hv && hv.x >= 0 && hv.y >= 0 && hv.x < this.W && hv.y < this.H && this.lv.explored[hv.y * this.W + hv.x]) {
      const x = ox + hv.x * tsd, y = oy + hv.y * tsd;
      ctx.strokeStyle = 'rgba(232,220,192,0.55)';
      ctx.lineWidth = Math.max(1, dpr);
      ctx.strokeRect(x + 0.5 * dpr, y + 0.5 * dpr, tsd - dpr, tsd - dpr);
    }
  }

  drawFloaters(now, ox, oy) {
    const fl = this.anim.floaters;
    if (!fl.length) return;
    const ctx = this.ctx, tsd = this.tsd, dpr = this.dpr;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const f of fl) {
      const k = (now - f.t0) / f.dur;
      if (k < 0 || k >= 1) continue;
      const size = Math.round((f.big ? 17 : 14) * dpr * Math.min(1.25, Math.max(0.85, this.ts / 48)) * (k < 0.12 ? 0.8 + k * 1.7 : 1));
      ctx.font = `700 ${size}px ${FONT_UI}`;
      const x = ox + (f.x + 0.5) * tsd, y = oy + (f.y + 0.15) * tsd - f.rise * k * tsd * 0.9;
      ctx.globalAlpha = k > 0.6 ? (1 - k) / 0.4 : 1;
      ctx.lineWidth = 3 * dpr;
      ctx.strokeStyle = 'rgba(8,10,18,0.85)';
      ctx.strokeText(f.text, x, y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, x, y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }
}
