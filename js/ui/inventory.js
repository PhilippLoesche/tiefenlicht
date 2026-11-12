// Inventory drawer (desktop) / bottom sheet (narrow screens): equipment slots,
// pack grid with counts, detail card with per-item actions.
import { h, spriteImg, setText, setClass } from './dom.js';

const SLOTS = [['weapon', 'Waffe'], ['armor', 'Rüstung'], ['ring1', 'Ring'], ['ring2', 'Ring']];
const CAT_LABEL = { weapon: 'Waffe', armor: 'Rüstung', thrown: 'Wurfwaffe', potion: 'Trank', scroll: 'Schriftrolle', wand: 'Stab', ring: 'Ring', oil: 'Lampenöl', gold: 'Gold', artifact: 'Artefakt' };

/** Primary + secondary actions for an inventory row. */
export function itemActions(row) {
  const a = [];
  switch (row.cat) {
    case 'weapon': case 'armor': case 'ring':
      a.push(row.equipped ? { label: 'Ablegen', action: { type: 'unequip', itemUid: row.uid } } : { label: 'Anlegen', action: { type: 'equip', itemUid: row.uid } });
      break;
    case 'potion': a.push({ label: 'Trinken', action: { type: 'use', itemUid: row.uid } }); break;
    case 'scroll': a.push({ label: 'Lesen', action: { type: 'use', itemUid: row.uid } }); break;
    case 'wand': a.push({ label: 'Benutzen', action: { type: 'use', itemUid: row.uid } }); break;
    case 'thrown': a.push({ label: 'Werfen', action: { type: 'use', itemUid: row.uid } }); break;
    case 'oil': a.push({ label: 'Nachfüllen', action: { type: 'use', itemUid: row.uid } }); break;
    default: break;
  }
  a.push({ label: 'Fallenlassen', action: { type: 'drop', itemUid: row.uid }, secondary: true });
  return a;
}

export class Inventory {
  constructor(app) {
    this.app = app;
    this.open = false;
    this.selected = null;   // uid pinned by click
    this.peek = null;       // uid under pointer / focus
    this.sig = '';
    this.build();
  }

  get game() { return this.app.session?.game; }

  build() {
    this.count = h('span.inv-count.num');
    this.closeBtn = h('button.drawer-close', { type: 'button', 'aria-label': 'Inventar schließen', title: 'Schließen (I)', onclick: () => this.toggle(false) }, '×');
    this.slotEls = {};
    const slots = SLOTS.map(([slot, label]) => {
      const b = h('button.slot', { type: 'button', dataset: { slot } });
      b.addEventListener('click', () => { const uid = this.equippedUid(slot); if (uid != null) this.select(uid); });
      b.addEventListener('pointerenter', () => { const uid = this.equippedUid(slot); if (uid != null) this.setPeek(uid); });
      b.addEventListener('focus', () => { const uid = this.equippedUid(slot); if (uid != null) this.setPeek(uid); });
      b.addEventListener('dblclick', () => { const uid = this.equippedUid(slot); if (uid != null) this.primary(uid); });
      this.slotEls[slot] = { b, label };
      return b;
    });
    this.grid = h('div.grid', { role: 'list' });
    this.grid.addEventListener('pointerleave', () => this.setPeek(null));
    this.equip = h('div.equip', slots);
    this.detail = h('div.detail', { 'aria-live': 'polite' });
    this.el = h('aside.drawer.panel', { 'aria-label': 'Inventar', hidden: true },
      h('div.drawer-head', h('h2', 'Ausrüstung'), this.closeBtn),
      this.equip,
      h('div.drawer-head', h('h2', 'Gepäck'), this.count),
      this.grid,
      this.detail);
    this.el.addEventListener('pointerleave', () => this.setPeek(null));
    this.scrim = h('div.sheet-scrim', { hidden: true, onclick: () => this.toggle(false) });
  }

  equippedUid(slot) { return this.game?.state.player.equipment[slot] ?? null; }

  /** @param {boolean} [force] @param {boolean} [quiet] programmatic change: do not store as preference */
  toggle(force, quiet) {
    const open = force ?? !this.open;
    if (open === this.open) return;
    this.open = open;
    this.el.hidden = !open;
    this.scrim.hidden = !(open && this.app.narrow);
    this.app.onDrawerChanged(open, quiet);
    if (open) { this.sig = ''; this.update(); }
  }

  closeIfSheet() { if (this.app.narrow) this.toggle(false, true); }

  update() {
    const g = this.game;
    if (!g || !this.open) return;
    const rows = g.inventoryView();
    const st = g.state;
    const sig = rows.map((r) => `${r.uid}:${r.count}:${r.name}:${r.equipped}:${g.state.player.inventory.find((i) => i.uid === r.uid)?.charges ?? ''}`).join('|') + `#${this.selected}`;
    if (sig === this.sig) return;
    this.sig = sig;
    this.rows = rows;
    if (this.selected != null && !rows.some((r) => r.uid === this.selected)) this.selected = null;
    if (this.peek != null && !rows.some((r) => r.uid === this.peek)) this.peek = null;
    setText(this.count, `${st.player.inventory.length} / 20`);
    // equipment
    for (const [slot] of SLOTS) {
      const { b, label } = this.slotEls[slot];
      const uid = st.player.equipment[slot];
      const row = rows.find((r) => r.uid === uid);
      b.replaceChildren();
      if (row) {
        // "+0" is noise in the narrow slot; the full name is in the tooltip and the detail card
        b.append(this.icon(row, 32), h('span.slot-text', h('span.slot-kind', label), h('span.slot-name', row.name.replace(/ \+0$/, ''))));
        b.title = row.name;
        b.disabled = false;
      } else {
        b.append(h('span.slot-empty'), h('span.slot-text', h('span.slot-kind', label), h('span.slot-name.dim', 'leer')));
        b.title = `${label}: leer`;
        b.disabled = true;
      }
      setClass(b, 'sel', row && row.uid === this.selected);
    }
    // pack
    const focusedUid = this.el.contains(document.activeElement) ? document.activeElement.dataset.uid : null;
    const pack = rows.filter((r) => !r.equipped);
    const cells = [];
    pack.forEach((r, i) => {
      const b = h('button.cell', { type: 'button', role: 'listitem', title: r.name, dataset: { uid: String(r.uid) }, 'aria-label': `${r.name}${r.count > 1 ? `, ${r.count} Stück` : ''}` }, this.icon(r, 34));
      if (r.count > 1) b.append(h('span.badge.num', String(r.count)));
      if (i < 9) b.append(h('span.qn', String(i + 1)));
      if (r.unidentified) b.classList.add('unknown');
      if (r.uid === this.selected) b.classList.add('sel');
      b.addEventListener('click', () => this.select(r.uid));
      b.addEventListener('dblclick', () => this.primary(r.uid));
      b.addEventListener('pointerenter', () => this.setPeek(r.uid));
      b.addEventListener('focus', () => this.setPeek(r.uid));
      cells.push(b);
    });
    for (let i = pack.length; i < Math.max(10, Math.ceil(pack.length / 5) * 5); i++) cells.push(h('span.cell.empty', { 'aria-hidden': 'true' }));
    this.grid.replaceChildren(...cells);
    this.pack = pack;
    if (focusedUid != null) this.grid.querySelector(`[data-uid="${focusedUid}"]`)?.focus({ preventScroll: true });
    this.renderDetail();
  }

  icon(row, size) {
    const v = row.visual;
    return spriteImg(v.sprite, size, { appearance: v.tint || undefined });
  }

  setPeek(uid) {
    if (uid === this.peek) return;
    this.peek = uid;
    this.renderDetail();
  }

  select(uid) {
    this.selected = this.selected === uid && !this.app.narrow ? null : uid;
    this.sig = '';
    this.update();
  }

  primary(uid) {
    const row = this.rows?.find((r) => r.uid === uid);
    if (!row) return;
    const a = itemActions(row)[0];
    if (a && !a.secondary) this.run(a);
  }

  /** Quick-use by number key (1–9). */
  quick(n) {
    const g = this.game;
    if (!g) return;
    const pack = g.inventoryView().filter((r) => !r.equipped);
    const row = pack[n - 1];
    if (!row) return;
    const a = itemActions(row)[0];
    if (a && !a.secondary) this.app.session.perform(a.action);
  }

  run(a) {
    const s = this.app.session;
    if (!s) return;
    if (a.action.type === 'use' || a.action.type === 'drop') this.closeIfSheet();
    s.perform(a.action);
    this.sig = '';
    this.update();
  }

  renderDetail() {
    const g = this.game;
    const uid = this.peek ?? this.selected;
    const row = this.rows?.find((r) => r.uid === uid);
    if (!g || !row) {
      const empty = !this.rows || this.rows.length === 0;
      this.detail.replaceChildren(h('p.detail-empty', empty ? 'Dein Gepäck ist leer.' : this.app.touch ? 'Tippe auf einen Gegenstand, um ihn anzusehen.' : 'Zeige auf einen Gegenstand, um mehr zu erfahren. Doppelklick benutzt ihn.'));
      return;
    }
    const item = g.state.player.inventory.find((i) => i.uid === row.uid);
    const desc = item ? g.itemDescription(item) : '';
    const tag = [CAT_LABEL[row.cat] || '', row.equipped ? 'angelegt' : null, row.unidentified ? 'unbekannt' : null, item && item.charges != null && !row.unidentified ? `${item.charges} Ladungen` : null].filter(Boolean).join(' · ');
    const actions = itemActions(row).map((a) => h('button.btn' + (a.secondary ? '.ghost' : '.primary'), { type: 'button', onclick: () => this.run(a) }, a.label));
    this.detail.replaceChildren(
      h('div.detail-head', this.icon(row, 44), h('div', h('h3', row.name), h('div.detail-tag', tag))),
      h('p.detail-desc', desc),
      h('div.detail-actions', actions));
  }
}
