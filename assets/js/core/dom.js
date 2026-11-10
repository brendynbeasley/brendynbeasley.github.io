/**
 * dom.js — a tiny hyperscript helper and a handful of DOM utilities.
 * The whole site is rendered with h(); there is no framework and no build step.
 */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'path', 'circle', 'line', 'polyline', 'rect', 'g', 'defs', 'text']);

/**
 * h('a.btn', { href }, 'Open', icon('arrow'))
 * Text children are always inserted as text nodes, so content can never inject markup.
 */
export function h(spec, props, ...kids) {
  const [tag, ...classes] = spec.split('.');
  const el = SVG_TAGS.has(tag) ? document.createElementNS(SVG_NS, tag) : document.createElement(tag || 'div');
  if (classes.length) el.setAttribute('class', classes.join(' '));
  if (props && (props instanceof Node || typeof props !== 'object' || Array.isArray(props))) { kids.unshift(props); props = null; }
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', [el.getAttribute('class'), v].filter(Boolean).join(' '));
    else if (k === 'style' && typeof v === 'object') for (const [p, val] of Object.entries(v)) el.style.setProperty(p, val);
    else if (k === 'data') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'href' || k === 'src') el.setAttribute(k, safeUrl(v));
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  append(el, kids);
  return el;
}

export function append(el, kids) {
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export const clear = (el) => { while (el.firstChild) el.firstChild.remove(); return el; };

/** Only let through URLs that are safe to put in href/src. */
export function safeUrl(url) {
  const s = String(url ?? '').trim();
  if (!s) return '';
  if (/^(https?:|mailto:|tel:)/i.test(s)) return s;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return 'about:blank';
  return s;
}

/** "https://github.com/a/b/" → "github.com/a/b" */
export const prettyUrl = (url = '') => String(url).replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');

export const isExternal = (url = '') => /^https?:\/\//i.test(url) && !url.startsWith(location.origin);

/** Attributes for a link: external ones open in a new tab. */
export const linkAttrs = (url) => (isExternal(url) ? { href: url, target: '_blank', rel: 'noopener' } : { href: url });

const ICONS = {
  arrow: 'M7 17 17 7M8 7h9v9',
  right: 'M5 12h14M13 6l6 6-6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6 6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  up: 'M12 19V5M6 11l6-6 6 6',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  code: 'M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14',
  github: 'M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21',
  linkedin: 'M6.5 9.5v8M6.5 6.5v.01M10.5 17.5v-5a3 3 0 0 1 6 0v5M10.5 9.5v8M3 3h18v18H3z',
  file: 'M14 3H6v18h12V7zM14 3v4h4M9 13h6M9 17h6',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  image: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M15.5 9.5h.01',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
};

export function icon(name, cls = '') {
  const svg = h('svg', { viewBox: '0 0 24 24', class: `ico ${cls}`.trim(), 'aria-hidden': 'true' });
  svg.append(h('path', { d: ICONS[name] || ICONS.arrow }));
  return svg;
}

/** Split text into word spans. Words wrapped in *asterisks* become <em>. */
export function words(text, cls = 'w') {
  const out = [];
  String(text).split(/(\*[^*]+\*)/g).forEach((part) => {
    const em = part.startsWith('*') && part.endsWith('*') && part.length > 2;
    (em ? part.slice(1, -1) : part).split(/(\s+)/).forEach((tok) => {
      if (!tok) return;
      if (/^\s+$/.test(tok)) out.push(' ');
      else out.push(h(`span.${cls}`, em ? h('em', tok) : tok));
    });
  });
  return out;
}

/** Inline text where *asterisks* mean emphasis. */
export function emph(text) {
  return String(text).split(/(\*[^*]+\*)/g).map((part) =>
    part.startsWith('*') && part.endsWith('*') && part.length > 2 ? h('em', part.slice(1, -1)) : part);
}
