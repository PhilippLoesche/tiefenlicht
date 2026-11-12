// Low-level synthesis helpers shared by one-shot sounds and ambience.
// Everything here works on any BaseAudioContext (realtime or offline).

const noiseCache = new WeakMap();
const XFADE = 2048; // samples crossfaded so looping noise has no seam

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Cached 2 s noise buffer of the given colour ('white' | 'pink' | 'brown'), peak-normalised. */
export function getNoise(ctx, color = 'white') {
  let m = noiseCache.get(ctx);
  if (!m) noiseCache.set(ctx, (m = {}));
  if (m[color]) return m[color];
  const len = Math.floor(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  if (color === 'brown') {
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last;
    }
  } else if (color === 'pink') {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
    }
  } else {
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  // Crossfade the tail into the head; playback loops from XFADE .. len.
  for (let i = 0; i < XFADE; i++) {
    const w = i / XFADE;
    d[len - XFADE + i] = d[len - XFADE + i] * (1 - w) + d[i] * w;
  }
  let max = 0;
  for (let i = 0; i < len; i++) max = Math.max(max, Math.abs(d[i]));
  if (max > 0) for (let i = 0; i < len; i++) d[i] /= max;
  m[color] = buf;
  return buf;
}

/** A looping noise source, started at `when`, seamless. Caller connects/stops it. */
export function loopNoise(ctx, color, when = 0) {
  const src = ctx.createBufferSource();
  const buf = getNoise(ctx, color);
  src.buffer = buf;
  src.loop = true;
  src.loopStart = XFADE / ctx.sampleRate;
  src.loopEnd = buf.duration;
  src.start(when, rand(XFADE / ctx.sampleRate, buf.duration - 0.1));
  return src;
}

/** Generated stereo impulse response: decaying noise that darkens over time. */
export function makeImpulse(ctx, seconds, decay = 3, brightness = 0.6) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let y = 0;
    for (let i = 0; i < len; i++) {
      const x = i / len;
      const n = (Math.random() * 2 - 1) * Math.pow(1 - x, decay);
      const k = clamp(brightness * (1 - x * 0.85), 0.04, 1); // one-pole lowpass, darker later
      y += (n - y) * k;
      d[i] = y;
    }
  }
  // soft onset so the tail does not click
  const on = Math.floor(sr * 0.004);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < on; i++) d[i] *= i / on;
  }
  return buf;
}

function envelope(ctx, out, t, a, d, g) {
  const n = ctx.createGain();
  const atk = Math.min(a, d * 0.8);
  n.gain.setValueAtTime(0.0001, t);
  n.gain.linearRampToValueAtTime(Math.max(g, 0.0002), t + atk);
  n.gain.exponentialRampToValueAtTime(0.0001, t + d);
  n.gain.setValueAtTime(0, t + d + 0.002);
  n.connect(out);
  return n;
}

// fil: { type, f, f2, q } or { type, path: [[fraction, freq], ...], q }
function makeFilter(ctx, t, d, fil, p) {
  const f = ctx.createBiquadFilter();
  f.type = fil.type || 'lowpass';
  f.Q.value = fil.q ?? 0.7;
  const path = fil.path || [[0, fil.f], [1, fil.f2 ?? fil.f]];
  const maxF = ctx.sampleRate * 0.45;
  const fr = (v) => clamp(v * p, 20, maxF);
  f.frequency.setValueAtTime(fr(path[0][1]), t);
  for (let i = 1; i < path.length; i++) {
    f.frequency.exponentialRampToValueAtTime(fr(path[i][1]), t + path[i][0] * d);
  }
  return f;
}

/**
 * Per-voice helper bundle. All times are relative to `t0`; all frequencies are
 * scaled by `h.p` (the pitch multiplier, which a sound may adjust itself).
 */
export function makeHelpers(ctx, out, pitch = 1, t0 = 0) {
  const h = { ctx, out, p: pitch, t0, rand, pick };

  const tremolo = (node, o, t, d) => {
    const tg = ctx.createGain();
    tg.gain.value = 1 - o.depth;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = o.f;
    const la = ctx.createGain();
    la.gain.value = o.depth;
    lfo.connect(la);
    la.connect(tg.gain);
    lfo.start(t);
    lfo.stop(t + d + 0.05);
    node.connect(tg);
    return tg;
  };

  /** Oscillator voice. o: {type,f,f2,glide,t,d,a,g,detune,fil,trem:{f,depth}} */
  h.osc = (o) => {
    const t = h.t0 + (o.t || 0);
    const d = o.d;
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f * h.p, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2 * h.p, t + (o.glide ?? d));
    if (o.detune) osc.detune.value = o.detune;
    let node = osc;
    if (o.fil) {
      const fl = makeFilter(ctx, t, d, o.fil, h.p);
      node.connect(fl);
      node = fl;
    }
    if (o.trem) node = tremolo(node, o.trem, t, d);
    node.connect(envelope(ctx, out, t, o.a ?? 0.005, d, o.g ?? 0.2));
    osc.start(t);
    osc.stop(t + d + 0.05);
    return osc;
  };

  /** Simple 2-operator FM voice. o: {f,f2,ratio,idx,idxEnd,t,d,a,g,fil} */
  h.fm = (o) => {
    const t = h.t0 + (o.t || 0);
    const d = o.d;
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const mg = ctx.createGain();
    const ratio = o.ratio ?? 2;
    car.frequency.setValueAtTime(o.f * h.p, t);
    mod.frequency.setValueAtTime(o.f * h.p * ratio, t);
    if (o.f2) {
      car.frequency.exponentialRampToValueAtTime(o.f2 * h.p, t + d);
      mod.frequency.exponentialRampToValueAtTime(o.f2 * h.p * ratio, t + d);
    }
    const idx = (o.idx ?? 300) * h.p;
    mg.gain.setValueAtTime(idx, t);
    mg.gain.exponentialRampToValueAtTime(Math.max(idx * (o.idxEnd ?? 0.05), 0.01), t + d);
    mod.connect(mg);
    mg.connect(car.frequency);
    let node = car;
    if (o.fil) {
      const fl = makeFilter(ctx, t, d, o.fil, h.p);
      node.connect(fl);
      node = fl;
    }
    node.connect(envelope(ctx, out, t, o.a ?? 0.003, d, o.g ?? 0.15));
    car.start(t);
    mod.start(t);
    car.stop(t + d + 0.05);
    mod.stop(t + d + 0.05);
  };

  /** Filtered noise burst. o: {color,t,d,a,g,fil} */
  h.noise = (o) => {
    const t = h.t0 + (o.t || 0);
    const d = o.d;
    const src = ctx.createBufferSource();
    const buf = getNoise(ctx, o.color || 'white');
    src.buffer = buf;
    src.loop = true;
    src.loopStart = XFADE / ctx.sampleRate;
    src.loopEnd = buf.duration;
    let node = src;
    if (o.fil) {
      const fl = makeFilter(ctx, t, d, o.fil, h.p);
      node.connect(fl);
      node = fl;
    }
    node.connect(envelope(ctx, out, t, o.a ?? 0.004, d, o.g ?? 0.3));
    src.start(t, rand(XFADE / ctx.sampleRate, buf.duration - 0.1));
    src.stop(t + d + 0.05);
  };

  return h;
}
