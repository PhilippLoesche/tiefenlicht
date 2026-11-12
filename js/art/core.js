// Tiefenlicht art — shared core helpers: colour maths, seeded variation,
// Path2D shape builders (authored in a 100-unit "percent grid" inside the
// normalized 0..1 tile box) and the Pen, which renders every sprite in three
// phases (under-glow, ink silhouette, colour) to get the bold paper-cut look.

export const TAU = Math.PI * 2;
export const INK = '#0d1020';      // shared silhouette ink (cool, near-black)
export const DARK = '#131a2b';     // shading target (cool indigo-petrol)
export const WARM = '#fff2d2';     // highlight target (warm paper white)

// ---------------------------------------------------------------- colour
const rgbMemo = new Map();
export function rgb(hex) {
  let v = rgbMemo.get(hex);
  if (v) return v;
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  rgbMemo.set(hex, v);
  return v;
}
const to2 = (x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0');
export function hex(r, g, b) { return '#' + to2(r) + to2(g) + to2(b); }
const mixMemo = new Map();
/** Linear mix of two hex colours, t in 0..1. */
export function mix(a, b, t) {
  const k = a + b + t;
  let v = mixMemo.get(k);
  if (v) return v;
  const A = rgb(a), B = rgb(b);
  v = hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
  if (mixMemo.size > 4000) mixMemo.clear();
  mixMemo.set(k, v);
  return v;
}
/** Shade toward the cool dark. */
export const dk = (c, t) => mix(c, DARK, t);
/** Lighten toward warm paper white. */
export const lt = (c, t) => mix(c, WARM, t);
export function rgba(c, a) { const [r, g, b] = rgb(c); return `rgba(${r},${g},${b},${a})`; }

// ---------------------------------------------------------------- seeded variation
export function hash32(...xs) {
  let h = 0x811c9dc5 | 0;
  for (const x of xs) {
    h = Math.imul(h ^ (x | 0), 0x01000193);
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  }
  return h >>> 0;
}
export function strHash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
/** mulberry32 PRNG → function returning floats in [0,1). */
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------- shapes (Path2D)
const pathMemo = new Map();
function memo(key, build) {
  let p = pathMemo.get(key);
  if (!p) {
    if (pathMemo.size > 6000) pathMemo.clear();
    p = build();
    pathMemo.set(key, p);
  }
  return p;
}
/** SVG path data → Path2D (memoized). */
export const P = (d) => memo(d, () => new Path2D(d));
/** Ellipse. */
export const E = (cx, cy, rx, ry, rot = 0) => memo(`E${cx},${cy},${rx},${ry},${rot}`, () => {
  const p = new Path2D(); p.ellipse(cx, cy, Math.abs(rx), Math.abs(ry), rot, 0, TAU); return p;
});
/** Circle. */
export const C = (cx, cy, r) => E(cx, cy, r, r);
/** Closed polygon from flat [x,y,x,y,...]. */
export const poly = (pts) => memo('L' + pts.join(','), () => {
  const p = new Path2D(); p.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
  p.closePath(); return p;
});
/** Open polyline (for strokes). */
export const pline = (pts) => memo('O' + pts.join(','), () => {
  const p = new Path2D(); p.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
  return p;
});
/** Rounded rectangle. */
export const R = (x, y, w, h, r = 0) => memo(`R${x},${y},${w},${h},${r}`, () => {
  const p = new Path2D();
  r = Math.min(r, w / 2, h / 2);
  p.moveTo(x + r, y); p.lineTo(x + w - r, y); p.arcTo(x + w, y, x + w, y + r, r);
  p.lineTo(x + w, y + h - r); p.arcTo(x + w, y + h, x + w - r, y + h, r);
  p.lineTo(x + r, y + h); p.arcTo(x, y + h, x, y + h - r, r);
  p.lineTo(x, y + r); p.arcTo(x, y, x + r, y, r); p.closePath(); return p;
});
/** Unmemoized irregular blob (for seeded tile details). */
export function blob(r, cx, cy, rx, ry, n = 7, jit = 0.3) {
  const p = new Path2D();
  const a0 = r() * TAU;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU;
    const k = 1 - jit / 2 + r() * jit;
    const x = cx + Math.cos(a) * rx * k, y = cy + Math.sin(a) * ry * k;
    i ? p.lineTo(x, y) : p.moveTo(x, y);
  }
  p.closePath();
  return p;
}
export function polyRaw(pts) {
  const p = new Path2D(); p.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
  p.closePath(); return p;
}
export function plineRaw(pts) {
  const p = new Path2D(); p.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
  return p;
}

// ---------------------------------------------------------------- two-tone fill (no pen)
/** Paper-cut two-tone: dark base, lit copy shifted toward the upper-left light, clipped. */
export function toneFill(ctx, path, lit, dark, ox = -3, oy = -3.5) {
  ctx.fillStyle = dark; ctx.fill(path);
  ctx.save(); ctx.clip(path); ctx.translate(ox, oy);
  ctx.fillStyle = lit; ctx.fill(path); ctx.restore();
}

// ---------------------------------------------------------------- Pen
/**
 * A Pen renders one drawing function in three phases so that every object
 * gets one shared chunky ink silhouette:
 *   'under' – soft stepped glows (only `glow` draws)
 *   'ink'   – every `fill/tone/line` is filled + stroked in INK, widened by `ow`
 *   'color' – the actual flat colours
 * `flat*` methods draw only in the colour phase (interior details, no outline).
 */
export class Pen {
  constructor(ctx, ow = 3.4, facing = 1) {
    this.ctx = ctx; this.ow = ow; this.phase = 'color';
    this.lx = -4 * facing; this.ly = -5; // light comes from screen upper-left
    this.facing = facing;
  }
  get under() { return this.phase === 'under'; }
  get ink() { return this.phase === 'ink'; }
  get color() { return this.phase === 'color'; }
  /** Rotate the light offset when drawing in a rotated local frame. */
  setRot(a) {
    const lx = -4 * this.facing, ly = -5, c = Math.cos(-a), s = Math.sin(-a);
    this.lx = lx * c - ly * s; this.ly = lx * s + ly * c;
  }
  fill(p, c) {
    const x = this.ctx;
    if (this.phase === 'ink') { x.fillStyle = INK; x.strokeStyle = INK; x.lineWidth = this.ow * 2; x.fill(p); x.stroke(p); }
    else if (this.phase === 'color') { x.fillStyle = c; x.fill(p); }
  }
  /** Two-tone flat shading: dark crescent toward lower-right. k scales the offset. */
  tone(p, lit, dark, k = 1) {
    if (this.phase !== 'color') return this.fill(p, lit);
    const x = this.ctx;
    x.fillStyle = dark; x.fill(p);
    x.save(); x.clip(p); x.translate(this.lx * k, this.ly * k); x.fillStyle = lit; x.fill(p); x.restore();
  }
  /** Like tone, but in the colour phase first cuts a thin ink seam around the shape
   *  so it separates from same-coloured parts behind it (arms over bodies etc.). */
  toneS(p, lit, dark, k = 1, sw = 1.5) {
    if (this.phase === 'color') { const x = this.ctx; x.strokeStyle = INK; x.lineWidth = sw * 2; x.stroke(p); }
    this.tone(p, lit, dark, k);
  }
  lineS(p, c, w, sw = 1.5) {
    if (this.phase === 'color') { const x = this.ctx; x.strokeStyle = INK; x.lineWidth = w + sw * 2; x.stroke(p); }
    this.line(p, c, w);
  }
  flat(p, c) { if (this.phase === 'color') { this.ctx.fillStyle = c; this.ctx.fill(p); } }
  /** Stroke with silhouette. */
  line(p, c, w) {
    const x = this.ctx;
    if (this.phase === 'ink') { x.strokeStyle = INK; x.lineWidth = w + this.ow * 2; x.stroke(p); }
    else if (this.phase === 'color') { x.strokeStyle = c; x.lineWidth = w; x.stroke(p); }
  }
  lineFlat(p, c, w) {
    if (this.phase !== 'color') return;
    const x = this.ctx; x.strokeStyle = c; x.lineWidth = w; x.stroke(p);
  }
  /** Paper-cut halo: stacked translucent discs (stepped, not a gradient). Under phase only. */
  glow(cx, cy, r, c, a = 0.14, steps = 3) {
    if (this.phase !== 'under') return;
    const x = this.ctx; x.fillStyle = rgba(c, a);
    for (let i = 0; i < steps; i++) { x.fill(C(cx, cy, r * (1 - i / (steps + 0.6)))); }
  }
  /** Colour-phase translucent disc (small sparkle halos over the drawing). */
  halo(cx, cy, r, c, a = 0.3) {
    if (this.phase !== 'color') return;
    this.ctx.fillStyle = rgba(c, a); this.ctx.fill(C(cx, cy, r));
  }
}

/** Run a draw function through all three pen phases. ctx must be in 100-grid space. */
export function penDraw(ctx, fn, o = {}, facing = 1, ow = 3.4) {
  const pen = new Pen(ctx, ow, facing);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  pen.phase = 'under'; fn(pen, o);
  pen.phase = 'ink'; fn(pen, o);
  pen.phase = 'color'; fn(pen, o);
}

/** Soft contact shadow ellipse (flat). */
export function contactShadow(ctx, cx = 50, cy = 88, rx = 28, ry = 6, a = 0.38) {
  ctx.fillStyle = `rgba(6,8,16,${a})`;
  ctx.fill(E(cx, cy, rx, ry));
  ctx.fillStyle = `rgba(6,8,16,${a * 0.6})`;
  ctx.fill(E(cx, cy, rx * 0.62, ry * 0.62));
}

/** Smooth periodic phase helper: returns angle for time t with period per. */
export const phase = (t, per) => (((t || 0) % per) / per) * TAU;
