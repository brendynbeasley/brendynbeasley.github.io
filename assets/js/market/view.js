/**
 * view.js: draws the market as an engraved contour map.
 *
 * Every line is a contour of delivered price (price at the seller plus travel
 * cost), so each seller sits at the bottom of a basin and the rings around it
 * are the places where its customers pay the same amount. Where two basins
 * meet, a customer is indifferent between the two sellers: that kink is the
 * edge of a territory. Lines are inked more heavily where the markup is high,
 * so a monopoly prints dark and a competitive market prints fine.
 *
 * The view also lets the reader take part: while the market has the screen,
 * the pointer is a seller, and a click leaves that seller behind.
 */

import { TAU, clamp, lerp, reducedMotion, coarsePointer } from '../core/util.js';

const UI = 'a, button, input, textarea, select, label, summary, .plate, .window, .tape, .console, .sheet, .topbar, .drawer, .exhibit';

export class MarketView {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {ScrollDirector} director
   * @param {Market} market
   * @param {{onStats?: Function, sellersFor?: Function}} options
   *   sellersFor(state) returns how many sellers the script wants at this scroll position
   */
  constructor(canvas, director, market, { onStats = () => {}, sellersFor = null } = {}) {
    this.canvas = canvas; this.g = canvas.getContext('2d');
    this.director = director; this.market = market;
    this.onStats = onStats; this.sellersFor = sellersFor;
    this.still = reducedMotion(); this.touch = coarsePointer();
    this.zones = []; this.focus = 0; this.boost = 0;
    this.floor = 0;       // fewest sellers wanted, set while an experiment is running
    this.cost = 0;        // running average of the time one drawing takes, in ms
    this.lag = 16.7; this.half = false;  // running average of the gap between frames; true once this machine has fallen behind
    this.away = null;     // where the last seller was placed, until the pointer leaves it
    this.cross = new Float64Array(32); this.arc = new Float64Array(32); this.heavy = new Float64Array(96 * 3);
    this.pointer = { x: 0, y: 0, live: false, ui: false };
    this.ghost = null; this.sinceStats = 1; this.frameNo = 0; this.dirty = true;
    this.readPalette();
  }

  mount(root = document) {
    this.zones = [...root.querySelectorAll('[data-market]')].map((el) => ({ el, top: 0, height: 0 }));
    this.resize();
    addEventListener('themechange', () => { this.readPalette(); this.dirty = true; });
    if (!this.touch) {
      addEventListener('pointermove', (e) => {
        this.pointer.x = e.clientX; this.pointer.y = e.clientY; this.pointer.live = true;
        this.pointer.ui = Boolean(e.target.closest?.(UI));
      }, { passive: true });
      document.addEventListener('pointerleave', () => { this.pointer.live = false; });
    }
    // A click on open ground opens a shop there.
    addEventListener('click', (e) => {
      if (this.focus < 0.55 || e.target.closest?.(UI) || e.defaultPrevented) return;
      const m = this.market;
      if (this.ghost && this.ghost.k > 0.3) {
        this.ghost.ghost = false; this.ghost.visitor = true;
        m.emit('enter', { seller: this.ghost, before: m.stats(), visitor: true });
        this.ghost = null;
        this.away = { x: e.clientX, y: e.clientY };  // no new pointer seller on top of the one just placed
      } else {
        m.enter({ u: e.clientX / m.W, v: e.clientY / m.H, visitor: true });
      }
      this.dirty = true;
    });
    this.director.onFrame((d) => this.frame(d));
    if (this.still) this.market.settle(10);
    return this;
  }

  readPalette() {
    const css = getComputedStyle(document.documentElement);
    const v = (name) => css.getPropertyValue(name).trim();
    this.pal = { line: v('--mk-line') || v('--ink'), accent: v('--accent'), gold: v('--fig-feature'), paper: v('--paper') };
    this.dim = parseFloat(v('--mk-dim')) || 0.14;
  }

  resize() {
    const W = this.director.vw, H = this.canvas.clientHeight || window.innerHeight;
    // Phones have dense screens and small batteries: 1.5× is sharp enough for hairlines.
    this.dpr = Math.min(window.devicePixelRatio || 1, W < 760 ? 1.5 : 2);
    if (this.canvas.width !== Math.round(W * this.dpr) || this.canvas.height !== Math.round(H * this.dpr)) {
      this.canvas.width = Math.round(W * this.dpr); this.canvas.height = Math.round(H * this.dpr);
    }
    this.W = W; this.H = H;
    this.spacing = W < 760 ? 8 : 11;
    this.market.resize(W, H);
    for (const z of this.zones) { const r = z.el.getBoundingClientRect(); z.top = r.top + window.scrollY; z.height = r.height; }
    this.dirty = true;
  }

  /** Bring the market forward for a few seconds, wherever the reader is on the page. */
  pulse(seconds = 4) { this.boost = Math.max(this.boost, seconds); }

  /** How much of the screen belongs to a part of the page that features the market. */
  measureFocus(d) {
    let best = 0;
    for (const z of this.zones) {
      const seen = Math.min(z.top + z.height, d.sy + d.vh) - Math.max(z.top, d.sy);
      best = Math.max(best, clamp(seen / (d.vh * 0.75)));
    }
    return best * best * (3 - 2 * best);
  }

  followPointer(dt) {
    const m = this.market, p = this.pointer;
    if (this.away && Math.hypot(p.x - this.away.x, p.y - this.away.y) > 70) this.away = null;
    const wanted = !this.touch && !this.still && p.live && !p.ui && !this.away && this.focus > 0.55;
    if (wanted && !this.ghost) {
      this.ghost = m.enter({ u: p.x / m.W, v: p.y / m.H, ghost: true, quiet: true });
    }
    if (!this.ghost) return;
    this.ghost.kTarget = wanted ? 1 : 0;
    const ease = 1 - Math.exp(-dt * 14);
    this.ghost.u += (clamp(p.x / m.W, 0.01, 0.99) - this.ghost.u) * ease;
    this.ghost.v += (clamp(p.y / m.H, 0.01, 0.99) - this.ghost.v) * ease;
    this.ghost.x = this.ghost.u * m.W; this.ghost.y = this.ghost.v * m.H;
    if (!wanted && this.ghost.k < 0.03) this.ghost = null;
  }

  frame(d) {
    if (d.resized) this.resize();
    const m = this.market;
    this.focus = this.measureFocus(d);
    this.boost = Math.max(0, this.boost - d.dt);
    if (this.sellersFor) {
      const want = Math.max(this.floor, this.sellersFor(d));
      if (want !== m.target) { m.target = want; this.dirty = true; }
    }
    if (this.still) {
      // Motion is off: jump straight to the settled market whenever something changes.
      if (!this.dirty) return;
      m.settle(6); this.draw(1); this.onStats(m.stats(), m); this.dirty = false;
      return;
    }
    this.followPointer(d.dt);
    m.step(Math.min(d.dt, 1 / 24));
    this.sinceStats += d.dt;
    if (this.sinceStats > 0.16) { this.sinceStats = 0; this.onStats(m.stats(), m); }
    // Draw every frame when the machine keeps up. Behind a wall of text, or
    // once frames have been arriving late for a while, draw every other one.
    const lift = Math.max(this.focus, clamp(this.boost / 1.5) * 0.42);
    this.frameNo++;
    this.lag += (d.dt * 1000 - this.lag) * 0.04;
    if (this.lag > 22 && d.time > 3) this.half = true;
    if ((lift < 0.05 || this.half) && this.frameNo % 2) return;
    const t0 = performance.now();
    this.draw(lift);
    this.cost += (performance.now() - t0 - this.cost) * 0.1;
  }

  /**
   * The parts of a circle of radius r around seller s that lie inside its
   * territory, written to this.arc as [from, to, from, to, …] in radians.
   * Returns the number of values written, or -1 for the whole circle.
   *
   * Worked out exactly (where the circle crosses each edge of the polygon), so
   * nothing has to be clipped when it is drawn.
   */
  arcs(s, r) {
    const A = this.cross, out = this.arc, n = s.pn, r2 = r * r;
    let count = 0;
    for (let k = 0; k < n; k++) {
      const j = k + 1 === n ? 0 : k + 1;
      const ax = s.px[k] - s.x, ay = s.py[k] - s.y, dx = s.px[j] - s.px[k], dy = s.py[j] - s.py[k];
      const a = dx * dx + dy * dy, b = 2 * (ax * dx + ay * dy), c = ax * ax + ay * ay - r2;
      const disc = b * b - 4 * a * c;
      if (disc <= 0 || a === 0) continue;
      const root = Math.sqrt(disc), t1 = (-b - root) / (2 * a), t2 = (-b + root) / (2 * a);
      if (t1 >= 0 && t1 <= 1 && count < 31) A[count++] = Math.atan2(ay + t1 * dy, ax + t1 * dx);
      if (t2 >= 0 && t2 <= 1 && count < 31) A[count++] = Math.atan2(ay + t2 * dy, ax + t2 * dx);
    }
    if (count < 2) return this.inside(s, s.x + r, s.y) ? -1 : 0;
    for (let i = 1; i < count; i++) { // insertion sort: there are only a handful
      const v = A[i]; let j = i - 1;
      while (j >= 0 && A[j] > v) { A[j + 1] = A[j]; j--; }
      A[j + 1] = v;
    }
    let m = 0;
    for (let i = 0; i < count; i++) {
      const from = A[i], to = i + 1 < count ? A[i + 1] : A[0] + TAU, mid = (from + to) / 2;
      if (to - from > 1e-4 && this.inside(s, s.x + r * Math.cos(mid), s.y + r * Math.sin(mid))) { out[m++] = from; out[m++] = to; }
    }
    return m;
  }

  /** Is the point inside the seller's territory? The polygon is convex, so one sign test per edge. */
  inside(s, x, y) {
    for (let k = 0, n = s.pn; k < n; k++) {
      const j = k + 1 === n ? 0 : k + 1;
      if (((s.px[j] - s.px[k]) * (y - s.py[k]) - (s.py[j] - s.py[k]) * (x - s.px[k])) * s.turn < -1e-6) return false;
    }
    return true;
  }

  draw(lift) {
    const { g, W, H, pal, market: m } = this;
    const alpha = lerp(this.dim, 1, lift);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.lineJoin = 'round';
    const E = (W * H) / m.travel, step = this.spacing, stats = m.stats();
    const datum = stats.price * E;  // contour levels are counted from the average price
    const S = m.sellers, labels = lift > 0.6 && stats.sellers <= 14;
    const heavy = this.heavy;

    for (let i = 0; i < S.length; i++) {
      const s = S[i];
      if (s.pn < 3) continue;
      const mine = s.ghost || s.visitor, color = mine ? pal.accent : s.tag === 'cut' ? pal.gold : pal.line;
      if (s.ghost) {
        g.beginPath(); g.moveTo(s.px[0], s.py[0]);
        for (let k = 1; k < s.pn; k++) g.lineTo(s.px[k], s.py[k]);
        g.closePath(); g.globalAlpha = 0.07 * alpha * s.k; g.fillStyle = pal.accent; g.fill();
      }

      // Contours. With levels counted from the average price, ring q of this
      // seller has radius² = ±(q · step)² + off, where `off` is how far its own
      // price sits below the average, in travel units. Because every seller
      // uses the same levels, rings from neighbouring basins meet at the border.
      const off = datum - s.weight;
      const first = off > 0 ? -Math.floor(Math.sqrt(off) / step) : Math.ceil(Math.sqrt(-off) / step);
      const ink = (0.15 + 0.36 * clamp(s.lerner / 0.667)) * alpha * (mine ? 1.5 : 1);
      let h = 0;
      g.strokeStyle = color; g.globalAlpha = clamp(ink); g.lineWidth = 0.8;
      g.beginPath();
      for (let q = first; q < first + 400; q++) {
        const r2 = (q < 0 ? -1 : 1) * (q * step) ** 2 + off;
        if (r2 <= 0.25) continue;
        const r = Math.sqrt(r2);
        if (!(r <= s.reach + 1)) break;
        const n = this.arcs(s, r);
        if (n === 0) continue;
        if (q % 5 === 0) {
          // Every fifth contour is drawn a little heavier, after the others.
          if (n < 0) { heavy[h++] = r; heavy[h++] = 0; heavy[h++] = TAU; } else for (let a = 0; a < n && h < heavy.length - 3; a += 2) { heavy[h++] = r; heavy[h++] = this.arc[a]; heavy[h++] = this.arc[a + 1]; }
        } else if (n < 0) { g.moveTo(s.x + r, s.y); g.arc(s.x, s.y, r, 0, TAU); }
        else for (let a = 0; a < n; a += 2) { g.moveTo(s.x + r * Math.cos(this.arc[a]), s.y + r * Math.sin(this.arc[a])); g.arc(s.x, s.y, r, this.arc[a], this.arc[a + 1]); }
      }
      g.stroke();
      if (h) {
        g.globalAlpha = clamp(ink * 1.25); g.lineWidth = 1.25;
        g.beginPath();
        for (let a = 0; a < h; a += 3) { g.moveTo(s.x + heavy[a] * Math.cos(heavy[a + 1]), s.y + heavy[a] * Math.sin(heavy[a + 1])); g.arc(s.x, s.y, heavy[a], heavy[a + 1], heavy[a + 2]); }
        g.stroke();
      }

      // The edge of the territory, drawn once per pair. Sellers under one owner share a dashed edge.
      g.lineWidth = 1; g.globalAlpha = clamp(ink * 1.15);
      for (let e = 0; e < s.pn; e++) {
        const rival = s.pe[e];
        if (rival < 0 || (rival < i && !mine)) continue;
        const n = e + 1 === s.pn ? 0 : e + 1, joint = S[rival] && m.sameOwner(s, S[rival]);
        g.setLineDash(joint ? [2, 5] : []);
        g.beginPath(); g.moveTo(s.px[e], s.py[e]); g.lineTo(s.px[n], s.py[n]); g.stroke();
      }
      g.setLineDash([]);
    }

    // The sellers themselves.
    g.font = '500 10px "IBM Plex Mono", ui-monospace, monospace'; g.textBaseline = 'middle';
    for (const s of S) {
      if (s.pn < 3 || s.k < 0.3) continue;
      const mine = s.ghost || s.visitor, color = mine ? pal.accent : s.tag === 'cut' ? pal.gold : pal.line;
      g.globalAlpha = clamp(alpha * (mine ? 1 : 0.85) * s.k);
      g.strokeStyle = g.fillStyle = color; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(s.x - 4, s.y); g.lineTo(s.x + 4, s.y); g.moveTo(s.x, s.y - 4); g.lineTo(s.x, s.y + 4); g.stroke();
      if (s.ghost && lift > 0.5) {
        g.textAlign = s.x > W - 190 ? 'right' : 'left';
        g.fillText(`YOU  ${(s.share * 100).toFixed(1)}% OF THE MARKET`, s.x + (s.x > W - 190 ? -10 : 10), s.y - 12);
      } else if (labels) {
        g.globalAlpha *= 0.8; g.textAlign = 'left';
        g.fillText(s.p.toFixed(2), s.x + 8, s.y + 9);
      }
    }
    g.globalAlpha = 1;
  }
}
