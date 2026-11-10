/**
 * wall.js: every project in the Lab, laid out on a tilted plane.
 *
 * The screenshots sit on one sheet that is tipped back in 3-D with CSS
 * transforms and slides past as the page scrolls. There is no canvas here:
 * each tile is an ordinary link to the project.
 */

import { h, linkAttrs } from '../core/dom.js';
import { Store } from '../core/store.js';

export class Wall {
  /** @param {object[]} items  entries from content/builds.json */
  constructor(items) {
    this.items = items.filter((b) => b.image && !b.draft);
  }

  render() {
    if (!this.items.length) return null;
    // Repeat the set so the sheet is always full, whatever the number of projects.
    const tiles = [];
    while (tiles.length < 16) tiles.push(...this.items);
    this.sheet = h('div.wall__sheet', tiles.slice(0, 16).map((b, i) => h('a.wall__tile', { ...linkAttrs(b.url || b.repo), tabindex: -1, 'aria-hidden': 'true', style: { '--n': i } },
      h('img', { src: Store.asset(b.image), alt: '', loading: 'lazy', decoding: 'async' }),
      h('span.label', b.title))));
    this.root = h('div.wall', this.sheet);
    return this.root;
  }

  /** p runs 0 → 1 while the Lab's opening screen is pinned. */
  progress(p) {
    if (this.sheet) this.sheet.style.setProperty('--p', p.toFixed(4));
  }
}
