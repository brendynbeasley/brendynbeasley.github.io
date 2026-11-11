/**
 * copycheck.js: catches wording that reads as machine-written.
 *
 * One list, two users. The Studio runs it under every text box as you type,
 * and tools/check-copy.mjs runs it over the whole site before a change goes
 * out. It has no dependencies and does not touch the page, so it works in
 * the browser and in Node alike.
 *
 * Three lists:
 *   WORDS       stock words and phrases that give generated text away
 *   SENTENCES   sentence shapes that do the same: "not just X, but Y",
 *               "The result? Y.", openers like "Moreover," and so on
 *   SYMBOLS     characters people rarely type: em dashes, arrows, emoji,
 *               bullet and check-mark glyphs, the one-character ellipsis
 *
 * Two levels:
 *   ban   fails tools/check-copy.mjs
 *   warn  worth a second look, sometimes fine
 *
 * check(text, { title: true }) also applies the rules for headings.
 */

/** WORDS. [pattern, what to do instead]. Matched as whole words, any case. Always banned. */
const WORDS = [
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
  // More stock vocabulary
  ['navigat(e|es|ed|ing) the', 'cut it'],
  ['complexit(y|ies) of', 'cut it'],
  ['insights?', 'say what you found'],
  ['actionable', 'cut it'],
  ['key takeaways?', 'cut it'],
  ['unprecedented', 'say what is new, with a date'],
  ['dynamic', 'cut it, or say what changes'],
  ['resonat(e|es|ed|ing)', 'cut it'],
  ['underpin(s|ned|ning)?', 'support, or say how'],
  ['bolster(s|ed|ing)?', 'add to, or say how'],
  ['spearhead(s|ed|ing)?', 'led, started'],
  ['facilitat(e|es|ed|ing)', 'help, run'],
  ['endeavou?rs?', 'work, project'],
  ['pave the way', 'cut it'],
  ['shed(s|ding)? light on', 'show, explain'],
  ['deeper understanding', 'cut it'],
  ['embrac(e|es|ed|ing)', 'use, accept'],
  ['illuminat(e|es|ed|ing)', 'show'],
  ['unravel(s|ed|ing)?', 'explain'],
  ['garner(s|ed|ing)?', 'get, win'],
  ['beacon', 'cut it'],
  ['symphony|labyrinth', 'cut it'],
  ['hidden gem', 'cut it'],
  ['interplay', 'say how the two affect each other'],
  ['tailored', 'made for, or cut it'],
  ['vital', 'important, or say why'],
  ['in essence', 'cut it'],
  ['it\'?s no secret', 'cut it'],
  ['rest assured', 'cut it'],
  ['in an era of', 'cut the opener'],
  ['speaks volumes', 'say what it shows'],
  ['a reminder that', 'cut it'],
  ['stands? out', 'say what is different'],
  ['seamless', 'cut it'],
  ['robust(ly)? (solution|framework|platform|system)', 'say what makes it hold up'],
  ['valuable (insights?|lessons?|resource)', 'say what it is'],
  ['explor(e|es|ed|ing) the (world|realm|intricacies|nuances)', 'look at'],
  ['navigat(e|es|ed|ing) (the )?(complexities|challenges)', 'cut it'],
];

/** SENTENCES. [pattern, note, level]. Sentence shapes that read as generated. */
const SENTENCES = [
  // Framing by contrast
  [/\b(not|isn't|aren't|wasn't) (just|only|merely|simply)\b/gi, '"not just X, but Y": say Y', 'ban'],
  [/\bnot only\b[^.]{3,80}\bbut (also)?\b/gi, '"not only X but also Y": say both plainly', 'ban'],
  [/\b(it|this|that)(’|')s not [^.]{3,60}[,.;] (it|this|that)(’|')s\b/gi, '"it\'s not X, it\'s Y": say Y', 'ban'],
  [/\b(isn't|is not|wasn't|was not) about [^.]{3,60}\. (It|This)(’|')?s? (is )?about\b/gi, '"isn\'t about X. It\'s about Y": say Y', 'ban'],
  [/\bNo [a-z]+[^.]{0,30}\. No [a-z]+[^.]{0,30}\. (Just|Only)\b/g, '"No X. No Y. Just Z.": write one sentence', 'ban'],
  // Reveals and set-ups
  [/\bThe (result|catch|upshot|takeaway|bottom line|answer|kicker|twist|point|goal|idea|reason|truth|secret)\s*[:?]/g, '"The result?" reveal: write it as a plain sentence', 'ban'],
  [/(^|[.!]\s+)(Why|What|How)\b[^.?]{3,60}\?\s+(Because|It|The answer)\b/g, 'a question you answer yourself: just state it', 'ban'],
  [/(^|[.?!]\s+)Here(’|')s (why|what|how|the thing)\b/g, '"Here\'s why": just say it', 'ban'],
  [/(^|[.?!]\s+)(Imagine|Picture this)\b/g, '"Imagine..." opener: start with the fact', 'ban'],
  [/(^|[.?!]\s+)(Make no mistake|Let(’|')s be honest|To be clear|The truth is|It turns out),?/g, 'throat-clearing opener', 'ban'],
  // Filler openers and connectors
  [/(^|[.?!]\s+)(Moreover|Furthermore|Additionally|Importantly|Notably|Ultimately|Essentially|Fundamentally|Overall|That said|In short|Simply put|Put simply|In other words|What(’|')s more|Crucially|Interestingly),/g, 'throat-clearing opener: cut it', 'ban'],
  [/(^|[.?!]\s+)(So,|So (?!far\b|much\b|many\b|few\b|long\b)|Now,|Let(’|')s )/g, 'chatty opener', 'warn'],
  [/(^|[.?!]\s+)From [^,.]{2,40} to [^,.]{2,40}, /g, '"From X to Y," sweep: name what you mean', 'warn'],
  [/(^|[.?!]\s+)Whether you(’|')?re\b/g, '"Whether you\'re X or Y" opener', 'ban'],
  // Endings and padding
  [/, (ensuring|enabling|allowing|making|providing|offering|highlighting|demonstrating|reflecting|emphasizing|emphasising|creating|showcasing|underscoring|fostering)\b/gi, 'trailing "-ing" clause: start a new sentence', 'ban'],
  [/(^|[.?!]\s+)(And that(’|')s|That(’|')s the (power|point|beauty|magic))\b/g, 'a tidy closing line: cut it', 'ban'],
  [/\b(truly|incredibly|extremely|absolutely|deeply|highly|remarkably|significantly|genuinely|undeniably)\b/gi, 'intensifier: cut it or give the number', 'warn'],
  [/\b(various|numerous|several key|a number of|countless)\b/gi, 'vague count: give the number', 'warn'],
  [/\bboth [^.]{3,40} and [^.]{3,40} alike\b/gi, '"both X and Y alike"', 'ban'],
  [/\b(\w+), (\w+),? and (\w+) (alike|all)\b/gi, 'a list of three that ends in "alike": name one', 'warn'],
  [/[^.?!]{260,}[.?!]/g, 'a very long sentence: split it', 'warn'],
];

/** SYMBOLS. [pattern, note, level]. Characters people rarely type by hand. */
const SYMBOLS = [
  [/—/g, 'em dash: use a comma, a colon, or two sentences', 'ban'],
  [/(?<![0-9]) [–-] (?![0-9])/g, 'spaced dash: use a comma, a colon, or two sentences', 'ban'],
  [/(?![←-⇿✳])\p{Extended_Pictographic}/gu, 'emoji', 'ban'],
  [/[←-⇿⟵-⟿]/g, 'arrow: use words ("to", "then", "becomes"), except in a menu path', 'warn'],
  [/[•▪▸►◆◇■□●○]/g, 'bullet glyph: use a real list', 'ban'],
  [/[✓✔✗✘☑☐]/g, 'check mark: use words', 'ban'],
  [/…/g, 'one-character ellipsis: cut it, or type three dots if you mean a pause', 'ban'],
  [/!/g, 'exclamation mark', 'warn'],
  [/ · /g, 'middle dot used as a separator: write a sentence or a list', 'warn'],
  [/;/g, 'semicolon: two sentences usually read better', 'warn'],
  [/\s&\s/g, 'ampersand in prose: write "and"', 'warn'],
];

const TITLE_SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with', 'vs']);

const banned = WORDS.map(([source, fix]) => [new RegExp(`(?<![\\w-])(${source})(?![\\w-])`, 'gi'), fix]);

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
  for (const [re, note, level] of [...SENTENCES, ...SYMBOLS]) {
    if (title && /ampersand|semicolon/.test(note)) continue;  // "Money & Banking" is a name, not prose
    for (const m of s.matchAll(re)) out.push({ level, match: m[0].trim() || m[0], note, index: m.index });
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

const levels = (list, level) => list.filter((r) => r[2] === level).length;
export const counts = {
  words: WORDS.length, sentences: SENTENCES.length, symbols: SYMBOLS.length,
  banned: WORDS.length + levels(SENTENCES, 'ban') + levels(SYMBOLS, 'ban'),
  warned: levels(SENTENCES, 'warn') + levels(SYMBOLS, 'warn'),
};
