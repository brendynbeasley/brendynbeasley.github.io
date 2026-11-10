/**
 * sheet.js: a study, opened in place.
 *
 * Clicking any study (a card, a row in the index, a dot on the timeline, a
 * name on the market tape) slides in a sheet with the question, the finding,
 * the charts from the write-up, and the full citation of the paper it tests.
 * The charts are loaded straight from the study's own repository.
 *
 * The address bar follows along (#study/one-more-seller), so a sheet can be
 * linked to, and the back button closes it.
 */

import { h, icon, clear } from '../core/dom.js';

const PREFIX = '#study/';

export class StudySheet {
  /** @param {{items: object[], themes: object[]}} research */
  constructor(research) {
    this.items = [...research.items].sort((a, b) => a.year - b.year || a.title.localeCompare(b.title));
    this.themes = new Map(research.themes.map((t) => [t.id, t]));
    this.at = -1;
  }

  mount() {
    this.body = h('div.drawer__body');
    this.count = h('span.label');
    this.panel = h('article.drawer__panel', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Study', tabindex: -1 },
      h('header.drawer__bar',
        this.count,
        h('div.drawer__nav',
          h('button.iconbtn', { type: 'button', 'aria-label': 'Earlier study', onClick: () => this.step(-1) }, icon('up')),
          h('button.iconbtn', { type: 'button', 'aria-label': 'Later study', onClick: () => this.step(1) }, icon('down')),
          h('button.iconbtn', { type: 'button', 'aria-label': 'Close', onClick: () => this.close() }, icon('x')))),
      this.body);
    this.root = h('div.drawer', { hidden: true }, h('div.drawer__veil', { onClick: () => this.close() }), this.panel);
    document.body.append(this.root);

    // Anything marked data-study opens its sheet instead of leaving the page.
    addEventListener('click', (e) => {
      const el = e.target.closest?.('[data-study]');
      if (!el || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      e.preventDefault();
      this.open(el.dataset.study);
    });
    addEventListener('keydown', (e) => {
      if (this.root.hidden) return;
      if (e.key === 'Escape') this.close();
      else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') this.step(1);
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') this.step(-1);
      else if (e.key === 'Tab') this.keepFocus(e);
    });
    addEventListener('hashchange', () => this.route());
    this.route();
    return this;
  }

  route() {
    const slug = location.hash.startsWith(PREFIX) ? decodeURIComponent(location.hash.slice(PREFIX.length)) : '';
    if (slug) this.show(slug); else this.hide();
  }

  open(slug) {
    if (location.hash === PREFIX + slug) this.show(slug);
    else if (this.root.hidden) location.hash = PREFIX + slug;   // one history entry, so Back closes it
    else history.replaceState(null, '', PREFIX + slug), this.show(slug);
  }

  close() {
    if (location.hash.startsWith(PREFIX)) history.replaceState(null, '', location.pathname + location.search);
    this.hide();
  }

  step(by) {
    const next = this.items[(this.at + by + this.items.length) % this.items.length];
    history.replaceState(null, '', PREFIX + next.slug);
    this.show(next.slug);
  }

  show(slug) {
    const i = this.items.findIndex((s) => s.slug === slug);
    if (i < 0) return this.hide();
    if (this.root.hidden) this.opener = document.activeElement;
    this.at = i;
    this.fill(this.items[i]);
    this.root.hidden = false;
    document.documentElement.classList.add('has-drawer');
    requestAnimationFrame(() => { this.root.classList.add('is-open'); this.panel.focus({ preventScroll: true }); this.body.scrollTop = 0; });
  }

  hide() {
    if (this.root.hidden) return;
    this.root.classList.remove('is-open');
    document.documentElement.classList.remove('has-drawer');
    setTimeout(() => { this.root.hidden = true; }, 380);
    this.opener?.focus?.({ preventScroll: true });
  }

  keepFocus(e) {
    const stops = [...this.panel.querySelectorAll('a[href], button')];
    const first = stops[0], last = stops.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  fill(s) {
    const theme = this.themes.get(s.theme);
    const repo = s.repo || '', raw = repo.replace('https://github.com/', 'https://raw.githubusercontent.com/');
    const doc = (name) => h('a.link', { href: `${repo}/blob/HEAD/${name}`, target: '_blank', rel: 'noopener' }, name);
    this.count.textContent = `${this.at + 1} of ${this.items.length}${theme ? `  ·  ${theme.label}` : ''}`;
    clear(this.body).append(
      h('p.label', s.original ? `${s.cite} · ${s.year}` : `Asked in ${s.year} by ${s.authors || s.cite}`),
      h('h2.display.drawer__title', s.title),
      h('p.drawer__dek', s.dek),
      s.finding && h('div.drawer__found', h('span.label', 'Found'), h('p', s.finding)),
      ...(s.figures || []).map((f) => h('figure.drawer__figure',
        h('img', { src: `${raw}/HEAD/${f.src}`, alt: f.alt || `Chart from ${s.title}`, loading: 'lazy', decoding: 'async' }),
        f.alt && !/^figure \d+$/i.test(f.alt) && h('figcaption.label', f.alt))),
      h('dl.drawer__facts',
        s.paper && h('div', h('dt.label', 'The paper'), h('dd', s.paper)),
        s.docs?.length && h('div', h('dt.label', 'In the repository'), h('dd', doc('README.md'), s.docs.map((d) => [', ', doc(d)])))),
      h('div.drawer__actions',
        h('a.btn.btn--solid', { href: s.url || repo, target: '_blank', rel: 'noopener' }, s.original ? 'Open the project' : 'Read the full study', icon('arrow'))));
  }
}
