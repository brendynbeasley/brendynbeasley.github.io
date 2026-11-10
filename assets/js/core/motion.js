/**
 * motion.js — the small animations that are not the figure.
 * Each class does one thing and can be used on any page.
 */

import { clamp, fmt, reducedMotion, coarsePointer } from './util.js';
import { h } from './dom.js';

/** Adds .is-in to [data-reveal] elements the first time they scroll into view. */
export class Reveal {
  static #io;

  static watch(root = document) {
    if (!Reveal.#io) {
      Reveal.#io = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-in');
          Reveal.#io.unobserve(entry.target);
        }
      }, { rootMargin: '0px 0px -7% 0px', threshold: 0.08 });
    }
    root.querySelectorAll('[data-reveal]:not(.is-in)').forEach((el) => Reveal.#io.observe(el));
  }
}

/** Lights up a paragraph one word at a time as scroll progress goes 0 → 1. */
export class WordReveal {
  constructor(el, { tail = 7, floor = 0.16 } = {}) {
    this.words = [...el.querySelectorAll('.w')];
    this.tail = tail; this.floor = floor; this.shown = new Float32Array(this.words.length).fill(-1);
    this.set(reducedMotion() ? 1 : 0);
  }

  set(p) {
    const head = p * (this.words.length + this.tail);
    this.words.forEach((w, i) => {
      const o = Math.round((this.floor + (1 - this.floor) * clamp((head - i) / this.tail)) * 50) / 50;
      if (o !== this.shown[i]) { this.shown[i] = o; w.style.opacity = o; }
    });
  }
}

/** Counts a number up when it first appears. */
export class Counter {
  static run(el, to, { ms = 1500 } = {}) {
    if (reducedMotion() || !Number.isFinite(to)) { el.textContent = Number.isFinite(to) ? fmt(to) : to; return; }
    el.textContent = '0';
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const step = (now) => {
        const t = clamp((now - t0) / ms);
        el.textContent = fmt(Math.round(to * (1 - Math.pow(1 - t, 4))));
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, { threshold: 0.6 });
    io.observe(el);
  }
}

/**
 * Type that reacts to the pointer. Each letter is its own span, and the
 * variable font's weight axis rises as the pointer gets close, so the
 * headline swells under your hand.
 */
export class KineticTitle {
  constructor(el, director, { rest = 370, peak = 760, reach = 280 } = {}) {
    this.el = el; this.rest = rest; this.peak = peak; this.reach = reach;
    this.letters = [];
    const lines = [...el.querySelectorAll('.line')];
    (lines.length ? lines : [el]).forEach((line) => {
      const text = line.textContent;
      line.textContent = '';
      line.setAttribute('aria-hidden', 'true');
      [...text].forEach((ch) => {
        const span = h('span.k', ch === ' ' ? ' ' : ch);
        line.append(span);
        this.letters.push({ span, w: 120, target: rest, x: 0, y: 0 });
      });
    });
    el.setAttribute('aria-label', el.dataset.label || lines.map((l) => l.textContent).join(' ') || el.textContent);
    this.letters.forEach((l, i) => l.span.style.setProperty('--i', i));
    requestAnimationFrame(() => el.classList.add('is-in'));
    if (reducedMotion()) { this.letters.forEach((l) => l.span.style.setProperty('--w', rest)); return; }
    if (!coarsePointer()) {
      addEventListener('pointermove', (e) => this.point(e.clientX, e.clientY), { passive: true });
      document.addEventListener('pointerleave', () => this.letters.forEach((l) => { l.target = this.rest; }));
    }
    director.onFrame(() => this.frame());
  }

  point(px, py) {
    const box = this.el.getBoundingClientRect();
    if (py < box.top - this.reach || py > box.bottom + this.reach) {
      this.letters.forEach((l) => { l.target = this.rest; });
      return;
    }
    for (const l of this.letters) {
      const r = l.span.getBoundingClientRect();
      const d = Math.hypot(px - (r.left + r.width / 2), py - (r.top + r.height / 2));
      const near = clamp(1 - d / this.reach);
      l.target = this.rest + (this.peak - this.rest) * near * near;
    }
  }

  frame() {
    for (const l of this.letters) {
      const next = l.w + (l.target - l.w) * 0.09;
      if (Math.abs(next - l.w) < 0.4) continue;
      l.w = next;
      l.span.style.setProperty('--w', next.toFixed(0));
    }
  }
}

/** A light that follows the pointer across any .plate, and a 3-D tilt on any .window. */
export class Pointer {
  static bind() {
    if (coarsePointer() || reducedMotion()) return;
    addEventListener('pointermove', (e) => {
      const plate = e.target.closest?.('.plate');
      if (plate) {
        const r = plate.getBoundingClientRect();
        plate.style.setProperty('--mx', `${e.clientX - r.left}px`);
        plate.style.setProperty('--my', `${e.clientY - r.top}px`);
      }
      const win = e.target.closest?.('.window');
      if (win !== Pointer.win && Pointer.win) { Pointer.win.style.setProperty('--rx', '0deg'); Pointer.win.style.setProperty('--ry', '0deg'); }
      Pointer.win = win;
      if (win && !win.classList.contains('is-live')) {
        const r = win.firstElementChild.getBoundingClientRect();
        const nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5;
        win.style.setProperty('--ry', `${(nx * 5).toFixed(2)}deg`);
        win.style.setProperty('--rx', `${(-ny * 4).toFixed(2)}deg`);
      }
    }, { passive: true });
  }
}

/** A ticker tape. It drifts on its own and speeds up with the scroll. */
export class Ticker {
  constructor(el, director) {
    this.track = el.querySelector('.ticker__track');
    if (!this.track || !this.track.children.length) return;
    // Two copies side by side make the loop seamless.
    this.track.append(...[...this.track.children].map((c) => { const k = c.cloneNode(true); k.setAttribute('aria-hidden', 'true'); return k; }));
    this.x = 0; this.dir = -1;
    if (reducedMotion()) return;
    director.onFrame((d) => {
      const half = this.track.scrollWidth / 2;
      if (!half) return;
      if (Math.abs(d.v) > 0.5) this.dir = d.v > 0 ? -1 : 1;
      this.x += this.dir * (42 * d.dt + Math.abs(d.v) * 0.55);
      if (this.x <= -half) this.x += half;
      if (this.x > 0) this.x -= half;
      this.track.style.transform = `translate3d(${this.x.toFixed(1)}px,0,0) skewX(${clamp(d.v * -0.25, -8, 8).toFixed(2)}deg)`;
    });
  }
}
