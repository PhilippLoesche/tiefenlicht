// Keyboard (physical key positions via event.code), mouse, touch and wheel.
const DIRS = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0],
  KeyQ: [-1, -1], KeyE: [1, -1], KeyZ: [-1, 1], KeyC: [1, 1],
  Numpad8: [0, -1], Numpad2: [0, 1], Numpad4: [-1, 0], Numpad6: [1, 0],
  Numpad7: [-1, -1], Numpad9: [1, -1], Numpad1: [-1, 1], Numpad3: [1, 1],
};
const PAN_THRESHOLD = 6; // px a left-button / touch press must travel before it becomes a drag

export class Input {
  constructor(app) {
    this.app = app;
    this.lastWait = 0;
    this.down = null;
    this.wheelAcc = 0;
    this.lastWheel = 0;
    window.addEventListener('keydown', (e) => this.onKey(e));
    // audio may only start from a user gesture: any click or tap anywhere counts
    window.addEventListener('pointerdown', () => this.app.gesture(), { capture: true });
    window.addEventListener('keyup', (e) => this.app.session?.releaseKey(e.code));
    window.addEventListener('blur', () => { if (this.app.session) this.app.session.held = null; });
    const cv = app.canvas;
    cv.addEventListener('pointermove', (e) => this.onMove(e));
    cv.addEventListener('pointerleave', () => { if (!this.down) { this.app.session?.setHover(null); this.app.hud.tooltip(null); } });
    cv.addEventListener('pointerdown', (e) => this.onDown(e));
    cv.addEventListener('pointerup', (e) => this.onUp(e));
    cv.addEventListener('pointercancel', (e) => this.endDrag(e));
    cv.addEventListener('lostpointercapture', (e) => { if (this.down && this.down.id === e.pointerId) this.endDrag(e); });
    // the right button pans; its click action happens on release (see onUp)
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('auxclick', (e) => e.preventDefault());
    cv.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
  }

  inGame() { return this.app.screen === 'game' && this.app.session; }

  onKey(e) {
    const app = this.app;
    app.gesture();
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (app.screen !== 'game') { app.titleKey?.(e); return; }
    const s = app.session;
    if (!s) return;
    if (app.overlays.isOpen()) {
      if ((e.key === '?' || e.code === 'F1') && app.overlays.top().o.kind === 'handbook') { e.preventDefault(); app.overlays.close(); }
      return;
    }
    if (s.ended) return;
    const code = e.code, key = e.key;
    const dir = DIRS[code];
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(key)) return;

    // any key stops a running travel / explore
    if (s.auto) { e.preventDefault(); s.stopAuto(); return; }

    // targeting mode
    if (s.targeting) {
      if (code === 'Tab') { e.preventDefault(); s.cycleTarget(e.shiftKey ? -1 : 1); }
      else if (dir) { e.preventDefault(); s.moveCursor(dir[0], dir[1]); }
      else if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space' || code === 'KeyF' || code === 'Numpad5') { e.preventDefault(); s.confirmTarget(); }
      else if (code === 'Escape') { e.preventDefault(); s.cancelTarget(); }
      else if (code === 'Home' || code === 'KeyV') { e.preventDefault(); app.renderer.recenter(); }
      return;
    }

    // let focused HUD buttons handle activation keys themselves
    const t = e.target;
    const onControl = t && t !== document.body && (t.tagName === 'BUTTON' || t.tagName === 'INPUT');
    if (onControl && (code === 'Enter' || code === 'Space' || code === 'NumpadEnter' || code === 'Tab')) return;

    if (dir) {
      e.preventDefault();
      if (e.repeat) return; // own repeat timer gives a steady pace
      if (onControl) t.blur();
      s.pressDirection(dir[0], dir[1], code);
      return;
    }
    let handled = true;
    switch (code) {
      case 'Space': case 'Numpad5': case 'Period': case 'NumpadDecimal': case 'Clear': {
        const now = performance.now();
        if (e.repeat && now - this.lastWait < 100) break;
        this.lastWait = now;
        s.wait();
        break;
      }
      case 'KeyG': s.pickup(); break;
      case 'KeyX': s.startExplore(); break;
      case 'KeyR': s.rest(); break;
      case 'Enter': case 'NumpadEnter': s.descend(); break;
      case 'KeyI': app.inventory.toggle(); break;
      case 'Home': case 'KeyV': app.renderer.recenter(); break;
      case 'KeyM': app.toggleMute(); break;
      case 'KeyJ': app.overlays.handbook('journal'); break;
      case 'F1': app.overlays.handbook('help'); break;
      case 'Escape':
        if (app.narrow && app.inventory.open) app.inventory.toggle(false);
        else app.overlays.menu();
        break;
      case 'NumpadAdd': app.zoom(1); break;
      case 'NumpadSubtract': app.zoom(-1); break;
      default:
        handled = false;
    }
    if (!handled) {
      if (key === '?') { app.overlays.handbook('help'); handled = true; }
      else if (key === '+' || key === '=') { app.zoom(1); handled = true; }
      else if (key === '-' || key === '_') { app.zoom(-1); handled = true; }
      else if (/^Digit[1-9]$/.test(code) && !e.shiftKey) { app.inventory.quick(+code.slice(5)); handled = true; }
    }
    if (handled) e.preventDefault();
  }

  onMove(e) {
    if (!this.inGame()) return;
    const d = this.down;
    if (d && d.id === e.pointerId) {
      if (!d.panning && Math.hypot(e.clientX - d.x, e.clientY - d.y) > (d.type === 'mouse' ? PAN_THRESHOLD : PAN_THRESHOLD + 4)) this.startPan(d);
      if (d.panning) {
        this.app.renderer.panBy(e.clientX - d.lx, e.clientY - d.ly);
        d.lx = e.clientX; d.ly = e.clientY;
        return;
      }
    }
    if (e.pointerType === 'mouse') this.app.setTouch(false);
    this.hoverAt(e.clientX, e.clientY, e.pointerType);
  }

  hoverAt(cx, cy, pointerType) {
    const s = this.app.session;
    const t = this.app.renderer.tileAtClient(cx, cy);
    if (s.targeting) { s.hoverTarget(t); return; }
    if (pointerType !== 'mouse') return;
    const prev = s.hoverTile;
    if (!prev || prev.x !== t.x || prev.y !== t.y) s.setHover(t);
    this.app.hud.tooltip(s.hoverTile, { x: cx, y: cy });
  }

  onDown(e) {
    this.app.gesture();
    if (e.pointerType === 'touch' || e.pointerType === 'pen') this.app.setTouch(true);
    if (!this.inGame() || this.down) return; // a second finger never starts anything
    if (e.button === 1) e.preventDefault(); // no autoscroll on middle click
    const panNow = e.button === 1 || e.button === 2;
    if (e.button !== 0 && !panNow) return;
    this.down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, id: e.pointerId, button: e.button, panning: false, type: e.pointerType };
    try { this.app.canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (panNow) this.startPan(this.down);
  }

  startPan(d) {
    d.panning = true;
    const s = this.app.session;
    s?.stopAuto();
    if (s) { s.hoverTile = null; this.app.renderer.hover = null; this.app.renderer.path = null; }
    this.app.hud.tooltip(null);
    this.app.canvas.style.cursor = 'grabbing';
  }

  endDrag(e) {
    const d = this.down;
    this.down = null;
    this.app.canvas.style.cursor = '';
    try { if (e && this.app.canvas.hasPointerCapture?.(e.pointerId)) this.app.canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    return d;
  }

  onUp(e) {
    if (!this.down || this.down.id !== e.pointerId) return;
    const d = this.endDrag(e);
    if (!this.inGame()) return;
    const s = this.app.session;
    if (d.panning) { if (d.type === 'mouse') this.hoverAt(e.clientX, e.clientY, 'mouse'); return; } // a drag never travels
    if (this.app.overlays.isOpen() || s.ended) return;
    if (d.button === 2) { if (s.targeting) s.cancelTarget(); else s.stopAuto(); return; } // plain right click
    if (d.button !== 0) return;
    if (s.auto) { s.stopAuto(); return; }
    const t = this.app.renderer.tileAtClient(e.clientX, e.clientY);
    if (this.app.narrow && this.app.inventory.open) { this.app.inventory.toggle(false); return; }
    s.clickTile(t.x, t.y);
  }

  onWheel(e) {
    if (!this.inGame()) return;
    e.preventDefault();
    const now = performance.now();
    if (now - this.lastWheel > 400) this.wheelAcc = 0;
    this.lastWheel = now;
    this.wheelAcc += e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
    if (Math.abs(this.wheelAcc) >= 90) {
      this.app.zoom(this.wheelAcc < 0 ? 1 : -1, { x: e.clientX, y: e.clientY });
      this.wheelAcc = 0;
    }
  }
}

/** Human-readable labels for physical keys (layout aware when the browser can tell). */
export async function keyLabels() {
  const base = { KeyV: 'V', KeyW: 'W', KeyA: 'A', KeyS: 'S', KeyD: 'D', KeyQ: 'Q', KeyE: 'E', KeyZ: 'Y', KeyC: 'C', KeyG: 'G', KeyX: 'X', KeyR: 'R', KeyI: 'I', KeyM: 'M' };
  try {
    const map = await navigator.keyboard?.getLayoutMap?.();
    if (map) for (const k of Object.keys(base)) { const v = map.get(k); if (v && /^\p{L}$/u.test(v)) base[k] = v.toUpperCase(); }
  } catch { /* not supported */ }
  return base;
}
