// Heads-up display: vitals with the lantern gauge, depth label and tool
// buttons, message log, action bar, tooltip, targeting banner and boss bar.
// All DOM writes are diffed so a turn only touches what changed.
import { h, spriteImg, setText, setClass } from './dom.js';
import { LIGHT } from '../art/index.js';

export const STATUS_ICON = {
  poison: ['icon_poison', '#7bc043'], confusion: ['icon_confusion', '#c49bff'], haste: ['icon_haste', '#58c2a5'],
  finsternis: ['icon_blind', '#e2543a'], steinhaut: ['icon_stoneskin', '#58c2a5'], slow: ['icon_slow', '#e2543a'],
  frozen: ['icon_slow', '#9fe3ff'], fear: ['icon_fear', '#e2543a'], stun: ['icon_stun', '#ffb454'],
  asleep: ['icon_rest', '#b9c4d2'], gespuer: ['icon_xp', '#58c2a5'],
};

const TONE_CLASS = { info: 't-info', good: 't-good', bad: 't-bad', warn: 't-warn', loot: 't-loot', flavor: 't-flavor' };

export class Hud {
  constructor(app) {
    this.app = app;
    this.last = {};
    this.root = h('div.hud#hud', { hidden: true });
    this.build();
  }

  get game() { return this.app.session?.game; }

  build() {
    const app = this.app;
    // ---- vitals
    this.lanternCv = h('canvas.lantern-cv', { width: 60, height: 84, 'aria-hidden': 'true' });
    this.oilText = h('span.oil-val');
    this.lantern = h('div.lantern', { title: 'Öl in der Lampe' }, this.lanternCv, h('div.oil-read', this.oilText));
    this.hpFill = h('div.bar-fill');
    this.hpGhost = h('div.bar-ghost');
    this.hpBar = h('div.bar.hp-bar', { role: 'meter', 'aria-label': 'Lebenskraft' }, this.hpGhost, this.hpFill);
    this.hpText = h('span.num');
    this.xpFill = h('div.bar-fill');
    this.xpBar = h('div.bar.xp-bar', this.xpFill);
    this.lvlText = h('span.lvl-text');
    this.xpText = h('span.num.dim');
    this.stDmg = h('span.num'); this.stArm = h('span.num'); this.stStr = h('span.num'); this.stGold = h('span.num');
    const stat = (icon, el, title, col) => h('span.stat', { title }, spriteImg(icon, 16, { color: col }), el);
    this.statuses = h('div.statuses');
    this.vitals = h('section.vitals.panel', { 'aria-label': 'Zustand' },
      this.lantern,
      h('div.vit-main',
        h('div.hp-row', spriteImg('icon_heart', 18, { color: '#e2543a' }), this.hpBar, this.hpText),
        h('div.lvl-row', this.lvlText, this.xpBar, this.xpText),
        h('div.stat-row',
          stat('icon_sword', this.stDmg, 'Schaden', '#b9c4d2'),
          stat('icon_shield', this.stArm, 'Rüstung', '#b9c4d2'),
          stat('icon_strength', this.stStr, 'Stärke', '#b9c4d2'),
          stat('icon_gold', this.stGold, 'Gold', '#f2c14e')),
        this.statuses));

    // ---- top right: depth + tools
    this.depthNum = h('span.depth-num');
    this.biomeName = h('span.biome-name');
    this.depth = h('div.depth', this.depthNum, this.biomeName);
    const tool = (icon, label, key, fn, extra = '') => {
      const b = h('button.tool' + extra, { type: 'button', title: `${label} (${key})`, 'aria-label': label, onclick: fn });
      if (icon) b.append(spriteImg(icon, 20, { color: '#e8dcc0' }));
      return b;
    };
    this.bagBtn = tool('icon_bag', 'Inventar', 'I', () => app.inventory.toggle());
    this.soundBtn = tool(null, 'Ton an/aus', 'M', () => app.toggleMute());
    this.soundOn = spriteImg('icon_sound_on', 20, { color: '#e8dcc0' });
    this.soundOff = spriteImg('icon_sound_off', 20, { color: '#8d97ad' });
    this.soundBtn.append(this.soundOn, this.soundOff);
    this.helpBtn = tool('icon_help', 'Hilfe', '?', () => app.overlays.handbook('help'));
    this.menuBtn = tool(null, 'Menü', 'Esc', () => app.overlays.menu(), '.menu-btn');
    this.menuBtn.append(h('span.burger', h('i'), h('i'), h('i')));
    this.tools = h('div.tools', this.bagBtn, this.soundBtn, this.helpBtn, this.menuBtn);
    this.topright = h('section.topright', { 'aria-label': 'Ebene' }, h('div.tr-row', this.depth, this.tools));

    // ---- boss bar
    this.bossName = h('span.boss-name');
    this.bossFill = h('div.bar-fill');
    this.boss = h('div.bossbar', { hidden: true }, this.bossName, h('div.bar', this.bossFill));

    // ---- log
    this.logEl = h('div.log', { 'aria-live': 'polite', role: 'log' });

    // ---- action bar
    const act = (icon, label, key, fn, cls = '', short = label) => {
      const b = h('button.act' + cls, { type: 'button', 'aria-label': label, onclick: (e) => { e.currentTarget.blur(); fn(); } });
      b.append(icon ? spriteImg(icon, 20, { color: '#e8dcc0' }) : h('span.act-dot', { 'aria-hidden': 'true' }));
      b.append(h('span.act-label', label), h('span.act-short', short));
      if (key) b.append(h('kbd', key));
      return b;
    };
    const S = () => app.session;
    this.btnExplore = act('icon_explore', 'Erkunden', 'X', () => { const s = S(); if (!s) return; if (s.auto) s.stopAuto(); else s.startExplore(); });
    this.btnRest = act('icon_rest', 'Rasten', 'R', () => S()?.rest());
    this.btnWait = act(null, 'Warten', '␣', () => S()?.wait(), '.only-touch.act-wait');
    this.btnPick = act('icon_bag', 'Aufheben', 'G', () => S()?.pickup(), '', 'Nehmen');
    this.btnDescend = act('icon_depth', 'Hinab', '⏎', () => S()?.descend());
    this.btnInv = act('icon_bag', 'Inventar', null, () => app.inventory.toggle(), '.only-touch', 'Gepäck');
    this.actionbar = h('nav.actionbar', { 'aria-label': 'Aktionen' }, this.btnExplore, this.btnRest, this.btnWait, this.btnPick, this.btnDescend, this.btnInv);

    // ---- tooltip & banner
    this.tip = h('div.tooltip', { hidden: true, role: 'tooltip' });
    this.bannerTitle = h('div.banner-title');
    this.bannerInfo = h('div.banner-info');
    this.bannerHint = h('div.banner-hint');
    this.bannerCancel = h('button.banner-x', { type: 'button', onclick: () => app.session?.cancelTarget() }, 'Abbrechen');
    this.bannerFire = h('button.banner-ok', { type: 'button', onclick: () => app.session?.confirmTarget() }, 'Bestätigen');
    this.banner = h('div.banner.panel', { hidden: true, role: 'status' }, this.bannerTitle, this.bannerInfo, this.bannerHint, h('div.banner-btns', this.bannerCancel, this.bannerFire));

    // ---- re-centre (only while the view is panned away from the hero)
    this.centerBtn = h('button.center-btn', { type: 'button', hidden: true, title: 'Ansicht auf dich zentrieren (Pos1)', onclick: (e) => { e.currentTarget.blur(); app.renderer.recenter(); } },
      h('span', 'Zentrieren'), h('kbd', 'Pos1'));

    this.root.append(this.vitals, this.topright, this.boss, this.logEl, this.actionbar, this.centerBtn, this.tip, this.banner);
  }

  mountMinimap(el) { this.topright.append(el); }

  // ---------------------------------------------------------------- per-turn update
  update() {
    const g = this.game;
    if (!g) return;
    const s = g.playerStats();
    const L = this.last;
    // HP
    if (s.hp !== L.hp || s.maxHp !== L.maxHp) {
      const f = Math.max(0, s.hp / s.maxHp);
      this.hpFill.style.transform = `scaleX(${f})`;
      setText(this.hpText, `${s.hp} / ${s.maxHp}`);
      this.hpBar.setAttribute('aria-valuenow', s.hp);
      this.hpBar.setAttribute('aria-valuemax', s.maxHp);
      if (L.hp != null && s.hp < L.hp) {
        this.pulse(this.hpBar, 'hit');
        clearTimeout(this.ghostT);
        this.ghostT = setTimeout(() => { this.hpGhost.style.transform = `scaleX(${f})`; }, 380);
      } else {
        this.hpGhost.style.transform = `scaleX(${f})`;
        if (L.hp != null && s.hp > L.hp + 1) this.pulse(this.hpBar, 'heal');
      }
      setClass(this.hpBar, 'low', f <= 0.3);
      L.hp = s.hp; L.maxHp = s.maxHp;
    }
    // level / xp
    const xpKey = `${s.level}|${s.xp}`;
    if (xpKey !== L.xp) {
      setText(this.lvlText, `Stufe ${s.level}`);
      if (s.xpNext) {
        const f = (s.xp - s.xpPrev) / Math.max(1, s.xpNext - s.xpPrev);
        this.xpFill.style.transform = `scaleX(${Math.max(0, Math.min(1, f))})`;
        setText(this.xpText, `${s.xp - s.xpPrev} / ${s.xpNext - s.xpPrev} EP`);
      } else { this.xpFill.style.transform = 'scaleX(1)'; setText(this.xpText, 'Höchststufe'); }
      L.xp = xpKey;
    }
    setText(this.stDmg, `${s.damage.min}–${s.damage.max}`);
    setText(this.stArm, String(s.armor));
    setText(this.stStr, String(s.str));
    if (s.gold !== L.gold) { setText(this.stGold, String(s.gold)); if (L.gold != null && s.gold > L.gold) this.pulse(this.stGold.parentNode, 'gain'); L.gold = s.gold; }
    // oil
    this.oil = { f: s.oil / s.oilMax, oil: s.oil };
    setText(this.oilText, `${s.oilPct} %`);
    setClass(this.lantern, 'low', s.oilPct <= 25);
    setClass(this.lantern, 'crit', s.oilPct <= 10);
    // statuses
    const stKey = s.statuses.map((x) => `${x.id}:${x.turns}`).join(',');
    if (stKey !== L.st) {
      L.st = stKey;
      const kids = s.statuses.map((x) => {
        const [icon, col] = STATUS_ICON[x.id] || ['icon_xp', '#e8dcc0'];
        return h('span.chip' + (x.bad ? '.bad' : '.good'), { title: `${x.label}: noch ${x.turns} Runden` },
          spriteImg(icon, 16, { color: col }), h('span.chip-label', x.label), h('span.num', String(x.turns)));
      });
      this.statuses.replaceChildren(...kids);
    }
    // depth
    const dKey = `${s.depth}|${s.biome}`;
    if (dKey !== L.depth) {
      setText(this.depthNum, `Tiefe ${s.depth}`);
      setText(this.biomeName, s.biomeName);
      this.root.dataset.biome = s.biome;
      L.depth = dKey;
    }
    // action availability
    const sess = this.app.session;
    const onStairs = sess.onStairs();
    setClass(this.btnDescend, 'ready', onStairs);
    this.btnDescend.disabled = !onStairs;
    const st = g.state;
    const here = g.itemsAt(st.player.x, st.player.y).length > 0;
    setClass(this.btnPick, 'ready', here);
    this.btnPick.disabled = !here;
    // boss
    const boss = g.visibleMonsters().find((m) => m.boss && !m.detectedOnly);
    if (boss) {
      this.boss.hidden = false;
      setText(this.bossName, boss.name);
      this.bossFill.style.transform = `scaleX(${boss.hpFraction})`;
    } else this.boss.hidden = true;
    this.renderLog();
  }

  pulse(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth; // restart animation
    el.classList.add(cls);
  }

  flourish() { this.pulse(this.vitals, 'levelup'); }
  oilWarn() { this.pulse(this.lantern, 'warn'); }

  setAuto(on) {
    setClass(this.btnExplore, 'running', on && this.app.session?.auto?.type === 'explore');
  }

  setMuted(m) {
    this.soundOn.hidden = m; this.soundOff.hidden = !m;
    this.soundBtn.setAttribute('aria-pressed', String(m));
    this.soundBtn.title = m ? 'Ton einschalten (M)' : 'Ton ausschalten (M)';
  }

  // ---------------------------------------------------------------- log
  logChanged() { this.logDirty = true; }

  renderLog() {
    if (!this.logDirty) return;
    this.logDirty = false;
    const log = this.app.session?.log || [];
    const lines = log.slice(-6);
    const nodes = lines.map((l, i) => {
      const age = lines.length - 1 - i;
      const el = h('p.' + (TONE_CLASS[l.tone] || 't-info'), l.text, l.n > 1 ? h('span.rep', ` (×${l.n})`) : null);
      el.style.opacity = String([1, 0.86, 0.68, 0.5, 0.36, 0.24][age] ?? 0.2);
      return el;
    });
    this.logEl.replaceChildren(...nodes);
  }

  // ---------------------------------------------------------------- lantern gauge (per frame)
  frame(now) {
    if (this.root.hidden || !this.oil) return;
    const det = this.app.renderer.detached;
    if (det !== this.lastDetached) { this.lastDetached = det; this.centerBtn.hidden = !det; }
    if (now - (this.lastLantern || 0) < 33) return;
    this.lastLantern = now;
    const cv = this.lanternCv;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const W = 60, H = 84;
    if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const f = Math.max(0, Math.min(1, this.oil.f));
    const t = now / 1000;
    const reduced = this.app.anim.reduced;
    const low = f <= 0.25, crit = f <= 0.1, empty = this.oil.oil <= 0;
    const flick = reduced ? 0 : Math.sin(t * 9.1) * 0.05 + Math.sin(t * 15.7 + 1) * 0.04 + (crit ? Math.max(0, Math.sin(t * 2.3) * Math.sin(t * 3.7)) * -0.3 : 0);
    const pulse = low && !reduced ? 0.5 + 0.5 * Math.sin(t * (crit ? 7 : 3.5)) : 0;
    const gx = 30, gy0 = 25, gy1 = 63, gw = 26;
    // halo
    if (!empty) {
      const hr = 16 + 24 * Math.sqrt(f) * (1 + flick);
      const hg = g.createRadialGradient(gx, 52, 2, gx, 52, hr);
      const col = low ? `rgba(226,${Math.round(84 + 96 * (f / 0.25))},58,` : 'rgba(255,180,84,';
      hg.addColorStop(0, col + (0.5 * (0.4 + f * 0.6) + pulse * 0.25) + ')');
      hg.addColorStop(1, col + '0)');
      g.fillStyle = hg; g.fillRect(0, 0, W, H);
    } else if (!reduced) {
      const hg = g.createRadialGradient(gx, 52, 2, gx, 52, 26);
      hg.addColorStop(0, `rgba(226,84,58,${0.18 + 0.18 * Math.sin(t * 5)})`); hg.addColorStop(1, 'rgba(226,84,58,0)');
      g.fillStyle = hg; g.fillRect(0, 0, W, H);
    }
    const frame = empty ? '#e2543a' : '#9aa3b8';
    // handle
    g.strokeStyle = frame; g.lineWidth = 2.2; g.lineCap = 'round';
    g.beginPath(); g.arc(gx, 12, 7, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
    // cap
    g.fillStyle = '#273049';
    g.beginPath(); g.moveTo(gx - 9, 18); g.lineTo(gx + 9, 18); g.lineTo(gx + 15, gy0); g.lineTo(gx - 15, gy0); g.closePath(); g.fill();
    g.strokeStyle = frame; g.lineWidth = 1.6; g.stroke();
    // glass
    const rr = (x, y, w, hh, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + hh, r); g.arcTo(x + w, y + hh, x, y + hh, r); g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
    rr(gx - gw / 2, gy0, gw, gy1 - gy0, 3);
    g.fillStyle = '#0d1220'; g.fill();
    g.save(); g.clip();
    // liquid light filling the glass to the oil level
    const top = gy1 - (gy1 - gy0) * f;
    if (f > 0) {
      const lg = g.createLinearGradient(0, top, 0, gy1);
      const c1 = low ? '#e2543a' : LIGHT.lamp;
      lg.addColorStop(0, c1 + 'aa'); lg.addColorStop(1, low ? '#7a2a1c' : '#b8642a');
      g.fillStyle = lg; g.fillRect(gx - gw / 2, top, gw, gy1 - top);
      g.fillStyle = low ? '#ff9a7a' : LIGHT.lampCore;
      g.globalAlpha = 0.85; g.fillRect(gx - gw / 2, top, gw, 1.4); g.globalAlpha = 1;
    }
    // flame on the wick
    if (!empty) {
      const fh = (8 + 13 * Math.sqrt(f)) * (1 + flick);
      const fy = gy1 - 4, fw = 4 + 3 * Math.sqrt(f);
      const fg = g.createRadialGradient(gx, fy - fh * 0.35, 0.5, gx, fy - fh * 0.35, fh * 0.9);
      fg.addColorStop(0, 'rgba(255,248,220,1)'); fg.addColorStop(0.35, low ? 'rgba(255,140,80,0.95)' : 'rgba(255,200,110,0.95)'); fg.addColorStop(1, 'rgba(255,120,40,0)');
      g.fillStyle = fg;
      g.beginPath();
      g.moveTo(gx, fy - fh);
      g.quadraticCurveTo(gx + fw * 1.4, fy - fh * 0.35, gx, fy);
      g.quadraticCurveTo(gx - fw * 1.4, fy - fh * 0.35, gx, fy - fh);
      g.fill();
    }
    g.restore();
    // glass bars and frame
    rr(gx - gw / 2, gy0, gw, gy1 - gy0, 3);
    g.strokeStyle = frame; g.lineWidth = 1.8; g.stroke();
    g.globalAlpha = 0.5; g.lineWidth = 1;
    g.beginPath(); g.moveTo(gx - gw / 6, gy0 + 1); g.lineTo(gx - gw / 6, gy1 - 1); g.moveTo(gx + gw / 6, gy0 + 1); g.lineTo(gx + gw / 6, gy1 - 1); g.stroke();
    g.globalAlpha = 1;
    // base
    g.fillStyle = '#273049';
    g.beginPath(); g.moveTo(gx - 15, gy1); g.lineTo(gx + 15, gy1); g.lineTo(gx + 12, gy1 + 8); g.lineTo(gx - 12, gy1 + 8); g.closePath(); g.fill();
    g.strokeStyle = frame; g.lineWidth = 1.6; g.stroke();
  }

  // ---------------------------------------------------------------- tooltip
  tooltip(t, clientPos) {
    if (clientPos) this.mouse = clientPos;
    const g = this.game;
    if (!t || !g || this.app.modalOpen()) { this.tip.hidden = true; this.tipKey = null; return; }
    const lv = g.state.level;
    const i = t.y * lv.width + t.x;
    const key = `${t.x},${t.y},${g.state.turn},${g.state.depth}`;
    if (key !== this.tipKey) {
      this.tipKey = key;
      if (!lv.explored[i]) { this.tip.hidden = true; return; }
      const mon = lv.visible[i] ? g.visibleMonsters().find((m) => m.x === t.x && m.y === t.y && !m.detectedOnly) : null;
      const kids = [];
      if (mon) {
        kids.push(h('div.tip-head', spriteImg(mon.id, 28, {}), h('div', h('strong', mon.name), h('div.tip-sub', `${cap(mon.health)} · ${mon.state}`))));
        kids.push(h('div.bar.tip-bar', h('div.bar-fill', { style: { transform: `scaleX(${mon.hpFraction})` } })));
        if (mon.statuses && mon.statuses.length) kids.push(h('div.tip-sub', mon.statuses.map((s) => s.label).join(', ')));
        kids.push(h('p.tip-desc', mon.description));
      } else {
        const tile = lv.memTiles[i];
        const plain = (tile === 'floor' || tile === 'wall') && !g.itemsAt(t.x, t.y).length && !(lv.memItems[i] && lv.memItems[i].length)
          && !lv.traps.some((tr) => tr.x === t.x && tr.y === t.y && !tr.hidden);
        if (plain) { this.tip.hidden = true; return; }
        kids.push(h('p', g.describeTile(t.x, t.y)));
      }
      this.tip.replaceChildren(...kids);
      this.tip.hidden = false;
    }
    if (this.mouse && !this.tip.hidden) {
      const w = this.tip.offsetWidth, hh = this.tip.offsetHeight;
      let x = this.mouse.x + 16, y = this.mouse.y + 18;
      if (x + w > window.innerWidth - 8) x = this.mouse.x - w - 12;
      if (y + hh > window.innerHeight - 8) y = this.mouse.y - hh - 12;
      this.tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    }
  }

  // ---------------------------------------------------------------- targeting banner
  targetBanner(T, itemNameAcc) {
    if (!T) { this.banner.hidden = true; this.root.classList.remove('targeting'); return; }
    const verb = T.need.purpose === 'throw' ? 'werfen' : 'einsetzen';
    setText(this.bannerTitle, `${cap(itemNameAcc)} ${verb} – wähle ein Ziel`);
    setText(this.bannerHint, this.app.touch ? 'Tippe auf ein Ziel.' : 'Tab wechselt das Ziel · Enter bestätigt · Esc bricht ab');
    this.bannerFire.textContent = T.need.purpose === 'throw' ? 'Werfen' : 'Einsetzen';
    this.banner.hidden = false;
    this.root.classList.add('targeting');
  }
  targetInfo(T, valid, complain) {
    const g = this.game;
    const c = T.cursor;
    const m = g.visibleMonsters().find((x) => x.x === c.x && x.y === c.y && !x.detectedOnly);
    let text;
    if (!T.cands.length && !m) text = 'Kein Gegner in Sicht – wähle ein Feld.';
    else if (m) text = `${m.name} – ${m.health}`;
    else text = 'Freies Feld';
    if (!valid) text += complain ? ' · Dorthin reicht es nicht.' : ' · außer Reichweite oder ohne Sichtlinie';
    setText(this.bannerInfo, text);
    setClass(this.bannerInfo, 'bad', !valid);
    this.bannerFire.disabled = !valid;
  }
}

function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
