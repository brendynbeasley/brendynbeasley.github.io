/**
 * glyphs.js — a small chart for every card.
 *
 * Each research theme has its own kind of diagram (a demand curve, a price
 * schedule, a pair of reaction functions…). The seed, taken from the study's
 * name, nudges the control points so no two cards carry quite the same drawing.
 */

import { h } from '../core/dom.js';
import { hash, rng } from '../core/util.js';

const SHAPES = {
  // Demand and marginal revenue.
  foundations: (j) => ({ main: `M6 ${7 + j()} Q ${30 + j()} ${14 + j()} 57 ${33 + j()}`, aux: `M6 ${7 + j()} L ${34 + j()} 36`, dot: [31 + j(), 17 + j()] }),
  // A price schedule that steps down.
  pricing: (j) => ({ main: `M6 ${8 + j()} H${18 + j()} V${16 + j()} H${31 + j()} V${24 + j()} H${45 + j()} V31 H58`, dot: [58, 31] }),
  // Two reaction curves and where they cross.
  strategy: (j) => ({ main: `M8 ${6 + j()} L ${42 + j()} 36`, aux: `M6 ${30 + j()} L 57 ${12 + j()}`, dot: [26.5, 22.5] }),
  // A small network.
  exclusion: (j) => ({ main: `M10 31 L ${31 + j()} ${8 + j()} L 53 31 Z`, aux: `M${31 + j()} ${8 + j()} V 31`, dot: [31, 31] }),
  // Scattered observations and a fitted line.
  measurement: (j) => ({ main: `M6 ${32 + j()} L 58 ${8 + j()}`, pts: [[12, 26], [19, 30], [25, 20], [33, 23], [40, 13], [48, 16], [54, 7]].map(([x, y]) => [x + j(), y + j()]) }),
  // A price that rises until it meets a cap.
  regulation: (j) => ({ main: `M6 35 C ${20 + j()} 33, ${26 + j()} 12, 40 12 H58`, aux: 'M6 12 H58', dot: [40, 12] }),
  // A cycle.
  macro: (j) => ({ main: `M4 ${24 + j()} C 10 ${8 + j()}, 16 ${8 + j()}, 22 22 S 34 ${35 + j()}, 40 20 S 52 ${7 + j()}, 59 15`, aux: 'M4 22 H59' }),
  // The S-curve of a new technology.
  innovation: (j) => ({ main: `M6 35 C ${27 + j()} 35, ${31 + j()} 6, 58 ${6 + j()}`, dot: [58, 6] }),
  // Bars.
  applied: (j) => ({ main: `M11 36 V${23 + j()} M25 36 V${13 + j()} M39 36 V${19 + j()} M53 36 V${8 + j()}` }),
};

export function glyph(theme, seed = '') {
  const rand = rng(hash(seed));
  const jitter = () => Math.round((rand() - 0.5) * 6);
  const shape = (SHAPES[theme] || SHAPES.measurement)(jitter);
  const svg = h('svg.glyph', { viewBox: '0 0 62 40', 'aria-hidden': 'true' });
  svg.append(h('path', { d: 'M3 2 V37 H60', opacity: 0.55 }));
  if (shape.aux) svg.append(h('path', { d: shape.aux, opacity: 0.5, 'stroke-dasharray': '2 3' }));
  svg.append(h('path.g-main', { d: shape.main, pathLength: 1 }));
  (shape.pts || []).forEach(([x, y]) => svg.append(h('circle.g-dot', { cx: x, cy: y, r: 1.6 })));
  if (shape.dot) svg.append(h('circle.g-dot', { cx: shape.dot[0], cy: shape.dot[1], r: 2.4 }));
  return svg;
}

/** A generated cover for a linked page that has no screenshot yet. */
export function cover(title = '', seed = title) {
  const rand = rng(hash(seed));
  const svg = h('svg', { viewBox: '0 0 320 200', preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true' });
  for (let i = 0; i < 150; i++) {
    const u = rand(), x = 20 + u * 280, y = 170 - Math.exp(-((u - 0.5) ** 2) / 0.045) * 120 * rand();
    svg.append(h('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 1.5, fill: 'currentColor', opacity: (0.25 + rand() * 0.5).toFixed(2) }));
  }
  svg.append(h('path', { d: 'M16 174 H304', stroke: 'currentColor', 'stroke-width': 0.6, opacity: 0.6 }));
  const text = h('text', { x: 20, y: 46, fill: 'currentColor', 'font-size': 26, 'font-family': 'Fraunces, Georgia, serif', 'font-style': 'italic' });
  text.textContent = title.slice(0, 22);
  svg.append(text);
  return svg;
}
