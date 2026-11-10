/**
 * taylor.js: the Taylor rule, run live against sixty years of the Fed.
 *
 * The series are the ones from my replication of Taylor (1993): the effective
 * federal funds rate, four-quarter inflation in the GDP deflator and the CBO
 * output gap, 1965 to 2026. The rule is
 *
 *     rate = r* + inflation + a × (inflation − target) + b × gap
 *
 * with Taylor's own numbers as the starting point (r* = 2, target = 2,
 * a = b = 0.5). Move a slider and the whole chart, and the table of misses by
 * Fed chair, are recomputed.
 *
 * "Fit" estimates the rule by least squares on the chosen years, with
 * Newey–West standard errors (Bartlett kernel, bandwidth ⌊4(T/100)^(2/9)⌋,
 * small-sample correction). That is the estimator the study uses, so on the
 * study's samples this page reproduces its published coefficients.
 */

import { h, clear, icon } from '../core/dom.js';
import { clamp, debounce } from '../core/util.js';

const TAYLOR = { a: 0.5, b: 0.5, r: 2, t: 2 };

export class TaylorExhibit {
  /** @param {object} data content/data/taylor.json  @param {{study?: object, onStudy?: Function}} options */
  constructor(data, { study = null, onStudy = () => {} } = {}) {
    this.d = data; this.study = study; this.onStudy = onStudy;
    this.n = data.ffr.length;
    const [y, q] = data.start.split('Q').map(Number);
    this.t0 = y * 4 + q - 1;
    this.p = { ...TAYLOR };
    this.windows = [
      { name: 'All years', from: 0, to: this.n - 1 },
      { name: 'Taylor’s sample', from: this.index('1987Q1'), to: this.index('1992Q3') },
      ...data.chairs,
    ];
    this.window = this.windows[0];
    this.hover = -1; this.fitted = null;
  }

  label(i) { const t = this.t0 + i; return `${Math.floor(t / 4)} Q${(t % 4) + 1}`; }
  index(quarter) { const [y, q] = quarter.split('Q').map(Number); return clamp(y * 4 + q - 1 - this.t0, 0, this.n - 1); }
  rule(i, p = this.p) { return p.r + this.d.infl[i] + p.a * (this.d.infl[i] - p.t) + p.b * this.d.gap[i]; }

  /** Mean miss and root-mean-square miss (actual minus rule) between two quarters. */
  miss(from, to) {
    let sum = 0, sq = 0;
    for (let i = from; i <= to; i++) { const e = this.d.ffr[i] - this.rule(i); sum += e; sq += e * e; }
    const n = to - from + 1;
    return { mean: sum / n, rmse: Math.sqrt(sq / n), n };
  }

  /**
   * Least squares of the funds rate on a constant, inflation and the gap,
   * with Newey–West (HAC) standard errors.
   */
  fit(from, to) {
    const X = [], Y = [];
    for (let i = from; i <= to; i++) { X.push([1, this.d.infl[i], this.d.gap[i]]); Y.push(this.d.ffr[i]); }
    const T = X.length, k = 3;
    if (T < 8) return null;
    const XtX = zeros(), Xty = [0, 0, 0];
    X.forEach((x, t) => { for (let r = 0; r < k; r++) { Xty[r] += x[r] * Y[t]; for (let c = 0; c < k; c++) XtX[r][c] += x[r] * x[c]; } });
    const Q = invert(XtX);
    if (!Q) return null;
    const beta = Q.map((row) => row[0] * Xty[0] + row[1] * Xty[1] + row[2] * Xty[2]);
    const e = X.map((x, t) => Y[t] - x[0] * beta[0] - x[1] * beta[1] - x[2] * beta[2]);
    const lags = Math.floor(4 * (T / 100) ** (2 / 9)), S = zeros();
    for (let l = 0; l <= lags; l++) {
      const w = l === 0 ? 1 : 1 - l / (lags + 1);
      for (let t = l; t < T; t++) for (let r = 0; r < k; r++) for (let c = 0; c < k; c++) {
        const g = X[t][r] * e[t] * e[t - l] * X[t - l][c] * w;
        S[r][c] += g; if (l) S[c][r] += g;
      }
    }
    const V = multiply(multiply(Q, S), Q), adj = T / (T - k);
    return { T, lags, beta, se: V.map((row, i) => Math.sqrt(row[i] * adj)) };
  }

  /* ---- Page ----------------------------------------------------------------- */

  render() {
    const slider = (key, label, min, max, step) => {
      const out = h('output', this.p[key].toFixed(2));
      const input = h('input', { type: 'range', min, max, step, value: this.p[key], 'aria-label': label, onInput: (e) => { this.p[key] = Number(e.target.value); this.fitted = null; this.refresh(); } });
      this.inputs[key] = [input, out];
      return h('label.slider', h('span', label), input, out);
    };
    this.inputs = {};
    this.chart = h('div.taylor__chart');
    this.readout = h('p.taylor__readout.label');
    this.table = h('div.taylor__chairs');
    this.fitLine = h('p.taylor__fit');
    this.windowChips = h('div.taylor__windows', { role: 'group', 'aria-label': 'Years to summarise and to fit' },
      this.windows.map((w) => h('button.chip', { type: 'button', 'aria-pressed': String(w === this.window), onClick: () => this.choose(w) }, w.name)));
    const s = this.study;
    this.root = h('section.exhibit.taylor', { 'data-reveal': '' },
      h('header.exhibit__head',
        h('p.label', 'Exhibit'),
        h('h3.exhibit__title', `The federal funds rate and the Taylor rule, ${this.d.start.slice(0, 4)} to ${this.d.end.slice(0, 4)}`)),
      this.chart, this.readout,
      h('div.taylor__panel',
        h('div.taylor__controls',
          h('p.label', 'The rule'),
          slider('a', 'Weight on inflation above target', 0, 2, 0.05),
          slider('b', 'Weight on the output gap', 0, 2, 0.05),
          slider('r', 'Neutral real rate', 0, 4, 0.05),
          slider('t', 'Inflation target', 0, 4, 0.05),
          h('div.taylor__presets',
            h('button.btn.btn--sm', { type: 'button', onClick: () => this.set(TAYLOR) }, 'Taylor 1993'),
            h('button.btn.btn--sm.btn--quiet', { type: 'button', onClick: () => this.set({ ...TAYLOR, b: 1 }) }, 'Double the gap weight'),
            h('button.btn.btn--sm.btn--quiet', { type: 'button', onClick: () => this.estimate() }, 'Fit by least squares')),
          this.fitLine),
        h('div',
          h('p.label', 'Years'), this.windowChips,
          h('p.label', { style: { 'margin-top': '18px' } }, 'Actual rate minus the rule, by Fed chair'), this.table)),
      h('p.exhibit__note',
        'Quarterly data. Inflation is the four-quarter change in the GDP deflator and the gap is the Congressional Budget Office’s output gap. ',
        s && h('a.link', { href: s.url || s.repo, onClick: (e) => { e.preventDefault(); this.onStudy(s.slug); } }, s.title),
        s && '.'));
    new ResizeObserver(debounce(() => this.plot(), 80)).observe(this.chart);
    this.refresh();
    return this.root;
  }

  set(p) {
    Object.assign(this.p, p); this.fitted = null;
    for (const [key, [input, out]] of Object.entries(this.inputs)) { input.value = this.p[key]; out.textContent = this.p[key].toFixed(2); }
    this.refresh();
  }

  choose(w) {
    this.window = w;
    [...this.windowChips.children].forEach((c, i) => c.setAttribute('aria-pressed', String(this.windows[i] === w)));
    if (this.fitted) this.estimate(); else this.refresh();
  }

  estimate() {
    const f = this.fit(this.window.from, this.window.to);
    if (!f) { this.fitLine.textContent = 'That stretch is too short to fit.'; return; }
    const a = f.beta[1] - 1;
    this.set({ a: clamp(a, 0, 2), b: clamp(f.beta[2], 0, 2), r: clamp(f.beta[0] + a * this.p.t, 0, 4) });
    this.fitted = f;
    this.refresh();
  }

  refresh() {
    for (const [key, [, out]] of Object.entries(this.inputs)) out.textContent = this.p[key].toFixed(2);
    const f = this.fitted, w = this.window;
    this.fitLine.replaceChildren(...(f ? [
      h('b', `${this.label(w.from)} to ${this.label(w.to)}`), `, ${f.T} quarters. Response to inflation `, h('b', f.beta[1].toFixed(2)), ` (${f.se[1].toFixed(2)}), to the gap `, h('b', f.beta[2].toFixed(2)), ` (${f.se[2].toFixed(2)}). Newey–West standard errors, ${f.lags} lags.`,
    ] : [`With these settings a one-point rise in inflation calls for a ${(1 + this.p.a).toFixed(2)}-point rise in the rate.`]));
    this.plot(); this.chairs(); this.say();
  }

  chairs() {
    const rows = this.d.chairs.map((c) => ({ c, ...this.miss(c.from, c.to) }));
    const worst = Math.max(...rows.map((r) => r.rmse)), best = Math.min(...rows.map((r) => r.rmse));
    clear(this.table).append(...rows.map((r) => h(`button.chairrow${r.rmse === best ? '.is-best' : ''}${this.window === r.c ? '.is-picked' : ''}`, { type: 'button', onClick: () => this.choose(r.c) },
      h('span.chairrow__name', r.c.name),
      h('span.chairrow__years', `${this.label(r.c.from).slice(0, 4)}–${this.label(r.c.to).slice(2, 4)}`),
      h('span.chairrow__mean', `${r.mean >= 0 ? '+' : '−'}${Math.abs(r.mean).toFixed(2)}`),
      h('span.chairrow__bar', h('i', { style: { width: `${(r.rmse / worst) * 100}%` } })),
      h('span.chairrow__rmse', r.rmse.toFixed(2)))));
  }

  say() {
    const i = this.hover;
    if (i < 0) {
      const m = this.miss(this.window.from, this.window.to);
      this.readout.textContent = `${this.window.name}: the rate ran ${Math.abs(m.mean).toFixed(2)} points ${m.mean < 0 ? 'below' : 'above'} the rule on average, with a typical miss of ${m.rmse.toFixed(2)}.`;
      return;
    }
    const rule = this.rule(i), gap = this.d.ffr[i] - rule;
    this.readout.replaceChildren(h('b', this.label(i)), `  Actual ${this.d.ffr[i].toFixed(2)}  ·  Rule ${rule.toFixed(2)}  ·  ${gap < 0 ? 'Below' : 'Above'} by ${Math.abs(gap).toFixed(2)}  ·  Inflation ${this.d.infl[i].toFixed(1)}, gap ${this.d.gap[i].toFixed(1)}`);
  }

  /* ---- Chart ----------------------------------------------------------------- */

  plot() {
    const W = this.chart.clientWidth, H = Math.round(clamp(W * 0.42, 240, 430));
    if (!W) return;
    const m = { l: 34, r: 10, t: 22, b: 24 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
    const rules = Array.from({ length: this.n }, (_, i) => this.rule(i));
    const lo = Math.min(0, Math.floor(clamp(Math.min(...rules, ...this.d.ffr), -6, 0) / 2) * 2);
    const hi = Math.ceil(clamp(Math.max(...rules, ...this.d.ffr), 12, 26) / 2) * 2;
    const x = (i) => m.l + (i / (this.n - 1)) * pw, y = (v) => m.t + (1 - (clamp(v, lo, hi) - lo) / (hi - lo)) * ph;
    const line = (vals) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
    // The space between the two lines, split by which is on top.
    const between = (pick) => `${this.d.ffr.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('')}${rules.map((_, k) => { const i = this.n - 1 - k; return `L${x(i).toFixed(1)} ${y(pick(this.d.ffr[i], rules[i])).toFixed(1)}`; }).join('')}Z`;
    const svg = h('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': 'Line chart of the federal funds rate and the rate the Taylor rule prescribes' });
    svg.append(h('defs',
      h('pattern', { id: 'tay-loose', width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, h('line', { x1: 0, y1: 0, x2: 0, y2: 5, class: 'tay-hatch tay-hatch--loose' })),
      h('pattern', { id: 'tay-tight', width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(-45)' }, h('line', { x1: 0, y1: 0, x2: 0, y2: 5, class: 'tay-hatch tay-hatch--tight' }))));
    // Fed chairs along the top, and the chosen years tinted.
    this.d.chairs.forEach((c, k) => {
      const x0 = x(c.from), x1 = x(Math.min(this.n - 1, c.to + 1));
      if (k % 2) svg.append(h('rect', { x: x0, y: m.t, width: x1 - x0, height: ph, class: 'tay-band' }));
      const name = h('text', { x: (x0 + x1) / 2, y: 12, class: 'tay-chair', 'text-anchor': 'middle' });
      name.textContent = x1 - x0 > c.name.length * 6.4 ? c.name : c.name.slice(0, 1);
      svg.append(name);
    });
    if (this.window !== this.windows[0]) svg.append(h('rect', { x: x(this.window.from), y: m.t, width: x(this.window.to) - x(this.window.from), height: ph, class: 'tay-window' }));
    for (let v = lo; v <= hi; v += hi - lo > 20 ? 4 : 2) {
      svg.append(h('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: v === 0 ? 'tay-zero' : 'tay-grid' }));
      const t = h('text', { x: m.l - 6, y: y(v) + 3, class: 'tay-tick', 'text-anchor': 'end' }); t.textContent = v; svg.append(t);
    }
    for (let year = Math.ceil((this.t0 / 4) / 10) * 10; year * 4 - this.t0 < this.n; year += 10) {
      const i = year * 4 - this.t0;
      if (i < 0) continue;
      svg.append(h('line', { x1: x(i), x2: x(i), y1: H - m.b, y2: H - m.b + 4, class: 'tay-zero' }));
      const t = h('text', { x: x(i), y: H - 6, class: 'tay-tick', 'text-anchor': 'middle' }); t.textContent = year; svg.append(t);
    }
    svg.append(
      h('path', { d: between(Math.max), fill: 'url(#tay-loose)' }),
      h('path', { d: between(Math.min), fill: 'url(#tay-tight)' }),
      h('path', { d: line(rules), class: 'tay-line tay-line--rule' }),
      h('path', { d: line(this.d.ffr), class: 'tay-line tay-line--actual' }));
    const cursor = h('g', { class: 'tay-cursor', visibility: 'hidden' },
      h('line', { y1: m.t, y2: H - m.b, class: 'tay-zero' }), h('circle', { r: 3.5, class: 'tay-dot tay-dot--rule' }), h('circle', { r: 3.5, class: 'tay-dot tay-dot--actual' }));
    svg.append(cursor);
    const key = (cx, cls, text) => { const g = h('g'); g.append(h('line', { x1: cx, x2: cx + 18, y1: m.t + 12, y2: m.t + 12, class: `tay-line ${cls}` })); const t = h('text', { x: cx + 24, y: m.t + 15, class: 'tay-key' }); t.textContent = text; g.append(t); return g; };
    svg.append(key(m.l + 10, 'tay-line--actual', 'Federal funds rate'), key(m.l + 176, 'tay-line--rule', 'Taylor rule'));
    const move = (e) => {
      const box = svg.getBoundingClientRect();
      const i = Math.round(clamp((e.clientX - box.left - m.l) / pw) * (this.n - 1));
      this.hover = i;
      cursor.setAttribute('visibility', 'visible');
      cursor.children[0].setAttribute('x1', x(i)); cursor.children[0].setAttribute('x2', x(i));
      cursor.children[1].setAttribute('cx', x(i)); cursor.children[1].setAttribute('cy', y(rules[i]));
      cursor.children[2].setAttribute('cx', x(i)); cursor.children[2].setAttribute('cy', y(this.d.ffr[i]));
      this.say();
    };
    svg.addEventListener('pointermove', move); svg.addEventListener('pointerdown', move);
    svg.addEventListener('pointerleave', () => { this.hover = -1; cursor.setAttribute('visibility', 'hidden'); this.say(); });
    this.chart.replaceChildren(svg);
  }
}

/* ---- 3 × 3 linear algebra ------------------------------------------------------ */

const zeros = () => [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
const multiply = (A, B) => A.map((row) => B[0].map((_, c) => row.reduce((sum, v, k) => sum + v * B[k][c], 0)));

function invert(m) {
  const [[a, b, c], [d, e, f], [g, i, j]] = m;
  const det = a * (e * j - f * i) - b * (d * j - f * g) + c * (d * i - e * g);
  if (Math.abs(det) < 1e-12) return null;
  return [
    [(e * j - f * i) / det, (c * i - b * j) / det, (b * f - c * e) / det],
    [(f * g - d * j) / det, (a * j - c * g) / det, (c * d - a * f) / det],
    [(d * i - e * g) / det, (b * g - a * i) / det, (a * e - b * d) / det],
  ];
}
