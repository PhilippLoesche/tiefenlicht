// Tiefenlicht — browser frontend entry point.
import { Game } from './engine/index.js';
import { audio } from './audio/index.js';
import { Anim } from './ui/anim.js';
import { Renderer } from './ui/renderer.js';
import { Session } from './ui/session.js';
import { Hud } from './ui/hud.js';
import { Inventory } from './ui/inventory.js';
import { Minimap } from './ui/minimap.js';
import { Overlays } from './ui/overlays.js';
import { Input, keyLabels } from './ui/input.js';
import { Title } from './ui/title.js';
import { h, prefersReducedMotion } from './ui/dom.js';
import * as store from './ui/storage.js';

const ZOOMS = [24, 28, 32, 40, 48, 56, 64];
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');

class App {
  constructor() {
    this.settings = store.loadSettings();
    this.screen = 'title';
    this.session = null;
    this.touch = matchMedia('(pointer: coarse)').matches;
    this.narrowMq = matchMedia('(max-width: 760px)');
    this.narrow = this.narrowMq.matches;
    this.keyLabels = { KeyV: 'V', KeyW: 'W', KeyA: 'A', KeyS: 'S', KeyD: 'D', KeyQ: 'Q', KeyE: 'E', KeyZ: 'Y', KeyC: 'C', KeyG: 'G', KeyX: 'X', KeyR: 'R', KeyI: 'I', KeyM: 'M' };
    keyLabels().then((k) => { this.keyLabels = k; });

    this.anim = new Anim();
    this.anim.reduced = prefersReducedMotion();
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', (e) => { this.anim.reduced = e.matches; });

    const app = document.getElementById('app');
    this.canvas = h('canvas#map', { 'aria-label': 'Spielkarte' });
    this.renderer = new Renderer(this.canvas, this.anim);
    this.hud = new Hud(this);
    this.inventory = new Inventory(this);
    this.minimap = new Minimap(this);
    this.overlays = new Overlays(this);
    this.title = new Title(this);
    this.hud.mountMinimap(this.minimap.el);
    this.floorCard = h('div.floorcard', { 'aria-live': 'polite' });
    this.veil = h('div.veil');
    this.hud.topright.append(this.inventory.el);
    this.hud.root.append(this.inventory.scrim);
    app.replaceChildren(this.canvas, this.hud.root, this.title.el, this.veil, this.floorCard, this.overlays.root);
    this.input = new Input(this);

    audio.setMuted(this.settings.muted);
    audio.setVolume(this.settings.volume);
    this.hud.setMuted(this.settings.muted);

    this.renderer.resize();
    this.renderer.setTileSize(this.settings.tileSize && ZOOMS.includes(this.settings.tileSize) ? this.settings.tileSize : this.defaultZoom());
    window.addEventListener('resize', () => this.onResize());
    this.narrowMq.addEventListener?.('change', (e) => {
      this.narrow = e.matches;
      // the drawer becomes a bottom sheet on phones: start closed there, restore the preference on wide screens
      if (this.screen === 'game') this.inventory.toggle(this.narrow ? false : (this.settings.drawer ?? true), true);
      this.onResize();
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.save(); });
    window.addEventListener('pagehide', () => this.save());

    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
    if (DEBUG) this.installDebug();
    this.showTitle();
  }

  defaultZoom() {
    const w = window.innerWidth, hh = window.innerHeight;
    if (this.narrow) return w < 420 ? 28 : 32;
    let best = ZOOMS[0];
    for (const z of ZOOMS) if (w / z >= 24 && hh / z >= 14 && z <= 56) best = z;
    return best;
  }

  // ---------------------------------------------------------------- frame loop
  loop(now) {
    requestAnimationFrame(this.loop);
    if (this.dimTarget != null) {
      this.renderer.dimming += (this.dimTarget - this.renderer.dimming) * 0.04;
    }
    if (this.screen === 'game' && this.session) this.session.tick(now);
    else if (this.screen === 'title') this.title.frame(now);
    this.renderer.frame(now);
    if (this.screen === 'game') this.hud.frame(now);
  }

  onResize() {
    this.renderer.resize();
    this.title.wordBox = null;
    this.minimap.update();
    this.onDrawerChanged(this.inventory.open, true);
  }

  // ---------------------------------------------------------------- screens
  showTitle(opts) {
    this.screen = 'title';
    this.session = null;
    this.dimTarget = null;
    this.renderer.dimming = 0;
    this.hud.root.hidden = true;
    this.inventory.toggle(false, true);
    this.overlays.closeAll();
    document.body.classList.add('on-title');
    this.title.show(opts);
    audio.setAmbient('stollen');
  }

  newGame() {
    let seed = String(Date.now() % 1e9) + '-' + Math.floor(Math.random() * 1e4);
    if (DEBUG && params.get('seed')) seed = params.get('seed');
    const game = Game.create({ seed });
    const log = [];
    store.clearSave();
    this.startSession(game, log, game.startEvents);
    if (DEBUG && params.get('depth')) {
      const d = Math.max(1, Math.min(10, parseInt(params.get('depth'), 10) || 1));
      if (d > 1) this.debugGoDepth(d);
    }
    this.save();
  }

  continueGame() {
    const r = store.loadSave();
    if (r.error) {
      store.clearSave();
      this.showTitle({ notice: 'Der Spielstand ließ sich nicht laden und wurde verworfen. Beginne einen neuen Abstieg.' });
      return;
    }
    this.startSession(r.game, r.log.map((l) => ({ ...l, fresh: 0 })), null);
    this.session.addLog('Du nimmst deinen Abstieg wieder auf.', 'flavor');
    this.hud.update();
  }

  startSession(game, log, startEvents) {
    this.title.hide();
    this.overlays.closeAll();
    document.body.classList.remove('on-title');
    this.screen = 'game';
    this.dimTarget = null;
    this.renderer.dimming = 0;
    this.renderer.demo = false;
    this.renderer.heroFacing = 1;
    this.renderer.focusYTarget = 0;
    this.session = new Session(this, game, log);
    this.renderer.setGame(game);
    this.renderer.lightRate = 700;
    this.hud.root.hidden = false;
    this.hud.last = {};
    if (startEvents) this.session.present(startEvents, { quiet: true });
    this.inventory.sig = '';
    const wantDrawer = this.narrow ? false : (this.settings.drawer ?? window.innerWidth >= 1100);
    this.inventory.toggle(wantDrawer, true);
    this.onDrawerChanged(this.inventory.open, true);
    this.renderer.sync();
    this.hud.logChanged();
    this.hud.update();
    this.minimap.update();
    const st = game.playerStats();
    this.showFloorCard(st.depth, st.biomeName);
    audio.setAmbient(game.state.level.biome);
    this.canvas.focus?.();
  }

  toTitle() {
    this.save();
    this.showTitle();
  }

  abandon() {
    store.clearSave();
    this.session = null;
    this.showTitle();
  }

  onRunEnded(kind) {
    const game = this.session.game;
    const summary = game.runSummary();
    store.clearSave();
    const { rank, id } = store.recordRun(summary);
    this.lastRunId = id;
    const won = kind === 'victory';
    const reduced = this.anim.reduced;
    this.inventory.toggle(false, true);
    this.hud.tooltip(null);
    if (!won) {
      this.renderer.lightRate = reduced ? 200 : 1300;
      this.dimTarget = 1;
    }
    setTimeout(() => {
      if (this.session?.game !== game) return;
      this.overlays.endScreen(summary, rank, won);
    }, reduced ? 500 : won ? 1900 : 1800);
  }

  showFloorCard(depth, biomeName) {
    const card = this.floorCard;
    card.replaceChildren(h('div.fc-depth', `Tiefe ${depth}`), h('div.fc-biome', biomeName));
    card.classList.remove('show');
    this.veil.classList.remove('show');
    void card.offsetWidth;
    card.classList.add('show');
    this.veil.classList.add('show');
  }

  // ---------------------------------------------------------------- persistence
  save() {
    const s = this.session;
    if (!s || s.ended || this.screen !== 'game') return;
    store.writeSave(s.game, s.log.map(({ text, tone, n }) => ({ text, tone, n })));
  }

  saveSettings() { store.saveSettings(this.settings); }

  // ---------------------------------------------------------------- settings
  gesture() {
    if (this.audioReady) return;
    this.audioReady = true;
    audio.init();
  }

  toggleMute() {
    this.settings.muted = !this.settings.muted;
    audio.setMuted(this.settings.muted);
    this.hud.setMuted(this.settings.muted);
    this.saveSettings();
    if (!this.settings.muted) audio.play('ui_click', { volume: 0.5 });
  }

  setVolume(v) {
    this.settings.volume = v;
    audio.setVolume(v);
    if (v > 0 && this.settings.muted) this.toggleMute();
    this.saveSettings();
  }

  zoom(d, client) {
    const cur = this.renderer.ts;
    let i = ZOOMS.indexOf(cur);
    if (i < 0) i = ZOOMS.findIndex((z) => z >= cur);
    const n = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i + d))];
    if (n === cur) return;
    this.renderer.zoomAt(n, client);
    this.settings.tileSize = n;
    this.saveSettings();
  }

  setTouch(on) {
    if (this.touch === on) return;
    this.touch = on;
    document.body.classList.toggle('touch', on);
    this.layoutHud();
  }

  onDrawerChanged(open, quiet) {
    document.body.classList.toggle('drawer-open', open);

    const R = this.renderer;
    if (this.screen === 'game') {
      if (this.narrow) { R.focusXTarget = 0; R.focusYTarget = open ? -window.innerHeight * 0.26 : 0; }
      else { R.focusXTarget = open ? -(this.inventory.el.offsetWidth + 16) / 2 : 0; R.focusYTarget = 0; }
    }
    if (!quiet && !this.narrow && this.screen === 'game') { this.settings.drawer = open; this.saveSettings(); }
    this.layoutHud();
  }

  /** Keep the message log clear of the action bar (moves it up when space runs out). */
  layoutHud() {
    const log = this.hud.logEl;
    if (this.narrow || this.screen !== 'game') { document.body.classList.remove('log-up'); log.style.width = ''; return; }
    document.body.classList.remove('log-up');
    const bar = this.hud.actionbar.getBoundingClientRect();
    document.body.style.setProperty('--bar-w', Math.round(bar.width) + 'px');
    const avail = bar.left - 18 - 28;
    const up = avail < 340;
    document.body.classList.toggle('log-up', up);
    log.style.width = up ? '' : Math.min(600, avail) + 'px';
  }

  onModalChanged() {
    const open = this.overlays.isOpen();
    document.body.classList.toggle('modal-open', open);
    if (open && this.session) { this.session.stopAuto(); this.session.held = null; this.hud.tooltip(null); }
  }

  modalOpen() { return this.overlays.isOpen(); }

  /** Keys on the title screen (buttons handle Enter/Space themselves). */
  titleKey(e) {
    if (this.overlays.isOpen()) return;
    if (e.key === '?' || e.code === 'F1') { e.preventDefault(); this.overlays.handbook('help'); }
    else if (e.code === 'KeyM') { e.preventDefault(); this.toggleMute(); }
  }

  // ---------------------------------------------------------------- debug
  installDebug() {
    const app = this;
    window.__tl = {
      app,
      get game() { return app.session?.game; },
      get session() { return app.session; },
      setOil(n) { const g = app.session.game; const p = g.state.player; const before = p.oil; p.oil = Math.max(0, Math.min(p.oilMax, n)); g.onOilChanged(before); g.updateVision(); g._ev = []; app.session.afterAction([]); },
      setHp(n) { const p = app.session.game.state.player; p.hp = n; app.session.afterAction([]); },
      goDepth(d) { app.debugGoDepth(d); },
      reveal() { const g = app.session.game; g.revealMap(); app.session.afterAction([]); },
      give(cat, kind, o = {}) { const g = app.session.game; return import('./engine/entities.js').then((m) => { g.state.player.inventory.push(m.makeItem(g.state, cat, kind, o)); app.session.afterAction([]); }); },
      act(a) { return app.session.perform(a); },
      xp(n) { const s = app.session, g = s.game; g._ev = []; g.gainXp(n); const ev = g._ev; g._ev = []; s.present(ev, {}); s.afterAction(ev); return ev.length; },
      anim: app.anim,
      renderer: app.renderer,
    };
  }

  debugGoDepth(d) {
    const s = this.session, g = s.game;
    g._ev = [];
    g.enterLevel(d, 'stairs');
    const ev = g._ev;
    g._ev = [];
    s.present(ev, { quiet: true });
    s.afterAction(ev);
  }
}

window.addEventListener('DOMContentLoaded', () => { window.tiefenlicht = new App(); }, { once: true });
