# Tiefenlicht engine — API reference

Headless, pure ES-module game engine. No DOM, timers, `Math.random` or storage.
Everything the UI needs is reachable from `js/engine/index.js`.

```js
import { Game, codex, MONSTERS, TILES, DIRS } from './js/engine/index.js';

const game = Game.create({ seed: 'any string', options: { autoPickup: true } });
render(game.startEvents);                 // arrival log lines of floor 1
const events = game.act({ type: 'move', dx: 1, dy: 0 });
localStorage.save = JSON.stringify(game.serialize());
const loaded = Game.deserialize(JSON.parse(localStorage.save));
```

## Conventions

* **Coordinates:** `x` → right, `y` → down, origin top-left. Tile index `i = y * width + x`.
  Map is 60×40 (`level.width/height`). Directions are `dx, dy ∈ {-1,0,1}`; `DIRS` lists the 8.
* **Player uid is `0`.** Monsters and items have unique positive `uid`s.
* **Text:** every player-facing string is German and comes in `log` events or query helpers.
  Never show `item.kind` of unidentified items — always use `game.itemName(item)`.
* **Turns:** `act()` either consumes game time (`game.lastActionTookTurn === true`) or is rejected
  (explanatory `log` with tone `warn`, nothing else changes). `need_target` responses also take no time.
* **Determinism:** same seed + same actions ⇒ same events. `serialize()` → `deserialize()` → continue
  gives an identical event stream. Level layouts depend only on `(seed, depth)`.
* **Doors:** no diagonal moves or attacks into/out of a doorway (open or closed). Walking into a closed door opens it (1 turn).
* `game.state` is plain data; read it freely, but only mutate via `act()` / `setOption()`.

## Creating, saving, loading

| Call | Notes |
|---|---|
| `Game.create({seed, options})` | `seed`: string/number (default `'tiefenlicht'`). `options.autoPickup` (default `true`). Returns a game; `game.startEvents` = events of entering floor 1. |
| `game.serialize()` | Plain JSON-able object containing `version` (currently `1`). |
| `Game.deserialize(obj)` | Throws on unknown version. |
| `game.setOption('autoPickup', bool)` | |

## State (`game.state`) — main fields

```
version, seed, status: 'playing'|'dead'|'won', depth (1..10), turn, tick
options: { autoPickup }
player: { uid:0, x, y, hp, maxHp, str, level, xp, gold, oil, oilMax, statuses:{id:turnsLeft},
          inventory: Item[] (≤20 entries, stacks count once, equipped items stay here),
          equipment: { weapon, armor, ring1, ring2 }  // item uids or null }
level:  { depth, biome:'stollen'|'pilzgrotte'|'hallen'|'herz', width, height,
          tiles: string[]          // current tile ids
          memTiles: (string|null)[] // remembered tile ids (null = unknown) — draw these for explored, not-visible tiles
          explored: 0|1[], visible: 0|1[], light: number[] (0..1 for visible tiles, else 0)
          memItems: { [index]: ItemSnapshot[] } // last-seen items on not-currently-visible tiles
          items: Item[] (with x,y), monsters: Monster[], traps: Trap[], stairs: {x,y}|null }
ident:  { potion|scroll|wand|ring: { appearance: {kind: appearanceId}, known: {kind: true} } }
stats:  { kills:{id:n}, goldFound, maxDepth, cause, darkTurns, potions, scrolls }
```

Render rules:
* Draw `tiles[i]` + `light[i]` where `visible[i]`; draw `memTiles[i]` dimmed where `explored[i] && !visible[i]`.
* Items: `level.items` on visible tiles (`game.visibleItems()`), `memItems` elsewhere.
* Monsters: **only** `game.visibleMonsters()` (respects darkness, the Grubengeist's 3-tile visibility and the
  Gespür potion: `detectedOnly: true` entries show a position but nothing else). Never draw `level.monsters` directly.
* Traps: only those with `hidden === false`. A trap is a floor tile + trap object (`kind` = sprite id).

Tile ids: `wall floor door_closed door_open stairs_down brazier_lit brazier_out fungus`.
`brazier_*` block movement but not sight; `brazier_lit` and `fungus` are static light sources.

Item: `{uid, cat, kind, count, appearance?, ench?, known?, charges?, x?, y?, ignored?}`
cat ∈ `weapon armor thrown potion scroll wand ring oil gold artifact`. `appearance` = potion colour id /
scroll rune word / wand material id / ring gem id (constant per kind within a run).
`game.itemVisual(item)` → `{sprite, tint, kind, cat}` (sprite = kind for weapons/armor/etc., or the
category for potion/scroll/wand/ring with `tint` = appearance id).

Monster: `{uid, id, x, y, hp, maxHp, ai:'asleep'|'dormant'|'wander'|'hunt'|'flee', statuses}`.

## Actions — `game.act(action) → GameEvent[]`

| Action | Fields | Notes |
|---|---|---|
| `move` | `dx, dy` | Moves; bumping a monster attacks; bumping a closed door opens it; bumping `brazier_lit` refills the lamp (once). Confusion may randomise the direction. |
| `wait` (alias `search`) | | One turn; better chance to spot hidden traps. |
| `rest` | `turns?` | Without `turns`: rest until HP full (max 400 turns), stops on any interrupt. Refused with hostiles in view or with an empty lamp. Ends with a `rested` event. |
| `pickup` | `itemUid?` | All items on the tile, or one. Gold never needs a slot. |
| `drop` | `itemUid, count?` | Drops (and unequips). Dropped items are marked `ignored` (no auto-pickup / auto-explore). |
| `use` | `itemUid, target?:{x,y}, targetUid?` | Drink / read / zap / refuel / throw knives / toggle equip. Wands & knives need `target` (tile in line of sight); a *known* scroll of identification needs `targetUid` — otherwise a single `need_target` event is returned. An *unknown* identification scroll picks a random unidentified item. |
| `equip` / `unequip` | `itemUid` (unequip also accepts `slot`) | Weapons, armor, two rings. |
| `throw` | `itemUid, target:{x,y}` | Only Wurfmesser. Range 8. Knife may break; otherwise lands on the floor. |
| `descend` | | Only on `stairs_down`. |
| `travel` | `x, y` | **One step** along `findPath(x,y)`. Emits `interrupt` `arrived` at the goal; `blocked` (no turn) if a monster stands on the next step. Goal may be a closed door or lit brazier (last step bumps it). |
| `explore` | `ignoreMonsters?` | **One step** of auto-explore. If nothing to do / unsafe: `log` + `interrupt` (`explore_done` or `unsafe`), no turn. |

**Multi-step loop for the UI** (travel, explore): call `act` repeatedly (with a small delay for
animation) and stop when the returned events contain an `interrupt`, a `death`/`victory`, or
`game.lastActionTookTurn === false`.

Targeting flow: `act({type:'use', itemUid})` → `[{type:'need_target', target:'tile'|'item', purpose, range, filter}]`
→ UI lets the player pick (use `targetsInView()` / `canTarget(x,y,range)`) → `act({type:'use', itemUid, target})`
or `{..., targetUid}`. `inventoryView()[i].needsTarget` tells you in advance.

## Events

All events have `type`. Order = order of happening. Positions are `{x,y}`.

| type | fields |
|---|---|
| `log` | `text, tone: 'info'|'good'|'bad'|'warn'|'loot'|'flavor'` |
| `move` | `uid, id ('player' or monster id), from, to, leap?, teleport?` (monster moves only when seen) |
| `attack` | `attacker, attackerKind, target, targetKind, result:'hit'|'miss'|'crit', damage, killed, ranged?` (uids; kind = `'player'` or monster id) |
| `damage` | `uid, amount, hp, maxHp, kind` — every HP loss (melee, thrown, fire, blitz, frost, poison, cold, trap, fall). Use for floating numbers. |
| `heal` | `uid, amount, hp, maxHp` |
| `die` | `uid, id, x, y, byPlayer` (monster death) |
| `spawn` | `uid, id, x, y` (summons, splits, wandering arrivals — only when seen) |
| `projectile` | `kind: 'wurfmesser'|'blitz'|'frost'|'verbannung'|'glutball'|'feuerbolzen', from, to, path?, by?` |
| `effect` | `kind, at?, from?, to?, radius?, area?, uid?` — kinds: `explosion` (area), `heal`, `strength`, `teleport`, `leap`, `split`, `summon`, `spores`, `poison`, `cold`, `dart`, `pit`, `alarm`, `flash`, `fear`, `reveal`, `refuel`, `shard` |
| `status` | `uid, status, change:'applied'|'expired', turns?` |
| `pickup` | `uid, cat, kind, count, appearance?` |
| `drop` | `uid, cat, kind, count, x, y` |
| `use` | `uid, cat, kind, appearance?` |
| `equip` / `unequip` | `uid, slot, cat?, kind?` |
| `identify` | `cat, kind, appearance, uid?` |
| `gold` | `amount` (negative when stolen), `total, by?` |
| `oil` | `from, to, max, reason: 'refuel'|'brazier'|'drain', by?` (normal burning emits nothing — read `player.oil`) |
| `light` | `radius, oil, max` — lamp radius band changed |
| `levelup` | `level, maxHp` |
| `trap` | `kind, x, y` (triggered) |
| `trap_found` | `kind, x, y` |
| `door` | `x, y, open, by` |
| `tile` | `x, y, tile` (visible tile changed) |
| `descend` | `depth, biome, via: 'stairs'|'pit'` |
| `noticed` | `uid, id` (monster started hunting you) |
| `interrupt` | `reason` ∈ `monster_appeared` (`uid,id`), `noticed`, `damaged`, `status`, `trap`, `trap_found`, `oil_low`, `lamp_out`, `stolen`, `arrived`, `blocked`, `explore_done`, `unsafe` |
| `rested` | `turns` |
| `need_target` | `itemUid, target:'tile'|'item', purpose:'zap'|'throw'|'identify', range, filter` |
| `death` | `cause` (German, e.g. `"Von einer Stollenratte getötet"`) |
| `victory` | |

## Query helpers

| Call | Returns |
|---|---|
| `playerStats()` | `{hp, maxHp, str, baseStr, level, xp, xpNext, xpPrev, gold, depth, biome, biomeName, turn, accuracy, damage:{min,max}, armor, evasion, lightRadius, oil, oilMax, oilPct, speed, speedLabel, statuses:[{id,label,turns,bad}], weapon, armorName, inventoryUsed, inventorySlots}` |
| `inventoryView()` | `[{uid, cat, count, name, equipped:slot|null, unidentified, visual, needsTarget:'tile'|'item'|null}]` |
| `itemName(item, {case:'nom'|'acc'|'dat', article:'def'|'indef'|'none', count})` | e.g. `"den azurblauen Trank"`, `"3 Wurfmesser"` |
| `itemDescription(item)` | German description with known stats or "unbekannt" phrasing |
| `itemVisual(item)` | `{sprite, tint, kind, cat}` |
| `describeTile(x, y)` | German hover text for what is seen/remembered there |
| `visibleMonsters()` | `[{uid, id, x, y, detectedOnly, ...monsterInfo}]` |
| `visibleItems()` | floor items on visible tiles |
| `monsterInfo(uid)` | `{name, displayName, description, health ('unverletzt'…'dem Tode nah'), hpFraction, state ('schläft', 'jagt dich', …), ai, boss, statuses}` |
| `targetsInView()` | seen monsters sorted by distance: `{uid, id, x, y, dist, los, ...monsterInfo}` |
| `canTarget(x, y, range)` | LOS + range check for wands/throwing |
| `findPath(x, y)` | `[{x,y}, ...]` over explored tiles (avoids known traps where possible), `[]` if already there, `null` if unknown/unreachable |
| `autoExplore({ignoreMonsters})` | `{ok:true, dx, dy, x, y, goal:'frontier'|'item'}` or `{ok:false, code:'unsafe'|'explore_done', reason}` |
| `itemsAt(x, y)`, `equipped(slot)`, `lightRadius()`, `isVisible(x,y)` | |
| `runSummary()` | `{status, won, seed, depth, maxDepth, turns, kills, killList:[{id,name,count}], totalKills, gold, goldFound, level, xp, cause, causeText, score, darkTurns, potionsDrunk, scrollsRead}` |
| `codex()` (module export) | `{monsters, items, traps, tiles}` with German names + one-line descriptions |

Also exported: `MONSTERS, WEAPONS, ARMORS, POTIONS, SCROLLS, WANDS, RINGS, TILES, TRAPS, STATUSES, BIOMES,
POTION_COLORS, WAND_MATERIALS, RING_GEMS`, grammar helpers `np, cap, contract, noun, adj`.

## Rules in brief (for help screens)

* **Lamp:** 1000 oil, burns 1/turn (Ring der Sparsamkeit: ½). Radius 7 (>25 %), 5 (≤25 %), 3 (≤10 %), 1 (empty).
  Weitsicht ring +2, Finsternis potion → 1. Ölflasche +350. Lit Glutbecken: full refill once.
  Empty lamp: no regeneration, 1 damage every 4 turns. Visible = in line of sight **and** lit
  (lamp or static light: Glutbecken radius 5, Leuchtpilze radius 2).
* **Time:** energy system; normal speed 10, 100 energy per action. Haste ×2, slow ½.
* **Melee:** hit chance = clamp(accuracy − evasion, 10, 95) %; sleeping/stunned/frozen targets are always hit
  with triple crit chance. Player accuracy = 70 + 3·(level−1) + weapon bonus + 5·enchantment.
  Damage = weapon dice + enchantment + (Stärke − 11); crit ×2; armor soaks `rand(0..armor)`.
  Player evasion = 5 + level (+10 haste). Monsters: own acc/eva/dice; armor may absorb a hit fully.
* **Levels:** XP thresholds in `XP_TABLE`, cap 15; each level +3–4 max HP, +3 accuracy.
* **Known traps** are stepped over safely 85 % of the time; travel/explore avoid them if possible.
* **Score** = gold + 100·deepest floor + XP (+5000 for victory).
