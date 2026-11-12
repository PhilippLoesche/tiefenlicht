// Tiefenlicht art — items (weapons, armour, consumables, valuables). 100-unit grid.
import { TAU, INK, mix, dk, lt, rgba, P, E, C, R, poly, phase } from './core.js';
import { PAL, LIGHT } from './palette.js';

export const APPEARANCES = {
  potion: {
    azurblau: '#3f7fe0', karminrot: '#d02c42', smaragdgruen: '#2fae62', bernsteingelb: '#f2aa2e',
    violett: '#9150dc', milchweiss: '#eee8dc', russschwarz: '#2c2832', kupferbraun: '#b8662e',
    rosa: '#f490bc', tuerkis: '#2cc6c4',
  },
  wand: {
    eiche: '#8e5e34', knochen: '#e2d6b6', kupfer: '#cc7c42', obsidian: '#2e2440', birke: '#ece8dc', eisen: '#8e96a4',
  },
  ring: {
    rubin: '#d82c40', saphir: '#2e5ed8', smaragd: '#2aae5e', onyx: '#26232c', opal: '#e4ecf4',
    bernstein: '#f2a424', mondstein: '#c4d6f2', granat: '#8e1c34',
  },
};
export function appearanceColor(category, appearance) {
  const t = APPEARANCES[category];
  if (!t) return '#888888';
  return t[appearance] || Object.values(t)[0];
}

const STEEL = PAL.steel, STEEL_DK = PAL.steelDk, STEEL_HI = '#e8eef6';
const WOOD = '#8e5e34', WOOD_DK = '#5a3a20', LEATHER = '#6e4630', LEATHER_DK = '#432a1e';
const BRASS = '#d8a644', BRASS_DK = '#8e6624', GOLD = PAL.gold, GOLD_DK = '#a8741e';

/** Draw in a frame rotated 45° so local "up" points to the upper-right of the tile. */
function diag(p, fn, cx = 50, cy = 52) {
  const x = p.ctx; x.save(); x.translate(cx, cy); x.rotate(Math.PI / 4); p.setRot(Math.PI / 4);
  fn(); x.restore(); p.setRot(0);
}
/** A blade along local -y from y0 up length len, split into lit (left) and shade halves. */
function blade(p, y0, len, w, lit = STEEL_HI, mid = STEEL, dark = STEEL_DK, tipK = 1.3) {
  const h = w / 2, tip = y0 - len;
  p.fill(P(`M${-h} ${y0} L ${-h} ${tip + w * tipK} L 0 ${tip} L ${h} ${tip + w * tipK} L ${h} ${y0} Z`), dark);
  p.flat(P(`M${-h} ${y0} L ${-h} ${tip + w * tipK} L 0 ${tip} L 0 ${y0} Z`), mid);
  p.flat(P(`M${-h} ${y0} L ${-h} ${tip + w * tipK} L ${-h + w * 0.22} ${tip + w * tipK + 1} L ${-h + w * 0.22} ${y0} Z`), lit);
}
function grip(p, y, len, w = 6, c = LEATHER, cd = LEATHER_DK) {
  p.tone(R(-w / 2, y, w, len, 1.5), c, cd, 0.4);
  for (let yy = y + 3; yy < y + len - 1; yy += 3.5) p.lineFlat(P(`M${-w / 2} ${yy} L ${w / 2} ${yy + 1.5}`), cd, 1);
}
function sword(p, { len, w, guard, gripLen, guardC = BRASS, guardD = BRASS_DK, lit, mid, dark, fuller = true }) {
  const total = len + 4 + gripLen + 8, y0 = -total / 2 + len;
  blade(p, y0, len, w, lit, mid, dark);
  if (fuller && p.color) p.lineFlat(P(`M0 ${y0 - 2} L 0 ${y0 - len * 0.72}`), dark || STEEL_DK, 1.3);
  grip(p, y0 + 4, gripLen);
  p.tone(R(-guard / 2, y0, guard, 4.5, 2.2), guardC, guardD, 0.4);
  p.tone(C(0, y0 + 4 + gripLen + 3.5, 4.5), guardC, guardD, 0.4);
  return y0;
}

function shaft(p, y1, y2, w, c = WOOD, cd = WOOD_DK) {
  p.fill(R(-w / 2, y1, w, y2 - y1, w / 2), cd);
  p.flat(R(-w / 2, y1, w * 0.55, y2 - y1, w / 4), c);
}

const W_SHADOW = [53, 57, 38, 6.5, 0.28, -Math.PI / 4];

export const ITEMS = {
  // -------------------------------------------------------------- weapons
  dolch: { shadow: [53, 57, 26, 5.5, 0.28, -Math.PI / 4], draw(p) { diag(p, () => sword(p, { len: 30, w: 9, guard: 18, gripLen: 13 })); } },
  kurzschwert: { shadow: W_SHADOW, draw(p) { diag(p, () => sword(p, { len: 44, w: 10, guard: 24, gripLen: 14 })); } },
  langschwert: {
    shadow: [53, 57, 46, 6.5, 0.28, -Math.PI / 4],
    draw(p) { diag(p, () => sword(p, { len: 60, w: 9.5, guard: 30, gripLen: 18, guardC: '#9aa4b4', guardD: '#5a6474' }), 50, 50); },
  },
  runenklinge: {
    shadow: [53, 57, 42, 6.5, 0.28, -Math.PI / 4],
    draw(p) {
      p.glow(52, 46, 30, LIGHT.rune, 0.1, 3);
      diag(p, () => {
        const y0 = sword(p, { len: 54, w: 11, guard: 26, gripLen: 15, guardC: '#4a3e66', guardD: '#2a2240', lit: '#6a7c94', mid: '#46566e', dark: '#2a3446', fuller: false });
        for (let i = 0; i < 4; i++) {
          const y = y0 - 8 - i * 11;
          p.flat(P(i % 2 ? `M-2 ${y} L 2 ${y - 3} L 2 ${y - 7} L -2 ${y - 4} Z` : `M0 ${y} L 2.6 ${y - 3.5} L 0 ${y - 7} L -2.6 ${y - 3.5} Z`), LIGHT.rune);
        }
        p.flat(C(0, y0 + 2.2, 2), LIGHT.rune);
      });
    },
  },
  speer: {
    shadow: [53, 57, 46, 5.5, 0.26, -Math.PI / 4],
    draw(p) {
      diag(p, () => {
        shaft(p, -30, 50, 5);
        p.fill(P('M0 -58 Q 8.5 -42 4.5 -30 L -4.5 -30 Q -8.5 -42 0 -58 Z'), STEEL_DK);
        p.flat(P('M0 -58 Q -8.5 -42 -4.5 -30 L 0 -30 Z'), STEEL);
        p.flat(P('M0 -56 Q -6 -42 -3.5 -32 L -2.2 -32 Q -4 -42 0 -56 Z'), STEEL_HI);
        p.tone(R(-3.8, -31, 7.6, 7, 1.5), LEATHER, LEATHER_DK, 0.3);
        p.tone(R(-3.5, 46, 7, 6, 2), STEEL, STEEL_DK, 0.3);
      }, 50, 50);
    },
  },
  spitzhacke: {
    shadow: W_SHADOW,
    draw(p) {
      diag(p, () => {
        shaft(p, -34, 44, 6.5);
        p.fill(P('M-36 -18 Q -18 -42 0 -40 Q 18 -42 36 -18 Q 16 -32 0 -31 Q -16 -32 -36 -18 Z'), STEEL_DK);
        p.flat(P('M-36 -18 Q -18 -42 0 -40 L 0 -36 Q -18 -36 -36 -18 Z'), STEEL);
        p.flat(P('M0 -40 Q 18 -42 36 -18 Q 18 -38 0 -37 Z'), STEEL);
        p.tone(R(-5.5, -42, 11, 13, 2), '#7c8494', '#4a5262', 0.4);
        p.fill(C(0, 46, 3.6), WOOD_DK);
      }, 52, 54);
    },
  },
  streitkolben: {
    shadow: W_SHADOW,
    draw(p) {
      diag(p, () => {
        shaft(p, -20, 42, 6, '#6e5640', '#463424');
        for (let y = 26; y < 42; y += 4) p.lineFlat(P(`M-3 ${y} L 3 ${y + 1.5}`), '#2e2218', 1.2);
        p.fill(poly([0, -50, 3.5, -40, -3.5, -40]), STEEL_DK);
        p.fill(poly([-18, -30, -9, -36, -9, -24]), STEEL_DK); p.fill(poly([18, -30, 9, -36, 9, -24]), STEEL_DK);
        p.fill(poly([-14, -42, -6, -38, -10, -32]), STEEL_DK); p.fill(poly([14, -42, 6, -38, 10, -32]), STEEL_DK);
        p.fill(poly([-14, -18, -6, -22, -10, -28]), STEEL_DK); p.fill(poly([14, -18, 6, -22, 10, -28]), STEEL_DK);
        p.tone(C(0, -30, 11), STEEL, STEEL_DK, 0.9);
        p.flat(C(-3.5, -33.5, 3), STEEL_HI);
        p.tone(R(-4.5, -21, 9, 5, 1.5), '#7c8494', '#4a5262', 0.3);
        p.tone(C(0, 45, 4), '#7c8494', '#4a5262', 0.3);
      }, 50, 52);
    },
  },
  kriegsaxt: {
    shadow: W_SHADOW,
    draw(p) {
      diag(p, () => {
        shaft(p, -44, 46, 6);
        p.fill(poly([-3, -36, -17, -30, -3, -24]), STEEL_DK);
        p.fill(P('M2 -42 L 10 -40 Q 30 -54 38 -34 Q 40 -14 30 -2 Q 22 -18 10 -18 L 2 -18 Z'), STEEL_DK);
        p.flat(P('M2 -42 L 10 -40 Q 30 -54 38 -34 Q 39 -26 36 -18 Q 30 -30 10 -28 L 2 -28 Z'), STEEL);
        p.flat(P('M30 -46 Q 36 -42 38 -34 Q 39 -26 36 -18 L 33 -20 Q 35 -28 34 -34 Q 33 -40 28 -44 Z'), STEEL_HI);
        p.tone(R(-4.5, -44, 9, 28, 2), '#7c8494', '#4a5262', 0.4);
        p.fill(C(0, 48, 3.6), WOOD_DK);
      }, 48, 54);
    },
  },
  wurfmesser: {
    shadow: [50, 82, 30, 6, 0.28],
    draw(p) {
      const x = p.ctx;
      for (const a of [-0.55, 0, 0.55]) {
        x.save(); x.translate(50, 80); x.rotate(a); p.setRot(a);
        p.fill(P('M0 -66 Q 6 -54 4.5 -40 L -4.5 -40 Q -6 -54 0 -66 Z'), STEEL_DK);
        p.flat(P('M0 -66 Q -6 -54 -4.5 -40 L 0 -40 Z'), STEEL);
        p.flat(P('M0 -63 Q -4.5 -54 -3.2 -42 L -2 -42 Q -3 -54 0 -63 Z'), STEEL_HI);
        p.tone(R(-3.2, -40, 6.4, 18, 1.5), '#3e3a48', '#24222c', 0.3);
        p.lineFlat(P('M-3 -34 L 3 -32 M-3 -29 L 3 -27'), '#6e6a7a', 1);
        p.line(P('M0 -17.5 m -3.5 0 a 3.5 3.5 0 1 0 7 0 a 3.5 3.5 0 1 0 -7 0'), STEEL, 2);
        x.restore(); p.setRot(0);
      }
    },
  },

  // -------------------------------------------------------------- armour
  lederwams: {
    shadow: [50, 86, 26, 4.5, 0.3],
    draw(p) {
      const L = '#a5703f', LD = '#674326';
      p.tone(P('M30 22 L 42 18 Q 50 27 58 18 L 70 22 L 81 40 L 70 47 L 68 84 L 32 84 L 30 47 L 19 40 Z'), L, LD, 1.3);
      p.flat(P('M42 18 Q 50 27 58 18 L 56 17 Q 50 23 44 17 Z'), LD);
      p.lineFlat(P('M50 26 L 50 84'), LD, 2.4);
      p.lineFlat(P('M46 32 L 54 38 M54 32 L 46 38 M46 42 L 54 48 M54 42 L 46 48 M46 52 L 54 58 M54 52 L 46 58'), PAL.bone, 1.4);
      p.flat(R(32, 66, 36, 6, 1), LD); p.flat(R(46, 65, 8, 8, 1.5), BRASS); p.flat(R(48.3, 67.3, 3.4, 3.4, 0.5), LD);
      p.lineFlat(P('M33 76 L 67 76'), mix(L, LD, 0.5), 1.4);
      p.lineFlat(P('M30 47 L 36 44 M70 47 L 64 44'), LD, 1.6);
    },
  },
  nietenruestung: {
    shadow: [50, 86, 26, 4.5, 0.3],
    draw(p) {
      const L = '#7a5236', LD = '#4a3020';
      p.tone(P('M30 22 L 42 18 Q 50 27 58 18 L 70 22 L 81 40 L 70 47 L 68 84 L 32 84 L 30 47 L 19 40 Z'), L, LD, 1.3);
      p.flat(P('M42 18 Q 50 27 58 18 L 56 17 Q 50 23 44 17 Z'), LD);
      for (let y = 32; y < 82; y += 8) for (let x = 37 + ((y / 8) % 2) * 4; x < 66; x += 8) {
        p.flat(C(x + 0.5, y + 0.6, 2.1), LD); p.flat(C(x, y, 1.9), '#c4ccd8'); p.flat(C(x - 0.6, y - 0.6, 0.7), '#ffffff');
      }
      p.flat(C(25, 37, 1.9), '#c4ccd8'); p.flat(C(75, 37, 1.9), '#c4ccd8');
      p.flat(R(32, 63, 36, 5, 1), '#2e1e14');
    },
  },
  kettenhemd: {
    shadow: [50, 87, 28, 4.5, 0.3],
    draw(p) {
      const M = '#a6b0be', MD = '#5c6678';
      const shirt = P('M30 20 L 42 16 Q 50 24 58 16 L 70 20 L 84 50 L 74 54 L 68 44 L 69 86 L 61 82 L 55 87 L 49 82 L 43 87 L 37 82 L 31 86 L 32 44 L 26 54 L 16 50 Z');
      p.tone(shirt, M, MD, 1.3);
      if (p.color) {
        const x = p.ctx; x.save(); x.clip(shirt);
        x.strokeStyle = rgba(MD, 0.9); x.lineWidth = 1.2;
        for (let y = 24; y < 90; y += 4.2) {
          const off = (Math.round(y / 4.2) % 2) * 2.2;
          x.beginPath();
          for (let xx = 12 + off; xx < 90; xx += 4.4) { x.moveTo(xx + 2, y); x.arc(xx, y, 2, 0, Math.PI); }
          x.stroke();
        }
        x.restore();
      }
      p.flat(P('M42 16 Q 50 24 58 16 L 56 15 Q 50 21 44 15 Z'), MD);
      p.flat(P('M34 26 Q 38 22 44 22 Q 38 30 36 44 Z'), rgba('#f0f6ff', 0.5));
    },
  },
  schuppenpanzer: {
    shadow: [50, 86, 26, 4.5, 0.3],
    draw(p) {
      const S = '#b8944c', SD = '#6e5426', SL = '#e2c27a';
      const body = P('M30 22 L 42 18 Q 50 27 58 18 L 70 22 L 81 40 L 70 47 L 68 84 L 32 84 L 30 47 L 19 40 Z');
      p.tone(body, S, SD, 1);
      if (p.color) {
        const x = p.ctx; x.save(); x.clip(body);
        let row = 0;
        for (let y = 22; y < 90; y += 6, row++) {
          for (let xx = 14 + (row % 2) * 4; xx < 90; xx += 8) {
            x.fillStyle = SD; x.beginPath(); x.arc(xx, y, 4.6, 0, Math.PI); x.fill();
            x.fillStyle = row < 3 || xx < 50 ? mix(S, SL, 0.35) : S; x.beginPath(); x.arc(xx - 0.4, y - 0.6, 3.6, 0, Math.PI); x.fill();
          }
        }
        x.restore();
      }
      p.flat(P('M42 18 Q 50 27 58 18 L 56 17 Q 50 23 44 17 Z'), SD);
      p.flat(R(32, 70, 36, 5, 1), '#4a3420');
    },
  },
  plattenharnisch: {
    shadow: [50, 86, 28, 4.5, 0.3],
    draw(p) {
      const M = '#ccd6e2', MD = '#66728a', ML = '#f4f8ff';
      p.tone(P('M33 60 L 67 60 L 69 72 Q 50 77 31 72 Z'), M, MD, 0.5);
      p.tone(P('M33 71 L 67 71 L 68 82 Q 50 87 32 82 Z'), mix(M, MD, 0.2), MD, 0.5);
      p.tone(P('M29 26 Q 50 18 71 26 L 69 58 Q 50 70 31 58 Z'), M, MD, 1.5);
      p.flat(P('M50 22 L 50 66 Q 60 62 69 58 L 71 26 Q 61 22 50 22 Z'), rgba(MD, 0.45));
      p.lineFlat(P('M50 23 L 50 66'), ML, 1.6);
      p.flat(P('M35 30 Q 40 26 46 26 Q 40 34 39 50 Q 35 42 35 30 Z'), ML);
      p.toneS(E(26, 30, 12, 9, -0.3), M, MD, 0.6);
      p.toneS(E(74, 30, 12, 9, 0.3), M, MD, 0.6);
      p.lineFlat(P('M16 34 Q 26 26 36 30 M64 30 Q 74 26 84 34'), BRASS, 2);
      p.lineFlat(P('M31 58 Q 50 70 69 58'), BRASS, 2.2);
      p.flat(P('M41 21 Q 50 25 59 21 L 58 18 Q 50 21 42 18 Z'), BRASS);
    },
  },

  // -------------------------------------------------------------- consumables
  potion: {
    shadow: [50, 86, 20, 4, 0.32],
    draw(p, o) {
      const L = appearanceColor('potion', o.appearance);
      const body = C(50, 62, 23);
      p.tone(R(42.5, 22, 15, 20, 2.5), '#3a4862', '#252e42', 0.4);
      p.tone(R(40.5, 13, 19, 11, 3), '#c49464', '#7a5434', 0.5);
      p.fill(R(39, 39, 22, 5, 2.4), '#4a5876');
      p.tone(body, '#3a4862', '#252e42', 0.8);
      if (p.color) {
        const x = p.ctx; x.save(); x.clip(body);
        x.beginPath(); x.rect(20, 52, 60, 40); x.clip();
        x.fillStyle = dk(L, 0.38); x.fillRect(20, 52, 60, 40);
        x.fillStyle = L; x.fill(C(46.5, 58.5, 23));
        x.fillStyle = lt(L, 0.4); x.fill(E(50, 52, 22, 3.2));
        x.fillStyle = lt(L, 0.55);
        x.fill(C(58, 70, 2.2)); x.fill(C(52, 76, 1.5)); x.fill(C(62, 62, 1.3));
        x.restore();
      }
      p.flat(P('M33 54 Q 35 44 44 41 Q 38 48 37 60 Z'), rgba('#eaf4ff', 0.85));
      p.flat(C(36, 66, 1.6), rgba('#eaf4ff', 0.6));
    },
  },
  scroll: {
    shadow: [50, 85, 30, 4.5, 0.3],
    draw(p) {
      const PA = '#ead9b0', PAD = '#b4a07a', PAL2 = '#fbf0d4';
      p.tone(R(25, 29, 50, 44, 1), PA, PAD, 0.8);
      p.lineFlat(P('M32 38 L 62 38 M32 45 L 68 45 M32 52 L 58 52 M32 59 L 66 59'), '#9a8460', 2);
      p.tone(R(20, 22, 60, 11, 5.5), PAL2, PAD, 0.6);
      p.tone(R(20, 68, 60, 11, 5.5), PAL2, PAD, 0.6);
      p.flat(E(20.5, 27.5, 3, 5.5), PAD); p.flat(E(20.5, 73.5, 3, 5.5), PAD);
      p.fill(P('M58 70 L 54 90 L 59 86 L 62 91 L 64 72 Z'), '#a82a30');
      p.tone(C(62, 70, 7), '#d0383a', '#8a1e26', 0.5);
      p.flat(C(61, 69, 2.6), '#e86a5a');
    },
  },
  wand: {
    shadow: [53, 57, 34, 5, 0.28, -Math.PI / 4],
    draw(p, o) {
      const ap = o.appearance || 'eiche';
      const M = appearanceColor('wand', ap);
      const MD = ap === 'obsidian' ? '#140f20' : dk(M, 0.45), ML = ap === 'obsidian' ? '#7a62b0' : lt(M, 0.35);
      diag(p, () => {
        p.fill(R(-4.5, -40, 9, 82, 4.5), MD);
        p.flat(R(-4.5, -40, 5.2, 82, 2.6), M);
        p.flat(R(-3.6, -38, 1.6, 78, 0.8), ML);
        if (ap === 'birke') for (const y of [-30, -14, 4, 22]) p.flat(R(-3.6, y, 5 + (y % 3), 2, 1), '#2a2628');
        if (ap === 'eiche') p.lineFlat(P('M1 -34 L 1 -10 M -1 4 L -1 30'), MD, 1);
        if (ap === 'knochen') { p.tone(C(0, 40, 5.5), M, MD, 0.4); p.tone(E(0, -2, 5, 3.5), M, MD, 0.3); }
        if (ap === 'kupfer') { p.flat(C(1, -6, 1.3), '#5ab890'); p.flat(C(-1, 18, 1.1), '#5ab890'); }
        if (ap === 'eisen') for (const y of [-26, 0, 26]) p.tone(R(-4.6, y, 9.2, 4, 1), lt(M, 0.2), MD, 0.3);
        if (ap === 'obsidian') p.fill(poly([0, -54, 5, -42, 0, -38, -5, -42]), M);
        p.tone(R(-4.6, 16, 9.2, 22, 2.5), LEATHER, LEATHER_DK, 0.3);
        p.lineFlat(P('M-4 21 L 4 23 M-4 26 L 4 28 M-4 31 L 4 33'), LEATHER_DK, 1.2);
        if (ap !== 'obsidian') p.tone(C(0, -43, 5.2), ML, M, 0.5);
        p.flat(poly([0, -53, 1.6, -46, 8, -44, 1.6, -42, 0, -35, -1.6, -42, -8, -44, -1.6, -46]), '#fff6d8');
      }, 50, 54);
    },
  },
  ring: {
    shadow: [50, 82, 24, 4.5, 0.3],
    draw(p, o) {
      const G = appearanceColor('ring', o.appearance);
      const band = new Path2D();
      band.ellipse(50, 62, 23, 17, 0, 0, TAU); band.ellipse(50, 64.5, 14.5, 9.5, 0, 0, TAU, true);
      p.tone(band, '#f0c454', '#9a6c1e', 1.2);
      p.flat(P('M30 56 Q 34 49 42 47 Q 36 52 34 60 Z'), '#fff0b0');
      p.fill(poly([40, 48, 44, 38, 56, 38, 60, 48]), '#c8942e');
      p.tone(C(50, 36, 11.5), G, dk(G, 0.5), 1);
      p.flat(poly([43, 34, 47, 28, 53, 28, 50, 34]), lt(G, 0.5));
      if (o.appearance === 'opal') { p.flat(C(53, 40, 2.4), '#f4a6c8'); p.flat(C(45, 39, 2), '#9ae4c8'); p.flat(C(55, 33, 1.6), '#a6c8f4'); }
      if (o.appearance === 'onyx') p.flat(poly([43, 34, 47, 28, 53, 28, 50, 34]), '#6a6676');
      p.flat(C(45.5, 31, 1.7), '#ffffff');
    },
  },
  oelflasche: {
    shadow: [50, 88, 24, 4.5, 0.32],
    draw(p) {
      const T = '#a2acb8', TD = '#5c6676';
      p.line(P('M31 46 Q 18 52 22 68 Q 25 76 31 74'), TD, 3.6);
      p.line(P('M58 34 L 76 18'), TD, 4.4);
      p.fill(R(73, 14, 7, 6, 1.5), '#3a3440');
      p.tone(P('M36 42 L 44 28 L 56 28 L 64 42 Z'), T, TD, 0.6);
      p.tone(R(44, 22, 12, 8, 2), '#7c8494', '#4a5262', 0.4);
      p.tone(R(30, 40, 40, 47, 6), T, TD, 1.3);
      p.flat(R(30, 53, 40, 21, 0), '#e2963a');
      p.flat(R(30, 53, 40, 2.4, 0), '#ffc46a');
      p.flat(P('M50 56 Q 57.5 64 55.5 68.5 Q 50 74.5 44.5 68.5 Q 42.5 64 50 56 Z'), '#4a2814');
      p.flat(C(47.6, 66.5, 1.3), '#ffc46a');
      p.flat(R(33.5, 44, 3, 40, 1.5), '#dce2ea');
    },
  },
  gold: {
    shadow: [50, 84, 32, 6, 0.3],
    draw(p) {
      const coin = (x, y, rx = 10) => { p.fill(E(x, y + 2.4, rx, rx * 0.45), GOLD_DK); p.tone(E(x, y, rx, rx * 0.45), GOLD, '#d49a2c', 0.35); p.flat(E(x, y, rx * 0.55, rx * 0.22), '#e2aa36'); };
      coin(28, 78, 9); coin(72, 80, 9);
      for (let i = 0; i < 4; i++) {
        const y = 74 - i * 5;
        p.fill(E(50, y + 2.6, 13, 5.6), GOLD_DK);
        p.tone(E(50, y, 13, 5.6), GOLD, '#d49a2c', 0.35);
      }
      coin(36, 64, 9); coin(64, 66, 8.5);
      p.fill(E(50, 55.6, 13, 5.6), GOLD_DK); p.tone(E(50, 53, 13, 5.6), '#ffd970', GOLD, 0.35);
      p.flat(E(50, 53, 7, 2.6), '#e2aa36');
      p.flat(poly([60, 40, 61.5, 45, 66, 46.5, 61.5, 48, 60, 53, 58.5, 48, 54, 46.5, 58.5, 45]), '#fff6d0');
    },
  },
  sonnenscherbe: {
    anim: 2, shadow: [50, 88, 18, 4, 0.3],
    draw(p, o) {
      const ph = phase(o.t, 2);
      p.glow(50, 50, 42, LIGHT.sunshard, 0.12 + 0.03 * Math.sin(ph), 3);
      if (p.color) {
        const x = p.ctx;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU + 0.2, len = (i % 2 ? 30 : 40) + 4 * Math.sin(ph + i * 1.7), w = 0.12;
          x.fillStyle = rgba('#fff0b8', 0.55 + 0.3 * Math.sin(ph * 2 + i));
          x.beginPath(); x.moveTo(50 + Math.cos(a - w) * 16, 50 + Math.sin(a - w) * 16);
          x.lineTo(50 + Math.cos(a) * len, 50 + Math.sin(a) * len);
          x.lineTo(50 + Math.cos(a + w) * 16, 50 + Math.sin(a + w) * 16); x.fill();
        }
      }
      p.tone(poly([50, 14, 64, 44, 53, 84, 38, 52]), '#ffe9a0', '#e0a032', 1);
      p.flat(poly([50, 14, 53, 48, 38, 52]), '#fff8dc');
      p.flat(poly([53, 48, 64, 44, 53, 84]), '#f2c060');
      const s = 0.5 + 0.5 * Math.sin(ph * 2);
      const star = (cx, cy, r) => p.flat(poly([cx, cy - r, cx + r * 0.25, cy - r * 0.25, cx + r, cy, cx + r * 0.25, cy + r * 0.25, cx, cy + r, cx - r * 0.25, cy + r * 0.25, cx - r, cy, cx - r * 0.25, cy - r * 0.25]), '#ffffff');
      star(46, 30, 3 + 4 * s); star(60, 64, 2 + 3 * (1 - s));
    },
  },
};

export const ITEM_IDS = Object.keys(ITEMS);
