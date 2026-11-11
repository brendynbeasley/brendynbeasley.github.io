#!/usr/bin/env node
/**
 * tools/usb-monitor.mjs: keeps the U.S. Bancorp study current without my computer.
 *
 * GitHub runs this every morning (.github/workflows/usb-monitor.yml). It asks
 * public sources whether anything has happened since the report was written,
 * decides which findings that could touch, and writes one file:
 *
 *   content/data/usbancorp.json
 *
 * The page /us-bancorp/ draws its live exhibit from that file.
 *
 * What it checks, all free and public:
 *   fdic         FDIC BankFind Call Report ratios for U.S. Bank and its five core peers, by quarter
 *   sec          SEC EDGAR: every new U.S. Bancorp filing, and new 10-Ks and 10-Qs from the peers
 *   fed          Federal Reserve Board press releases that name the bank or a peer
 *   fedreg       Federal Register documents whose title names the bank
 *   cfpb         CFPB enforcement actions naming U.S. Bank, and the complaint count
 *   annual       a new year of FDIC Summary of Deposits or HMDA data
 *
 * It routes; it never rewrites the report. The verdict is the same one the
 * project's own monitor uses: REVISIT (a serious item or a tripwire), REVIEW
 * (new periodic data), NO CHANGE EXPECTED (routine items), NO CHANGE.
 *
 *   node tools/usb-monitor.mjs            run it and write the file
 *   node tools/usb-monitor.mjs --dry      run it and print a summary, write nothing
 *
 * SEC asks automated clients to identify themselves. Set SEC_USER_AGENT
 * (a name and an email) in the environment; without it the SEC check is skipped.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'content', 'data', 'usbancorp.json');
const IMPACT = JSON.parse(await readFile(join(ROOT, 'tools', 'usb', 'impact.json'), 'utf8'));
const DRY = process.argv.includes('--dry');

/** What the report already covers. Anything after this is new. */
const BASELINE = {
  date: '2026-11-11',          // report written; SEC filings from this day on are new
  callReport: '2026-06-30',    // latest Call Report quarter in the report's data
  sodYear: 2026,
  hmdaYear: 2025,
};

const TARGET = { name: 'U.S. Bank', cert: 6548, cik: 36104 };
/** The report's five core peers (plan/peers.yaml, rule P-core), by lead bank. */
const PEERS = [
  { name: 'Capital One', cert: 4297, cik: 927628 },
  { name: 'PNC', cert: 6384, cik: 713676 },
  { name: 'Truist', cert: 9846, cik: 92230 },
  { name: 'Fifth Third', cert: 6672, cik: 35527 },
  { name: 'Huntington', cert: 6560, cik: 49196 },
];
const NAME = /\bU\.?\s?S\.? Ban(k|corp)\b/i;

/**
 * The measures drawn on the page, from FDIC Call Report fields. All percent.
 * `better` says which way is good, for the readout only.
 */
const METRICS = {
  roe:  { label: 'Return on equity', short: 'ROE', better: 'higher', calc: (r) => r.ROE },
  roa:  { label: 'Return on assets', short: 'ROA', better: 'higher', calc: (r) => r.ROA },
  eff:  { label: 'Efficiency ratio (cost per dollar of revenue)', short: 'Efficiency', better: 'lower', calc: (r) => r.EEFFR },
  nim:  { label: 'Net interest margin', short: 'NIM', better: 'higher', calc: (r) => r.NIMY },
  fee:  { label: 'Fees as a share of revenue', short: 'Fee share', better: 'higher', calc: (r) => pct(r.NONII, r.NONII + r.NIM) },
  cof:  { label: 'Interest expense per dollar of earning assets', short: 'Funding cost', better: 'lower', calc: (r) => r.INTEXPY },
  nib:  { label: 'Deposits that pay no interest, share of domestic deposits', short: 'Free deposits', better: 'higher', calc: (r) => pct(r.DEPNIDOM, r.DEPDOM) },
  acl:  { label: 'Loan-loss allowance per dollar of loans', short: 'Allowance', better: 'neither', calc: (r) => r.LNATRESR },
  nal:  { label: 'Nonaccrual loans per dollar of loans', short: 'Nonaccrual', better: 'lower', calc: (r) => pct(r.NALNLS, r.LNLSGR) },
  nco:  { label: 'Net charge-offs per dollar of loans', short: 'Charge-offs', better: 'lower', calc: (r) => r.NTLNLSR },
  eq:   { label: 'Equity per dollar of assets', short: 'Equity', better: 'neither', calc: (r) => r.EQV },
};
const FIELDS = 'REPDTE,ASSET,ROE,ROA,EEFFR,NIMY,NONII,NIM,INTEXPY,DEPNIDOM,DEPDOM,LNATRESR,NALNLS,LNLSGR,NTLNLSR,EQV';
const FROM = '20020331';  // cert 6548 holds the merged Firstar and U.S. Bancorp banks from 2001 on

/**
 * The tripwires of the project's monitor (code/monitor/impact.py), on the
 * FDIC versions of the same ratios. Fixed thresholds that decide whether a
 * person should look. They are not significance tests.
 */
const TRIPWIRES = [
  { key: 'nib', label: 'Free deposits, change on the quarter', compare: 'quarter', threshold: 2, unit: 'points', finding: 2 },
  { key: 'eff', label: 'Efficiency ratio, change on the year', compare: 'year', threshold: 3, unit: 'points', finding: 1 },
  { key: 'acl', label: 'Allowance per dollar of loans, change on the quarter', compare: 'quarter', threshold: 0.2, unit: 'points', finding: 3 },
  { key: 'nal', label: 'Nonaccrual loans per dollar of loans, change on the quarter', compare: 'quarter', threshold: 0.1, unit: 'points', finding: 3 },
  { key: 'growth', label: 'Total assets, growth on the quarter', compare: 'level', threshold: 5, unit: '%', finding: 4 },
];

function pct(a, b) { return Number.isFinite(a) && Number.isFinite(b) && b ? (100 * a) / b : null; }
const round = (x, d = 3) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(d)));
const today = new Date().toISOString().slice(0, 10);
const isoDate = (yyyymmdd) => `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
const quarterName = (iso) => `${iso.slice(0, 4)} Q${Math.ceil(Number(iso.slice(5, 7)) / 3)}`;
const median = (xs) => {
  const v = xs.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

async function http(url, { json = true, headers = {}, tries = 3 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'brendynbeasley.github.io study monitor', ...headers }, signal: AbortSignal.timeout(60000) });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return json ? await res.json() : await res.text();
    } catch (err) { last = err; await new Promise((r) => setTimeout(r, 1500 * (i + 1))); }
  }
  throw new Error(`${new URL(url).host}: ${last?.message || last}`);
}

/** An event, routed through the project's impact map. */
function event(stream, topic, date, title, url, { severity, detail = '' } = {}) {
  const t = IMPACT[topic] || {};
  return {
    key: `${stream}:${url || title}`,
    stream, topic, date, title, url, detail,
    severity: severity || t.severity || 'low',
    label: t.label || topic,
    findings: t.findings || [],
    sections: t.sections || [],
    revisitIf: t.revisit_if || '',
  };
}

/* ---- Streams ------------------------------------------------------------- */

async function fdic(state) {
  const rows = {};
  for (const bank of [TARGET, ...PEERS]) {
    const url = `https://api.fdic.gov/banks/financials?filters=CERT:${bank.cert}%20AND%20REPDTE:[${FROM}%20TO%2099991231]&fields=${FIELDS}&sort_by=REPDTE&sort_order=ASC&limit=200`;
    const j = await http(url);
    rows[bank.cert] = Object.fromEntries((j?.data || []).map((d) => [d.data.REPDTE, d.data]));
  }
  const dates = Object.keys(rows[TARGET.cert]).sort();
  const series = { quarters: dates.map(isoDate), metrics: {} };
  for (const [key, m] of Object.entries(METRICS)) {
    series.metrics[key] = {
      label: m.label, short: m.short, better: m.better,
      usb: dates.map((d) => round(m.calc(rows[TARGET.cert][d]))),
      peers: dates.map((d) => round(median(PEERS.map((p) => (rows[p.cert][d] ? m.calc(rows[p.cert][d]) : null))))),
      each: Object.fromEntries(PEERS.map((p) => [p.name, dates.map((d) => (rows[p.cert][d] ? round(m.calc(rows[p.cert][d]), 2) : null))])),
    };
  }
  // Tripwires on the latest quarter.
  const n = dates.length - 1;
  const assets = dates.map((d) => rows[TARGET.cert][d].ASSET);
  const tripwires = TRIPWIRES.map((t) => {
    let value, change;
    if (t.key === 'growth') { value = pct(assets[n] - assets[n - 1], assets[n - 1]); change = value; }
    else {
      const s = series.metrics[t.key].usb;
      value = s[n];
      const ref = t.compare === 'year' ? s[n - 4] : s[n - 1];
      change = value != null && ref != null ? value - ref : null;
    }
    return { ...t, quarter: series.quarters[n], value: round(value, 2), change: round(change, 2), crossed: change != null && Math.abs(change) >= t.threshold };
  });
  const latest = series.quarters[n];
  const events = [];
  if (latest > (state.callReport || BASELINE.callReport)) {
    events.push(event('fdic', 'callreport_quarter', latest, `Call Report for ${quarterName(latest)} is out`, 'https://banks.data.fdic.gov/bankfind-suite/financialreporting', { severity: 'medium' }));
  }
  state.callReport = latest > (state.callReport || '') ? latest : state.callReport;
  return { events, series, tripwires, note: `${dates.length} quarters for U.S. Bank, latest ${quarterName(latest)}; peer median of ${PEERS.length} lead banks` };
}

const ITEMS = [['4.02', 'sec_8k_4_02'], ['4.01', 'sec_8k_4_01'], ['2.05', 'sec_8k_2_05'], ['1.01', 'sec_8k_1_01_2_01'], ['1.02', 'sec_8k_1_01_2_01'], ['2.01', 'sec_8k_1_01_2_01'], ['5.02', 'sec_8k_5_02'], ['2.02', 'sec_8k_2_02']];

function secTopic(form, items) {
  if (/^10-K/.test(form)) return 'sec_10k';
  if (/^10-Q/.test(form)) return 'sec_10q';
  if (/^8-K/.test(form)) { for (const [i, t] of ITEMS) if (items.includes(i)) return t; return 'sec_8k_other'; }
  if (/^DEF ?14A|^DEFA14A/.test(form)) return 'sec_proxy';
  return 'sec_other';
}

async function sec() {
  const ua = process.env.SEC_USER_AGENT;
  if (!ua) return { skipped: true, events: [], note: 'skipped: SEC_USER_AGENT is not set' };
  const events = [];
  let listed = 0;
  for (const bank of [TARGET, ...PEERS]) {
    const j = await http(`https://data.sec.gov/submissions/CIK${String(bank.cik).padStart(10, '0')}.json`, { headers: { 'User-Agent': ua } });
    const r = j.filings.recent;
    for (let i = 0; i < r.form.length; i++) {
      const form = r.form[i], date = r.filingDate[i];
      if (date < BASELINE.date) continue;
      const acc = r.accessionNumber[i];
      const url = `https://www.sec.gov/Archives/edgar/data/${bank.cik}/${acc.replace(/-/g, '')}/${r.primaryDocument[i]}`;
      if (bank !== TARGET) {
        if (!/^10-[KQ]/.test(form)) continue;
        events.push(event('sec', 'sec_peer', date, `${bank.name} filed its ${form}`, url, { severity: 'low' }));
        continue;
      }
      const items = (r.items[i] || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (/^[345](\/A)?$|^SC 13|^424B|^FWP|^144/.test(form)) continue;  // insider forms and debt offerings do not change findings
      const topic = secTopic(form, items);
      events.push(event('sec', topic, date, `U.S. Bancorp filed a ${form}${items.length ? ` (items ${items.join(', ')})` : ''}`, url));
      listed++;
    }
    await new Promise((res) => setTimeout(res, 250));  // SEC allows ten requests a second; stay far below
  }
  return { events, note: `U.S. Bancorp and ${PEERS.length} peers checked; ${listed} U.S. Bancorp filings since ${BASELINE.date}` };
}

async function fed() {
  const text = await http('https://www.federalreserve.gov/json/ne-press.json', { json: false });
  const list = JSON.parse(text.replace(/^﻿/, ''));
  const events = [];
  for (const it of list) {
    const d = new Date(it.d);
    if (Number.isNaN(+d)) continue;
    const date = d.toISOString().slice(0, 10);
    if (date < BASELINE.date) continue;
    const url = `https://www.federalreserve.gov${it.l}`;
    const enforcement = /enforcement/i.test(it.pt);
    if (NAME.test(it.t)) events.push(event('fed', 'enforcement_fed', date, it.t, url, { severity: enforcement ? 'high' : 'medium', detail: it.pt }));
    else if (enforcement && PEERS.some((p) => it.t.includes(p.name))) events.push(event('fed', 'enforcement_fed', date, it.t, url, { severity: 'low', detail: 'a peer, for context' }));
  }
  return { events, note: `${list.length} Board press releases scanned` };
}

async function fedreg() {
  const q = 'conditions[term]=%22U.S.+Bancorp%22+OR+%22U.S.+Bank+National%22&order=newest&per_page=50&fields[]=title&fields[]=publication_date&fields[]=html_url&fields[]=type';
  const j = await http(`https://www.federalregister.gov/api/v1/documents.json?${q}&conditions[publication_date][gte]=${BASELINE.date}`);
  const events = (j?.results || []).filter((d) => NAME.test(d.title))
    .map((d) => event('fedreg', 'federal_register', d.publication_date, `${d.type}: ${d.title}`, d.html_url));
  return { events, note: `${j?.count ?? 0} documents mention the bank since ${BASELINE.date}; ${events.length} name it in the title` };
}

async function cfpb(state) {
  const html = await http('https://www.consumerfinance.gov/enforcement/actions/?title=U.S.+Bank', { json: false });
  const found = [...html.matchAll(/href="(\/enforcement\/actions\/[a-z0-9-]+\/)"[^>]*>([^<]+)</g)]
    .filter((m) => NAME.test(m[2])).map((m) => ({ path: m[1], title: m[2].trim() }));
  const events = [];
  if (!state.cfpbKnown) state.cfpbKnown = found.map((f) => f.path);  // first run: what is listed now is the baseline
  else {
    for (const f of found) if (!state.cfpbKnown.includes(f.path)) {
      events.push(event('cfpb', 'enforcement_occ_cfpb_fdic', today, `CFPB enforcement action: ${f.title}`, `https://www.consumerfinance.gov${f.path}`, { severity: 'high' }));
      state.cfpbKnown.push(f.path);
    }
  }
  const since = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  const c = await http(`https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1/?company=U.S.%20BANCORP&size=0&date_received_min=${since}`);
  const complaints = c?.hits?.total?.value ?? null;
  return { events, complaints, note: `${found.length} CFPB actions name U.S. Bank; ${complaints ?? 'unknown'} consumer complaints in the last 90 days` };
}

async function annual(state) {
  const events = [];
  const sod = await http(`https://api.fdic.gov/banks/sod?filters=CERT:${TARGET.cert}&fields=YEAR&sort_by=YEAR&sort_order=DESC&limit=1`);
  const sodYear = sod?.data?.[0]?.data?.YEAR;
  const sodBase = state.sodYear || BASELINE.sodYear;
  if (sodYear > sodBase) events.push(event('annual', 'sod_year', `${sodYear}-06-30`, `FDIC Summary of Deposits for ${sodYear} is out`, 'https://banks.data.fdic.gov/bankfind-suite/SOD', { severity: 'medium' }));
  state.sodYear = Math.max(sodBase, sodYear || 0);
  const hmdaBase = state.hmdaYear || BASELINE.hmdaYear;
  let hmdaYear = hmdaBase;
  try {
    const next = await http(`https://ffiec.cfpb.gov/v2/data-browser-api/view/filers?years=${hmdaBase + 1}`, { tries: 1 });
    if (next?.institutions?.length) {
      hmdaYear = hmdaBase + 1;
      events.push(event('annual', 'hmda_year', String(hmdaYear), `HMDA mortgage data for ${hmdaYear} is out`, 'https://ffiec.cfpb.gov/data-browser/', { severity: 'medium' }));
    }
  } catch { /* the next year is not published yet */ }
  state.hmdaYear = hmdaYear;
  return { events, note: `Summary of Deposits through ${state.sodYear}; HMDA through ${state.hmdaYear}` };
}

/* ---- The run --------------------------------------------------------------- */

function verdict(events, tripwires) {
  const high = events.filter((e) => e.severity === 'high');
  const crossed = tripwires.filter((t) => t.crossed);
  const periodic = events.filter((e) => ['sec_10k', 'sec_10q', 'callreport_quarter', 'sod_year', 'hmda_year'].includes(e.topic));
  if (high.length || crossed.length) {
    const why = [];
    if (high.length) why.push(`${high.length} serious item${high.length > 1 ? 's' : ''} to read`);
    if (crossed.length) why.push(`${crossed.length} tripwire${crossed.length > 1 ? 's' : ''} crossed`);
    return { status: 'REVISIT', why: `${why.join(' and ')}. A finding may need to change.` };
  }
  if (periodic.length) return { status: 'REVIEW', why: 'New periodic data has arrived. No tripwire is crossed, so no conclusion is expected to change, but the figures it touches are now out of date.' };
  if (events.length) return { status: 'NO CHANGE EXPECTED', why: 'Only routine items since the report was written.' };
  return { status: 'NO CHANGE', why: 'Nothing new in any source since the report was written.' };
}

async function main() {
  const prev = existsSync(OUT) ? JSON.parse(await readFile(OUT, 'utf8')) : {};
  const state = prev.state || {};
  const streams = [];
  const fresh = [];
  let series = prev.series, tripwires = prev.tripwires || [], complaints = prev.complaints ?? null;

  const jobs = [
    ['fdic', 'FDIC Call Reports', () => fdic(state)],
    ['sec', 'SEC EDGAR filings', () => sec()],
    ['fed', 'Federal Reserve press releases', () => fed()],
    ['fedreg', 'Federal Register', () => fedreg()],
    ['cfpb', 'CFPB actions and complaints', () => cfpb(state)],
    ['annual', 'Annual deposit and mortgage data', () => annual(state)],
  ];
  for (const [id, name, job] of jobs) {
    try {
      const r = await job();
      fresh.push(...r.events);
      if (r.series) { series = r.series; tripwires = r.tripwires; }
      if (r.complaints != null) complaints = r.complaints;
      streams.push({ id, name, ok: !r.skipped, note: r.note });
    } catch (err) {
      streams.push({ id, name, ok: false, note: `failed: ${err.message}` });
    }
  }

  // Keep every event ever seen; add the new ones.
  const seen = new Map((prev.events || []).map((e) => [e.key, e]));
  const added = fresh.filter((e) => !seen.has(e.key)).map((e) => ({ ...e, found: today }));
  for (const e of added) seen.set(e.key, e);
  const events = [...seen.values()].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const v = verdict(events, tripwires);
  const run = { at: new Date().toISOString(), status: v.status, added: added.length, failed: streams.filter((s) => !s.ok).map((s) => s.id) };
  const out = {
    about: 'Written by tools/usb-monitor.mjs. Do not edit by hand.',
    study: 'U.S. Bancorp: how the institution works, and what it is in the Twin Cities',
    baseline: BASELINE,
    checked: run.at,
    verdict: v,
    streams,
    tripwires,
    complaints,
    peers: PEERS.map((p) => p.name),
    series,
    events,
    runs: [run, ...(prev.runs || [])].slice(0, 120),
    state,
  };
  if (DRY) {
    console.log(JSON.stringify({ verdict: v, streams, tripwires, added: added.map((e) => `${e.date} ${e.title}`) }, null, 2));
    return;
  }
  await writeFile(OUT, `${JSON.stringify(out)}\n`);
  console.log(`${v.status}: ${v.why}`);
  for (const s of streams) console.log(`  ${s.ok ? 'ok  ' : 'FAIL'} ${s.name}: ${s.note}`);
  for (const e of added) console.log(`  new  ${e.date} ${e.title}`);
}

await main();
