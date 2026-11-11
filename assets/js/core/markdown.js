/**
 * markdown.js — a small, safe Markdown reader for page text.
 *
 * It builds DOM nodes directly and never touches innerHTML, so nothing typed
 * into a text block can turn into a script.
 *
 * Supported: paragraphs, ## and ### headings, - and 1. lists, > quotes,
 * **bold**, *italic*, `code` and [links](https://…).
 *
 * With { full: true } (long documents such as a study report) it also reads
 * #### headings, tables, --- rules, ![images](path) and _italic_, and gives
 * every ## heading an id so a table of contents can link to it. Image paths
 * are read relative to { base }.
 */

import { h, linkAttrs, safeUrl } from './dom.js';
import { Store } from './store.js';

const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
const INLINE_FULL = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|(?<![\w])_[^_\n]+_(?![\w]))/g;

export function inline(text, full = false) {
  return String(text).split(full ? INLINE_FULL : INLINE).filter(Boolean).map((part) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return h('strong', inline(part.slice(2, -2), full));
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return h('em', part.slice(1, -1));
    if (full && part.startsWith('_') && part.endsWith('_') && part.length > 2) return h('em', part.slice(1, -1));
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return h('code', part.slice(1, -1));
    const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (link) {
      const url = safeUrl(link[2].startsWith('/') ? Store.url(link[2]) : link[2]);
      return h('a.link', linkAttrs(url), link[1]);
    }
    return part;
  });
}

export const slugify = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

export function markdown(source = '', { full = false, base = '' } = {}) {
  const out = [];
  const il = (s) => inline(s, full);
  const blocks = String(source).replace(/\r\n?/g, '\n').split(/\n{2,}/);
  for (const raw of blocks) {
    const block = raw.trim();
    if (!block) continue;
    const lines = block.split('\n');
    if (full && /^-{3,}$/.test(block)) out.push(h('hr'));
    else if (full && /^####\s+/.test(block)) out.push(h('h4', il(block.replace(/^####\s+/, ''))));
    else if (/^###\s+/.test(block)) out.push(h('h3', full ? { id: slugify(block.replace(/^###\s+/, '')) } : null, il(block.replace(/^###\s+/, ''))));
    else if (/^##\s+/.test(block)) out.push(h('h2', full ? { id: slugify(block.replace(/^##\s+/, '')) } : null, il(block.replace(/^##\s+/, ''))));
    else if (full && /^#\s+/.test(block)) out.push(h('h2', il(block.replace(/^#\s+/, ''))));
    else if (full && lines.length >= 2 && lines.every((l) => /^\s*\|/.test(l)) && /^[\s|:-]+$/.test(lines[1])) {
      const [head, , ...body] = lines;
      out.push(h('div.doc__table', h('table',
        h('thead', h('tr', cells(head).map((c) => h('th', il(c))))),
        h('tbody', body.map((r) => h('tr', cells(r).map((c) => h('td', il(c)))))))));
    } else if (full && /^!\[[^\]]*\]\([^)\s]+\)$/.test(block)) {
      const [, alt, src] = block.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
      const url = /^(https?:|\/)/.test(src) ? src : new URL(src, new URL(base || '.', location.href)).href;
      out.push(h('figure.doc__fig', h('img', { src: safeUrl(url), alt, loading: 'lazy' }), alt && h('figcaption.label', alt)));
    }
    else if (lines.every((l) => /^\s*[-*]\s+/.test(l))) out.push(h('ul', lines.map((l) => h('li', il(l.replace(/^\s*[-*]\s+/, ''))))));
    else if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) out.push(h('ol', lines.map((l) => h('li', il(l.replace(/^\s*\d+[.)]\s+/, ''))))));
    else if (lines.every((l) => /^>\s?/.test(l))) out.push(h('blockquote', il(lines.map((l) => l.replace(/^>\s?/, '')).join(' '))));
    else if (full && lines.length > 1 && lines.every((l) => /^\s*([-*]|\d+[.)])\s+/.test(l) || /^\s{2,}\S/.test(l))) {
      // A list whose items wrap onto indented lines.
      const items = [];
      for (const l of lines) { if (/^\s*([-*]|\d+[.)])\s+/.test(l)) items.push(l.replace(/^\s*([-*]|\d+[.)])\s+/, '')); else items[items.length - 1] += ` ${l.trim()}`; }
      out.push(h(/^\s*\d/.test(lines[0]) ? 'ol' : 'ul', items.map((s) => h('li', il(s)))));
    }
    else out.push(h('p', il(lines.join(' '))));
  }
  return out;
}
