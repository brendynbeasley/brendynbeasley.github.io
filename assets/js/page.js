/**
 * page.js — every page that is not the home page.
 *
 * A page is one JSON file in /content/pages. This script finds out which page
 * it is on (from <meta name="page">, or ?p=slug on the generic /page/ route),
 * loads that file and draws its blocks.
 */

import { h, $, emph, append, icon } from './core/dom.js';
import { Store } from './core/store.js';
import { ScrollDirector } from './core/scroll.js';
import { Reveal, Pointer } from './core/motion.js';
import { Figure } from './figure/figure.js';
import { Shell } from './ui/shell.js';
import { renderBlocks } from './blocks/blocks.js';

class ContentPage {
  constructor(slug, data, page) { this.slug = slug; Object.assign(this, data); this.page = page; }

  start() {
    const { page, site, facts } = this;
    const fill = (t) => Store.fill(t, facts);
    document.title = `${page.title} · ${site.name}`;
    $('meta[name="description"]')?.setAttribute('content', fill(page.summary || ''));

    const director = new ScrollDirector();
    const shell = new Shell({ site, pages: this.pages, current: this.slug }).renderTop().renderFooter();

    $('[data-slot="eyebrow"]').textContent = page.eyebrow || '';
    append($('[data-slot="title"]'), emph(fill(page.title)));
    $('[data-slot="summary"]').textContent = fill(page.summary || '');
    $('[data-slot="blocks"]').append(...renderBlocks(page.blocks, this));
    $('[data-slot="end"]').append(
      h('p.label', 'Keep reading'),
      h('a.pend__link.display', { href: Store.url('') }, emph('Back to *the work*'), icon('right')));

    new Figure($('#figure'), director, { studies: this.research.items, literature: this.literature }).mount();
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
