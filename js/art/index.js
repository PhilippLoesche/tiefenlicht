/**
 * Tiefenlicht — procedural art module (Canvas 2D, no assets).
 *
 * Everything is drawn in code into a size×size box. Internally the box is a
 * normalized unit space, authored on a 100-step grid (0..100 ≙ 0..1).
 * Tiles are drawn at "fully lit" brightness; the renderer multiplies a light map.
 *
 * Exports
 *   BIOMES                         per-biome palettes: {id,name,depths,ambient,fog,accent,...tile colours}
 *   BIOME_IDS                      ['stollen','pilzgrotte','hallen','herz']
 *   LIGHT                          light colours: {lamp,lampCore,brazier,fungus,sunshard,rune,ghost,corona}
 *   PAL                            core palette
 *   TILE_KINDS, SPRITE_IDS, MONSTER_IDS, ITEM_IDS, ICON_IDS, APPEARANCES
 *   MASK                           neighbour bits for wall masks {N:1,E:2,S:4,W:8} (bit set = neighbour is wall)
 *
 *   drawTile(ctx, kind, x, y, size, {biome, seed, t, faceSouth, mask})
 *   drawSprite(ctx, id, x, y, size, {t, facing, appearance, dormant, color, scale})
 *   isAnimated(kindOrId) → boolean
 *   animPeriod(kindOrId) → loop period in seconds (0 if static)
 *   spriteOverflow(id) → fraction of size the sprite may extend above its box (lichtfresser)
 *   getTileCanvas(kind, size, {biome, seed, t, faceSouth, mask, scale}) → canvas (size*scale px square)
 *   getSpriteCanvas(id, size, {t, facing, appearance, dormant, color, scale}) → canvas;
 *        canvas.overTop = extra height fraction above the box (draw at y - overTop*size)
 *   blitTile(ctx, kind, x, y, size, opts) / blitSprite(ctx, id, x, y, size, opts)  cached convenience draws
 *   clearCache(), cacheStats()
 *   appearanceColor(category, appearance) → hex
 *   tileVariant(kind, seed) → variant index actually used for that seed
 *
 * Animated things are cached too: getTile/SpriteCanvas quantize t to ~12 frames/s
 * over the item's loop period, so the renderer may always use the cached path.
 */
import { penDraw, contactShadow, INK } from './core.js';
import { PAL, LIGHT, BIOMES, BIOME_IDS } from './palette.js';
import { TILE_KINDS, TILE_ANIM, MASK, drawTile, tileVariant } from './tiles.js';
import { CREATURES, MONSTER_IDS } from './creatures.js';
import { ITEMS, ITEM_IDS, APPEARANCES, appearanceColor } from './items.js';
import { ICONS, ICON_IDS, drawIcon } from './icons.js';

export { PAL, LIGHT, BIOMES, BIOME_IDS, TILE_KINDS, MASK, MONSTER_IDS, ITEM_IDS, ICON_IDS, APPEARANCES, appearanceColor, drawTile, tileVariant };

const SPRITES = { ...CREATURES, ...ITEMS };
export const SPRITE_IDS = ['hero', ...MONSTER_IDS, ...ITEM_IDS];
const OUTLINE = 3.4;
const FPS = 12;

export function isAnimated(id) { return !!(TILE_ANIM[id] || SPRITES[id]?.anim); }
export function animPeriod(id) { return TILE_ANIM[id] || SPRITES[id]?.anim || 0; }
export function spriteOverflow(id) { return SPRITES[id]?.over || 0; }

function makeCanvas(w, h) {
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  return new OffscreenCanvas(w, h);
}

function renderSprite(ctx, def, x, y, size, opts) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(size / 100, size / 100);
  const sh = def.shadow;
  if (sh) {
    ctx.save(); ctx.translate(sh[0], sh[1]); if (sh[5]) ctx.rotate(sh[5]);
    contactShadow(ctx, 0, 0, sh[2], sh[3], sh[4] ?? 0.38); ctx.restore();
  }
  const facing = opts.facing === -1 ? -1 : 1;
  if (facing < 0) { ctx.translate(100, 0); ctx.scale(-1, 1); }
  penDraw(ctx, def.draw, { t: opts.t || 0, appearance: opts.appearance, dormant: !!opts.dormant }, facing, OUTLINE);
  ctx.restore();
}

let scratch = null;
function getScratch(w, h) {
  if (!scratch) scratch = makeCanvas(w, h);
  if (scratch.width < w || scratch.height < h) { scratch.width = Math.max(w, scratch.width); scratch.height = Math.max(h, scratch.height); }
  const c = scratch.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, scratch.width, scratch.height);
  return c;
}

const warned = new Set();
function drawMissing(ctx, id, x, y, size) {
  if (!warned.has(id)) { warned.add(id); console.warn('[art] unknown id', id); }
  ctx.save(); ctx.strokeStyle = '#ff00ff'; ctx.lineWidth = Math.max(1, size / 16);
  ctx.strokeRect(x + size * 0.2, y + size * 0.2, size * 0.6, size * 0.6);
  ctx.beginPath(); ctx.moveTo(x + size * 0.2, y + size * 0.2); ctx.lineTo(x + size * 0.8, y + size * 0.8); ctx.stroke(); ctx.restore();
}

/**
 * Draw hero / monster / item / icon into the size×size box at (x,y), transparent background.
 * opts: { t, facing (-1|1), appearance, dormant, color (icons), scale (icons/translucent: backing resolution) }
 */
export function drawSprite(ctx, id, x, y, size, opts = {}) {
  if (ICONS[id]) {
    const c = getSpriteCanvas(id, size, opts);
    ctx.drawImage(c, x, y, size, size);
    return;
  }
  const def = SPRITES[id];
  if (!def) return drawMissing(ctx, id, x, y, size);
  if (def.alpha) {
    const s = opts.scale || 1, px = Math.ceil(size * s), over = def.over || 0, top = Math.ceil(px * over);
    const sc = getScratch(px, px + top);
    renderSprite(sc, def, 0, top, px, opts);
    ctx.save(); ctx.globalAlpha *= def.alpha;
    ctx.drawImage(scratch, 0, 0, px, px + top, x, y - top / s, size, size + top / s);
    ctx.restore();
    return;
  }
  renderSprite(ctx, def, x, y, size, opts);
}

// ------------------------------------------------------------------ caches
const tileCache = new Map();
const spriteCache = new Map();
const frameOf = (period, t) => { const n = Math.max(8, Math.round(period * FPS)); return [((Math.floor(((t || 0) % period + period) % period / period * n)) % n), n]; };

/** Memoized tile canvas (size*scale px). Key covers biome, variant, faceSouth, mask, animation frame. */
export function getTileCanvas(kind, size, opts = {}) {
  const scale = opts.scale || 1, px = Math.max(1, Math.round(size * scale));
  const biome = BIOMES[opts.biome] ? opts.biome : 'stollen';
  const v = tileVariant(kind, opts.seed || 0);
  const isWall = kind === 'wall';
  const face = isWall && opts.faceSouth ? 1 : 0;
  const mask = isWall ? (opts.mask == null ? -1 : opts.mask & 15) : 0;
  const per = TILE_ANIM[kind] || 0;
  let frame = 0, n = 1;
  if (per) [frame, n] = frameOf(per, opts.t);
  const key = `${kind}|${biome}|${v}|${face}|${mask}|${frame}|${px}`;
  let c = tileCache.get(key);
  if (!c) {
    c = makeCanvas(px, px);
    drawTile(c.getContext('2d'), kind, 0, 0, px, { biome, seed: opts.seed || 0, faceSouth: !!face, mask: mask < 0 ? undefined : mask, t: per ? (frame / n) * per : 0 });
    tileCache.set(key, c);
  }
  return c;
}

/** Memoized sprite/icon canvas. canvas.overTop = fraction of `size` extending above the box. */
export function getSpriteCanvas(id, size, opts = {}) {
  const scale = opts.scale || 1, px = Math.max(1, Math.round(size * scale));
  const icon = !!ICONS[id];
  const def = SPRITES[id];
  const facing = !icon && opts.facing === -1 ? -1 : 1;
  const ap = (id === 'potion' || id === 'wand' || id === 'ring') ? (opts.appearance || '') : '';
  const dormant = id === 'steinwaechter' && opts.dormant ? 1 : 0;
  const color = icon ? (opts.color || PAL.bone) : '';
  const per = def?.anim || 0;
  let frame = 0, n = 1;
  if (per) [frame, n] = frameOf(per, opts.t);
  const key = `${id}|${px}|${facing}|${ap}|${dormant}|${color}|${frame}`;
  let c = spriteCache.get(key);
  if (!c) {
    const over = def?.over || 0, top = Math.ceil(px * over);
    c = makeCanvas(px, px + top);
    const g = c.getContext('2d');
    if (icon) {
      g.save(); g.scale(px / 100, px / 100); drawIcon(g, id, color); g.restore();
    } else if (def) {
      renderSprite(g, def, 0, top, px, { t: per ? (frame / n) * per : 0, facing, appearance: ap || undefined, dormant });
    } else drawMissing(g, id, 0, 0, px);
    c.overTop = top / px;
    c.alpha = def?.alpha || 1;
    spriteCache.set(key, c);
  }
  return c;
}

/** Cached tile draw. */
export function blitTile(ctx, kind, x, y, size, opts = {}) {
  ctx.drawImage(getTileCanvas(kind, size, opts), x, y, size, size);
}
/** Cached sprite draw (handles overflow and translucency). */
export function blitSprite(ctx, id, x, y, size, opts = {}) {
  const c = getSpriteCanvas(id, size, opts);
  const o = c.overTop || 0;
  if (c.alpha !== 1) { ctx.save(); ctx.globalAlpha *= c.alpha; }
  ctx.drawImage(c, x, y - o * size, size, size * (1 + o));
  if (c.alpha !== 1) ctx.restore();
}

export function clearCache() { tileCache.clear(); spriteCache.clear(); }
export function cacheStats() { return { tiles: tileCache.size, sprites: spriteCache.size }; }
