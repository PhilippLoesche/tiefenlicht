// Creation of items, monsters and per-run identification tables.

import {
  MONSTERS, WEAPONS, ARMORS, POTIONS, SCROLLS, WANDS, RINGS, POTION_COLORS, WAND_MATERIALS,
  RING_GEMS, RUNE_SYLLABLES, LOOT_WEIGHTS,
} from './data.js';

const APPEARANCE_POOLS = {
  potion: () => Object.keys(POTION_COLORS),
  wand: () => Object.keys(WAND_MATERIALS),
  ring: () => Object.keys(RING_GEMS),
};
const KIND_TABLES = { potion: POTIONS, scroll: SCROLLS, wand: WANDS, ring: RINGS };

/** Build the per-run identification table (random appearances, nothing known). */
export function makeIdent(rng) {
  const ident = {};
  for (const cat of ['potion', 'wand', 'ring']) {
    const pool = rng.shuffle(APPEARANCE_POOLS[cat]().slice());
    const appearance = {};
    Object.keys(KIND_TABLES[cat]).forEach((k, i) => { appearance[k] = pool[i]; });
    ident[cat] = { appearance, known: {} };
  }
  const used = new Set();
  const appearance = {};
  for (const k of Object.keys(SCROLLS)) {
    let w;
    do {
      w = rng.pick(RUNE_SYLLABLES) + rng.pick(RUNE_SYLLABLES);
      if (rng.chance(0.3)) w += rng.pick(RUNE_SYLLABLES);
    } while (used.has(w) || w.length > 9);
    used.add(w);
    appearance[k] = w;
  }
  ident.scroll = { appearance, known: {} };
  ident.potion.known.heilung = true;
  return ident;
}

export function isStackable(cat) {
  return cat === 'potion' || cat === 'scroll' || cat === 'thrown' || cat === 'oil' || cat === 'gold';
}

/**
 * Create an item object.
 * @param {object} st game state (for uids and appearances)
 * @param {string} cat category
 * @param {string} kind kind id
 * @param {object} [o] overrides (count, ench, charges, known)
 */
export function makeItem(st, cat, kind, o = {}) {
  const item = { uid: st.nextUid++, cat, kind, count: o.count ?? 1 };
  if (cat === 'weapon' || cat === 'armor') {
    item.ench = o.ench ?? 0;
    item.known = o.known ?? false;
  }
  if (cat === 'wand') {
    item.charges = o.charges ?? 3;
    item.known = o.known ?? false;
  }
  if (cat === 'ring') item.worn = 0;
  if (st.ident[cat]) item.appearance = st.ident[cat].appearance[kind];
  return item;
}

function rollEnch(rng, depth) {
  const r = rng.next();
  if (r < 0.08) return -1;
  if (r < 0.08 + 0.06 + depth * 0.01) return 2 + (rng.chance(depth / 40) ? 1 : 0);
  if (r < 0.3 + depth * 0.02) return 1;
  return 0;
}

/** Random floor loot appropriate for the depth. */
export function randomItem(st, rng, depth) {
  const cat = rng.weighted(LOOT_WEIGHTS);
  switch (cat) {
    case 'weapon': {
      const pool = Object.entries(WEAPONS).filter(([, d]) => d.minDepth <= depth).map(([k, d]) => [k, d.weight + (d.minDepth >= depth - 2 ? 2 : 0)]);
      return makeItem(st, 'weapon', rng.weighted(pool), { ench: rollEnch(rng, depth) });
    }
    case 'armor': {
      const pool = Object.entries(ARMORS).filter(([, d]) => d.minDepth <= depth).map(([k, d]) => [k, d.weight + (d.minDepth >= depth - 2 ? 2 : 0)]);
      return makeItem(st, 'armor', rng.weighted(pool), { ench: rollEnch(rng, depth) });
    }
    case 'potion': {
      const pool = Object.entries(POTIONS).map(([k, d]) => [k, d.weight]);
      return makeItem(st, 'potion', rng.weighted(pool));
    }
    case 'scroll': {
      const pool = Object.entries(SCROLLS).map(([k, d]) => [k, d.weight]);
      return makeItem(st, 'scroll', rng.weighted(pool));
    }
    case 'wand': {
      const kind = rng.weighted(Object.entries(WANDS).map(([k, d]) => [k, d.weight]));
      const [lo, hi] = WANDS[kind].charges;
      return makeItem(st, 'wand', kind, { charges: rng.int(lo, hi) });
    }
    case 'ring': {
      const kind = rng.weighted(Object.entries(RINGS).map(([k, d]) => [k, d.weight]));
      return makeItem(st, 'ring', kind);
    }
    case 'thrown':
      return makeItem(st, 'thrown', 'wurfmesser', { count: rng.int(2, 4) });
    case 'oil':
    default:
      return makeItem(st, 'oil', 'oelflasche');
  }
}

/** Create a monster of the given id at (x, y). */
export function makeMonster(st, rng, id, x, y, ai) {
  const d = MONSTERS[id];
  const m = {
    uid: st.nextUid++,
    id,
    x, y,
    hp: d.hp,
    maxHp: d.hp,
    energy: rng.int(0, 99),
    ai: ai ?? (d.dormant || d.stationary || d.boss ? 'dormant' : rng.chance(0.55) ? 'asleep' : 'wander'),
    statuses: {},
    target: null,
    lost: 0,
    path: null,
    cd: 0,
  };
  if (d.split) m.splits = 0;
  if (d.steal) m.stolen = 0;
  return m;
}
