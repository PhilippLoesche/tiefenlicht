// Small DOM helpers shared by the UI modules.
import { getSpriteCanvas } from '../art/index.js';

/** h('div.cls#id', {attrs}, ...children) — tiny element factory. */
export function h(sel, attrs, ...kids) {
  const m = /^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i.exec(sel) || [];
  const el = document.createElement(m[1] || 'div');
  for (const part of (m[2] || '').match(/[.#][\w-]+/g) || []) {
    if (part[0] === '.') el.classList.add(part.slice(1));
    else el.id = part.slice(1);
  }
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, kids);
  return el;
}

function append(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

export const $ = (sel, root = document) => root.querySelector(sel);

const urlCache = new Map();
/** Data URL of an art sprite / icon, rendered at 2× (or DPR) for crisp DOM display. */
export function spriteURL(id, size, opts = {}) {
  const scale = Math.max(2, Math.ceil(window.devicePixelRatio || 1));
  const key = `${id}|${size}|${opts.color || ''}|${opts.appearance || ''}|${opts.facing || 1}|${opts.dormant ? 1 : 0}`;
  let url = urlCache.get(key);
  if (!url) {
    const c = getSpriteCanvas(id, size, { ...opts, scale, t: 0 });
    if (c.overTop) {
      // keep the box square for DOM use: crop the overflow area into a padded canvas
      const px = Math.round(size * scale), top = Math.round(c.overTop * px);
      const sq = document.createElement('canvas');
      sq.width = px + top; sq.height = px + top;
      sq.getContext('2d').drawImage(c, top / 2, 0);
      url = sq.toDataURL();
    } else url = c.toDataURL();
    urlCache.set(key, url);
  }
  return url;
}

/** <img> for a sprite/icon. */
export function spriteImg(id, size, opts = {}, cls = 'spr') {
  const img = new Image(size, size);
  img.className = cls;
  img.alt = '';
  img.decoding = 'async';
  img.draggable = false;
  img.src = spriteURL(id, size, opts);
  return img;
}

/** Set textContent only when it changed (avoids layout work). */
export function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}

/** Toggle a class only when needed. */
export function setClass(el, cls, on) {
  if (el.classList.contains(cls) !== !!on) el.classList.toggle(cls, !!on);
}

export const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
