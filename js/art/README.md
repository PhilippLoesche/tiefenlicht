# Tiefenlicht art module (`web/js/art/`)

Procedural Canvas 2D art. No assets, no fonts, no dependencies. Import `index.js`; the import has no side effects beyond creating empty caches.

```js
import * as ART from './js/art/index.js';
```

## Files
| file | content |
|---|---|
| `index.js` | public API: dispatch, caches, re-exports |
| `core.js` | colour maths, seeded RNG, Path2D builders, the `Pen` (under-glow / ink / colour passes) |
| `palette.js` | `PAL`, `LIGHT`, `BIOMES` |
| `tiles.js` | all tiles per biome |
| `creatures.js` | hero + monsters |
| `items.js` | items, `APPEARANCES`, `appearanceColor` |
| `icons.js` | monochrome HUD icons |

## Drawing
- `drawTile(ctx, kind, x, y, size, {biome, seed, t, faceSouth, mask})` draws into the `size×size` box at `(x, y)`. The output depends only on the opts: `seed` picks a variant (`tileVariant(kind, seed)`), with 8 for floor, 4 for wall and 3 for fungus.
  - `biome`: `stollen | pilzgrotte | hallen | herz`. Unknown biomes fall back to `stollen`.
  - Walls: `faceSouth: true` draws the wall top plus a lit south face. `mask` holds the neighbour bits `MASK = {N:1,E:2,S:4,W:8}`, where a set bit means that neighbour is a wall. Edges that face open ground get a rim. If you omit `mask`, the wall is treated as surrounded by walls, except the south side when it has a face.
- `drawSprite(ctx, id, x, y, size, {t, facing, appearance, dormant, color, scale})` draws on a transparent background with a contact shadow. Sprites face right by default; pass `facing: -1` to mirror them.
  - `appearance` sets the look of `potion`, `wand` and `ring` (see `APPEARANCES`).
  - `dormant: true` applies to `steinwaechter` (grey statue, no glow).
  - `color` sets the colour of `icon_*` ids. The default is bone.
  - `lichtfresser` extends up to 38 % of `size` above its box (`spriteOverflow(id)`).
  - `grubengeist` is drawn at 80 % opacity.
- Tiles are drawn at full brightness with mid-range values. Multiply your light map on top. Use `BIOMES[b].ambient` for unlit darkness, `BIOMES[b].fog` to tint remembered tiles, and `LIGHT.*` for the colours of light sources.

## Caching (use this in the renderer)
- `getTileCanvas(kind, size, opts)` and `getSpriteCanvas(id, size, opts)` return memoized canvases of `size*scale` px. Pass `opts.scale = devicePixelRatio` for crisp output. A sprite canvas also carries:
  - `canvas.overTop`: the fraction of `size` it extends above the box.
  - `canvas.alpha`: the opacity to apply when you draw it.
- `blitTile(ctx, kind, x, y, size, opts)` and `blitSprite(ctx, id, x, y, size, opts)` wrap these calls and handle overflow and alpha. 700 cached tile blits take about 2 ms.
- Animated content can be cached too. `t` is quantized to about 12 frames per second over each loop period (`animPeriod(id)`).
- `clearCache()` empties the caches; call it when the device pixel ratio or tile size changes. `cacheStats()` returns the cache sizes.

## Animated ids (`isAnimated`)
Tiles: `brazier_lit` (1.2 s loop), `fungus` (3 s).
Sprites: `hero` (lantern flicker, 1.2 s), `dochtmotte` (1.6 s), `grubengeist` (2.4 s), `aschepriester` (1.4 s), `lichtfresser` (6 s), `sonnenscherbe` (2 s).

## Lists
`TILE_KINDS`, `SPRITE_IDS` (hero, monsters and items), `MONSTER_IDS`, `ITEM_IDS`, `ICON_IDS`, `BIOME_IDS`, `APPEARANCES`. Call `appearanceColor(category, appearance)` to get the hex colour for a UI swatch.

Unknown ids draw a magenta placeholder and log one warning.

Gallery: `web/dev/gallery.html`.
