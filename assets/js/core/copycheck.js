/**
 * copycheck.js: catches wording that reads as machine-written.
 *
 * One list, two users. The Studio runs it under every text box as you type,
 * and tools/check-copy.mjs runs it over the whole site before a change goes
 * out. It has no dependencies and does not touch the page, so it works in
 * the browser and in Node alike.
 *
 * Two levels:
 *   ban   stock words and phrases that give generated text away
 *   warn  habits worth a second look, which are sometimes fine
 *
 * check(text, { title: true }) also applies the rules for headings.
 */

/** [pattern, what to do instead]. Matched as whole words, any case. */
const BANNED = [
  // Stock vocabulary
  ['delv(e|es|ed|ing)', 'say what you looked at'],
  ['tapestry', 'cut it'],
  ['testament to', 'cut it'],
  ['realm', 'name the field'],
  ['landscape', 'name the thing (market, field, industry)'],
  ['leverag(e|es|ed|ing)', 'use'],
  ['utiliz(e|es|ed|ing)', 'use'],
  ['seamless(ly)?', 'cut it'],
  ['cutting[- ]edge', 'cut it'],
  ['state[- ]of[- ]the[- ]art', 'cut it'],
  ['world[- ]class', 'cut it'],
  ['next[- ]level', 'cut it'],
  ['innovative', 'say what is new about it'],
  ['groundbreaking', 'cut it'],
  ['revolutioni[sz](e|es|ed|ing)', 'cut it'],
  ['transformative', 'cut it'],
  ['game[- ]chang(er|ers|ing)', 'cut it'],
  ['passion(ate|ately)?', 'say what you did'],
  ['unlock(s|ed|ing)?', 'cut it'],
  ['unleash(es|ed|ing)?', 'cut it'],
  ['elevat(e|es|ed|ing)', 'improve, or say how'],
  ['empower(s|ed|ing)?', 'let, help'],
  ['embark(s|ed|ing)?', 'start'],
  ['journey', 'cut it, unless someone travelled'],
  ['showcas(e|es|ed|ing)', 'show'],
  ['craft(ed|ing|s)?', 'made, wrote, built'],
  ['curated', 'chosen'],
  ['bespoke', 'custom'],
  ['meticulous(ly)?', 'careful, or show the care'],
  ['intricat(e|ely)|intricacies', 'detailed, or cut it'],
  ['pivotal', 'important, or say why'],
  ['crucial(ly)?', 'important, or say why'],
  ['paramount', 'important'],
  ['foster(s|ed|ing)?', 'encourage, build'],
  ['harness(es|ed|ing)?', 'use'],
  ['streamlin(e|es|ed|ing)', 'simplify'],
  ['supercharg(e|es|ed|ing)', 'cut it'],
  ['reimagin(e|es|ed|ing)', 'redo, rethink'],
  ['underscor(e|es|ed|ing)', 'shows'],
  ['vibrant', 'cut it'],
  ['comprehensive', 'full, complete, or cut it'],
  ['holistic', 'cut it'],
  ['multifaceted', 'cut it'],
  ['nuanced', 'say what the nuance is'],
  ['synerg(y|ies|istic)', 'cut it'],
  ['plethora', 'many'],
  ['myriad', 'many'],
  ['treasure trove', 'cut it'],
  ['captivating|stunning|breathtaking', 'cut it'],
  ['effortless(ly)?', 'easy, or cut it'],
  ['thriv(e|es|ed|ing)', 'cut it'],
  ['striv(e|es|ed|ing)', 'try, work'],
  ['commendable|noteworthy', 'cut it'],
  ['boasts?', 'has'],
  ['nestled|bustling', 'cut it'],
  ['ever[- ](evolving|changing)', 'cut it'],
  ['fast[- ]paced', 'cut it'],
  ['detail[- ]oriented|results[- ](driven|oriented)|self[- ]starter|team player', 'show it with an example'],
  ['lifelong learner|quick learner', 'cut it'],
  ['aspiring', 'say what you do now'],
  ['enthusiast', 'say what you do'],
  // Stock phrases
  ['in today\'s', 'cut the opener'],
  ['in the world of', 'cut the opener'],
  ['at its core', 'cut it'],
  ['at the heart of', 'cut it'],
  ['at the intersection of', 'say both fields plainly'],
  ['when it comes to', 'cut it'],
  ['it\'?s worth noting|it is worth noting|it is important to note|it\'?s important to note', 'just say it'],
  ['needless to say', 'cut it'],
  ['in conclusion|in summary|to sum up', 'cut it'],
  ['plays? an? (key|crucial|vital|pivotal|significant|important) role', 'say what it does'],
  ['serves? as an?', 'is'],
  ['stands? as an?', 'is'],
  ['a wide (range|variety|array) of', 'many, or list them'],
  ['look no further', 'cut it'],
  ['dive (deep )?into|deep dive', 'look at'],
  ['take[sn]? (it|this|you|your \\w+) to the next level', 'cut it'],
  ['the power of', 'cut it'],
  ['more than just', 'say what it is'],
  ['whether you\'?re', 'cut the opener'],
  ['hit the ground running|think outside the box|wear(ing)? many hats', 'cut it'],
  ['double[- ]edged sword|paradigm shift', 'cut it'],
  ['i\'?m (excited|thrilled|delighted) to', 'cut it'],
  ['feel free to|don\'?t hesitate to', 'cut it'],
  ['let\'?s connect', 'give the address'],
  ['welcome to my', 'cut it'],
  ['driven by a', 'cut it'],
  ['with a (keen|strong|deep) (eye|interest|focus|passion)', 'cut it'],
];

/** [pattern, note]. Regular expressions, matched as written. */
const WARNED = [
  [/—/g, 'em dash: use a comma, a colon, or two sentences'],
  [/(?<![0-9]) – (?![0-9])/g, 'spaced dash: use a comma, a colon, or two sentences'],
  [/!/g, 'exclamation mark'],
  [/(?![\u2190-\u21FF\u2733])\p{Extended_Pictographic}/gu, 'emoji'],
  [/\b(not|isn't|aren't|wasn't) (just|only|merely|simply)\b/gi, '"not just X, but Y" framing: say Y'],
  [/\b(it|this|that)(’|')s not [^.]{3,60}[,.;] (it|this|that)(’|')s\b/gi, '"it\'s not X, it\'s Y" framing: say Y'],
  [/\bThe (result|catch|upshot|takeaway|bottom line|answer|kicker|twist|point|goal|idea)\s*[:?]/g, 'colon reveal: write it as a plain sentence'],
  [/(^|[.?!]\s+)(Moreover|Furthermore|Additionally|Importantly|Notably|Ultimately|Essentially|Fundamentally|Overall|That said|In short|Simply put|Put simply),/g, 'throat-clearing opener'],
  [/(^|[.?!]\s+)(So,|So (?!far\b)|Now,|Here's the thing|Let's )/g, 'chatty opener'],
  [/, (ensuring|enabling|allowing|making|providing|offering|highlighting|demonstrating|reflecting|emphasizing|emphasising|creating)\b/gi, 'trailing "-ing" clause: start a new sentence'],
  [/\b(truly|incredibly|extremely|absolutely|deeply|highly|remarkably|significantly)\b/gi, 'intensifier: cut it or give the number'],
  [/\b(various|numerous|several key|a number of)\b/gi, 'vague count: give the number'],
  [/\bboth [^.]{3,40} and [^.]{3,40} alike\b/gi, '"both X and Y alike"'],
];

const TITLE_SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with', 'vs']);

const banned = BANNED.map(([source, fix]) => [new RegExp(`(?<![\\w-])(${source})(?![\\w-])`, 'gi'), fix]);

/**
 * @param {string} text
 * @param {{title?: boolean}} options  title: the text is a heading
 * @returns {{level: 'ban'|'warn', match: string, note: string, index: number}[]}
 */
export function check(text, { title = false } = {}) {
  const out = [];
  const s = String(text ?? '');
  if (!s.trim()) return out;
  for (const [re, fix] of banned) {
    // "robust standard errors" and "robustness" are terms of art in my field, not filler.
    for (const m of s.matchAll(re)) out.push({ level: 'ban', match: m[1], note: fix, index: m.index });
  }
  for (const [re, note] of WARNED) {
    for (const m of s.matchAll(re)) out.push({ level: 'warn', match: m[0].trim() || m[0], note, index: m.index });
  }
  if (title) {
    const clean = s.replace(/\*/g, '').trim();
    if (/\?$/.test(clean)) out.push({ level: 'warn', match: '?', note: 'a heading phrased as a question', index: clean.length - 1 });
    if (/:\s/.test(clean)) out.push({ level: 'warn', match: ':', note: 'a "Title: subtitle" heading', index: clean.indexOf(':') });
    const words = clean.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w));
    const capped = words.slice(1).filter((w) => !TITLE_SMALL.has(w.toLowerCase()) && /^[A-Z][a-z]/.test(w));
    if (words.length >= 5 && capped.length / (words.length - 1) > 0.6) out.push({ level: 'warn', match: clean, note: 'Title Case: write headings like sentences', index: 0 });
  }
  return out.sort((a, b) => a.index - b.index);
}

/** One line for a person: "leverage (use), em dash". Empty when the text is clean. */
export function summarize(findings) {
  const seen = new Set();
  return findings.filter((f) => { const k = f.match.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .map((f) => (f.level === 'ban' ? `“${f.match}” (${f.note})` : f.note)).join('; ');
}

export const counts = { banned: BANNED.length, warned: WARNED.length };
