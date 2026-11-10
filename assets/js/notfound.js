/** notfound.js — the 404 page: the dots spell out the number. */

import { $ } from './core/dom.js';
import { Store } from './core/store.js';
import { ScrollDirector } from './core/scroll.js';
import { Figure } from './figure/figure.js';
import { Shell } from './ui/shell.js';

Store.site().then(({ site, pages, research, literature }) => {
  const director = new ScrollDirector();
  new Shell({ site, pages }).renderTop().renderFooter().follow(director);
  new Figure($('#figure'), director, { studies: research.items, literature }).mount();
  director.start();
});
