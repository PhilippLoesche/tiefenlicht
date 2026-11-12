// Tiefenlicht art — palettes. Core palette + per-biome tile colours + light colours.

/** Core palette. */
export const PAL = {
  amber: '#ffb454',
  ember: '#e2543a',
  teal: '#58c2a5',
  bone: '#e8dcc0',
  slate: '#56607a',
  dark: '#131a2b',
  gold: '#f2c14e',
  steel: '#b9c4d2',
  steelDk: '#6d7a8e',
};

/** Light colours for the renderer's light map. */
export const LIGHT = {
  lamp: '#ffb454',       // hero lantern (warm)
  lampCore: '#ffe2a6',   // lantern hot core / near falloff
  brazier: '#ff8c42',    // lit brazier
  fungus: '#58c2a5',     // glowing mushrooms
  sunshard: '#fff0b8',   // sonnenscherbe pickup
  rune: '#7ff0dc',       // runenklinge / steinwaechter runes
  ghost: '#a8eadf',      // grubengeist
  corona: '#ffe6a8',     // lichtfresser stolen light
};

/**
 * Per-biome palettes. Tiles are drawn "fully lit"; `ambient` is the colour of
 * unlit darkness in that biome, `fog` the tint for remembered tiles, `accent`
 * a signature hue for UI touches.
 */
export const BIOMES = {
  stollen: {
    id: 'stollen', name: 'Stollen', depths: [1, 3],
    ambient: '#1b1720', fog: '#55607a', accent: '#c98b4e',
    top: '#4a3f3a', topHi: '#605046', topRim: '#806a58',
    face: '#7b6656', faceHi: '#977e69', faceDk: '#58483f', foot: '#3a2f2c',
    floor: '#6a5848', floorDk: '#5b4b3e', floorHi: '#7d6a56',
    timber: '#8e5c34', timberHi: '#ad7745', timberDk: '#5e3b22',
    door: '#8a5a33', doorHi: '#a8743f', doorDk: '#5a3920', metal: '#4a4b55', metalHi: '#7c7f8c',
  },
  pilzgrotte: {
    id: 'pilzgrotte', name: 'Pilzgrotte', depths: [4, 6],
    ambient: '#0e2023', fog: '#4a6a6c', accent: '#58c2a5',
    top: '#2c4446', topHi: '#3a5a5a', topRim: '#527a7a',
    face: '#4b6f6a', faceHi: '#628a82', faceDk: '#34524f', foot: '#1f3333',
    floor: '#4f6152', floorDk: '#435447', floorHi: '#5f735f',
    moss: '#6a8a52', mossHi: '#86a862', mossDk: '#4e6c42',
    door: '#5e4a3a', doorHi: '#7a624c', doorDk: '#3e3028', metal: '#3c4a4c', metalHi: '#6f8486',
  },
  hallen: {
    id: 'hallen', name: 'Versunkene Hallen', depths: [7, 9],
    ambient: '#15163a', fog: '#5a5c8c', accent: '#8f8fe8',
    top: '#34345a', topHi: '#44446c', topRim: '#64648f',
    face: '#5e5d8e', faceHi: '#7a79aa', faceDk: '#424170', foot: '#24243e',
    floor: '#5a5a78', floorDk: '#4a4a66', floorHi: '#6c6c8c', grout: '#383854',
    door: '#4b3d48', doorHi: '#665263', doorDk: '#30262f', metal: '#5a5f78', metalHi: '#9aa0bc',
  },
  herz: {
    id: 'herz', name: 'Das Herz', depths: [10, 10],
    ambient: '#1a0e22', fog: '#5c4870', accent: '#e0b050',
    top: '#231a2e', topHi: '#312442', topRim: '#4a3864',
    face: '#3a2b50', faceHi: '#55407a', faceDk: '#271c38', foot: '#130d1a',
    floor: '#3b3048', floorDk: '#30273c', floorHi: '#4b3e5c',
    vein: '#d9a845', veinHi: '#ffd977',
    door: '#2a2232', doorHi: '#3e3349', doorDk: '#18121e', metal: '#a07a34', metalHi: '#e0b860',
  },
};
export const BIOME_IDS = Object.keys(BIOMES);
