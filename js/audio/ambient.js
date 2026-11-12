// Generative per-biome ambience: a few continuous layers plus sparse random events.
// Cheap by design: ~6-10 persistent nodes per biome, events scheduled by timers
// that are cleared when the biome is faded out.
import { ambientReverb } from './engine.js';
import { makeHelpers, loopNoise, rand, pick } from './util.js';

const FADE = 2.0; // seconds

/** Scene = lifetime container for one biome's nodes and timers. */
function makeScene(g, out) {
  const ctx = g.ctx;
  const rev = ambientReverb(g);
  const sources = [];
  const nodes = [];
  const timers = new Set();
  let stopped = false;

  const s = {
    ctx, out, rev,
    start(src) { sources.push(src); return src; },
    node(n) { nodes.push(n); return n; },
    gain(v, dest = out) { const n = ctx.createGain(); n.gain.value = v; n.connect(dest); nodes.push(n); return n; },
    filter(type, f, q = 0.7, dest) { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; if (dest) n.connect(dest); nodes.push(n); return n; },
    noise(color, dest) { const n = s.start(loopNoise(ctx, color)); n.connect(dest); return n; },
    osc(type, f, dest, detune = 0) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune;
      o.connect(dest); o.start(); return s.start(o);
    },
    /** slow LFO modulating `param` by +-depth */
    lfo(f, depth, param) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const a = ctx.createGain();
      a.gain.value = depth;
      nodes.push(a);
      o.connect(a);
      a.connect(param);
      o.start();
      return s.start(o);
    },
    /** Repeat fn at random intervals (seconds) until the scene stops. */
    every(min, max, fn, first = rand(min * 0.2, min)) {
      const schedule = (sec) => {
        const id = setTimeout(() => {
          timers.delete(id);
          if (stopped) return;
          if (ctx.state === 'running') { try { fn(); } catch (_) { /* never break the game loop */ } }
          schedule(rand(min, max));
        }, sec * 1000);
        timers.add(id);
      };
      schedule(first);
    },
    /** One-shot event voice with optional reverb send and pan. */
    event(fn, { level = 0.1, rev: send = 0.5, pan = 0, dry = 1 } = {}) {
      const vin = ctx.createGain();
      vin.gain.value = level;
      let dest = out;
      if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; p.connect(out); dest = p; }
      if (dry > 0) { const d = ctx.createGain(); d.gain.value = dry; vin.connect(d); d.connect(dest); }
      const sg = ctx.createGain();
      sg.gain.value = send;
      vin.connect(sg);
      sg.connect(rev);
      fn(makeHelpers(ctx, vin, 1, ctx.currentTime + 0.05));
    },
    haltTimers() {
      stopped = true;
      for (const t of timers) clearTimeout(t);
      timers.clear();
    },
    stop() {
      s.haltTimers();
      for (const src of sources) { try { src.stop(); } catch (_) { /* already stopped */ } }
      for (const n of nodes) { try { n.disconnect(); } catch (_) { /* ignore */ } }
      sources.length = 0;
      nodes.length = 0;
    },
  };
  return s;
}

// ------------------------------------------------------------------ biomes

const BIOMES = {
  // dry, low rumble; occasional distant drip / creak / stone settling
  stollen(s) {
    const lp = s.filter('lowpass', 150, 0.5, s.gain(0.095));
    s.noise('brown', lp);
    s.lfo(0.07, 45, lp.frequency);
    s.noise('pink', s.filter('bandpass', 500, 0.7, s.gain(0.012)));

    s.every(4, 11, () => {
      const f = rand(1300, 2600);
      s.event((h) => {
        h.osc({ f: f * 0.55, f2: f, glide: 0.03, d: 0.16, a: 0.002, g: 0.5 });
        h.osc({ f: f * 1.6, d: 0.08, g: 0.1 });
      }, { level: 0.12, rev: 0.9, dry: 0.4, pan: rand(-0.7, 0.7) });
    });
    s.every(20, 50, () => {
      s.event((h) => {
        h.osc({ type: 'sawtooth', f: rand(85, 110), f2: rand(62, 78), d: 1.3, a: 0.4, g: 0.6,
          fil: { type: 'bandpass', path: [[0, 260], [0.5, 380], [1, 240]], q: 5 }, trem: { f: 17, depth: 0.4 } });
      }, { level: 0.07, rev: 0.6, pan: rand(-0.5, 0.5) });
    });
    s.every(35, 80, () => {
      s.event((h) => {
        h.noise({ color: 'brown', d: 0.9, a: 0.02, g: 1.2, fil: { type: 'lowpass', f: 320, f2: 120 } });
        h.noise({ color: 'pink', t: 0.1, d: 0.25, g: 0.2, fil: { type: 'bandpass', f: 700, q: 1.5 } });
      }, { level: 0.1, rev: 0.7, pan: rand(-0.8, 0.8) });
    });
  },

  // damp, soft airy shimmer, frequent drips
  pilzgrotte(s) {
    const air = s.gain(0.035);
    s.noise('pink', s.filter('bandpass', 2400, 0.6, air));
    s.lfo(0.11, 0.02, air.gain);
    s.osc('sine', 98, s.gain(0.035));
    // two glassy partials with slow independent tremolo
    [[1174.7, 0.17, 5], [1760, 0.23, -7]].forEach(([f, rate, det]) => {
      const g = s.gain(0.007);
      s.osc('sine', f, g, det);
      s.lfo(rate, 0.006, g.gain);
    });
    s.every(1.5, 6, () => {
      const f = rand(450, 900);
      s.event((h) => {
        h.osc({ f, f2: f * 1.7, glide: 0.07, d: 0.2, a: 0.004, g: 0.5 });
        h.osc({ f: f * 2.01, f2: f * 3.4, glide: 0.07, d: 0.1, g: 0.08 });
      }, { level: 0.1, rev: 0.8, dry: 0.5, pan: rand(-0.8, 0.8) });
    });
    s.every(14, 34, () => {
      s.event((h) => {
        h.noise({ color: 'pink', d: 1.2, a: 0.45, g: 0.8, fil: { type: 'bandpass', f: 3000, f2: 2200, q: 1.2 } });
      }, { level: 0.05, rev: 0.5, pan: rand(-0.6, 0.6) });
    });
  },

  // large cold reverberant hall: open-fifth pad, thin wind, far metallic pings
  hallen(s) {
    const pad = s.gain(0.5);
    const send = s.gain(1.0, s.rev);
    pad.connect(send);
    const padLevel = s.gain(0.03, pad);
    [[73.4, 1], [110.1, 0.8], [146.8, 0.6], [220.5, 0.35]].forEach(([f, a], i) => {
      const g = s.gain(a, padLevel);
      s.osc('sine', f, g, i % 2 ? 6 : -5);
    });
    s.lfo(0.045, 0.012, padLevel.gain);
    const wind = s.filter('bandpass', 350, 2, s.gain(0.03));
    s.noise('pink', wind);
    s.lfo(0.05, 140, wind.frequency);

    s.every(8, 22, () => {
      const f = pick([587.3, 659.3, 880, 1174.7]);
      s.event((h) => {
        h.osc({ f, d: 2.6, a: 0.003, g: 0.5 });
        h.osc({ f: f * 2.76, d: 1.4, a: 0.003, g: 0.18 });
        h.osc({ f: f * 5.4, d: 0.7, a: 0.003, g: 0.08 });
      }, { level: 0.09, rev: 1.0, dry: 0.3, pan: rand(-0.8, 0.8) });
    });
  },

  // ominous low pulse (heartbeat) over a dark drone
  herz(s) {
    const lp = s.filter('lowpass', 140, 0.8, s.gain(0.03));
    s.osc('sawtooth', 55, lp);
    s.osc('sawtooth', 55.35, lp);
    s.osc('sine', 41.2, lp);
    s.lfo(0.04, 45, lp.frequency);
    s.noise('brown', s.filter('lowpass', 90, 0.5, s.gain(0.05)));

    s.every(2.1, 2.6, () => {
      s.event((h) => {
        h.osc({ f: 58, f2: 38, d: 0.24, a: 0.01, g: 0.9 });
        h.osc({ f: 56, f2: 37, t: 0.29, d: 0.22, a: 0.01, g: 0.55 });
        h.noise({ color: 'brown', d: 0.15, a: 0.01, g: 0.8, fil: { type: 'lowpass', f: 120 } });
      }, { level: 0.11, rev: 0.3 });
    }, 0.4);
    s.every(20, 45, () => {
      s.event((h) => {
        h.osc({ f: 110, d: 3.5, a: 1.5, g: 0.5 });
        h.osc({ f: 116.5, d: 3.5, a: 1.7, g: 0.4 });
      }, { level: 0.05, rev: 0.8 });
    });
  },
};

export const AMBIENT_NAMES = Object.keys(BIOMES);

/** Manages crossfading between biomes on a graph. */
export function createAmbientManager(g) {
  const ctx = g.ctx;
  let cur = null; // { name, gain, scene }
  const cleanups = new Set();

  function fadeOut(entry) {
    const t = ctx.currentTime;
    const gp = entry.gain.gain;
    gp.cancelScheduledValues(t);
    gp.setValueAtTime(gp.value, t);
    gp.linearRampToValueAtTime(0, t + FADE);
    // stop timers now so no new events appear while fading; free nodes afterwards
    entry.scene.haltTimers();
    const id = setTimeout(() => { cleanups.delete(id); entry.scene.stop(); entry.gain.disconnect(); }, FADE * 1000 + 300);
    cleanups.add(id);
  }

  return {
    set(name) {
      if ((cur && cur.name === name) || (!cur && !name)) return true;
      if (cur) { fadeOut(cur); cur = null; }
      if (!name) return true;
      const build = BIOMES[name];
      if (!build) return false;
      const gain = ctx.createGain();
      const t = ctx.currentTime;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(1, t + FADE);
      gain.connect(g.ambientBus);
      const scene = makeScene(g, gain);
      build(scene);
      cur = { name, gain, scene };
      return true;
    },
    current() { return cur ? cur.name : null; },
  };
}
