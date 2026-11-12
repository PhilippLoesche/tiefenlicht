// Content tables in display form for a help / codex screen (German).

import { MONSTERS, WEAPONS, ARMORS, POTIONS, SCROLLS, WANDS, RINGS, MISC_ITEMS, NOUNS, TRAPS, TILES } from './data.js';

/**
 * @returns {{monsters:object[], items:object[], traps:object[]}}
 * monsters: {id, name, plural, gender, depth:[min,max], description, boss}
 * items:    {cat, kind, name, description, ...stats}
 */
export function codex() {
  const monsters = Object.entries(MONSTERS).map(([id, d]) => ({
    id, name: d.proper ? `Der ${d.name.sg}` : d.name.sg, plural: d.name.pl, gender: d.name.gender,
    depth: d.depth, description: d.desc, boss: !!d.boss,
    hp: d.hp, speed: d.speed > 10 ? 'schnell' : d.speed < 10 ? 'langsam' : 'normal',
  }));
  const items = [];
  for (const [kind, d] of Object.entries(WEAPONS)) items.push({ cat: 'weapon', kind, name: d.name.sg, description: d.desc, damage: `${d.dmg[0]}–${d.dmg[0] * d.dmg[1]}` });
  for (const [kind, d] of Object.entries(ARMORS)) items.push({ cat: 'armor', kind, name: d.name.sg, description: d.desc, armor: d.armor });
  items.push({ cat: 'thrown', kind: 'wurfmesser', name: NOUNS.wurfmesser.sg, description: MISC_ITEMS.wurfmesser.desc });
  for (const [kind, d] of Object.entries(POTIONS)) items.push({ cat: 'potion', kind, name: 'Trank' + d.suffix, description: d.desc });
  for (const [kind, d] of Object.entries(SCROLLS)) items.push({ cat: 'scroll', kind, name: 'Schriftrolle' + d.suffix, description: d.desc });
  for (const [kind, d] of Object.entries(WANDS)) items.push({ cat: 'wand', kind, name: 'Stab' + d.suffix, description: d.desc });
  for (const [kind, d] of Object.entries(RINGS)) items.push({ cat: 'ring', kind, name: 'Ring' + d.suffix, description: d.desc });
  items.push({ cat: 'oil', kind: 'oelflasche', name: NOUNS.oelflasche.sg, description: MISC_ITEMS.oelflasche.desc });
  items.push({ cat: 'gold', kind: 'gold', name: 'Gold', description: MISC_ITEMS.gold.desc });
  items.push({ cat: 'artifact', kind: 'sonnenscherbe', name: NOUNS.sonnenscherbe.sg, description: MISC_ITEMS.sonnenscherbe.desc });
  const traps = Object.entries(TRAPS).map(([kind, d]) => ({ kind, name: d.name.sg, description: d.desc }));
  const tiles = Object.entries(TILES).map(([id, d]) => ({ id, name: d.name, walkable: d.walk, blocksSight: d.opaque }));
  return { monsters, items, traps, tiles };
}
