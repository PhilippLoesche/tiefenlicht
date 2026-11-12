// Monster AI: asleep / dormant / wander / hunt / flee, plus special abilities.

import { MONSTERS } from './data.js';
import { np, cap, contract } from './grammar.js';
import { DIRS, astar, cheb, diagonalOk, isWalkable, line } from './path.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Noun-phrase spec for a monster id. */
export function monSpec(id) {
  return { noun: MONSTERS[id].name, proper: !!MONSTERS[id].proper };
}

/** "Von einer Stollenratte getötet" / "Vom Lichtfresser getötet" */
export function killedBy(m, verb = 'getötet') {
  return cap(contract(`von ${np(monSpec(m.id), { case: 'dat', article: 'indef' })} ${verb}`));
}

/**
 * Run one monster action.
 * @param {import('./game.js').Game} g
 */
export function monsterTurn(g, m) {
  const def = MONSTERS[m.id];
  const p = g.state.player;
  if (m.cd > 0) m.cd--;
  if (m.statuses.frozen || m.statuses.stun) return;
  const dist = cheb(m.x, m.y, p.x, p.y);
  const sees = g.monsterSeesPlayer(m);

  if (m.ai === 'asleep' || m.ai === 'dormant' || m.ai === 'wander') {
    const before = m.ai;
    if (!checkNotice(g, m, def, dist, sees)) {
      if (m.ai === 'wander') wander(g, m, def);
      return;
    }
    if (before !== 'wander') return; // waking up costs the turn
  }
  if (m.statuses.fear || m.ai === 'flee') {
    flee(g, m, def, dist);
    return;
  }
  hunt(g, m, def, dist, sees);
}

function checkNotice(g, m, def, dist, sees) {
  if (!sees) return false;
  let chance;
  if (m.ai === 'dormant') {
    if (def.boss) chance = dist <= 7 ? 1 : 0;
    else if (def.stationary) chance = dist <= 2 ? 1 : 0;
    else chance = dist <= 1 ? 1 : 0;
  } else {
    const r = g.lightRadius();
    const eff = def.lampLover ? dist / 2 : dist;
    chance = clamp((r + 5 - eff) / (r + 5), 0.03, 0.9);
    if (m.ai === 'asleep') chance *= 0.3;
    if (g.hasRing('schleichen')) chance *= 0.5;
    if (g.noisyArmor()) chance = Math.min(0.95, chance * 1.25);
  }
  if (chance <= 0 || !g.rng.chance(chance)) return false;
  g.alertMonster(m, true);
  return true;
}

function hunt(g, m, def, dist, sees) {
  const p = g.state.player, rng = g.rng;
  if (sees) {
    m.target = { x: p.x, y: p.y };
    m.lost = 0;
  } else m.lost++;

  if (def.boss && sees && m.cd === 0) {
    const moths = g.level.monsters.filter((o) => o.id === 'dochtmotte').length;
    if (moths < 4) {
      let n = 0;
      for (let k = 0; k < 2; k++) {
        const spot = g.freeTileNear(m.x, m.y, 2);
        if (!spot) break;
        const s = g.spawnMonster('dochtmotte', spot.x, spot.y, 'hunt');
        s.target = { x: p.x, y: p.y };
        n++;
      }
      if (n) {
        g.log(`${cap(g.monName(m, 'nom'))} ruft – Dochtmotten schwirren aus der Finsternis!`, 'warn');
        g.emit({ type: 'effect', kind: 'summon', at: { x: m.x, y: m.y } });
        m.cd = 10;
        return;
      }
    }
  }
  if (def.ranged && sees && dist >= 2 && dist <= def.ranged.range && g.clearShot(m) && rng.chance(0.5)) {
    fireBolt(g, m, def);
    return;
  }
  if (def.keepDistance && sees && dist <= 2 && rng.chance(0.6)) {
    if (stepAway(g, m, dist)) return;
  }
  if (def.leap && sees && dist >= 2 && dist <= def.leap + 1 && m.cd === 0) {
    if (leap(g, m, def)) return;
  }
  if (dist === 1 && canReach(g, m, p.x, p.y)) {
    monsterAttack(g, m);
    return;
  }
  if (def.erratic && rng.chance(def.erratic)) {
    randomStep(g, m, def);
    return;
  }
  if (!m.target || (m.x === m.target.x && m.y === m.target.y) || m.lost > 20) {
    m.ai = 'wander';
    m.target = null;
    m.path = null;
    return;
  }
  stepToward(g, m, def, m.target.x, m.target.y, sees);
}

function canReach(g, m, x, y) {
  const lv = g.level;
  const dx = x - m.x, dy = y - m.y;
  if (MONSTERS[m.id].phase) return true;
  return diagonalOk(lv.tiles, g.idx(m.x, m.y), g.idx(x, y), dx, dy);
}

/** Can monster m enter (x, y)? Returns 'move', 'door' or null. */
function enterable(g, m, def, x, y) {
  if (!g.inBounds(x, y)) return null;
  const p = g.state.player;
  if (p.x === x && p.y === y) return null;
  if (g.monsterAt(x, y)) return null;
  if (def.phase) return x > 0 && y > 0 && x < g.level.width - 1 && y < g.level.height - 1 ? 'move' : null;
  const t = g.level.tiles[g.idx(x, y)];
  if (!diagonalOk(g.level.tiles, g.idx(m.x, m.y), g.idx(x, y), x - m.x, y - m.y)) return null;
  if (isWalkable(t)) return 'move';
  if (t === 'door_closed' && def.opensDoors) return 'door';
  return null;
}

function doStep(g, m, def, x, y) {
  const how = enterable(g, m, def, x, y);
  if (!how) return false;
  if (how === 'door') {
    g.setTile(x, y, 'door_open');
    if (g.isVisible(x, y)) {
      g.emit({ type: 'door', x, y, open: true, by: m.uid });
      g.log('Eine Tür schwingt knarrend auf.', 'warn');
    }
    return true;
  }
  g.moveMonster(m, x, y);
  return true;
}

function stepToward(g, m, def, tx, ty, sees) {
  const rng = g.rng;
  if (def.phase) {
    let best = null, bd = Infinity;
    for (const [dx, dy] of DIRS) {
      const x = m.x + dx, y = m.y + dy;
      if (!enterable(g, m, def, x, y)) continue;
      const d = (x - tx) ** 2 + (y - ty) ** 2;
      if (d < bd) { bd = d; best = [x, y]; }
    }
    if (best) doStep(g, m, def, best[0], best[1]);
    return;
  }
  const p = g.state.player;
  if (sees && tx === p.x && ty === p.y) {
    const dm = g.distMap();
    const cur = dm[g.idx(m.x, m.y)];
    if (cur > 0) {
      let best = [], bd = cur;
      for (const [dx, dy] of DIRS) {
        const x = m.x + dx, y = m.y + dy;
        if (!g.inBounds(x, y)) continue;
        const d = dm[g.idx(x, y)];
        if (d < 0 || d > bd) continue;
        if (!enterable(g, m, def, x, y)) continue;
        if (d < bd) { bd = d; best = [[x, y]]; } else best.push([x, y]);
      }
      if (best.length && bd < cur) {
        const [x, y] = best.length > 1 ? rng.pick(best) : best[0];
        doStep(g, m, def, x, y);
        return;
      }
      if (best.length && rng.chance(0.3)) {
        const [x, y] = rng.pick(best);
        doStep(g, m, def, x, y);
        return;
      }
      return;
    }
  }
  const path = monsterPath(g, m, def, tx, ty);
  if (path && path.length) {
    const i = path[0];
    const x = i % g.level.width, y = (i - x) / g.level.width;
    if (!doStep(g, m, def, x, y)) m.lost += 2;
  } else m.lost += 3;
}

function monsterPath(g, m, def, tx, ty) {
  const lv = g.level;
  return astar(lv.width, lv.height, lv.tiles, m.x, m.y, tx, ty, (i) => {
    const t = lv.tiles[i];
    if (isWalkable(t)) return 1;
    if (t === 'door_closed' && def.opensDoors) return 2;
    return Infinity;
  }, { maxNodes: 1500 });
}

function randomStep(g, m, def) {
  const opts = [];
  for (const [dx, dy] of DIRS) if (enterable(g, m, def, m.x + dx, m.y + dy) === 'move') opts.push([m.x + dx, m.y + dy]);
  if (!opts.length) return false;
  const [x, y] = g.rng.pick(opts);
  return doStep(g, m, def, x, y);
}

function stepAway(g, m, dist) {
  const def = MONSTERS[m.id];
  const p = g.state.player;
  const dm = g.distMap();
  let best = null, bd = dm[g.idx(m.x, m.y)];
  for (const [dx, dy] of DIRS) {
    const x = m.x + dx, y = m.y + dy;
    if (enterable(g, m, def, x, y) !== 'move') continue;
    const d = def.phase ? cheb(x, y, p.x, p.y) : dm[g.idx(x, y)];
    if (d > bd && cheb(x, y, p.x, p.y) >= dist) { bd = d; best = [x, y]; }
  }
  if (!best) return false;
  return doStep(g, m, def, best[0], best[1]);
}

function flee(g, m, def, dist) {
  const p = g.state.player;
  if (m.stolen > 0) {
    if (!g.canSeeMonster(m)) {
      m.hidden = (m.hidden ?? 0) + 1;
      if (m.hidden >= 3) {
        g.log(`${cap(np(monSpec(m.id), { case: 'nom', article: 'def' }))} ist mit deinem Gold entkommen.`, 'bad');
        g.removeMonster(m);
        return;
      }
    } else m.hidden = 0;
  }
  if (stepAway(g, m, dist)) return;
  if (dist === 1 && canReach(g, m, p.x, p.y)) monsterAttack(g, m);
}

function wander(g, m, def) {
  if (def.stationary || def.dormant) return;
  const rng = g.rng;
  if (def.erratic && rng.chance(def.erratic)) { randomStep(g, m, def); return; }
  if (def.phase) { randomStep(g, m, def); return; }
  const lv = g.level;
  if (!m.path || !m.path.length || rng.chance(0.02)) {
    const goal = g.randomWalkable();
    if (!goal) return;
    m.path = monsterPath(g, m, def, goal.x, goal.y);
    if (!m.path) return;
  }
  const i = m.path[0];
  const x = i % lv.width, y = (i - x) / lv.width;
  if (doStep(g, m, def, x, y)) {
    if (m.x === x && m.y === y) m.path.shift();
  } else m.path = null;
}

function fireBolt(g, m, def) {
  const p = g.state.player, rng = g.rng;
  const visible = g.canSeeMonster(m);
  g.emit({ type: 'projectile', kind: def.ranged.kind, from: { x: m.x, y: m.y }, to: { x: p.x, y: p.y }, by: m.uid });
  if (visible) g.log(`${cap(g.monName(m, 'nom'))} schleudert einen Feuerbolzen.`, 'warn');
  else g.log('Ein Feuerbolzen schießt aus der Dunkelheit heran!', 'warn');
  const chance = clamp(def.acc - g.playerEvasion(), 10, 95);
  if (rng.int(1, 100) > chance) {
    g.emit({ type: 'attack', attacker: m.uid, attackerKind: m.id, target: p.uid, targetKind: 'player', result: 'miss', damage: 0, killed: false, ranged: true });
    g.log('Der Feuerbolzen verfehlt dich knapp.', 'info');
    return;
  }
  const [n, s, b] = def.ranged.dmg;
  const dmg = Math.max(1, rng.roll(n, s, b) - rng.int(0, Math.floor(g.playerArmor() / 2)));
  g.emit({ type: 'attack', attacker: m.uid, attackerKind: m.id, target: p.uid, targetKind: 'player', result: 'hit', damage: dmg, killed: dmg >= p.hp, ranged: true });
  g.log('Der Feuerbolzen trifft dich.', 'bad');
  g.damagePlayer(dmg, killedBy(m, 'verbrannt'), 'fire');
}

function leap(g, m, def) {
  const p = g.state.player;
  let best = null, bd = Infinity;
  for (const [dx, dy] of DIRS) {
    const x = p.x + dx, y = p.y + dy;
    if (!g.inBounds(x, y) || !isWalkable(g.level.tiles[g.idx(x, y)]) || g.monsterAt(x, y)) continue;
    const d = cheb(m.x, m.y, x, y);
    if (d > def.leap || d === 0) continue;
    const pts = line(m.x, m.y, x, y);
    if (pts.some((pt) => g.blocksProjectile(pt.x, pt.y) || (g.monsterAt(pt.x, pt.y) && !(pt.x === m.x && pt.y === m.y)))) continue;
    if (d < bd) { bd = d; best = { x, y }; }
  }
  if (!best) return false;
  const from = { x: m.x, y: m.y };
  const seenBefore = g.canSeeMonster(m);
  g.moveMonster(m, best.x, best.y, true);
  if (seenBefore || g.canSeeMonster(m)) g.emit({ type: 'effect', kind: 'leap', uid: m.uid, from, to: best });
  if (g.canSeeMonster(m)) g.log(`${cap(g.monName(m, 'nom'))} springt auf dich zu!`, 'warn');
  m.cd = 4;
  return true;
}

/** Melee attack of monster m against the player. */
export function monsterAttack(g, m) {
  const def = MONSTERS[m.id];
  const st = g.state, p = st.player, rng = g.rng;
  const M = cap(g.monName(m, 'nom'));
  const chance = clamp(def.acc - g.playerEvasion(), 10, 95);
  const base = { type: 'attack', attacker: m.uid, attackerKind: m.id, target: p.uid, targetKind: 'player' };
  if (rng.int(1, 100) > chance) {
    g.emit({ ...base, result: 'miss', damage: 0, killed: false });
    g.log(`${M} verfehlt dich.`, 'info');
    return;
  }
  if (def.steal && p.gold > 0 && !m.stolen) {
    const amount = Math.min(p.gold, rng.int(10, 25) + st.depth * 6);
    p.gold -= amount;
    m.stolen = amount;
    m.ai = 'flee';
    g.emit({ ...base, result: 'hit', damage: 0, killed: false });
    g.emit({ type: 'gold', amount: -amount, total: p.gold, by: m.uid });
    g.log(`${M} schnappt sich ${amount} Goldmünzen und huscht davon!`, 'bad');
    g.interrupt('stolen');
    return;
  }
  const crit = rng.chance(0.05);
  let dmg = rng.roll(def.dmg[0], def.dmg[1], def.dmg[2]);
  if (crit) dmg = Math.floor(dmg * 1.5);
  dmg = Math.max(0, dmg - rng.int(0, g.playerArmor()));
  g.emit({ ...base, result: crit ? 'crit' : 'hit', damage: dmg, killed: dmg >= p.hp });
  if (dmg === 0) {
    g.log(`${M} trifft dich, doch deine Rüstung fängt den Schlag ab.`, 'info');
    return;
  }
  g.log(def.hit.replace('{M}', M) + (crit ? ' Ein schwerer Treffer!' : ''), 'bad');
  if (g.damagePlayer(dmg, killedBy(m), 'melee')) return;
  if (def.poison && rng.chance(def.poison.chance)) {
    g.log('Gift brennt in der Wunde.', 'bad');
    g.addStatus(p, 'poison', rng.int(def.poison.turns[0], def.poison.turns[1]));
  }
  if (def.confuse && rng.chance(def.confuse)) {
    g.log('Sporen nebeln deine Sinne ein.', 'bad');
    g.addStatus(p, 'confusion', rng.int(3, 5));
    g.emit({ type: 'effect', kind: 'spores', at: { x: p.x, y: p.y } });
  }
  if (def.drainOil && p.oil > 0) {
    const before = p.oil;
    p.oil = Math.max(0, p.oil - def.drainOil);
    g.emit({ type: 'oil', from: before, to: p.oil, max: p.oilMax, reason: 'drain', by: m.uid });
    g.log('Deine Lampe flackert, Öl tropft zu Boden.', 'bad');
    g.onOilChanged(before);
  }
}
