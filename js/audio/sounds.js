// One-shot effect definitions. Palette: wood, stone, flame, metal.
// Each effect: def(name, reverbSend, level, (h) => { ... }) where `h` is the helper
// bundle from util.js (times relative to the start, frequencies scaled by h.p).

export const SOUNDS = {};
const def = (name, rev, level, fn) => { SOUNDS[name] = { rev, level, fn }; };

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI -> Hz

// ---------------------------------------------------------------- movement / world

def('step', 0.06, 0.55, (h) => {
  h.p *= h.rand(0.8, 1.25);
  h.noise({ color: 'brown', d: 0.09, a: 0.003, g: 1.4, fil: { type: 'lowpass', f: 260, f2: 140 } });
  h.osc({ f: 95, f2: 60, d: 0.08, g: 0.25 });
  h.noise({ color: 'pink', t: 0.004, d: 0.04, g: 0.2, fil: { type: 'bandpass', f: 1400, q: 1 } });
});

def('door', 0.18, 0.8, (h) => {
  // wooden creak: two slightly detuned saws gliding through a narrow band
  const fil = { type: 'bandpass', path: [[0, 300], [0.5, 520], [1, 380]], q: 4 };
  h.osc({ type: 'sawtooth', f: 120, f2: 205, d: 0.38, a: 0.06, g: 0.2, fil, trem: { f: 23, depth: 0.35 } });
  h.osc({ type: 'sawtooth', f: 123, f2: 212, d: 0.38, a: 0.07, g: 0.15, fil, detune: 9 });
  h.noise({ color: 'pink', d: 0.36, a: 0.08, g: 0.1, fil: { type: 'bandpass', f: 900, f2: 1300, q: 3 } });
  // thunk as it settles
  h.osc({ f: 110, f2: 52, t: 0.4, d: 0.16, g: 0.6 });
  h.noise({ color: 'brown', t: 0.4, d: 0.12, g: 1.1, fil: { type: 'lowpass', f: 380 } });
});

def('trap', 0.2, 0.8, (h) => {
  h.noise({ color: 'white', d: 0.04, g: 0.5, fil: { type: 'highpass', f: 2500 } });
  h.fm({ f: 700, ratio: 2.76, idx: 700, d: 0.35, g: 0.17 });
  h.osc({ f: 105, f2: 48, t: 0.02, d: 0.2, g: 0.6 });
  h.noise({ color: 'white', t: 0.03, d: 0.1, g: 0.3, fil: { type: 'bandpass', f: 3500, f2: 1500, q: 1.5 } });
});

def('descend', 0.35, 0.8, (h) => {
  for (let i = 0; i < 3; i++) {
    h.osc({ f: 100 - i * 8, f2: 55 - i * 5, t: i * 0.15, d: 0.12, g: 0.4 });
    h.noise({ color: 'brown', t: i * 0.15, d: 0.1, g: 1.1, fil: { type: 'lowpass', f: 300 - i * 40 } });
  }
  h.osc({ f: 262, f2: 98, t: 0.1, d: 0.9, a: 0.12, g: 0.2 });
  h.osc({ type: 'triangle', f: 393, f2: 147, t: 0.1, d: 0.9, a: 0.14, g: 0.09, detune: 6 });
});

def('monster_notice', 0.15, 1.05, (h) => {
  h.osc({ type: 'triangle', f: 210, f2: 330, d: 0.2, a: 0.05, g: 0.25 });
  h.osc({ type: 'sawtooth', f: 160, f2: 250, d: 0.2, a: 0.05, g: 0.1, fil: { type: 'lowpass', f: 700 } });
  h.noise({ color: 'pink', d: 0.12, a: 0.04, g: 0.06, fil: { type: 'bandpass', f: 1100, q: 2 } });
});

def('boss', 0.45, 0.54, (h) => {
  // low brass-like swell: detuned saws, fifth, opening filter
  const fil = { type: 'lowpass', path: [[0, 140], [0.45, 950], [1, 260]], q: 1.2 };
  const o = { type: 'sawtooth', d: 1.45, a: 0.55, fil };
  h.osc({ ...o, f: 55, g: 0.2 });
  h.osc({ ...o, f: 55.4, g: 0.17, detune: 4 });
  h.osc({ ...o, f: 82.4, g: 0.14 });
  h.osc({ ...o, f: 110.6, g: 0.1, detune: -5 });
  h.osc({ f: 55, d: 1.45, a: 0.4, g: 0.45 });
  h.noise({ color: 'brown', d: 1.3, a: 0.5, g: 0.7, fil: { type: 'lowpass', f: 120 } });
});

// ---------------------------------------------------------------- combat

def('hit', 0.1, 0.9, (h) => {
  h.osc({ f: 170, f2: 55, d: 0.14, g: 0.6 });
  h.osc({ type: 'triangle', f: 320, f2: 140, d: 0.09, g: 0.2 });
  h.noise({ color: 'white', d: 0.07, g: 0.5, fil: { type: 'bandpass', f: 2200, f2: 700, q: 0.9 } });
  h.noise({ color: 'brown', d: 0.1, g: 1.4, fil: { type: 'lowpass', f: 500 } });
});

def('crit', 0.25, 0.85, (h) => {
  h.osc({ f: 190, f2: 50, d: 0.2, g: 0.65 });
  h.osc({ f: 72, f2: 34, t: 0.01, d: 0.4, g: 0.6 });
  h.noise({ color: 'white', d: 0.09, g: 0.65, fil: { type: 'bandpass', f: 3500, f2: 900, q: 0.8 } });
  h.noise({ color: 'brown', d: 0.15, g: 1.6, fil: { type: 'lowpass', f: 650 } });
  // metal ring on top
  h.fm({ f: 1250, ratio: 1.51, idx: 900, d: 0.45, g: 0.09 });
  h.osc({ f: 2330, d: 0.3, g: 0.04 });
});

def('miss', 0.1, 1.36, (h) => {
  h.noise({ color: 'pink', d: 0.24, a: 0.07, g: 0.5, fil: { type: 'bandpass', f: 400, f2: 1900, q: 1.4 } });
  h.noise({ color: 'white', t: 0.03, d: 0.15, a: 0.06, g: 0.05, fil: { type: 'highpass', f: 4000 } });
});

def('hurt', 0.15, 0.9, (h) => {
  h.osc({ f: 115, f2: 48, d: 0.28, g: 0.6 });
  h.osc({ type: 'triangle', f: 225, f2: 170, d: 0.22, g: 0.12 });
  h.noise({ color: 'brown', d: 0.22, g: 1.5, fil: { type: 'lowpass', f: 420, f2: 200 } });
  h.noise({ color: 'pink', d: 0.05, g: 0.15, fil: { type: 'bandpass', f: 1000, q: 1 } });
});

def('kill', 0.3, 0.85, (h) => {
  h.osc({ f: 200, f2: 45, d: 0.4, g: 0.55 });
  h.osc({ type: 'triangle', f: 420, f2: 105, d: 0.25, g: 0.15 });
  h.noise({ color: 'white', d: 0.32, g: 0.3, fil: { type: 'bandpass', f: 1000, f2: 220, q: 1 } });
  h.noise({ color: 'brown', d: 0.18, g: 1.4, fil: { type: 'lowpass', f: 500 } });
  h.noise({ color: 'pink', t: 0.15, d: 0.08, g: 0.1, fil: { type: 'bandpass', f: 600, q: 1.5 } }); // crumble
});

def('throw', 0.08, 1.76, (h) => {
  h.noise({ color: 'pink', d: 0.16, a: 0.04, g: 0.5, fil: { type: 'bandpass', f: 700, f2: 2600, q: 1.6 } });
  h.osc({ type: 'triangle', f: 600, f2: 1500, d: 0.1, a: 0.03, g: 0.04 });
});

// ---------------------------------------------------------------- items

def('pickup', 0.2, 1.20, (h) => {
  h.noise({ color: 'pink', d: 0.07, a: 0.01, g: 0.18, fil: { type: 'bandpass', f: 2500, q: 1 } }); // cloth
  h.osc({ type: 'triangle', f: 660, d: 0.16, g: 0.2 });
  h.osc({ type: 'triangle', f: 990, t: 0.06, d: 0.2, g: 0.17 });
  h.osc({ f: 130, f2: 100, d: 0.06, g: 0.15 });
});

def('gold', 0.35, 1.20, (h) => {
  for (let i = 0; i < 4; i++) {
    const t = i * 0.055 + h.rand(0, 0.02);
    const f = h.rand(2300, 3100);
    h.fm({ f, ratio: 1.41, idx: 700, d: h.rand(0.14, 0.24), t, g: 0.12 });
    h.osc({ f: f * 1.5, t, d: 0.1, g: 0.03 });
  }
  h.noise({ color: 'white', d: 0.03, g: 0.1, fil: { type: 'highpass', f: 5000 } });
});

def('drink', 0.15, 0.8, (h) => {
  [0, 0.1, 0.22].forEach((t, i) => {
    h.osc({ f: 260 + i * 40, f2: 520 + i * 60, t, d: 0.08, a: 0.01, g: 0.28 });
  });
  h.noise({ color: 'pink', d: 0.38, a: 0.05, g: 0.2, fil: { type: 'bandpass', f: 500, f2: 380, q: 3 } });
  h.noise({ color: 'pink', t: 0.3, d: 0.1, g: 0.08, fil: { type: 'bandpass', f: 1800, q: 1 } }); // breath
});

def('read', 0.45, 0.8, (h) => {
  for (let i = 0; i < 5; i++) {
    h.noise({ color: 'white', t: i * 0.04 + h.rand(0, 0.02), d: 0.03, g: 0.2, fil: { type: 'bandpass', f: h.rand(3500, 6500), q: 1.2 } });
  }
  const o = { d: 0.7, a: 0.2, t: 0.15, g: 0.06 };
  h.osc({ ...o, f: 880 });
  h.osc({ ...o, f: 1318.5, detune: 8 });
  h.osc({ ...o, f: 1760, g: 0.03, detune: -6 });
});

def('identify', 0.4, 0.8, (h) => {
  h.osc({ type: 'triangle', f: 784, d: 0.3, g: 0.2 });
  h.osc({ f: 1568, d: 0.22, g: 0.05 });
  h.osc({ type: 'triangle', f: 1175, t: 0.1, d: 0.45, g: 0.2 });
  h.osc({ f: 2350, t: 0.1, d: 0.3, g: 0.05 });
  h.noise({ color: 'white', t: 0.09, d: 0.03, g: 0.06, fil: { type: 'highpass', f: 6000 } });
});

def('equip', 0.12, 1.44, (h) => {
  h.noise({ color: 'pink', d: 0.07, a: 0.015, g: 0.25, fil: { type: 'bandpass', f: 500, q: 1.2 } }); // leather
  h.osc({ f: 125, f2: 80, d: 0.09, g: 0.3 });
  h.fm({ f: 1800, ratio: 1.5, idx: 500, t: 0.06, d: 0.12, g: 0.1 });    // buckle / metal tick
  h.osc({ f: 2700, t: 0.06, d: 0.07, g: 0.03 });
});

def('refuel', 0.2, 0.8, (h) => {
  // oil glugging, rising as the flask fills
  for (let i = 0; i < 7; i++) {
    h.osc({ f: 230 + i * 30, f2: 380 + i * 40, t: i * 0.065, d: 0.07, a: 0.01, g: 0.15 });
  }
  h.noise({ color: 'pink', d: 0.5, a: 0.05, g: 0.35, fil: { type: 'bandpass', f: 800, f2: 1100, q: 2.5 } });
  // flame catching
  h.noise({ color: 'white', t: 0.45, d: 0.45, a: 0.1, g: 0.35, fil: { type: 'bandpass', f: 400, f2: 1600, q: 0.8 } });
  h.osc({ f: 70, f2: 90, t: 0.45, d: 0.4, a: 0.1, g: 0.3, trem: { f: 14, depth: 0.3 } });
});

def('oil_low', 0.3, 1.20, (h) => {
  const tr = { f: 11, depth: 0.35 };
  h.osc({ type: 'triangle', f: 330, f2: 322, d: 0.3, a: 0.04, g: 0.2, trem: tr });
  h.osc({ type: 'triangle', f: 294, f2: 280, t: 0.22, d: 0.4, a: 0.04, g: 0.18, trem: tr });
  h.noise({ color: 'pink', d: 0.5, a: 0.1, g: 0.03, fil: { type: 'bandpass', f: 1200, q: 2 } });
});

// ---------------------------------------------------------------- magic

def('zap', 0.3, 1.36, (h) => {
  h.fm({ f: 950, f2: 180, ratio: 2.01, idx: 600, d: 0.28, g: 0.22 });
  h.osc({ f: 1900, f2: 420, d: 0.14, g: 0.1 });
  h.noise({ color: 'white', d: 0.2, g: 0.2, fil: { type: 'bandpass', f: 3200, f2: 1000, q: 2 } });
  h.osc({ f: 90, f2: 60, d: 0.2, g: 0.25 });
});

def('fire', 0.35, 0.52, (h) => {
  h.osc({ f: 85, f2: 32, d: 0.7, a: 0.01, g: 0.7 });
  h.noise({ color: 'brown', d: 0.75, a: 0.02, g: 2.0, fil: { type: 'lowpass', f: 1300, f2: 180 } });
  h.noise({ color: 'white', d: 0.45, a: 0.02, g: 0.3, fil: { type: 'bandpass', f: 900, f2: 280, q: 0.8 } });
  for (let i = 0; i < 7; i++) {
    h.noise({ color: 'white', t: 0.1 + i * 0.06 + h.rand(0, 0.04), d: 0.02, g: 0.15, fil: { type: 'highpass', f: h.rand(2500, 5000) } });
  }
});

def('freeze', 0.5, 0.8, (h) => {
  for (let i = 0; i < 10; i++) {
    h.noise({ color: 'white', t: h.rand(0, 0.4), d: 0.02, g: 0.2, fil: { type: 'highpass', f: h.rand(4500, 8000) } });
  }
  [2400, 3150, 4300].forEach((f, i) => {
    h.osc({ f, f2: f * 0.97, t: i * 0.03, d: 0.55, a: 0.02, g: 0.06, detune: i * 7 });
  });
  h.fm({ f: 1200, f2: 900, ratio: 3.1, idx: 400, d: 0.45, a: 0.05, g: 0.06 });
});

def('teleport', 0.5, 0.8, (h) => {
  h.osc({ f: 250, f2: 1800, d: 0.3, a: 0.2, g: 0.18 });
  h.osc({ f: 253, f2: 1830, d: 0.3, a: 0.2, g: 0.12, detune: 12 });
  h.osc({ f: 1800, f2: 300, t: 0.3, d: 0.3, a: 0.005, g: 0.16 });
  h.osc({ f: 1830, f2: 310, t: 0.3, d: 0.3, a: 0.005, g: 0.1, detune: -12 });
  h.noise({ color: 'pink', d: 0.3, a: 0.2, g: 0.15, fil: { type: 'bandpass', f: 500, f2: 3500, q: 1.5 } });
  h.noise({ color: 'pink', t: 0.3, d: 0.3, g: 0.15, fil: { type: 'bandpass', f: 3500, f2: 600, q: 1.5 } });
});

// ---------------------------------------------------------------- status / progression

def('status_bad', 0.3, 1.44, (h) => {
  const o = { type: 'triangle', d: 0.45, a: 0.03, trem: { f: 8, depth: 0.25 }, fil: { type: 'lowpass', f: 900 } };
  h.osc({ ...o, f: 220, f2: 175, g: 0.25 });
  h.osc({ ...o, f: 233, f2: 185, g: 0.2 });
});

def('status_good', 0.4, 0.8, (h) => {
  h.osc({ type: 'triangle', f: 440, d: 0.3, g: 0.2 });
  h.osc({ f: 880, d: 0.2, g: 0.04 });
  h.osc({ type: 'triangle', f: 554.4, t: 0.09, d: 0.4, g: 0.2 });
  h.osc({ f: 1108.8, t: 0.09, d: 0.25, g: 0.04 });
});

def('levelup', 0.4, 0.8, (h) => {
  [60, 64, 67, 72].forEach((n, i) => {
    const f = NOTE(n);
    h.osc({ type: 'triangle', f, t: i * 0.09, d: 0.55, a: 0.01, g: 0.2 });
    h.osc({ f: f * 2, t: i * 0.09, d: 0.4, g: 0.05, detune: 5 });
    h.osc({ f: f * 1.002, t: i * 0.09, d: 0.5, g: 0.08, detune: -7 });
  });
  h.osc({ f: NOTE(48), t: 0, d: 0.7, a: 0.05, g: 0.15 });
});

def('death', 0.55, 0.85, (h) => {
  h.osc({ f: 220, f2: 55, d: 1.2, a: 0.02, g: 0.4 });
  h.osc({ type: 'triangle', f: 165, f2: 41, d: 1.3, a: 0.03, g: 0.25, fil: { type: 'lowpass', f: 600 } });
  h.osc({ type: 'sawtooth', f: 110, f2: 45, d: 0.9, a: 0.03, g: 0.1, fil: { type: 'lowpass', f: 400, f2: 120 } });
  // flame snuffed
  h.noise({ color: 'white', d: 0.3, a: 0.01, g: 0.3, fil: { type: 'bandpass', f: 3500, f2: 500, q: 0.8 } });
  h.noise({ color: 'brown', d: 0.4, g: 1.0, fil: { type: 'lowpass', f: 300 } });
});

def('victory', 0.55, 0.8, (h) => {
  // warm, bright add9 chord swelling in
  [60, 64, 67, 72, 74, 76].forEach((n, i) => {
    const f = NOTE(n);
    const t = i * 0.04;
    h.osc({ type: 'triangle', f, t, d: 1.4, a: 0.35, g: 0.11 });
    h.osc({ f: f * 1.003, t, d: 1.35, a: 0.4, g: 0.07, detune: 5 });
  });
  h.osc({ f: NOTE(48), d: 1.4, a: 0.3, g: 0.18 });
  for (let i = 0; i < 3; i++) {
    h.fm({ f: h.rand(2600, 3400), ratio: 1.41, idx: 500, t: 0.7 + i * 0.07, d: 0.4, g: 0.05 });
  }
});

// ---------------------------------------------------------------- UI

def('ui_click', 0.05, 2.10, (h) => {
  h.noise({ color: 'pink', d: 0.03, a: 0.002, g: 0.3, fil: { type: 'bandpass', f: 1600, q: 1.5 } });
  h.osc({ f: 640, f2: 420, d: 0.07, a: 0.002, g: 0.2 });
});

def('ui_open', 0.12, 1.96, (h) => {
  h.osc({ type: 'triangle', f: 480, f2: 720, d: 0.13, a: 0.01, g: 0.16 });
  h.noise({ color: 'pink', d: 0.12, a: 0.03, g: 0.12, fil: { type: 'bandpass', f: 600, f2: 2200, q: 1.2 } });
});

def('ui_close', 0.12, 1.96, (h) => {
  h.osc({ type: 'triangle', f: 720, f2: 440, d: 0.12, a: 0.008, g: 0.16 });
  h.noise({ color: 'pink', d: 0.1, a: 0.02, g: 0.1, fil: { type: 'bandpass', f: 2000, f2: 550, q: 1.2 } });
});

def('error', 0.1, 0.7, (h) => {
  const o = { type: 'triangle', d: 0.13, a: 0.01, fil: { type: 'lowpass', f: 700 } };
  h.osc({ ...o, f: 185, f2: 160, g: 0.3 });
  h.osc({ ...o, f: 175, f2: 150, t: 0.12, g: 0.3 });
});

export const SOUND_NAMES = Object.keys(SOUNDS);
