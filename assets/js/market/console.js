/**
 * console.js: the readout and the controls for the market.
 *
 * The tape (bottom left) reports the market the way my studies do: number of
 * sellers, the Herfindahl–Hirschman index and the average markup. Under it
 * sits one line of real data from my replication of Cournot (1838): what
 * generic drugs actually sell for when this many sellers have entered.
 *
 * Each control runs an experiment on the model and then quotes what one of
 * my studies found about the same thing in real markets.
 */

import { h, icon } from '../core/dom.js';
import { fmt } from '../core/util.js';

const pct = (v, d = 1) => `${(v * 100).toFixed(d)}%`;
const price = (v) => v.toFixed(2);

/** id, label, the study it points to, and (for switches) the label when it is on. */
export const EXPERIMENTS = [
  { id: 'enter', label: 'Add a seller', study: 'one-more-seller' },
  { id: 'merge', label: 'Merge two', study: 'beer-after-millercoors' },
  { id: 'cartel', label: 'Form a cartel', on: 'Break the cartel', study: 'the-trigger-price' },
  { id: 'cut', label: 'Cut one seller’s costs', study: 'the-perennial-gale' },
  { id: 'cap', label: 'Cap the price', on: 'Lift the cap', study: 'what-a-kilowatt-costs' },
  { id: 'lock', label: 'Raise switching costs', on: 'Lower switching costs', study: 'the-cancellation-fee' },
  { id: 'shock', label: 'Raise every cost 10%', study: 'how-much-gets-passed-on' },
  { id: 'reset', label: 'Reset' },
];

/** Which experiment each research theme sets off when it is picked in the index. */
export const THEME_EXPERIMENT = {
  foundations: 'enter', measurement: 'merge', strategy: 'cartel', innovation: 'cut',
  regulation: 'cap', exclusion: 'lock', macro: 'shock', pricing: 'undercut',
};

export class MarketConsole {
  /**
   * @param {{market: Market, view: MarketView, research: object, cournot?: object, onStudy?: Function}} options
   *   onStudy(slug) opens a study when its name is clicked on the tape
   */
  constructor({ market, view, research, cournot = null, onStudy = () => {} }) {
    Object.assign(this, { market, view, cournot, onStudy });
    this.studies = new Map((research?.items || []).map((s) => [s.slug, s]));
    this.session = { added: 0, experiments: 0 };
    this.messageUntil = 0;
    this.chips = new Map();
    market.on((type, data) => {
      if (type === 'enter' && data.visitor) { this.session.added++; this.report('enter', data); }
    });
  }

  /* ---- Controls ------------------------------------------------------------ */

  renderControls() {
    return h('div.console', { role: 'group', 'aria-label': 'Run an experiment on the market' },
      EXPERIMENTS.map((x) => {
        const chip = h('button.chip.console__chip', { type: 'button', 'aria-pressed': x.on ? 'false' : null, onClick: () => this.run(x.id) }, x.label);
        this.chips.set(x.id, chip);
        return chip;
      }));
  }

  /** Fewest sellers an experiment is run with. With only two or three, every price sits at the ceiling and nothing can move. */
  static FLOOR = 9;

  run(id) {
    const m = this.market;
    const x = EXPERIMENTS.find((e) => e.id === id);
    this.view.pulse(7);
    if (id === 'reset') {
      this.view.floor = 0; m.reset();
      for (const e of EXPERIMENTS) if (e.on) this.paint(e.id, false);
      this.say('Back to the market as it was.');
      return x;
    }
    this.session.experiments++;
    if (id === 'enter') {
      const before = m.stats(), s = m.enter({ visitor: true, quiet: true });
      this.session.added++; this.report('enter', { seller: s, before });
      return x;
    }
    // Bring the market up to size first, then run the experiment once the newcomers have settled.
    const short = Math.max(0, MarketConsole.FLOOR - m.scripted.length);
    this.view.floor = MarketConsole.FLOOR; m.target = Math.max(m.target, MarketConsole.FLOOR);
    if (short) this.say(`${short} more ${short === 1 ? 'seller is' : 'sellers are'} arriving first, so there is a market to test.`);
    m.after(short ? short * 0.3 + 1.6 : 0, () => this.apply(id));
    return x;
  }

  apply(id) {
    const m = this.market;
    switch (id) {
      case 'merge': { const r = m.merge(); if (r) this.report('merge', r); else this.say('There are no two neighbours left to merge.'); break; }
      case 'cartel': case 'cap': case 'lock': {
        const flag = { cartel: 'cartel', cap: 'capped', lock: 'locked' }[id], on = !m[flag], before = m.stats();
        ({ cartel: () => m.setCartel(on), cap: () => m.setCap(on), lock: () => m.setLock(on) })[id]();
        this.paint(id, on);
        this.report(on ? id : `${id}Ends`, { before, ceiling: m.ceiling });
        break;
      }
      case 'cut': { const before = m.stats(); const s = m.cutCost(); if (s) this.report('cut', { seller: s, before, share: s.share }); break; }
      case 'shock': { const before = m.stats(); m.shock(1.1); this.report('shock', { before }); break; }
      case 'undercut': { const before = m.stats(); const s = m.undercut(); if (s) this.report('undercut', { seller: s, before }); break; }
      default:
    }
  }

  paint(id, on) {
    const x = EXPERIMENTS.find((e) => e.id === id), chip = this.chips.get(id);
    if (!chip || !x?.on) return;
    chip.setAttribute('aria-pressed', String(on));
    chip.textContent = on ? x.on : x.label;
  }

  /**
   * Say what an experiment did. The market needs a moment to respond, so the
   * numbers are read a few seconds after the event.
   */
  report(type, data) {
    const m = this.market, b = data.before;
    const study = { enter: 'one-more-seller', merge: 'beer-after-millercoors', cartel: 'the-trigger-price', cartelEnds: 'the-secret-price-cut', cut: 'the-perennial-gale', cap: 'what-a-kilowatt-costs', lock: 'the-cancellation-fee', shock: 'how-much-gets-passed-on', undercut: 'the-secret-price-cut' }[type];
    const now = {
      enter: () => 'A seller is setting up.',
      merge: () => { data.was = (data.a.p + data.b.p) / 2; return `Two neighbours merged. HHI ${fmt(Math.round(data.before.hhi))} to ${fmt(Math.round(data.after.hhi))}, up ${fmt(Math.round(data.change))}.`; },
      cartel: () => 'Every seller now sets its price as one.',
      cartelEnds: () => 'The cartel has broken.',
      cut: () => 'One seller found a way to make it for 40% less.',
      cap: () => `A ceiling of ${price(data.ceiling)} is now the most anyone may charge.`,
      capEnds: () => 'The ceiling is gone.',
      lock: () => 'Switching sellers now costs customers 80% more.',
      lockEnds: () => 'Switching costs are back to normal.',
      shock: () => 'Every seller’s costs just rose 10%.',
      undercut: () => 'One seller has cut its price and is holding it there.',
    }[type];
    this.say(now ? now() : '', study);
    m.after(type === 'cartel' || type === 'merge' ? 4.5 : 3, () => {
      const a = m.stats();
      const later = {
        enter: () => `${a.sellers} sellers. Markup ${pct(b.lerner)} to ${pct(a.lerner)}.`,
        merge: () => `Merger: HHI up ${fmt(Math.round(data.change))} to ${fmt(Math.round(a.hhi))}. The pair moved their prices from ${price(data.was)} to ${price((data.a.p + data.b.p) / 2)}. ${a.hhi > 1800 && data.change > 100 ? 'Above 1,800 and up more than 100: presumed to lessen competition under the 2023 U.S. Merger Guidelines.' : 'The 2023 U.S. Merger Guidelines presume harm only above an HHI of 1,800 with a rise over 100.'}`,
        cartel: () => `Cartel: average price ${price(b.price)} to ${price(a.price)}, markup ${pct(b.lerner)} to ${pct(a.lerner)}.`,
        cartelEnds: () => `Price war: average price ${price(b.price)} to ${price(a.price)}.`,
        cut: () => `Lower costs: its share went ${pct(data.share)} to ${pct(data.seller.share)}.`,
        cap: () => `Price cap: markup ${pct(b.lerner)} to ${pct(a.lerner)}.`,
        capEnds: () => `No cap: markup ${pct(b.lerner)} to ${pct(a.lerner)}.`,
        lock: () => `Higher switching costs: markup ${pct(b.lerner)} to ${pct(a.lerner)}.`,
        lockEnds: () => `Lower switching costs: markup ${pct(b.lerner)} to ${pct(a.lerner)}.`,
        shock: () => `Costs up ${pct(a.cost / b.cost - 1, 0)}, prices up ${pct(a.price / b.price - 1)}. Pass-through in this model: ${((a.price - b.price) / (a.cost - b.cost)).toFixed(2)}.`,
        undercut: () => `Price cut: neighbours followed. Average price ${price(b.price)} to ${price(a.price)}.`,
      }[type];
      if (later) this.say(later(), study);
    });
  }

  /* ---- Tape ----------------------------------------------------------------- */

  renderTape() {
    const cell = (label) => { const v = h('b', ''); return [h('span.tape__cell', h('i', label), v), v]; };
    const [a, sellers] = cell('Sellers'), [b, hhi] = cell('HHI'), [c, markup] = cell('Markup');
    this.out = { sellers, hhi, markup };
    this.line = h('p.tape__line');
    this.notes = h('div.tape__notes', { hidden: true });
    const about = h('button.tape__about', { type: 'button', 'aria-expanded': 'false', 'aria-label': 'What is this background?', onClick: () => this.explain(about) }, '?');
    this.tape = h('aside.tape', { 'aria-label': 'Market readout' },
      this.notes,
      h('div.tape__row', a, b, c, this.badge = h('span.tape__badge'), about), this.line);
    return this.tape;
  }

  /** The note behind the "?": what the background is, with counts taken from the running page. */
  async explain(button) {
    const open = this.notes.hidden;
    this.notes.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (!open) return;
    const m = this.market, n = m.present.length;
    const code = h('span', 'Counting the code');
    this.notes.replaceChildren(
      h('p', h('b', 'The background is a market, and it is running.'), ' Each + is a seller. Customers are spread evenly over the screen and buy from whichever seller is cheapest once travel is paid for, so every seller ends up with a territory. The rings are lines of equal delivered price.'),
      h('p', 'Sixty times a second each seller moves its price part of the way to its best reply, using the exact slope of its demand. HHI is the sum of squared percentage shares. The markup is the Lerner index, (price − cost) ÷ price. The model follows Hotelling (1929) and d’Aspremont, Gabszewicz and Thisse (1979).'),
      h('p.tape__counts', `Right now: ${n} sellers, ${n * (n - 1)} half-plane clips a frame. `, code),
      h('p', h('a', { href: 'https://github.com/brendynbeasley/brendynbeasley.github.io/blob/main/assets/js/market/market.js', target: '_blank', rel: 'noopener' }, 'Read the model', icon('arrow')), '  ',
        h('a', { href: 'https://github.com/brendynbeasley/brendynbeasley.github.io/blob/main/tools/check-model.mjs', target: '_blank', rel: 'noopener' }, 'and its checks', icon('arrow'))));
    // Count the JavaScript this page actually loaded, straight from the files.
    try {
      const urls = [...new Set(performance.getEntriesByType('resource').map((r) => r.name).filter((u) => /\/assets\/js\/.*\.js(\?|$)/.test(u)))];
      const sizes = await Promise.all(urls.map((u) => fetch(u).then((r) => r.text()).then((t) => t.split('\n').length)));
      code.textContent = `This page is running ${fmt(sizes.reduce((a, b) => a + b, 0))} lines of JavaScript in ${urls.length} files, with no libraries.`;
    } catch { code.textContent = ''; }
  }

  /** One line under the numbers, optionally followed by one of my findings on the same subject. */
  say(text, slug) {
    const s = slug && this.studies.get(slug);
    this.line.replaceChildren(...[text,
      s && h('span.tape__found', ' In the data: ', s.finding ? `${s.finding}. ` : '',
        h('a', { href: `#study/${s.slug}`, onClick: (e) => { e.preventDefault(); this.onStudy(s.slug); } }, s.title, icon('arrow')))].filter(Boolean));
    this.messageUntil = this.market.clock + 11;
    this.tape.classList.add('is-talking');
  }

  /** What generic drugs really cost with this many entrants (One More Seller, NADAC median). */
  dataLine(sellers) {
    const rows = this.cournot?.rows;
    if (!rows?.length) return;
    const entrants = sellers - 1, s = this.studies.get('one-more-seller');
    const row = rows[Math.min(entrants, rows.length) - 1];
    const text = entrants < 1
      ? 'One seller, no entrant. In U.S. drug markets this is the brand before its first generic.'
      : `U.S. generic drugs with ${entrants >= rows.length ? 'ten or more' : entrants} ${entrants === 1 ? 'entrant' : 'entrants'} sell at ${Math.round(row.median * 100)}% of the brand’s old price.`;
    this.line.replaceChildren(...[h('span.tape__tag', 'Data'), ` ${text} `,
      s && h('a', { href: `#study/${s.slug}`, onClick: (e) => { e.preventDefault(); this.onStudy(s.slug); } }, s.title, icon('arrow'))].filter(Boolean));
  }

  update(stats) {
    if (!this.out) return;
    this.stats = stats;
    this.out.sellers.textContent = String(stats.sellers);
    this.out.hhi.textContent = fmt(Math.round(stats.hhi));
    this.out.markup.textContent = pct(stats.lerner);
    this.badge.textContent = stats.sellers === 1 ? 'Monopoly' : stats.hhi > 1800 ? 'Highly concentrated' : '';
    if (this.market.clock > this.messageUntil) {
      this.tape.classList.remove('is-talking');
      if (stats.sellers !== this.shown) { this.shown = stats.sellers; this.dataLine(stats.sellers); }
    } else this.shown = -1;
    const lit = this.view.focus > 0.5 || this.view.boost > 0;
    this.tape.classList.toggle('is-on', lit);
    this.tape.classList.toggle('is-floating', this.view.focus <= 0.5);
  }
}
