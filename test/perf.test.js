import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/engine/index.js';
import { botAction } from './bot.js';

test('act() is fast: median well under 1 ms, p95 under 5 ms (single-turn actions)', () => {
  const times = [];
  for (const seed of ['perf-1', 'perf-2', 'perf-3', 'perf-4']) {
    const g = Game.create({ seed });
    const mem = {};
    g.state.player.maxHp = g.state.player.hp = 1000; // survive long enough to sample
    // start deeper on some runs: bigger levels / more monsters
    if (seed !== 'perf-1') g.enterLevel(seed === 'perf-2' ? 5 : seed === 'perf-3' ? 8 : 10, 'stairs');
    for (let i = 0; i < 1500; i++) {
      if (g.state.status !== 'playing') break;
      const a = botAction(g, mem);
      const t0 = performance.now();
      g.act(a);
      const dt = performance.now() - t0;
      if (a.type !== 'rest' && g.lastActionTookTurn) times.push(dt);
    }
  }
  times.sort((a, b) => a - b);
  const med = times[Math.floor(times.length / 2)];
  const p95 = times[Math.floor(times.length * 0.95)];
  console.log(`# act(): n=${times.length} median ${med.toFixed(3)} ms, p95 ${p95.toFixed(3)} ms, max ${times[times.length - 1].toFixed(1)} ms`);
  assert.ok(med < 1, `median ${med}`);
  assert.ok(p95 < 5, `p95 ${p95}`);
});
