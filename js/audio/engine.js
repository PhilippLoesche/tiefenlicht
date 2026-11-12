// Audio graph construction + voice triggering. Works on realtime and offline contexts.
import { SOUNDS } from './sounds.js';
import { makeHelpers, makeImpulse, clamp } from './util.js';

export const DEFAULTS = { master: 0.8, ambient: 0.6 };

function softClipCurve() {
  // linear up to 0.7, then a tanh shoulder that stays strictly below 1.0
  const n = 2049;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a < 0.7 ? a : 0.7 + 0.28 * Math.tanh((a - 0.7) / 0.28);
    c[i] = Math.sign(x) * y;
  }
  return c;
}

/**
 * sfx bus ─┐
 *          ├─ master ─ compressor ─ soft clip ─ destination
 * ambient ─┘
 */
export function buildGraph(ctx, { reverb = true, master = DEFAULTS.master, ambient = DEFAULTS.ambient } = {}) {
  const g = { ctx };
  g.master = ctx.createGain();
  g.master.gain.value = master;
  g.comp = ctx.createDynamicsCompressor();
  g.comp.threshold.value = -16;
  g.comp.knee.value = 12;
  g.comp.ratio.value = 6;
  g.comp.attack.value = 0.004;
  g.comp.release.value = 0.18;
  g.clip = ctx.createWaveShaper();
  g.clip.curve = softClipCurve();
  g.master.connect(g.comp);
  g.comp.connect(g.clip);
  g.clip.connect(ctx.destination);

  g.sfxBus = ctx.createGain();
  g.sfxBus.gain.value = 0.9;
  g.sfxBus.connect(g.master);

  g.ambientBus = ctx.createGain();
  g.ambientBus.gain.value = ambient;
  g.ambientBus.connect(g.master);

  // short, dark room for effects
  g.reverbIn = ctx.createGain();
  if (reverb) {
    const conv = ctx.createConvolver();
    conv.buffer = makeImpulse(ctx, 0.9, 3, 0.55);
    const wet = ctx.createGain();
    wet.gain.value = 0.7;
    g.reverbIn.connect(conv);
    conv.connect(wet);
    wet.connect(g.sfxBus);
  }
  return g;
}

/** Large cold hall for ambience; created lazily on first use. */
export function ambientReverb(g) {
  if (!g.ambRev) {
    const ctx = g.ctx;
    g.ambRev = ctx.createGain();
    const conv = ctx.createConvolver();
    conv.buffer = makeImpulse(ctx, 3.4, 2.4, 0.4);
    g.ambRev.connect(conv);
    conv.connect(g.ambientBus);
  }
  return g.ambRev;
}

/** Schedule effect `name` at context time `t`. Returns false for unknown names. */
export function playOn(g, name, t, { volume = 1, pitch = 1, pan = 0 } = {}) {
  const def = SOUNDS[name];
  if (!def) return false;
  const ctx = g.ctx;
  const vin = ctx.createGain();
  vin.gain.value = clamp(+volume || 0, 0, 1) * def.level;
  let dest = g.sfxBus;
  if (pan && ctx.createStereoPanner) {
    const pn = ctx.createStereoPanner();
    pn.pan.value = clamp(+pan || 0, -1, 1);
    pn.connect(g.sfxBus);
    dest = pn;
  }
  vin.connect(dest);
  if (def.rev) {
    const send = ctx.createGain();
    send.gain.value = def.rev;
    vin.connect(send);
    send.connect(g.reverbIn);
  }
  def.fn(makeHelpers(ctx, vin, clamp(+pitch || 1, 0.25, 4), t));
  return true;
}
