// Title screen: a real game explores itself in the background, the title is
// lit by a swaying lantern, and the hall of best runs sits on the right.
import { Game } from '../engine/index.js';
import { h } from './dom.js';
import { hasSave, saveInfo } from './storage.js';
import { runsList } from './overlays.js';

const DEMO_STEP = 620;

export class Title {
  constructor(app) {
    this.app = app;
    this.el = h('div.title-screen', { hidden: true });
    this.demo = null;
    this.next = 0;
    this.steps = 0;
  }

  show({ notice, highlight } = {}) {
    const app = this.app;
    const save = hasSave();
    const info = save ? saveInfo() : null;
    this.word = h('h1.title-word', 'Tiefenlicht');
    this.wordBox = null;
    const btns = [];
    if (save) {
      btns.push(h('button.btn.primary.big', { type: 'button', onclick: () => app.continueGame() },
        h('span', 'Abstieg fortsetzen'), info ? h('span.btn-sub', `Tiefe ${info.depth} · Stufe ${info.level} · Runde ${info.turn}`) : null));
    }
    btns.push(h('button.btn.big' + (save ? '' : '.primary'), { type: 'button', onclick: () => this.startNew(save) }, 'Neuen Abstieg beginnen'));
    btns.push(h('button.btn.big.ghost', { type: 'button', onclick: () => app.overlays.handbook('help') }, 'Wie man spielt'));
    this.el.replaceChildren(
      h('div.title-veil'),
      h('main.title-main',
        h('div.title-glow', { 'aria-hidden': 'true' }),
        this.word,
        h('p.premise', 'Trag die letzte Laterne hinab in die Minen von Morrgrund und hol die Sonnenscherbe zurück, bevor dein Licht erlischt.'),
        h('div.title-btns', btns),
        notice ? h('p.notice', { role: 'status' }, notice) : null),
      h('aside.hall', { 'aria-labelledby': 'hall-h' }, h('h2#hall-h', 'Halle der Erloschenen'), runsList(highlight)),
      h('footer.title-foot', h('span', 'Ein Roguelike über Licht und Dunkelheit'), h('span.dim', 'Ton mit M · Hilfe mit ?')));
    this.el.hidden = false;
    this.startDemo();
    requestAnimationFrame(() => this.el.querySelector('.btn.primary')?.focus({ preventScroll: true }));
  }

  async startNew(hasRun) {
    if (hasRun) {
      const ok = await this.app.overlays.confirm({ title: 'Neuen Abstieg beginnen?', text: 'Dein laufender Abstieg geht dabei verloren.', ok: 'Neu beginnen', cancel: 'Zurück', danger: true });
      if (!ok) return;
    }
    this.app.newGame();
  }

  hide() { this.el.hidden = true; this.demo = null; }

  startDemo() {
    const seed = 'titel-' + Math.floor(Math.random() * 1e6);
    this.demo = Game.create({ seed });
    this.steps = 0;
    this.next = performance.now() + 900;
    const R = this.app.renderer;
    R.demo = true;
    R.setGame(this.demo);
    R.focusXTarget = this.app.narrow ? 0 : -Math.min(260, window.innerWidth * 0.16);
    R.focusYTarget = 0;
    R.lightRate = 1600;
  }

  frame(now) {
    if (this.el.hidden) return;
    // the title is lit by a slowly swaying lantern
    if (this.word && !this.app.anim.reduced) {
      const t = now / 1000;
      // the light on the title follows the lantern bearer walking below it, with a gentle sway
      let hx = 50, hy = 60;
      const R = this.app.renderer;
      if (this.demo && R.hero) {
        const p = this.app.anim.pos(0, R.hero.x, R.hero.y, now);
        const c = R.clientOfTile(p.x + 0.5, p.y + 0.5);
        const b = this.wordBox || (this.wordBox = this.word.getBoundingClientRect());
        hx = Math.max(-15, Math.min(115, ((c.x - b.left) / b.width) * 100));
        hy = Math.max(10, Math.min(140, ((c.y - b.top) / b.height) * 100));
      }
      this.lx = this.lx == null ? hx : this.lx + (hx - this.lx) * 0.03;
      this.ly = this.ly == null ? hy : this.ly + (hy - this.ly) * 0.03;
      const lx = this.lx + Math.sin(t * 0.7) * 6 + Math.sin(t * 1.9) * 2;
      const ly = Math.min(this.ly, 95) * 0.6 + 20 + Math.sin(t * 0.53 + 1) * 6;
      this.word.style.setProperty('--lx', lx.toFixed(1) + '%');
      this.word.style.setProperty('--ly', ly.toFixed(1) + '%');
      const glow = this.word.previousSibling;
      if (glow) glow.style.transform = `translate(${(lx - 50) * 0.9}%, 0)`;
    }
    const g = this.demo;
    if (!g || now < this.next || this.app.overlays.isOpen()) return;
    this.next = now + DEMO_STEP;
    const A = this.app.anim;
    const st = g.state;
    if (st.status !== 'playing' || this.steps > 260) { this.startDemo(); return; }
    let ev = g.act({ type: 'explore', ignoreMonsters: true });
    const blocked = ev.find((e) => e.type === 'interrupt' && (e.reason === 'blocked' || e.reason === 'explore_done'));
    if (blocked) {
      const m = g.targetsInView().find((t) => Math.max(Math.abs(t.x - st.player.x), Math.abs(t.y - st.player.y)) === 1);
      if (m) ev = g.act({ type: 'move', dx: m.x - st.player.x, dy: m.y - st.player.y });
      else if (blocked.reason === 'explore_done') {
        if (st.level.stairs && st.player.x === st.level.stairs.x && st.player.y === st.level.stairs.y) { this.startDemo(); return; }
        ev = st.level.stairs ? g.act({ type: 'travel', x: st.level.stairs.x, y: st.level.stairs.y }) : [];
        if (!g.lastActionTookTurn) { this.startDemo(); return; }
      } else { this.startDemo(); return; }
    }
    this.steps++;
    for (const e of ev) {
      if (e.type === 'move' && !e.teleport) {
        A.moveEntity(e.uid, e.from.x, e.from.y, e.to.x, e.to.y, now, DEMO_STEP - 40);
        if (e.uid === 0 && e.to.x !== e.from.x) this.app.renderer.heroFacing = e.to.x > e.from.x ? 1 : -1;
      } else if (e.type === 'attack' && !e.ranged) {
        const a = e.attacker === 0 ? st.player : g.monsterByUid(e.attacker);
        const t = e.target === 0 ? st.player : g.monsterByUid(e.target) || ev.find((x) => x.type === 'die' && x.uid === e.target);
        if (a && t) A.lunge(e.attacker, t.x - a.x, t.y - a.y, now);
      } else if (e.type === 'die') {
        A.ghost(e.id, e.x, e.y, now, 1);
        A.burst(e.x, e.y, 14, '#f3e6c8', { speed: 2, life: 500 });
      }
    }
    this.app.renderer.sync();
  }
}
