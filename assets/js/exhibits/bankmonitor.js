/**
 * bankmonitor.js: the U.S. Bancorp study, kept current.
 *
 * Draws content/data/usbancorp.json, which GitHub rewrites every morning with
 * tools/usb-monitor.mjs. Four parts:
 *
 *   the verdict    has anything happened that could change a finding?
 *   the chart      U.S. Bank against the median of its five core peers, any of
 *                  eleven Call Report ratios, every quarter since 2002
 *   the tripwires  the fixed thresholds that send a person back to the report
 *   the log        every filing, order or data release found since the report
 *
 * It also asks GitHub whether the monitor is running right now, so the status
 * line is live even between commits.
 */

import { h } from '../core/dom.js';
import { clamp, debounce } from '../core/util.js';

const RUNS = 'https://api.github.com/repos/brendynbeasley/brendynbeasley.github.io/actions/workflows/usb-monitor.yml/runs?per_page=1';
const RUNS_PAGE = 'https://github.com/brendynbeasley/brendynbeasley.github.io/actions/workflows/usb-monitor.yml';
const ORDER = ['roe', 'eff', 'nim', 'fee', 'nib', 'cof', 'acl', 'nal', 'nco', 'roa', 'eq'];
const MARKS = [
  { at: '2008-09-30', name: 'Lehman' },
  { at: '2022-12-31', name: 'Union Bank' },
  { at: '2023-03-31', name: 'March 2023' },
];
const STATUS = {
  'NO CHANGE': { word: 'No change', tone: 'calm' },
  'NO CHANGE EXPECTED': { word: 'No change expected', tone: 'calm' },
  REVIEW: { word: 'Review', tone: 'note' },
  REVISIT: { word: 'Revisit', tone: 'alarm' },
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (iso) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
const quarter = (iso) => `${iso.slice(0, 4)} Q${Math.ceil(Number(iso.slice(5, 7)) / 3)}`;
const ago = (iso) => {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 90) return 'just now';
  if (s < 5400) return `${Math.round(s / 60)} minutes ago`;
  if (s < 129600) return `${Math.round(s / 3600)} hours ago`;
  return `${Math.round(s / 86400)} days ago`;
};
const num = (v, d = 2) => (v == null ? 'n/a' : v.toFixed(d));
const signed = (v, d = 2) => (v == null ? 'n/a' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}`);

export class BankMonitor {
  /** @param {object} data content/data/usbancorp.json  @param {{report?: string}} options */
  constructor(data, { report = '' } = {}) {
    this.d = data; this.report = report;
    this.q = data.series.quarters;
    this.n = this.q.length;
    this.key = 'roe';
    this.hover = -1;
  }

  get m() { return this.d.series.metrics[this.key]; }

  render() {
    this.chart = h('div.bankmon__chart');
    this.readout = h('p.bankmon__readout.label');
    this.live = h('span.bankmon__live', 'Asking GitHub whether the monitor is running…');
    const keys = ORDER.filter((k) => this.d.series.metrics[k]);
    this.chips = h('div.bankmon__chips', { role: 'group', 'aria-label': 'Which measure to draw' },
      keys.map((k) => h('button.chip', { type: 'button', 'aria-pressed': String(k === this.key), data: { k }, onClick: () => this.choose(k) }, this.d.series.metrics[k].short)));
    const first = this.q[0].slice(0, 4), last = this.q[this.n - 1];

    this.root = h('section.exhibit.bankmon', { 'data-reveal': '' },
      h('header.exhibit__head',
        h('p.label', 'Live exhibit'),
        h('h3.exhibit__title', `U.S. Bank against its five closest peers, ${first} to ${quarter(last)}`)),
      this.verdict(),
      h('div.bankmon__panel',
        h('div',
          this.chips, this.chart, this.readout),
        h('div.bankmon__side',
          h('p.label', 'Tripwires, latest quarter'),
          this.tripwires(),
          h('p.label', { style: { 'margin-top': '22px' } }, 'Sources checked on the last run'),
          this.streams())),
      h('div.bankmon__log',
        h('p.label', `Found since the report was written on ${day(this.d.baseline.date)}`),
        this.log()),
      h('p.exhibit__note',
        `Call Report ratios for the lead bank, U.S. Bank National Association, as the FDIC computes them: year to date and annualized. They can differ from the report's own figures, which use the project's definitions and, where stated, the holding company. The peer line is the median of ${this.d.peers.join(', ')}. The monitor runs on GitHub every morning and changes nothing in the report; a person reads what it finds. `,
        h('a.link', { href: RUNS_PAGE, target: '_blank', rel: 'noopener' }, 'Every run is public'), '.'));

    new ResizeObserver(debounce(() => this.plot(), 80)).observe(this.chart);
    this.plot(); this.say();
    this.ask();
    return this.root;
  }

  /* ---- The verdict ---------------------------------------------------------- */

  verdict() {
    const v = this.d.verdict, s = STATUS[v.status] || { word: v.status, tone: 'note' };
    const failed = this.d.streams.filter((x) => !x.ok);
    return h(`div.bankmon__verdict.is-${s.tone}`,
      h('div.bankmon__status',
        h('span.bankmon__dot', { 'aria-hidden': 'true' }),
        h('span.display', s.word)),
      h('div.bankmon__why',
        h('p', v.why),
        h('p.label', `Last check ${day(this.d.checked)}, ${ago(this.d.checked)}  ·  `, this.live),
        failed.length ? h('p.bankmon__warn', `${failed.length} source${failed.length > 1 ? 's' : ''} could not be reached on that run: ${failed.map((x) => x.name).join(', ')}.`) : null));
  }

  async ask() {
    try {
      const res = await fetch(RUNS, { headers: { Accept: 'application/vnd.github+json' } });
      if (!res.ok) throw new Error(res.status);
      const run = (await res.json()).workflow_runs?.[0];
      if (!run) { this.live.textContent = 'the monitor has not run on GitHub yet'; return; }
      const link = (text) => h('a.link', { href: run.html_url, target: '_blank', rel: 'noopener' }, text);
      if (run.status !== 'completed') this.live.replaceChildren(h('b', 'running now'), ' on GitHub (', link('watch'), ')');
      else this.live.replaceChildren(`GitHub run ${run.conclusion === 'success' ? 'finished' : `ended: ${run.conclusion}`} ${ago(run.updated_at)} (`, link('log'), ')');
    } catch {
      this.live.textContent = 'runs every morning on GitHub';
    }
  }

  /* ---- Tripwires, sources, log ---------------------------------------------- */

  tripwires() {
    return h('div.bankmon__trips', this.d.tripwires.map((t) => {
      const used = t.change == null ? 0 : Math.abs(t.change) / t.threshold;
      return h(`div.trip${t.crossed ? '.is-crossed' : ''}`,
        h('span.trip__name', t.label),
        h('span.trip__val', `${signed(t.change)} ${t.unit === '%' ? '%' : 'pts'}`),
        h('span.trip__bar', { title: `Tripwire at ${t.threshold} ${t.unit}` }, h('i', { style: { width: `${clamp(used, 0, 1) * 100}%` } })),
        h('span.trip__lim', `limit ${t.threshold}`),
        h('span.trip__link', `bears on finding ${t.finding}`));
    }));
  }

  streams() {
    return h('ul.bankmon__streams', this.d.streams.map((s) => h(`li${s.ok ? '' : '.is-down'}`,
      h('span.bankmon__tick', { 'aria-hidden': 'true' }, s.ok ? '✓' : '×'),
      h('span', h('b', s.name), ` ${s.note}`))));
  }

  log() {
    const events = this.d.events || [];
    if (!events.length) {
      return h('p.bankmon__empty', 'Nothing yet. No new U.S. Bancorp filing, regulatory order, Call Report quarter or data release has appeared since the report was finished. New items will be listed here with the findings they could affect.');
    }
    return h('ol.bankmon__events', events.slice(0, 40).map((e) => h(`li.ev.is-${e.severity}`,
      h('span.ev__date.label', e.date ? day(e.date) : ''),
      h('div.ev__main',
        h('a.ev__title', { href: e.url, target: '_blank', rel: 'noopener' }, e.title),
        h('p.ev__meta', `${e.label}${e.findings?.length ? `  ·  findings ${e.findings.join(', ')}` : ''}${e.sections?.length ? `  ·  sections ${e.sections.join(', ')}` : ''}`),
        e.revisitIf && e.severity !== 'low' ? h('p.ev__if', 'Reopen the conclusion if: ', e.revisitIf) : null),
      h('span.ev__sev.label', e.severity))));
  }

  /* ---- Chart ------------------------------------------------------------------ */

  choose(k) {
    this.key = k;
    [...this.chips.children].forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.k === k)));
    this.plot(); this.say();
  }

  rank(i) {
    const m = this.m, v = m.usb[i];
    if (v == null) return null;
    const all = [v, ...Object.values(m.each).map((s) => s[i])].filter((x) => x != null);
    const sorted = [...all].sort((a, b) => (m.better === 'lower' ? a - b : b - a));
    return { r: sorted.indexOf(v) + 1, of: all.length };
  }

  say() {
    const m = this.m;
    const i = this.hover >= 0 ? this.hover : this.n - 1;
    const u = m.usb[i], p = m.peers[i];
    const rk = this.rank(i);
    const order = m.better === 'neither' ? '' : `  ·  ${m.better === 'lower' ? 'lower' : 'higher'} is better${rk ? `, rank ${rk.r} of ${rk.of}` : ''}`;
    this.readout.replaceChildren(h('b', quarter(this.q[i])), `  U.S. Bank ${num(u)}%  ·  peer median ${num(p)}%  ·  gap ${signed(u != null && p != null ? u - p : null)}${order}`);
    this.title.textContent = m.label;
  }

  plot() {
    const W = this.chart.clientWidth, H = Math.round(clamp(W * 0.5, 240, 400));
    if (!W) { this.title = this.title || h('span'); return; }
    const m = this.m, pad = { l: 40, r: 10, t: 34, b: 24 }, pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
    const vals = [...m.usb, ...m.peers, ...Object.values(m.each).flat()].filter((v) => v != null);
    const sorted = [...vals].sort((a, b) => a - b);
    // Clip the scale to the 1st and 99th percentile, so one odd quarter does not flatten the rest.
    let lo = sorted[Math.floor(sorted.length * 0.01)], hi = sorted[Math.ceil(sorted.length * 0.99) - 1];
    const span = hi - lo || 1; lo -= span * 0.06; hi += span * 0.06;
    const step = niceStep((hi - lo) / 5);
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const x = (i) => pad.l + (i / (this.n - 1)) * pw, y = (v) => pad.t + (1 - (clamp(v, lo, hi) - lo) / (hi - lo)) * ph;
    const path = (s) => { let d = '', pen = false; s.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`; pen = true; }); return d; };
    const svg = h('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': `Line chart of ${m.label} for U.S. Bank and the median of its peers, by quarter` });
    MARKS.forEach((mk, k) => {
      const i = this.q.indexOf(mk.at);
      if (i < 0) return;
      svg.append(h('line', { x1: x(i), x2: x(i), y1: pad.t, y2: H - pad.b, class: 'bm-mark' }));
      // Marks a quarter apart would print on top of each other, so alternate their rows.
      const t = h('text', { x: x(i) + 4, y: pad.t + 10 + (k % 2) * 12, class: 'bm-marklabel' }); t.textContent = mk.name; svg.append(t);
    });
    for (let v = lo; v <= hi + 1e-9; v += step) {
      svg.append(h('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: Math.abs(v) < 1e-9 ? 'tay-zero' : 'tay-grid' }));
      const t = h('text', { x: pad.l - 6, y: y(v) + 3, class: 'tay-tick', 'text-anchor': 'end' }); t.textContent = +v.toFixed(2); svg.append(t);
    }
    for (let i = 0; i < this.n; i++) {
      if (!this.q[i].endsWith('12-31') || Number(this.q[i].slice(0, 4)) % 4 !== 3) continue;
      const t = h('text', { x: x(i), y: H - 6, class: 'tay-tick', 'text-anchor': 'middle' }); t.textContent = Number(this.q[i].slice(0, 4)) + 1; svg.append(t);
    }
    for (const s of Object.values(m.each)) svg.append(h('path', { d: path(s), class: 'bm-line bm-line--peer' }));
    svg.append(h('path', { d: path(m.peers), class: 'bm-line bm-line--median' }), h('path', { d: path(m.usb), class: 'bm-line bm-line--usb' }));
    const key = (cx, cls, text) => { const g = h('g'); g.append(h('line', { x1: cx, x2: cx + 18, y1: 12, y2: 12, class: `bm-line ${cls}` })); const t = h('text', { x: cx + 24, y: 15, class: 'tay-key' }); t.textContent = text; g.append(t); return g; };
    svg.append(...[key(pad.l, 'bm-line--usb', 'U.S. Bank'), key(pad.l + 106, 'bm-line--median', 'Peer median'), W > pad.l + 300 && key(pad.l + 224, 'bm-line--peer', 'Each peer')].filter(Boolean));
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
    this.title = this.title || h('span');
    this.chart.replaceChildren(h('p.bankmon__measure', this.title), svg);
  }
}

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}

