// Shared helpers for engine tests.
import { Game, MONSTERS } from '../js/engine/index.js';
import { isWalkable } from '../js/engine/path.js';

/** New game with an empty level (no monsters) for controlled scenarios. */
export function quietGame(seed = 'test') {
  const g = Game.create({ seed });
  g.state.level.monsters = [];
  g.state.level.traps = [];
  g.updateVision();
  return g;
}

/** A free walkable neighbour of the player (orthogonal preferred). */
export function freeNeighbor(g) {
  const p = g.state.player;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    const x = p.x + dx, y = p.y + dy;
    if (g.isFree(x, y) && !g.state.level.tiles[g.idx(x, y)].startsWith('door') && !g.state.level.tiles[g.idx(p.x, p.y)].startsWith('door')) return { x, y, dx, dy };
  }
  throw new Error('no free neighbour');
}

/** Put a monster next to the player. */
export function adjacentMonster(g, id, ai = 'hunt') {
  const n = freeNeighbor(g);
  const m = g.spawnMonster(id, n.x, n.y, ai);
  g.updateVision();
  return { m, ...n };
}

export function logs(events) {
  return events.filter((e) => e.type === 'log').map((e) => e.text);
}

/** Throws with a message if an invariant is violated. */
export function checkInvariants(g) {
  const st = g.state, p = st.player, lv = st.level;
  const fail = (msg) => { throw new Error(`invariant: ${msg} (seed ${st.seed}, turn ${st.turn}, depth ${st.depth})`); };
  const n = lv.width * lv.height;
  if (lv.tiles.length !== n || lv.visible.length !== n || lv.memTiles.length !== n) fail('array sizes');
  if (!(p.hp <= p.maxHp)) fail(`hp ${p.hp} > max ${p.maxHp}`);
  if (p.hp < 0) fail('negative hp');
  if (st.status === 'playing' && p.hp <= 0) fail('alive with 0 hp');
  if (p.oil < 0 || p.oil > p.oilMax) fail(`oil ${p.oil}`);
  if (!isWalkable(lv.tiles[g.idx(p.x, p.y)])) fail(`player on ${lv.tiles[g.idx(p.x, p.y)]}`);
  if (p.inventory.length > 20) fail('inventory > 20');
  const uids = new Set();
  for (const it of p.inventory) {
    if (!(it.count >= 1)) fail('bad count');
    if (uids.has(it.uid)) fail('duplicate inventory uid');
    uids.add(it.uid);
  }
  for (const [slot, uid] of Object.entries(p.equipment)) if (uid != null && !uids.has(uid)) fail(`equipment ${slot} missing`);
  const occ = new Set([g.idx(p.x, p.y)]);
  for (const m of lv.monsters) {
    if (m.dead) fail('dead monster in list');
    if (!(m.hp > 0 && m.hp <= m.maxHp)) fail(`monster hp ${m.hp}/${m.maxHp}`);
    if (!g.inBounds(m.x, m.y)) fail('monster out of bounds');
    const i = g.idx(m.x, m.y);
    if (occ.has(i)) fail(`two creatures on ${m.x},${m.y}`);
    occ.add(i);
    if (!MONSTERS[m.id].phase && !isWalkable(lv.tiles[i])) fail(`${m.id} inside ${lv.tiles[i]}`);
  }
  for (const it of lv.items) {
    if (!isWalkable(lv.tiles[g.idx(it.x, it.y)])) fail(`item in ${lv.tiles[g.idx(it.x, it.y)]}`);
    if (!(it.count >= 1)) fail('floor item count');
  }
}
