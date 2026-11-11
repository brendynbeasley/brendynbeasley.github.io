/**
 * bankmonitor.js: the U.S. Bancorp study, kept current.
 *
 * Draws content/data/usbancorp.json, which GitHub rewrites every morning with
 * tools/usb-monitor.mjs. Kept short on purpose:
 *
 *   status          one word and one sentence: has anything changed?
 *   chart           U.S. Bank against the typical rival, five measures
 *   warning lights  the monitor's five tripwires, in plain words
 *   what's new      anything found since the report was finished
 *
 * It also asks GitHub whether the monitor is running right now.
 */

import { h } from '../core/dom.js';
import { clamp, debounce } from '../core/util.js';

const RUNS = 'https://api.github.com/repos/brendynbeasley/brendynbeasley.github.io/actions/workflows/usb-monitor.yml/runs?per_page=1';

/** The five measures on the chart, in plain words. */
const MEASURES = [
  { key: 'roe', name: 'Profit on equity', about: 'Profit as a share of the shareholders’ money in the bank. Higher is better.' },
  { key: 'eff', name: 'Cost of each dollar', about: 'What the bank spends for each dollar of revenue it brings in. Lower is better.' },
  { key: 'nim', name: 'Lending margin', about: 'What it earns on loans and bonds minus what it pays on deposits, as a share of what it lends. Higher is better.' },
  { key: 'fee', name: 'Fee income', about: 'The share of revenue that comes from fees instead of interest.' },
  { key: 'nib', name: 'Free deposits', about: 'The share of deposits that earn no interest. This is the cheapest money a bank has.' },
];

const EVENTS = [
  { at: '2008-09-30', name: '2008 crisis' },
  { at: '2022-12-31', name: 'Buys Union Bank' },
];

const STATUS = {
  'NO CHANGE': { word: 'No change', tone: 'calm', say: 'Nothing new has turned up since the report was finished.' },
  'NO CHANGE EXPECTED': { word: 'No change', tone: 'calm', say: 'A few routine filings came in. None of them touch the findings.' },
  REVIEW: { word: 'Review', tone: 'note', say: 'New quarterly numbers are out. They don’t trip any warning light, but some figures in the report are now out of date.' },
  REVISIT: { word: 'Revisit', tone: 'alarm', say: 'Something serious came in, or a warning light is on. Part of the report may need to change.' },
};

/** The tripwires, as plain sentences. */
const LIGHTS = {
  nib: 'Free deposits moved',
  eff: 'Cost of each dollar moved',
  acl: 'Money set aside for bad loans moved',
  nal: 'Loans in trouble moved',
  growth: 'The bank’s size moved',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (iso) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return `${MONTHS[m - 1]} ${d}, ${y}`; };
const quarter = (iso) => `Q${Math.ceil(Number(iso.slice(5, 7)) / 3)} ${iso.slice(0, 4)}`;
const ago = (iso) => {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 90) return 'just now';
  if (s < 5400) return `${Math.round(s / 60)} minutes ago`;
  if (s < 129600) return `${Math.round(s / 3600)} hours ago`;
  return `${Math.round(s / 86400)} days ago`;
};
const pct = (v) => (v == null ? 'n/a' : `${v.toFixed(1)}%`);

export class BankMonitor {
  /** @param {object} data content/data/usbancorp.json */
  constructor(data) {
    this.d = data;
    this.q = data.series.quarters;
    this.n = this.q.length;
    this.measures = MEASURES.filter((m) => data.series.metrics[m.key]);
    this.pick = this.measures[0];
    this.hover = -1;
  }

  get m() { return this.d.series.metrics[this.pick.key]; }

  render() {
    this.chart = h('div.bankmon__chart');
    this.about = h('p.bankmon__about');
    this.readout = h('p.bankmon__readout');
    this.chips = h('div.bankmon__chips', { role: 'group', 'aria-label': 'Which measure to show' },
      this.measures.map((m) => h('button.chip', { type: 'button', 'aria-pressed': String(m === this.pick), onClick: () => this.choose(m) }, m.name)));

    this.root = h('section.exhibit.bankmon', { 'data-reveal': '' },
      h('header.exhibit__head',
        h('p.label', 'Updates every morning'),
        h('h3.exhibit__title', 'U.S. Bank against its five closest rivals')),
      this.status(),
      this.chips, this.about, this.chart, this.readout,
      h('div.bankmon__panel',
        h('div', h('p.label', 'Warning lights'), this.lights()),
        h('div', h('p.label', 'What’s new'), this.news())),
      h('p.exhibit__note',
        `Numbers are the FDIC’s, for the bank itself, so they can differ a little from the report. The typical rival is the middle of ${this.d.peers.join(', ').replace(/, ([^,]*)$/, ' and $1')}.`));

    new ResizeObserver(debounce(() => this.plot(), 80)).observe(this.chart);
    this.choose(this.pick);
    this.ask();
    return this.root;
  }

  /* ---- Status ------------------------------------------------------------- */

  status() {
    const s = STATUS[this.d.verdict.status] || { word: this.d.verdict.status, tone: 'note', say: this.d.verdict.why };
    const down = this.d.streams.filter((x) => !x.ok).length;
    this.live = h('span', `Last checked ${ago(this.d.checked)}.`);
    return h(`div.bankmon__verdict.is-${s.tone}`,
      h('div.bankmon__status', h('span.bankmon__dot', { 'aria-hidden': 'true' }), h('span.display', s.word)),
      h('div.bankmon__why',
        h('p', s.say),
        h('p.bankmon__when', this.live, down ? ` ${down} of ${this.d.streams.length} sources didn’t answer that time.` : ` All ${this.d.streams.length} sources answered.`)));
  }

  async ask() {
    try {
      const res = await fetch(RUNS, { headers: { Accept: 'application/vnd.github+json' } });
      if (!res.ok) return;
      const run = (await res.json()).workflow_runs?.[0];
      if (run && run.status !== 'completed') {
        this.live.replaceChildren(h('b', 'Checking right now. '), `Last finished check ${ago(this.d.checked)}.`);
      }
    } catch { /* the date from the data file is enough */ }
  }

  /* ---- Warning lights and news --------------------------------------------- */

  lights() {
    const on = this.d.tripwires.filter((t) => t.crossed);
    return h('div.bankmon__lights',
      h('p.bankmon__sum', on.length ? `${on.length} of ${this.d.tripwires.length} are on.` : `All ${this.d.tripwires.length} are off for ${quarter(this.d.tripwires[0]?.quarter || this.q[this.n - 1])}.`),
      h('ul', this.d.tripwires.map((t) => {
        const unit = t.unit === '%' ? '%' : ' points';
        const span = t.compare === 'year' ? 'in a year' : 'in a quarter';
        return h(`li${t.crossed ? '.is-on' : ''}`,
          h('span.bankmon__lamp', { 'aria-hidden': 'true' }),
          h('span', `${LIGHTS[t.key] || t.label} ${Math.abs(t.change ?? 0).toFixed(1)}${unit} ${span}. The light comes on at ${t.threshold}${unit}.`));
      })));
  }

  news() {
    const events = (this.d.events || []).filter((e) => e.severity !== 'low');
    if (!events.length) return h('p.bankmon__sum', `Nothing since the report was finished on ${day(this.d.baseline.date)}. New filings, regulator orders and data releases will show up here.`);
    return h('ul.bankmon__news', events.slice(0, 8).map((e) => h(`li.is-${e.severity}`,
      h('span.bankmon__newsdate', e.date ? day(e.date) : ''),
      h('a', { href: e.url, target: '_blank', rel: 'noopener' }, e.title))));
  }

  /* ---- Chart ----------------------------------------------------------------- */

  choose(m) {
    this.pick = m;
    [...this.chips.children].forEach((c, i) => c.setAttribute('aria-pressed', String(this.measures[i] === m)));
    this.about.textContent = m.about;
    this.plot(); this.say();
  }

  say() {
    const i = this.hover >= 0 ? this.hover : this.n - 1;
    const u = this.m.usb[i], p = this.m.peers[i];
    this.readout.replaceChildren(h('b', quarter(this.q[i])), `: U.S. Bank ${pct(u)}, typical rival ${pct(p)}.`);
  }

  plot() {
    const W = this.chart.clientWidth, H = Math.round(clamp(W * 0.46, 220, 360));
    if (!W) return;
    const m = this.m, pad = { l: 36, r: 8, t: 30, b: 22 }, pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
    const vals = [...m.usb, ...m.peers].filter((v) => v != null).sort((a, b) => a - b);
    let lo = vals[0], hi = vals[vals.length - 1];
    const span = hi - lo || 1; lo -= span * 0.08; hi += span * 0.08;
    const step = niceStep((hi - lo) / 4);
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const x = (i) => pad.l + (i / (this.n - 1)) * pw, y = (v) => pad.t + (1 - (clamp(v, lo, hi) - lo) / (hi - lo)) * ph;
    const path = (s) => { let d = '', pen = false; s.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`; pen = true; }); return d; };
    const text = (attrs, words) => { const t = h('text', attrs); t.textContent = words; return t; };
    const svg = h('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': `${this.pick.name}, U.S. Bank and its typical rival, every quarter since 2002` });
    for (let v = lo; v <= hi + 1e-9; v += step) {
      svg.append(h('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: Math.abs(v) < 1e-9 ? 'tay-zero' : 'tay-grid' }),
        text({ x: pad.l - 6, y: y(v) + 3, class: 'tay-tick', 'text-anchor': 'end' }, `${+v.toFixed(1)}%`));
    }
    for (let i = 0; i < this.n; i++) {
      const yr = Number(this.q[i].slice(0, 4));
      if (this.q[i].endsWith('03-31') && yr % 5 === 0) svg.append(text({ x: x(i), y: H - 5, class: 'tay-tick', 'text-anchor': 'middle' }, yr));
    }
    for (const ev of EVENTS) {
      const i = this.q.indexOf(ev.at);
      if (i < 0) continue;
      svg.append(h('line', { x1: x(i), x2: x(i), y1: pad.t, y2: H - pad.b, class: 'bm-mark' }),
        text({ x: x(i) + 4, y: pad.t + 9, class: 'bm-marklabel' }, ev.name));
    }
    svg.append(h('path', { d: path(m.peers), class: 'bm-line bm-line--median' }), h('path', { d: path(m.usb), class: 'bm-line bm-line--usb' }));
    const key = (cx, cls, words) => h('g', h('line', { x1: cx, x2: cx + 16, y1: 10, y2: 10, class: `bm-line ${cls}` }), text({ x: cx + 22, y: 13, class: 'tay-key' }, words));
    svg.append(key(pad.l, 'bm-line--usb', 'U.S. Bank'), key(pad.l + 100, 'bm-line--median', 'Typical rival'));
    const cursor = h('g', { class: 'tay-cursor', visibility: 'hidden' },
      h('line', { y1: pad.t, y2: H - pad.b, class: 'tay-zero' }), h('circle', { r: 3.5, class: 'bm-dot bm-dot--median' }), h('circle', { r: 3.5, class: 'bm-dot bm-dot--usb' }));
    svg.append(cursor);
    const move = (e) => {
      const box = svg.getBoundingClientRect();
      const i = Math.round(clamp((e.clientX - box.left - pad.l) / pw) * (this.n - 1));
      this.hover = i;
      cursor.setAttribute('visibility', 'visible');
      cursor.children[0].setAttribute('x1', x(i)); cursor.children[0].setAttribute('x2', x(i));
      const place = (c, v) => { c.setAttribute('cx', x(i)); c.setAttribute('cy', y(v ?? lo)); c.setAttribute('visibility', v == null ? 'hidden' : 'visible'); };
      place(cursor.children[1], m.peers[i]); place(cursor.children[2], m.usb[i]);
      this.say();
    };
    svg.addEventListener('pointermove', move); svg.addEventListener('pointerdown', move);
    svg.addEventListener('pointerleave', () => { this.hover = -1; cursor.setAttribute('visibility', 'hidden'); this.say(); });
    this.chart.replaceChildren(svg);
  }
}

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}
