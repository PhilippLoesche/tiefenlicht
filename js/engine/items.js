// Item naming, descriptions and the effects of using items.

import {
  WEAPONS, ARMORS, POTIONS, SCROLLS, WANDS, RINGS, POTION_COLORS, WAND_MATERIALS, RING_GEMS, NOUNS,
  MISC_ITEMS, OIL_FLASK, MONSTERS,
} from './data.js';
import { np, cap } from './grammar.js';
import { ray, cheb } from './path.js';
import { randomMonsterId } from './populate.js';

const KIND_TABLES = { potion: POTIONS, scroll: SCROLLS, wand: WANDS, ring: RINGS };

export function enchStr(e) {
  return e > 0 ? ` +${e}` : e < 0 ? ` −${-e}` : ' +0';
}

/** Is the kind of this item known (always true for non-magic categories)? */
export function kindKnown(st, item) {
  const id = st.ident[item.cat];
  return id ? !!id.known[item.kind] : true;
}

/** True if anything about the item is still hidden from the player. */
export function isUnidentified(st, item) {
  if (item.cat === 'weapon' || item.cat === 'armor') return !item.known;
  if (st.ident[item.cat]) return !kindKnown(st, item);
  return false;
}

/** Noun-phrase spec for an item as the player currently knows it. */
export function itemSpec(st, item) {
  const known = kindKnown(st, item);
  switch (item.cat) {
    case 'weapon':
      return { noun: WEAPONS[item.kind].name, suffix: item.known ? enchStr(item.ench) : '' };
    case 'armor':
      return { noun: ARMORS[item.kind].name, suffix: item.known ? enchStr(item.ench) : '' };
    case 'thrown':
      return { noun: NOUNS.wurfmesser };
    case 'potion':
      return known ? { noun: NOUNS.potion, suffix: POTIONS[item.kind].suffix } : { noun: NOUNS.potion, adj: POTION_COLORS[item.appearance] };
    case 'scroll':
      return { noun: NOUNS.scroll, suffix: known ? SCROLLS[item.kind].suffix : ` »${item.appearance}«` };
    case 'wand': {
      if (!known) return { noun: NOUNS.wand, suffix: ` aus ${WAND_MATERIALS[item.appearance]}` };
      const c = item.charges;
      const ch = c === 0 ? ' (leer)' : c === 1 ? ' (1 Ladung)' : ` (${c} Ladungen)`;
      return { noun: NOUNS.wand, suffix: WANDS[item.kind].suffix + ch };
    }
    case 'ring':
      return known ? { noun: NOUNS.ring, suffix: RINGS[item.kind].suffix } : { noun: RING_GEMS[item.appearance] };
    case 'oil':
      return { noun: NOUNS.oelflasche };
    case 'gold':
      return { noun: NOUNS.gold };
    case 'artifact':
    default:
      return { noun: NOUNS.sonnenscherbe };
  }
}

/**
 * German name of an item.
 * @param {object} st game state
 * @param {object} item
 * @param {{case?:'nom'|'acc'|'dat', article?:'def'|'indef'|'none', count?:number}} [opts]
 */
export function itemName(st, item, opts = {}) {
  return np(itemSpec(st, item), { ...opts, count: opts.count ?? item.count ?? 1 });
}

function signed(n) {
  return n >= 0 ? `+${n}` : `−${-n}`;
}

/** German description of an item, as far as the player knows it. */
export function itemDescription(st, item) {
  const known = kindKnown(st, item);
  const parts = [];
  switch (item.cat) {
    case 'weapon': {
      const d = WEAPONS[item.kind];
      const e = item.known ? item.ench : 0;
      parts.push(d.desc);
      parts.push(`Schaden ${d.dmg[0] + e}–${d.dmg[0] * d.dmg[1] + e}, Treffsicherheit ${signed(d.acc + e * 5)}.`);
      parts.push(item.known ? (item.ench ? `Verzauberung ${enchStr(item.ench).trim()}.` : 'Nicht verzaubert.') : 'Ob die Waffe verzaubert ist, weißt du noch nicht.');
      break;
    }
    case 'armor': {
      const d = ARMORS[item.kind];
      parts.push(d.desc);
      parts.push(`Rüstung ${d.armor + (item.known ? item.ench : 0)}.`);
      parts.push(item.known ? (item.ench ? `Verzauberung ${enchStr(item.ench).trim()}.` : 'Nicht verzaubert.') : 'Ob die Rüstung verzaubert ist, weißt du noch nicht.');
      break;
    }
    case 'thrown':
      parts.push(MISC_ITEMS.wurfmesser.desc, `Schaden 1–6, Reichweite ${MISC_ITEMS.wurfmesser.range}.`);
      break;
    case 'potion':
      parts.push(known ? POTIONS[item.kind].desc : 'Ein Trank mit unbekannter Wirkung. Trink ihn, um herauszufinden, was er bewirkt.');
      break;
    case 'scroll':
      parts.push(known ? SCROLLS[item.kind].desc : 'Eine Schriftrolle voller fremder Runen. Lies sie, um ihre Wirkung zu erfahren.');
      break;
    case 'wand':
      if (known) parts.push(WANDS[item.kind].desc, `Ladungen: ${item.charges}. Reichweite ${WANDS[item.kind].range}.`);
      else parts.push('Ein Stab mit unbekannter Kraft. Richte ihn auf ein Ziel, um sie zu entfesseln.');
      break;
    case 'ring':
      parts.push(known ? RINGS[item.kind].desc : 'Ein Ring mit unbekannter Wirkung. Manche Ringe verraten sich erst, wenn du sie eine Weile trägst.');
      break;
    case 'oil':
      parts.push(MISC_ITEMS.oelflasche.desc);
      break;
    case 'gold':
      parts.push(MISC_ITEMS.gold.desc);
      break;
    default:
      parts.push(MISC_ITEMS.sonnenscherbe.desc);
  }
  return parts.join(' ');
}

// --------------------------------------------------------------- using items

/** Mark a kind as known and announce it. */
export function identifyKind(g, item, announce = true) {
  const st = g.state;
  const id = st.ident[item.cat];
  if (!id || id.known[item.kind]) return false;
  id.known[item.kind] = true;
  g.emit({ type: 'identify', cat: item.cat, kind: item.kind, appearance: item.appearance ?? null });
  if (announce) g.log(`Das war ${itemName(st, item, { case: 'nom', article: 'indef', count: 1 })}.`, 'info');
  return true;
}

/** Fully identify one item (kind and enchantment). */
export function identifyItem(g, item) {
  const st = g.state;
  if (item.cat === 'weapon' || item.cat === 'armor') item.known = true;
  if (st.ident[item.cat] && !st.ident[item.cat].known[item.kind]) {
    st.ident[item.cat].known[item.kind] = true;
  }
  g.emit({ type: 'identify', cat: item.cat, kind: item.kind, appearance: item.appearance ?? null, uid: item.uid });
  g.log(`Du erkennst: ${itemName(st, item, { case: 'nom', article: 'indef', count: 1 })}.`, 'good');
}

/**
 * Use an item. Returns true if a turn was consumed.
 * @param {import('./game.js').Game} g
 */
export function useItem(g, item, action) {
  switch (item.cat) {
    case 'potion': return quaff(g, item);
    case 'scroll': return readScroll(g, item, action);
    case 'wand': return zap(g, item, action);
    case 'oil': return refuel(g, item);
    case 'thrown':
      if (!action.target) { g.needTarget(item, 'tile', 'throw', MISC_ITEMS.wurfmesser.range); return false; }
      return throwItem(g, item, action.target);
    case 'weapon': case 'armor': case 'ring':
      return g.equippedSlot(item) ? unequip(g, item) : equip(g, item);
    case 'artifact':
      g.invalid('Die Sonnenscherbe wärmt deine Hände. Mehr kannst du mit ihr hier nicht tun.');
      return false;
    default:
      g.invalid('Damit kannst du nichts anfangen.');
      return false;
  }
}

function quaff(g, item) {
  const st = g.state, p = st.player, rng = g.rng;
  g.log(`Du trinkst ${itemName(st, item, { case: 'acc', article: 'def', count: 1 })}.`, 'info');
  g.consume(item);
  g.emit({ type: 'use', uid: item.uid, cat: 'potion', kind: item.kind, appearance: item.appearance });
  switch (item.kind) {
    case 'heilung': {
      const amount = Math.max(15, Math.round(p.maxHp * 0.6));
      g.healPlayer(amount);
      if (p.statuses.poison) g.removeStatus(p, 'poison');
      g.emit({ type: 'effect', kind: 'heal', at: { x: p.x, y: p.y } });
      g.log('Wärme durchströmt dich, deine Wunden schließen sich.', 'good');
      break;
    }
    case 'staerke':
      p.str += 1;
      g.emit({ type: 'effect', kind: 'strength', at: { x: p.x, y: p.y } });
      g.log('Kraft strömt in deine Muskeln.', 'good');
      break;
    case 'gift':
      g.log('Bäh! Der Trank brennt wie Feuer in deinem Magen.', 'bad');
      g.addStatus(p, 'poison', rng.int(6, 10));
      break;
    case 'finsternis':
      g.log('Ein schwarzer Schleier legt sich über deine Augen.', 'bad');
      g.addStatus(p, 'finsternis', rng.int(25, 35));
      break;
    case 'eile':
      g.log('Die Welt um dich herum scheint sich zu verlangsamen.', 'good');
      g.addStatus(p, 'haste', rng.int(18, 24));
      break;
    case 'gespuer':
      g.log('Du spürst die Herzschläge aller Wesen dieser Ebene.', 'good');
      g.addStatus(p, 'gespuer', 60);
      break;
    case 'erfahrung':
      g.log('Erinnerungen an fremde Kämpfe fluten deinen Geist.', 'good');
      g.gainLevel();
      break;
    case 'steinhaut':
      g.log('Deine Haut wird hart und grau wie Granit.', 'good');
      g.addStatus(p, 'steinhaut', rng.int(25, 35));
      break;
  }
  identifyKind(g, item);
  return true;
}

function readScroll(g, item, action) {
  const st = g.state, p = st.player, rng = g.rng;
  const known = kindKnown(st, item);
  let idTarget = null;
  if (item.kind === 'identifikation') {
    const cands = p.inventory.filter((it) => it !== item && isUnidentified(st, it));
    if (action.targetUid != null) {
      idTarget = p.inventory.find((it) => it.uid === action.targetUid) ?? null;
      if (!idTarget) { g.invalid('Diesen Gegenstand hast du nicht.'); return false; }
      if (!isUnidentified(st, idTarget)) { g.invalid('Diesen Gegenstand kennst du bereits.'); return false; }
    } else if (known) {
      if (!cands.length) { g.invalid('Du hast nichts bei dir, das du nicht schon kennst.'); return false; }
      g.needTarget(item, 'item', 'identify', null, 'unidentified');
      return false;
    } else if (cands.length) {
      idTarget = rng.pick(cands);
    }
  }
  g.log(`Du liest ${itemName(st, item, { case: 'acc', article: 'def', count: 1 })}.`, 'info');
  g.consume(item);
  g.emit({ type: 'use', uid: item.uid, cat: 'scroll', kind: item.kind });
  switch (item.kind) {
    case 'identifikation':
      identifyKind(g, item);
      if (idTarget) identifyItem(g, idTarget);
      else g.log('Die Runen glimmen auf, doch es gibt nichts zu erkennen.', 'info');
      break;
    case 'teleportation':
      g.teleportPlayer();
      g.log('Die Welt verschwimmt – du stehst an einem anderen Ort.', 'info');
      identifyKind(g, item);
      break;
    case 'kartierung':
      g.revealMap();
      g.emit({ type: 'effect', kind: 'reveal', at: { x: p.x, y: p.y } });
      g.log('Der Grundriss der Ebene brennt sich in dein Gedächtnis.', 'good');
      identifyKind(g, item);
      break;
    case 'waffenschliff': {
      const w = g.equipped('weapon');
      if (w) {
        w.ench += 1;
        w.known = true;
        g.log(`${cap(itemName(st, w, { case: 'nom', article: 'def', count: 1 }))} schimmert kurz bläulich auf.`, 'good');
      } else g.log('Deine Hände kribbeln einen Moment lang.', 'info');
      identifyKind(g, item);
      break;
    }
    case 'ruestungssegen': {
      const a = g.equipped('armor');
      if (a) {
        a.ench += 1;
        a.known = true;
        g.log(`${cap(itemName(st, a, { case: 'nom', article: 'def', count: 1 }))} schimmert silbern auf.`, 'good');
      } else g.log('Deine Haut prickelt einen Moment lang.', 'info');
      identifyKind(g, item);
      break;
    }
    case 'schrecken': {
      const ms = g.visibleMonsters().filter((m) => !m.detectedOnly).map((v) => g.monsterByUid(v.uid));
      g.log('Ein schauriger Schrei hallt durch die Tiefe!', 'info');
      g.emit({ type: 'effect', kind: 'fear', at: { x: p.x, y: p.y }, radius: 8 });
      for (const m of ms) {
        if (MONSTERS[m.id].boss) continue;
        g.addStatus(m, 'fear', rng.int(12, 18));
        if (m.ai !== 'hunt' && m.ai !== 'flee') m.ai = 'hunt';
      }
      identifyKind(g, item);
      break;
    }
    case 'blendlicht': {
      const ms = g.visibleMonsters().filter((m) => !m.detectedOnly).map((v) => g.monsterByUid(v.uid));
      g.emit({ type: 'effect', kind: 'flash', at: { x: p.x, y: p.y }, radius: 8 });
      g.log('Ein gleißender Blitz erhellt die Umgebung!', 'good');
      for (const m of ms) g.addStatus(m, 'stun', MONSTERS[m.id].boss ? 2 : rng.int(3, 5));
      identifyKind(g, item);
      break;
    }
    case 'beschwoerung': {
      g.log('Die Runen glühen rot auf – Ungeheuer erscheinen um dich herum!', 'bad');
      const n = rng.int(2, 3);
      for (let k = 0; k < n; k++) {
        const spot = g.freeTileNear(p.x, p.y, 2);
        if (!spot) break;
        const m = g.spawnMonster(randomMonsterId(rng, Math.min(st.depth, 9)), spot.x, spot.y, 'hunt');
        m.target = { x: p.x, y: p.y };
      }
      g.emit({ type: 'effect', kind: 'summon', at: { x: p.x, y: p.y } });
      identifyKind(g, item);
      break;
    }
  }
  return true;
}

function zap(g, item, action) {
  const st = g.state, p = st.player, rng = g.rng;
  const def = WANDS[item.kind];
  if (!action.target) { g.needTarget(item, 'tile', 'zap', def.range); return false; }
  const { x: tx, y: ty } = action.target;
  if (!g.inBounds(tx, ty) || (tx === p.x && ty === p.y)) { g.invalid('Wähle ein Ziel abseits von dir.'); return false; }
  if (!g.los[g.idx(tx, ty)]) { g.invalid('Dorthin hast du keine Sichtlinie.'); return false; }
  if (item.charges <= 0) { g.invalid('Der Stab ist erschöpft.'); return false; }
  g.log(`Du richtest ${itemName(st, item, { case: 'acc', article: 'def', count: 1 })} aus.`, 'info');
  item.charges -= 1;
  g.emit({ type: 'use', uid: item.uid, cat: 'wand', kind: item.kind, appearance: item.appearance });
  // trace the ray up to the first wall / closed door
  const pts = [];
  for (const pt of ray(p.x, p.y, tx, ty, def.range)) {
    if (!g.inBounds(pt.x, pt.y) || g.blocksProjectile(pt.x, pt.y)) break;
    pts.push(pt);
  }
  const end = pts.length ? pts[pts.length - 1] : { x: p.x, y: p.y };
  const firstMonster = () => {
    for (const pt of pts) {
      const m = g.monsterAt(pt.x, pt.y);
      if (m) return m;
    }
    return null;
  };
  switch (item.kind) {
    case 'blitz': {
      g.emit({ type: 'projectile', kind: 'blitz', from: { x: p.x, y: p.y }, to: end, path: pts });
      g.log('Ein Blitz zuckt knisternd aus dem Stab!', 'info');
      for (const pt of pts) {
        const m = g.monsterAt(pt.x, pt.y);
        if (!m) continue;
        g.log(`Der Blitz trifft ${g.monName(m, 'acc')}.`, 'good');
        g.damageMonster(m, rng.roll(3, 6), { byPlayer: true, kind: 'blitz' });
      }
      break;
    }
    case 'frost': {
      const m = firstMonster();
      const to = m ? { x: m.x, y: m.y } : end;
      g.emit({ type: 'projectile', kind: 'frost', from: { x: p.x, y: p.y }, to, path: pts });
      if (m) {
        g.log(`Eisige Kälte umhüllt ${g.monName(m, 'acc')}.`, 'good');
        if (!g.damageMonster(m, rng.roll(2, 4), { byPlayer: true, kind: 'frost' })) {
          g.addStatus(m, 'frozen', MONSTERS[m.id].boss ? 2 : rng.int(4, 6));
          g.addStatus(m, 'slow', 12);
        }
      } else g.log('Raureif überzieht den Boden.', 'info');
      break;
    }
    case 'verbannung': {
      const m = firstMonster();
      const to = m ? { x: m.x, y: m.y } : end;
      g.emit({ type: 'projectile', kind: 'verbannung', from: { x: p.x, y: p.y }, to, path: pts });
      if (m && MONSTERS[m.id].boss) {
        g.log(`${cap(g.monName(m, 'nom'))} widersteht der Verbannung.`, 'bad');
        g.wakeMonster(m);
      } else if (m) {
        g.log(`${cap(g.monName(m, 'nom'))} verschwindet in einem Lichtwirbel.`, 'good');
        g.teleportMonster(m);
      } else g.log('Ein Lichtwirbel verpufft im Leeren.', 'info');
      break;
    }
    case 'glutball': {
      let impact = end;
      for (const pt of pts) {
        impact = pt;
        if (g.monsterAt(pt.x, pt.y) || (pt.x === tx && pt.y === ty)) break;
      }
      g.emit({ type: 'projectile', kind: 'glutball', from: { x: p.x, y: p.y }, to: impact, path: pts.slice(0, pts.indexOf(impact) + 1) });
      g.explode(impact.x, impact.y, 1, [3, 5, 0], { byPlayer: true, cause: 'Vom eigenen Glutball verbrannt' });
      break;
    }
  }
  identifyKind(g, item);
  return true;
}

function refuel(g, item) {
  const p = g.state.player;
  if (p.oil >= p.oilMax) { g.invalid('Deine Lampe ist bereits voll.'); return false; }
  const before = p.oil;
  p.oil = Math.min(p.oilMax, p.oil + OIL_FLASK);
  g.consume(item);
  g.emit({ type: 'use', uid: item.uid, cat: 'oil', kind: 'oelflasche' });
  g.emit({ type: 'oil', from: before, to: p.oil, max: p.oilMax, reason: 'refuel' });
  g.log('Du füllst Öl nach. Die Flamme deiner Lampe wächst.', 'good');
  g.onOilChanged(before);
  return true;
}

/** Throw an item (only Wurfmesser are throwable). */
export function throwItem(g, item, target) {
  const st = g.state, p = st.player, rng = g.rng;
  if (item.cat !== 'thrown') { g.invalid('Das eignet sich nicht zum Werfen.'); return false; }
  if (!target) { g.needTarget(item, 'tile', 'throw', MISC_ITEMS.wurfmesser.range); return false; }
  const { x: tx, y: ty } = target;
  if (!g.inBounds(tx, ty) || (tx === p.x && ty === p.y)) { g.invalid('Wähle ein Ziel abseits von dir.'); return false; }
  if (!g.los[g.idx(tx, ty)]) { g.invalid('Dorthin hast du keine Sichtlinie.'); return false; }
  if (cheb(p.x, p.y, tx, ty) > MISC_ITEMS.wurfmesser.range) { g.invalid('Das ist zu weit entfernt.'); return false; }
  const thrown = g.consume(item);
  let landing = { x: p.x, y: p.y };
  let victim = null;
  const pts = [];
  for (const pt of ray(p.x, p.y, tx, ty, MISC_ITEMS.wurfmesser.range)) {
    if (g.blocksProjectile(pt.x, pt.y)) break;
    pts.push(pt);
    landing = pt;
    const m = g.monsterAt(pt.x, pt.y);
    if (m) { victim = m; break; }
    if (pt.x === tx && pt.y === ty) break;
  }
  g.emit({ type: 'projectile', kind: 'wurfmesser', from: { x: p.x, y: p.y }, to: landing, path: pts });
  g.log(`Du wirfst ${itemName(st, thrown, { case: 'acc', article: 'indef', count: 1 })}.`, 'info');
  let breaks = false;
  if (victim) {
    const res = g.rangedPlayerAttack(victim);
    breaks = res.hit && rng.chance(0.4);
  } else {
    breaks = rng.chance(0.1);
  }
  if (breaks) g.log('Das Wurfmesser zerbricht.', 'info');
  else g.dropItemAt(thrown, landing.x, landing.y, false);
  return true;
}

export function equip(g, item) {
  const st = g.state, p = st.player;
  const eq = p.equipment;
  let slot;
  if (item.cat === 'weapon') slot = 'weapon';
  else if (item.cat === 'armor') slot = 'armor';
  else if (item.cat === 'ring') {
    slot = !eq.ring1 ? 'ring1' : !eq.ring2 ? 'ring2' : null;
    if (!slot) { g.invalid('Du trägst bereits zwei Ringe.'); return false; }
  } else { g.invalid('Das kannst du nicht ausrüsten.'); return false; }
  if (g.equippedSlot(item)) { g.invalid('Das hast du bereits ausgerüstet.'); return false; }
  const old = eq[slot] != null ? p.inventory.find((it) => it.uid === eq[slot]) : null;
  if (old) {
    eq[slot] = null;
    g.emit({ type: 'unequip', uid: old.uid, slot });
  }
  eq[slot] = item.uid;
  if (item.cat !== 'ring') item.known = true;
  g.emit({ type: 'equip', uid: item.uid, slot, cat: item.cat, kind: item.kind });
  const name = itemName(st, item, { case: 'acc', article: 'def', count: 1 });
  if (slot === 'weapon') g.log(`Du führst jetzt ${name}.`, 'info');
  else if (slot === 'armor') g.log(`Du legst ${name} an.`, 'info');
  else {
    g.log(`Du steckst dir ${name} an.`, 'info');
    if (['kraft', 'schutz', 'weitsicht'].includes(item.kind) && !kindKnown(st, item)) {
      const msg = { kraft: 'Du fühlst dich stärker.', schutz: 'Ein unsichtbarer Schild umgibt dich.', weitsicht: 'Das Licht deiner Lampe reicht plötzlich weiter.' }[item.kind];
      g.log(msg, 'good');
      identifyKind(g, item);
    }
  }
  return true;
}

export function unequip(g, item) {
  const st = g.state, p = st.player;
  const slot = g.equippedSlot(item);
  if (!slot) { g.invalid('Das hast du nicht ausgerüstet.'); return false; }
  p.equipment[slot] = null;
  g.emit({ type: 'unequip', uid: item.uid, slot });
  const name = itemName(st, item, { case: 'acc', article: 'def', count: 1 });
  if (slot === 'weapon') g.log(`Du steckst ${name} weg.`, 'info');
  else if (slot === 'armor') g.log(`Du legst ${name} ab.`, 'info');
  else g.log(`Du ziehst ${name} ab.`, 'info');
  return true;
}
