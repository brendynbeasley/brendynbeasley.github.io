/**
 * markdown.js — a small, safe Markdown reader for page text.
 *
 * It builds DOM nodes directly and never touches innerHTML, so nothing typed
 * into a text block can turn into a script.
 *
 * Supported: paragraphs, ## and ### headings, - and 1. lists, > quotes,
 * **bold**, *italic*, `code` and [links](https://…).
 */

import { h, linkAttrs, safeUrl } from './dom.js';
import { Store } from './store.js';

const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;

export function inline(text) {
  return String(text).split(INLINE).filter(Boolean).map((part) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return h('strong', inline(part.slice(2, -2)));
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return h('em', part.slice(1, -1));
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return h('code', part.slice(1, -1));
    const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (link) {
      const url = safeUrl(link[2].startsWith('/') ? Store.url(link[2]) : link[2]);
      return h('a.link', linkAttrs(url), link[1]);
    }
    return part;
  });
}

export function markdown(source = '') {
  const out = [];
  const blocks = String(source).replace(/\r\n?/g, '\n').split(/\n{2,}/);
  for (const raw of blocks) {
    const block = raw.trim();
    if (!block) continue;
    const lines = block.split('\n');
    if (/^###\s+/.test(block)) out.push(h('h3', inline(block.replace(/^###\s+/, ''))));
    else if (/^##\s+/.test(block)) out.push(h('h2', inline(block.replace(/^##\s+/, ''))));
    else if (lines.every((l) => /^\s*[-*]\s+/.test(l))) out.push(h('ul', lines.map((l) => h('li', inline(l.replace(/^\s*[-*]\s+/, ''))))));
    else if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) out.push(h('ol', lines.map((l) => h('li', inline(l.replace(/^\s*\d+[.)]\s+/, ''))))));
    else if (lines.every((l) => /^>\s?/.test(l))) out.push(h('blockquote', inline(lines.map((l) => l.replace(/^>\s?/, '')).join(' '))));
    else out.push(h('p', inline(lines.join(' '))));
  }
  return out;
}
