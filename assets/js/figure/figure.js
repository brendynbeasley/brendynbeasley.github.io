/**
 * figure.js — the living figure.
 *
 * One canvas sits behind the whole page and holds a fixed set of dots. As you
 * scroll, the dots leave one chart and settle into the next: a sampling
 * distribution, a supply-and-demand cross, a timeline of the literature, a
 * browser window, a question mark. One dot per study keeps its identity the
 * whole way down, so the same 94 points are in every chart.
 *
 * Scenes are declared in the HTML with data-scene="name" on the element that
 * should show that chart. The figure works out the rest from where those
 * elements sit on the page.
 */

import { TAU, clamp, lerp, smooth, ease, rng, reducedMotion, coarsePointer } from '../core/util.js';
import { formation, NoiseFormation } from './formations.js';

const STAGGER = 0.42;       // how spread out the dots' departure times are
const INTRO_SECONDS = 2.8;  // how long the opening pour takes
const REACH = 120;          // pointer influence radius, px

export class Figure {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {ScrollDirector} director
   * @param {{studies?: object[], literature?: object, onScene?: Function, onHover?: Function}} options
   */
  constructor(canvas, director, { studies = [], literature = null, onScene = () => {}, onHover = () => {} } = {}) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.director = director;
    this.studies = studies;
    this.literature = literature;
    this.onScene = onScene;
    this.onHover = onHover;
    this.scenes = [];
    this.pointer = { x: -9999, y: -9999, live: false };
    this.hovered = -1;     // study dot under the pointer
    this.highlight = -1;   // study dot lit from outside (hovering a row in the index)
    this.still = reducedMotion();
    this.touch = coarsePointer();
    this.intro = this.still || window.scrollY > 40 ? 1 : 0;
    this.noise = new NoiseFormation();
    this.activeScene = null;
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
    // Glyph formations are sampled from the web font, so rebuild once it has loaded.
    document.fonts?.load('italic 300 80px Fraunces').then(() => this.rebuild()).catch(() => {});
    this.director.onFrame((d) => this.frame(d));
    return this;
  }

  readPalette() {
    const css = getComputedStyle(document.documentElement);
    const v = (name) => css.getPropertyValue(name).trim();
    this.pal = { dot: v('--fig-dot'), study: v('--fig-study'), feature: v('--fig-feature'), line: v('--fig-line'), paper: v('--paper') };
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
    // Lay charts out inside the same column the text uses, so on very wide
    // screens the figure stays beside the copy instead of drifting away from it.
    const gutter = clamp(W * 0.046, 20, 76);
    const VW = Math.min(W, 1320 + 2 * gutter);
    this.offX = (W - VW) / 2;
    const mobile = VW < 760;
    const ctx = (seed) => ({ n, ns, W: VW, H, mobile, rand: rng(seed), studies: this.studies, literature: this.literature });
    const shapes = [...this.scenes.map((s) => s.shape), this.noise];
    shapes.forEach((shape, i) => {
      shape.build(ctx(i === shapes.length - 1 ? 5 : 11 + i * 7));
      if (this.offX) for (let k = 0; k < n; k++) shape.x[k] += this.offX;
    });
    if (grown) {
      const rand = rng(99), nb = Math.max(1, n - ns);
      this.delay = new Float32Array(n); this.curl = new Float32Array(n); this.phase = new Float32Array(n);
      this.ox = new Float32Array(n); this.oy = new Float32Array(n);
      this.px = new Float32Array(n); this.py = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        // Background dots leave in a left-to-right sweep; the studies arrive last.
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
      const arrive = smooth(s.top - vh, s.top - vh * 0.35, sy);
      const covered = i === S.length - 1 ? 0 : smooth(s.top + s.height - vh, s.top + s.height - vh * 0.4, sy);
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
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, W, CH);

    if (this.intro < 1) this.intro = Math.min(1, this.intro + d.dt / INTRO_SECONDS);
    const { from, to, t, focus } = this.blend(d.sy, d.vh);
    const alpha = lerp(this.dim, 1, focus);
    const A = from.shape, B = to.shape, first = this.scenes[0].shape;
    const pouring = this.intro < 1;
    const time = d.time, still = this.still;
    const mx = this.pointer.x, my = this.pointer.y;
    const tracking = this.pointer.live && focus > 0.3;   // is the pointer worth testing against?
    const repel = tracking && !still && !this.touch;     // do dots move out of its way?
    const tt = t * (1 + STAGGER);
    let near = -1, nearD = 18 * 18;

    for (let pass = 0; pass < 2; pass++) {
      // Pass 0 draws the background dots, pass 1 the studies on top.
      const i0 = pass === 0 ? ns : 0, i1 = pass === 0 ? n : ns;
      g.fillStyle = pass === 0 ? pal.dot : pal.study;
      for (let i = i0; i < i1; i++) {
        const e = ease.inOut(clamp(tt - this.delay[i] * STAGGER));
        let ax = A.x[i], ay = A.y[i], as = A.s[i], aa = A.a[i];
        if (pouring && A === first) {
          // The opening: dots pour in from the top and pile up into the bell.
          const q = clamp((this.intro * 1.6 - this.delay[i] * 0.6) / 1);
          const fall = q * q, sway = Math.sin(q * 9 + this.phase[i]) * 26 * (1 - q);
          ax = lerp(W / 2 + (this.noise.x[i] - W / 2) * 0.12, ax, ease.out(q)) + sway;
          ay = lerp(-20 - this.delay[i] * 120, ay, fall);
          aa *= smooth(0, 0.15, q);
        }
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
        if (tracking) {
          const dx = x - mx, dy = y - my, dist2 = dx * dx + dy * dy;
          let tx = 0, ty = 0;
          if (repel && dist2 < REACH * REACH) {
            const dist = Math.sqrt(dist2) || 1, push = (1 - dist / REACH) ** 2 * 30;
            tx = (dx / dist) * push; ty = (dy / dist) * push;
          }
          this.ox[i] += (tx - this.ox[i]) * 0.14; this.oy[i] += (ty - this.oy[i]) * 0.14;
          if (i < ns && dist2 < nearD) { nearD = dist2; near = i; }
        } else if (this.ox[i] || this.oy[i]) {
          this.ox[i] *= 0.86; this.oy[i] *= 0.86;
        }
        // Study dots do not flee the pointer where they can be clicked.
        const hold = i < ns && B.interactive && t > 0.97 ? 0.15 : 1;
        x += this.ox[i] * hold; y += this.oy[i] * hold;
        this.px[i] = x; this.py[i] = y;
        const s = as + (B.s[i] - as) * e;
        let a = (aa + (B.a[i] - aa) * e) * alpha;
        // Studies stand out while a chart has the stage, and recede behind content.
        if (i < ns) a = Math.min(1, a * (0.75 + 0.55 * focus));
        if (a < 0.012 || y < -30 || y > CH + 30) continue;
        g.globalAlpha = a;
        if (i < ns && this.studies[i]?.featured) { g.fillStyle = pal.feature; }
        g.beginPath(); g.arc(x, y, s, 0, TAU); g.fill();
        if (i < ns && this.studies[i]?.featured) g.fillStyle = pal.study;
      }
    }

    // Axes and labels fade in once a chart has settled.
    const env = { pal, time, W, H: this.H };
    const introK = pouring ? smooth(0.8, 1, this.intro) : 1;
    g.save(); g.translate(this.offX, 0); A.furniture(g, (from === to ? 1 : 1 - smooth(0, 0.2, t)) * alpha * introK * (focus > 0.2 ? 1 : 0.6), env); g.restore();
    if (from !== to) { g.save(); g.translate(this.offX, 0); B.furniture(g, smooth(0.82, 1, t) * alpha, env); g.restore(); }

    // Hover and highlight rings on study dots.
    const canHit = B.interactive && t > 0.97 && focus > 0.55;
    const hit = canHit ? near : -1;
    if (hit !== this.hovered || (hit >= 0 && this.tapped)) {
      this.hovered = hit; this.tapped = false;
      this.onHover(hit >= 0 ? this.studies[hit] : null, this.px[hit], this.py[hit]);
    }
    for (const i of [this.hovered, this.highlight]) {
      if (i < 0 || i >= ns) continue;
      const beat = still ? 0.5 : (time * 1.4) % 1;
      g.globalAlpha = 1; g.fillStyle = pal.study; g.strokeStyle = pal.study; g.lineWidth = 1.2;
      g.beginPath(); g.arc(this.px[i], this.py[i], Math.max(3, B.s[i]) + 1, 0, TAU); g.fill();
      g.globalAlpha = 1 - beat;
      g.beginPath(); g.arc(this.px[i], this.py[i], Math.max(3, B.s[i]) + 4 + beat * 12, 0, TAU); g.stroke();
    }
    g.globalAlpha = 1;

    const active = t > 0.5 ? to : from;
    const visible = focus > 0.8;
    if (active !== this.activeScene || visible !== this.captionOn) {
      this.activeScene = active; this.captionOn = visible;
      this.onScene(active, visible, this.scenes.indexOf(active));
    }
  }
}
