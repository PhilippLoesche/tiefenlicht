// Content tables for Tiefenlicht. All ids are fixed ASCII strings (the art and
// audio modules key on them); all player-facing text is German.

import { noun, adj } from './grammar.js';

export const MAP_W = 60;
export const MAP_H = 40;
export const MAX_DEPTH = 10;
export const INVENTORY_SLOTS = 20;
export const MAX_LEVEL = 15;

// ---------------------------------------------------------------- lamp / oil
export const OIL_MAX = 1000;
export const OIL_FLASK = 350;
/** Oil burned per game turn (halved by the ring of thrift). */
export const OIL_BURN = 1;
/** Turns between cold damage ticks while the lamp is empty. */
export const COLD_INTERVAL = 4;

/** Lamp radius from oil fraction (before ring/potion modifiers). */
export function lampRadiusFor(oil, max) {
  if (oil <= 0) return 1;
  const f = oil / max;
  if (f > 0.25) return 7;
  if (f > 0.10) return 5;
  return 3;
}

// ---------------------------------------------------------------- tiles
export const TILES = {
  wall: { name: 'Fels', walk: false, opaque: true },
  floor: { name: 'Boden', walk: true, opaque: false },
  door_closed: { name: 'geschlossene Tür', walk: false, opaque: true },
  door_open: { name: 'offene Tür', walk: true, opaque: false },
  stairs_down: { name: 'Abstieg in die Tiefe', walk: true, opaque: false },
  brazier_lit: { name: 'brennendes Glutbecken', walk: false, opaque: false, light: { radius: 5, strength: 1 } },
  brazier_out: { name: 'erloschenes Glutbecken', walk: false, opaque: false },
  fungus: { name: 'Leuchtpilze', walk: true, opaque: false, light: { radius: 2, strength: 0.75 } },
};

/** Biome-specific wording for walls/floors in hover text. */
export const BIOME_TILE_NAMES = {
  stollen: { wall: 'Stollenwand', floor: 'Stollenboden' },
  pilzgrotte: { wall: 'Höhlenwand', floor: 'Höhlenboden' },
  hallen: { wall: 'Gemäuer', floor: 'Steinfliesen' },
  herz: { wall: 'schwarzer Fels', floor: 'Ascheboden' },
};

export const TRAPS = {
  trap_dart: { name: noun('Pfeilfalle', 'f', 'Pfeilfallen'), desc: 'Verschießt einen vergifteten Pfeil.' },
  trap_teleport: { name: noun('Teleportfalle', 'f', 'Teleportfallen'), desc: 'Reißt dich an einen zufälligen Ort dieser Ebene.' },
  trap_alarm: { name: noun('Alarmfalle', 'f', 'Alarmfallen'), desc: 'Eine Glocke, die alle Bewohner der Ebene weckt.' },
  trap_pit: { name: noun('Fallgrube', 'f', 'Fallgruben'), desc: 'Ein verborgener Schacht hinab in die nächste Tiefe.' },
};

// ---------------------------------------------------------------- biomes
export function biomeFor(depth) {
  if (depth >= 10) return 'herz';
  if (depth >= 7) return 'hallen';
  if (depth >= 4) return 'pilzgrotte';
  return 'stollen';
}

export const BIOMES = {
  stollen: { name: 'Alte Stollen' },
  pilzgrotte: { name: 'Pilzgrotten' },
  hallen: { name: 'Versunkene Hallen' },
  herz: { name: 'Herz von Morrgrund' },
};

/** One atmospheric arrival line per depth. */
export const ARRIVAL = {
  1: 'Der Förderkorb ächzt ein letztes Mal. Vor dir liegen die alten Stollen von Morrgrund.',
  2: 'Wasser tropft von morschen Stützbalken. Die Stollen führen tiefer hinab.',
  3: 'Rostige Loren säumen die Gleise. Irgendwo rieselt Gestein.',
  4: 'Ein fahles Leuchten empfängt dich: Du hast die Pilzgrotten erreicht.',
  5: 'Die Luft ist schwer von Sporen. Leuchtpilze säumen die feuchten Wände.',
  6: 'Das Pilzlicht pulsiert hier unten wie ein langsamer Herzschlag.',
  7: 'Behauene Säulen ragen ins Dunkel – die versunkenen Hallen eines vergessenen Volkes.',
  8: 'Staub liegt auf Toren und Stufen. Seit Jahrhunderten hat hier niemand gesprochen.',
  9: 'Eisige Kälte steigt aus der Tiefe. Die Hallen enden an einem Schlund aus Finsternis.',
  10: 'Das Herz von Morrgrund. Irgendwo in der Schwärze frisst etwas das Licht.',
};

// ---------------------------------------------------------------- statuses
export const STATUSES = {
  poison: { label: 'Vergiftet', bad: true, end: 'Das Gift in deinen Adern ist abgeklungen.' },
  confusion: { label: 'Verwirrt', bad: true, end: 'Dein Kopf wird wieder klar.' },
  haste: { label: 'Eile', bad: false, end: 'Deine Eile verfliegt.' },
  finsternis: { label: 'Finsternis', bad: true, end: 'Die Finsternis weicht von deinen Augen.' },
  steinhaut: { label: 'Steinhaut', bad: false, end: 'Deine Haut wird wieder weich.' },
  slow: { label: 'Verlangsamt', bad: true, end: 'Du bewegst dich wieder normal.' },
  frozen: { label: 'Erstarrt', bad: true, end: 'Du kannst dich wieder rühren.' },
  fear: { label: 'Furcht', bad: true, end: 'Deine Furcht legt sich.' },
  stun: { label: 'Betäubt', bad: true, end: 'Du bist wieder bei Sinnen.' },
  asleep: { label: 'Schlafend', bad: true, end: 'Du erwachst.' },
  gespuer: { label: 'Gespür', bad: false, end: 'Dein Gespür für Lebewesen verblasst.' },
};

// ---------------------------------------------------------------- monsters
// dmg: [dice, sides, bonus]. acc/eva on a percent-ish scale (see combat docs).
// speed: 10 = normal, 20 = twice as fast, 5 = half speed.
// hit: message template, {M} = capitalised nominative name.
export const MONSTERS = {
  ratte: {
    name: noun('Stollenratte', 'f', 'Stollenratten'), depth: [1, 3], weight: 10,
    hp: 5, acc: 55, eva: 10, dmg: [1, 3, 0], armor: 0, speed: 10, xp: 2, group: [1, 3],
    hit: '{M} beißt dich.', desc: 'Ein räudiger Nager, der selten allein unterwegs ist.',
  },
  fledermaus: {
    name: noun('Grubenfledermaus', 'f', 'Grubenfledermäuse'), depth: [1, 4], weight: 7,
    hp: 4, acc: 55, eva: 30, dmg: [1, 3, 0], armor: 0, speed: 20, xp: 3, erratic: 0.5,
    hit: '{M} beißt dich.', desc: 'Flink und unberechenbar flatternd.',
  },
  kaefer: {
    name: noun('Panzerkäfer', 'm', 'Panzerkäfer'), depth: [1, 4], weight: 6,
    hp: 10, acc: 55, eva: 0, dmg: [1, 4, 0], armor: 4, speed: 5, xp: 4,
    hit: '{M} zwickt dich.', desc: 'Langsam, doch sein Chitinpanzer schluckt viele Hiebe.',
  },
  glimmerdieb: {
    name: noun('Glimmerdieb', 'm', 'Glimmerdiebe'), depth: [2, 6], weight: 4,
    hp: 9, acc: 75, eva: 25, dmg: [1, 3, 0], armor: 1, speed: 13, xp: 6, steal: true, opensDoors: true,
    hit: '{M} rempelt dich an.', desc: 'Ein huschender Kobold, der es auf dein Gold abgesehen hat.',
  },
  schleim: {
    name: noun('Ölschleim', 'm', 'Ölschleime'), depth: [2, 5], weight: 5,
    hp: 16, acc: 60, eva: 0, dmg: [1, 6, 0], armor: 0, speed: 7, xp: 5, split: 2, mindless: true, construct: true,
    hit: '{M} verätzt dich.', death: '{M} zerfließt.', desc: 'Eine zähe Lache, die sich bei Verletzung teilt.',
  },
  knochenknecht: {
    name: noun('Knochenknecht', 'm', 'Knochenknechte'), depth: [3, 6], weight: 7,
    hp: 22, acc: 72, eva: 10, dmg: [1, 8, 1], armor: 2, speed: 10, xp: 10, opensDoors: true, construct: true,
    hit: '{M} trifft dich mit seiner rostigen Klinge.', death: '{M} zerfällt zu einem Haufen Knochen.',
    desc: 'Ein Gerippe in den Lumpen eines Bergmanns, das noch immer seine Klinge führt.',
  },
  spinne: {
    name: noun('Webspinne', 'f', 'Webspinnen'), depth: [3, 7], weight: 6,
    hp: 14, acc: 75, eva: 20, dmg: [1, 6, 0], armor: 1, speed: 12, xp: 9, poison: { chance: 0.5, turns: [5, 8] },
    hit: '{M} beißt dich.', desc: 'Ihr Biss ist giftig.',
  },
  pilzling: {
    name: noun('Pilzling', 'm', 'Pilzlinge'), depth: [4, 6], weight: 6,
    hp: 20, acc: 70, eva: 0, dmg: [1, 7, 0], armor: 1, speed: 8, xp: 8, stationary: true, confuse: 0.4, mindless: true,
    hit: '{M} peitscht dich mit Sporenranken.', death: '{M} fällt in sich zusammen.',
    desc: 'Rührt sich nicht, bis du ihm zu nahe kommst. Seine Sporen verwirren.',
  },
  dochtmotte: {
    name: noun('Dochtmotte', 'f', 'Dochtmotten'), depth: [4, 8], weight: 6,
    hp: 7, acc: 75, eva: 35, dmg: [1, 4, 0], armor: 0, speed: 15, xp: 6, erratic: 0.35, drainOil: 35, lampLover: true, mindless: true,
    hit: '{M} streift dich mit rußigen Flügeln.', desc: 'Vom Licht deiner Lampe angezogen; ihre Berührung saugt Öl.',
  },
  schattenhund: {
    name: noun('Schattenhund', 'm', 'Schattenhunde'), depth: [5, 8], weight: 4,
    hp: 14, acc: 72, eva: 25, dmg: [1, 6, 1], armor: 1, speed: 14, xp: 12, group: [2, 3], pack: true,
    hit: '{M} beißt dich.', desc: 'Schnelle Jäger, die im Rudel kommen.',
  },
  grubengeist: {
    name: noun('Grubengeist', 'm', 'Grubengeister'), depth: [6, 9], weight: 4,
    hp: 18, acc: 80, eva: 30, dmg: [2, 4, 0], armor: 0, speed: 10, xp: 15, phase: true, sightRange: 3, construct: true,
    hit: '{M} berührt dich mit eisiger Hand.', death: '{M} verweht mit einem Seufzen.',
    desc: 'Gleitet durch Fels und ist nur aus nächster Nähe zu erkennen.',
  },
  troll: {
    name: noun('Stollentroll', 'm', 'Stollentrolle'), depth: [6, 9], weight: 5,
    hp: 36, acc: 75, eva: 5, dmg: [2, 5, 1], armor: 3, speed: 10, xp: 25, regen: 1, opensDoors: true,
    hit: '{M} schlägt dich mit wuchtiger Faust.', desc: 'Schlägt hart zu und heilt seine Wunden in kürzester Zeit.',
  },
  aschepriester: {
    name: noun('Aschepriester', 'm', 'Aschepriester'), depth: [7, 10], weight: 5,
    hp: 24, acc: 75, eva: 15, dmg: [1, 6, 0], armor: 1, speed: 10, xp: 22, opensDoors: true,
    ranged: { range: 7, dmg: [2, 4, 0], kind: 'feuerbolzen' }, keepDistance: true,
    hit: '{M} trifft dich mit seinem Stab.', desc: 'Schleudert Feuerbolzen und hält Abstand.',
  },
  steinwaechter: {
    name: noun('Steinwächter', 'm', 'Steinwächter'), depth: [7, 10], weight: 4,
    hp: 55, acc: 75, eva: 0, dmg: [2, 7, 0], armor: 7, speed: 8, xp: 30, dormant: true, construct: true, mindless: true,
    hit: '{M} schmettert seine Steinfaust auf dich.', death: '{M} zerbricht in Trümmer.',
    desc: 'Eine Statue, die erst erwacht, wenn du neben ihr stehst. Äußerst zäh.',
  },
  kristallschrecke: {
    name: noun('Kristallschrecke', 'f', 'Kristallschrecken'), depth: [8, 10], weight: 5,
    hp: 14, acc: 85, eva: 35, dmg: [2, 8, 0], armor: 0, speed: 12, xp: 22, leap: 3, construct: true,
    hit: '{M} schneidet dich mit kristallenen Klingen.', death: '{M} zerspringt klirrend.',
    desc: 'Springt aus der Ferne heran und schneidet tief, zerbricht aber leicht.',
  },
  tiefenwurm: {
    name: noun('Tiefenwurm', 'm', 'Tiefenwürmer'), depth: [9, 10], weight: 4,
    hp: 70, acc: 80, eva: 0, dmg: [3, 6, 0], armor: 4, speed: 6, xp: 40, mindless: true,
    hit: '{M} rammt dich mit seinem gepanzerten Leib.', desc: 'Langsam, gewaltig und unaufhaltsam.',
  },
  lichtfresser: {
    name: noun('Lichtfresser', 'm', 'Lichtfresser'), proper: true, depth: [10, 10], weight: 0,
    hp: 150, acc: 90, eva: 15, dmg: [3, 6, 0], armor: 4, speed: 10, xp: 100, boss: true, opensDoors: true,
    hit: '{M} zerfetzt dich mit Klauen aus Schatten.', death: '{M} zerfällt zu kalter Asche.',
    desc: 'Der Herr der Tiefe. Sein Blick saugt das Öl aus deiner Lampe, und Dochtmotten folgen seinem Ruf.',
  },
};

// ---------------------------------------------------------------- items
export const WEAPONS = {
  dolch: { name: noun('Dolch', 'm', 'Dolche'), dmg: [1, 4], acc: 10, crit: 0.12, minDepth: 1, weight: 6, desc: 'Leicht und präzise; findet oft eine Lücke.' },
  kurzschwert: { name: noun('Kurzschwert', 'n', 'Kurzschwerter'), dmg: [1, 6], acc: 5, crit: 0.06, minDepth: 1, weight: 8, desc: 'Eine handliche Klinge für enge Stollen.' },
  spitzhacke: { name: noun('Spitzhacke', 'f', 'Spitzhacken'), dmg: [2, 3], acc: 0, crit: 0.08, minDepth: 1, weight: 7, desc: 'Ein Bergmannswerkzeug, das auch als Waffe taugt.' },
  speer: { name: noun('Speer', 'm', 'Speere'), dmg: [1, 9], acc: 5, crit: 0.05, minDepth: 2, weight: 6, desc: 'Lange Spitze, gute Reichweite für einen festen Stoß.' },
  streitkolben: { name: noun('Streitkolben', 'm', 'Streitkolben'), dmg: [2, 4], acc: 0, crit: 0.05, minDepth: 2, weight: 6, desc: 'Ein schwerer Kolben, der auch Panzer zerschlägt.' },
  langschwert: { name: noun('Langschwert', 'n', 'Langschwerter'), dmg: [2, 5], acc: 0, crit: 0.06, minDepth: 4, weight: 5, desc: 'Eine ausgewogene, lange Klinge.' },
  kriegsaxt: { name: noun('Kriegsaxt', 'f', 'Kriegsäxte'), dmg: [2, 6], acc: -5, crit: 0.1, minDepth: 5, weight: 4, desc: 'Wuchtig, aber schwer zu führen.' },
  runenklinge: { name: noun('Runenklinge', 'f', 'Runenklingen'), dmg: [2, 7], acc: 10, crit: 0.1, minDepth: 7, weight: 1.5, desc: 'Ein uraltes Schwert, dessen Runen im Dunkeln glimmen.' },
};

export const ARMORS = {
  lederwams: { name: noun('Lederwams', 'n', 'Lederwämser'), armor: 2, minDepth: 1, weight: 6, desc: 'Gehärtetes Leder, leicht und leise.' },
  nietenruestung: { name: noun('Nietenrüstung', 'f', 'Nietenrüstungen'), armor: 3, minDepth: 1, weight: 6, desc: 'Leder, mit Eisennieten verstärkt.' },
  kettenhemd: { name: noun('Kettenhemd', 'n', 'Kettenhemden'), armor: 4, minDepth: 3, weight: 5, desc: 'Verflochtene Eisenringe.' },
  schuppenpanzer: { name: noun('Schuppenpanzer', 'm', 'Schuppenpanzer'), armor: 5, minDepth: 5, weight: 4, desc: 'Überlappende Stahlschuppen.' },
  plattenharnisch: { name: noun('Plattenharnisch', 'm', 'Plattenharnische'), armor: 7, minDepth: 7, weight: 2, stealthPenalty: true, desc: 'Schwerer Plattenstahl. Schützt hervorragend, ist aber laut.' },
};

export const POTIONS = {
  heilung: { suffix: ' der Heilung', weight: 22, desc: 'Schließt Wunden und vertreibt Gift.' },
  staerke: { suffix: ' der Stärke', weight: 6, desc: 'Erhöht deine Stärke dauerhaft um 1.' },
  gift: { suffix: ' des Giftes', weight: 9, desc: 'Vergiftet, wer ihn trinkt.' },
  finsternis: { suffix: ' der Finsternis', weight: 7, desc: 'Trübt deine Augen; deine Sicht schrumpft auf ein Feld.' },
  eile: { suffix: ' der Eile', weight: 8, desc: 'Lässt dich eine Weile doppelt so schnell handeln.' },
  gespuer: { suffix: ' des Gespürs', weight: 8, desc: 'Lässt dich alle Lebewesen der Ebene eine Zeit lang spüren.' },
  erfahrung: { suffix: ' der Erfahrung', weight: 4, desc: 'Gewährt sofort eine Erfahrungsstufe.' },
  steinhaut: { suffix: ' der Steinhaut', weight: 8, desc: 'Härtet deine Haut für eine Weile wie Stein (+5 Rüstung).' },
};

export const SCROLLS = {
  identifikation: { suffix: ' der Identifikation', weight: 24, needsItem: true, desc: 'Enthüllt die wahre Natur eines Gegenstands.' },
  teleportation: { suffix: ' der Teleportation', weight: 11, desc: 'Versetzt dich an einen zufälligen Ort dieser Ebene.' },
  kartierung: { suffix: ' der Kartierung', weight: 11, desc: 'Zeichnet den Grundriss der Ebene in dein Gedächtnis.' },
  waffenschliff: { suffix: ' des Waffenschliffs', weight: 8, desc: 'Verbessert die geführte Waffe um +1.' },
  ruestungssegen: { suffix: ' des Rüstungssegens', weight: 8, desc: 'Verbessert die getragene Rüstung um +1.' },
  schrecken: { suffix: ' des Schreckens', weight: 8, desc: 'Schlägt alle sichtbaren Feinde in die Flucht.' },
  blendlicht: { suffix: ' des Blendlichts', weight: 8, desc: 'Ein greller Blitz betäubt alle sichtbaren Feinde.' },
  beschwoerung: { suffix: ' der Beschwörung', weight: 7, desc: 'Ruft Ungeheuer an deine Seite – kein Segen.' },
};

export const WANDS = {
  blitz: { suffix: ' des Blitzes', weight: 10, range: 10, charges: [3, 6], desc: 'Ein Blitz durchschlägt alle Wesen auf einer Linie.' },
  frost: { suffix: ' des Frostes', weight: 10, range: 10, charges: [3, 6], desc: 'Lässt das erste getroffene Wesen erstarren.' },
  verbannung: { suffix: ' der Verbannung', weight: 7, range: 10, charges: [2, 4], desc: 'Schleudert das erste getroffene Wesen an einen fernen Ort.' },
  glutball: { suffix: ' des Glutballs', weight: 8, range: 8, charges: [2, 5], desc: 'Eine Feuerkugel, die beim Aufprall im Umkreis explodiert.' },
};

export const RINGS = {
  regeneration: { suffix: ' der Regeneration', weight: 8, desc: 'Deine Wunden heilen doppelt so schnell.' },
  schutz: { suffix: ' des Schutzes', weight: 8, desc: '+2 Rüstung.' },
  kraft: { suffix: ' der Kraft', weight: 8, desc: '+2 Stärke.' },
  weitsicht: { suffix: ' der Weitsicht', weight: 8, desc: 'Deine Lampe leuchtet 2 Felder weiter.' },
  sparsamkeit: { suffix: ' der Sparsamkeit', weight: 7, desc: 'Deine Lampe verbraucht nur halb so viel Öl.' },
  schleichen: { suffix: ' des Schleichens', weight: 7, desc: 'Feinde bemerken dich schwerer.' },
};

/** Appearance adjectives. rosa is indeclinable; türkis is rendered as "türkisfarben". */
export const POTION_COLORS = {
  azurblau: adj('azurblau'),
  karminrot: adj('karminrot'),
  smaragdgruen: adj('smaragdgrün'),
  bernsteingelb: adj('bernsteingelb'),
  violett: adj('violett'),
  milchweiss: adj('milchweiß'),
  russschwarz: adj('rußschwarz'),
  kupferbraun: adj('kupferbraun'),
  rosa: adj('rosa', true),
  tuerkis: adj('türkisfarben'),
};

export const WAND_MATERIALS = {
  eiche: 'Eiche', knochen: 'Knochen', kupfer: 'Kupfer', obsidian: 'Obsidian', birke: 'Birke', eisen: 'Eisen',
};

export const RING_GEMS = {
  rubin: noun('Rubinring', 'm', 'Rubinringe'),
  saphir: noun('Saphirring', 'm', 'Saphirringe'),
  smaragd: noun('Smaragdring', 'm', 'Smaragdringe'),
  onyx: noun('Onyxring', 'm', 'Onyxringe'),
  opal: noun('Opalring', 'm', 'Opalringe'),
  bernstein: noun('Bernsteinring', 'm', 'Bernsteinringe'),
  mondstein: noun('Mondsteinring', 'm', 'Mondsteinringe'),
  granat: noun('Granatring', 'm', 'Granatringe'),
};

export const RUNE_SYLLABLES = ['VA', 'RETH', 'KOL', 'MUR', 'TES', 'ZAN', 'OR', 'GRI', 'DAL', 'EM', 'NOX', 'SUL',
  'AR', 'BEN', 'THU', 'ILK', 'RAS', 'MOR', 'UL', 'FEN', 'DRA', 'KES', 'LO', 'VYN', 'ASH', 'TOR', 'QUE', 'IM'];

export const NOUNS = {
  potion: noun('Trank', 'm', 'Tränke', 'Tränken'),
  scroll: noun('Schriftrolle', 'f', 'Schriftrollen'),
  wand: noun('Stab', 'm', 'Stäbe', 'Stäben'),
  ring: noun('Ring', 'm', 'Ringe'),
  wurfmesser: noun('Wurfmesser', 'n', 'Wurfmesser', 'Wurfmessern'),
  oelflasche: noun('Ölflasche', 'f', 'Ölflaschen'),
  gold: noun('Goldmünze', 'f', 'Goldmünzen'),
  sonnenscherbe: noun('Sonnenscherbe', 'f', 'Sonnenscherben'),
};

export const MISC_ITEMS = {
  wurfmesser: { cat: 'thrown', dmg: [1, 6], range: 8, weight: 6, desc: 'Ein ausbalanciertes Messer zum Werfen. Manchmal kannst du es wieder aufsammeln.' },
  oelflasche: { cat: 'oil', desc: `Füllt deine Lampe um ${Math.round(OIL_FLASK / OIL_MAX * 100)} % auf.` },
  gold: { cat: 'gold', desc: 'Glänzende Münzen aus einer vergangenen Zeit.' },
  sonnenscherbe: { cat: 'artifact', desc: 'Ein Splitter der verlorenen Sonne von Morrgrund. Sie ist der Grund deines Abstiegs.' },
};

/** Item category weights for floor loot. */
export const LOOT_WEIGHTS = { potion: 32, scroll: 26, weapon: 8, armor: 7, wand: 6, ring: 4, thrown: 6, oil: 6 };

/** XP needed to reach level n+1 (index n). */
export const XP_TABLE = [0, 0, 10, 25, 50, 90, 150, 230, 340, 480, 660, 890, 1180, 1540, 1980, 2500];

export const ITEM_CATEGORY_NAMES = {
  weapon: 'Waffe', armor: 'Rüstung', thrown: 'Wurfwaffe', potion: 'Trank', scroll: 'Schriftrolle',
  wand: 'Stab', ring: 'Ring', oil: 'Lampenöl', gold: 'Gold', artifact: 'Artefakt',
};
