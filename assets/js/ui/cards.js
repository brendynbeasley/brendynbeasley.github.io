/**
 * cards.js — the two kinds of box that hold things on this site.
 *
 *   StudyCard   a "plate": a research study, with its question, a chart and its finding.
 *   WindowCard  a browser window: a linked page, with a preview of the page.
 *
 * Both take a plain object straight from the content files and return a DOM node.
 */

import { h, icon, linkAttrs, prettyUrl } from '../core/dom.js';
import { Store } from '../core/store.js';
import { glyph, cover } from './glyphs.js';

export class StudyCard {
  constructor(study, themes = []) {
    this.study = study;
    this.theme = themes.find((t) => t.id === study.theme);
  }

  render(i = 0) {
    const s = this.study;
    const asked = s.original ? `${s.cite} · ${s.year}` : `Asked in ${s.year} · ${s.authors || s.cite}`;
    const chart = s.figures?.[0];
    const raw = (s.repo || '').replace('https://github.com/', 'https://raw.githubusercontent.com/');
    return h('a.plate.study', { ...linkAttrs(s.url || s.repo), 'data-study': s.slug, 'data-reveal': 'wipe', style: { '--i': i % 2 } },
      h('div.plate__head',
        h('span.label', asked),
        glyph(s.theme, s.slug)),
      h('h3.plate__title', s.title),
      h('p.plate__text', s.dek),
      // The first chart from the study's own write-up, loaded from its repository.
      chart && h('div.study__chart', h('img', { src: `${raw}/HEAD/${chart.src}`, alt: chart.alt || `Chart from ${s.title}`, loading: 'lazy', decoding: 'async' })),
      s.finding && h('p.study__found', h('span.label', 'Found'), h('span', s.finding)),
      h('div.plate__foot',
        h('span.plate__go', 'Open', icon('arrow')),
        this.theme && h('span.label', this.theme.label)));
  }
}

/**
 * A linked page shown inside a browser frame.
 *
 * What fills the frame, in order of preference:
 *   1. `image`  a screenshot (fast, and what most visitors see)
 *   2. the live page itself, scaled down, if there is no screenshot
 *   3. a generated cover, if the page cannot be shown live
 *
 * The "Live" button swaps the screenshot for the real page, which can then be
 * used right there in the card.
 */
export class WindowCard {
  static #lazy;

  constructor(item) { this.item = item; }

  get canGoLive() { return Boolean(this.item.url) && this.item.live !== false; }

  render(i = 0) {
    const b = this.item;
    const target = b.url || b.repo;
    this.view = h('div.window__view');
    if (b.image) this.view.append(h('img', { src: Store.asset(b.image), alt: `Screenshot of ${b.title}`, loading: 'lazy', decoding: 'async' }));
    else this.view.append(h('div.window__cover', cover(b.title, b.slug || b.title)));
    this.view.append(h('div.window__shade'));
    this.open = h('a.window__open', { ...linkAttrs(target), 'aria-label': `Open ${b.title}`, tabindex: -1 });
    this.view.append(this.open);

    this.liveBtn = this.canGoLive && h('button.window__live', { type: 'button', 'aria-pressed': 'false', title: 'Run the real page inside this card', onClick: () => this.toggle() }, 'Live');

    this.root = h('article.window', { 'data-reveal': '', style: { '--i': i % 2 } },
      h('div.window__frame',
        h('div.window__bar',
          h('span.window__dots', h('i'), h('i'), h('i')),
          h('span.window__url', prettyUrl(target)),
          this.liveBtn || h('span')),
        this.view),
      h('div.window__meta',
        h('div',
          h('p.label', [b.kind, b.year].filter(Boolean).join(' · ')),
          h('h3.window__title', h('a', linkAttrs(target), b.title))),
        h('div.window__links',
          b.url && h('a.btn.btn--sm', linkAttrs(b.url), 'Open', icon('arrow')),
          b.repo && h('a.btn.btn--sm.btn--quiet', linkAttrs(b.repo), 'Code')),
        h('p.window__text', b.summary)));

    // No screenshot? Show the real page once the card is on screen.
    if (!b.image && this.canGoLive) WindowCard.lazy.observe(this.root);
    this.root.card = this;
    return this.root;
  }

  static get lazy() {
    WindowCard.#lazy ??= new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const card = entry.target.card;
        if (entry.isIntersecting) card.load(false);
        else if (!card.interactive) card.unload();
      }
    }, { rootMargin: '200px' });
    return WindowCard.#lazy;
  }

  /** Put the real page in the frame, drawn at desktop size and scaled to fit. */
  load(interactive) {
    this.interactive = interactive;
    if (!this.frame) {
      this.frame = h('iframe', {
        src: this.item.url, title: `${this.item.title}, live`, loading: 'lazy', referrerpolicy: 'no-referrer',
        // No allow-top-navigation: a previewed page can never redirect this one.
        sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups',
      });
      this.frame.addEventListener('load', () => this.frame?.classList.add('is-ready'));
      this.view.insertBefore(this.frame, this.view.querySelector('.window__shade'));
      this.fit = new ResizeObserver(() => { if (this.frame) this.frame.style.transform = `scale(${this.view.clientWidth / 1440})`; });
      this.fit.observe(this.view);
    }
    this.view.classList.toggle('is-interactive', interactive);
    this.root.classList.toggle('is-live', interactive);
    this.open.hidden = interactive;
  }

  unload() {
    this.fit?.disconnect();
    this.frame?.remove();
    this.frame = null; this.interactive = false;
    this.view.classList.remove('is-interactive');
    this.root.classList.remove('is-live');
    this.open.hidden = false;
  }

  toggle() {
    const on = this.liveBtn.getAttribute('aria-pressed') !== 'true';
    this.liveBtn.setAttribute('aria-pressed', String(on));
    if (on) this.load(true);
    else if (this.item.image) this.unload();
    else this.load(false);
  }
}
