// Minimap: explored layout, hero, stairs, visible monsters and items.
// Redrawn only after a turn; clicking travels to the picked tile.
import { h } from './dom.js';
import { BIOMES } from '../art/index.js';

export class Minimap {
  constructor(app) {
    this.app = app;
    this.cv = h('canvas.minimap-cv', { 'aria-label': 'Übersichtskarte', role: 'img' });
    this.dot = h('span.mm-hero', { 'aria-hidden': 'true' });
    this.el = h('div.minimap', this.cv, this.dot);
    this.cv.addEventListener('click', (e) => this.onClick(e));
    this.k = 3;
  }

  get game() { return this.app.session?.game; }

  /** Throttled redraw (travel and explore may call this ~25 times a second). */
  update() {
    if (this.pending) return;
    const wait = Math.max(0, 110 - (performance.now() - (this.lastDraw || 0)));
    this.pending = setTimeout(() => { this.pending = 0; this.lastDraw = performance.now(); this.draw(); }, wait);
  }

  draw() {
    const g = this.game;
    if (!g || this.el.hidden) return;
    const lv = g.state.level, W = lv.width, H = lv.height;
    const k = this.app.narrow ? 2 : 3;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const cw = W * k, ch = H * k;
    if (this.cv.width !== Math.round(cw * dpr) || this.k !== k) {
      this.k = k;
      this.cv.width = Math.round(cw * dpr); this.cv.height = Math.round(ch * dpr);
      this.cv.style.width = cw + 'px'; this.cv.style.height = ch + 'px';
    }
    const c = this.cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);
    const B = BIOMES[lv.biome] || BIOMES.stollen;
    const COL = {
      wall: B.topRim, floor: B.floorDk, door_closed: '#8a5a33', door_open: '#8a5a33', stairs_down: '#ffb454',
      brazier_lit: '#ff8c42', brazier_out: '#6d7a8e', fungus: '#58c2a5',
    };
    for (let i = 0; i < W * H; i++) {
      if (!lv.explored[i]) continue;
      const t = lv.memTiles[i];
      const x = i % W, y = (i - x) / W;
      c.globalAlpha = lv.visible[i] ? 1 : 0.62;
      c.fillStyle = COL[t] || B.floorDk;
      if (t === 'wall') { c.fillRect(x * k, y * k, k, k); continue; }
      c.fillRect(x * k, y * k, k, k);
      if (lv.visible[i] && t !== 'stairs_down') { c.globalAlpha = 0.18 * lv.light[i]; c.fillStyle = '#ffb454'; c.fillRect(x * k, y * k, k, k); }
    }
    c.globalAlpha = 1;
    for (const t of lv.traps) if (!t.hidden) { c.fillStyle = '#c49bff'; c.fillRect(t.x * k, t.y * k, k, k); }
    for (const [key, list] of Object.entries(lv.memItems)) {
      if (!list.length) continue;
      const i = +key, x = i % W, y = Math.floor(i / W);
      c.fillStyle = list.some((it) => it.cat === 'gold') ? '#f2c14e' : '#e8dcc0';
      c.fillRect(x * k + k / 4, y * k + k / 4, k / 2 + 0.5, k / 2 + 0.5);
    }
    for (const it of g.visibleItems()) {
      c.fillStyle = it.cat === 'gold' ? '#f2c14e' : '#e8dcc0';
      c.fillRect(it.x * k + k / 4, it.y * k + k / 4, k / 2 + 0.5, k / 2 + 0.5);
    }
    if (lv.stairs && lv.explored[lv.stairs.y * W + lv.stairs.x]) {
      c.strokeStyle = '#ffb454'; c.lineWidth = 1;
      c.strokeRect(lv.stairs.x * k - 1.5, lv.stairs.y * k - 1.5, k + 3, k + 3);
    }
    for (const m of g.visibleMonsters()) {
      c.fillStyle = m.detectedOnly ? '#a8eadf' : '#e2543a';
      c.beginPath(); c.arc((m.x + 0.5) * k, (m.y + 0.5) * k, k * 0.62, 0, Math.PI * 2); c.fill();
    }
    const p = g.state.player;
    this.dot.style.transform = `translate(${(p.x + 0.5) * k}px, ${(p.y + 0.5) * k}px)`;
  }

  onClick(e) {
    const s = this.app.session;
    if (!s || s.ended) return;
    const r = this.cv.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / this.k), y = Math.floor((e.clientY - r.top) / this.k);
    const lv = s.game.state.level;
    if (x < 0 || y < 0 || x >= lv.width || y >= lv.height || !lv.explored[y * lv.width + x]) return;
    s.startTravel(x, y);
  }
}
