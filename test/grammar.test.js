import { test } from 'node:test';
import assert from 'node:assert/strict';
import { np, noun, contract, cap } from '../js/engine/grammar.js';
import { MONSTERS, POTION_COLORS, NOUNS } from '../js/engine/data.js';
import { killedBy, monSpec } from '../js/engine/monsters.js';
import { quietGame, adjacentMonster, logs } from './helpers.js';
import { makeItem } from '../js/engine/entities.js';

const ratte = monSpec('ratte'), kaefer = monSpec('kaefer');

test('articles and cases for monsters', () => {
  assert.equal(np(ratte, { case: 'nom', article: 'def' }), 'die Stollenratte');
  assert.equal(np(ratte, { case: 'acc', article: 'indef' }), 'eine Stollenratte');
  assert.equal(np(ratte, { case: 'dat', article: 'def' }), 'der Stollenratte');
  assert.equal(np(kaefer, { case: 'acc', article: 'def' }), 'den Panzerkäfer');
  assert.equal(np(kaefer, { case: 'dat', article: 'indef' }), 'einem Panzerkäfer');
  assert.equal(np(kaefer, { case: 'nom', article: 'indef' }), 'ein Panzerkäfer');
  assert.equal(np(monSpec('lichtfresser'), { case: 'acc', article: 'indef' }), 'den Lichtfresser', 'proper names keep the definite article');
});

test('neuter nouns and plurals', () => {
  const schwert = { noun: noun('Kurzschwert', 'n', 'Kurzschwerter') };
  assert.equal(np(schwert, { case: 'acc', article: 'def' }), 'das Kurzschwert');
  assert.equal(np(schwert, { case: 'dat', article: 'indef' }), 'einem Kurzschwert');
  assert.equal(np({ noun: NOUNS.wurfmesser }, { case: 'acc', article: 'indef', count: 3 }), '3 Wurfmesser');
  assert.equal(np({ noun: NOUNS.wurfmesser }, { case: 'dat', article: 'none', count: 3 }), '3 Wurfmessern');
  assert.equal(np({ noun: NOUNS.oelflasche }, { case: 'nom', article: 'def', count: 2 }), 'die 2 Ölflaschen');
});

test('adjective endings for unidentified potions', () => {
  const blau = { noun: NOUNS.potion, adj: POTION_COLORS.azurblau };
  assert.equal(np(blau, { case: 'nom', article: 'def' }), 'der azurblaue Trank');
  assert.equal(np(blau, { case: 'acc', article: 'def' }), 'den azurblauen Trank');
  assert.equal(np(blau, { case: 'dat', article: 'def' }), 'dem azurblauen Trank');
  assert.equal(np(blau, { case: 'nom', article: 'indef' }), 'ein azurblauer Trank');
  assert.equal(np(blau, { case: 'acc', article: 'indef' }), 'einen azurblauen Trank');
  assert.equal(np(blau, { case: 'dat', article: 'indef' }), 'einem azurblauen Trank');
  assert.equal(np(blau, { case: 'nom', article: 'indef', count: 3 }), '3 azurblaue Tränke');
  assert.equal(np(blau, { case: 'dat', article: 'indef', count: 3 }), '3 azurblauen Tränken');
  assert.equal(np(blau, { case: 'nom', article: 'def', count: 3 }), 'die 3 azurblauen Tränke');
  assert.equal(np({ noun: NOUNS.potion, adj: POTION_COLORS.rosa }, { case: 'acc', article: 'def' }), 'den rosa Trank');
  assert.equal(np({ noun: NOUNS.potion, adj: POTION_COLORS.tuerkis }, { case: 'nom', article: 'indef' }), 'ein türkisfarbener Trank');
  assert.equal(np({ noun: NOUNS.potion, adj: POTION_COLORS.milchweiss }, { case: 'acc', article: 'indef' }), 'einen milchweißen Trank');
});

test('feminine adjective endings', () => {
  const f = { noun: noun('Flasche', 'f', 'Flaschen'), adj: POTION_COLORS.violett };
  assert.equal(np(f, { case: 'nom', article: 'indef' }), 'eine violette Flasche');
  assert.equal(np(f, { case: 'dat', article: 'indef' }), 'einer violetten Flasche');
  const n = { noun: noun('Fläschchen', 'n'), adj: POTION_COLORS.karminrot };
  assert.equal(np(n, { case: 'nom', article: 'indef' }), 'ein karminrotes Fläschchen');
  assert.equal(np(n, { case: 'acc', article: 'def' }), 'das karminrote Fläschchen');
});

test('contractions and death causes', () => {
  assert.equal(contract('von dem Lichtfresser'), 'vom Lichtfresser');
  assert.equal(contract('zu der Tür'), 'zur Tür');
  assert.equal(killedBy({ id: 'lichtfresser' }), 'Vom Lichtfresser getötet');
  assert.equal(killedBy({ id: 'ratte' }), 'Von einer Stollenratte getötet');
  assert.equal(killedBy({ id: 'troll' }), 'Von einem Stollentroll getötet');
  assert.equal(cap('etwas beißt dich.'), 'Etwas beißt dich.');
});

test('every monster has a gendered name and messages', () => {
  for (const [id, d] of Object.entries(MONSTERS)) {
    assert.ok(['m', 'f', 'n'].includes(d.name.gender), id);
    assert.ok(d.hit.includes('{M}'), id);
    assert.ok(d.desc.length > 5, id);
  }
});

test('combat and pickup messages are grammatical in play', () => {
  const g = quietGame('grammar-play');
  const { m, dx, dy } = adjacentMonster(g, 'kaefer');
  m.hp = 999; m.maxHp = 999;
  let all = [];
  for (let i = 0; i < 30; i++) all = all.concat(logs(g.act({ type: 'move', dx, dy })));
  assert.ok(all.some((t) => t === 'Du triffst den Panzerkäfer.' || t === 'Du verfehlst den Panzerkäfer.'), all.join('\n'));
  assert.ok(all.some((t) => /^Der Panzerkäfer (zwickt dich|verfehlt dich|trifft dich, doch)/.test(t)), all.join('\n'));

  const g2 = quietGame('grammar-pickup');
  const p = g2.state.player;
  const sword = makeItem(g2.state, 'weapon', 'kurzschwert');
  g2.dropItemAt(sword, p.x, p.y, false);
  assert.deepEqual(logs(g2.act({ type: 'pickup' })), ['Du hebst das Kurzschwert auf.']);
});
