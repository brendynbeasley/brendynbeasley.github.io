/** notfound.js: the 404 page. The market runs here too. */

import { $ } from './core/dom.js';
import { Store } from './core/store.js';
import { ScrollDirector } from './core/scroll.js';
import { Market } from './market/market.js';
import { MarketView } from './market/view.js';
import { MarketConsole } from './market/console.js';
import { Shell } from './ui/shell.js';

Store.site().then(({ site, pages, research, cournot }) => {
  const director = new ScrollDirector();
  new Shell({ site, pages }).renderTop().renderFooter().follow(director);
  const market = new Market({ seed: 404 });
  const view = new MarketView($('#market'), director, market, { onStats: (s) => panel.update(s), sellersFor: () => 9 });
  const panel = new MarketConsole({ market, view, research, cournot, onStudy: (slug) => { location.href = `${Store.url('')}#study/${slug}`; } });
  document.body.append(panel.renderTape());
  view.mount();
  director.start();
});
