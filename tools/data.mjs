#!/usr/bin/env node
/**
 * tools/data.mjs: rebuilds the data files the site draws from.
 *
 * Everything comes straight from the public research repositories, so the
 * numbers on the site are the numbers in the studies.
 *
 *   node tools/data.mjs            run every step
 *   node tools/data.mjs taylor     one step (taylor, minnesota, cournot, studies)
 *
 * Needs Node 18 or newer. Nothing to install.
 *
 *   taylor     content/data/taylor.json     Fed funds, inflation and the output gap by quarter
 *   minnesota  content/data/minnesota.json  87 county outlines and three measures
 *   cournot    content/data/cournot.json    generic drug prices by number of sellers
 *   studies    content/research.json        adds each study's charts, citation and documents
 *              content/ledger.json          how many studies use each method and data source
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'tools', '.cache');
const OWNER = 'brendynbeasley';
const raw = (repo, path) => `https://raw.githubusercontent.com/${OWNER}/${repo}/HEAD/${path}`;

/** Fetch text, keeping a copy on disk so a second run is instant. Returns null on 404. */
async function get(repo, path) {
  const file = join(CACHE, repo, path.replace(/\//g, '__'));
  if (existsSync(file)) { const t = await readFile(file, 'utf8'); return t === '\u0000' ? null : t; }
  const res = await fetch(raw(repo, path));
  await mkdir(dirname(file), { recursive: true });
  if (res.status === 404) { await writeFile(file, '\u0000'); return null; }
  if (!res.ok) throw new Error(`${res.status} for ${repo}/${path}`);
  const text = await res.text();
  await writeFile(file, text);
  return text;
}

/** Read CSV, including quoted fields that contain commas. */
function csv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [keys, ...body] = rows;
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ''])));
}
const round = (v, d = 3) => Math.round(Number(v) * 10 ** d) / 10 ** d;
const save = async (path, data, pretty = false) => {
  const file = join(ROOT, path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(data, null, pretty ? 2 : 0)}\n`);
  console.log(`  wrote ${path}`);
};

/** Run `fn` over `items`, a few at a time. */
async function pool(items, fn, size = 6) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

/* -------------------------------------------------------------------------- */

async function taylor() {
  console.log('taylor');
  const repo = 'taylor-1993-revisited';
  const rows = csv(await get(repo, 'results/rule_paths.csv'));
  const chairs = [];
  rows.forEach((r, i) => {
    const last = chairs.at(-1);
    if (last?.name === r.chair) last.to = i; else chairs.push({ name: r.chair, from: i, to: i });
  });
  const data = {
    source: 'results/rule_paths.csv in github.com/brendynbeasley/taylor-1993-revisited',
    note: 'Quarterly. ffr: effective federal funds rate. infl: four-quarter change in the GDP deflator. gap: CBO output gap. All in percent.',
    start: rows[0].quarter,
    end: rows.at(-1).quarter,
    ffr: rows.map((r) => round(r.ffr)),
    infl: rows.map((r) => round(r.infl_4q)),
    gap: rows.map((r) => round(r.gap_cbo)),
    chairs,
  };
  // Check: Taylor's 1993 rule on these series must reproduce the study's own table.
  const rule = (i) => 2 + data.infl[i] + 0.5 * (data.infl[i] - 2) + 0.5 * data.gap[i];
  const published = csv(await get(repo, 'results/chair_deviations.csv'));
  for (const c of chairs) {
    const devs = []; for (let i = c.from; i <= c.to; i++) devs.push(data.ffr[i] - rule(i));
    const mean = devs.reduce((a, b) => a + b, 0) / devs.length;
    const rmse = Math.sqrt(devs.reduce((a, b) => a + b * b, 0) / devs.length);
    const want = published.find((p) => p.chair === c.name);
    const ok = Math.abs(mean - want.mean_deviation) < 0.01 && Math.abs(rmse - want.rmse_deviation) < 0.01;
    console.log(`  ${ok ? 'ok ' : 'BAD'} ${c.name.padEnd(10)} mean ${mean.toFixed(2)} rmse ${rmse.toFixed(2)} (study: ${Number(want.mean_deviation).toFixed(2)}, ${Number(want.rmse_deviation).toFixed(2)})`);
    if (!ok) throw new Error('Taylor series do not reproduce the published table');
  }
  await save('content/data/taylor.json', data);
}

/* -------------------------------------------------------------------------- */

/** Douglas–Peucker line simplification. `pts` is [[x, y], ...]. */
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1e-12;
    let worst = 0, at = -1;
    for (let i = a + 1; i < b; i++) {
      const t = Math.max(0, Math.min(1, ((pts[i][0] - ax) * dx + (pts[i][1] - ay) * dy) / len2));
      const d = Math.hypot(pts[i][0] - (ax + t * dx), pts[i][1] - (ay + t * dy));
      if (d > worst) { worst = d; at = i; }
    }
    if (worst > tol) { keep[at] = 1; stack.push([a, at], [at, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

async function minnesota() {
  console.log('minnesota');
  const repo = 'Minnesota-Economic-Climate-Research', base = 'products/north-star-atlas/data';
  const geo = JSON.parse(await get(repo, `${base}/mn_counties.geojson`));
  const box = { window: {} }; vm.createContext(box);
  vm.runInContext(await get(repo, `${base}/dashboard-data.js`), box);
  const atlas = box.window.NORTH_STAR_ATLAS;
  const byFips = new Map(atlas.counties.map((c) => [c.fips, c]));

  // A plain local projection: shrink longitude by the cosine of the state's middle latitude.
  const LAT0 = 46.4, K = Math.cos((LAT0 * Math.PI) / 180);
  const rings = geo.features.flatMap((f) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).map((poly) => ({ f, ring: poly[0] })));
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const { ring } of rings) for (const [lon, lat] of ring) {
    const x = lon * K, y = -lat;
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const scale = 1000 / (maxY - minY);
  const counties = new Map();
  let before = 0, after = 0;
  for (const { f, ring } of rings) {
    const pts = ring.map(([lon, lat]) => [(lon * K - minX) * scale, (-lat - minY) * scale]);
    const slim = simplify(pts, 0.6);
    before += pts.length; after += slim.length;
    const fips = f.properties.GEOID, c = byFips.get(fips);
    if (!c) throw new Error(`no data for county ${fips}`);
    if (!counties.has(fips)) counties.set(fips, {
      name: c.county_name, fips,
      precip: round(c.avg_precip_total, 1), flood: round(c.inland_flood_risk_score, 1), permits: round(c.avg_bps_units_per_1000, 2),
      rings: [],
    });
    counties.get(fips).rings.push(slim.flatMap(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]));
  }
  console.log(`  ${counties.size} counties, ${before} points down to ${after}`);
  await save('content/data/minnesota.json', {
    source: 'products/north-star-atlas/data in github.com/brendynbeasley/Minnesota-Economic-Climate-Research',
    years: `${atlas.metadata.years[0]} to ${atlas.metadata.years.at(-1)}`,
    width: round((maxX - minX) * scale, 1), height: 1000,
    measures: [
      { key: 'precip', label: 'Precipitation', note: 'Average annual precipitation in the NOAA county panel', higher: 'wetter' },
      { key: 'flood', label: 'Flood risk', note: 'FEMA inland flood risk score, 0 to 100', higher: 'riskier' },
      { key: 'permits', label: 'Building permits', note: 'Residential permit units per 1,000 residents, yearly average', higher: 'more building' },
    ],
    places: [[-93.2277, 44.974, 'University of Minnesota']].map(([lon, lat, name]) => ({ name, x: round((lon * K - minX) * scale, 1), y: round((-lat - minY) * scale, 1) })),
    counties: [...counties.values()],
  });
}

/* -------------------------------------------------------------------------- */

async function cournot() {
  console.log('cournot');
  const rows = csv(await get('one-more-seller', 'results/price_by_sellers.csv'));
  await save('content/data/cournot.json', {
    source: 'results/price_by_sellers.csv in github.com/brendynbeasley/one-more-seller',
    note: 'Generic price as a share of the brand price before entry, by number of generic sellers. NADAC median, 2014 to 2026. The last row is ten or more sellers.',
    rows: rows.map((r) => ({ sellers: Number(r.generic_sellers), median: round(r.median), low: round(r.p25), high: round(r.p75), cournot: round(r.cournot_kappa0) })),
  });
}

/* -------------------------------------------------------------------------- */

// Each pattern is deliberately narrow: a count on the site is a claim about the work.
const METHODS = [
  ['Regression', /\bregress(ion|ions|ed)\b|\bOLS\b/i],
  ['Fixed effects', /fixed[- ]effects?/i],
  ['Clustered standard errors', /clustered (by|at|on)\b|errors (are |were )?clustered|cluster-robust|clustered standard errors/i],
  ['Panel data', /(?<!(left|right|top|bottom|upper|lower|first|second|third|each|both|two|three)[- ])\bpanel\b(?! [A-D]\b)/i],
  ['Bootstrap', /bootstrap/i],
  ['Placebo tests', /placebo/i],
  ['Event studies', /event[- ]stud(y|ies)/i],
  ['Instrumental variables', /instrumental variable|\b2SLS\b|two-stage least squares|\bIV (regression|estimate)|instrument(ed|s)? (for|with)|external instrument/i],
  ['Difference-in-differences', /difference[- ]in[- ]differences?|diff[- ]in[- ]diff/i],
  ['Permutation tests', /permutation/i],
  ['Monte Carlo simulation', /monte carlo/i],
];
const SOURCES = [
  ['Census Bureau', /\bCensus\b/],
  ['FRED', /\bFRED\b/],
  ['Bureau of Labor Statistics', /\bBLS\b|Bureau of Labor Statistics/],
  ['Bureau of Economic Analysis', /\bBEA\b|Bureau of Economic Analysis/],
  ['SEC filings', /\bSEC\b|\bEDGAR\b|10-K/],
  ['NBER-CES manufacturing', /NBER[- ]CES/],
  ['Patent records', /USPTO|PatentsView|patent (data|records|grants)/i],
  ['Medicare and Medicaid', /Medicare|Medicaid|\bCMS\b|NADAC/],
  ['Energy Information Administration', /\bEIA\b|Energy Information Administration/],
  ['IRS tax tables', /\bIRS\b|Statistics of Income/],
  ['Airline ticket sample', /DB1B|Bureau of Transportation Statistics/],
  ['FERC', /\bFERC\b/],
  ['Compustat', /Compustat/],
];

/** The citation at the top of a methods review: "- **Paper:** …" up to the next bullet. */
function paperOf(review) {
  if (!review) return '';
  const m = review.match(/(?:-\s+)?\*\*Papers?[:.]\*\*([\s\S]*?)(?=\n-\s+\*\*|\n\*\*|\n\n)/);
  return m ? m[1].replace(/\s+/g, ' ').replace(/[*_`]/g, '').trim() : '';
}

async function studies() {
  console.log('studies');
  const file = join(ROOT, 'content', 'research.json');
  const research = JSON.parse(await readFile(file, 'utf8'));
  const counts = { methods: new Map(), sources: new Map() };
  let figures = 0, papers = 0;
  await pool(research.items, async (item) => {
    const repo = item.repo?.match(/github\.com\/[^/]+\/([^/#?]+)/)?.[1];
    if (!repo) return;
    const [readme, technical, review] = await Promise.all([get(repo, 'README.md'), get(repo, 'TECHNICAL.md'), get(repo, 'METHODS_REVIEW.md')]);
    // Charts: every image the write-up shows, with the caption it was given.
    item.figures = [...(readme || '').matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)/g)]
      .filter(([, , src]) => !/^https?:/.test(src) && /\.(png|jpe?g|svg)$/i.test(src))
      .map(([, alt, src]) => ({ src: src.replace(/^\.\//, ''), alt: alt.trim() }));
    if (!item.figures.length) delete item.figures;
    figures += item.figures?.length || 0;
    const paper = paperOf(review);
    if (paper) { item.paper = paper; papers++; } else delete item.paper;
    item.docs = [technical && 'TECHNICAL.md', review && 'METHODS_REVIEW.md'].filter(Boolean);
    if (!item.docs.length) delete item.docs;
    const text = [readme, technical].filter(Boolean).join('\n');
    for (const [label, re] of METHODS) if (re.test(text)) counts.methods.set(label, (counts.methods.get(label) || 0) + 1);
    for (const [label, re] of SOURCES) if (re.test(text)) counts.sources.set(label, (counts.sources.get(label) || 0) + 1);
  });
  await writeFile(file, `${JSON.stringify(research, null, 2)}\n`);
  console.log(`  wrote content/research.json (${figures} charts, ${papers} citations)`);
  const rank = (map) => [...map].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n);
  await save('content/ledger.json', {
    note: 'Number of studies whose write-up or technical notes use each method or data source. Rebuilt by tools/data.mjs.',
    of: research.items.length,
    methods: rank(counts.methods),
    sources: rank(counts.sources),
  }, true);
}

/* -------------------------------------------------------------------------- */

const steps = { taylor, minnesota, cournot, studies };
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(steps);
for (const name of wanted) {
  if (!steps[name]) { console.error(`Unknown step "${name}". Choose from: ${Object.keys(steps).join(', ')}`); process.exit(1); }
  await steps[name]();
}
