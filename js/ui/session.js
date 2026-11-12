// A running game: performs actions, turns engine events into animation, sound
// and log lines, runs multi-step travel/explore, key repeat and targeting.
import { audio } from '../audio/index.js';
import { ray } from '../engine/path.js';
import { MONSTERS } from '../engine/index.js';

const STEP_MS = 36;          // travel / explore pace
const MOVE_MS = 95;          // single step tween
const REPEAT_DELAY = 170;    // held key: first repeat
const REPEAT_MS = 108;       // held key: subsequent repeats
const STOP_HELD = new Set(['monster_appeared', 'noticed', 'trap', 'trap_found', 'oil_low', 'lamp_out', 'stolen', 'status']);

const BAD_STATUS = new Set(['poison', 'confusion', 'finsternis', 'slow', 'frozen', 'fear', 'stun', 'asleep']);
const TONE_COL = { player: '#e2543a', monster: '#f3e6c8', crit: '#ffb454', heal: '#58c2a5' };

export class Session {
  constructor(app, game, log = []) {
    this.app = app;
    this.game = game;
    this.anim = app.anim;
    this.renderer = app.renderer;
    this.log = log;                 // [{text, tone, n}]
    this.auto = null;               // {type:'travel'|'explore', x, y, next, steps}
    this.held = null;               // {dx, dy, code, next}
    this.targeting = null;
    this.ended = false;
    this.stepCount = 0;
    this.saveTimer = 0;
  }

  get state() { return this.game.state; }

  // ---------------------------------------------------------------- acting
  /**
   * Perform one engine action. opts: {stepMs, quiet, fromAuto}
   * @returns {object[]} events
   */
  perform(action, opts = {}) {
    if (this.ended) return [];
    const now = performance.now();
    if (!opts.fromAuto && !opts.fromHeld) {
      this.anim.fastForward(now);
      this.stopAuto();
      if (this.targeting) this.cancelTarget(true);
    }
    let events;
    try {
      events = this.game.act(action);
    } catch (e) {
      console.error(e);
      this.addLog('Etwas ist schiefgegangen. Die Aktion wurde abgebrochen.', 'warn');
      return [];
    }
    const need = events.find((e) => e.type === 'need_target');
    // the hero acted: a panned view eases back (but stay put while choosing a target)
    if (!need) this.renderer.recenter();
    this.present(events, opts);
    this.afterAction(events);
    if (need) this.beginTarget(need);
    return events;
  }

  afterAction(events) {
    const app = this.app;
    this.renderer.sync();
    app.hud.update();
    app.inventory.update();
    app.minimap.update();
    if (this.targeting) this.refreshTarget();
    this.updateHover();
    const end = events.find((e) => e.type === 'death' || e.type === 'victory');
    if (end) { this.finish(end.type); return; }
    this.scheduleSave();
  }

  scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.app.save(), 1200);
  }

  finish(kind) {
    this.ended = true;
    this.stopAuto();
    this.held = null;
    this.cancelTarget(true);
    clearTimeout(this.saveTimer);
    this.app.onRunEnded(kind);
  }

  // ---------------------------------------------------------------- log
  addLog(text, tone = 'info') {
    const last = this.log[this.log.length - 1];
    if (last && last.text === text) { last.n = (last.n || 1) + 1; last.fresh = performance.now(); }
    else this.log.push({ text, tone, n: 1, fresh: performance.now() });
    if (this.log.length > 400) this.log.splice(0, this.log.length - 400);
    this.app.hud.logChanged();
  }

  // ---------------------------------------------------------------- events -> presentation
  present(events, opts = {}) {
    const A = this.anim, g = this.game, st = this.state, now = performance.now();
    const moveMs = opts.stepMs || MOVE_MS;
    const busy = new Map();
    const deadAt = new Map();
    for (const e of events) if (e.type === 'die') deadAt.set(e.uid, { x: e.x, y: e.y });
    const posOf = (uid) => {
      if (uid === 0) return { x: st.player.x, y: st.player.y };
      const m = g.monsterByUid(uid);
      if (m) return { x: m.x, y: m.y };
      return deadAt.get(uid) || null;
    };
    const sounds = new Map();
    const snd = (name, vol = 1, pitch) => { if (!sounds.has(name)) sounds.set(name, { volume: vol, pitch }); };
    let cursor = now, impact = now, playerHurt = 0, descended = false;
    const R = this.renderer;
    for (const ev of events) {
      switch (ev.type) {
        case 'log': this.addLog(ev.text, ev.tone); break;
        case 'move': {
          if (ev.teleport) {
            A.burst(ev.from.x, ev.from.y, 22, '#c49bff', { speed: 2.6, life: 520 });
            A.burst(ev.to.x, ev.to.y, 26, '#c49bff', { speed: 1.8, life: 650 });
            A.ring(ev.to.x, ev.to.y, now, 1.3, '#c49bff', 500);
            snd('teleport');
            // the camera eases quickly to the new spot instead of snapping
            if (ev.uid === 0) R.camFastUntil = now + 600;
            break;
          }
          const start = Math.max(now, busy.get(ev.uid) || now);
          const dur = ev.leap ? Math.max(moveMs, 170) : moveMs;
          A.moveEntity(ev.uid, ev.from.x, ev.from.y, ev.to.x, ev.to.y, start, dur);
          busy.set(ev.uid, start + dur);
          if (ev.uid === 0) {
            if (ev.to.x !== ev.from.x) R.heroFacing = ev.to.x > ev.from.x ? 1 : -1;
            this.stepCount++;
            if (!opts.fromAuto || this.stepCount % 3 === 0) snd('step', opts.fromAuto ? 0.35 : 0.5, 0.9 + Math.random() * 0.2);
          }
          break;
        }
        case 'attack': {
          const ap = posOf(ev.attacker), tp = posOf(ev.target);
          if (!ap || !tp) break;
          const start = Math.max(cursor, busy.get(ev.attacker) || now, busy.get(ev.target) || now);
          if (!ev.ranged) A.lunge(ev.attacker, tp.x - ap.x, tp.y - ap.y, start);
          if (ev.attacker === 0 && tp.x !== ap.x) R.heroFacing = tp.x > ap.x ? 1 : -1;
          impact = start + (ev.ranged ? 0 : 55);
          if (ev.result === 'miss') {
            A.floater(tp.x, tp.y, 'verfehlt', '#8d97ad', impact, { dur: 750 });
            snd('miss', 0.7);
          } else {
            A.flash(ev.target, impact);
            const dir = [tp.x - ap.x, tp.y - ap.y];
            A.burst(tp.x, tp.y, ev.result === 'crit' ? 14 : 7, ev.target === 0 ? '#e2543a' : '#f3e6c8', { speed: 2.2, life: 320, dir, spread: 1.6, size: 0.06 });
            if (ev.damage === 0) A.floater(tp.x, tp.y, 'abgewehrt', '#8d97ad', impact, { dur: 750 });
            if (ev.attacker === 0) snd(ev.result === 'crit' ? 'crit' : 'hit');
            else snd('hurt');
            if (ev.result === 'crit') A.shake(0.09, impact, 200);
          }
          busy.set(ev.attacker, start + 130);
          cursor = start + 85;
          break;
        }
        case 'damage': {
          const p = posOf(ev.uid);
          if (!p) break;
          const t0 = ev.kind === 'hit' ? impact : cursor;
          const isPlayer = ev.uid === 0;
          A.floater(p.x, p.y, String(ev.amount), isPlayer ? TONE_COL.player : TONE_COL.monster, t0, { big: ev.amount >= 8 });
          if (isPlayer) playerHurt += ev.amount;
          if (ev.kind !== 'hit') { A.flash(ev.uid, t0); }
          if (ev.kind === 'poison') A.burst(p.x, p.y, 6, '#7bc043', { speed: 0.8, life: 600, grav: -1.2, add: false });
          break;
        }
        case 'heal': {
          const p = posOf(ev.uid);
          if (!p || ev.amount <= 0) break;
          A.floater(p.x, p.y, '+' + ev.amount, TONE_COL.heal, cursor, { big: ev.amount >= 8 });
          A.burst(p.x, p.y + 0.2, 14, '#58c2a5', { speed: 0.9, life: 800, grav: -1.6, dir: [0, -1], spread: 1.4 });
          break;
        }
        case 'die': {
          const m = { x: ev.x, y: ev.y };
          const t0 = Math.max(impact, cursor - 40) + 40;
          const facing = st.player.x < m.x ? -1 : 1;
          A.ghost(ev.id, m.x, m.y, t0, facing);
          A.at(t0, () => {
            A.burst(m.x, m.y, 18, '#f3e6c8', { speed: 2.4, life: 480, size: 0.07 });
            A.burst(m.x, m.y, 10, '#ffb454', { speed: 1.4, life: 650, size: 0.05 });
          });
          if (MONSTERS[ev.id]?.boss) { A.shake(0.2, t0, 600); A.screenFlash('#fff0b8', 0.5, t0, 900); }
          snd('kill');
          break;
        }
        case 'spawn':
          A.burst(ev.x, ev.y, 12, '#9a7ad8', { speed: 1.6, life: 500 });
          A.ring(ev.x, ev.y, cursor, 0.8, '#9a7ad8', 380);
          break;
        case 'projectile': {
          let pts = (ev.path && ev.path.length ? ev.path : [ev.to]).slice();
          if (!pts.length || pts[0].x !== ev.from.x || pts[0].y !== ev.from.y) pts.unshift(ev.from);
          if (pts.length < 2) pts.push(ev.to);
          const len = pts.length - 1;
          const dur = ev.kind === 'blitz' ? 280 : Math.max(110, Math.min(420, len * (ev.kind === 'wurfmesser' ? 30 : 38)));
          const start = cursor;
          A.projectile(ev.kind, pts, start, dur);
          const end = pts[pts.length - 1];
          const hitAt = ev.kind === 'blitz' ? start + 60 : start + dur;
          A.at(hitAt, () => {
            const col = { frost: '#9fe3ff', verbannung: '#c49bff', glutball: '#ff8c42', feuerbolzen: '#ff7a3a', blitz: '#cfe4ff', wurfmesser: '#d8dee8' }[ev.kind];
            A.burst(end.x, end.y, ev.kind === 'wurfmesser' ? 6 : 16, col, { speed: 2, life: 420 });
          });
          impact = hitAt;
          cursor = ev.kind === 'blitz' ? start + 120 : start + dur;
          snd({ wurfmesser: 'throw', blitz: 'zap', frost: 'freeze', verbannung: 'zap', glutball: 'fire', feuerbolzen: 'fire' }[ev.kind] || 'zap');
          break;
        }
        case 'effect': this.effect(ev, cursor, snd); break;
        case 'status':
          if (ev.uid === 0 && ev.change === 'applied') snd(BAD_STATUS.has(ev.status) ? 'status_bad' : 'status_good');
          break;
        case 'pickup': snd(ev.cat === 'gold' ? 'gold' : 'pickup'); if (ev.cat === 'artifact') A.burst(st.player.x, st.player.y, 30, '#fff0b8', { speed: 2, life: 900 }); break;
        case 'gold':
          if (ev.amount > 0) { A.floater(st.player.x, st.player.y, `+${ev.amount}`, '#f2c14e', cursor, { dur: 800, rise: 0.7 }); snd('gold'); }
          else if (ev.amount < 0) A.floater(st.player.x, st.player.y, `−${-ev.amount} Gold`, '#e2543a', cursor, { dur: 1100 });
          break;
        case 'use':
          if (ev.cat === 'potion') snd('drink');
          else if (ev.cat === 'scroll') snd('read');
          break;
        case 'equip': case 'unequip': snd('equip'); break;
        case 'identify': snd('identify', 0.8); break;
        case 'oil':
          if (ev.reason === 'drain') { A.burst(st.player.x, st.player.y, 4, '#ffb454', { speed: 1.2, life: 500, add: true }); break; }
          A.burst(st.player.x, st.player.y, 16, '#ffb454', { speed: 1, life: 800, grav: -1.4, dir: [0, -1], spread: 1.8 });
          snd('refuel');
          break;
        case 'levelup':
          A.ring(st.player.x, st.player.y, cursor + 80, 1.6, '#ffb454', 700, 0.08);
          A.ring(st.player.x, st.player.y, cursor + 220, 2.4, '#ffe2a6', 800, 0.05);
          A.burst(st.player.x, st.player.y, 34, '#ffd27a', { speed: 2.4, life: 1000, grav: -0.8 });
          A.floater(st.player.x, st.player.y - 0.35, `Stufe ${ev.level}`, '#ffb454', cursor + 120, { big: true, dur: 1600, rise: 0.8 });
          snd('levelup');
          this.app.hud.flourish();
          break;
        case 'trap':
          snd('trap');
          A.shake(0.06, cursor, 180);
          break;
        case 'trap_found':
          A.floater(ev.x, ev.y, '!', '#ffb454', cursor, { big: true });
          snd('trap', 0.45, 1.3);
          break;
        case 'door': snd('door', ev.by === 0 ? 0.8 : 0.5); break;
        case 'descend':
          descended = true;
          snd('descend');
          break;
        case 'noticed': {
          const p = posOf(ev.uid);
          if (p) A.floater(p.x, p.y - 0.2, '!', '#ffb454', cursor, { big: true, dur: 700, rise: 0.4 });
          snd(MONSTERS[ev.id]?.boss ? 'boss' : 'monster_notice', 0.8);
          break;
        }
        case 'interrupt':
          if (ev.reason === 'oil_low' || ev.reason === 'lamp_out') { snd('oil_low'); this.app.hud.oilWarn(); }
          break;
        case 'death': snd('death'); break;
        case 'victory': snd('victory'); A.screenFlash('#fff0b8', 0.7, cursor, 1600); break;
        default: break;
      }
    }
    if (playerHurt > 0) {
      const frac = playerHurt / st.player.maxHp;
      A.hurt(Math.min(0.75, 0.22 + frac * 1.6), impact);
      if (frac >= 0.2) A.shake(0.08 + Math.min(0.12, frac * 0.25), impact, 260);
    }
    if (descended) this.onDescend();
    // a rejected action: soft error click (not during auto runs)
    if (!this.game.lastActionTookTurn && !events.some((e) => e.type === 'need_target') && events.some((e) => e.type === 'log' && e.tone === 'warn') && !opts.fromAuto) snd('error', 0.5);
    if (!opts.quiet) for (const [name, o] of sounds) audio.play(name, o);
  }

  effect(ev, t0, snd) {
    const A = this.anim;
    const at = ev.at || ev.to || this.state.player;
    switch (ev.kind) {
      case 'explosion': {
        const area = ev.area && ev.area.length ? ev.area : [at];
        A.at(t0, () => {
          for (const p of area) A.burst(p.x, p.y, 5, Math.random() < 0.5 ? '#ff8c42' : '#ffd27a', { speed: 1.8, life: 600 });
          A.burst(at.x, at.y, 20, '#ff5a2a', { speed: 3, life: 520 });
        });
        A.ring(at.x, at.y, t0, (ev.radius || 1.5) + 0.5, '#ff8c42', 420, 0.18);
        A.screenFlash('#ff9a4a', 0.22, t0, 300);
        A.shake(0.12, t0, 280);
        snd('fire');
        break;
      }
      case 'strength': A.burst(at.x, at.y, 18, '#ffb454', { speed: 1.6, life: 700, grav: -0.8 }); A.ring(at.x, at.y, t0, 1, '#ffb454', 500); break;
      case 'teleport': A.burst(at.x, at.y, 20, '#c49bff', { speed: 2, life: 600 }); A.ring(at.x, at.y, t0, 1.2, '#c49bff', 500); snd('teleport'); break;
      case 'leap':
        if (ev.uid != null && ev.from && ev.to) A.moveEntity(ev.uid, ev.from.x, ev.from.y, ev.to.x, ev.to.y, t0, 180);
        break;
      case 'split': A.burst(at.x, at.y, 14, '#8fd16a', { speed: 1.6, life: 500, add: false }); break;
      case 'summon': A.ring(at.x, at.y, t0, 1.8, '#9a7ad8', 600); A.burst(at.x, at.y, 18, '#9a7ad8', { speed: 2, life: 600 }); break;
      case 'spores': A.burst(at.x, at.y, 22, '#c9d97a', { speed: 1.1, life: 900, grav: -0.3, add: false, size: 0.05 }); break;
      case 'poison': A.burst(at.x, at.y, 5, '#7bc043', { speed: 0.6, life: 600, grav: -1, add: false }); break;
      case 'cold': A.burst(at.x, at.y, 10, '#9fe3ff', { speed: 0.8, life: 700, grav: 0.6 }); break;
      case 'dart': A.burst(at.x, at.y, 6, '#d8dee8', { speed: 2, life: 300 }); break;
      case 'pit': A.burst(at.x, at.y, 20, '#6b5a4a', { speed: 1.6, life: 600, add: false }); A.shake(0.1, t0, 300); break;
      case 'alarm': A.ring(at.x, at.y, t0, 6, '#ffb454', 900, 0.06); A.ring(at.x, at.y, t0 + 200, 9, '#ffb454', 1100, 0.04); A.shake(0.05, t0, 400); break;
      case 'flash': A.screenFlash('#fffbe8', 0.75, t0, 520); A.ring(at.x, at.y, t0, ev.radius || 8, '#fff6d8', 600, 0.1); break;
      case 'fear': A.ring(at.x, at.y, t0, ev.radius || 8, '#e2543a', 700, 0.08); break;
      case 'reveal': A.ring(at.x, at.y, t0, 12, '#58c2a5', 900, 0.06); break;
      case 'refuel': A.burst(at.x, at.y, 14, '#ff8c42', { speed: 1.2, life: 700, grav: -1.2 }); break;
      case 'shard': A.burst(at.x, at.y, 30, '#fff0b8', { speed: 2.4, life: 900 }); break;
      default: break;
    }
  }

  onDescend() {
    const R = this.renderer;
    this.anim.clear();
    R.lightR = 0;
    R.lightRate = this.anim.reduced ? 120 : 650;
    R.camInit = false;
    this.stopAuto();
    this.held = null;
    const st = this.game.playerStats();
    this.app.showFloorCard(st.depth, st.biomeName);
    audio.setAmbient(this.state.level.biome);
  }

  // ---------------------------------------------------------------- auto travel / explore / key repeat
  startTravel(x, y) {
    if (this.ended) return;
    this.anim.fastForward(performance.now());
    this.auto = { type: 'travel', x, y, next: 0, steps: 0 };
    this.app.hud.setAuto(true);
  }
  startExplore() {
    if (this.ended) return;
    this.anim.fastForward(performance.now());
    this.auto = { type: 'explore', next: 0, steps: 0 };
    this.app.hud.setAuto(true);
  }
  stopAuto() {
    if (!this.auto) return;
    this.auto = null;
    this.app.hud.setAuto(false);
  }

  /** Called every frame. */
  tick(now) {
    if (this.ended || this.targeting || this.app.modalOpen()) return;
    const a = this.auto;
    if (a) {
      if (now < a.next) return;
      const ev = this.perform(a.type === 'travel' ? { type: 'travel', x: a.x, y: a.y } : { type: 'explore' }, { fromAuto: true, stepMs: STEP_MS + 6 });
      a.steps++;
      a.next = now + STEP_MS;
      const stop = !this.game.lastActionTookTurn || ev.some((e) => e.type === 'interrupt' || e.type === 'death' || e.type === 'victory' || e.type === 'descend');
      if (stop || this.auto !== a) this.stopAuto();
      return;
    }
    const h = this.held;
    if (h && now >= h.next) {
      const ev = this.perform({ type: 'move', dx: h.dx, dy: h.dy }, { fromHeld: true, stepMs: REPEAT_MS - 6 });
      h.next = now + REPEAT_MS;
      if (ev.some((e) => e.type === 'interrupt' && STOP_HELD.has(e.reason)) || !this.game.lastActionTookTurn || ev.some((e) => e.type === 'descend')) h.stopped = true;
      if (h.stopped) this.held = null;
    }
  }

  pressDirection(dx, dy, code) {
    if (this.ended) return;
    this.perform({ type: 'move', dx, dy });
    const stopped = !this.game.lastActionTookTurn;
    this.held = stopped ? null : { dx, dy, code, next: performance.now() + REPEAT_DELAY };
  }
  releaseKey(code) {
    if (this.held && this.held.code === code) this.held = null;
  }

  // ---------------------------------------------------------------- high level commands
  wait() { this.perform({ type: 'wait' }); }
  rest() { this.perform({ type: 'rest' }); }
  pickup() { this.perform({ type: 'pickup' }); }
  descend() { this.perform({ type: 'descend' }); }
  onStairs() { const p = this.state.player; return this.state.level.tiles[p.y * this.state.level.width + p.x] === 'stairs_down'; }

  /** Click / tap on a map tile. */
  clickTile(x, y) {
    if (this.ended) return;
    const g = this.game, st = this.state, p = st.player, lv = st.level;
    if (this.targeting) {
      this.targeting.cursor = { x, y };
      this.refreshTarget();
      this.confirmTarget();
      return;
    }
    if (x < 0 || y < 0 || x >= lv.width || y >= lv.height) return;
    if (x === p.x && y === p.y) {
      if (g.itemsAt(x, y).length) this.pickup();
      else if (this.onStairs()) this.descend();
      else this.wait();
      return;
    }
    const dx = x - p.x, dy = y - p.y;
    const adj = Math.abs(dx) <= 1 && Math.abs(dy) <= 1;
    const mon = g.visibleMonsters().find((m) => m.x === x && m.y === y && !m.detectedOnly);
    if (adj) { this.perform({ type: 'move', dx, dy }); return; }
    if (!lv.explored[y * lv.width + x]) { this.addLog('Dorthin kennst du keinen Weg.', 'warn'); this.app.hud.update(); return; }
    if (mon) {
      // walk towards the monster (stops next to it when it blocks the path)
      this.startTravel(x, y);
      return;
    }
    this.startTravel(x, y);
  }

  // ---------------------------------------------------------------- hover
  setHover(t) {
    this.hoverTile = t;
    this.updateHover();
  }
  updateHover() {
    const R = this.renderer, t = this.hoverTile;
    R.dirty = true;
    if (this.targeting) return;
    const lv = this.state.level;
    if (!t || t.x < 0 || t.y < 0 || t.x >= lv.width || t.y >= lv.height || this.ended) {
      R.hover = null; R.path = null; this.app.hud.tooltip(null); return;
    }
    R.hover = t;
    R.dirty = true;
    const p = this.state.player;
    const explored = lv.explored[t.y * lv.width + t.x];
    if (explored && !(t.x === p.x && t.y === p.y) && !this.auto) {
      const key = `${t.x},${t.y},${p.x},${p.y},${this.state.turn}`;
      if (key !== this.pathKey) { this.pathKey = key; this.pathCache = this.game.findPath(t.x, t.y); }
      R.path = this.pathCache;
    } else R.path = null;
    this.app.hud.tooltip(t);
  }

  // ---------------------------------------------------------------- targeting
  beginTarget(need) {
    const g = this.game;
    const item = this.state.player.inventory.find((it) => it.uid === need.itemUid);
    if (!item) return;
    this.stopAuto();
    this.held = null;
    if (need.target === 'item') {
      this.app.overlays.itemPicker(item, need, (uid) => {
        if (uid != null) this.perform({ type: 'use', itemUid: item.uid, targetUid: uid });
      });
      return;
    }
    const range = need.range || 10;
    const cands = g.targetsInView().filter((t) => t.ai !== 'dormant' && g.canTarget(t.x, t.y, range));
    const all = cands.length ? cands : g.targetsInView().filter((t) => g.canTarget(t.x, t.y, range));
    const p = this.state.player;
    const first = all[0];
    this.targeting = {
      need, item, range, cands: all, idx: 0,
      cursor: first ? { x: first.x, y: first.y } : { x: p.x + this.renderer.heroFacing, y: p.y },
    };
    this.app.hud.targetBanner(this.targeting, g.itemName(item, { case: 'nom', article: 'none', count: 1 }).replace(/\s*\((?:leer|\d+ Ladung(?:en)?)\)$/, ''));
    this.app.inventory.closeIfSheet();
    this.refreshTarget();
    audio.play('ui_open', { volume: 0.5 });
  }

  refreshTarget() {
    const T = this.targeting;
    if (!T) { this.renderer.targeting = null; return; }
    const g = this.game, st = this.state, p = st.player, lv = st.level;
    // re-read candidates (monsters may have moved / died)
    T.cands = T.cands.filter((c) => g.visibleMonsters().some((m) => m.uid === c.uid && !m.detectedOnly)).map((c) => {
      const m = g.monsterByUid(c.uid); return m ? { ...c, x: m.x, y: m.y } : c;
    });
    const c = T.cursor;
    const valid = g.canTarget(c.x, c.y, T.range);
    const line = [];
    if (!(c.x === p.x && c.y === p.y)) {
      for (const q of ray(p.x, p.y, c.x, c.y, T.range)) {
        if (q.x < 0 || q.y < 0 || q.x >= lv.width || q.y >= lv.height) break;
        const t = lv.memTiles[q.y * lv.width + q.x];
        if (t == null || t === 'wall' || t === 'door_closed') break;
        line.push(q);
        if (T.need.purpose === 'throw' && q.x === c.x && q.y === c.y) break;
      }
    }
    this.renderer.targeting = { cursor: c, valid, candidates: T.cands, line };
    this.renderer.dirty = true;
    this.app.hud.targetInfo(T, valid);
  }

  cycleTarget(dir = 1) {
    const T = this.targeting;
    if (!T || !T.cands.length) return;
    T.idx = (T.idx + dir + T.cands.length) % T.cands.length;
    const c = T.cands[T.idx];
    T.cursor = { x: c.x, y: c.y };
    this.refreshTarget();
    audio.play('ui_click', { volume: 0.4 });
  }
  moveCursor(dx, dy) {
    const T = this.targeting;
    if (!T) return;
    const lv = this.state.level;
    T.cursor = { x: Math.max(0, Math.min(lv.width - 1, T.cursor.x + dx)), y: Math.max(0, Math.min(lv.height - 1, T.cursor.y + dy)) };
    this.refreshTarget();
  }
  hoverTarget(t) {
    const T = this.targeting;
    if (!T || !t) return;
    if (T.cursor.x === t.x && T.cursor.y === t.y) return;
    T.cursor = { x: t.x, y: t.y };
    this.refreshTarget();
  }
  confirmTarget() {
    const T = this.targeting;
    if (!T) return;
    const g = this.game;
    if (!g.canTarget(T.cursor.x, T.cursor.y, T.range)) {
      audio.play('error', { volume: 0.5 });
      this.app.hud.targetInfo(T, false, true);
      return;
    }
    const target = { x: T.cursor.x, y: T.cursor.y };
    const itemUid = T.item.uid;
    this.cancelTarget(true);
    this.perform({ type: 'use', itemUid, target });
  }
  cancelTarget(silent) {
    if (!this.targeting) return;
    this.targeting = null;
    this.renderer.targeting = null;
    this.renderer.dirty = true;
    this.app.hud.targetBanner(null);
    if (!silent) { this.addLog('Du lässt es bleiben.', 'info'); audio.play('ui_close', { volume: 0.5 }); }
    this.updateHover();
  }
}
