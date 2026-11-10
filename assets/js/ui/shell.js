/**
 * shell.js — the parts every page shares: the top bar, the small-screen menu
 * and the footer. Pages listed in content/pages.json with "nav": true are
 * added to the menu automatically.
 */

import { h, icon, $ } from '../core/dom.js';
import { Store } from '../core/store.js';
import { Theme } from '../core/theme.js';

const SECTIONS = [
  { id: 'about', label: 'About' },
  { id: 'research', label: 'Research' },
  { id: 'builds', label: 'Lab' },
  { id: 'contact', label: 'Contact' },
];

export class Shell {
  /** @param {{site: object, pages: object, home?: boolean, current?: string}} options */
  constructor({ site, pages, home = false, current = '' }) {
    this.site = site; this.home = home; this.current = current;
    this.pages = (pages?.pages || []).filter((p) => p.nav && !p.draft);
  }

  get links() {
    const section = (s) => ({ ...s, href: this.home ? `#${s.id}` : `${Store.url('')}#${s.id}`, section: true });
    const page = (p) => ({ id: p.slug, label: p.navLabel || p.title, href: Store.url(`${p.slug}/`), page: true });
    return [...SECTIONS.slice(0, 3).map(section), ...this.pages.map(page), section(SECTIONS[3])];
  }

  mark() {
    const svg = h('svg.brand__mark', { viewBox: '0 0 22 22', 'aria-hidden': 'true' });
    // A five-column dot histogram: the site's whole idea at favicon size.
    [[3, 1], [7, 2], [11, 4], [15, 2], [19, 1]].forEach(([x, count]) => {
      for (let k = 0; k < count; k++) svg.append(h('circle', { cx: x, cy: 19 - k * 4.4, r: 1.7, fill: 'currentColor' }));
    });
    return svg;
  }

  renderTop() {
    const links = this.links;
    const anchor = (l, cls) => h(`a.${cls}`, { href: l.href, 'data-id': l.id, 'aria-current': l.page && l.id === this.current ? 'page' : null }, l.label);
    const themeBtn = h('button.iconbtn', { type: 'button', 'aria-label': 'Switch between light and dark', onClick: (e) => { Theme.toggle(e); paint(); } });
    const paint = () => { themeBtn.replaceChildren(icon(Theme.current === 'dark' ? 'sun' : 'moon')); };
    paint();
    addEventListener('themechange', paint);

    this.sheet = h('nav.sheet', { 'aria-label': 'Menu', id: 'menu' },
      links.map((l, i) => h('a', { href: l.href, style: { '--i': i }, onClick: () => this.toggleMenu(false) }, h('span', String(i + 1).padStart(2, '0')), l.label)));
    this.menuBtn = h('button.menu-btn', { type: 'button', 'aria-expanded': 'false', 'aria-controls': 'menu', onClick: () => this.toggleMenu() }, 'Menu');

    this.top = h('header.topbar',
      h('div.wrap.topbar__in',
        h('a.brand', { href: this.home ? '#top' : Store.url(''), 'aria-label': `${this.site.name}, home` }, this.mark(), h('span', this.site.name)),
        h('nav.nav', { 'aria-label': 'Sections' },
          h('div.nav__links', links.map((l) => anchor(l, 'nav__link'))),
          themeBtn, this.menuBtn)));
    // Keep the skip link first in the tab order.
    const skip = $('.skip');
    if (skip) skip.after(this.top, this.sheet); else document.body.prepend(this.top, this.sheet);
    addEventListener('keydown', (e) => { if (e.key === 'Escape') this.toggleMenu(false); });
    return this;
  }

  toggleMenu(open = !this.sheet.classList.contains('is-open')) {
    this.sheet.classList.toggle('is-open', open);
    this.menuBtn.setAttribute('aria-expanded', String(open));
    this.menuBtn.textContent = open ? 'Close' : 'Menu';
    document.documentElement.style.overflow = open ? 'hidden' : '';
  }

  /** Hide the bar while scrolling down, bring it back on the way up. */
  follow(director) {
    director.onFrame((d) => {
      this.top.classList.toggle('is-scrolled', d.y > 30);
      if (d.y < 140 || d.v < -1.2) this.top.classList.remove('is-hidden');
      else if (d.v > 1.2 && !this.sheet.classList.contains('is-open')) this.top.classList.add('is-hidden');
    });
    return this;
  }

  /** Underline the menu item for whichever section is on screen. */
  spy() {
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        this.top.querySelectorAll('.nav__link').forEach((a) => {
          if (a.getAttribute('aria-current') === 'page') return;
          a.setAttribute('aria-current', String(a.dataset.id === entry.target.id));
        });
      }
    }, { rootMargin: '-45% 0px -50% 0px' });
    SECTIONS.forEach((s) => { const el = $(`#${s.id}`); if (el) io.observe(el); });
    return this;
  }

  renderFooter() {
    const c = this.site.contact || {};
    const year = new Date().getFullYear();
    const footer = h('footer.footer',
      h('div.wrap.footer__in',
        h('p.label', `© ${year} ${this.site.name}`, this.site.footer?.note ? ` · ${this.site.footer.note}` : ''),
        h('div.footer__links.label',
          c.github && h('a', { href: c.github, target: '_blank', rel: 'noopener' }, 'GitHub'),
          this.site.footer?.source && h('a', { href: this.site.footer.source, target: '_blank', rel: 'noopener' }, 'View source'),
          h('a', { href: Store.url('studio/') }, 'Edit this site'))));
    document.body.append(footer);
    return this;
  }
}
