/**
 * page.js: every page that is not the home page.
 *
 * A page is one JSON file in /content/pages. This script finds out which page
 * it is on (from <meta name="page">, or ?p=name on the generic /page/ route),
 * loads that file and draws its blocks. The market runs behind it, starting
 * from a different number of sellers on every page.
 */

import { h, $, emph, append, icon } from './core/dom.js';
import { Store } from './core/store.js';
import { ScrollDirector } from './core/scroll.js';
import { Reveal, Pointer } from './core/motion.js';
import { hash } from './core/util.js';
import { Market } from './market/market.js';
import { MarketView } from './market/view.js';
import { MarketConsole } from './market/console.js';
import { Shell } from './ui/shell.js';
import { StudySheet } from './ui/sheet.js';
import { renderBlocks } from './blocks/blocks.js';

class ContentPage {
  constructor(slug, data, page) { this.slug = slug; Object.assign(this, data); this.page = page; }

  start() {
    const { page, site, facts } = this;
    const fill = (t) => Store.fill(t, facts);
    document.title = `${page.title.replace(/\*/g, '')} · ${site.name}`;
    $('meta[name="description"]')?.setAttribute('content', fill(page.summary || ''));

    const director = new ScrollDirector();
    const shell = new Shell({ site, pages: this.pages, current: this.slug }).renderTop().renderFooter();
    const sheet = new StudySheet(this.research);

    // The market: each page opens on its own number of sellers, and scrolling adds a few.
    const base = page.sellers || 5 + (hash(this.slug) % 12);
    const market = new Market({ seed: hash(this.slug) % 997 });
    const view = new MarketView($('#market'), director, market, {
      onStats: (s) => panel.update(s),
      sellersFor: (d) => Math.round(base + d.progress * 8),
    });
    const panel = new MarketConsole({ market, view, research: this.research, cournot: this.cournot, onStudy: (slug) => sheet.open(slug) });
    document.body.append(panel.renderTape());

    $('[data-slot="eyebrow"]').textContent = page.eyebrow || '';
    append($('[data-slot="title"]'), emph(fill(page.title)));
    $('[data-slot="summary"]').textContent = fill(page.summary || '');
    $('[data-slot="blocks"]').append(...renderBlocks(page.blocks, { ...this, openStudy: (slug) => sheet.open(slug), market: panel }));
    $('[data-slot="end"]').append(h('a.pend__link.display', { href: Store.url('') }, 'Home', icon('right')));

    view.mount();
    sheet.mount();
    shell.follow(director);
    Reveal.watch();
    Pointer.bind();
    director.start();
  }
}

const slug = $('meta[name="page"]')?.content || new URLSearchParams(location.search).get('p') || '';

Promise.all([Store.site(), Store.json(`content/pages/${slug}.json`)])
  .then(([data, page]) => new ContentPage(slug, data, page).start())
  .catch((err) => {
    console.error(err);
    $('[data-slot="title"]').textContent = 'This page is not here yet';
    $('[data-slot="summary"]').textContent = slug ? `There is no content file for “${slug}”.` : 'No page was named.';
  });
