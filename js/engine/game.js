// Tiefenlicht — headless game engine (main module).
//
// Pure: no DOM, no timers, no Math.random. All randomness comes from a seeded
// RNG whose state lives in game.state, so serialize -> deserialize -> continue
// is deterministic. Coordinates: x grows to the right, y grows downwards,
// tile index = y * width + x.

/**
 * @typedef {{x:number, y:number}} Point
 *
 * @typedef {Object} Item
 * @property {number} uid
 * @property {'weapon'|'armor'|'thrown'|'potion'|'scroll'|'wand'|'ring'|'oil'|'gold'|'artifact'} cat
 * @property {string} kind      fixed id, e.g. 'dolch', 'heilung', 'blitz', 'oelflasche', 'gold', 'sonnenscherbe'
 * @property {number} count     stack size (gold: amount)
 * @property {string} [appearance] potion colour / scroll rune word / wand material / ring gem id (constant per kind per run)
 * @property {number} [ench]    weapons/armor: enchantment
 * @property {boolean} [known]  weapons/armor: enchantment known
 * @property {number} [charges] wands
 * @property {number} [x]       only for items lying on the floor
 * @property {number} [y]
 * @property {boolean} [ignored] floor item the player dropped / stepped over; auto-pickup and auto-explore skip it
 *   NOTE: never show `kind` of an unidentified item to the player; use game.itemName().
 *
 * @typedef {Object} Monster
 * @property {number} uid
 * @property {string} id        monster id, e.g. 'ratte'
 * @property {number} x
 * @property {number} y
 * @property {number} hp
 * @property {number} maxHp
 * @property {'asleep'|'dormant'|'wander'|'hunt'|'flee'} ai
 * @property {Object<string, number>} statuses  status id -> remaining turns
 *
 * @typedef {Object} Trap
 * @property {number} x
 * @property {number} y
 * @property {'trap_dart'|'trap_teleport'|'trap_alarm'|'trap_pit'} kind
 * @property {boolean} hidden
 *
 * @typedef {Object} Level
 * @property {number} depth
 * @property {'stollen'|'pilzgrotte'|'hallen'|'herz'} biome
 * @property {number} width
 * @property {number} height
 * @property {string[]} tiles       tile id per index (see TILES)
 * @property {(string|null)[]} memTiles remembered tile id per index (null = never seen)
 * @property {number[]} explored    1 if ever seen
 * @property {number[]} visible     1 if currently visible
 * @property {number[]} light       0..1 light intensity of currently visible tiles (0 elsewhere)
 * @property {Object<string, Object[]>} memItems  index -> last-seen item snapshots on that tile
 * @property {Item[]} items        floor items (with x, y)
 * @property {Monster[]} monsters
 * @property {Trap[]} traps         includes hidden traps: only render traps with hidden === false
 * @property {Point|null} stairs
 *
 * @typedef {Object} Player
 * @property {number} uid          always 0
 * @property {number} x
 * @property {number} y
 * @property {number} hp
 * @property {number} maxHp
 * @property {number} str          base strength (see playerStats() for effective)
 * @property {number} level
 * @property {number} xp
 * @property {number} gold
 * @property {number} oil
 * @property {number} oilMax
 * @property {Object<string, number>} statuses
 * @property {Item[]} inventory    max 20 entries (stacks count once); equipped items stay in here
 * @property {{weapon:number|null, armor:number|null, ring1:number|null, ring2:number|null}} equipment  item uids
 *
 * @typedef {Object} GameState
 * @property {number} version
 * @property {string} seed
 * @property {'playing'|'dead'|'won'} status
 * @property {number} depth
 * @property {number} turn
 * @property {Player} player
 * @property {Level} level
 * @property {Object} ident        identification knowledge: ident[cat] = {appearance:{kind:appearanceId}, known:{kind:true}}
 * @property {Object} stats        run statistics (see runSummary())
 * @property {{autoPickup:boolean}} options
 *
 * @typedef {Object} Action
 * @property {'move'|'wait'|'rest'|'pickup'|'drop'|'use'|'equip'|'unequip'|'throw'|'descend'|'travel'|'explore'} type
 * @property {number} [dx]        move: -1..1
 * @property {number} [dy]
 * @property {number} [itemUid]   drop/use/equip/unequip/throw/pickup
 * @property {number} [count]     drop: how many of a stack
 * @property {Point}  [target]    use (wands, thrown) / throw: target tile
 * @property {number} [targetUid] use (scroll of identification): inventory item
 * @property {number} [turns]     rest: fixed number of turns (default: until healed)
 * @property {number} [x]         travel destination
 * @property {number} [y]
 *
 * @typedef {{type:string, [key:string]:any}} GameEvent   see README.md for every event type
 */

import { Rng, seedState } from './rng.js';
import {
  MAX_DEPTH, INVENTORY_SLOTS, MAX_LEVEL, OIL_MAX, OIL_BURN, COLD_INTERVAL, lampRadiusFor,
  TILES, BIOME_TILE_NAMES, TRAPS, ARRIVAL, STATUSES, MONSTERS, WEAPONS, ARMORS, XP_TABLE, BIOMES,
} from './data.js';
import { np, cap } from './grammar.js';
import { shadowcast, falloff } from './fov.js';
import { DIRS, bfs, astar, diagonalOk, isWalkable, isPassableOrDoor, cheb, line } from './path.js';
import { generateLevel } from './mapgen.js';
import { populateLevel, randomMonsterId } from './populate.js';
import { makeIdent, makeItem, makeMonster, isStackable } from './entities.js';
import { itemName, itemDescription, useItem, throwItem, equip, unequip, isUnidentified, kindKnown } from './items.js';
import { monsterTurn, monSpec } from './monsters.js';

export const VERSION = 1;
export const PLAYER_UID = 0;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const OPAQUE = Object.fromEntries(Object.entries(TILES).map(([k, v]) => [k, v.opaque]));

function emptyLevelArrays(n) {
  return {
    memTiles: new Array(n).fill(null),
    explored: new Array(n).fill(0),
    visible: new Array(n).fill(0),
    light: new Array(n).fill(0),
    memItems: {},
  };
}

export class Game {
  /** @param {GameState} state */
  constructor(state) {
    /** @type {GameState} */
    this.state = state;
    this.rng = new Rng(state.rng);
    /** @type {GameEvent[]} */
    this._ev = [];
    this._cache = {};
    this._interrupted = false;
    this._searching = false;
    /** true if the last act() consumed game time */
    this.lastActionTookTurn = false;
    /** Uint8Array line-of-sight from the player (walls included), recomputed every turn */
    this.los = null;
  }

  // ======================================================== creation / saving

  /**
   * Start a new run.
   * @param {{seed?: string|number, options?: {autoPickup?: boolean}}} [opts]
   * @returns {Game} game; game.startEvents holds the arrival events
   */
  static create({ seed = 'tiefenlicht', options = {} } = {}) {
    seed = String(seed);
    const identRng = Rng.fromSeed(`${seed}:ident`);
    const state = {
      version: VERSION,
      seed,
      rng: seedState(`${seed}:play`),
      options: { autoPickup: true, ...options },
      tick: 0,
      turn: 0,
      depth: 1,
      status: 'playing',
      nextUid: 1,
      ident: makeIdent(identRng),
      player: {
        uid: PLAYER_UID, x: 0, y: 0, hp: 20, maxHp: 20, str: 12, level: 1, xp: 0, gold: 0,
        energy: 100, oil: OIL_MAX, oilMax: OIL_MAX, oilAcc: 0, regenAcc: 0, coldTimer: 0,
        statuses: {}, inventory: [], equipment: { weapon: null, armor: null, ring1: null, ring2: null }, seen: [],
      },
      level: null,
      stats: { kills: {}, goldFound: 0, maxDepth: 1, cause: null, darkTurns: 0, potions: 0, scrolls: 0, deaths: null },
    };
    const g = new Game(state);
    const p = state.player;
    const add = (cat, kind, o) => { const it = makeItem(state, cat, kind, o); p.inventory.push(it); return it; };
    const dagger = add('weapon', 'dolch', { known: true });
    const vest = add('armor', 'lederwams', { known: true });
    add('oil', 'oelflasche');
    add('potion', 'heilung');
    add('thrown', 'wurfmesser', { count: 3 });
    p.equipment.weapon = dagger.uid;
    p.equipment.armor = vest.uid;
    g._ev = [];
    g.enterLevel(1, 'start');
    g.startEvents = g._ev;
    g._ev = [];
    return g;
  }

  /** @returns {object} plain JSON-able snapshot (includes `version`) */
  serialize() {
    return JSON.parse(JSON.stringify(this.state));
  }

  /** @param {object} obj result of serialize() */
  static deserialize(obj) {
    if (!obj || obj.version !== VERSION) throw new Error(`Unsupported save version: ${obj && obj.version}`);
    const g = new Game(JSON.parse(JSON.stringify(obj)));
    g._ev = [];
    g.updateVision();
    g._ev = [];
    return g;
  }

  /** Change an option (currently: autoPickup). */
  setOption(key, value) {
    this.state.options[key] = value;
  }

  get level() { return this.state.level; }
  get player() { return this.state.player; }

  // ======================================================== event plumbing

  emit(ev) {
    this._ev.push(ev);
    return ev;
  }

  log(text, tone = 'info') {
    this._ev.push({ type: 'log', text, tone });
  }

  interrupt(reason, extra = {}) {
    this._interrupted = true;
    this.emit({ type: 'interrupt', reason, ...extra });
  }

  /** Reject an action: explanatory log, no turn. */
  invalid(text) {
    this.log(text, 'warn');
    this.lastActionTookTurn = false;
    this._invalid = true;
  }

  needTarget(item, target, purpose, range = null, filter = null) {
    this.emit({ type: 'need_target', itemUid: item.uid, target, purpose, range, filter });
    this._invalid = true;
  }

  // ======================================================== acting

  /**
   * Perform a player action.
   * @param {Action} action
   * @returns {GameEvent[]} events in the order they happened
   */
  act(action) {
    this._ev = [];
    this._invalid = false;
    this._interrupted = false;
    this.lastActionTookTurn = false;
    if (this.state.status !== 'playing') {
      this.log('Das Spiel ist vorbei.', 'info');
      return this._ev;
    }
    const handler = action && HANDLERS[action.type];
    if (!handler) {
      this.invalid('Unbekannte Aktion.');
      return this._ev;
    }
    handler.call(this, action);
    const ev = this._ev;
    this._ev = [];
    return ev;
  }

  /** Spend a turn and let the world run until the player may act again. */
  endTurn(cost = 100) {
    this.lastActionTookTurn = true;
    this.advance(cost);
  }

  advance(cost) {
    const st = this.state, p = st.player;
    p.energy -= cost;
    this.updateVision();
    while (p.energy < 100 && st.status === 'playing') {
      st.tick++;
      p.energy += this.playerSpeed();
      const lvl = st.level;
      for (const m of lvl.monsters.slice()) {
        if (m.dead) continue;
        m.energy += this.monsterSpeed(m);
        while (m.energy >= 100 && !m.dead && st.status === 'playing' && st.level === lvl) {
          m.energy -= 100;
          monsterTurn(this, m);
        }
        if (st.status !== 'playing' || st.level !== lvl) break;
      }
      if (st.status !== 'playing') break;
      if (st.tick % 10 === 0) this.worldTurn();
    }
    this._searching = false;
    if (st.status === 'playing') {
      this.updateVision();
      this.checkSightings();
    }
  }

  /** Effects that happen once per game turn. */
  worldTurn() {
    const st = this.state, p = st.player, rng = this.rng;
    st.turn++;
    // --- lamp
    const before = p.oil;
    if (p.oil > 0) {
      p.oilAcc += this.hasRing('sparsamkeit') ? OIL_BURN / 2 : OIL_BURN;
      while (p.oilAcc >= 1 && p.oil > 0) { p.oil--; p.oilAcc -= 1; }
    }
    const boss = st.level.monsters.find((m) => MONSTERS[m.id].boss);
    if (boss && boss.ai === 'hunt' && p.oil > 0 && this.monsterSeesPlayer(boss) && cheb(boss.x, boss.y, p.x, p.y) <= 9) {
      const b2 = p.oil;
      p.oil = Math.max(0, p.oil - 4);
      this.emit({ type: 'oil', from: b2, to: p.oil, max: p.oilMax, reason: 'drain', by: boss.uid });
      if (st.turn % 8 === 0) this.log('Der Lichtfresser saugt am Licht deiner Lampe.', 'bad');
    }
    if (p.oil !== before) this.onOilChanged(before);
    // --- player statuses
    if (p.statuses.poison) {
      this.emit({ type: 'effect', kind: 'poison', at: { x: p.x, y: p.y } });
      if (this.damagePlayer(1, 'An Gift gestorben', 'poison')) return;
    }
    this.tickStatuses(p);
    // --- regeneration / cold
    if (p.oil <= 0) {
      st.stats.darkTurns++;
      p.coldTimer++;
      if (p.coldTimer >= COLD_INTERVAL) {
        p.coldTimer = 0;
        this.log('Die Kälte der Tiefe kriecht in deine Glieder.', 'bad');
        this.emit({ type: 'effect', kind: 'cold', at: { x: p.x, y: p.y } });
        if (this.damagePlayer(1, 'In der Dunkelheit erfroren', 'cold')) return;
      }
    } else if (!p.statuses.poison && p.hp < p.maxHp) {
      const interval = Math.max(3, 12 - p.level * 0.6);
      p.regenAcc += (this.hasRing('regeneration') ? 2 : 1) / interval;
      if (p.regenAcc >= 1) {
        const n = Math.floor(p.regenAcc);
        p.regenAcc -= n;
        p.hp = Math.min(p.maxHp, p.hp + n);
      }
    }
    // --- rings reveal themselves over time
    for (const slot of ['ring1', 'ring2']) {
      const r = this.equipped(slot);
      if (!r || kindKnown(st, r)) continue;
      r.worn = (r.worn ?? 0) + 1;
      if (r.worn >= 150) {
        st.ident.ring.known[r.kind] = true;
        this.emit({ type: 'identify', cat: 'ring', kind: r.kind, appearance: r.appearance, uid: r.uid });
        this.log(`Du verstehst nun die Kraft deines Rings: ${itemName(st, r, { case: 'nom', article: 'none' })}.`, 'good');
      }
    }
    // --- monsters
    for (const m of st.level.monsters.slice()) {
      const d = MONSTERS[m.id];
      if (d.regen && m.hp < m.maxHp) m.hp = Math.min(m.maxHp, m.hp + d.regen);
      this.tickStatuses(m);
    }
    // --- trap detection
    for (const t of st.level.traps) {
      if (!t.hidden || cheb(t.x, t.y, p.x, p.y) > 2 || !this.isVisible(t.x, t.y)) continue;
      if (rng.chance(this._searching ? 0.25 : 0.07)) {
        t.hidden = false;
        this.emit({ type: 'trap_found', kind: t.kind, x: t.x, y: t.y });
        this.log(`Du entdeckst ${np({ noun: TRAPS[t.kind].name }, { case: 'acc', article: 'indef' })}.`, 'warn');
        this.interrupt('trap_found');
      }
    }
    // --- wandering newcomers
    if (st.level.biome !== 'herz' && st.level.monsters.length < 28 && rng.chance(1 / 200)) {
      const spot = this.randomWalkable((x, y) => !this.isVisible(x, y) && !this.monsterAt(x, y) && cheb(x, y, p.x, p.y) > 10);
      if (spot) this.spawnMonster(randomMonsterId(rng, st.depth), spot.x, spot.y, 'wander');
    }
  }

  tickStatuses(ent) {
    const isPlayer = ent === this.state.player;
    for (const k of Object.keys(ent.statuses)) {
      ent.statuses[k]--;
      if (ent.statuses[k] > 0) continue;
      delete ent.statuses[k];
      if (isPlayer) {
        this.emit({ type: 'status', uid: ent.uid, status: k, change: 'expired' });
        this.log(STATUSES[k].end, 'info');
      } else {
        if (k === 'fear' && ent.ai === 'flee' && !ent.stolen) ent.ai = 'hunt';
        if (this.canSeeMonster(ent)) this.emit({ type: 'status', uid: ent.uid, status: k, change: 'expired' });
      }
    }
  }

  // ======================================================== levels

  /** Generate and enter a level. via: 'start' | 'stairs' | 'pit' */
  enterLevel(depth, via) {
    const st = this.state, p = st.player;
    const genRng = Rng.fromSeed(`${st.seed}:level:${depth}`);
    const gen = generateLevel(depth, genRng);
    const n = gen.width * gen.height;
    const level = {
      depth, biome: gen.biome, width: gen.width, height: gen.height, tiles: gen.tiles,
      ...emptyLevelArrays(n),
      items: [], monsters: [], traps: [],
      stairs: gen.stairs, start: gen.start, arena: gen.arena, chambers: gen.chambers, mapVersion: 0,
    };
    populateLevel(st, level, genRng);
    st.level = level;
    st.depth = depth;
    st.stats.maxDepth = Math.max(st.stats.maxDepth, depth);
    this._cache = {};
    if (via === 'pit') {
      const spot = this.randomWalkable((x, y) => !this.monsterAt(x, y) && cheb(x, y, level.start.x, level.start.y) > 0) ?? level.start;
      p.x = spot.x; p.y = spot.y;
    } else {
      p.x = level.start.x; p.y = level.start.y;
      const blocker = this.monsterAt(p.x, p.y);
      if (blocker) this.removeMonster(blocker);
    }
    p.seen = [];
    p.energy = 100;
    if (via !== 'start') this.emit({ type: 'descend', depth, biome: level.biome, via });
    this.log(`Ebene ${depth} – ${BIOMES[level.biome].name}`, 'info');
    this.log(ARRIVAL[depth] ?? 'Die Dunkelheit wird dichter.', 'flavor');
    this.updateVision();
    this.checkSightings();
  }

  // ======================================================== geometry helpers

  idx(x, y) { return y * this.state.level.width + x; }
  inBounds(x, y) { const l = this.state.level; return x >= 0 && y >= 0 && x < l.width && y < l.height; }
  tileAt(x, y) { return this.inBounds(x, y) ? this.state.level.tiles[this.idx(x, y)] : 'wall'; }
  isVisible(x, y) { return this.inBounds(x, y) && this.state.level.visible[this.idx(x, y)] === 1; }

  setTile(x, y, t) {
    const lv = this.state.level;
    lv.tiles[this.idx(x, y)] = t;
    lv.mapVersion++;
    this._cache = {};
    if (this.isVisible(x, y)) this.emit({ type: 'tile', x, y, tile: t });
  }

  blocksProjectile(x, y) {
    if (!this.inBounds(x, y)) return true;
    const t = this.state.level.tiles[this.idx(x, y)];
    return t === 'wall' || t === 'door_closed' || t === 'brazier_lit' || t === 'brazier_out';
  }

  monsterAt(x, y) {
    for (const m of this.state.level.monsters) if (m.x === x && m.y === y && !m.dead) return m;
    return null;
  }

  monsterByUid(uid) {
    return this.state.level.monsters.find((m) => m.uid === uid) ?? null;
  }

  /** Walkable, not occupied by a monster or the player. */
  isFree(x, y) {
    const p = this.state.player;
    return this.inBounds(x, y) && isWalkable(this.tileAt(x, y)) && !this.monsterAt(x, y) && !(p.x === x && p.y === y);
  }

  randomWalkable(filter = () => true) {
    const lv = this.state.level;
    const cands = [];
    for (let i = 0; i < lv.tiles.length; i++) {
      const t = lv.tiles[i];
      if (t !== 'floor' && t !== 'fungus') continue;
      const x = i % lv.width, y = (i - x) / lv.width;
      if (filter(x, y)) cands.push(i);
    }
    if (!cands.length) return null;
    const i = this.rng.pick(cands);
    return { x: i % lv.width, y: Math.floor(i / lv.width) };
  }

  freeTileNear(x, y, r) {
    for (let d = 1; d <= r; d++) {
      const ring = [];
      for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
        if (this.isFree(x + dx, y + dy) && this.lineClear(x, y, x + dx, y + dy)) ring.push({ x: x + dx, y: y + dy });
      }
      if (ring.length) return this.rng.pick(ring);
    }
    return null;
  }

  lineClear(x0, y0, x1, y1) {
    for (const pt of line(x0, y0, x1, y1)) {
      if (pt.x === x1 && pt.y === y1) return true;
      if (this.blocksProjectile(pt.x, pt.y)) return false;
    }
    return true;
  }

  /** Clear line of fire from monster m to the player. */
  clearShot(m) {
    const p = this.state.player;
    for (const pt of line(m.x, m.y, p.x, p.y)) {
      if (pt.x === p.x && pt.y === p.y) return true;
      if (this.blocksProjectile(pt.x, pt.y) || this.monsterAt(pt.x, pt.y)) return false;
    }
    return true;
  }

  /** BFS distance map from the player (closed doors passable). Cached per turn. */
  distMap() {
    const lv = this.state.level, p = this.state.player;
    const key = `${p.x},${p.y},${lv.mapVersion},${lv.depth}`;
    if (this._cache.distKey !== key) {
      this._cache.distKey = key;
      this._cache.dist = bfs(lv.width, lv.height, lv.tiles, p.x, p.y, (i) => isPassableOrDoor(lv.tiles[i]));
    }
    return this._cache.dist;
  }

  // ======================================================== vision & light

  staticLight() {
    const lv = this.state.level;
    const key = `${lv.depth},${lv.mapVersion}`;
    if (this._cache.lightKey === key) return this._cache.light;
    const W = lv.width, H = lv.height;
    const out = new Float32Array(W * H);
    const blocks = (x, y) => x < 0 || y < 0 || x >= W || y >= H || OPAQUE[lv.tiles[y * W + x]];
    for (let i = 0; i < W * H; i++) {
      const src = TILES[lv.tiles[i]].light;
      if (!src) continue;
      const sx = i % W, sy = (i - sx) / W;
      shadowcast(sx, sy, src.radius, blocks, (x, y) => {
        if (x < 0 || y < 0 || x >= W || y >= H) return;
        const v = falloff(Math.hypot(x - sx, y - sy), src.radius) * src.strength;
        const j = y * W + x;
        if (v > out[j]) out[j] = v;
      });
    }
    this._cache.lightKey = key;
    this._cache.light = out;
    return out;
  }

  /** Recompute line of sight, light, visibility and memory. */
  updateVision() {
    const lv = this.state.level, p = this.state.player;
    const W = lv.width, H = lv.height, n = W * H;
    const los = new Uint8Array(n);
    const blocks = (x, y) => x < 0 || y < 0 || x >= W || y >= H || OPAQUE[lv.tiles[y * W + x]];
    shadowcast(p.x, p.y, Math.max(W, H), blocks, (x, y) => {
      if (x >= 0 && y >= 0 && x < W && y < H) los[y * W + x] = 1;
    });
    this.los = los;
    const r = this.lightRadius();
    const sl = this.staticLight();
    for (let i = 0; i < n; i++) {
      if (!los[i]) { lv.visible[i] = 0; lv.light[i] = 0; continue; }
      const x = i % W, y = (i - x) / W;
      const d = Math.hypot(x - p.x, y - p.y);
      const L = Math.max(falloff(d, r), sl[i]);
      if (L > 0.001 || d < 1.5) {
        lv.visible[i] = 1;
        lv.light[i] = Math.round(Math.max(L, 0.05) * 100) / 100;
        lv.memTiles[i] = lv.tiles[i];
        lv.explored[i] = 1;
      } else {
        lv.visible[i] = 0;
        lv.light[i] = 0;
      }
    }
    for (const k of Object.keys(lv.memItems)) if (lv.visible[+k]) delete lv.memItems[k];
    for (const it of lv.items) {
      const i = it.y * W + it.x;
      if (!lv.visible[i]) continue;
      (lv.memItems[i] ??= []).push(snapshot(it));
    }
  }

  lightRadius() {
    const p = this.state.player;
    if (p.statuses.finsternis) return 1;
    let r = lampRadiusFor(p.oil, p.oilMax);
    if (p.oil > 0) r += 2 * this.ringCount('weitsicht');
    return r;
  }

  canSeeMonster(m) {
    if (!this.isVisible(m.x, m.y)) return false;
    const d = MONSTERS[m.id];
    const p = this.state.player;
    if (d.sightRange && cheb(m.x, m.y, p.x, p.y) > d.sightRange) return false;
    return true;
  }

  /** Symmetric LOS: if the player has LOS to m's tile, m has LOS to the player. */
  monsterSeesPlayer(m) {
    if (!this.los) return false;
    const p = this.state.player;
    return this.los[this.idx(m.x, m.y)] === 1 && cheb(m.x, m.y, p.x, p.y) <= 20;
  }

  /** German name of a monster as the player perceives it ("etwas" if unseen). */
  monName(m, kase = 'nom', article = 'def') {
    if (!this.canSeeMonster(m)) return 'etwas';
    return np(monSpec(m.id), { case: kase, article });
  }

  checkSightings() {
    const p = this.state.player;
    const now = [];
    for (const m of this.state.level.monsters) {
      if (!this.canSeeMonster(m)) continue;
      now.push(m.uid);
      if (p.seen.includes(m.uid)) continue;
      this.log(`Du siehst ${np(monSpec(m.id), { case: 'acc', article: 'indef' })}.`, 'warn');
      this.interrupt('monster_appeared', { uid: m.uid, id: m.id });
    }
    p.seen = now;
  }

  // ======================================================== player numbers

  equipped(slot) {
    const p = this.state.player;
    const uid = p.equipment[slot];
    return uid == null ? null : p.inventory.find((it) => it.uid === uid) ?? null;
  }

  equippedSlot(item) {
    const eq = this.state.player.equipment;
    for (const s of Object.keys(eq)) if (eq[s] === item.uid) return s;
    return null;
  }

  ringCount(kind) {
    let n = 0;
    for (const s of ['ring1', 'ring2']) { const r = this.equipped(s); if (r && r.kind === kind) n++; }
    return n;
  }

  hasRing(kind) { return this.ringCount(kind) > 0; }

  noisyArmor() {
    const a = this.equipped('armor');
    return !!(a && ARMORS[a.kind].stealthPenalty);
  }

  playerStr() { return this.state.player.str + 2 * this.ringCount('kraft'); }
  strBonus() { return this.playerStr() - 11; }

  playerAccuracy() {
    const p = this.state.player, w = this.equipped('weapon');
    return 70 + 3 * (p.level - 1) + (w ? WEAPONS[w.kind].acc + 5 * w.ench : 0);
  }

  playerEvasion() {
    const p = this.state.player;
    return 5 + p.level + (p.statuses.haste ? 10 : 0) - (p.statuses.frozen ? 10 : 0);
  }

  playerArmor() {
    const p = this.state.player, a = this.equipped('armor');
    return Math.max(0, (a ? ARMORS[a.kind].armor + a.ench : 0) + 2 * this.ringCount('schutz') + (p.statuses.steinhaut ? 5 : 0));
  }

  playerDamageRange() {
    const w = this.equipped('weapon');
    const [n, s] = w ? WEAPONS[w.kind].dmg : [1, 3];
    const b = (w ? w.ench : 0) + this.strBonus();
    return { min: Math.max(1, n + b), max: Math.max(1, n * s + b) };
  }

  playerSpeed() {
    const p = this.state.player;
    let s = 10;
    if (p.statuses.haste) s *= 2;
    if (p.statuses.slow || p.statuses.frozen) s = Math.max(5, s / 2);
    return s;
  }

  monsterSpeed(m) {
    let s = MONSTERS[m.id].speed;
    if (m.statuses.slow) s = Math.max(3, Math.floor(s / 2));
    return s;
  }

  // ======================================================== HP, XP, statuses

  damagePlayer(n, cause, kind = 'hit') {
    const st = this.state, p = st.player;
    if (n <= 0 || st.status !== 'playing') return false;
    p.hp -= n;
    this.emit({ type: 'damage', uid: p.uid, amount: n, hp: Math.max(0, p.hp), maxHp: p.maxHp, kind });
    this.interrupt('damaged');
    if (p.hp <= 0) {
      p.hp = 0;
      this.die(cause);
      return true;
    }
    return false;
  }

  healPlayer(n) {
    const p = this.state.player;
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + n);
    if (p.hp > before) this.emit({ type: 'heal', uid: p.uid, amount: p.hp - before, hp: p.hp, maxHp: p.maxHp });
  }

  die(cause) {
    const st = this.state;
    st.status = 'dead';
    st.stats.cause = cause;
    this.emit({ type: 'death', cause });
    this.log(`Du bist tot. ${cause}.`, 'bad');
  }

  gainXp(n) {
    const p = this.state.player;
    p.xp += n;
    while (p.level < MAX_LEVEL && p.xp >= XP_TABLE[p.level + 1]) this.levelUp();
  }

  gainLevel() {
    const p = this.state.player;
    if (p.level >= MAX_LEVEL) { this.log('Du fühlst dich kurz erfahrener, doch mehr lernst du nicht.', 'info'); return; }
    p.xp = Math.max(p.xp, XP_TABLE[p.level + 1]);
    this.levelUp();
  }

  levelUp() {
    const p = this.state.player;
    p.level++;
    const gain = this.rng.int(3, 4);
    p.maxHp += gain;
    p.hp += gain;
    this.emit({ type: 'levelup', level: p.level, maxHp: p.maxHp });
    this.log(`Du erreichst Stufe ${p.level}! Du fühlst dich zäher und geschickter.`, 'good');
  }

  addStatus(ent, kind, turns) {
    const prev = ent.statuses[kind] ?? 0;
    ent.statuses[kind] = Math.max(prev, turns);
    const isPlayer = ent === this.state.player;
    if (isPlayer || this.canSeeMonster(ent)) {
      this.emit({ type: 'status', uid: ent.uid, status: kind, change: 'applied', turns: ent.statuses[kind] });
    }
    if (!isPlayer) {
      if (kind === 'fear' && ent.ai !== 'dormant') ent.ai = 'flee';
      if (this.canSeeMonster(ent) && !prev) {
        const M = cap(this.monName(ent, 'nom'));
        const msg = { stun: `${M} taumelt geblendet.`, frozen: `${M} erstarrt im Frost.`, fear: `${M} flieht in Panik.` }[kind];
        if (msg) this.log(msg, 'good');
      }
    } else if (STATUSES[kind].bad) this.interrupt('status', { status: kind });
  }

  removeStatus(ent, kind) {
    if (!ent.statuses[kind]) return;
    delete ent.statuses[kind];
    this.emit({ type: 'status', uid: ent.uid, status: kind, change: 'expired' });
    if (ent === this.state.player) this.log(STATUSES[kind].end, 'info');
  }

  /** Called whenever oil changed (before = old value): warnings + light events. */
  onOilChanged(before) {
    const p = this.state.player;
    const f0 = before / p.oilMax, f1 = p.oil / p.oilMax;
    const r0 = lampRadiusFor(before, p.oilMax), r1 = lampRadiusFor(p.oil, p.oilMax);
    if (r0 !== r1) this.emit({ type: 'light', radius: this.lightRadius(), oil: p.oil, max: p.oilMax });
    if (f1 >= f0) return;
    if (p.oil <= 0 && before > 0) {
      this.log('Deine Lampe erlischt! Kälte und Finsternis umfangen dich.', 'bad');
      this.interrupt('lamp_out');
    } else if (f1 <= 0.10 && f0 > 0.10) {
      this.log('Deine Lampe glimmt nur noch schwach!', 'warn');
      this.interrupt('oil_low');
    } else if (f1 <= 0.25 && f0 > 0.25) {
      this.log('Deine Lampe flackert – das Öl wird knapp.', 'warn');
      this.interrupt('oil_low');
    }
  }

  // ======================================================== monsters

  spawnMonster(id, x, y, ai) {
    const m = makeMonster(this.state, this.rng, id, x, y, ai);
    m.energy = 0;
    this.state.level.monsters.push(m);
    if (this.canSeeMonster(m)) this.emit({ type: 'spawn', uid: m.uid, id, x, y });
    return m;
  }

  removeMonster(m) {
    m.dead = true;
    const list = this.state.level.monsters;
    const i = list.indexOf(m);
    if (i >= 0) list.splice(i, 1);
  }

  moveMonster(m, x, y, leap = false) {
    const from = { x: m.x, y: m.y };
    const seenBefore = this.canSeeMonster(m);
    m.x = x; m.y = y;
    if (seenBefore || this.canSeeMonster(m)) this.emit({ type: 'move', uid: m.uid, id: m.id, from, to: { x, y }, leap });
  }

  /** Wake a monster and make it hunt the player. */
  alertMonster(m, announce) {
    const d = MONSTERS[m.id];
    const p = this.state.player;
    const was = m.ai;
    m.ai = 'hunt';
    m.target = { x: p.x, y: p.y };
    m.lost = 0;
    if (m.statuses.asleep) delete m.statuses.asleep;
    if (was === 'hunt' || was === 'flee') return;
    this.emit({ type: 'noticed', uid: m.uid, id: m.id });
    if (announce && this.canSeeMonster(m)) {
      const M = cap(this.monName(m, 'nom'));
      if (d.boss) this.log(`${M} erhebt sich aus der Finsternis! Seine Augen saugen das Licht auf.`, 'bad');
      else if (was === 'dormant' && d.dormant) this.log(`${M} erwacht knirschend zum Leben!`, 'warn');
      else if (was === 'dormant') this.log(`${M} regt sich.`, 'warn');
      else if (was === 'asleep') this.log(`${M} erwacht und bemerkt dich.`, 'warn');
      else this.log(`${M} bemerkt dich.`, 'warn');
      this.interrupt('noticed', { uid: m.uid });
    }
    if (d.pack) {
      for (const o of this.state.level.monsters) {
        if (o !== m && o.id === m.id && (o.ai === 'asleep' || o.ai === 'wander') && cheb(o.x, o.y, m.x, m.y) <= 10) {
          o.ai = 'hunt';
          o.target = { x: p.x, y: p.y };
          o.lost = 0;
        }
      }
    }
  }

  wakeMonster(m) {
    if (m.ai !== 'hunt' && m.ai !== 'flee') this.alertMonster(m, false);
  }

  teleportMonster(m) {
    const p = this.state.player;
    const from = { x: m.x, y: m.y };
    const spot = this.randomWalkable((x, y) => !this.monsterAt(x, y) && !(x === p.x && y === p.y) && cheb(x, y, p.x, p.y) > 12)
      ?? this.randomWalkable((x, y) => !this.monsterAt(x, y) && !(x === p.x && y === p.y));
    if (!spot) return;
    this.emit({ type: 'effect', kind: 'teleport', uid: m.uid, from, to: null });
    m.x = spot.x; m.y = spot.y;
    m.ai = 'wander'; m.target = null; m.path = null;
  }

  teleportPlayer(x, y) {
    const p = this.state.player;
    const from = { x: p.x, y: p.y };
    let spot = x != null ? { x, y } : this.randomWalkable((a, b) => !this.monsterAt(a, b) && cheb(a, b, p.x, p.y) > 8);
    spot ??= this.randomWalkable((a, b) => !this.monsterAt(a, b));
    if (!spot) return;
    p.x = spot.x; p.y = spot.y;
    this.emit({ type: 'effect', kind: 'teleport', uid: p.uid, from, to: { x: p.x, y: p.y } });
    this.emit({ type: 'move', uid: p.uid, id: 'player', from, to: { x: p.x, y: p.y }, teleport: true });
    this.updateVision();
  }

  /**
   * Damage a monster. Returns true if it died.
   * @param {object} o {byPlayer, kind}
   */
  damageMonster(m, n, { byPlayer = true, kind = 'hit' } = {}) {
    const d = MONSTERS[m.id];
    if (m.dead) return true;
    m.hp -= n;
    if (this.canSeeMonster(m)) this.emit({ type: 'damage', uid: m.uid, amount: n, hp: Math.max(0, m.hp), maxHp: m.maxHp, kind });
    if (m.statuses.asleep) delete m.statuses.asleep;
    this.wakeMonster(m);
    if (m.hp <= 0) {
      this.killMonster(m, byPlayer);
      return true;
    }
    if (d.split && m.splits < d.split && m.hp >= 4) {
      const spot = this.freeTileNear(m.x, m.y, 1);
      if (spot) {
        const child = this.spawnMonster(m.id, spot.x, spot.y, 'hunt');
        const half = Math.floor(m.hp / 2);
        child.hp = half; child.maxHp = Math.max(half, Math.floor(m.maxHp / 2));
        m.hp -= half; m.maxHp = Math.max(m.hp, Math.floor(m.maxHp / 2));
        m.splits++; child.splits = m.splits;
        child.target = m.target;
        if (this.canSeeMonster(m)) {
          this.emit({ type: 'effect', kind: 'split', uid: m.uid, child: child.uid, at: { x: spot.x, y: spot.y } });
          this.log(`${cap(this.monName(m, 'nom'))} teilt sich!`, 'warn');
        }
      }
    }
    if (d.steal && m.hp < m.maxHp / 2 && m.ai === 'hunt') m.ai = 'flee';
    return false;
  }

  killMonster(m, byPlayer) {
    const st = this.state, d = MONSTERS[m.id];
    const seen = this.canSeeMonster(m);
    const name = seen ? np(monSpec(m.id), { case: 'acc', article: 'def' }) : 'etwas';
    this.removeMonster(m);
    m.hp = 0;
    this.emit({ type: 'die', uid: m.uid, id: m.id, x: m.x, y: m.y, byPlayer });
    if (byPlayer) {
      this.log(`Du ${d.construct ? 'zerstörst' : 'tötest'} ${name}.`, 'good');
      if (d.death && seen) this.log(d.death.replace('{M}', cap(np(monSpec(m.id), { case: 'nom', article: 'def' }))), 'flavor');
      st.stats.kills[m.id] = (st.stats.kills[m.id] ?? 0) + 1;
      this.gainXp(Math.max(1, d.xp >> (m.splits ?? 0)));
    } else if (seen) {
      this.log((d.death ?? '{M} stirbt.').replace('{M}', cap(np(monSpec(m.id), { case: 'nom', article: 'def' }))), 'info');
    }
    const walk = isWalkable(this.tileAt(m.x, m.y));
    const dropAt = walk ? { x: m.x, y: m.y } : this.freeTileNear(m.x, m.y, 2) ?? st.player;
    if (m.stolen > 0) {
      this.dropItemAt(makeItem(st, 'gold', 'gold', { count: m.stolen }), dropAt.x, dropAt.y, false);
      this.log('Dein gestohlenes Gold klimpert zu Boden.', 'loot');
    }
    if (d.boss) {
      this.dropItemAt(makeItem(st, 'artifact', 'sonnenscherbe'), dropAt.x, dropAt.y, false);
      this.log('Wo der Lichtfresser fiel, glüht die Sonnenscherbe im Staub!', 'good');
      this.emit({ type: 'effect', kind: 'shard', at: dropAt });
    }
  }

  /** Fire explosion centred on (x, y). */
  explode(x, y, r, dice, { byPlayer = true, cause = 'In einer Explosion verbrannt' } = {}) {
    const p = this.state.player, rng = this.rng;
    const area = [];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const ax = x + dx, ay = y + dy;
      if (!this.inBounds(ax, ay) || this.tileAt(ax, ay) === 'wall') continue;
      if ((dx || dy) && !this.lineClear(x, y, ax, ay)) continue;
      area.push({ x: ax, y: ay });
    }
    this.emit({ type: 'effect', kind: 'explosion', at: { x, y }, radius: r, area });
    this.log('Der Glutball zerbirst in einer Feuerwand!', 'info');
    for (const a of area) {
      const m = this.monsterAt(a.x, a.y);
      if (m) {
        const dmg = rng.roll(dice[0], dice[1], dice[2]);
        if (this.canSeeMonster(m)) this.log(`Die Flammen erfassen ${this.monName(m, 'acc')}.`, 'good');
        this.damageMonster(m, dmg, { byPlayer, kind: 'fire' });
      }
      if (a.x === p.x && a.y === p.y && this.state.status === 'playing') {
        const dmg = Math.max(1, rng.roll(dice[0], dice[1], dice[2]) - rng.int(0, Math.floor(this.playerArmor() / 2)));
        this.log('Die Flammen versengen dich!', 'bad');
        this.damagePlayer(dmg, cause, 'fire');
      }
    }
  }

  // ======================================================== combat (player side)

  playerAttack(m) {
    const st = this.state, rng = this.rng, d = MONSTERS[m.id];
    const helpless = m.ai === 'asleep' || m.statuses.stun || m.statuses.frozen || (m.ai === 'dormant' && !d.boss);
    const chance = helpless ? 100 : clamp(this.playerAccuracy() - d.eva, 10, 95);
    const name = this.monName(m, 'acc');
    const base = { type: 'attack', attacker: st.player.uid, attackerKind: 'player', target: m.uid, targetKind: m.id };
    if (rng.int(1, 100) > chance) {
      this.emit({ ...base, result: 'miss', damage: 0, killed: false });
      this.log(`Du verfehlst ${name}.`, 'info');
      this.wakeMonster(m);
      return { hit: false };
    }
    const w = this.equipped('weapon');
    const [n, s] = w ? WEAPONS[w.kind].dmg : [1, 3];
    let dmg = rng.roll(n, s) + (w ? w.ench : 0) + this.strBonus();
    const critChance = (w ? WEAPONS[w.kind].crit : 0.05) * (helpless ? 3 : 1);
    const crit = rng.chance(critChance);
    if (crit) dmg *= 2;
    dmg = Math.max(1, dmg - rng.int(0, d.armor));
    const kills = dmg >= m.hp;
    this.emit({ ...base, result: crit ? 'crit' : 'hit', damage: dmg, killed: kills });
    if (!kills) this.log(crit ? `Du triffst ${name} mit voller Wucht!` : `Du triffst ${name}.`, crit ? 'good' : 'info');
    this.damageMonster(m, dmg, { byPlayer: true, kind: 'melee' });
    return { hit: true, killed: kills };
  }

  /** Thrown weapon hitting a monster. */
  rangedPlayerAttack(m) {
    const st = this.state, rng = this.rng, d = MONSTERS[m.id];
    const helpless = m.ai === 'asleep' || m.statuses.stun || m.statuses.frozen || (m.ai === 'dormant' && !d.boss);
    const chance = helpless ? 100 : clamp(this.playerAccuracy() + 5 - d.eva, 10, 95);
    const name = this.monName(m, 'acc');
    const base = { type: 'attack', attacker: st.player.uid, attackerKind: 'player', target: m.uid, targetKind: m.id, ranged: true };
    if (rng.int(1, 100) > chance) {
      this.emit({ ...base, result: 'miss', damage: 0, killed: false });
      this.log(`Das Wurfmesser verfehlt ${name}.`, 'info');
      this.wakeMonster(m);
      return { hit: false };
    }
    let dmg = rng.roll(1, 6) + Math.max(0, Math.floor(this.strBonus() / 2));
    const crit = rng.chance(helpless ? 0.25 : 0.08);
    if (crit) dmg *= 2;
    dmg = Math.max(1, dmg - rng.int(0, d.armor));
    const kills = dmg >= m.hp;
    this.emit({ ...base, result: crit ? 'crit' : 'hit', damage: dmg, killed: kills });
    if (!kills) this.log(`Das Wurfmesser trifft ${name}.`, 'info');
    this.damageMonster(m, dmg, { byPlayer: true, kind: 'thrown' });
    return { hit: true, killed: kills };
  }

  // ======================================================== inventory

  /** Add to inventory (stacking). Returns the inventory item or null if full. */
  addToInventory(item) {
    const inv = this.state.player.inventory;
    if (isStackable(item.cat)) {
      const same = inv.find((it) => it.cat === item.cat && it.kind === item.kind);
      if (same) { same.count += item.count; return same; }
    }
    if (inv.length >= INVENTORY_SLOTS) return null;
    delete item.x; delete item.y; delete item.ignored;
    inv.push(item);
    return item;
  }

  /** Remove n from an inventory item; returns the removed item (new uid if split). */
  consume(item, n = 1) {
    const st = this.state, p = st.player;
    if (item.count > n) {
      item.count -= n;
      const copy = { ...item, uid: st.nextUid++, count: n };
      return copy;
    }
    const slot = this.equippedSlot(item);
    if (slot) p.equipment[slot] = null;
    const i = p.inventory.indexOf(item);
    if (i >= 0) p.inventory.splice(i, 1);
    return item;
  }

  dropItemAt(item, x, y, ignored = true) {
    item.x = x; item.y = y;
    if (ignored) item.ignored = true; else delete item.ignored;
    // merge stacks lying on the same tile
    if (isStackable(item.cat)) {
      const same = this.state.level.items.find((it) => it.x === x && it.y === y && it.cat === item.cat && it.kind === item.kind);
      if (same) { same.count += item.count; return same; }
    }
    this.state.level.items.push(item);
    return item;
  }

  itemsAt(x, y) {
    return this.state.level.items.filter((it) => it.x === x && it.y === y);
  }

  /** Pick up the given floor items. Returns number picked up. */
  pickupItems(list) {
    const st = this.state, p = st.player;
    let n = 0, full = false;
    // gold first: it never needs a slot
    list = [...list].sort((a, b) => (a.cat === 'gold' ? 0 : 1) - (b.cat === 'gold' ? 0 : 1));
    for (const item of list) {
      const li = st.level.items.indexOf(item);
      if (li < 0) continue;
      if (item.cat === 'gold') {
        st.level.items.splice(li, 1);
        p.gold += item.count;
        st.stats.goldFound += item.count;
        this.emit({ type: 'pickup', uid: item.uid, cat: 'gold', kind: 'gold', count: item.count });
        this.emit({ type: 'gold', amount: item.count, total: p.gold });
        this.log(`Du sammelst ${item.count} Goldmünzen ein.`, 'loot');
        n++;
        continue;
      }
      const name = item.count > 1 ? itemName(st, item, { case: 'acc', article: 'indef' }) : itemName(st, item, { case: 'acc', article: 'def' });
      st.level.items.splice(li, 1);
      const snap = { ...item };
      const stored = this.addToInventory(item);
      if (!stored) {
        st.level.items.splice(li, 0, item);
        item.ignored = true;
        if (!full) this.log('Dein Rucksack ist voll.', 'warn');
        full = true;
        continue;
      }
      this.emit({ type: 'pickup', uid: stored.uid, cat: snap.cat, kind: snap.kind, count: snap.count, appearance: snap.appearance ?? null });
      this.log(`Du hebst ${name} auf.`, 'loot');
      n++;
      if (item.cat === 'artifact') {
        this.victory();
        break;
      }
    }
    return n;
  }

  victory() {
    const st = this.state;
    st.status = 'won';
    this.emit({ type: 'victory' });
    this.log('Warmes Licht flutet die Tiefe. Mit der Sonnenscherbe in Händen trittst du den Rückweg an – du hast Morrgrund bezwungen!', 'good');
  }

  revealMap() {
    const lv = this.state.level, W = lv.width, H = lv.height;
    for (let i = 0; i < W * H; i++) {
      const t = lv.tiles[i];
      let show = t !== 'wall';
      if (!show) {
        const x = i % W, y = (i - x) / W;
        for (const [dx, dy] of DIRS) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H && lv.tiles[ny * W + nx] !== 'wall') { show = true; break; }
        }
      }
      if (show && lv.memTiles[i] == null) { lv.memTiles[i] = t; lv.explored[i] = 1; }
    }
  }

  // ======================================================== traps

  triggerTrap(trap) {
    const st = this.state, p = st.player, rng = this.rng;
    trap.hidden = false;
    this.emit({ type: 'trap', kind: trap.kind, x: trap.x, y: trap.y });
    this.interrupt('trap', { kind: trap.kind });
    switch (trap.kind) {
      case 'trap_dart': {
        this.log('Klick! Ein Pfeil schnellt aus der Wand.', 'bad');
        this.emit({ type: 'effect', kind: 'dart', at: { x: p.x, y: p.y } });
        if (this.damagePlayer(rng.roll(1, 4) + Math.floor(st.depth / 3), 'Von einer Pfeilfalle durchbohrt', 'trap')) return;
        if (rng.chance(0.3)) { this.log('Die Pfeilspitze war vergiftet.', 'bad'); this.addStatus(p, 'poison', 5); }
        break;
      }
      case 'trap_teleport':
        this.log('Ein Sog erfasst dich und reißt dich fort!', 'warn');
        this.teleportPlayer();
        break;
      case 'trap_alarm':
        this.log('Ein schriller Glockenton hallt durch die Gänge!', 'bad');
        this.emit({ type: 'effect', kind: 'alarm', at: { x: p.x, y: p.y } });
        for (const m of st.level.monsters) {
          if (m.ai === 'dormant') continue;
          m.ai = 'hunt'; m.target = { x: p.x, y: p.y }; m.lost = 0;
          delete m.statuses.asleep;
        }
        break;
      case 'trap_pit':
        this.log('Der Boden gibt unter dir nach! Du stürzt in die Tiefe.', 'bad');
        this.emit({ type: 'effect', kind: 'pit', at: { x: p.x, y: p.y } });
        if (this.damagePlayer(rng.roll(2, 3), 'In eine Fallgrube gestürzt', 'fall')) return;
        if (st.depth < MAX_DEPTH) this.enterLevel(st.depth + 1, 'pit');
        break;
    }
  }

  // ======================================================== action handlers

  _move(a) {
    const st = this.state, p = st.player, rng = this.rng;
    let dx = a.dx | 0, dy = a.dy | 0;
    if ((dx === 0 && dy === 0) || Math.abs(dx) > 1 || Math.abs(dy) > 1) return this.invalid('Ungültige Richtung.');
    let stumbled = false;
    if (p.statuses.confusion && rng.chance(0.5)) {
      [dx, dy] = rng.pick(DIRS);
      stumbled = true;
      this.log('Du taumelst verwirrt umher.', 'warn');
    }
    const nx = p.x + dx, ny = p.y + dy;
    const t = this.tileAt(nx, ny);
    const m = this.inBounds(nx, ny) ? this.monsterAt(nx, ny) : null;
    if (m) {
      if (!diagonalOk(st.level.tiles, this.idx(p.x, p.y), this.idx(nx, ny), dx, dy) && !MONSTERS[m.id].phase) {
        if (stumbled) return this.endTurn();
        return this.invalid('Durch eine Tür kannst du nicht schräg angreifen.');
      }
      this.playerAttack(m);
      return this.endTurn();
    }
    if (t === 'wall' || !this.inBounds(nx, ny)) {
      if (stumbled) { this.log('Du stößt gegen den Fels.', 'info'); return this.endTurn(); }
      return this.invalid('Dort ist massiver Fels.');
    }
    if (t === 'door_closed') {
      this.setTile(nx, ny, 'door_open');
      this.emit({ type: 'door', x: nx, y: ny, open: true, by: p.uid });
      this.log('Du öffnest die Tür.', 'info');
      return this.endTurn();
    }
    if (t === 'brazier_lit') {
      const before = p.oil;
      p.oil = p.oilMax;
      this.setTile(nx, ny, 'brazier_out');
      this.emit({ type: 'oil', from: before, to: p.oil, max: p.oilMax, reason: 'brazier' });
      this.emit({ type: 'effect', kind: 'refuel', at: { x: nx, y: ny } });
      this.log('Du schöpfst glühendes Öl aus dem Glutbecken. Deine Lampe brennt hell und voll.', 'good');
      this.onOilChanged(before);
      return this.endTurn();
    }
    if (t === 'brazier_out') {
      if (stumbled) return this.endTurn();
      return this.invalid('Das Glutbecken ist erloschen und kalt.');
    }
    if (!diagonalOk(st.level.tiles, this.idx(p.x, p.y), this.idx(nx, ny), dx, dy)) {
      if (stumbled) return this.endTurn();
      return this.invalid('Durch Türen kannst du nicht schräg gehen.');
    }
    const from = { x: p.x, y: p.y };
    p.x = nx; p.y = ny;
    this.emit({ type: 'move', uid: p.uid, id: 'player', from, to: { x: nx, y: ny } });
    this.afterStep();
    if (st.status === 'playing') this.endTurn();
    else this.lastActionTookTurn = true;
  }

  afterStep() {
    const st = this.state, p = st.player;
    const depth = st.depth;
    const trap = st.level.traps.find((t) => t.x === p.x && t.y === p.y);
    if (trap && !trap.hidden && this.rng.chance(0.85)) {
      this.log(`Du steigst vorsichtig über ${np({ noun: TRAPS[trap.kind].name }, { case: 'acc', article: 'def' })}.`, 'info');
    } else if (trap) {
      this.triggerTrap(trap);
      if (st.status !== 'playing' || st.depth !== depth) return;
    }
    const here = this.itemsAt(p.x, p.y);
    if (here.length) {
      const auto = here.filter((it) => it.cat === 'gold' || (st.options.autoPickup && !it.ignored));
      if (auto.length) this.pickupItems(auto);
      const left = this.itemsAt(p.x, p.y);
      if (left.length && st.status === 'playing') {
        for (const it of left) it.ignored = true;
        this.log(`Hier ${left.length > 1 || left[0].count > 1 ? 'liegen' : 'liegt'} ${listItems(st, left)}.`, 'info');
      }
    }
    if (this.tileAt(p.x, p.y) === 'stairs_down') this.log('Hier führt ein Abstieg in die Tiefe.', 'info');
  }

  _wait() {
    this._searching = true;
    this.endTurn();
  }

  _rest(a) {
    const st = this.state, p = st.player;
    if (this.hostilesInView().length) return this.invalid('Du kannst nicht rasten, solange Feinde in Sicht sind.');
    const fixed = a.turns != null;
    const max = fixed ? clamp(a.turns | 0, 1, 500) : 400;
    if (!fixed && p.hp >= p.maxHp && !p.statuses.poison) return this.invalid('Du bist bereits ausgeruht.');
    if (!fixed && p.oil <= 0) return this.invalid('Ohne Licht findest du keine Ruhe.');
    let n = 0;
    while (n < max && st.status === 'playing') {
      this._searching = true;
      this.endTurn();
      n++;
      if (this._interrupted) break;
      if (!fixed && ((p.hp >= p.maxHp && !p.statuses.poison) || p.oil <= 0)) break;
    }
    if (st.status !== 'playing') return;
    this.emit({ type: 'rested', turns: n });
    if (!fixed && p.hp >= p.maxHp) this.log(`Du rastest ${n} Runden und fühlst dich erholt.`, 'good');
    else if (this._interrupted) this.log(`Du wirst nach ${n} Runden beim Rasten gestört.`, 'warn');
    else this.log(`Du rastest ${n} Runden.`, 'info');
  }

  _pickup(a) {
    const p = this.state.player;
    let list = this.itemsAt(p.x, p.y);
    if (a.itemUid != null) list = list.filter((it) => it.uid === a.itemUid);
    if (!list.length) return this.invalid('Hier liegt nichts.');
    if (this.pickupItems(list) === 0) return this.invalid('Du kannst nichts davon tragen.');
    if (this.state.status === 'playing') this.endTurn();
  }

  _drop(a) {
    const st = this.state, p = st.player;
    const item = p.inventory.find((it) => it.uid === a.itemUid);
    if (!item) return this.invalid('Diesen Gegenstand hast du nicht.');
    const n = a.count != null ? clamp(a.count | 0, 1, item.count) : item.count;
    const slot = this.equippedSlot(item);
    if (slot) { p.equipment[slot] = null; this.emit({ type: 'unequip', uid: item.uid, slot }); }
    const dropped = this.consume(item, n);
    const name = dropped.count > 1 ? itemName(st, dropped, { case: 'acc', article: 'indef' }) : itemName(st, dropped, { case: 'acc', article: 'def' });
    this.dropItemAt(dropped, p.x, p.y, true);
    this.emit({ type: 'drop', uid: dropped.uid, cat: dropped.cat, kind: dropped.kind, count: dropped.count, x: p.x, y: p.y });
    this.log(`Du lässt ${name} fallen.`, 'info');
    this.endTurn();
  }

  _use(a) {
    const st = this.state;
    const item = st.player.inventory.find((it) => it.uid === a.itemUid);
    if (!item) return this.invalid('Diesen Gegenstand hast du nicht.');
    if (item.cat === 'potion') st.stats.potions++;
    if (item.cat === 'scroll') st.stats.scrolls++;
    const ok = useItem(this, item, a);
    if (!ok) {
      if (item.cat === 'potion') st.stats.potions--;
      if (item.cat === 'scroll') st.stats.scrolls--;
      return;
    }
    if (st.status === 'playing') this.endTurn();
  }

  _equip(a) {
    const item = this.state.player.inventory.find((it) => it.uid === a.itemUid);
    if (!item) return this.invalid('Diesen Gegenstand hast du nicht.');
    if (equip(this, item)) this.endTurn();
  }

  _unequip(a) {
    let item = null;
    if (a.slot) item = this.equipped(a.slot);
    else item = this.state.player.inventory.find((it) => it.uid === a.itemUid);
    if (!item) return this.invalid('Das hast du nicht ausgerüstet.');
    if (unequip(this, item)) this.endTurn();
  }

  _throw(a) {
    const item = this.state.player.inventory.find((it) => it.uid === a.itemUid);
    if (!item) return this.invalid('Diesen Gegenstand hast du nicht.');
    if (throwItem(this, item, a.target)) this.endTurn();
  }

  _descend() {
    const st = this.state, p = st.player;
    if (this.tileAt(p.x, p.y) !== 'stairs_down') return this.invalid('Hier führt kein Weg hinab.');
    this.enterLevel(st.depth + 1, 'stairs');
    this.endTurn();
  }

  _travel(a) {
    const p = this.state.player;
    const path = this.findPath(a.x, a.y);
    if (!path) return this.invalid('Dorthin kennst du keinen Weg.');
    if (!path.length) {
      this.interrupt('arrived');
      this._invalid = true;
      return;
    }
    const step = path[0];
    const m = this.monsterAt(step.x, step.y);
    if (m) {
      this.log(m && this.canSeeMonster(m) ? `${cap(this.monName(m, 'nom'))} versperrt dir den Weg.` : 'Etwas versperrt dir den Weg.', 'warn');
      this.interrupt('blocked');
      this._invalid = true;
      return;
    }
    this._move({ dx: step.x - p.x, dy: step.y - p.y });
    if (this.lastActionTookTurn && (path.length === 1 || (p.x === a.x && p.y === a.y))) this.interrupt('arrived');
  }

  _explore(a) {
    const r = this.autoExplore({ ignoreMonsters: !!a.ignoreMonsters });
    if (!r.ok) {
      this.log(r.reason, 'info');
      this.interrupt(r.code);
      this._invalid = true;
      return;
    }
    const p = this.state.player;
    const m = this.monsterAt(p.x + r.dx, p.y + r.dy);
    if (m) {
      // never attack by accident while exploring (e.g. a dormant statue in a corridor)
      this.log(this.canSeeMonster(m) ? `${cap(this.monName(m, 'nom'))} versperrt dir den Weg.` : 'Etwas versperrt dir den Weg.', 'warn');
      this.interrupt('blocked');
      this._invalid = true;
      return;
    }
    this._move({ dx: r.dx, dy: r.dy });
  }

  // ======================================================== queries for the UI

  /** Monsters the player is aware of hostile and awake/asleep (excludes dormant statues). */
  hostilesInView() {
    return this.state.level.monsters.filter((m) => this.canSeeMonster(m) && m.ai !== 'dormant');
  }

  /**
   * Monsters to render: currently seen ones, plus ones sensed via Gespür
   * (detectedOnly: true — position known, nothing else).
   */
  visibleMonsters() {
    const p = this.state.player;
    const out = [];
    for (const m of this.state.level.monsters) {
      const seen = this.canSeeMonster(m);
      if (!seen && !p.statuses.gespuer) continue;
      out.push({ uid: m.uid, id: m.id, x: m.x, y: m.y, detectedOnly: !seen, ...(seen ? this.monsterInfo(m.uid) : {}) });
    }
    return out;
  }

  /** Items on currently visible tiles. */
  visibleItems() {
    return this.state.level.items.filter((it) => this.isVisible(it.x, it.y));
  }

  /** Seen monsters sorted by distance (nearest first). */
  targetsInView() {
    const p = this.state.player;
    return this.state.level.monsters
      .filter((m) => this.canSeeMonster(m))
      .map((m) => ({ uid: m.uid, id: m.id, x: m.x, y: m.y, dist: Math.hypot(m.x - p.x, m.y - p.y), los: this.los[this.idx(m.x, m.y)] === 1, ...this.monsterInfo(m.uid) }))
      .sort((a, b) => a.dist - b.dist || a.uid - b.uid);
  }

  /** German info about a monster (only meaningful if the player can see it). */
  monsterInfo(uid) {
    const m = typeof uid === 'object' ? uid : this.monsterByUid(uid);
    if (!m) return null;
    const d = MONSTERS[m.id];
    const f = m.hp / m.maxHp;
    const health = f >= 1 ? 'unverletzt' : f >= 0.7 ? 'leicht verletzt' : f >= 0.4 ? 'verletzt' : f >= 0.15 ? 'schwer verletzt' : 'dem Tode nah';
    const stateWord = { asleep: 'schläft', dormant: 'regungslos', wander: 'streift umher', hunt: 'jagt dich', flee: 'flieht' }[m.ai];
    return {
      name: d.name.sg,
      displayName: np(monSpec(m.id), { case: 'nom', article: 'def' }),
      description: d.desc,
      health,
      hpFraction: Math.max(0, f),
      state: stateWord,
      ai: m.ai,
      boss: !!d.boss,
      statuses: Object.entries(m.statuses).map(([k, t]) => ({ id: k, label: STATUSES[k].label, turns: t })),
    };
  }

  /** Derived player numbers for the HUD. */
  playerStats() {
    const st = this.state, p = st.player;
    const speed = this.playerSpeed();
    return {
      hp: p.hp, maxHp: p.maxHp,
      str: this.playerStr(), baseStr: p.str,
      level: p.level, xp: p.xp,
      xpNext: p.level < MAX_LEVEL ? XP_TABLE[p.level + 1] : null,
      xpPrev: XP_TABLE[p.level],
      gold: p.gold,
      depth: st.depth, biome: st.level.biome, biomeName: BIOMES[st.level.biome].name, turn: st.turn,
      accuracy: this.playerAccuracy(),
      damage: this.playerDamageRange(),
      armor: this.playerArmor(),
      evasion: this.playerEvasion(),
      lightRadius: this.lightRadius(),
      oil: p.oil, oilMax: p.oilMax, oilPct: Math.round((p.oil / p.oilMax) * 100),
      speed, speedLabel: speed > 10 ? 'schnell' : speed < 10 ? 'langsam' : 'normal',
      statuses: Object.entries(p.statuses).map(([id, turns]) => ({ id, label: STATUSES[id].label, turns, bad: STATUSES[id].bad })),
      weapon: this.equipped('weapon') ? itemName(st, this.equipped('weapon'), { article: 'none' }) : 'Fäuste',
      armorName: this.equipped('armor') ? itemName(st, this.equipped('armor'), { article: 'none' }) : 'keine',
      inventoryUsed: p.inventory.length, inventorySlots: INVENTORY_SLOTS,
    };
  }

  /** German name of an item. opts: {case:'nom'|'acc'|'dat', article:'def'|'indef'|'none', count} */
  itemName(item, opts = {}) {
    return itemName(this.state, item, opts);
  }

  itemDescription(item) {
    let s = itemDescription(this.state, item);
    if (this.equippedSlot(item)) s += ' (ausgerüstet)';
    return s;
  }

  /** Sprite hints for the art module. */
  itemVisual(item) {
    const sprite = ['potion', 'scroll', 'wand', 'ring'].includes(item.cat) ? item.cat : item.kind;
    return { sprite, tint: item.cat === 'scroll' ? null : item.appearance ?? null, kind: item.kind, cat: item.cat };
  }

  /** Inventory rows ready for display. */
  inventoryView() {
    const st = this.state;
    return st.player.inventory.map((it) => ({
      uid: it.uid,
      cat: it.cat,
      count: it.count,
      name: itemName(st, it, { case: 'nom', article: 'none' }),
      equipped: this.equippedSlot(it),
      unidentified: isUnidentified(st, it),
      visual: this.itemVisual(it),
      needsTarget: it.cat === 'wand' || it.cat === 'thrown' ? 'tile' : (it.cat === 'scroll' && it.kind === 'identifikation' && kindKnown(st, it)) ? 'item' : null,
    }));
  }

  /** German hover text for tile (x, y) based on what the player sees / remembers. */
  describeTile(x, y) {
    const st = this.state, lv = st.level, p = st.player;
    if (!this.inBounds(x, y)) return '';
    const i = this.idx(x, y);
    const parts = [];
    const trap = lv.traps.find((t) => t.x === x && t.y === y && !t.hidden);
    if (lv.visible[i]) {
      if (p.x === x && p.y === y) parts.push('Das bist du.');
      const m = this.monsterAt(x, y);
      if (m && this.canSeeMonster(m)) {
        const info = this.monsterInfo(m);
        parts.push(`${cap(np(monSpec(m.id), { case: 'nom', article: 'indef' }))} – ${info.health}, ${info.state}.`);
      }
      const items = this.itemsAt(x, y);
      if (items.length) parts.push(`Hier ${items.length > 1 || items[0].count > 1 ? 'liegen' : 'liegt'} ${listItems(st, items)}.`);
      if (trap) parts.push(`${cap(np({ noun: TRAPS[trap.kind].name }, { case: 'nom', article: 'indef' }))}.`);
      parts.push(tilePhrase(lv.biome, lv.tiles[i]));
      return parts.join(' ');
    }
    if (lv.explored[i]) {
      const mem = lv.memItems[i];
      let s = `Erinnerung: ${tilePhrase(lv.biome, lv.memTiles[i])}`;
      if (mem && mem.length) s += ` Dort lag ${listItems(st, mem)}.`;
      if (trap) s += ` ${cap(np({ noun: TRAPS[trap.kind].name }, { case: 'nom', article: 'indef' }))}.`;
      return s;
    }
    return 'Unerforschte Dunkelheit.';
  }

  /**
   * Path over explored tiles from the player to (x, y), avoiding known traps.
   * The destination may be a closed door or a lit brazier (last step bumps it).
   * @returns {Point[]|null} steps excluding the start; [] if already there; null if unreachable/unknown
   */
  findPath(x, y) {
    const lv = this.state.level, p = this.state.player;
    if (!this.inBounds(x, y)) return null;
    if (p.x === x && p.y === y) return [];
    const goal = this.idx(x, y);
    const memT = lv.memTiles[goal];
    if (memT == null) return null;
    const trapAt = new Set(lv.traps.filter((t) => !t.hidden).map((t) => this.idx(t.x, t.y)));
    const goalBump = memT === 'brazier_lit' || memT === 'door_closed';
    if (!isPassableOrDoor(memT) && !goalBump) return null;
    const path = astar(lv.width, lv.height, lv.memTiles.map((t) => t ?? 'wall'), p.x, p.y, x, y, (i) => {
      const t = lv.memTiles[i];
      if (t == null || !isPassableOrDoor(t)) return Infinity;
      if (trapAt.has(i) && i !== goal) return 40;
      return t === 'door_closed' ? 2 : 1;
    }, { goalAlways: goalBump, maxNodes: 10000 });
    if (!path) return null;
    return path.map((i) => ({ x: i % lv.width, y: Math.floor(i / lv.width) }));
  }

  /**
   * Next auto-explore step. Refuses while awake/asleep hostiles are in view
   * unless opts.ignoreMonsters is set.
   * @param {{ignoreMonsters?: boolean}} [opts]
   * @returns {{ok:true, dx:number, dy:number, x:number, y:number, goal:'frontier'|'item'} | {ok:false, code:'unsafe'|'explore_done', reason:string}}
   */
  autoExplore(opts = {}) {
    const st = this.state, lv = st.level, p = st.player;
    if (st.status !== 'playing') return { ok: false, code: 'explore_done', reason: 'Das Spiel ist vorbei.' };
    if (!opts.ignoreMonsters && this.hostilesInView().length) return { ok: false, code: 'unsafe', reason: 'Gegner in Sicht – du hältst inne.' };
    const W = lv.width, H = lv.height;
    const trapAt = new Set(lv.traps.filter((t) => !t.hidden).map((t) => t.y * W + t.x));
    const invFull = p.inventory.length >= INVENTORY_SLOTS;
    const itemTarget = new Set();
    for (const it of lv.items) {
      if (it.ignored || !lv.explored[it.y * W + it.x]) continue;
      if (it.cat !== 'gold' && !st.options.autoPickup) continue;
      if (it.cat !== 'gold' && invFull && !(isStackable(it.cat) && p.inventory.some((o) => o.cat === it.cat && o.kind === it.kind))) continue;
      itemTarget.add(it.y * W + it.x);
    }
    const start = p.y * W + p.x;
    // first try to avoid known traps entirely; if that finds nothing, allow crossing them
    let found = -1, goal = 'frontier', prev = null;
    for (const avoidTraps of [true, false]) {
      prev = new Int32Array(W * H).fill(-1);
      prev[start] = start;
      const queue = [start];
      for (let h = 0; h < queue.length && found < 0; h++) {
        const i = queue[h];
        const x = i % W, y = (i - x) / W;
        if (i !== start) {
          if (itemTarget.has(i)) { found = i; goal = 'item'; break; }
          let frontier = false;
          for (const [dx, dy] of DIRS) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < W && ny < H && lv.memTiles[ny * W + nx] == null) { frontier = true; break; }
          }
          if (frontier) { found = i; break; }
        }
        for (const [dx, dy] of DIRS) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (prev[j] !== -1) continue;
          const t = lv.memTiles[j];
          if (t == null || !isPassableOrDoor(t) || (avoidTraps && trapAt.has(j))) continue;
          if (!diagonalOk(lv.memTiles, i, j, dx, dy)) continue;
          prev[j] = i;
          queue.push(j);
        }
      }
      if (found >= 0 || !trapAt.size) break;
    }
    if (found < 0) {
      return {
        ok: false, code: 'explore_done',
        reason: lv.stairs && lv.explored[lv.stairs.y * W + lv.stairs.x]
          ? 'Hier gibt es nichts mehr zu entdecken. Der Abstieg wartet.'
          : 'Hier gibt es nichts mehr zu entdecken.',
      };
    }
    let step = found;
    while (prev[step] !== start) step = prev[step];
    const sx = step % W, sy = (step - sx) / W;
    return { ok: true, dx: sx - p.x, dy: sy - p.y, x: found % W, y: Math.floor(found / W), goal };
  }

  /** Can the player target (x, y) with a wand or throw (LOS, range)? */
  canTarget(x, y, range = 10) {
    const p = this.state.player;
    if (!this.inBounds(x, y) || (x === p.x && y === p.y)) return false;
    return this.los[this.idx(x, y)] === 1 && cheb(p.x, p.y, x, y) <= range;
  }

  /** Data for death / victory screens. */
  runSummary() {
    const st = this.state, p = st.player;
    const killList = Object.entries(st.stats.kills)
      .map(([id, count]) => ({ id, name: count === 1 ? MONSTERS[id].name.sg : MONSTERS[id].name.pl, count }))
      .sort((a, b) => b.count - a.count);
    const totalKills = killList.reduce((s, k) => s + k.count, 0);
    const won = st.status === 'won';
    const score = p.gold + 100 * st.stats.maxDepth + p.xp + (won ? 5000 : 0);
    let causeText;
    if (won) causeText = 'Mit der Sonnenscherbe ans Licht zurückgekehrt.';
    else if (st.status === 'dead') causeText = `${st.stats.cause} auf Ebene ${st.depth}.`;
    else causeText = `Noch unterwegs auf Ebene ${st.depth}.`;
    return {
      status: st.status, won, seed: st.seed,
      depth: st.depth, maxDepth: st.stats.maxDepth, turns: st.turn,
      kills: { ...st.stats.kills }, killList, totalKills,
      gold: p.gold, goldFound: st.stats.goldFound, level: p.level, xp: p.xp,
      cause: st.stats.cause, causeText, score,
      darkTurns: st.stats.darkTurns, potionsDrunk: st.stats.potions, scrollsRead: st.stats.scrolls,
    };
  }
}

const HANDLERS = {
  move: Game.prototype._move,
  wait: Game.prototype._wait,
  search: Game.prototype._wait,
  rest: Game.prototype._rest,
  pickup: Game.prototype._pickup,
  drop: Game.prototype._drop,
  use: Game.prototype._use,
  equip: Game.prototype._equip,
  unequip: Game.prototype._unequip,
  throw: Game.prototype._throw,
  descend: Game.prototype._descend,
  travel: Game.prototype._travel,
  explore: Game.prototype._explore,
};

function snapshot(it) {
  const s = { uid: it.uid, cat: it.cat, kind: it.kind, count: it.count };
  if (it.appearance != null) s.appearance = it.appearance;
  if (it.ench != null) { s.ench = it.ench; s.known = it.known; }
  if (it.charges != null) s.charges = it.charges;
  return s;
}

function listItems(st, items) {
  const names = items.map((it) => itemName(st, it, { case: 'nom', article: 'indef' }));
  if (names.length <= 1) return names.join('');
  return names.slice(0, -1).join(', ') + ' und ' + names[names.length - 1];
}

function tilePhrase(biome, t) {
  const bt = BIOME_TILE_NAMES[biome];
  switch (t) {
    case 'wall': return `${bt.wall}.`;
    case 'floor': return `${bt.floor}.`;
    case 'door_closed': return 'Eine geschlossene Tür.';
    case 'door_open': return 'Eine offene Tür.';
    case 'stairs_down': return 'Ein Abstieg in die Tiefe.';
    case 'brazier_lit': return 'Ein brennendes Glutbecken – hier kannst du deine Lampe auffüllen.';
    case 'brazier_out': return 'Ein erloschenes Glutbecken.';
    case 'fungus': return 'Leuchtpilze bedecken den Boden.';
    default: return '';
  }
}

