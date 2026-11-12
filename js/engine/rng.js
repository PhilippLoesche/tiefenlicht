// Seeded, serializable PRNG (sfc32). The generator state is a plain array of
// four unsigned 32-bit integers that lives inside the game state, so
// save -> load -> continue is fully deterministic.

/** Hash an arbitrary string into a 4-word sfc32 state. */
export function seedState(seed) {
  const str = String(seed);
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  const next = () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
  const s = [next(), next(), next(), next()];
  const r = new Rng(s);
  for (let i = 0; i < 15; i++) r.u32(); // warm up
  return s;
}

export class Rng {
  /** @param {number[]} state 4 uint32 words; mutated in place. */
  constructor(state) {
    this.s = state;
  }

  static fromSeed(seed) {
    return new Rng(seedState(seed));
  }

  u32() {
    const s = this.s;
    let a = s[0] | 0, b = s[1] | 0, c = s[2] | 0, d = s[3] | 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    s[0] = a >>> 0; s[1] = b >>> 0; s[2] = c >>> 0; s[3] = d >>> 0;
    return t >>> 0;
  }

  /** Float in [0, 1). */
  next() {
    return this.u32() / 4294967296;
  }

  /** Integer in [min, max] (inclusive). */
  int(min, max) {
    if (max < min) return min;
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p) {
    return this.next() < p;
  }

  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Roll n dice with the given number of sides, plus bonus. */
  roll(n, sides, bonus = 0) {
    let t = bonus;
    for (let i = 0; i < n; i++) t += 1 + Math.floor(this.next() * sides);
    return t;
  }

  /** Pick a key from {key: weight} or an array of [value, weight]. */
  weighted(table) {
    const entries = Array.isArray(table) ? table : Object.entries(table);
    let total = 0;
    for (const [, w] of entries) total += w;
    let r = this.next() * total;
    for (const [v, w] of entries) {
      r -= w;
      if (r < 0) return v;
    }
    return entries[entries.length - 1][0];
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
