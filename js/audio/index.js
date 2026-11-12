// Tiefenlicht sound module. All audio is synthesized at runtime with Web Audio.
//
//   import { audio, SOUND_NAMES } from './audio/index.js';
//   audio.init();                    // from a user gesture (click/keydown); idempotent
//   audio.play('hit', { volume: 0.8, pitch: 1.1, pan: -0.3 });
//   audio.setAmbient('stollen');     // 'stollen' | 'pilzgrotte' | 'hallen' | 'herz' | null
//
// Importing has no side effects and never throws (silent no-ops without Web Audio, e.g. Node).

import { SOUNDS, SOUND_NAMES } from './sounds.js';
import { buildGraph, playOn, DEFAULTS } from './engine.js';
import { createAmbientManager, AMBIENT_NAMES } from './ambient.js';
import { clamp } from './util.js';

export { SOUND_NAMES, AMBIENT_NAMES };

const RATE_LIMIT_MS = 30;      // identical sound within this window is dropped
const BURST_WINDOW_MS = 100;   // global cap: at most BURST_MAX sounds per window
const BURST_MAX = 14;

const state = {
  ctx: null,
  graph: null,
  ambient: null,               // AmbientManager
  wantAmbient: null,           // requested biome (applied once the context exists)
  muted: false,
  volume: DEFAULTS.master,
  ambientVolume: DEFAULTS.ambient,
  last: new Map(),
  warned: new Set(),
  burstStart: 0,
  burstCount: 0,
  analyser: null,
  visHooked: false,
};

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const AC = () => globalThis.AudioContext || globalThis.webkitAudioContext || null;

function applyGains() {
  const g = state.graph;
  if (!g) return;
  const t = state.ctx.currentTime;
  g.master.gain.setTargetAtTime(state.muted ? 0 : state.volume, t, 0.02);
  g.ambientBus.gain.setTargetAtTime(state.ambientVolume, t, 0.05);
}

function hookVisibility() {
  if (state.visHooked || typeof document === 'undefined' || !document.addEventListener) return;
  state.visHooked = true;
  document.addEventListener('visibilitychange', () => {
    const ctx = state.ctx;
    if (!ctx) return;
    if (document.hidden) ctx.suspend?.().catch(() => {});
    else ctx.resume?.().catch(() => {});
  });
}

export const audio = {
  /** Create/resume the AudioContext. Call from a user gesture. Resolves true when running. */
  init() {
    try {
      const Ctor = AC();
      if (!Ctor) return Promise.resolve(false);
      if (!state.ctx) {
        state.ctx = new Ctor({ latencyHint: 'interactive' });
        state.graph = buildGraph(state.ctx, { master: state.muted ? 0 : state.volume, ambient: state.ambientVolume });
        state.ambient = createAmbientManager(state.graph);
        hookVisibility();
      }
      const ctx = state.ctx;
      const ready = ctx.state === 'running' ? Promise.resolve() : ctx.resume();
      return ready.then(
        () => {
          if (state.wantAmbient && state.ambient.current() !== state.wantAmbient) state.ambient.set(state.wantAmbient);
          return ctx.state === 'running';
        },
        () => false,
      );
    } catch (e) {
      state.ctx = null;
      state.graph = null;
      return Promise.resolve(false);
    }
  },

  /** Fire a one-shot effect. opts: { volume 0..1, pitch multiplier, pan -1..1 } */
  play(name, opts) {
    try {
      if (!SOUNDS[name]) {
        if (!state.warned.has(name)) {
          state.warned.add(name);
          console.warn(`[audio] unknown sound "${name}"`);
        }
        return;
      }
      const g = state.graph;
      if (!g || state.muted || state.ctx.state !== 'running') return;
      const t = now();
      const prev = state.last.get(name);
      if (prev !== undefined && t - prev < RATE_LIMIT_MS) return;
      if (t - state.burstStart > BURST_WINDOW_MS) { state.burstStart = t; state.burstCount = 0; }
      if (++state.burstCount > BURST_MAX) return;
      state.last.set(name, t);
      playOn(g, name, state.ctx.currentTime + 0.005, opts || {});
    } catch (e) {
      /* never let audio break the game loop */
    }
  },

  /** Crossfade (~2 s) to a biome's ambience; null fades out. Remembered if called before init(). */
  setAmbient(biome) {
    try {
      const name = biome || null;
      if (name && !AMBIENT_NAMES.includes(name)) {
        if (!state.warned.has('ambient:' + name)) {
          state.warned.add('ambient:' + name);
          console.warn(`[audio] unknown ambience "${name}"`);
        }
        return;
      }
      state.wantAmbient = name;
      if (state.ambient && state.ctx.state === 'running') state.ambient.set(name);
    } catch (e) { /* ignore */ }
  },

  setMuted(m) { state.muted = !!m; try { applyGains(); } catch (e) { /* ignore */ } },
  isMuted() { return state.muted; },
  setVolume(v) { state.volume = clamp(+v || 0, 0, 1); try { applyGains(); } catch (e) { /* ignore */ } },
  getVolume() { return state.volume; },
  setAmbientVolume(v) { state.ambientVolume = clamp(+v || 0, 0, 1); try { applyGains(); } catch (e) { /* ignore */ } },
  getAmbientVolume() { return state.ambientVolume; },

  // ---------------------------------------------------------------- debug helpers

  /**
   * Render one effect offline and measure it. Resolves to
   * { name, peak, peakDb, rms, rmsDb, duration, dryDuration } or null without Web Audio.
   * duration = time from start until the signal last exceeds 0.002 (incl. reverb tail);
   * dryDuration = same with the reverb send muted. rms is measured over the active span.
   */
  async _debugRender(name, opts = {}) {
    const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
    if (!OAC || !SOUNDS[name]) return null;
    const sr = 44100;
    const seconds = opts.seconds || 3.5;
    const start = 0.01;
    const run = async (reverb) => {
      const ctx = new OAC(2, Math.ceil(sr * seconds), sr);
      const g = buildGraph(ctx, { reverb });
      playOn(g, name, start, opts);
      const buf = await ctx.startRendering();
      const L = buf.getChannelData(0), R = buf.getChannelData(1);
      const TH = 0.002;
      let peak = 0, first = -1, last = -1;
      for (let i = 0; i < L.length; i++) {
        const a = Math.max(Math.abs(L[i]), Math.abs(R[i]));
        if (a > peak) peak = a;
        if (a > TH) { if (first < 0) first = i; last = i; }
      }
      let sum = 0, n = 0;
      if (first >= 0) for (let i = first; i <= last; i++) { sum += L[i] * L[i] + R[i] * R[i]; n += 2; }
      const rms = n ? Math.sqrt(sum / n) : 0;
      const duration = first < 0 ? 0 : (last - start * sr) / sr;
      return { peak, rms, duration };
    };
    const wet = await run(true);
    const dry = await run(false);
    const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
    return {
      name, peak: wet.peak, peakDb: db(wet.peak), rms: wet.rms, rmsDb: db(wet.rms),
      duration: wet.duration, dryDuration: dry.duration,
    };
  },

  /** Realtime output level meter (needs init()). Returns { peak, rms } of the last ~2048 samples. */
  _debugLevel() {
    const g = state.graph;
    if (!g) return null;
    if (!state.analyser) {
      state.analyser = state.ctx.createAnalyser();
      state.analyser.fftSize = 2048;
      g.clip.connect(state.analyser);
      state.buf = new Float32Array(2048);
      return { peak: 0, rms: 0 };
    }
    state.analyser.getFloatTimeDomainData(state.buf);
    let peak = 0, sum = 0;
    for (const v of state.buf) { peak = Math.max(peak, Math.abs(v)); sum += v * v; }
    return { peak, rms: Math.sqrt(sum / state.buf.length) };
  },

  _debugState() {
    return { ctx: state.ctx ? state.ctx.state : null, ambient: state.ambient ? state.ambient.current() : null, muted: state.muted };
  },
};

export default audio;
