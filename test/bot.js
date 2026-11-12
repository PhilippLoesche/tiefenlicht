// Heuristic bot that plays full runs of Tiefenlicht through the public API.
// Usage: node test/bot.js [games=100] [--seed=prefix] [--verbose]

import { Game, MONSTERS, WEAPONS, ARMORS } from '../js/engine/index.js';

const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

function weaponScore(it) {
  const d = WEAPONS[it.kind];
  return (d.dmg[0] * (d.dmg[1] + 1)) / 2 + (it.known ? it.ench : 0) + d.acc / 10;
}
function armorScore(it) {
  return ARMORS[it.kind].armor + (it.known ? it.ench : 0);
}

/** Decide the next action for the bot. Keeps a little memory in `mem`. */
export function botAction(g, mem) {
  const st = g.state, p = st.player;
  const inv = p.inventory;
  const known = (it) => !st.ident[it.cat] || st.ident[it.cat].known[it.kind];
  const find = (cat, kind) => inv.find((it) => it.cat === cat && it.kind === kind && known(it));
  const hpFrac = p.hp / p.maxHp;
  const targets = g.targetsInView().filter((t) => t.ai !== 'dormant' || cheb(t, p) <= 1);
  const ignore = mem.ignore ?? (mem.ignore = new Set());
  const threats = targets.filter((t) => !ignore.has(t.uid));
  const adjacent = threats.filter((t) => cheb(t, p) === 1);

  // --- emergencies
  if (hpFrac < 0.35) {
    const heal = find('potion', 'heilung');
    if (heal && (threats.length || hpFrac < 0.25)) return { type: 'use', itemUid: heal.uid };
    if (adjacent.length) {
      const tele = find('scroll', 'teleportation');
      if (tele) return { type: 'use', itemUid: tele.uid };
      const unknownPotion = inv.find((it) => it.cat === 'potion' && !known(it));
      if (unknownPotion && hpFrac < 0.25) return { type: 'use', itemUid: unknownPotion.uid };
    }
  }
  const oilFrac = p.oil / p.oilMax;
  const flask = inv.find((it) => it.cat === 'oil');
  if (flask && (oilFrac < 0.15 || (oilFrac < 0.5 && !threats.length && oilFrac + 0.45 <= 1.0 && inv.filter((i) => i.cat === 'oil').reduce((s, i) => s + i.count, 0) > 1))) {
    return { type: 'use', itemUid: flask.uid };
  }

  // --- fighting
  if (threats.length) {
    mem.fightTicks = (mem.fightTicks ?? 0) + 1;
    if (adjacent.length) {
      adjacent.sort((a, b) => a.hpFraction - b.hpFraction);
      const t = adjacent[0];
      // strong monster and a useful wand at hand?
      const wand = inv.find((it) => it.cat === 'wand' && it.charges > 0 && (!known(it) || it.kind !== 'verbannung' || MONSTERS[t.id].hp >= 40) && !(known(it) && it.kind === 'glutball'));
      if (wand && (MONSTERS[t.id].hp >= 30 || hpFrac < 0.5)) return { type: 'use', itemUid: wand.uid, target: { x: t.x, y: t.y } };
      return { type: 'move', dx: t.x - p.x, dy: t.y - p.y, _target: t.uid };
    }
    const t = threats[0];
    const d = cheb(t, p);
    if (t.los && d <= 7) {
      const wand = inv.find((it) => it.cat === 'wand' && it.charges > 0);
      if (wand && (MONSTERS[t.id].hp >= 20 || hpFrac < 0.5) && t.ai === 'hunt') return { type: 'use', itemUid: wand.uid, target: { x: t.x, y: t.y } };
      const knives = inv.find((it) => it.cat === 'thrown');
      if (knives && d >= 2 && d <= 6 && t.ai === 'hunt') return { type: 'throw', itemUid: knives.uid, target: { x: t.x, y: t.y } };
    }
    // chase or wait for it
    if (t.ai === 'hunt' && d <= 3) return { type: 'wait' };
    mem.chase = mem.chase?.uid === t.uid ? { uid: t.uid, n: mem.chase.n + 1 } : { uid: t.uid, n: 0 };
    if (mem.chase.n > 25) { ignore.add(t.uid); return { type: 'wait' }; }
    return { type: 'travel', x: t.x, y: t.y };
  }

  // --- housekeeping when safe
  // equipment upgrades
  const w = g.equipped('weapon');
  const bestW = inv.filter((it) => it.cat === 'weapon').sort((a, b) => weaponScore(b) - weaponScore(a))[0];
  if (bestW && bestW !== w && (!w || weaponScore(bestW) > weaponScore(w))) return { type: 'equip', itemUid: bestW.uid };
  const a = g.equipped('armor');
  const bestA = inv.filter((it) => it.cat === 'armor').sort((x, y) => armorScore(y) - armorScore(x))[0];
  if (bestA && bestA !== a && (!a || armorScore(bestA) > armorScore(a))) return { type: 'equip', itemUid: bestA.uid };
  const ring = inv.find((it) => it.cat === 'ring' && !g.equippedSlot(it));
  if (ring && (!p.equipment.ring1 || !p.equipment.ring2)) return { type: 'equip', itemUid: ring.uid };
  // identify by use
  const idScroll = find('scroll', 'identifikation');
  const unk = inv.find((it) => (it.cat === 'potion' || it.cat === 'ring' || it.cat === 'wand') && !known(it));
  if (idScroll && unk) return { type: 'use', itemUid: idScroll.uid, targetUid: unk.uid };
  const unknownScroll = inv.find((it) => it.cat === 'scroll' && !known(it));
  if (unknownScroll && hpFrac > 0.6) return { type: 'use', itemUid: unknownScroll.uid };
  const unknownPotion = inv.find((it) => it.cat === 'potion' && !known(it));
  if (unknownPotion && hpFrac > 0.8) return { type: 'use', itemUid: unknownPotion.uid };
  // useful known consumables
  const str = find('potion', 'staerke') ?? find('potion', 'erfahrung');
  if (str) return { type: 'use', itemUid: str.uid };
  const sharpen = find('scroll', 'waffenschliff');
  if (sharpen && w) return { type: 'use', itemUid: sharpen.uid };
  const bless = find('scroll', 'ruestungssegen');
  if (bless && a) return { type: 'use', itemUid: bless.uid };
  // inventory full: drop junk
  if (inv.length >= 19) {
    const junk = inv.find((it) => (it.cat === 'weapon' || it.cat === 'armor') && !g.equippedSlot(it))
      ?? inv.find((it) => it.cat === 'wand' && it.charges === 0)
      ?? inv.find((it) => it.cat === 'scroll' && known(it) && ['beschwoerung', 'identifikation'].includes(it.kind))
      ?? inv.find((it) => it.cat === 'potion' && known(it) && ['gift', 'finsternis'].includes(it.kind));
    if (junk) return { type: 'drop', itemUid: junk.uid };
  }
  // rest
  if ((hpFrac < 0.7 || p.statuses.poison) && p.oil > 0 && !mem.restFailedTurn) {
    mem.restFailedTurn = st.turn;
    return { type: 'rest' };
  }
  if (mem.restFailedTurn !== undefined && mem.restFailedTurn !== st.turn) mem.restFailedTurn = undefined;
  // refuel at a lit brazier
  if (oilFrac < 0.6) {
    const lv = st.level;
    const bi = lv.memTiles.findIndex((t) => t === 'brazier_lit');
    if (bi >= 0) return { type: 'travel', x: bi % lv.width, y: Math.floor(bi / lv.width) };
  }
  // the shard
  const shard = st.level.items.find((it) => it.cat === 'artifact' && st.level.explored[it.y * st.level.width + it.x]);
  if (shard) {
    if (shard.x === p.x && shard.y === p.y) return { type: 'pickup' };
    return { type: 'travel', x: shard.x, y: shard.y };
  }
  // explore
  const ex = g.autoExplore({ ignoreMonsters: true });
  if (ex.ok) return { type: 'explore', ignoreMonsters: true };
  const lv = st.level;
  if (lv.stairs && lv.explored[lv.stairs.y * lv.width + lv.stairs.x]) {
    if (p.x === lv.stairs.x && p.y === lv.stairs.y) {
      if (hpFrac < 0.8 && p.oil > 100 && !mem.restedOnStairs) { mem.restedOnStairs = true; return { type: 'rest' }; }
      mem.restedOnStairs = false;
      return { type: 'descend' };
    }
    return { type: 'travel', x: lv.stairs.x, y: lv.stairs.y };
  }
  // boss level: walk toward the boss if known
  const boss = st.level.monsters.find((m) => m.id === 'lichtfresser');
  if (boss) return { type: 'travel', x: boss.x, y: boss.y };
  const map = find('scroll', 'kartierung');
  if (map) return { type: 'use', itemUid: map.uid };
  return { type: 'wait' };
}

/** Play one game. Returns {game, summary, actions, stalled, errors}. */
export function playGame(seed, { maxActions = 50000, verbose = false } = {}) {
  const g = Game.create({ seed });
  const mem = {};
  let actions = 0, noProgress = 0, lastTurn = -1, stalled = null;
  let lastDepth = 1, depthSince = 0;
  let oilOutDepth = null;
  while (g.state.status === 'playing' && actions < maxActions) {
    let action = botAction(g, mem);
    let ev = g.act(action);
    actions++;
    if (!g.lastActionTookTurn) {
      // fall back to something that always consumes a turn
      if (action.type === 'move' || action.type === 'travel') {
        const ex = g.autoExplore({ ignoreMonsters: true });
        ev = ex.ok ? g.act({ type: 'move', dx: ex.dx, dy: ex.dy }) : g.act({ type: 'wait' });
      } else if (action.type !== 'rest') ev = g.act({ type: 'wait' });
      else ev = g.act({ type: 'wait' });
    }
    if (verbose) for (const e of ev) if (e.type === 'log') console.log(`[${g.state.depth}:${g.state.turn}] ${e.text}`);
    if (g.state.player.oil <= 0 && oilOutDepth == null) oilOutDepth = g.state.depth;
    if (g.state.turn === lastTurn) {
      if (++noProgress > 300) { stalled = 'no turn progress'; break; }
    } else { noProgress = 0; lastTurn = g.state.turn; }
    if (g.state.depth !== lastDepth) { lastDepth = g.state.depth; depthSince = g.state.turn; }
    if (g.state.turn - depthSince > 6000) { stalled = `stuck on depth ${g.state.depth}`; break; }
  }
  if (!stalled && g.state.status === 'playing') stalled = 'action limit';
  return { game: g, summary: g.runSummary(), actions, stalled, oilOutDepth };
}

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

if (import.meta.url === `file://${process.argv[1]}` && !process.env.NODE_TEST_CONTEXT) {
  const args = process.argv.slice(2);
  const n = parseInt(args.find((a) => /^\d+$/.test(a)) ?? '100', 10);
  const prefix = (args.find((a) => a.startsWith('--seed=')) ?? '--seed=bot').slice(7);
  const verbose = args.includes('--verbose');
  const depths = [], causes = {}, stalls = [];
  let wins = 0, oilOut = 0, totalTurns = 0, totalActs = 0;
  const t0 = performance.now();
  for (let i = 0; i < n; i++) {
    const r = playGame(`${prefix}-${i}`, { verbose });
    totalActs += r.actions;
    const s = r.summary;
    totalTurns += s.turns;
    if (s.won) wins++;
    depths.push(s.depth);
    if (r.oilOutDepth != null) oilOut++;
    if (args.includes('--list')) console.log(`${prefix}-${i}: depth ${s.depth} lvl ${s.level} turns ${s.turns} ${s.won ? 'SIEG' : s.cause} oil-out@${r.oilOutDepth ?? '-'} dark=${s.darkTurns}`);
    if (r.stalled) stalls.push(`${prefix}-${i}: ${r.stalled} (depth ${s.depth}, turn ${s.turns})`);
    const key = s.won ? 'SIEG' : (s.cause ?? 'unterwegs').replace(/von (einer|einem|dem) /i, 'von ').replace(/^Vom /, 'Von ');
    causes[key] = (causes[key] ?? 0) + 1;
  }
  const ms = performance.now() - t0;
  const hist = {};
  for (const d of depths) hist[d] = (hist[d] ?? 0) + 1;
  console.log(`Games: ${n}, wins: ${wins}, median death depth: ${median(depths)}, mean depth: ${(depths.reduce((a, b) => a + b, 0) / n).toFixed(2)}`);
  console.log('Depth histogram:', Object.entries(hist).map(([d, c]) => `${d}:${c}`).join('  '));
  console.log(`Lamp ran dry at least once in ${oilOut}/${n} games`);
  console.log('Causes:');
  for (const [c, k] of Object.entries(causes).sort((a, b) => b[1] - a[1])) console.log(`  ${k}× ${c}`);
  console.log(`Stalls: ${stalls.length}`);
  for (const s of stalls.slice(0, 10)) console.log('  ' + s);
  console.log(`Time: ${(ms / 1000).toFixed(1)} s, ${totalActs} actions, ${(ms / totalActs).toFixed(3)} ms/action, ${totalTurns} turns`);
}
