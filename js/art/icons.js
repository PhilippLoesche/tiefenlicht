// Tiefenlicht art — monochrome HUD icons (single colour + cut-outs). 100-unit grid.
// Icons use destination-out cuts, so they are always rendered on a private
// scratch/cached canvas and then blitted (see index.js).
import { TAU, P, E, C, R, poly } from './core.js';

function kit(ctx, col) {
  ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const k = {
    f(p) { ctx.fill(p); },
    st(p, w) { ctx.lineWidth = w; ctx.stroke(p); },
    cut(p) { ctx.globalCompositeOperation = 'destination-out'; ctx.fill(p); ctx.globalCompositeOperation = 'source-over'; },
    cutSt(p, w) { ctx.globalCompositeOperation = 'destination-out'; ctx.lineWidth = w; ctx.stroke(p); ctx.globalCompositeOperation = 'source-over'; },
    star(cx, cy, r, inner = 0.28) {
      const i = r * inner;
      return poly([cx, cy - r, cx + i, cy - i, cx + r, cy, cx + i, cy + i, cx, cy + r, cx - i, cy + i, cx - r, cy, cx - i, cy - i]);
    },
  };
  return k;
}

export const ICONS = {
  icon_heart(k) {
    k.f(P('M50 88 C 22 68 7 52 9 34 C 11 16 33 9 50 27 C 67 9 89 16 91 34 C 93 52 78 68 50 88 Z'));
    k.cut(E(29, 32, 7, 4.5, -0.7));
  },
  icon_lantern(k) {
    k.st(P('M41 21 Q 41 8 50 8 Q 59 8 59 21'), 5);
    k.f(poly([28, 32, 72, 32, 63, 20, 37, 20]));
    k.f(R(28, 31, 44, 45, 3));
    k.cut(R(35, 37, 30, 33, 2));
    k.f(P('M50 41 Q 62 54 58 62 Q 50 71 42 62 Q 38 54 50 41 Z'));
    k.f(R(23, 76, 54, 9, 3)); k.f(R(32, 85, 36, 6, 2));
  },
  icon_sword(k, ctx) {
    ctx.save(); ctx.translate(50, 50); ctx.rotate(Math.PI / 4);
    k.f(P('M-6.5 14 L -6.5 -36 L 0 -48 L 6.5 -36 L 6.5 14 Z'));
    k.cut(R(-1.4, -34, 2.8, 42, 1.4));
    k.f(R(-17, 13, 34, 8, 3.5)); k.f(R(-4.5, 21, 9, 18, 2)); k.f(C(0, 43, 6.5));
    ctx.restore();
  },
  icon_shield(k) {
    k.f(P('M50 8 L 86 19 Q 86 60 50 92 Q 14 60 14 19 Z'));
    k.cut(P('M50 18 L 77 26 Q 77 58 50 82 Q 23 58 23 26 Z'));
    k.f(P('M50 24 L 71 30 Q 71 55 50 75 Q 29 55 29 30 Z'));
  },
  icon_strength(k) {
    // clenched fist, knuckles up
    k.f(R(20, 22, 60, 44, 13));
    k.f(R(32, 60, 36, 32, 5));
    k.cutSt(P('M35 24 L 35 44 M50 22 L 50 44 M65 24 L 65 44'), 4);
    k.cutSt(P('M22 50 Q 40 46 58 52'), 4);
    k.cutSt(P('M30 66 L 70 66'), 3);
  },
  icon_depth(k) {
    k.f(poly([6, 30, 28, 30, 28, 48, 48, 48, 48, 66, 68, 66, 68, 88, 6, 88]));
    k.f(poly([76, 8, 90, 8, 90, 30, 98, 30, 83, 50, 68, 30, 76, 30]));
  },
  icon_gold(k) {
    k.f(E(36, 80, 24, 9)); k.f(R(12, 46, 48, 34, 0)); k.f(E(36, 46, 24, 9));
    k.cutSt(P('M12 58 Q 36 70 60 58 M12 69 Q 36 81 60 69'), 3);
    k.cut(E(36, 46, 15, 4.6));
    k.f(E(36, 46, 10, 2.8));
    k.cut(C(72, 56, 21));
    k.f(C(72, 56, 17)); k.cut(C(72, 56, 11)); k.f(C(72, 56, 7));
  },
  icon_xp(k) {
    k.f(k.star(46, 54, 42, 0.22));
    k.f(k.star(82, 18, 14, 0.25));
  },
  icon_sound_on(k, ctx) {
    k.f(poly([8, 37, 26, 37, 47, 18, 47, 82, 26, 63, 8, 63]));
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(50, 50, 17, -0.85, 0.85); ctx.stroke();
    ctx.beginPath(); ctx.arc(50, 50, 32, -0.9, 0.9); ctx.stroke();
  },
  icon_sound_off(k) {
    k.f(poly([8, 37, 26, 37, 47, 18, 47, 82, 26, 63, 8, 63]));
    k.st(P('M62 36 L 90 64 M90 36 L 62 64'), 8);
  },
  icon_help(k) {
    k.st(P('M32 34 Q 32 14 50 14 Q 68 14 68 31 Q 68 42 57 48 Q 50 52 50 63'), 12);
    k.f(C(50, 83, 7.5));
  },
  icon_bag(k) {
    k.f(P('M38 32 Q 16 46 15 68 Q 15 90 50 90 Q 85 90 85 68 Q 84 46 62 32 Z'));
    k.f(poly([36, 26, 28, 10, 42, 17, 50, 8, 58, 17, 72, 10, 64, 26]));
    k.f(R(37, 24, 26, 9, 4));
    k.cutSt(P('M36 34 L 64 34'), 3);
    k.cut(P('M50 52 L 60 62 L 50 72 L 40 62 Z'));
  },
  icon_explore(k) {
    k.f(C(50, 50, 42)); k.cut(C(50, 50, 34));
    k.f(R(46, 3, 8, 10, 2)); k.f(R(46, 87, 8, 10, 2)); k.f(R(3, 46, 10, 8, 2)); k.f(R(87, 46, 10, 8, 2));
    k.f(poly([50, 18, 60, 50, 50, 82, 40, 50]));
    k.cut(poly([50, 56, 55, 50, 50, 76, 45, 50]));
    k.cut(C(50, 50, 4));
  },
  icon_rest(k) {
    k.f(C(44, 54, 36)); k.cut(C(62, 42, 31));
    k.f(k.star(76, 22, 11)); k.f(k.star(86, 54, 7));
  },
  icon_poison(k) {
    k.f(P('M42 8 Q 70 44 70 63 Q 70 88 42 88 Q 14 88 14 63 Q 14 44 42 8 Z'));
    k.cut(E(29, 63, 4.5, 10, 0.25));
    k.f(C(80, 34, 8)); k.f(C(86, 14, 5));
  },
  icon_confusion(k, ctx) {
    ctx.lineWidth = 7.5; ctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const a = (i / 120) * TAU * 2.25, r = 3 + (i / 120) * 38;
      const x = 50 + Math.cos(a) * r, y = 50 + Math.sin(a) * r;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  },
  icon_haste(k) {
    k.f(poly([60, 4, 22, 54, 46, 54, 36, 96, 80, 40, 56, 40, 70, 4]));
  },
  icon_blind(k) {
    k.f(P('M6 50 Q 50 6 94 50 Q 50 94 6 50 Z'));
    k.cut(C(50, 50, 17)); k.f(C(50, 50, 9));
    k.cutSt(P('M18 88 L 82 12'), 16);
    k.st(P('M18 88 L 82 12'), 7);
  },
  icon_stoneskin(k) {
    k.f(P('M18 72 L 12 46 L 28 20 L 58 12 L 82 26 L 90 54 L 78 82 L 44 88 Z'));
    k.cutSt(P('M28 20 L 40 44 L 18 72 M40 44 L 64 50 L 78 82 M64 50 L 82 26 M40 44 L 44 88'), 4);
  },
  icon_slow(k, ctx) {
    k.f(P('M8 82 L 78 82 Q 92 82 92 72 L 90 54 Q 88 46 82 48 L 78 56 L 74 74 L 12 74 Q 4 76 8 82 Z'));
    k.st(P('M82 50 L 78 30 M88 50 L 92 32'), 3.5);
    k.f(C(78, 28, 4)); k.f(C(92, 30, 4));
    k.f(C(42, 50, 27));
    ctx.globalCompositeOperation = 'destination-out'; ctx.lineWidth = 4.5; ctx.beginPath();
    for (let i = 0; i <= 80; i++) {
      const a = (i / 80) * TAU * 1.6 + 1, r = 3 + (i / 80) * 17;
      const x = 42 + Math.cos(a) * r, y = 50 + Math.sin(a) * r;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke(); ctx.globalCompositeOperation = 'source-over';
  },
  icon_fear(k) {
    k.f(C(45, 55, 37));
    k.cut(E(32, 47, 6, 9.5)); k.cut(E(58, 47, 6, 9.5));
    k.cutSt(P('M27 74 Q 33 66 39 72 Q 45 78 51 72 Q 57 66 63 74'), 5);
    k.f(P('M86 8 Q 97 24 93 31 Q 87 38 80 31 Q 76 24 86 8 Z'));
  },
  icon_stun(k) {
    k.st(E(50, 66, 40, 14), 5);
    for (const [x, y, r] of [[18, 58, 13], [56, 80, 12], [82, 54, 11]]) { k.cut(C(x, y, r * 0.75)); k.f(k.star(x, y, r, 0.32)); }
    k.f(k.star(50, 22, 18, 0.3));
  },
};
export const ICON_IDS = Object.keys(ICONS);

/** Draw an icon in 100-grid space. Must target a private canvas (uses cut-outs). */
export function drawIcon(ctx, id, col) {
  const fn = ICONS[id];
  if (!fn) return;
  const k = kit(ctx, col);
  fn(k, ctx);
}
