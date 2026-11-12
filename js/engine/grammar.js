// Minimal German noun-phrase grammar: articles, cases and adjective endings.
//
// A noun phrase spec looks like:
//   { noun: {sg, pl, plDat, gender}, adj?: {stem, indecl?}, suffix?: string, proper?: boolean }
// and is rendered with np(spec, {case, article, count}).
//   case:    'nom' | 'acc' | 'dat'
//   article: 'def' | 'indef' | 'none'
//   count:   number (plural when !== 1; the number is printed as digits)

/** @typedef {'m'|'f'|'n'} Gender */
/** @typedef {{sg:string, pl:string, plDat:string, gender:Gender}} Noun */
/** @typedef {{stem:string, indecl?:boolean}} Adjective */
/** @typedef {{noun:Noun, adj?:Adjective, suffix?:string, proper?:boolean}} NounPhrase */

const DEF = {
  nom: { m: 'der', f: 'die', n: 'das', pl: 'die' },
  acc: { m: 'den', f: 'die', n: 'das', pl: 'die' },
  dat: { m: 'dem', f: 'der', n: 'dem', pl: 'den' },
};
const INDEF = {
  nom: { m: 'ein', f: 'eine', n: 'ein' },
  acc: { m: 'einen', f: 'eine', n: 'ein' },
  dat: { m: 'einem', f: 'einer', n: 'einem' },
};
const STRONG = {
  nom: { m: 'er', f: 'e', n: 'es', pl: 'e' },
  acc: { m: 'en', f: 'e', n: 'es', pl: 'e' },
  dat: { m: 'em', f: 'er', n: 'em', pl: 'en' },
};

/**
 * Create a noun. Dative plural defaults to plural + "n" unless it already
 * ends in -n or -s.
 * @returns {Noun}
 */
export function noun(sg, gender, pl = sg, plDat) {
  return { sg, gender, pl, plDat: plDat ?? (/[ns]$/.test(pl) ? pl : pl + 'n') };
}

/** @returns {Adjective} */
export function adj(stem, indecl = false) {
  return { stem, indecl };
}

/** Definite article for a gender ('m'|'f'|'n'|'pl') and case. */
export function article(kind, kase, g) {
  if (kind === 'def') return DEF[kase][g];
  if (kind === 'indef') return g === 'pl' ? '' : INDEF[kase][g];
  return '';
}

/** Adjective ending after the given article type. */
export function adjEnding(articleType, kase, g) {
  if (articleType === 'def') {
    if (g === 'pl') return 'en';
    if (kase === 'nom') return 'e';
    if (kase === 'acc') return g === 'm' ? 'en' : 'e';
    return 'en';
  }
  if (articleType === 'indef' && g !== 'pl') {
    if (kase === 'nom') return { m: 'er', f: 'e', n: 'es' }[g];
    if (kase === 'acc') return { m: 'en', f: 'e', n: 'es' }[g];
    return 'en';
  }
  return STRONG[kase][g];
}

export function declineAdj(a, ending) {
  if (a.indecl) return a.stem;
  return a.stem + ending;
}

/**
 * Render a noun phrase.
 * @param {NounPhrase} spec
 * @param {{case?:'nom'|'acc'|'dat', article?:'def'|'indef'|'none', count?:number, showCount?:boolean}} [opts]
 */
export function np(spec, opts = {}) {
  const kase = opts.case ?? 'nom';
  const count = opts.count ?? 1;
  const plural = count !== 1;
  const g = plural ? 'pl' : spec.noun.gender;
  let art = spec.proper ? 'def' : (opts.article ?? 'indef');
  if (art === 'indef' && plural) art = 'none';
  const parts = [];
  if (art === 'def') parts.push(DEF[kase][g]);
  else if (art === 'indef') parts.push(INDEF[kase][g]);
  if (plural && opts.showCount !== false) parts.push(String(count));
  if (spec.adj) parts.push(declineAdj(spec.adj, adjEnding(art, kase, g)));
  parts.push(plural ? (kase === 'dat' ? spec.noun.plDat : spec.noun.pl) : spec.noun.sg);
  return parts.join(' ') + (spec.suffix ?? '');
}

/** Upper-case the first letter. */
export function cap(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Contract German preposition + article: "von dem" -> "vom", "zu der" -> "zur", ... */
export function contract(s) {
  return s
    .replace(/\b([Vv])on dem\b/g, '$1om')
    .replace(/\b([Zz])u dem\b/g, '$1um')
    .replace(/\b([Zz])u der\b/g, '$1ur')
    .replace(/\b([Ii])n dem\b/g, '$1m')
    .replace(/\b([Aa])n dem\b/g, '$1m')
    .replace(/\b([Ii])n das\b/g, '$1ns')
    .replace(/\b([Aa])n das\b/g, '$1ns')
    .replace(/\b([Bb])ei dem\b/g, '$1eim');
}

/** Personal pronoun for a gender (3rd person) in a case. */
export function pronoun(g, kase = 'nom') {
  const P = {
    nom: { m: 'er', f: 'sie', n: 'es', pl: 'sie' },
    acc: { m: 'ihn', f: 'sie', n: 'es', pl: 'sie' },
    dat: { m: 'ihm', f: 'ihr', n: 'ihm', pl: 'ihnen' },
  };
  return P[kase][g];
}
