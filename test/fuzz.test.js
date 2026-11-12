import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fuzz } from './fuzz.js';

// FUZZ_GAMES / FUZZ_ACTIONS env vars allow longer soak runs.
const GAMES = Number(process.env.FUZZ_GAMES ?? 200);
const ACTIONS = Number(process.env.FUZZ_ACTIONS ?? 2000);

test(`fuzz: ${GAMES} random games x ${ACTIONS} actions keep invariants; save/load is deterministic`, () => {
  const r = fuzz('fuzz', GAMES, ACTIONS);
  console.log(`# fuzz: ${r.totalTurns} game turns total, deepest level ${r.maxDepth}, ${r.checkedSaves} save/load replays`);
  assert.ok(r.checkedSaves >= GAMES / 8, `only ${r.checkedSaves} save/load replays`);
  assert.ok(r.totalTurns / GAMES >= 1000, `avg turns per game ${r.totalTurns / GAMES}`);
  assert.ok(r.maxDepth >= 5, 'fuzzing reached deeper levels');
});
