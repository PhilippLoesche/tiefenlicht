// Animation state: entity tweens, lunges, hit flashes, floating numbers,
// projectiles, particles and screen effects. Everything is in tile units and
// performance.now() milliseconds. Nothing here blocks input: the session calls
// fastForward() before acting, which completes everything positional at once.

const MAXP = 900;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const easeOut = (k) => 1 - (1 - k) * (1 - k);
export const easeInOut = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

export class Anim {
  constructor() {
    this.reduced = false;
    this.tweens = new Map();     // uid -> {fx, fy, tx, ty, t0, dur}
    this.lunges = new Map();     // uid -> {dx, dy, t0, dur}
    this.flashes = new Map();    // uid -> {t0, dur}
    this.ghosts = [];            // dying monsters {id, x, y, t0, dur, facing}
    this.floaters = [];          // {x, y, text, color, t0, dur, big}
    this.projectiles = [];       // {kind, pts, t0, dur}
    this.rings = [];             // expanding rings {x, y, t0, dur, r, color, width}
    this.pending = [];           // {at, fn}
    this.shakeT0 = 0; this.shakeDur = 0; this.shakeMag = 0;
    this.flashT0 = 0; this.flashDur = 0; this.flashColor = '#fff'; this.flashAlpha = 0;
    this.hurtT0 = 0; this.hurtDur = 0; this.hurtAlpha = 0;
    // particle pool (struct of arrays, no per-frame allocation)
    this.np = 0;
    this.px = new Float32Array(MAXP); this.py = new Float32Array(MAXP);
    this.vx = new Float32Array(MAXP); this.vy = new Float32Array(MAXP);
    this.life = new Float32Array(MAXP); this.maxLife = new Float32Array(MAXP);
    this.size = new Float32Array(MAXP); this.grav = new Float32Array(MAXP);
    this.drag = new Float32Array(MAXP);
    this.col = new Uint8Array(MAXP); this.add = new Uint8Array(MAXP);
    this.colors = [];
    this.colorIdx = new Map();
    this._pos = { x: 0, y: 0 };
  }

  colorIndex(c) {
    let i = this.colorIdx.get(c);
    if (i == null) { i = this.colors.length; this.colors.push(c); this.colorIdx.set(c, i); }
    return i;
  }

  // ------------------------------------------------------------ scheduling
  at(time, fn) { this.pending.push({ at: time, fn }); }

  moveEntity(uid, fx, fy, tx, ty, t0, dur) {
    if (this.reduced) dur = Math.min(dur, 50);
    this.tweens.set(uid, { fx, fy, tx, ty, t0, dur });
  }
  lunge(uid, dx, dy, t0, dur = 130) {
    const l = Math.hypot(dx, dy) || 1;
    this.lunges.set(uid, { dx: dx / l, dy: dy / l, t0, dur: this.reduced ? 60 : dur });
  }
  flash(uid, t0, dur = 170) { this.flashes.set(uid, { t0, dur }); }
  ghost(id, x, y, t0, facing = 1, dur = 420) { this.ghosts.push({ id, x, y, t0, dur, facing }); }
  floater(x, y, text, color, t0, opts = {}) {
    // stack floaters that start close together on the same tile
    let stack = 0;
    for (const f of this.floaters) if (Math.abs(f.x - x) < 0.5 && Math.abs(f.y0 - y) < 0.5 && Math.abs(f.t0 - t0) < 350) stack++;
    this.floaters.push({ x, y: y - stack * 0.32, y0: y, text, color, t0, dur: opts.dur || 900, big: !!opts.big, rise: opts.rise ?? 0.9 });
    if (this.floaters.length > 40) this.floaters.shift();
  }
  projectile(kind, pts, t0, dur) { this.projectiles.push({ kind, pts, t0, dur }); }
  ring(x, y, t0, r, color, dur = 450, width = 0.12) { this.rings.push({ x, y, t0, dur, r, color, width }); }
  shake(mag, t0, dur = 220) {
    if (this.reduced) return;
    if (t0 + dur > this.shakeT0 + this.shakeDur || mag > this.shakeMag) { this.shakeT0 = t0; this.shakeDur = dur; this.shakeMag = Math.max(mag, this.shakeMag * 0.5); }
  }
  screenFlash(color, alpha, t0, dur = 260) { this.flashColor = color; this.flashAlpha = alpha; this.flashT0 = t0; this.flashDur = dur; }
  hurt(alpha, t0, dur = 520) { this.hurtAlpha = Math.max(alpha, this.hurtActive(t0)); this.hurtT0 = t0; this.hurtDur = dur; }
  hurtActive(now) {
    const k = (now - this.hurtT0) / (this.hurtDur || 1);
    return k >= 0 && k < 1 ? this.hurtAlpha * (1 - k) : 0;
  }

  /**
   * Particle burst at tile coords (x, y) (tile centre = +0.5).
   * opts: {speed, life, size, grav, add, spread, dir:[dx,dy], drag, jitter}
   */
  burst(x, y, n, color, opts = {}) {
    if (this.reduced) n = Math.ceil(n / 3);
    const ci = this.colorIndex(color);
    const speed = opts.speed ?? 2.4, life = opts.life ?? 500, size = opts.size ?? 0.07;
    const spread = opts.spread ?? Math.PI * 2, base = opts.dir ? Math.atan2(opts.dir[1], opts.dir[0]) : 0;
    const jit = opts.jitter ?? 0.15;
    for (let k = 0; k < n; k++) {
      if (this.np >= MAXP) return;
      const i = this.np++;
      const a = base + (Math.random() - 0.5) * spread;
      const s = speed * (0.35 + Math.random() * 0.75);
      this.px[i] = x + (Math.random() - 0.5) * jit; this.py[i] = y + (Math.random() - 0.5) * jit;
      this.vx[i] = Math.cos(a) * s; this.vy[i] = Math.sin(a) * s;
      this.maxLife[i] = this.life[i] = life * (0.6 + Math.random() * 0.6);
      this.size[i] = size * (0.6 + Math.random() * 0.8);
      this.grav[i] = opts.grav ?? 0;
      this.drag[i] = opts.drag ?? 2.2;
      this.col[i] = ci; this.add[i] = opts.add === false ? 0 : 1;
    }
  }

  // ------------------------------------------------------------ queries
  /** Display position of entity uid whose logical position is (x, y). Returns a shared object. */
  pos(uid, x, y, now) {
    const o = this._pos;
    o.x = x; o.y = y;
    const t = this.tweens.get(uid);
    if (t) {
      const k = clamp01((now - t.t0) / t.dur);
      if (k < 1) { const e = k <= 0 ? 0 : easeOut(k); o.x = t.fx + (t.tx - t.fx) * e; o.y = t.fy + (t.ty - t.fy) * e; }
    }
    const l = this.lunges.get(uid);
    if (l) {
      const k = (now - l.t0) / l.dur;
      if (k > 0 && k < 1) { const s = Math.sin(Math.PI * k) * (k < 0.4 ? 1 : 0.85) * 0.32; o.x += l.dx * s; o.y += l.dy * s; }
    }
    return o;
  }
  flashAmount(uid, now) {
    const f = this.flashes.get(uid);
    if (!f) return 0;
    const k = (now - f.t0) / f.dur;
    return k < 0 || k >= 1 ? 0 : 1 - k;
  }
  shakeOffset(now) {
    const k = (now - this.shakeT0) / (this.shakeDur || 1);
    if (k < 0 || k >= 1) return 0;
    return this.shakeMag * (1 - k) * (1 - k);
  }

  /** Anything still moving that the next action would visually contradict? */
  busy(now) {
    for (const t of this.tweens.values()) if (now < t.t0 + t.dur) return true;
    for (const l of this.lunges.values()) if (now < l.t0 + l.dur) return true;
    for (const p of this.projectiles) if (now < p.t0 + p.dur) return true;
    return this.pending.length > 0;
  }

  /** Complete all positional animation immediately (input arrived). */
  fastForward(now) {
    this.tweens.clear();
    this.lunges.clear();
    this.projectiles.length = 0;
    const pend = this.pending;
    this.pending = [];
    pend.sort((a, b) => a.at - b.at);
    for (const p of pend) p.fn(now);
    for (const f of this.floaters) if (f.t0 > now) f.t0 = now;
    for (const g of this.ghosts) if (g.t0 > now) g.t0 = now;
    for (const r of this.rings) if (r.t0 > now) r.t0 = now;
    for (const f of this.flashes.values()) if (f.t0 > now) f.t0 = now;
  }

  /** Advance particles and retire finished items. */
  update(now, dt) {
    if (this.pending.length) {
      let keep = 0;
      const due = [];
      for (const p of this.pending) { if (p.at <= now) due.push(p); else this.pending[keep++] = p; }
      this.pending.length = keep;
      for (const p of due) p.fn(now);
    }
    for (const [uid, t] of this.tweens) if (now >= t.t0 + t.dur) this.tweens.delete(uid);
    for (const [uid, l] of this.lunges) if (now >= l.t0 + l.dur) this.lunges.delete(uid);
    for (const [uid, f] of this.flashes) if (now >= f.t0 + f.dur) this.flashes.delete(uid);
    if (this.projectiles.length) this.projectiles = this.projectiles.filter((p) => now < p.t0 + p.dur);
    if (this.ghosts.length) this.ghosts = this.ghosts.filter((g) => now < g.t0 + g.dur);
    if (this.floaters.length) this.floaters = this.floaters.filter((f) => now < f.t0 + f.dur);
    if (this.rings.length) this.rings = this.rings.filter((r) => now < r.t0 + r.dur);
    const s = dt / 1000;
    let n = this.np;
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        n--;
        if (i !== n) this.copyParticle(n, i);
        i--;
        continue;
      }
      const d = Math.exp(-this.drag[i] * s);
      this.vx[i] *= d; this.vy[i] = this.vy[i] * d + this.grav[i] * s;
      this.px[i] += this.vx[i] * s; this.py[i] += this.vy[i] * s;
    }
    this.np = n;
  }

  copyParticle(from, to) {
    this.px[to] = this.px[from]; this.py[to] = this.py[from];
    this.vx[to] = this.vx[from]; this.vy[to] = this.vy[from];
    this.life[to] = this.life[from]; this.maxLife[to] = this.maxLife[from];
    this.size[to] = this.size[from]; this.grav[to] = this.grav[from]; this.drag[to] = this.drag[from];
    this.col[to] = this.col[from]; this.add[to] = this.add[from];
  }

  clear() {
    this.tweens.clear(); this.lunges.clear(); this.flashes.clear();
    this.ghosts.length = 0; this.floaters.length = 0; this.projectiles.length = 0; this.rings.length = 0;
    this.pending.length = 0; this.np = 0; this.shakeDur = 0; this.flashDur = 0; this.hurtDur = 0;
  }
}
