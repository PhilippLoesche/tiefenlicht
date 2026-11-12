// localStorage persistence: autosave, settings and the list of best runs.
import { Game, VERSION } from '../engine/index.js';

const KEY_SAVE = 'tiefenlicht.save';
const KEY_SETTINGS = 'tiefenlicht.settings';
const KEY_RUNS = 'tiefenlicht.runs';
const SAVE_FORMAT = 1;

function get(k) { try { return localStorage.getItem(k); } catch { return null; } }
function set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } }
function del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } }

export const DEFAULT_SETTINGS = { muted: false, volume: 0.8, tileSize: 0, drawer: null };

export function loadSettings() {
  try {
    const s = JSON.parse(get(KEY_SETTINGS) || '{}');
    return { ...DEFAULT_SETTINGS, ...(s && typeof s === 'object' ? s : {}) };
  } catch { return { ...DEFAULT_SETTINGS }; }
}
export function saveSettings(s) { set(KEY_SETTINGS, JSON.stringify(s)); }

/** Quick check used by the title screen (does not deserialize). */
export function hasSave() {
  const raw = get(KEY_SAVE);
  if (!raw) return false;
  try {
    const d = JSON.parse(raw);
    return d && d.format === SAVE_FORMAT && d.game && d.game.version === VERSION && d.game.status === 'playing';
  } catch { return false; }
}

/** Peek at save metadata for the "continue" button. */
export function saveInfo() {
  try {
    const d = JSON.parse(get(KEY_SAVE));
    return { depth: d.game.depth, level: d.game.player.level, turn: d.game.turn, biome: d.game.level.biome };
  } catch { return null; }
}

/** @returns {{game: Game, log: object[]} | {error: string}} */
export function loadSave() {
  const raw = get(KEY_SAVE);
  if (!raw) return { error: 'missing' };
  try {
    const d = JSON.parse(raw);
    if (!d || d.format !== SAVE_FORMAT) throw new Error('format');
    const game = Game.deserialize(d.game);
    if (game.state.status !== 'playing') throw new Error('finished');
    // touch a few queries so a structurally broken save fails here, not in the renderer
    game.playerStats(); game.inventoryView(); game.visibleMonsters();
    return { game, log: Array.isArray(d.log) ? d.log.slice(-300) : [] };
  } catch (e) {
    return { error: String(e && e.message || e) };
  }
}

export function writeSave(game, log) {
  if (!game || game.state.status !== 'playing') return false;
  const data = { format: SAVE_FORMAT, savedAt: Date.now(), game: game.serialize(), log: log.slice(-200) };
  return set(KEY_SAVE, JSON.stringify(data));
}

export function clearSave() { del(KEY_SAVE); }

export function loadRuns() {
  try {
    const r = JSON.parse(get(KEY_RUNS) || '[]');
    return Array.isArray(r) ? r.filter((x) => x && typeof x.score === 'number').slice(0, 10) : [];
  } catch { return []; }
}

/** Record a finished run; returns its rank (1-based) or 0 if it did not make the top 10. */
export function recordRun(summary) {
  const runs = loadRuns();
  const entry = {
    id: Date.now() + ':' + Math.random().toString(36).slice(2, 7),
    score: summary.score, depth: summary.maxDepth, level: summary.level, turns: summary.turns,
    won: !!summary.won, cause: summary.won ? 'Mit der Sonnenscherbe zurückgekehrt' : (summary.cause || 'Verschollen'),
    date: new Date().toISOString().slice(0, 10),
  };
  runs.push(entry);
  runs.sort((a, b) => b.score - a.score);
  const top = runs.slice(0, 10);
  set(KEY_RUNS, JSON.stringify(top));
  const idx = top.findIndex((r) => r.id === entry.id);
  return { rank: idx + 1, id: entry.id };
}
