/**
 * blocks.js — the building blocks of a page.
 *
 * A page is a list of blocks. Each block is a class that knows two things:
 *
 *   render()        how to draw itself from its data
 *   static fields   what can be edited, which the Studio turns into a form
 *
 * To invent a new kind of block, add a class here and register it at the
 * bottom. It will show up in the Studio's "Add a block" menu on its own.
 */

import { h, icon, linkAttrs, emph } from '../core/dom.js';
import { Store } from '../core/store.js';
import { markdown } from '../core/markdown.js';
import { Counter, Reveal } from '../core/motion.js';
import { WindowCard } from '../ui/cards.js';
import { ResearchIndex } from '../ui/research.js';
import { glyph } from '../ui/glyphs.js';
import { TaylorExhibit } from '../exhibits/taylor.js';
import { MinnesotaMap } from '../exhibits/minnesota.js';
import { BankMonitor } from '../exhibits/bankmonitor.js';

const THEMES = ['foundations', 'pricing', 'strategy', 'exclusion', 'measurement', 'regulation', 'macro', 'innovation', 'applied'];
const href = (url = '') => (url.startsWith('/') ? Store.url(url) : url);

/** Fields shared by every block that shows a linked page with a preview. */
const PREVIEW_FIELDS = [
  { key: 'title', label: 'Title', type: 'text', title: true },
  { key: 'kind', label: 'Kind', type: 'text', hint: 'For example: Web app, Study tool, Dashboard' },
  { key: 'summary', label: 'What it is', type: 'textarea' },
  { key: 'url', label: 'Live page', type: 'url', hint: 'The GitHub Pages address, if it has one' },
  { key: 'repo', label: 'Code', type: 'url', hint: 'The repository on GitHub' },
  { key: 'image', label: 'Screenshot', type: 'image', hint: 'Optional. Without one, the card shows the live page.' },
  { key: 'live', label: 'Allow the live preview', type: 'toggle', default: true, hint: 'Turn off for very heavy pages' },
];

export class Block {
  static type = 'block';
  static label = 'Block';
  static about = '';
  static fields = [];
  static sample = {};

  /** @param {object} data  this block's content  @param {object} ctx  site-wide data and facts */
  constructor(data = {}, ctx = {}) { this.data = data; this.ctx = ctx; }

  fill(text) { return Store.fill(text, this.ctx.facts || {}); }

  heading() {
    return this.data.heading ? h('h2.block__heading', { 'data-reveal': '' }, emph(this.fill(this.data.heading))) : null;
  }

  /** Subclasses return the inside of the block. */
  body() { return null; }

  render() {
    return h(`section.block.block--${this.constructor.type}`, this.heading(), this.body());
  }
}

class TextBlock extends Block {
  static type = 'text';
  static label = 'Text';
  static about = 'Paragraphs, lists and links. Markdown works.';
  static fields = [
    { key: 'heading', label: 'Heading', type: 'text', title: true },
    { key: 'body', label: 'Text', type: 'markdown' },
  ];
  static sample = { heading: '', body: 'Write here. **Bold**, *italic* and [links](https://example.com) all work.' };

  body() { return h('div.prose', { 'data-reveal': '' }, markdown(this.fill(this.data.body))); }
}

class StatsBlock extends Block {
  static type = 'stats';
  static label = 'Numbers';
  static about = 'A row of big numbers with a line under each.';
  static fields = [
    { key: 'heading', label: 'Heading', type: 'text', title: true },
    { key: 'items', label: 'Numbers', type: 'list', title: 'value', item: [
      { key: 'value', label: 'Number', type: 'text' },
      { key: 'label', label: 'What it counts', type: 'text' },
    ] },
  ];
  static sample = { items: [{ value: '12', label: 'of something' }, { value: '3', label: 'of something else' }] };

  body() {
    return h('div.stats', (this.data.items || []).map((s, i) => {
      const value = Store.fill(s.value, Object.fromEntries(Object.entries(this.ctx.facts || {}).map(([k, v]) => [k, String(v)])));
      const n = h('span.stat__n.display', value);
      if (/^\d+$/.test(value)) Counter.run(n, Number(value));
      return h('div.stat', { 'data-reveal': '', style: { '--i': i } }, n, h('p.stat__l', this.fill(s.label)));
    }));
  }
}

class CardsBlock extends Block {
  static type = 'cards';
  static label = 'Cards';
  static about = 'A grid of plates. Give a card a link and the whole card becomes clickable.';
  static fields = [
    { key: 'heading', label: 'Heading', type: 'text', title: true },
    { key: 'items', label: 'Cards', type: 'list', title: 'title', item: [
      { key: 'label', label: 'Small label', type: 'text' },
      { key: 'title', label: 'Title', type: 'text', title: true },
      { key: 'text', label: 'Text', type: 'textarea' },
      { key: 'href', label: 'Link', type: 'url' },
      { key: 'theme', label: 'Corner drawing', type: 'select', options: THEMES },
    ] },
  ];
  static sample = { items: [{ label: '01', title: 'First card', text: 'What this card is about.', theme: 'measurement' }, { label: '02', title: 'Second card', text: 'And this one.', theme: 'macro' }] };

  body() {
    return h('div.cards', (this.data.items || []).map((c, i) => {
      const inner = [
        h('div.plate__head', h('span.label', c.label || String(i + 1).padStart(2, '0')), glyph(c.theme || THEMES[i % THEMES.length], c.title)),
        h('h3.plate__title', c.title),
        c.text && h('p.plate__text', this.fill(c.text)),
        c.href && h('div.plate__foot', h('span.plate__go', 'Open', icon('arrow'))),
      ];
      const attrs = { 'data-reveal': 'wipe', style: { '--i': i % 3 } };
      return c.href ? h('a.plate', { ...attrs, ...linkAttrs(href(c.href)) }, inner) : h('article.plate', attrs, inner);
    }));
  }
}

class StepsBlock extends Block {
  static type = 'steps';
  static label = 'Steps';
  static about = 'A numbered sequence: a method, a timeline, a list of roles.';
  static fields = [
    { key: 'heading', label: 'Heading', type: 'text', title: true },
    { key: 'items', label: 'Steps', type: 'list', title: 'title', item: [
      { key: 'title', label: 'Title', type: 'text', title: true },
      { key: 'meta', label: 'Side note', type: 'text', hint: 'A date, a place, a file name' },
      { key: 'text', label: 'Text', type: 'markdown' },
    ] },
  ];
  static sample = { items: [{ title: 'First', meta: '', text: 'What happens first.' }, { title: 'Then', meta: '', text: 'What happens next.' }] };

  body() {
    return h('ol.steps', (this.data.items || []).map((s, i) => h('li.step', { 'data-reveal': '', style: { '--i': Math.min(i, 4) } },
      h('span.step__n.display', String(i + 1).padStart(2, '0')),
      h('div.step__main', h('h3.step__title', s.title), h('div.prose', markdown(this.fill(s.text)))),
      h('span.step__meta.label', s.meta || ''))));
  }
}

class PreviewBlock extends Block {
  static type = 'preview';
  static label = 'Linked page with preview';
  static about = 'One page you built, shown in a browser frame with its live preview.';
  static fields = [{ key: 'heading', label: 'Heading', type: 'text', title: true }, ...PREVIEW_FIELDS];
  static sample = { title: 'My page', kind: 'Web app', summary: 'What it does, in a sentence or two.', url: '', repo: '', image: '', live: true };

  body() { return h('div.preview', new WindowCard(this.data).render(0)); }
}

class GalleryBlock extends Block {
  static type = 'gallery';
  static label = 'Gallery of linked pages';
  static about = 'Several pages side by side, each with its preview.';
  static fields = [
    { key: 'heading', label: 'Heading', type: 'text', title: true },
    { key: 'items', label: 'Pages', type: 'list', title: 'title', item: PREVIEW_FIELDS },
  ];
  static sample = { items: [{ ...PreviewBlock.sample }] };

  body() { return h('div.windows', (this.data.items || []).map((b, i) => new WindowCard(b).render(i))); }
}

class EmbedBlock extends Block {
  static type = 'embed';
  static label = 'Live embed';
  static about = 'Runs one of your interactive pages right inside this page, full width.';
  static fields = [
    { key: 'heading', label: 'Heading', type: 'text', title: true },
    { key: 'url', label: 'Page to embed', type: 'url' },
    { key: 'height', label: 'Height in pixels', type: 'number' },
    { key: 'caption', label: 'Caption', type: 'text' },
  ];
  static sample = { url: '', height: 640, caption: '' };

  body() {
    const { url, height = 640, caption } = this.data;
    if (!url) return h('p.muted', 'Add a page address to embed it here.');
    const frame = h('iframe', {
      src: href(url), title: caption || this.data.heading || 'Embedded page', loading: 'lazy', referrerpolicy: 'no-referrer',
      sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups', style: { height: `${Number(height) || 640}px` },
    });
    return h('figure.embed', { 'data-reveal': '' },
      h('div.window__frame',
        h('div.window__bar', h('span.window__dots', h('i'), h('i'), h('i')), h('span.window__url', url.replace(/^https?:\/\//, '')),
          h('a.window__live', { ...linkAttrs(href(url)), 'aria-pressed': 'true' }, 'Open')),
        frame),
      caption && h('figcaption.label', caption));
  }
}

class ImageBlock extends Block {
  static type = 'image';
  static label = 'Image';
  static about = 'A picture or chart with a caption.';
  static fields = [
    { key: 'src', label: 'Image', type: 'image' },
    { key: 'alt', label: 'Describe it for people who cannot see it', type: 'text' },
    { key: 'caption', label: 'Caption', type: 'text' },
  ];
  static sample = { src: '', alt: '', caption: '' };

  body() {
    if (!this.data.src) return h('p.muted', 'Choose an image to show it here.');
    return h('figure.picture', { 'data-reveal': '' },
      h('img', { src: Store.asset(this.data.src), alt: this.data.alt || '', loading: 'lazy' }),
      this.data.caption && h('figcaption.label', this.data.caption));
  }
}

class QuoteBlock extends Block {
  static type = 'quote';
  static label = 'Pull quote';
  static about = 'One line, set large. Good for a finding.';
  static fields = [
    { key: 'text', label: 'Quote', type: 'textarea' },
    { key: 'cite', label: 'Source', type: 'text' },
  ];
  static sample = { text: 'The one sentence a reader should leave with.', cite: '' };

  body() {
    return h('figure.quote', { 'data-reveal': '' },
      h('blockquote.display', emph(this.fill(this.data.text))),
      this.data.cite && h('figcaption.label', this.data.cite));
  }
}

class CtaBlock extends Block {
  static type = 'cta';
  static label = 'Call to action';
  static about = 'A closing line with a button.';
  static fields = [
    { key: 'title', label: 'Line', type: 'text' },
    { key: 'text', label: 'Supporting text', type: 'textarea' },
    { key: 'label', label: 'Button label', type: 'text' },
    { key: 'href', label: 'Button link', type: 'url' },
  ];
  static sample = { title: 'See the work', text: '', label: 'Open', href: '/#research' };

  body() {
    return h('div.cta', { 'data-reveal': '' },
      h('h2.display', emph(this.fill(this.data.title))),
      this.data.text && h('p.muted', this.fill(this.data.text)),
      this.data.href && h('a.btn.btn--solid', linkAttrs(href(this.data.href)), this.data.label || 'Open', icon('arrow')));
  }
}

class ResearchBlock extends Block {
  static type = 'research';
  static label = 'Research index';
  static about = 'The searchable list of studies, optionally limited to one theme.';
  static fields = [
    { key: 'heading', label: 'Heading', type: 'text', title: true },
    { key: 'theme', label: 'Theme', type: 'select', options: ['all', ...THEMES] },
    { key: 'limit', label: 'Rows before "Show all"', type: 'number' },
  ];
  static sample = { heading: 'Studies', theme: 'all', limit: 12 };

  body() {
    if (!this.ctx.research) return null;
    return new ResearchIndex(this.ctx.research, { theme: this.data.theme || 'all', limit: Number(this.data.limit) || 12 }).render();
  }
}

class BuildsBlock extends Block {
  static type = 'builds';
  static label = 'Everything from the Lab';
  static about = 'Every linked page from the home page, with previews.';
  static fields = [{ key: 'heading', label: 'Heading', type: 'text', title: true }];
  static sample = { heading: 'From the lab' };

  body() { return h('div.windows', (this.ctx.builds?.items || []).filter((b) => !b.draft).map((b, i) => new WindowCard(b).render(i))); }
}

class ExhibitBlock extends Block {
  static type = 'exhibit';
  static label = 'Live exhibit';
  static about = 'One of the working exhibits: the Taylor rule chart, the Minnesota map, the U.S. Bancorp monitor, or the controls for the market behind the page.';
  static fields = [
    { key: 'heading', label: 'Heading', type: 'text', title: true },
    { key: 'kind', label: 'Which exhibit', type: 'select', options: [
      { value: 'taylor', label: 'Taylor rule chart' }, { value: 'minnesota', label: 'Minnesota county map' }, { value: 'usbancorp', label: 'U.S. Bancorp monitor' }, { value: 'market', label: 'Market controls' }] },
  ];
  static sample = { kind: 'taylor' };

  body() {
    const box = h('div.exhibit-slot', { 'data-kind': this.data.kind });
    // Exhibits arrive after their data loads, so they join the scroll reveal late.
    new MutationObserver(() => Reveal.watch(box)).observe(box, { childList: true });
    const study = (slug) => this.ctx.research?.items.find((s) => s.slug === slug);
    const onStudy = this.ctx.openStudy || (() => {});
    if (this.data.kind === 'market') {
      if (this.ctx.market) box.append(this.ctx.market.renderControls());
    } else if (this.data.kind === 'usbancorp') {
      Store.json('content/data/usbancorp.json', { optional: true, fresh: true }).then((d) => d && box.append(new BankMonitor(d).render()));
    } else if (this.data.kind === 'minnesota') {
      Store.json('content/data/minnesota.json', { optional: true }).then((d) => d && box.append(new MinnesotaMap(d, { study: study('Minnesota-Economic-Climate-Research'), onStudy }).render()));
    } else {
      Store.json('content/data/taylor.json', { optional: true }).then((d) => d && box.append(new TaylorExhibit(d, { study: study('taylor-1993-revisited'), onStudy }).render()));
    }
    return box;
  }
}

class DocumentBlock extends Block {
  static type = 'document';
  static label = 'Long document';
  static about = 'A whole Markdown file, such as a study report, with its tables, figures and a list of sections.';
  static fields = [
    { key: 'heading', label: 'Heading', type: 'text', title: true },
    { key: 'src', label: 'Markdown file', type: 'text', hint: 'A path in this repository, for example content/reports/us-bancorp/report.md' },
    { key: 'toc', label: 'List the sections at the top', type: 'toggle', default: true },
  ];
  static sample = { src: '', toc: true };

  body() {
    const box = h('div.doc', h('p.muted', 'Loading the document…'));
    if (!this.data.src) { box.replaceChildren(h('p.muted', 'Name a Markdown file to show it here.')); return box; }
    const url = Store.url(this.data.src);
    fetch(url, { cache: 'no-cache' }).then((r) => (r.ok ? r.text() : Promise.reject(new Error(r.status)))).then((text) => {
      const nodes = markdown(text, { full: true, base: url });
      const heads = nodes.filter((n) => n.tagName === 'H2' && n.id);
      box.replaceChildren(
        this.data.toc !== false && heads.length > 2 ? h('nav.doc__toc', { 'aria-label': 'Sections' }, heads.map((n) => h('a.chip', { href: `#${n.id}` }, n.textContent.replace(/:.*$/, '')))) : null,
        h('div.prose', nodes));
      if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
    }).catch(() => box.replaceChildren(h('p.muted', 'The document could not be loaded.')));
    return box;
  }
}

/** Every block the site knows how to draw, by type. */
export const BLOCKS = Object.fromEntries(
  [TextBlock, StatsBlock, CardsBlock, StepsBlock, PreviewBlock, GalleryBlock, EmbedBlock, ImageBlock, QuoteBlock, CtaBlock, ExhibitBlock, DocumentBlock, ResearchBlock, BuildsBlock]
    .map((B) => [B.type, B]));

export function renderBlocks(blocks = [], ctx = {}) {
  return blocks.map((data) => {
    const B = BLOCKS[data.type];
    return B ? new B(data, ctx).render() : h('p.muted', `Unknown block type: ${data.type}`);
  });
}
