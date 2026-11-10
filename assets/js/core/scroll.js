/**
 * scroll.js — one clock for the whole page.
 *
 * ScrollDirector owns the only requestAnimationFrame loop on the site. It reads
 * the scroll position once per frame, smooths it, and hands the same state to
 * everything that animates. Nothing here hijacks scrolling: the page scrolls
 * natively and the animations follow it.
 */

import { clamp, reducedMotion } from './util.js';

export class ScrollDirector {
  constructor() {
    this.y = window.scrollY;        // where the page is
    this.sy = this.y;               // where the animations think it is (smoothed)
    this.v = 0;                     // smoothed velocity, px per frame
    this.time = 0;                  // seconds since start
    this.dt = 0.016;
    this.listeners = new Set();
    this.tracks = [];
    this.still = reducedMotion();
    this.probe = Object.assign(document.createElement('div'), { ariaHidden: 'true' });
    this.probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100vh;height:100svh;visibility:hidden;pointer-events:none';
    document.body.append(this.probe);
    this.measure();

    addEventListener('resize', () => this.measure(), { passive: true });
    new ResizeObserver(() => this.measure()).observe(document.body);
    document.addEventListener('visibilitychange', () => { this.last = performance.now(); });
  }

  /** fn(state) runs once per frame. Returns a function that unsubscribes. */
  onFrame(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  /**
   * Follow one element through the viewport.
   * fn(p, state): p is 0 as the element's top reaches the bottom of the screen
   * and 1 as its bottom leaves the top.
   */
  track(el, fn) {
    const t = { el, fn, top: 0, height: 0 };
    this.tracks.push(t);
    this.#measureTrack(t);
    return t;
  }

  #measureTrack(t) {
    const r = t.el.getBoundingClientRect();
    t.top = r.top + window.scrollY;
    t.height = r.height;
  }

  measure() {
    this.vw = document.documentElement.clientWidth;
    this.vh = this.probe.getBoundingClientRect().height || window.innerHeight;
    this.max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    this.tracks.forEach((t) => this.#measureTrack(t));
    this.resized = true;
  }

  start() {
    this.last = performance.now();
    const tick = (now) => {
      this.dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.time += this.dt;
      this.y = window.scrollY;
      const before = this.sy;
      // Frame-rate independent smoothing: the same feel at 60 Hz and 120 Hz.
      this.sy = this.still ? this.y : this.sy + (this.y - this.sy) * (1 - Math.exp(-this.dt * 10));
      if (Math.abs(this.y - this.sy) < 0.05) this.sy = this.y;
      this.v += (this.sy - before - this.v) * 0.2;
      this.progress = clamp(this.sy / this.max);
      for (const t of this.tracks) t.fn(clamp((this.sy + this.vh - t.top) / (this.vh + t.height)), this);
      for (const fn of this.listeners) fn(this);
      this.resized = false;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return this;
  }
}
