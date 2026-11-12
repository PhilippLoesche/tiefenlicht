// Fuzz driver shared by the fuzz-*.test.js files (split so the test runner
// can execute them in parallel).
import assert from 'node:assert/strict';
import { Game } from '../js/engine/index.js';
import { Rng } from '../js/engine/rng.js';
import { DIRS } from '../js/engine/path.js';
import { checkInvariants } from './helpers.js';

/** Choose a random (mostly valid) action using a separate RNG. */
export function randomAction(g, r) {
  const st = g.state, p = st.player, lv = st.level;
  const inv = p.inventory;
  const roll = r.next();
  const visibleTile = () => {
    for (let k = 0; k < 20; k++) {
      const x = p.x + r.int(-7, 7), y = p.y + r.int(-7, 7);
      if (g.inBounds(x, y) && lv.visible[g.idx(x, y)] && !(x === p.x && y === p.y)) return { x, y };
    }
    return { x: p.x + 1, y: p.y };
  };
  if (roll < 0.35) { const [dx, dy] = r.pick(DIRS); return { type: 'move', dx, dy }; }
  if (roll < 0.55) return { type: 'explore', ignoreMonsters: r.chance(0.5) };
  if (roll < 0.60) return { type: 'wait' };
  if (roll < 0.62) return { type: 'rest', turns: r.chance(0.5) ? r.int(1, 20) : undefined };
  if (roll < 0.66) return { type: 'pickup' };
  if (roll < 0.68 && inv.length) return { type: 'drop', itemUid: r.pick(inv).uid, count: r.chance(0.5) ? 1 : undefined };
  if (roll < 0.80 && inv.length) {
    const it = r.pick(inv);
    const a = { type: 'use', itemUid: it.uid };
    if (r.chance(0.7)) a.target = visibleTile();
    if (r.chance(0.5)) a.targetUid = r.pick(inv).uid;
    return a;
  }
  if (roll < 0.84 && inv.length) return { type: r.chance(0.6) ? 'equip' : 'unequip', itemUid: r.pick(inv).uid };
  if (roll < 0.86 && inv.length) return { type: 'throw', itemUid: r.pick(inv).uid, target: visibleTile() };
  if (roll < 0.90) {
    if (lv.stairs && r.chance(0.5)) return { type: 'travel', x: lv.stairs.x, y: lv.stairs.y };
    return { type: 'travel', x: r.int(0, lv.width - 1), y: r.int(0, lv.height - 1) };
  }
  if (roll < 0.94) {
    if (lv.stairs && p.x === lv.stairs.x && p.y === lv.stairs.y) return { type: 'descend' };
    return { type: 'descend' };
  }
  // jump straight onto the stairs sometimes so deeper levels are exercised
  if (lv.stairs && r.chance(0.5)) {
    return { type: 'travel', x: lv.stairs.x, y: lv.stairs.y };
  }
  return { type: 'move', dx: r.int(-1, 1), dy: r.int(-1, 1) };
}

/**
 * Play `games` random games of up to `actions` actions each; check invariants
 * after every action and the save/load determinism in some of them.
 */
export function fuzz(prefix, games, actions) {
  let totalTurns = 0, maxDepth = 0, checkedSaves = 0;
  for (let gi = 0; gi < games; gi++) {
    const g = Game.create({ seed: `${prefix}-${gi}` });
    // tougher player so random games survive long enough to exercise the code
    g.state.player.maxHp = g.state.player.hp = 200;
    // start half of the games on deeper floors so every biome gets exercised
    if (gi % 2 === 1) g.enterLevel(1 + (gi % 10), 'stairs');
    const r = Rng.fromSeed(`${prefix}-actions-${gi}`);
    const saveAt = gi % 4 === 0 ? r.int(50, actions / 2) : -1;
    for (let i = 0; i < actions && g.state.status === 'playing'; i++) {
      if (i === saveAt) {
        const snap = g.serialize();
        const h = Game.deserialize(snap);
        const rA = new Rng([...r.s]), rB = new Rng([...r.s]);
        for (let k = 0; k < 150 && g.state.status === 'playing'; k++) {
          const a1 = randomAction(g, rA), a2 = randomAction(h, rB);
          assert.deepEqual(a2, a1);
          assert.deepEqual(h.act(a2), g.act(a1), `event stream diverged after load (${prefix}-${gi}, step ${k})`);
        }
        assert.deepEqual(h.serialize(), g.serialize());
        checkedSaves++;
        r.s.splice(0, 4, ...rA.s);
        continue;
      }
      const a = randomAction(g, r);
      // occasionally teleport to the stairs to reach deep levels
      if (r.chance(0.003) && g.state.level.stairs) {
        const s = g.state.level.stairs;
        if (!g.monsterAt(s.x, s.y)) { g.state.player.x = s.x; g.state.player.y = s.y; g.updateVision(); }
      }
      // keep random games alive (the fuzzer is about invariants, not balance)
      if (g.state.player.hp < 40) g.state.player.hp = g.state.player.maxHp;
      const ev = g.act(a);
      assert.ok(Array.isArray(ev));
      for (const e of ev) assert.equal(typeof e.type, 'string');
      if (!g.lastActionTookTurn) assert.ok(ev.length > 0, `silent no-op for ${JSON.stringify(a)}`);
      checkInvariants(g);
    }
    totalTurns += g.state.turn;
    maxDepth = Math.max(maxDepth, g.state.stats.maxDepth);
  }
  return { totalTurns, maxDepth, checkedSaves };
}
