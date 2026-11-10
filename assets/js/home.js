/**
 * home.js — the home page.
 *
 * HomePage reads the content files, fills each section, then hands the page
 * to the ScrollDirector and the Figure. Everything visible comes from
 * /content/*.json, so the Studio (or a text editor) can change any of it.
 */

import { h, $, icon, words, emph, append, clear, linkAttrs } from './core/dom.js';
import { Store } from './core/store.js';
import { ScrollDirector } from './core/scroll.js';
import { Reveal, WordReveal, Counter, KineticTitle, Pointer, Ticker } from './core/motion.js';
import { unlerp, clamp, coarsePointer, fmt } from './core/util.js';
import { Figure } from './figure/figure.js';
import { Shell } from './ui/shell.js';
import { StudyCard, WindowCard } from './ui/cards.js';
import { ResearchIndex } from './ui/research.js';
import { glyph } from './ui/glyphs.js';

const slot = (name) => $(`[data-slot="${name}"]`);

class HomePage {
  constructor(data) {
    Object.assign(this, data); // site, research, builds, pages, literature, facts
    this.director = new ScrollDirector();
    this.fill = (text) => Store.fill(text, this.facts);
  }

  start() {
    document.title = this.site.meta?.title || this.site.name;
    this.shell = new Shell({ site: this.site, pages: this.pages, home: true }).renderTop().renderFooter();
    this.hero();
    this.ticker();
    this.about();
    this.researchSection();
    this.buildsSection();
    this.contact();
    this.axis();
    this.figure();
    this.shell.follow(this.director).spy();
    Reveal.watch();
    Pointer.bind();
    this.director.start();
    // If the page was opened at /#research, land there once the content exists.
    if (location.hash.length > 1) requestAnimationFrame(() => $(location.hash)?.scrollIntoView());
  }

  hero() {
    const { site } = this;
    clear(slot('eyebrow')).append(...(site.eyebrow || []).map((t) => h('span', t)));
    const [first, ...rest] = site.name.trim().split(/\s+/);
    const name = slot('name');
    clear(name).append(h('span.line', first), rest.length ? h('span.line', rest.join(' ')) : '');
    name.dataset.label = site.name;
    this.title = new KineticTitle(name, this.director);
    append(clear(slot('tagline')), emph(site.tagline));
    slot('lede').textContent = this.fill(site.lede);
    // The hero drifts up and fades a little as you leave it.
    const inner = $('.hero__in');
    this.director.track($('.hero'), (p) => {
      const out = unlerp(0.5, 1, p);
      inner.style.transform = `translate3d(0, ${(-out * 60).toFixed(1)}px, 0)`;
      inner.style.opacity = (1 - out * 1.15).toFixed(3);
    });
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
    slot('about-label').textContent = site.sections?.about?.label || 'About';
    const statement = slot('statement');
    append(statement, words(this.fill(site.about.statement)));
    const reveal = new WordReveal(statement);
    const stage = statement.closest('.stage');
    // Words light up from the moment the stage arrives until most of the way through it.
    this.director.track(stage, (p, d) => {
      const span = stage.offsetHeight + d.vh;
      reveal.set(unlerp((d.vh * 0.55) / span, (stage.offsetHeight - d.vh * 0.1) / span, p));
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

    const caps = (site.capabilities || []).map((c, i) => h('article.plate.cap', { 'data-reveal': 'wipe', style: { '--i': i % 2 } },
      h('div.plate__head', h('span.label', String(i + 1).padStart(2, '0')), glyph(c.theme, c.title)),
      h('h3.plate__title', c.title),
      h('p.plate__text', c.text)));

    slot('about-body').append(
      stats,
      h('div.about',
        h('div.about__side',
          h('p.about__note', { 'data-reveal': '' }, this.fill(site.about.note)),
          education,
          h('div', { 'data-reveal': '' },
            h('p.label', { style: { 'margin-bottom': '12px' } }, 'Toolkit'),
            h('div.toolkit', (site.toolkit || []).map((t) => h('span.chip', t))))),
        h('div.about__caps', caps)));
  }

  researchSection() {
    const { site, research } = this;
    const copy = site.sections?.research || {};
    slot('research-label').textContent = copy.label || 'Research';
    append(slot('research-title'), emph(copy.title || 'Research'));
    slot('research-lede').textContent = this.fill(copy.lede || '');
    slot('research-hint').textContent = coarsePointer() ? 'Tap a dot to meet the study' : 'Hover a dot to meet the study. Click to open it.';

    const featured = research.items.filter((s) => s.featured);
    this.index = new ResearchIndex(research, { onHover: (i) => { if (this.fig) this.fig.highlight = i; } });
    slot('research-body').append(
      featured.length && h('div.body__head', h('h3', copy.featured || 'Featured'), h('span.label', `${featured.length} of ${research.items.length}`)),
      h('div.featured', featured.map((s, i) => new StudyCard(s, research.themes).render(i))),
      h('div.body__gap'),
      h('div.body__head', h('h3', copy.index || 'The full index'), h('span.label', `${research.items.length} studies · ${this.facts.firstYear} to today`)),
      this.index.render());
  }

  buildsSection() {
    const { site, builds } = this;
    const copy = site.sections?.builds || {};
    slot('builds-label').textContent = copy.label || 'Lab';
    append(slot('builds-title'), emph(copy.title || 'Lab'));
    slot('builds-lede').textContent = this.fill(copy.lede || '');
    slot('builds-body').append(h('div.windows', (builds.items || []).filter((b) => !b.draft).map((b, i) => new WindowCard(b).render(i))));
  }

  contact() {
    const { site } = this;
    const copy = site.sections?.contact || {}, c = site.contact || {};
    slot('contact-label').textContent = copy.label || 'Contact';
    append(slot('contact-title'), emph(copy.title || 'Get in touch'));
    slot('contact-text').textContent = copy.text || '';
    const btn = (href, label, name, solid) => href && h(`a.btn${solid ? '.btn--solid' : ''}`, linkAttrs(href), icon(name), label);
    slot('contact-links').append(...[
      btn(c.email && `mailto:${c.email}`, c.email, 'mail', true),
      btn(c.linkedin, 'LinkedIn', 'linkedin'),
      btn(c.github, 'GitHub', 'github', !c.email),
      btn(c.resume && Store.url(c.resume), 'Résumé', 'file'),
    ].filter(Boolean));
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

  figure() {
    const caption = $('.caption'), tip = $('.tip');
    const captions = this.site.captions || {};
    this.fig = new Figure($('#figure'), this.director, {
      studies: this.research.items,
      literature: this.literature,
      onScene: (scene, visible, i) => {
        caption.classList.toggle('is-on', visible && Boolean(captions[scene.name]));
        if (!captions[scene.name]) return;
        caption.firstElementChild.textContent = `Fig. ${i + 1}`;
        caption.lastElementChild.textContent = Store.fill(captions[scene.name], { ...this.facts, dots: this.fig?.n ?? 0 });
      },
      onHover: (study, x, y) => {
        document.documentElement.classList.toggle('is-pointing', Boolean(study));
        tip.hidden = !study;
        if (!study) return;
        tip.href = study.url || study.repo; tip.target = '_blank'; tip.rel = 'noopener';
        tip.replaceChildren(h('small', study.cite), h('strong', study.title), h('em', 'Open the study ↗'));
        tip.style.left = `${clamp(x, 160, innerWidth - 160)}px`;
        tip.style.top = `${y}px`;
      },
    }).mount();
    if (Store.drafting) this.fig.intro = 1; // no opening animation inside the Studio preview
    // The caption steps aside when the footer arrives.
    new IntersectionObserver(([e]) => { caption.style.visibility = e.isIntersecting ? 'hidden' : ''; }).observe($('.footer'));
    // A click anywhere that is not already a control opens the study under the pointer.
    addEventListener('click', (e) => {
      const study = this.research.items[this.fig.hovered];
      if (!study || e.target.closest('a, button, input, textarea, select, iframe')) return;
      window.open(study.url || study.repo, '_blank', 'noopener');
    });
  }
}

Store.site()
  .then((data) => new HomePage(data).start())
  .catch((err) => {
    console.error(err);
    document.body.append(h('p.wrap', { style: { position: 'relative', 'z-index': 5, padding: '120px 0' } }, `This page could not load its content: ${err.message}`));
  });
