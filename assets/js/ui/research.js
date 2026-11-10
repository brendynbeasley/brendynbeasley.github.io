/**
 * research.js — the full index of studies: filter by theme, search, sort.
 */

import { h, icon, clear, linkAttrs } from '../core/dom.js';

const FIRST = 12; // rows shown before "Show all"

export class ResearchIndex {
  /**
   * @param {{items: object[], themes: object[]}} research
   * @param {{onHover?: (index: number) => void, onTheme?: (id: string) => void, theme?: string, limit?: number}} options
   */
  constructor(research, { onHover = () => {}, onTheme = () => {}, theme = 'all', limit = FIRST } = {}) {
    this.items = research.items.map((item, index) => ({ ...item, index }));
    this.themes = research.themes;
    this.onHover = onHover;
    this.onTheme = onTheme;
    this.limit = limit;
    this.state = { theme, query: '', newest: false, all: false };
  }

  get rows() {
    const { theme, query, newest } = this.state;
    const q = query.trim().toLowerCase();
    const rows = this.items.filter((s) =>
      (theme === 'all' || s.theme === theme) &&
      (!q || [s.title, s.cite, s.authors, s.dek, s.finding, String(s.year)].join(' ').toLowerCase().includes(q)));
    rows.sort((a, b) => (newest ? b.year - a.year : a.year - b.year) || a.title.localeCompare(b.title));
    return rows;
  }

  render() {
    const count = (id) => this.items.filter((s) => id === 'all' || s.theme === id).length;
    const chip = (id, label) => h('button.chip', { type: 'button', data: { id }, 'aria-pressed': String(this.state.theme === id), onClick: () => { this.set({ theme: id, all: false }); this.onTheme(id); } }, label, h('sup', count(id)));
    this.chips = h('div.index__chips', { role: 'group', 'aria-label': 'Filter by theme' },
      chip('all', 'All'), this.themes.filter((t) => count(t.id)).map((t) => chip(t.id, t.label)));
    this.search = h('input.index__search', { type: 'search', placeholder: 'Search by title, author or year', 'aria-label': 'Search studies', onInput: (e) => this.set({ query: e.target.value }) });
    this.sortBtn = h('button.chip', { type: 'button', onClick: () => this.set({ newest: !this.state.newest }) });
    this.list = h('ol.index__list');
    this.more = h('div.index__more');
    this.status = h('p.label.index__status', { 'aria-live': 'polite' });
    this.root = h('div.index',
      h('div.index__tools', this.search, this.sortBtn),
      this.chips, this.status, this.list, this.more);
    this.paint();
    return this.root;
  }

  set(patch) {
    Object.assign(this.state, patch);
    for (const c of this.chips.children) c.setAttribute('aria-pressed', String(c.dataset.id === this.state.theme));
    this.paint();
  }

  row(s, i) {
    const theme = this.themes.find((t) => t.id === s.theme);
    return h('li', { style: { '--i': Math.min(i, 14) } },
      h('a.row', {
        ...linkAttrs(s.url || s.repo), 'data-study': s.slug,
        onPointerenter: () => this.onHover(s.index), onPointerleave: () => this.onHover(-1),
        onFocus: () => this.onHover(s.index), onBlur: () => this.onHover(-1),
      },
        h('span.row__year', String(s.year)),
        h('span.row__cite', s.cite),
        h('span.row__main',
          h('span.row__title', s.title),
          h('span.row__found', s.finding || s.dek)),
        h('span.row__theme.label', theme?.label || ''),
        h('span.row__go', icon('arrow'))));
  }

  paint() {
    const rows = this.rows;
    const { theme, query, newest, all } = this.state;
    const capped = theme === 'all' && !query.trim() && !all && rows.length > this.limit;
    const shown = capped ? rows.slice(0, this.limit) : rows;
    this.sortBtn.replaceChildren(newest ? 'Newest paper first' : 'Oldest paper first', icon(newest ? 'down' : 'up'));
    clear(this.list).append(...shown.map((s, i) => this.row(s, i)));
    this.status.textContent = rows.length ? `${shown.length} of ${rows.length} ${rows.length === 1 ? 'study' : 'studies'}` : 'Nothing matches that search.';
    clear(this.more);
    if (capped) this.more.append(h('button.btn', { type: 'button', onClick: () => this.set({ all: true }) }, `Show all ${rows.length} studies`, icon('down')));
  }
}
