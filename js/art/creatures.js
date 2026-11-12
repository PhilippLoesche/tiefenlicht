// Tiefenlicht art — hero and monsters. Authored facing right in a 100-unit grid,
// feet on y≈88. Each entry: { draw(pen, opts), shadow:[cx,cy,rx,ry,alpha]|null,
// anim?: loop period (s), alpha?: whole-sprite opacity, over?: overflow above the box (fraction) }.
import { TAU, INK, mix, dk, lt, rgba, P, E, C, R, poly, phase } from './core.js';
import { PAL, LIGHT } from './palette.js';

const IRON = '#3a3440';
const SKIN = '#e6c49a';

function wavyPath(d) { return new Path2D(d); }

export const CREATURES = {
  // ------------------------------------------------------------------ hero
  hero: {
    anim: 1.2, shadow: [50, 88, 24, 5, 0.4],
    draw(p, o) {
      const ph = phase(o.t, 1.2), fl = 0.5 + 0.35 * Math.sin(ph) + 0.15 * Math.sin(ph * 3 + 1);
      const CL = '#4b6a7e', CLD = '#2a3d4f', HD = '#5b7e92', HDD = '#33495c';
      p.glow(76, 66, 23, LIGHT.lamp, 0.13 + 0.04 * fl, 3);
      // cloak
      p.tone(P('M47 32 C 35 34 30 48 28 62 L 23 86 Q 46 92 70 86 L 66 62 C 65 46 60 34 47 32 Z'), CL, CLD, 1.2);
      p.flat(P('M45 52 Q 41 70 39 87 L 43 88 Q 45 70 48 54 Z'), CLD);
      p.fill(E(41, 88, 6.5, 3.2), '#2a2028'); p.fill(E(58, 88, 6.5, 3.2), '#2a2028');
      // scarf
      p.tone(P('M37 40 Q 50 47 64 40 L 65 47 Q 50 54 36 47 Z'), '#b24a3a', '#7a2e2a', 0.5);
      p.tone(P('M40 46 L 36 60 L 42 58 L 44 48 Z'), '#b24a3a', '#7a2e2a', 0.4);
      // hood with peak trailing back
      p.tone(P('M50 10 C 41 10 35 16 33 24 Q 26 30 21 41 Q 30 36 34 38 C 35 41 37 43 40 44 L 63 42 C 66 34 66 22 61 15 C 58 11 54 10 50 10 Z'), HD, HDD, 1);
      p.flat(E(55, 29, 8.5, 9.5), '#141a28');
      p.flat(P('M56 25 Q 63.5 26 62.5 33 Q 61 38.5 55 38 Q 53 32 56 25 Z'), SKIN);
      p.flat(C(58, 30, 1.5), '#141a28');
      // arm toward the lantern
      p.lineS(P('M58 47 Q 68 52 74 49'), CL, 8);
      // lantern
      p.line(P('M71.5 56 Q 75 46 78.5 56'), IRON, 1.8);
      p.fill(poly([69.5, 58.5, 80.5, 58.5, 78, 54, 72, 54]), IRON);
      p.fill(R(69, 58, 12, 14, 2.2), PAL.amber);
      p.flat(R(71, 60, 8, 10, 1.5), mix(PAL.amber, '#fff2c8', 0.35 + 0.3 * fl));
      p.flat(E(75, 66.5, 2 + fl * 0.9, 3.3 + fl * 1.1), '#fffbe8');
      p.flat(R(74.3, 58, 1.4, 14, 0), IRON);
      p.fill(R(68, 71.5, 14, 3.6, 1.2), IRON);
      p.fill(C(75, 48.5, 4), SKIN);
    },
  },

  // ------------------------------------------------------------------ ratte
  ratte: {
    shadow: [52, 86, 34, 5, 0.38],
    draw(p) {
      const B = '#8c7464', BD = '#58463e', PINK = '#d99c92', PINKD = '#a86a64';
      p.line(P('M24 77 Q 5 77 6 62 Q 7 50 18 52'), PINKD, 3.6);
      p.fill(E(36, 85, 6, 3), BD);
      p.tone(P('M19 77 Q 17 58 40 55 Q 58 51 71 59 Q 86 65 93 74 Q 85 82 66 82 L 30 84 Q 19 84 19 77 Z'), B, BD, 1.3);
      p.flat(P('M28 80 Q 46 74 66 80 L 66 82 L 30 84 Z'), mix(B, '#d8c4b0', 0.3));
      p.toneS(E(67, 55, 6.5, 7.5, -0.3), B, BD, 0.6);
      p.flat(E(67.6, 56, 3.6, 4.6, -0.3), PINK);
      p.fill(C(93, 74, 2.6), PINK);
      p.flat(C(79, 65, 2.5), '#ff4a3a'); p.flat(C(79.6, 64.3, 0.9), '#ffd8c8');
      p.fill(E(58, 85, 6, 3), BD); p.fill(E(82, 82, 4.5, 2.6), BD);
      p.lineFlat(P('M88 71 L 98 67 M88 75 L 98 77'), '#d8cabc', 0.9);
    },
  },

  // ------------------------------------------------------------------ fledermaus
  fledermaus: {
    shadow: [50, 90, 18, 3.4, 0.25],
    draw(p) {
      const W = '#76569a', WD = '#46325e', BOD = '#4c3866';
      const wing = 'M54 40 Q 64 26 80 22 Q 92 20 97 27 Q 92 38 95 51 Q 86 46 81 55 Q 75 46 67 55 Q 63 47 54 51 Z';
      const ctx = p.ctx;
      ctx.save(); ctx.translate(100, 0); ctx.scale(-1, 1); const f = p.lx; p.lx = -p.lx;
      p.tone(P(wing), W, WD, 1.2); p.lineFlat(P('M56 44 L 94 28 M58 46 L 80 53 M56 47 L 67 53'), lt(W, 0.25), 1.3);
      p.lx = f; ctx.restore();
      p.tone(P(wing), W, WD, 1.2); p.lineFlat(P('M56 44 L 94 28 M58 46 L 80 53 M56 47 L 67 53'), lt(W, 0.25), 1.3);
      p.tone(E(50, 47, 9, 13), mix(BOD, W, 0.4), dk(BOD, 0.3));
      p.fill(poly([43, 28, 41, 15, 48.5, 24]), BOD); p.fill(poly([57, 28, 59, 15, 51.5, 24]), BOD);
      p.tone(C(50, 31, 8.5), mix(BOD, W, 0.4), dk(BOD, 0.3), 0.6);
      p.flat(C(46.4, 30.5, 2.1), '#ffd84a'); p.flat(C(53.6, 30.5, 2.1), '#ffd84a');
      p.flat(poly([47, 35.5, 48, 39.5, 49, 35.5]), PAL.bone); p.flat(poly([51, 35.5, 52, 39.5, 53, 35.5]), PAL.bone);
      p.line(P('M46 59 L 45 63 M54 59 L 55 63'), BOD, 2);
    },
  },

  // ------------------------------------------------------------------ kaefer
  kaefer: {
    shadow: [52, 87, 36, 5, 0.4],
    draw(p) {
      const S = '#bd7238', SD = '#6e3a20', SH = '#f0b070', LEG = '#2e2228';
      const HEAD = '#5a3c42', HEADD = '#2e1e26';
      p.line(P('M24 68 L 13 76 L 10 88'), LEG, 4);
      p.line(P('M42 71 L 36 80 L 36 89'), LEG, 4);
      p.line(P('M60 70 L 70 78 L 72 89'), LEG, 4);
      p.fill(P('M10 66 Q 44 80 80 66 L 80 60 L 10 62 Z'), '#3a2a30');
      // head + big curved horn
      p.tone(P('M74 50 Q 90 48 93 62 Q 88 72 76 70 Z'), HEAD, HEADD, 0.6);
      p.tone(P('M82 54 Q 82 36 92 24 Q 99 20 99 27 Q 92 34 91 44 Q 90 52 92 58 Z'), HEAD, HEADD, 0.6);
      p.line(P('M90 66 L 98 70'), HEADD, 1.8);
      // pronotum
      p.toneS(P('M60 38 Q 74 36 80 48 Q 82 58 78 64 L 60 64 Z'), mix(S, SD, 0.35), SD, 0.8);
      // elytra dome
      p.toneS(P('M8 65 Q 8 30 40 28 Q 64 28 66 64 Z'), S, SD, 1.5);
      p.lineFlat(P('M40 29 Q 39 48 40 64'), SD, 2);
      p.flat(P('M15 54 Q 18 38 32 33 Q 23 41 20 56 Z'), SH);
      p.flat(P('M44 33 Q 54 34 60 42 Q 52 38 44 37 Z'), mix(S, SH, 0.6));
      p.flat(C(86, 59, 2.2), '#ffd060');
    },
  },

  // ------------------------------------------------------------------ glimmerdieb
  glimmerdieb: {
    shadow: [50, 87, 28, 5, 0.38],
    draw(p) {
      const SK = '#a6b456', SKD = '#66722f', CL = '#55436a', CLD = '#30263e', SACK = '#b5895a', SACKD = '#76532f';
      p.tone(P('M12 60 Q 8 36 25 27 Q 38 20 47 31 Q 53 44 47 61 Q 37 72 22 70 Q 12 68 12 60 Z'), SACK, SACKD, 1.3);
      p.flat(P('M20 48 Q 28 54 40 50'), SACKD); p.lineFlat(P('M20 48 Q 28 54 40 50'), SACKD, 1.5);
      p.fill(P('M40 29 Q 44 21 50 23 L 47 31 Z'), SACKD);
      p.fill(E(29, 25, 6, 3.5, -0.3), PAL.gold); p.flat(C(27, 24, 1.5), '#fff4c0');
      p.fill(E(19, 32, 4, 2.4, 0.4), PAL.gold);
      p.line(P('M46 74 L 41 86 L 34 87'), SKD, 5);
      p.line(P('M58 74 L 63 86 L 70 87'), SKD, 5);
      p.toneS(P('M35 77 Q 31 55 44 45 Q 57 37 67 46 Q 73 57 68 77 Z'), CL, CLD, 1);
      p.lineFlat(P('M45 34 Q 56 52 62 74'), SACKD, 2.6);
      p.lineS(P('M63 58 Q 74 63 81 57'), SK, 4.2);
      p.fill(C(82, 56, 3), SK);
      p.toneS(P('M64 37 L 47 27 L 61 46 Z'), SK, SKD, 0.5);
      p.toneS(P('M59 44 Q 61 30 72 29 Q 84 29 87 39 Q 94 43 91 48 Q 83 52 72 52 Q 61 52 59 44 Z'), SK, SKD, 0.8);
      p.flat(C(75.5, 38.5, 3.6), '#ffe27a'); p.flat(C(76.6, 38.7, 1.5), '#1a1420');
      p.flat(P('M70 47 L 84 47 L 82 49 L 72 49 Z'), SKD);
    },
  },

  // ------------------------------------------------------------------ schleim
  schleim: {
    shadow: [50, 88, 40, 5, 0.45],
    draw(p) {
      const OL = '#4a4870', O = '#2c2a46', OD = '#1a1a2c';
      p.fill(E(50, 86, 40, 5.5), OD);
      p.fill(C(84, 40, 3.4), OL);
      p.tone(P('M13 86 Q 11 66 23 56 Q 33 33 54 33 Q 75 33 81 52 Q 91 64 89 86 Z'), OL, O, 1.8);
      p.fill(E(24, 87, 5, 3.5), O); p.fill(E(74, 87, 6, 3.5), O);
      p.flat(P('M26 58 Q 32 42 48 38 Q 39 46 33 60 Z'), '#7fd6c4');
      p.flat(P('M36 60 Q 40 51 50 48 Q 44 55 41 62 Z'), '#b48ae8');
      p.flat(C(61, 41, 1.8), '#d8f4ff'); p.flat(C(83, 39, 1.2), '#d8f4ff');
      p.flat(E(58, 60, 3.6, 4.6), '#e4f070'); p.flat(E(71, 60, 3.6, 4.6), '#e4f070');
      p.flat(E(59, 61, 1, 3), OD); p.flat(E(72, 61, 1, 3), OD);
      p.flat(P('M58 72 Q 65 77 72 72 Q 65 74 58 72 Z'), OD);
    },
  },

  // ------------------------------------------------------------------ knochenknecht
  knochenknecht: {
    shadow: [50, 88, 26, 5, 0.38],
    draw(p) {
      const BO = PAL.bone, BD = '#a99c80', HOLE = '#241e2c';
      p.line(P('M44 66 L 42 86'), BD, 4.5); p.line(P('M56 66 L 58 86'), BO, 4.5);
      p.fill(E(40, 88, 5.5, 2.6), BD); p.fill(E(60, 88, 5.5, 2.6), BO);
      p.line(P('M50 38 L 50 64'), BD, 4);
      p.tone(P('M40 61 L 60 61 L 58 70 L 42 70 Z'), BO, BD, 0.5);
      p.tone(P('M38 37 Q 50 33 62 37 L 60 56 Q 50 59 40 56 Z'), BO, BD, 0.7);
      p.lineFlat(P('M41 43 L 59 43 M41 49 L 59 49'), HOLE, 2.2);
      // sword arm
      p.line(P('M69 47 L 84 12'), '#a39b8f', 5);
      p.fill(poly([81.5, 13, 87.5, 5, 86.5, 15]), '#a39b8f');
      p.lineFlat(P('M71 44 L 84 14'), '#d4ccbe', 1.3);
      p.line(P('M63 42 L 77 49'), '#6a4a32', 3.6);
      p.line(P('M61 39 L 66 51 L 70 46'), BO, 3.6);
      // shield
      p.toneS(C(31, 55, 15.5), '#7a5a44', '#4a3428', 1);
      p.lineFlat(P('M31 39.5 A 15.5 15.5 0 0 1 46.5 55'), '#9a9aa4', 2.6);
      p.flat(C(31, 55, 4), '#a8a8b2'); p.flat(C(30, 54, 1.6), '#d8d8e0');
      // skull
      p.tone(P('M40 22 Q 40 8 51 8 Q 62 8 62 22 Q 62 28 58 30 L 58 34 L 44 34 L 44 30 Q 40 28 40 22 Z'), BO, BD, 0.7);
      p.flat(E(46.5, 21, 3.4, 3.8), HOLE); p.flat(E(56, 21, 3.4, 3.8), HOLE);
      p.flat(C(46.8, 21.6, 1.3), PAL.ember); p.flat(C(56.2, 21.6, 1.3), PAL.ember);
      p.flat(poly([50, 25, 52.5, 28.5, 49.5, 28.5]), HOLE);
      p.lineFlat(P('M46.5 31 L 46.5 34 M50 31 L 50 34 M53.5 31 L 53.5 34'), HOLE, 1.1);
    },
  },

  // ------------------------------------------------------------------ spinne
  spinne: {
    shadow: [50, 87, 38, 5, 0.4],
    draw(p) {
      const BODY = '#86283c', BD = '#4a1422', LEG = '#3a121e', LEGF = '#5a1c2c';
      p.lineFlat(P('M34 0 L 34 46'), 'rgba(232,220,192,0.6)', 1.1);
      // far legs (lighter, behind)
      for (const d of ['M44 60 L 30 36 L 18 86', 'M58 62 L 72 36 L 84 86']) p.line(P(d), LEGF, 3);
      // near legs
      for (const d of ['M40 60 L 20 34 L 6 84', 'M48 64 L 34 44 L 26 88', 'M62 62 L 80 34 L 94 84', 'M58 66 L 68 46 L 74 88']) p.line(P(d), LEG, 3.8);
      p.tone(E(36, 58, 20, 16.5, -0.25), BODY, BD, 1.4);
      p.flat(P('M27 52 L 36 47 L 45 52 L 36 57 Z'), PAL.ember);
      p.flat(P('M30 61 L 36 58 L 42 61 L 36 64 Z'), PAL.ember);
      p.toneS(E(62, 63, 12, 10), BODY, BD, 0.8);
      p.fill(P('M69 70 Q 75 75 71 80 L 67.5 72 Z'), '#cfc0a6');
      p.flat(C(68, 58, 2.5), '#ff5a48'); p.flat(C(72.5, 60.5, 2), '#ff5a48');
      p.flat(C(64, 56, 1.6), '#ff5a48'); p.flat(C(71, 55.5, 1.4), '#ff5a48');
      p.flat(C(67.4, 57.4, 0.8), '#ffd8c8');
    },
  },

  // ------------------------------------------------------------------ pilzling
  pilzling: {
    shadow: [50, 88, 26, 5, 0.38],
    draw(p) {
      const CAP = '#b8508f', CAPD = '#6e2a58', SPOT = '#f6d4ea', ST = '#e4d6b6', STD = '#a69676';
      p.line(P('M43 76 L 41 86'), STD, 6.5); p.line(P('M57 76 L 59 86'), STD, 6.5);
      p.fill(E(39, 88, 6, 3), STD); p.fill(E(61, 88, 6, 3), STD);
      p.line(P('M37 58 Q 28 63 26 72'), STD, 4.6); p.line(P('M63 58 Q 72 62 75 70'), ST, 4.6);
      p.tone(P('M36 49 Q 34 70 40 80 L 60 80 Q 66 70 64 49 Z'), ST, STD, 1);
      p.fill(P('M17 46 Q 50 58 83 46 L 81 51 Q 50 63 19 51 Z'), '#c9a0b8');
      p.tone(P('M13 48 Q 11 25 34 15 Q 50 9 66 15 Q 89 25 87 48 Q 50 56 13 48 Z'), CAP, CAPD, 1.6);
      p.flat(C(33, 26, 4.8), SPOT); p.flat(C(55, 19, 3.6), SPOT); p.flat(C(71, 32, 4), SPOT); p.flat(C(45, 38, 3), SPOT); p.flat(C(23, 40, 2.4), SPOT);
      p.flat(E(45, 63, 2.6, 3.3), '#1e1024'); p.flat(E(56, 63, 2.6, 3.3), '#1e1024');
      p.flat(C(45.6, 62, 1), '#9af0d6'); p.flat(C(56.6, 62, 1), '#9af0d6');
    },
  },

  // ------------------------------------------------------------------ dochtmotte
  dochtmotte: {
    anim: 1.6, shadow: [50, 90, 22, 3.4, 0.25],
    draw(p, o) {
      const ph = phase(o.t, 1.6), f = 0.5 + 0.5 * Math.sin(ph) * 0.7 + 0.15 * Math.sin(ph * 3);
      const W = '#cdb58c', WD = '#8a7454', BODY = '#7a6048';
      p.glow(11, 17, 11, LIGHT.brazier, 0.1 + 0.06 * f, 2); p.glow(89, 17, 11, LIGHT.brazier, 0.1 + 0.06 * f, 2);
      const upper = 'M53 41 Q 60 21 78 11 Q 93 6 96 17 Q 96 32 86 42 Q 72 50 55 48 Z';
      const lower = 'M54 50 Q 70 51 80 60 Q 86 73 75 77 Q 63 77 55 60 Z';
      const tip = 'M78 11 Q 93 6 96 17 Q 96 24 92 29 Q 84 22 78 11 Z';
      const ctx = p.ctx;
      for (const side of [-1, 1]) {
        ctx.save(); const lx = p.lx;
        if (side < 0) { ctx.translate(100, 0); ctx.scale(-1, 1); p.lx = -p.lx; }
        p.tone(P(lower), mix(W, WD, 0.25), WD, 1);
        p.flat(C(70, 66, 3.6), WD);
        p.tone(P(upper), W, WD, 1.2);
        p.flat(P('M58 44 Q 72 40 86 30 Q 74 44 58 46 Z'), WD);
        p.flat(C(73, 29, 5), WD); p.flat(C(73, 29, 2.4), mix(W, '#fff', 0.2));
        p.flat(P(tip), PAL.ember);
        p.flat(C(90.5, 16.5, 3.2), mix(PAL.amber, '#fff6d0', 0.6 * f));
        p.lx = lx; ctx.restore();
      }
      p.line(P('M48 26 Q 42 14 34 9'), BODY, 1.8); p.line(P('M52 26 Q 58 14 66 9'), BODY, 1.8);
      p.tone(E(50, 52, 6.5, 17), BODY, dk(BODY, 0.45), 0.6);
      p.lineFlat(P('M45 54 L 55 54 M45.5 60 L 54.5 60 M46.5 66 L 53.5 66'), dk(BODY, 0.45), 1.4);
      p.tone(C(50, 37, 7.5), lt(BODY, 0.3), BODY, 0.6);
      p.tone(C(50, 28, 5.2), BODY, dk(BODY, 0.4), 0.4);
      p.flat(C(47.6, 28, 1.6), '#1a1218'); p.flat(C(52.4, 28, 1.6), '#1a1218');
    },
  },

  // ------------------------------------------------------------------ schattenhund
  schattenhund: {
    shadow: [52, 87, 38, 5, 0.42],
    draw(p) {
      const H = '#2f3456', HL = '#4a527e', HD = '#1c1f36', EYE = '#ff6a3a';
      p.glow(82, 41, 11, EYE, 0.16, 2);
      p.fill(P('M25 52 Q 10 47 3 34 Q 12 40 17 38 Q 9 30 11 20 Q 18 33 28 44 Z'), H);
      p.line(P('M33 66 L 29 86'), HD, 5); p.line(P('M68 64 L 72 86'), HD, 5);
      p.fill(P('M34 47 L 38 35 L 43 45 L 49 32 L 54 43 L 60 33 L 63 42 Z'), H);
      p.tone(P('M21 58 Q 23 44 40 44 L 62 42 Q 69 36 73 31 L 84 35 Q 94 39 97 47 L 89 52 Q 81 54 77 56 Q 73 66 64 68 L 34 70 Q 21 68 21 58 Z'), HL, H, 1.3);
      p.fill(poly([72, 34, 69, 19, 78, 31]), H); p.fill(poly([77, 33, 79, 20, 83, 34]), HL);
      p.line(P('M39 66 Q 36 76 40 86'), H, 5.5); p.line(P('M62 64 Q 65 76 60 86'), H, 5.5);
      p.flat(poly([77, 40, 87, 38.5, 84.5, 43]), EYE); p.flat(C(83.5, 40.5, 1.1), '#fff0c0');
      p.flat(poly([86, 50, 88, 54, 90, 50]), PAL.bone); p.flat(poly([91, 49.5, 92.5, 52.5, 94, 49]), PAL.bone);
      p.flat(P('M26 56 Q 34 47 48 47 Q 36 51 30 60 Z'), lt(HL, 0.15));
    },
  },

  // ------------------------------------------------------------------ grubengeist
  grubengeist: {
    anim: 2.4, alpha: 0.8, shadow: [50, 91, 16, 3, 0.22],
    draw(p, o) {
      const ph = phase(o.t, 2.4), w = Math.sin(ph) * 4, bob = Math.sin(ph + 0.8) * 1.6;
      const G = '#a9e9de', GD = '#5fa8a6', HOLE = '#1b3540';
      const ctx = p.ctx; ctx.save(); ctx.translate(0, bob);
      p.glow(50, 50, 30, LIGHT.ghost, 0.08, 2);
      p.fill(wavyPath(`M31 48 Q ${16 + w * 0.4} 54 ${11 + w * 0.5} 44 Q 21 47 31 41 Z`), GD);
      p.tone(wavyPath(`M50 15 C 29 15 25 32 27 50 C 29 64 ${23 + w} 76 ${17 + w} 89 Q ${30 + w * 0.6} 82 38 90 Q 45 80 52 90 Q 60 80 ${68 - w * 0.5} 89 Q ${73 - w} 74 71 60 C 77 42 72 15 50 15 Z`), G, GD, 1.4);
      p.toneS(wavyPath(`M69 46 Q ${84 - w * 0.4} 50 ${90 - w * 0.5} 40 Q 80 44 70 39 Z`), G, GD, 0.5);
      p.flat(E(43, 37, 4.2, 5.8), HOLE); p.flat(E(57, 37, 4.2, 5.8), HOLE);
      p.flat(E(50, 52, 4.2, 6.5), HOLE);
      p.tone(P('M31 25 Q 33 7 50 7 Q 67 7 69 25 Z'), '#cfa656', '#86662c', 0.8);
      p.fill(R(27, 22.5, 46, 5.5, 2.7), '#a07e38');
      p.fill(C(50, 15.5, 5.2), '#5c5a64');
      p.flat(C(50, 15.5, 3.2), '#c8fff6');
      ctx.restore();
    },
  },

  // ------------------------------------------------------------------ troll
  troll: {
    shadow: [50, 88, 42, 6, 0.45],
    draw(p) {
      const T = '#7c9270', TD = '#48593f', TL = '#a2b88a', CLOTH = '#6e4c32';
      p.line(P('M26 34 Q 12 54 15 75'), TD, 11);
      p.tone(C(15, 79, 7.5), mix(T, TD, 0.4), TD, 0.5);
      p.tone(R(29, 68, 15, 19, 5), mix(T, TD, 0.3), TD, 0.6); p.tone(R(55, 68, 15, 19, 5), T, TD, 0.6);
      p.fill(E(36, 88, 10, 3.6), TD); p.fill(E(64, 88, 10, 3.6), TD);
      p.tone(P('M28 64 L 72 64 L 68 80 L 50 75 L 32 80 Z'), CLOTH, dk(CLOTH, 0.45), 0.6);
      p.tone(P('M17 60 Q 10 28 40 16 Q 61 9 77 23 Q 92 36 85 60 Q 79 72 50 71 Q 23 71 17 60 Z'), T, TD, 2);
      p.flat(E(54, 55, 17, 10), mix(T, TL, 0.45));
      p.flat(C(30, 28, 3.4), '#6fae94'); p.flat(C(39, 21, 2.4), '#6fae94'); p.flat(C(25, 37, 2), '#6fae94');
      // club held upright in the near fist
      p.tone(P('M84 82 L 90 82 Q 93 50 98 34 Q 100 24 92 20 Q 84 20 84 32 Q 86 52 84 82 Z'), '#9a6a3c', '#5e3c22', 0.8);
      p.flat(C(91, 32, 1.6), '#5e3c22'); p.flat(C(89, 46, 1.3), '#5e3c22');
      p.toneS(P('M60 30 Q 60 16 72 16 Q 86 16 86 30 Q 86 42 74 44 Q 62 44 60 30 Z'), TL, mix(T, TD, 0.3), 0.8);
      p.flat(P('M61 26 Q 73 19 86 23 L 86 27.5 Q 74 24 63 30 Z'), TD);
      p.flat(C(78, 31, 2.3), '#ffd84a');
      p.flat(P('M66 37 Q 75 41 84 36 L 83 40 Q 75 44 67 41 Z'), TD);
      p.flat(poly([68, 39, 69.5, 31, 72, 39]), PAL.bone); p.flat(poly([78, 38.5, 80, 30.5, 82, 38.5]), PAL.bone);
      p.lineS(P('M70 44 Q 84 52 84 70'), T, 12);
      p.toneS(C(86, 74, 8.5), T, TD, 0.6);
      p.lineFlat(P('M81 72 L 91 72 M81 76.5 L 91 76.5'), TD, 1.3);
    },
  },

  // ------------------------------------------------------------------ aschepriester
  aschepriester: {
    anim: 1.4, shadow: [50, 88, 28, 5, 0.4],
    draw(p, o) {
      const ph = phase(o.t, 1.4), f = 0.5 + 0.35 * Math.sin(ph) + 0.15 * Math.sin(ph * 2 + 2);
      const RB = '#918b84', RD = '#5c5752', CH = '#2b2729', EMB = PAL.ember;
      p.glow(78, 14, 15, LIGHT.brazier, 0.1 + 0.05 * f, 3);
      p.lineFlat(P(`M78 7 Q ${73 + f * 2} 3 ${79 + f} -2`), 'rgba(150,140,140,0.55)', 2);
      p.line(P('M78 18 L 76 88'), '#3e302a', 3.8);
      p.fill(P('M71.5 14 Q 72 4 78 7 Q 84 4 84.5 14 Q 81 20 78 20 Q 75 20 71.5 14 Z'), '#2e2626');
      p.flat(C(78, 13, 4.3), mix(EMB, PAL.amber, 0.3 * f));
      p.flat(C(77.2, 12, 2.1), mix(PAL.amber, '#fff2c8', f));
      p.tone(P('M50 20 C 38 22 34 36 32 52 L 23 88 L 77 88 L 68 52 C 66 36 62 22 50 20 Z'), RB, RD, 1.4);
      p.flat(P('M23 88 L 27 78 L 33 84 L 39 76 L 45 84 L 51 77 L 57 85 L 63 77 L 69 84 L 74 79 L 77 88 Z'), CH);
      p.flat(C(33, 84.5, 1.4), EMB); p.flat(C(57, 85.5, 1.3), EMB); p.flat(C(45.5, 83, 1.1), PAL.amber); p.flat(C(69, 84.5, 1.1), EMB);
      p.flat(P('M37 54 L 65 52 L 65.5 58 L 36.5 60 Z'), '#7a3a2c');
      p.flat(P('M44 58 L 48 58 L 47 72 L 43 72 Z'), '#7a3a2c');
      p.tone(P('M50 5 Q 38 10 36 26 Q 36 36 40 41 L 62 41 Q 66 34 64 24 Q 62 12 50 5 Z'), RB, RD, 1);
      p.flat(E(53, 29, 7, 8.5), '#140f16');
      p.flat(C(51, 28, 1.6), EMB); p.flat(C(57, 28, 1.6), EMB);
      p.lineS(P('M60 46 Q 69 51 75 46'), RB, 7);
      p.fill(C(77, 46, 3.6), '#9c8e80');
    },
  },

  // ------------------------------------------------------------------ steinwaechter
  steinwaechter: {
    shadow: [50, 90, 32, 5, 0.42],
    draw(p, o) {
      const awake = !o.dormant;
      const S = '#90949e', SD = '#5c606c', SL = '#b2b6be', GLW = '#7ff0dc', SLOT = '#2a2c34';
      if (awake) p.glow(50, 19, 13, GLW, 0.14, 2);
      // plinth
      p.tone(R(16, 80, 68, 10, 1.5), SL, SD, 0.5);
      p.tone(R(21, 75, 58, 6, 1), S, SD, 0.4);
      // robed lower body
      p.tone(P('M30 58 L 70 58 L 74 76 L 26 76 Z'), mix(S, SD, 0.2), SD, 0.8);
      p.lineFlat(P('M38 62 L 36 76 M62 62 L 64 76'), SD, 1.4);
      // broad torso with rounded pauldrons
      p.tone(P('M18 38 Q 18 26 32 26 L 68 26 Q 82 26 82 38 L 74 46 L 70 60 L 30 60 L 26 46 Z'), S, SD, 1.4);
      p.flat(P('M20 34 Q 22 28 32 28 L 34 30 Q 26 31 24 38 Z'), SL);
      // greatsword planted in front, hands folded on the pommel
      p.tone(R(45.5, 49, 9, 29, 1), SL, mix(S, SD, 0.4), 0.5);
      p.flat(poly([50, 78, 45.5, 72, 54.5, 72]), mix(S, SD, 0.4));
      p.flat(poly([50, 53, 53, 59, 50, 65, 47, 59]), awake ? GLW : '#6f737e');
      p.tone(R(34, 45, 32, 5, 2), S, SD, 0.4);
      p.line(P('M27 38 L 42 42'), mix(S, SD, 0.15), 8.5); p.line(P('M73 38 L 58 42'), mix(S, SD, 0.15), 8.5);
      p.toneS(R(39, 37, 22, 9, 4), S, SD, 0.5);
      p.lineFlat(P('M50 38 L 50 45'), SD, 1.4);
      // great helm
      p.toneS(P('M38 28 L 38 13 Q 38 4 50 4 Q 62 4 62 13 L 62 28 Q 50 31 38 28 Z'), S, SD, 0.7);
      p.flat(R(48.6, 4, 2.8, 24, 0.5), SL);
      p.flat(R(40.5, 14.5, 19, 5, 1.2), SLOT);
      p.flat(R(42, 15.4, 5.6, 3.2, 1), awake ? GLW : '#44464f'); p.flat(R(52.4, 15.4, 5.6, 3.2, 1), awake ? GLW : '#44464f');
      p.lineFlat(P('M28 44 L 32 50 L 30 56 M70 42 L 67 48'), SD, 1.3);
    },
  },

  // ------------------------------------------------------------------ kristallschrecke
  kristallschrecke: {
    shadow: [50, 88, 34, 5, 0.4],
    draw(p) {
      const K = '#8acdf2', KD = '#3e6ea6', KL = '#e2f6ff', KM = '#5f9ad0';
      p.glow(73, 28, 11, '#bfeaff', 0.13, 2);
      p.line(P('M52 64 L 47 87'), KD, 3); p.line(P('M60 64 L 67 87'), KD, 3);
      p.tone(poly([44, 63, 19, 29, 28, 26, 51, 57]), KM, KD, 0.6);
      p.tone(poly([19, 29, 11, 87, 16, 87, 27, 31]), KM, KD, 0.4);
      p.tone(poly([8, 72, 30, 55, 57, 57, 53, 70, 30, 75]), K, KD, 1);
      p.flat(poly([12, 71, 30, 58, 34, 66]), KL); p.flat(poly([34, 60, 53, 59, 40, 68]), mix(K, KL, 0.5));
      p.tone(poly([50, 60, 63, 39, 72, 43, 61, 66]), K, KD, 0.7);
      p.flat(poly([54, 58, 63, 42, 66, 44]), KL);
      p.line(P('M66 45 L 80 41'), KD, 3.4); p.tone(poly([79, 38, 90, 55, 87, 57, 76, 43]), KM, KD, 0.4);
      p.toneS(poly([64, 41, 84, 33, 87, 38, 69, 47]), K, KD, 0.5);
      p.toneS(poly([84, 33, 97, 51, 93, 54, 82, 40]), K, KD, 0.5);
      p.flat(poly([87, 41, 91, 44, 89, 45]), KL); p.flat(poly([90, 46, 94, 49, 92, 50]), KL);
      p.line(P('M76 22 L 89 5'), K, 1.6); p.line(P('M72 22 L 80 4'), KM, 1.4);
      p.toneS(poly([61, 28, 81, 21, 79, 36, 66, 39]), K, KD, 0.6);
      p.flat(poly([62, 28, 72, 25, 66, 33]), KL);
      p.flat(C(74, 28, 3.4), '#ffffff'); p.flat(C(75, 28.4, 1.3), KD);
    },
  },

  // ------------------------------------------------------------------ tiefenwurm
  tiefenwurm: {
    shadow: null,
    draw(p) {
      const F = '#bd7682', FD = '#7a4052', FL = '#dca0a8', MAW = '#3a0e1a';
      p.fill(E(36, 86, 30, 7), '#0a0a12');
      p.fill(C(10, 84, 3.6), '#6a5848'); p.fill(C(64, 87, 3), '#6a5848'); p.fill(C(58, 81, 2.4), '#5a4a3c');
      const seg = [[36, 77, 16], [28, 61, 15.5], [28, 45, 15], [36, 31, 14.5], [50, 24, 14]];
      for (const [x, y, r] of seg) {
        p.toneS(C(x, y, r), F, FD, 1.2);
        p.lineFlat(P(`M${x - r * 0.75} ${y - r * 0.45} Q ${x - r * 0.95} ${y + r * 0.1} ${x - r * 0.55} ${y + r * 0.7}`), FL, 1.6);
      }
      p.toneS(C(69, 31, 20), F, FD, 1.6);
      p.flat(C(72, 32, 13.5), MAW);
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * TAU, c = Math.cos(a), s = Math.sin(a);
        const x = 72 + c * 13.5, y = 32 + s * 13.5, nx = -c, ny = -s, tx = -s, ty = c;
        p.flat(poly([x + tx * 2.6, y + ty * 2.6, x + nx * 6.5, y + ny * 6.5, x - tx * 2.6, y - ty * 2.6]), PAL.bone);
      }
      p.flat(C(73.5, 33, 5), '#12040a');
      p.flat(P('M55 18 Q 60 12 68 11 Q 61 15 58 21 Z'), FL);
    },
  },

  // ------------------------------------------------------------------ lichtfresser (boss)
  lichtfresser: {
    anim: 6, over: 0.38, shadow: [50, 90, 32, 6, 0.55],
    draw(p, o) {
      const ph = phase(o.t, 6), ph2 = phase(o.t, 2);
      const V = '#0c0a14', VL = '#2a2242', COR = '#ffe2a0', CORL = '#fff8e6';
      p.glow(50, 2, 44, LIGHT.corona, 0.09, 3);
      if (p.color) {
        const ctx = p.ctx;
        ctx.fillStyle = COR;
        const n = 18;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + ph / n * 2, len = i % 2 ? 31 : 38 + 3 * Math.sin(ph2 + i);
          const w = i % 2 ? 0.09 : 0.12;
          ctx.beginPath();
          ctx.moveTo(50 + Math.cos(a - w) * 15, 2 + Math.sin(a - w) * 15);
          ctx.lineTo(50 + Math.cos(a) * len, 2 + Math.sin(a) * len);
          ctx.lineTo(50 + Math.cos(a + w) * 15, 2 + Math.sin(a + w) * 15);
          ctx.fill();
        }
        ctx.fillStyle = CORL; ctx.fill(C(50, 2, 17.5));
      }
      p.line(P('M37 27 Q 21 46 16 70'), V, 7); p.line(P('M63 27 Q 79 46 84 70'), V, 7);
      p.line(P('M16 70 L 9 81 M16 70 L 15 84 M16 70 L 22 81'), V, 2.6);
      p.line(P('M84 70 L 91 81 M84 70 L 85 84 M84 70 L 78 81'), V, 2.6);
      p.tone(P('M50 -15 Q 39 -15 39 0 Q 39 10 44 16 L 34 25 Q 26 40 29 60 L 21 90 L 33 86 L 39 90 L 46 68 L 54 68 L 61 90 L 67 86 L 79 90 L 71 60 Q 74 40 66 25 L 56 16 Q 61 10 61 0 Q 61 -15 50 -15 Z'), VL, V, 1);
      p.flat(P('M50 29 L 53.5 41 L 50 55 L 46.5 41 Z'), COR);
      p.flat(P('M50 34 L 51.5 41 L 50 49 L 48.5 41 Z'), CORL);
      p.flat(E(45, 0, 3.4, 1.5, 0.35), CORL); p.flat(E(55, 0, 3.4, 1.5, -0.35), CORL);
      for (let i = 0; i < 5; i++) {
        const a = ph2 + i * 1.26, x = 50 + Math.cos(a) * (34 + i * 2), y = 62 + Math.sin(a) * 10;
        if (Math.sin(a) > -0.2) p.flat(C(x, y, 1.4 + (i % 2)), COR);
      }
    },
  },
};

export const MONSTER_IDS = [
  'ratte', 'fledermaus', 'kaefer', 'glimmerdieb', 'schleim', 'knochenknecht', 'spinne', 'pilzling',
  'dochtmotte', 'schattenhund', 'grubengeist', 'troll', 'aschepriester', 'steinwaechter',
  'kristallschrecke', 'tiefenwurm', 'lichtfresser',
];
