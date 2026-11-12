// Modal overlays with focus trap: handbook (help, codex, journal), menu,
// confirm dialogs, item picker, death and victory screens.
import { h, spriteImg } from './dom.js';
import { codex } from '../engine/index.js';
import { audio } from '../audio/index.js';
import { loadRuns } from './storage.js';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
const CAT_TITLE = { weapon: 'Waffen', armor: 'Rüstungen', thrown: 'Wurfwaffen', potion: 'Tränke', scroll: 'Schriftrollen', wand: 'Stäbe', ring: 'Ringe', oil: 'Lampenöl', gold: 'Gold', artifact: 'Artefakt' };
const UNKNOWN_NAME = { potion: 'Unbekannter Trank', scroll: 'Unbekannte Schriftrolle', wand: 'Unbekannter Stab', ring: 'Unbekannter Ring' };
const TONE_CLASS = { info: 't-info', good: 't-good', bad: 't-bad', warn: 't-warn', loot: 't-loot', flavor: 't-flavor' };

export class Overlays {
  constructor(app) {
    this.app = app;
    this.root = h('div.overlay-root');
    this.stack = [];
  }

  isOpen() { return this.stack.length > 0; }
  top() { return this.stack[this.stack.length - 1]; }

  /**
   * @param {HTMLElement} panel
   * @param {{label:string, onClose?:Function, dismissable?:boolean, cls?:string, initial?:HTMLElement}} o
   */
  open(panel, o = {}) {
    const prev = document.activeElement;
    const scrim = h('div.scrim' + (o.cls ? '.' + o.cls : ''));
    const dlg = h('div.modal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': o.label || 'Dialog' }, panel);
    scrim.append(dlg);
    if (o.dismissable !== false) scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim) this.close(entry); });
    const entry = { scrim, dlg, prev, o, closed: false };
    dlg.addEventListener('keydown', (e) => this.trap(e, entry));
    this.root.append(scrim);
    this.stack.push(entry);
    this.app.onModalChanged();
    requestAnimationFrame(() => {
      scrim.classList.add('in');
      const f = o.initial || dlg.querySelector('[autofocus]') || dlg.querySelector(FOCUSABLE);
      (f || dlg).focus({ preventScroll: true });
    });
    if (!o.silent) audio.play('ui_open', { volume: 0.5 });
    entry.close = () => this.close(entry);
    return entry;
  }

  close(entry = this.top(), silent) {
    if (!entry || entry.closed) return;
    entry.closed = true;
    this.stack = this.stack.filter((e) => e !== entry);
    entry.scrim.remove();
    if (entry.o.onClose) entry.o.onClose();
    this.app.onModalChanged();
    if (entry.prev && entry.prev.isConnected && entry.prev.focus) entry.prev.focus({ preventScroll: true });
    if (!silent) audio.play('ui_close', { volume: 0.45 });
  }

  closeAll() { while (this.stack.length) this.close(this.top(), true); }

  trap(e, entry) {
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      if (entry.o.dismissable !== false) this.close(entry);
      return;
    }
    if (e.key !== 'Tab') return;
    const f = [...entry.dlg.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null);
    if (!f.length) { e.preventDefault(); return; }
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  // ---------------------------------------------------------------- handbook
  handbook(tab = 'help') {
    const existing = this.stack.find((e) => e.o.kind === 'handbook');
    if (existing) { existing.select(tab); return; }
    const tabs = [['help', 'Wie man spielt'], ['codex', 'Kodex'], ['journal', 'Tagebuch']].filter(([id]) => id !== 'journal' || this.app.session);
    const body = h('div.hb-body');
    const tabBtns = tabs.map(([id, label]) => h('button.tab', { type: 'button', role: 'tab', id: 'tab-' + id, 'aria-controls': 'hb-panel', onclick: () => select(id) }, label));
    const closeBtn = h('button.x', { type: 'button', 'aria-label': 'Schließen', title: 'Schließen (Esc)', onclick: () => this.close(entry) }, '×');
    const panel = h('div.panel.handbook', h('div.hb-head', h('div.tabs', { role: 'tablist' }, tabBtns), closeBtn), body);
    body.id = 'hb-panel';
    body.setAttribute('role', 'tabpanel');
    body.tabIndex = 0;
    const select = (id) => {
      tabBtns.forEach((b, i) => { const on = tabs[i][0] === id; b.setAttribute('aria-selected', String(on)); b.classList.toggle('on', on); });
      body.replaceChildren(id === 'help' ? this.helpContent() : id === 'codex' ? this.codexContent() : this.journalContent());
      body.scrollTop = id === 'journal' ? body.scrollHeight : 0;
      if (id === 'journal') requestAnimationFrame(() => { body.scrollTop = body.scrollHeight; });
    };
    const entry = this.open(panel, { label: 'Handbuch', kind: 'handbook', initial: closeBtn });
    entry.select = select;
    select(tabs.some(([id]) => id === tab) ? tab : 'help');
    // arrow keys move between tabs
    panel.querySelector('.tabs').addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const i = tabBtns.indexOf(document.activeElement);
      if (i < 0) return;
      const n = tabBtns[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabBtns.length) % tabBtns.length];
      n.focus(); n.click(); e.preventDefault();
    });
    return entry;
  }

  helpContent() {
    const K = this.app.keyLabels;
    const row = (keys, what) => h('tr', h('td', keys.map((k, i) => [i ? ' ' : '', h('kbd', k)])), h('td', what));
    return h('div.help',
      h('section.help-intro',
        h('h2', 'Licht ist Leben'),
        h('p', 'Du trägst die letzte Laterne hinab in die Minen von Morrgrund. Tief unten, im Herz der Mine, hütet der Lichtfresser die Sonnenscherbe. Besiege ihn, nimm sie an dich – und vergiss nie: Was du nicht beleuchtest, siehst du nicht.')),
      h('div.help-cols',
        h('section',
          h('h3', 'Steuerung'),
          h('table.keys',
            h('tbody',
              row(['↑', '↓', '←', '→'], 'Gehen, gegen Gegner: angreifen'),
              row([K.KeyW, K.KeyA, K.KeyS, K.KeyD], 'Ebenso'),
              row([K.KeyQ, K.KeyE, K.KeyZ, K.KeyC], 'Schräg gehen'),
              row(['Ziffernblock'], 'Alle acht Richtungen, 5 wartet'),
              row(['Leertaste'], 'Eine Runde warten'),
              row([K.KeyG], 'Aufheben'),
              row([K.KeyX], 'Automatisch erkunden'),
              row([K.KeyR], 'Rasten, bis du geheilt bist'),
              row(['Enter'], 'Auf der Treppe: hinabsteigen'),
              row([K.KeyI], 'Inventar ein- und ausblenden'),
              row(['J'], 'Tagebuch mit allen Meldungen'),
              row(['1', '…', '9'], 'Gegenstand im Gepäck benutzen'),
              row(['Pos1', K.KeyV], 'Ansicht wieder auf dich zentrieren'),
              row(['+', '−'], 'Zoomen (auch Mausrad)'),
              row([K.KeyM], 'Ton an oder aus'),
              row(['?', 'F1'], 'Diese Hilfe'),
              row(['Esc'], 'Abbrechen, Menü'))),
          h('h3', 'Maus und Touch'),
          h('ul',
            h('li', 'Klick auf ein erkundetes Feld: Du gehst dorthin. Jede Taste oder ein weiterer Klick hält dich an.'),
            h('li', 'Karte verschieben: mit gedrückter Maustaste ziehen (links, rechts oder Mausrad), auf dem Handy mit einem Finger. Sobald du handelst, folgt die Ansicht dir wieder.'),
            h('li', 'Klick auf einen benachbarten Gegner: angreifen.'),
            h('li', 'Klick oder Tipp auf dich selbst: aufheben oder eine Runde warten.'),
            h('li', 'Beim Zielen mit Stäben und Wurfmessern: Tab wechselt das Ziel, Enter oder Klick bestätigt.'))),
        h('section',
          h('h3', 'Lampe und Öl'),
          h('p', 'Deine Lampe verbrennt jede Runde einen Tropfen Öl, 1000 passen hinein. Mit dem Öl schrumpft der Lichtkreis: Über 25\u00a0% siehst du sieben Felder weit, darunter fünf, unter 10\u00a0% nur noch drei.'),
          h('p', 'Ist die Lampe leer, heilst du nicht mehr, und alle vier Runden zehrt die Kälte an dir. Eine Ölflasche füllt 350 nach. Ein brennendes Glutbecken füllt die Lampe einmal ganz – geh einfach hinein.'),
          h('p', 'Du siehst nur, was in Sichtlinie liegt und beleuchtet ist: von deiner Lampe, von Glutbecken oder von Leuchtpilzen.'),
          h('h3', 'Tipps'),
          h('ul',
            h('li', 'Unbekannte Tränke, Schriftrollen, Stäbe und Ringe erkennst du durch Benutzen. Probiere sie, wenn es ruhig ist.'),
            h('li', 'Schlafende Gegner triffst du immer, und kritische Treffer werden wahrscheinlicher.'),
            h('li', 'Kämpfe in Gängen, damit dich nicht mehrere zugleich erreichen.'),
            h('li', 'Durch Türen kannst du weder schräg gehen noch schräg angreifen.'),
            h('li', 'Entdeckte Fallen überschreitest du meist sicher. Erkunden und Wege meiden sie.'),
            h('li', 'Rasten geht nur ohne Feinde in Sicht – und nicht mit leerer Lampe.'),
            h('li', 'Punkte: Gold, 100 je erreichter Tiefe, Erfahrung, und 5000 für den Sieg.')))));
  }

  codexContent() {
    const c = codex();
    const st = this.app.session?.game.state;
    const known = (it) => {
      if (!['potion', 'scroll', 'wand', 'ring'].includes(it.cat)) return true;
      return !!st?.ident[it.cat]?.known[it.kind];
    };
    const mons = c.monsters.map((m) => h('li.cx',
      spriteImg(m.id, 40, {}),
      h('div', h('div.cx-name', m.name, m.boss ? h('span.cx-tag.boss', 'Wächter der Tiefe') : null),
        h('div.cx-meta', `Tiefe ${m.depth[0]}${m.depth[1] !== m.depth[0] ? '–' + m.depth[1] : ''} · ${m.hp} Lebenspunkte · ${m.speed}`),
        h('p', m.description))));
    const groups = {};
    for (const it of c.items) (groups[it.cat] ??= []).push(it);
    const itemLis = [];
    for (const [cat, list] of Object.entries(groups)) {
      itemLis.push(h('li.cx-group', h('h4', CAT_TITLE[cat] || cat)));
      for (const it of list) {
        const k = known(it);
        const sprite = ['potion', 'scroll', 'wand', 'ring'].includes(it.cat) ? it.cat : it.kind;
        const ap = k && st && it.cat !== 'scroll' ? st.ident[it.cat]?.appearance[it.kind] : undefined;
        const meta = it.damage ? `Schaden ${it.damage}` : it.armor != null ? `Rüstung ${it.armor}` : '';
        itemLis.push(h('li.cx' + (k ? '' : '.unknown'),
          spriteImg(sprite, 36, { appearance: ap }),
          h('div', h('div.cx-name', k ? it.name : UNKNOWN_NAME[it.cat]),
            meta ? h('div.cx-meta', meta) : null,
            h('p', k ? it.description : st ? 'Noch nicht erkannt. Benutze ein Exemplar, um mehr zu erfahren.' : 'Wird im Spiel durch Benutzen erkannt.'))));
      }
    }
    const traps = c.traps.map((t) => h('li.cx', h('div', h('div.cx-name', t.name), h('p', t.description))));
    return h('div.codex',
      h('section', h('h3', 'Bewohner der Tiefe'), h('ul.cx-list', mons)),
      h('section', h('h3', 'Gegenstände'), h('ul.cx-list', itemLis), h('h3', 'Fallen'), h('ul.cx-list', traps)));
  }

  journalContent() {
    const log = this.app.session?.log || [];
    if (!log.length) return h('p.dim', 'Noch steht nichts in deinem Tagebuch.');
    return h('ol.journal', log.map((l) => h('li.' + (TONE_CLASS[l.tone] || 't-info'), l.text, l.n > 1 ? h('span.rep', ` (×${l.n})`) : null)));
  }

  // ---------------------------------------------------------------- menu
  menu() {
    if (this.stack.find((e) => e.o.kind === 'menu')) return;
    const app = this.app;
    const zoomVal = h('span.num.zoom-val', `${app.renderer.ts} px`);
    const vol = h('input', { type: 'range', min: '0', max: '100', step: '5', value: String(Math.round(app.settings.volume * 100)), 'aria-label': 'Lautstärke' });
    vol.addEventListener('input', () => app.setVolume(+vol.value / 100));
    const zoomBtn = (d, label) => h('button.btn.ghost.sq', { type: 'button', 'aria-label': label, onclick: () => { app.zoom(d); zoomVal.textContent = `${app.renderer.ts} px`; } }, d > 0 ? '+' : '−');
    const panel = h('div.panel.menu',
      h('h2', 'Pause'),
      h('div.menu-btns',
        h('button.btn.primary', { type: 'button', autofocus: true, onclick: () => this.close(entry) }, 'Weiterspielen'),
        h('button.btn', { type: 'button', onclick: () => { this.close(entry, true); this.handbook('help'); } }, 'Wie man spielt'),
        h('button.btn', { type: 'button', onclick: () => { this.close(entry, true); this.handbook('codex'); } }, 'Kodex'),
        h('button.btn', { type: 'button', onclick: () => { this.close(entry, true); this.handbook('journal'); } }, 'Tagebuch')),
      h('div.menu-set',
        h('label', 'Kachelgröße'), h('div.zoom', zoomBtn(-1, 'Verkleinern'), zoomVal, zoomBtn(1, 'Vergrößern')),
        h('label', 'Lautstärke'), vol),
      h('div.menu-btns.sep',
        h('button.btn', { type: 'button', onclick: () => { this.close(entry, true); app.toTitle(); } }, 'Speichern und zum Titel'),
        h('button.btn.danger', { type: 'button', onclick: async () => {
          const ok = await this.confirm({ title: 'Abstieg aufgeben?', text: 'Dein Spielstand wird gelöscht. Dieser Abstieg zählt nicht für die Halle der Erloschenen.', ok: 'Aufgeben', cancel: 'Weiterspielen', danger: true });
          if (ok) { this.closeAll(); app.abandon(); }
        } }, 'Abstieg aufgeben')));
    const entry = this.open(panel, { label: 'Menü', kind: 'menu' });
  }

  confirm({ title, text, ok = 'OK', cancel = 'Abbrechen', danger = false }) {
    return new Promise((resolve) => {
      let result = false;
      const okBtn = h('button.btn' + (danger ? '.danger' : '.primary'), { type: 'button', onclick: () => { result = true; this.close(entry); } }, ok);
      const cancelBtn = h('button.btn', { type: 'button', onclick: () => this.close(entry) }, cancel);
      const panel = h('div.panel.confirm', h('h2', title), h('p', text), h('div.row-btns', cancelBtn, okBtn));
      const entry = this.open(panel, { label: title, initial: cancelBtn, onClose: () => resolve(result), kind: 'confirm' });
    });
  }

  itemPicker(scroll, need, cb) {
    const g = this.app.session.game;
    const rows = g.inventoryView().filter((r) => r.unidentified && r.uid !== scroll.uid);
    let chosen = null;
    const list = rows.map((r) => h('button.pick', { type: 'button', onclick: () => { chosen = r.uid; this.close(entry, true); } },
      spriteImg(r.visual.sprite, 32, { appearance: r.visual.tint || undefined }), h('span', r.name)));
    const panel = h('div.panel.picker',
      h('h2', 'Was willst du erkennen?'),
      h('p.dim', 'Die Schriftrolle enthüllt das Wesen eines Gegenstands.'),
      rows.length ? h('div.pick-list', list) : h('p', 'Du trägst nichts Unbekanntes bei dir.'),
      h('div.row-btns', h('button.btn', { type: 'button', onclick: () => this.close(entry) }, 'Abbrechen')));
    const entry = this.open(panel, { label: 'Gegenstand wählen', kind: 'picker', onClose: () => cb(chosen) });
  }

  // ---------------------------------------------------------------- end screens
  endScreen(summary, rank, won) {
    const app = this.app;
    const stat = (label, value) => h('div.es-stat', h('span.es-val.num', String(value)), h('span.es-label', label));
    const kills = summary.killList.slice(0, 6).map((k) => `${k.count} ${k.name}`).join(', ');
    const again = h('button.btn.primary', { type: 'button', autofocus: true, onclick: () => { this.closeAll(); app.newGame(); } }, 'Neuen Abstieg beginnen');
    const panel = h('div.panel.endscreen' + (won ? '.won' : ''),
      h('h1', won ? 'Das Licht kehrt zurück' : 'Dein Licht ist erloschen'),
      h('p.es-cause', won ? 'Mit der Sonnenscherbe in Händen steigst du aus Morrgrund empor.' : summary.causeText),
      h('div.es-stats',
        stat(summary.maxDepth === 1 ? 'Tiefe' : 'Größte Tiefe', summary.maxDepth),
        stat('Stufe', summary.level),
        stat('Runden', summary.turns),
        stat('Besiegt', summary.totalKills),
        stat('Gold', summary.gold),
        stat('Punkte', summary.score)),
      kills ? h('p.es-kills', h('span.dim', 'Besiegt: '), kills) : null,
      rank > 0 ? h('p.es-rank', rank === 1 ? 'Ein neuer Bestwert in der Halle der Erloschenen.' : `Platz ${rank} in der Halle der Erloschenen.`) : null,
      h('div.row-btns', h('button.btn', { type: 'button', onclick: () => { this.closeAll(); app.toTitle(); } }, 'Zum Titel'), again));
    this.open(panel, { label: won ? 'Sieg' : 'Tod', dismissable: false, cls: won ? 'end-won' : 'end-dead', kind: 'end', silent: true });
  }
}

/** Shared renderer for the best-runs list (title screen). */
export function runsList(highlightId) {
  const runs = loadRuns();
  if (!runs.length) return h('p.runs-empty', 'Noch ist hier kein Licht erloschen. Sei die erste Laterne, an die man sich erinnert.');
  return h('ol.runs', runs.map((r, i) => h('li' + (r.id === highlightId ? '.hl' : '') + (r.won ? '.won' : ''),
    h('span.r-rank.num', String(i + 1)),
    h('span.r-main', h('span.r-cause', r.cause), h('span.r-meta', `Tiefe ${r.depth} · Stufe ${r.level}${r.turns != null ? ` · ${r.turns} Runden` : ''}`)),
    h('span.r-score.num', String(r.score)))));
}
