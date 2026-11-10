/**
 * figure.js: the dot figure on the Research section.
 *
 * A fixed set of dots that gathers into a chart when the page reaches the
 * element marked data-scene="timeline", and scatters again when it leaves.
 * One dot per study keeps its identity, so a dot can be hovered and opened.
 */

import { TAU, clamp, lerp, smooth, ease, rng, reducedMotion, coarsePointer } from '../core/util.js';
import { formation } from './formations.js';

const STAGGER = 0.42; // how spread out the dots' departure times are

export class Figure {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {ScrollDirector} director
   * @param {{studies?: object[], literature?: object, onHover?: Function}} options
   */
  constructor(canvas, director, { studies = [], literature = null, onHover = () => {} } = {}) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.director = director;
    this.studies = studies;
    this.literature = literature;
    this.onHover = onHover;
    this.scenes = [];
    this.pointer = { x: -9999, y: -9999, live: false };
    this.hovered = -1;     // study dot under the pointer
    this.highlight = -1;   // study dot lit from outside (hovering a row in the index)
    this.still = reducedMotion();
    this.touch = coarsePointer();
    this.blank = false;
    this.readPalette();
  }

  /** Find every [data-scene] on the page and prepare its formation. */
  mount(root = document) {
    this.scenes = [...root.querySelectorAll('[data-scene]')].map((el) => ({
      el, name: el.dataset.scene, shape: formation(el.dataset.scene), top: 0, height: 0,
    }));
    this.resize();
    addEventListener('themechange', () => this.readPalette());
    if (!this.touch) {
      addEventListener('pointermove', (e) => { this.pointer.x = e.clientX; this.pointer.y = e.clientY; this.pointer.live = true; }, { passive: true });
      document.addEventListener('pointerleave', () => { this.pointer.live = false; });
    } else {
      addEventListener('pointerdown', (e) => { this.pointer.x = e.clientX; this.pointer.y = e.clientY; this.pointer.live = true; this.tapped = true; }, { passive: true });
    }
    this.director.onFrame((d) => this.frame(d));
    return this;
  }

  readPalette() {
    const css = getComputedStyle(document.documentElement);
    const v = (name) => css.getPropertyValue(name).trim();
    this.pal = { dot: v('--fig-dot'), study: v('--fig-study'), feature: v('--fig-feature'), line: v('--fig-line') };
    this.dim = parseFloat(v('--fig-dim')) || 0.14;
  }

  resize() {
    const d = this.director;
    const W = d.vw, H = d.vh, CH = this.canvas.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // On phones the address bar changes the height constantly. Only a real
    // change of width (or a big change of height) is worth re-laying out.
    const relayout = !this.W || W !== this.W || Math.abs(H - this.H) > 120;
    this.dpr = dpr; this.CH = CH;
    if (this.canvas.width !== Math.round(W * dpr) || this.canvas.height !== Math.round(CH * dpr)) {
      this.canvas.width = Math.round(W * dpr); this.canvas.height = Math.round(CH * dpr);
    }
    if (relayout) { this.W = W; this.H = H; this.rebuild(); }
    for (const s of this.scenes) {
      const r = s.el.getBoundingClientRect();
      s.top = r.top + window.scrollY; s.height = r.height;
    }
  }

  /** Lay every formation out for the current viewport. */
  rebuild() {
    const { W, H } = this;
    if (!W) return;
    const ns = this.studies.length;
    const n = ns + clamp(Math.round((W * H) / 880), 520, 1500);
    const grown = n !== this.n;
    this.n = n; this.ns = ns;
    // Lay the chart out inside the same column the text uses, so on very wide
    // screens it stays with the copy instead of drifting away from it.
    const gutter = clamp(W * 0.046, 20, 76);
    const VW = Math.min(W, 1320 + 2 * gutter);
    this.offX = (W - VW) / 2;
    const ctx = (seed) => ({ n, ns, W: VW, H, mobile: VW < 760, rand: rng(seed), studies: this.studies, literature: this.literature });
    this.scenes.forEach((s, i) => {
      s.shape.build(ctx(11 + i * 7));
      if (this.offX) for (let k = 0; k < n; k++) s.shape.x[k] += this.offX;
    });
    if (grown) {
      const rand = rng(99), nb = Math.max(1, n - ns);
      this.delay = new Float32Array(n); this.curl = new Float32Array(n); this.phase = new Float32Array(n);
      this.px = new Float32Array(n); this.py = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        // Background dots arrive in a left-to-right sweep; the studies arrive last.
        this.delay[i] = i < ns ? 0.45 + rand() * 0.55 : 0.5 * rand() + 0.5 * ((i - ns) / nb);
        this.curl[i] = (rand() - 0.5) * 0.5;
        this.phase[i] = rand() * TAU;
      }
    }
  }

  /** Which two formations are we between, how far along, and how bright? */
  blend(sy, vh) {
    const S = this.scenes;
    let idx = 0, focus = 0;
    S.forEach((s, i) => {
      if (sy >= s.top - vh) idx = i;
      if (s.shape.hidden) return;
      const arrive = smooth(s.top - vh, s.top - vh * 0.35, sy);
      const covered = smooth(s.top + s.height - vh, s.top + s.height - vh * 0.4, sy);
      focus += Math.min(arrive, 1 - covered);
    });
    const to = S[idx], from = S[Math.max(0, idx - 1)];
    const t = idx === 0 ? 1 : clamp((sy - (to.top - vh)) / (vh * 0.92));
    return { from, to, t, focus: clamp(focus) };
  }

  frame(d) {
    if (d.resized) this.resize();
    if (!this.scenes.length || !this.n) return;
    const { g, W, CH, n, ns, pal } = this;
    const { from, to, t, focus } = this.blend(d.sy, d.vh);
    const A = from.shape, B = to.shape;
    // Nothing to show while the dots are at rest: clear once and stop.
    if (A.hidden && (B.hidden || t <= 0)) {
      if (!this.blank) { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, this.canvas.width, this.canvas.height); this.blank = true; }
      if (this.hovered >= 0) { this.hovered = -1; this.onHover(null); }
      return;
    }
    this.blank = false;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, W, CH);

    const alpha = lerp(this.dim, 1, focus);
    const time = d.time, still = this.still;
    const mx = this.pointer.x, my = this.pointer.y, tracking = this.pointer.live && focus > 0.3;
    const tt = t * (1 + STAGGER);
    let near = -1, nearD = 18 * 18;

    for (let pass = 0; pass < 2; pass++) {
      // Pass 0 draws the background dots, pass 1 the studies on top.
      const i0 = pass === 0 ? ns : 0, i1 = pass === 0 ? n : ns;
      g.fillStyle = pass === 0 ? pal.dot : pal.study;
      for (let i = i0; i < i1; i++) {
        const e = ease.inOut(clamp(tt - this.delay[i] * STAGGER));
        const ax = A.x[i], ay = A.y[i];
        let x = ax + (B.x[i] - ax) * e, y = ay + (B.y[i] - ay) * e;
        if (e > 0 && e < 1) {
          // Bend the path so dots swirl into place instead of sliding.
          const bend = Math.sin(e * Math.PI) * this.curl[i];
          x += (B.y[i] - ay) * bend; y -= (B.x[i] - ax) * bend;
        }
        if (!still) {
          x += Math.sin(time * 0.6 + this.phase[i]) * 0.9;
          y += Math.cos(time * 0.5 + this.phase[i] * 1.7) * 0.9;
        }
        this.px[i] = x; this.py[i] = y;
        if (tracking && i < ns) {
          const dist2 = (x - mx) ** 2 + (y - my) ** 2;
          if (dist2 < nearD) { nearD = dist2; near = i; }
        }
        const s = A.s[i] + (B.s[i] - A.s[i]) * e;
        let a = (A.a[i] + (B.a[i] - A.a[i]) * e) * alpha;
        // Studies stand out while the chart has the stage, and recede behind content.
        if (i < ns) a = Math.min(1, a * (0.75 + 0.55 * focus));
        if (a < 0.012 || y < -30 || y > CH + 30) continue;
        g.globalAlpha = a;
        if (i < ns && this.studies[i]?.featured) g.fillStyle = pal.feature;
        g.beginPath(); g.arc(x, y, s, 0, TAU); g.fill();
        if (i < ns && this.studies[i]?.featured) g.fillStyle = pal.study;
      }
    }

    // Axes and labels fade in once the chart has settled.
    const env = { pal, time, W, H: this.H };
    g.save(); g.translate(this.offX, 0); A.furniture(g, (from === to ? 1 : 1 - smooth(0, 0.2, t)) * alpha, env); g.restore();
    if (from !== to) { g.save(); g.translate(this.offX, 0); B.furniture(g, smooth(0.82, 1, t) * alpha, env); g.restore(); }

    // Hover and highlight rings on study dots.
    const settled = (B.interactive && t > 0.97) || (A.interactive && t < 0.03);
    const hit = settled && focus > 0.55 ? near : -1;
    if (hit !== this.hovered || (hit >= 0 && this.tapped)) {
      this.hovered = hit; this.tapped = false;
      this.onHover(hit >= 0 ? this.studies[hit] : null, this.px[hit], this.py[hit]);
    }
    const shape = B.interactive ? B : A;
    for (const i of [this.hovered, shape.interactive ? this.highlight : -1]) {
      if (i < 0 || i >= ns) continue;
      const beat = still ? 0.5 : (time * 1.4) % 1;
      g.globalAlpha = 1; g.fillStyle = pal.study; g.strokeStyle = pal.study; g.lineWidth = 1.2;
      g.beginPath(); g.arc(this.px[i], this.py[i], Math.max(3, shape.s[i]) + 1, 0, TAU); g.fill();
      g.globalAlpha = 1 - beat;
      g.beginPath(); g.arc(this.px[i], this.py[i], Math.max(3, shape.s[i]) + 4 + beat * 12, 0, TAU); g.stroke();
    }
    g.globalAlpha = 1;
  }
}
