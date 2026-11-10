/**
 * home.js: the home page.
 *
 * HomePage reads the content files and fills each section, then starts the
 * three things that move: the market behind the page, the dots that form the
 * research timeline, and the smaller scroll effects. Every word and number
 * comes from /content, so the Studio (or a text editor) can change any of it.
 */

import { h, $, icon, words, emph, append, clear, linkAttrs } from './core/dom.js';
import { Store } from './core/store.js';
import { ScrollDirector } from './core/scroll.js';
import { Reveal, WordReveal, Counter, KineticTitle, Pointer, Ticker } from './core/motion.js';
import { unlerp, clamp, coarsePointer, fmt } from './core/util.js';
import { Figure } from './figure/figure.js';
import { Market } from './market/market.js';
import { MarketView } from './market/view.js';
import { MarketConsole, THEME_EXPERIMENT } from './market/console.js';
import { MinnesotaMap } from './exhibits/minnesota.js';
import { TaylorExhibit } from './exhibits/taylor.js';
import { Shell } from './ui/shell.js';
import { StudyCard, WindowCard } from './ui/cards.js';
import { ResearchIndex } from './ui/research.js';
import { StudySheet } from './ui/sheet.js';
import { Wall } from './ui/wall.js';
import { glyph } from './ui/glyphs.js';

const slot = (name) => $(`[data-slot="${name}"]`);

class HomePage {
  constructor(data) {
    Object.assign(this, data); // site, research, builds, pages, literature, ledger, cournot, facts
    this.director = new ScrollDirector();
    this.fill = (text) => Store.fill(text, this.facts);
    this.study = (slug) => this.research.items.find((s) => s.slug === slug);
  }

  start() {
    document.title = this.site.meta?.title || this.site.name;
    this.shell = new Shell({ site: this.site, pages: this.pages, home: true }).renderTop().renderFooter();
    this.sheet = new StudySheet(this.research);
    this.hero();
    this.market();
    this.ticker();
    this.about();
    this.researchSection();
    this.buildsSection();
    this.contact();
    this.axis();
    this.figure();
    this.sheet.mount();
    this.shell.follow(this.director).spy();
    Reveal.watch();
    Pointer.bind();
    this.director.start();
    // If the page was opened at /#research, land there once the content exists.
    if (location.hash.length > 1 && !location.hash.includes('/')) requestAnimationFrame(() => document.getElementById(location.hash.slice(1))?.scrollIntoView());
  }

  hero() {
    const { site } = this;
    clear(slot('eyebrow')).append(...(site.eyebrow || []).map((t) => h('span', t)));
    const [first, ...rest] = site.name.trim().split(/\s+/);
    const name = slot('name');
    clear(name).append(h('span.line', first), rest.length ? h('span.line', rest.join(' ')) : '');
    name.dataset.label = site.name;
    new KineticTitle(name, this.director);
    // The name drifts up and fades a little as you leave it.
    const inner = $('.hero__in');
    this.director.track($('.hero'), (p) => {
      const out = unlerp(0.5, 1, p);
      inner.style.transform = `translate3d(0, ${(-out * 60).toFixed(1)}px, 0)`;
      inner.style.opacity = (1 - out * 1.15).toFixed(3);
    });
  }

  /** The model behind the page, its readout and its controls. */
  market() {
    const phone = innerWidth < 760;
    this.mkt = new Market({ seed: 11 });
    this.mkt.first = phone ? [0.5, 0.64] : [0.64, 0.5];
    this.view = new MarketView($('#market'), this.director, this.mkt, {
      onStats: (stats) => { this.console.update(stats); this.session(stats); },
      // One seller at the top of the page. A few more arrive on their own, and the rest as you scroll.
      sellersFor: (d) => {
        const most = clamp(Math.round((d.vw * d.vh) / 40000), 12, 34);
        const arrived = Store.drafting ? 3 : Math.min(3, Math.floor(Math.max(0, d.time - 2.4) / 2.6));
        return Math.max(1 + arrived, Math.round(1 + (most - 1) * Math.pow(d.progress, 0.8)));
      },
    });
    this.console = new MarketConsole({ market: this.mkt, view: this.view, research: this.research, cournot: this.cournot, onStudy: (slug) => this.sheet.open(slug) });
    slot('console').append(this.console.renderControls());
    document.body.append(this.console.renderTape());
    this.view.mount();
    // Add ?debug to the address to reach the model from the browser console.
    if (new URLSearchParams(location.search).has('debug')) window.market = { model: this.mkt, view: this.view };
  }

  ticker() {
    const items = this.research.items.filter((s) => !s.original);
    const step = Math.max(1, Math.floor(items.length / 13));
    const picks = items.filter((s, i) => s.featured || i % step === 0).slice(0, 16);
    slot('ticker').append(...picks.map((s) => h('span.ticker__item', h('small', s.cite), s.title)));
    new Ticker($('.ticker'), this.director);
  }

  about() {
    const { site, facts } = this;
    slot('about-title').textContent = site.about?.title || 'About';
    const statement = slot('statement');
    append(statement, words(this.fill(site.about.statement)));
    const reveal = new WordReveal(statement);
    const stage = statement.closest('.stage');

    // Minnesota, from my own research, printed across the screen as the stage scrolls.
    const map = slot('map');
    Store.json('content/data/minnesota.json', { optional: true }).then((data) => {
      if (!data) return;
      this.map = new MinnesotaMap(data, { study: this.study('Minnesota-Economic-Climate-Research'), onStudy: (slug) => this.sheet.open(slug) });
      map.append(this.map.render());
    });
    this.director.track(stage, (p, d) => {
      const span = stage.offsetHeight + d.vh;
      reveal.set(unlerp((d.vh * 0.5) / span, (stage.offsetHeight - d.vh * 0.25) / span, p));
      this.map?.progress(unlerp((d.vh * 0.35) / span, (d.vh * 1.15) / span, p));
    });

    const stats = h('div.stats', (site.stats || []).map((s, i) => {
      const value = Store.fill(s.value, Object.fromEntries(Object.entries(facts).map(([k, v]) => [k, String(v)])));
      const n = h('span.stat__n.display', value);
      if (/^\d+$/.test(value)) Counter.run(n, Number(value));
      return h('div.stat', { 'data-reveal': '', style: { '--i': i } }, n, h('p.stat__l', this.fill(s.label)));
    }));

    const education = (site.education || []).map((e) => h('article.plate', { 'data-reveal': 'wipe' },
      h('div.plate__head', h('span.label', 'Education'), glyph('innovation', e.school)),
      h('h3.edu__school', e.school),
      h('div.edu__rows',
        h('p', h('span', e.degree), h('span', e.when)),
        e.detail && h('p', h('span', e.detail), h('span')))));

    const roles = (site.experience || []).filter((r) => r.role);
    slot('about-body').append(
      stats,
      h('div.about',
        h('div.about__side',
          site.about.looking && h('p.about__note', { 'data-reveal': '' }, this.fill(site.about.looking)),
          site.about.note && h('p.about__note', { 'data-reveal': '' }, this.fill(site.about.note)),
          education,
          h('div', { 'data-reveal': '' },
            h('p.label', { style: { 'margin-bottom': '12px' } }, 'Toolkit'),
            h('div.toolkit', (site.toolkit || []).map((t) => h('span.chip', t))))),
        h('div.about__main',
          roles.length && h('div', { 'data-reveal': '', style: { 'margin-bottom': '44px' } },
            h('p.label', { style: { 'margin-bottom': '10px' } }, 'Experience'),
            h('div.roles', roles.map((r) => h('div.role', h('h4', [r.role, r.org].filter(Boolean).join(', ')), h('span.label', r.when || ''), r.text && h('p', r.text))))),
          this.ledgerView())));
  }

  /** How often each method and data source turns up across the studies. Counted, not claimed. */
  ledgerView() {
    const L = this.ledger;
    if (!L) return null;
    const col = (title, rows) => h('div.ledger__col', h('p.label', title),
      rows.slice(0, 9).map((r, i) => h('div.ledger__row', h('span', r.label), h('b', String(r.n)),
        h('span.ledger__bar', h('i', { style: { '--w': `${(r.n / L.of) * 100}%`, '--i': i } })))));
    return h('div.ledger', { 'data-reveal': '' },
      col(`Methods, by number of studies (of ${L.of})`, L.methods),
      col('Data, by number of studies', L.sources),
      h('p.ledger__note', 'Counted by a script from each study’s write-up and technical notes.'));
  }

  researchSection() {
    const { site, research, facts } = this;
    const copy = site.sections?.research || {};
    slot('research-title').textContent = copy.title || 'Research';
    slot('research-facts').append(h('span', h('b', String(facts.studies)), ' studies'), h('span', h('b', String(facts.firstYear)), ' to ', h('b', String(facts.lastYear))), h('span', h('b', String(research.themes.length)), ' themes'));
    slot('research-hint').textContent = coarsePointer() ? 'Tap a dot for the study' : 'Hover a dot for the study. Click to open it.';

    const featured = research.items.filter((s) => s.featured);
    this.index = new ResearchIndex(research, {
      onHover: (i) => { if (this.fig) this.fig.highlight = i; },
      // Picking a theme also runs that theme's experiment on the market behind the page.
      onTheme: (id) => { if (THEME_EXPERIMENT[id]) this.console.run(THEME_EXPERIMENT[id]); },
    });
    const exhibit = h('div');
    Store.json('content/data/taylor.json', { optional: true }).then((data) => {
      if (!data) return;
      exhibit.append(new TaylorExhibit(data, { study: this.study('taylor-1993-revisited'), onStudy: (slug) => this.sheet.open(slug) }).render(), h('div.body__gap'));
      Reveal.watch(exhibit);
    });
    slot('research-body').append(
      featured.length && h('div.body__head', h('h3', copy.featured || 'Selected studies'), h('span.label', `${featured.length} of ${research.items.length}`)),
      h('div.featured', featured.map((s, i) => new StudyCard(s, research.themes).render(i))),
      h('div.body__gap'),
      exhibit,
      h('div.body__head', h('h3', copy.index || 'All studies'), h('span.label', `${research.items.length} studies`)),
      this.index.render());
  }

  buildsSection() {
    const { site, builds } = this;
    const items = (builds.items || []).filter((b) => !b.draft);
    slot('builds-title').textContent = site.sections?.builds?.title || 'Lab';
    const live = items.filter((b) => b.url).length;
    slot('builds-facts').append(h('span', h('b', String(items.length)), ' projects'), h('span', h('b', String(live)), ' run in a browser'));
    const wall = new Wall(items), pin = slot('wall');
    const el = wall.render();
    if (el) {
      pin.append(el);
      const stage = pin.closest('.stage');
      this.director.track(stage, (p) => wall.progress(p));
    }
    slot('builds-body').append(h('div.windows', items.map((b, i) => new WindowCard(b).render(i))));
  }

  contact() {
    const { site } = this;
    const c = site.contact || {};
    slot('contact-title').textContent = site.sections?.contact?.title || 'Contact';
    const btn = (href, label, name, solid) => href && h(`a.btn${solid ? '.btn--solid' : ''}`, linkAttrs(href), icon(name), label);
    slot('contact-links').append(...[
      btn(c.email && `mailto:${c.email}`, c.email, 'mail', true),
      btn(c.linkedin, 'LinkedIn', 'linkedin'),
      btn(c.github, 'GitHub', 'github', !c.email),
      btn(c.resume && Store.url(c.resume), 'Résumé', 'file'),
    ].filter(Boolean));
  }

  /** What happened to the market during this visit, written out at the foot of the page. */
  session(stats) {
    const box = slot('session'), s = this.console.session;
    if (!box || this.view.focus < 0.2 || this.director.progress < 0.5) return;
    const line = `${stats.sellers}|${Math.round(stats.hhi / 5)}|${s.added}|${s.experiments}`;
    if (line === this.lastSession) return;
    this.lastSession = line;
    box.replaceChildren(
      h('span', 'This page opened with one seller: HHI 10,000 and a markup of 66.7%.'),
      h('span', 'It now has ', h('b', `${stats.sellers} sellers`), ', an HHI of ', h('b', fmt(Math.round(stats.hhi))), ' and a markup of ', h('b', `${(stats.lerner * 100).toFixed(1)}%`), '.'),
      (s.added || s.experiments) ? h('span', `You added ${s.added} ${s.added === 1 ? 'seller' : 'sellers'} and ran ${s.experiments} ${s.experiments === 1 ? 'experiment' : 'experiments'}.`) : h('span', 'Click anywhere on this screen to add a seller of your own.'),
      h('button', { type: 'button', onClick: () => this.console.run('reset') }, 'Reset the market'));
  }

  /** The tick marks down the right edge: a y-axis for the page. */
  axis() {
    const marks = [['top', 'Top'], ['about', 'About'], ['research', 'Research'], ['builds', 'Lab'], ['contact', 'Contact']];
    const nav = $('.axis');
    nav.append(...marks.map(([id, label]) => h('a', { href: `#${id}`, 'data-id': id }, h('span', label))));
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) nav.querySelectorAll('a').forEach((a) => a.setAttribute('aria-current', String(a.dataset.id === e.target.id)));
    }, { rootMargin: '-45% 0px -50% 0px' });
    marks.forEach(([id]) => { const el = document.getElementById(id); if (el) io.observe(el); });
  }

  /** The dots: the literature above the line, my studies below it. */
  figure() {
    const tip = $('.tip');
    this.fig = new Figure($('#figure'), this.director, {
      studies: this.research.items,
      literature: this.literature,
      onHover: (study, x, y) => {
        document.documentElement.classList.toggle('is-pointing', Boolean(study));
        tip.hidden = !study;
        if (!study) return;
        tip.href = `#study/${study.slug}`; tip.dataset.study = study.slug;
        tip.replaceChildren(h('small', study.cite), h('strong', study.title), study.finding && h('em', study.finding));
        tip.style.left = `${clamp(x, 160, innerWidth - 160)}px`;
        tip.style.top = `${y}px`;
      },
    }).mount();
    // A click that lands on a dot opens that study.
    addEventListener('click', (e) => {
      const study = this.research.items[this.fig.hovered];
      if (!study || e.target.closest('a, button, input, textarea, select, iframe')) return;
      this.sheet.open(study.slug);
    });
  }
}

Store.site()
  .then((data) => new HomePage(data).start())
  .catch((err) => {
    console.error(err);
    document.body.append(h('p.wrap', { style: { position: 'relative', 'z-index': 5, padding: '120px 0' } }, `This page could not load its content: ${err.message}`));
  });
