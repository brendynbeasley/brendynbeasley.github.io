#!/usr/bin/env node
/**
 * tools/check-copy.mjs: reads every word a visitor can see and flags
 * anything that sounds machine-written.
 *
 *   node tools/check-copy.mjs          check the site
 *   node tools/check-copy.mjs --all    also list what it found in the study texts
 *
 * The rules live in assets/js/core/copycheck.js, the same file the Studio uses.
 * It exits with an error if it finds a banned word in the site's own copy.
 *
 * Study titles, questions, findings and citations come from the research
 * repositories and are the author's own writing, so they are reported but
 * never fail the check.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, counts } from '../assets/js/core/copycheck.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const showAll = process.argv.includes('--all');

/** Keys whose values are headings. */
const TITLE_KEYS = new Set(['title', 'heading', 'label', 'navLabel', 'tagline']);
/** Keys that hold addresses, identifiers and other things that are not prose. */
const SKIP_KEYS = new Set(['slug', 'url', 'repo', 'href', 'src', 'image', 'source', 'type', 'template', 'theme', 'id', 'key', 'fips', 'email', 'github', 'linkedin', 'resume', 'docs', 'figures', 'rings', 'start', 'end']);

const found = [];
const note = (file, where, text, findings, own = true) => { for (const f of findings) found.push({ file, where, text, own, ...f }); };

function walk(file, value, path = '', own = true) {
  if (typeof value === 'string') {
    const key = path.split('.').pop().replace(/\[\d+\]$/, '');
    if (SKIP_KEYS.has(key) || /^https?:|^assets\/|^#/.test(value)) return;
    note(file, path, value, check(value, { title: TITLE_KEYS.has(key) }), own);
  } else if (Array.isArray(value)) value.forEach((v, i) => walk(file, v, `${path}[${i}]`, own));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { if (!SKIP_KEYS.has(k)) walk(file, v, path ? `${path}.${k}` : k, own); }
}

/** Visible text of an HTML file: tags, scripts, styles and comments removed. */
const htmlText = (html) => html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ')
  .split(/<[^>]+>/).map((t) => t.replace(/&amp;/g, '&').replace(/&[a-z]+;/g, ' ').trim()).filter((t) => t.length > 2);

/** Sentences a visitor might read inside JavaScript: string literals with at least three words. */
function jsStrings(code) {
  const out = [];
  const bare = code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
  for (const m of bare.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
    const s = (m[1] ?? m[2] ?? m[3]).replace(/\$\{[^}]*\}/g, 'N').replace(/\\(.)/g, '$1');
    if (s.split(/\s+/).length >= 3 && /[a-z]{3}/.test(s) && !/[{}<>=;]|^\s*[.#@\w-]+\s*$|\b(px|rgba?|var\(|function|return|const)\b/.test(s)) out.push(s);
  }
  return out;
}

async function files(dir, ext) {
  const out = [];
  for (const entry of await readdir(join(ROOT, dir), { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await files(path, ext));
    else if (entry.name.endsWith(ext)) out.push(path);
  }
  return out;
}

// 1. Content files.
for (const file of await files('content', '.json')) {
  if (file.includes('content/data/') || file.endsWith('literature.json')) continue;
  const data = JSON.parse(await readFile(join(ROOT, file), 'utf8'));
  if (file.endsWith('research.json')) {
    walk(file, data.themes, 'themes', true);
    walk(file, data.items, 'items', false);
  } else walk(file, data);
}
// 2. Pages.
for (const file of ['index.html', '404.html', 'page/index.html', 'studio/index.html', ...(await files('.', 'index.html')).filter((f) => !/^(page|studio|node_modules|tools)\//.test(f) && f !== 'index.html')]) {
  try { for (const text of htmlText(await readFile(join(ROOT, file), 'utf8'))) note(file, 'text', text, check(text)); } catch { /* not there */ }
}
// 3. Words inside the scripts, and the README.
for (const file of await files('assets/js', '.js')) {
  if (file.endsWith('copycheck.js')) continue;
  for (const text of jsStrings(await readFile(join(ROOT, file), 'utf8'))) note(file, 'string', text, check(text));
}
{ // The README, leaving out code blocks.
  let fenced = false;
  for (const line of (await readFile(join(ROOT, 'README.md'), 'utf8')).split('\n')) {
    if (line.startsWith('```')) { fenced = !fenced; continue; }
    if (!fenced) note('README.md', 'line', line, check(line.replace(/`[^`]*`/g, '')));
  }
}

const mine = found.filter((f) => f.own), theirs = found.filter((f) => !f.own);
const bans = mine.filter((f) => f.level === 'ban'), warns = mine.filter((f) => f.level === 'warn');
const show = (f) => console.log(`  ${f.level === 'ban' ? 'BAN ' : 'warn'} ${relative(ROOT, join(ROOT, f.file))}  ${f.where}\n       “${f.match}”: ${f.note}\n       ${f.text.length > 110 ? `${f.text.slice(0, 110)}…` : f.text}`);

console.log(`Checked against ${counts.words} words and phrases, ${counts.sentences} sentence patterns and ${counts.symbols} symbols (${counts.banned} banned, ${counts.warned} to review).\n`);
if (bans.length) { console.log('Banned wording in the site copy:'); bans.forEach(show); console.log(); }
if (warns.length) { console.log('Worth a second look:'); warns.forEach(show); console.log(); }
console.log(`Site copy: ${bans.length} banned, ${warns.length} to review.`);
console.log(`Study texts (your own writing, not enforced): ${theirs.filter((f) => f.level === 'ban').length} banned words, ${theirs.filter((f) => f.level === 'warn').length} patterns.${showAll ? '' : ' Run with --all to list them.'}`);
if (showAll) theirs.forEach(show);
process.exit(bans.length ? 1 : 0);
