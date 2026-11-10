/**
 * minnesota.js: Minnesota's 87 counties, engraved.
 *
 * The data is from my Minnesota Climate Project. Each county is shaded by
 * hatching, the way a printed atlas does it: the closer the lines, the higher
 * the value, and the top fifth is cross-hatched. Nothing is filled with a
 * solid colour.
 *
 * The outlines come from the project's own county file, simplified from
 * 190,000 points to under 3,000 by tools/data.mjs.
 */

import { h, clear, append } from '../core/dom.js';
import { clamp } from '../core/util.js';

const GAPS = [11, 8, 6, 4.4, 3.2]; // distance between hatch lines for each fifth, low to high

export class MinnesotaMap {
  /**
   * @param {object} data   content/data/minnesota.json
   * @param {{study?: object, onStudy?: Function}} options  the study this map belongs to
   */
  constructor(data, { study = null, onStudy = () => {} } = {}) {
    this.data = data; this.study = study; this.onStudy = onStudy;
    this.measure = data.measures[0];
    this.hover = null; this.reveal = 1; this.shown = -1;
    this.paths = data.counties.map((c) => ({ county: c, rings: c.rings.map((r) => Float32Array.from(r)) }));
    this.rank();
  }

  /** For every measure: each county's fifth (0 to 4) and its rank, 1 being highest. */
  rank() {
    for (const m of this.data.measures) {
      const sorted = [...this.data.counties].sort((a, b) => b[m.key] - a[m.key]);
      sorted.forEach((c, i) => {
        (c.rank ??= {})[m.key] = i + 1;
        (c.fifth ??= {})[m.key] = 4 - Math.min(4, Math.floor((i / sorted.length) * 5));
      });
    }
  }

  render() {
    this.canvas = h('canvas.mnmap__canvas', { role: 'img', 'aria-label': `Map of Minnesota's 87 counties, shaded by ${this.measure.label.toLowerCase()}` });
    this.readout = h('p.mnmap__readout.label');
    this.chips = h('div.mnmap__chips', { role: 'group', 'aria-label': 'Choose what the map shows' },
      this.data.measures.map((m) => h('button.chip', { type: 'button', 'aria-pressed': String(m === this.measure), onClick: () => this.pick(m) }, m.label)));
    this.legend = h('div.mnmap__legend.label');
    const s = this.study;
    this.root = h('figure.mnmap',
      h('div.mnmap__frame', this.canvas),
      h('figcaption.mnmap__caption',
        this.chips, this.legend, this.readout,
        s && h('p.mnmap__source',
          h('a.link', { href: s.url || s.repo, onClick: (e) => { e.preventDefault(); this.onStudy(s.slug); } }, s.title),
          `. 87 counties, ${this.data.years}. ${s.finding}`)));
    this.canvas.addEventListener('pointermove', (e) => this.point(e));
    this.canvas.addEventListener('pointerleave', () => { this.hover = null; this.draw(); this.say(); });
    new ResizeObserver(() => this.fit()).observe(this.canvas);
    addEventListener('themechange', () => this.draw());
    this.paintLegend(); this.say();
    return this.root;
  }

  pick(measure) {
    this.measure = measure;
    [...this.chips.children].forEach((c, i) => c.setAttribute('aria-pressed', String(this.data.measures[i] === measure)));
    this.canvas.setAttribute('aria-label', `Map of Minnesota's 87 counties, shaded by ${measure.label.toLowerCase()}`);
    this.paintLegend(); this.draw(); this.say();
  }

  paintLegend() {
    append(clear(this.legend), [h('span', 'Lower'),
      GAPS.map((gap, i) => h('i', { style: { '--gap': `${gap * 0.6}px` }, class: i === 4 ? 'is-cross' : null })),
      h('span', `Higher: ${this.measure.higher}`)]);
  }

  /** The line of text under the map: the county under the pointer, or what the shading means. */
  say() {
    const c = this.hover?.county, n = this.data.counties.length;
    if (!c) { this.readout.textContent = this.measure.note; return; }
    this.readout.replaceChildren(h('b', `${c.name} County`),
      `  Precipitation: ${ordinal(c.rank.precip)} of ${n}.  Flood risk: ${c.flood.toFixed(0)} of 100.  Permits: ${c.permits.toFixed(2)} per 1,000.`);
  }

  fit() {
    const box = this.canvas.getBoundingClientRect();
    if (!box.width) return;
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.cw = box.width; this.ch = box.height;
    this.canvas.width = Math.round(box.width * this.dpr); this.canvas.height = Math.round(box.height * this.dpr);
    this.scale = Math.min(box.width / this.data.width, box.height / this.data.height) * 0.98;
    this.ox = (box.width - this.data.width * this.scale) / 2; this.oy = (box.height - this.data.height * this.scale) / 2;
    this.draw();
  }

  /** Print the map from west to east as `p` goes from 0 to 1. */
  progress(p) {
    const q = Math.round(clamp(p) * 100) / 100;
    if (q === this.shown) return;
    this.shown = this.reveal = q;
    this.draw();
  }

  trace(g, rings) {
    g.beginPath();
    for (const r of rings) {
      g.moveTo(this.ox + r[0] * this.scale, this.oy + r[1] * this.scale);
      for (let i = 2; i < r.length; i += 2) g.lineTo(this.ox + r[i] * this.scale, this.oy + r[i + 1] * this.scale);
      g.closePath();
    }
  }

  draw() {
    const g = this.canvas.getContext('2d');
    if (!this.cw) return;
    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue('--ink').trim(), accent = css.getPropertyValue('--accent').trim();
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.cw, this.ch);
    g.save();
    // The reveal: everything east of the sweep line is still blank paper.
    g.beginPath(); g.rect(0, 0, this.ox + this.data.width * this.scale * this.reveal + 1, this.ch); g.clip();
    const key = this.measure.key, reach = this.cw + this.ch;
    for (const p of this.paths) {
      const hot = p === this.hover, fifth = p.county.fifth[key], gap = GAPS[fifth];
      g.save();
      this.trace(g, p.rings); g.clip();
      g.strokeStyle = hot ? accent : ink;
      g.globalAlpha = hot ? 1 : 0.34 + fifth * 0.11;
      g.lineWidth = hot ? 1 : 0.7;
      g.beginPath();
      // Parallel lines at 45°, anchored to the canvas so they line up across county borders.
      for (let d = -this.ch; d < reach; d += gap) { g.moveTo(d, 0); g.lineTo(d + this.ch, this.ch); }
      if (fifth === 4) for (let d = 0; d < reach + this.ch; d += gap * 1.6) { g.moveTo(d, 0); g.lineTo(d - this.ch, this.ch); }
      g.stroke();
      g.restore();
    }
    g.strokeStyle = ink; g.lineWidth = 0.7; g.globalAlpha = 0.55; g.lineJoin = 'round';
    for (const p of this.paths) { this.trace(g, p.rings); g.stroke(); }
    if (this.hover) { g.strokeStyle = accent; g.lineWidth = 1.8; g.globalAlpha = 1; this.trace(g, this.hover.rings); g.stroke(); }
    // Where I study.
    for (const place of this.data.places || []) {
      const x = this.ox + place.x * this.scale, y = this.oy + place.y * this.scale;
      g.globalAlpha = 1; g.fillStyle = css.getPropertyValue('--paper').trim(); g.strokeStyle = accent; g.lineWidth = 1.6;
      g.beginPath(); g.arc(x, y, 4.5, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = accent; g.beginPath(); g.arc(x, y, 1.6, 0, Math.PI * 2); g.fill();
      g.font = '500 10px "IBM Plex Mono", ui-monospace, monospace'; g.textBaseline = 'middle';
      const label = place.name.toUpperCase(), w = g.measureText(label).width;
      g.fillStyle = css.getPropertyValue('--paper').trim(); g.globalAlpha = 0.88; g.fillRect(x + 9, y - 8, w + 8, 16);
      g.globalAlpha = 1; g.fillStyle = accent; g.fillText(label, x + 13, y + 0.5);
    }
    g.restore();
  }

  /** Which county is under the pointer? Ray casting against each outline. */
  point(e) {
    const box = this.canvas.getBoundingClientRect();
    const x = (e.clientX - box.left - this.ox) / this.scale, y = (e.clientY - box.top - this.oy) / this.scale;
    let found = null;
    for (const p of this.paths) {
      for (const r of p.rings) {
        let inside = false;
        for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
          if ((r[i + 1] > y) !== (r[j + 1] > y) && x < ((r[j] - r[i]) * (y - r[i + 1])) / (r[j + 1] - r[i + 1]) + r[i]) inside = !inside;
        }
        if (inside) { found = p; break; }
      }
      if (found) break;
    }
    if (found !== this.hover) { this.hover = found; this.draw(); this.say(); }
  }
}

function ordinal(n) {
  const tail = n % 100;
  return `${n}${tail > 10 && tail < 14 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
}
