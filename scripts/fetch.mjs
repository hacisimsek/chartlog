// Fetch Apple App Store top charts for one UTC day into data/raw and data/apps.json (see docs/DATA.md).
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

export const KINDS = { free: 'top-free', paid: 'top-paid' };
const DELAYS = [500, 1000, 2000, 3000, 5000];
// Normal responses take 1-3 s, but ~35-40% of requests hang at random (measured 2026-11-21,
// independent of concurrency), so fail fast and retry: 6 attempts leave ~0.4% failing per chart.
const TIMEOUT = 5000;

export const feedUrl = (cc, kind) =>
  `https://rss.marketingtools.apple.com/api/v2/${cc}/apps/${KINDS[kind]}/100/apps.json`;

// Returns feed rows, or throws with the reason the response is not valid.
export function parseFeed(status, text) {
  if (status !== 200) throw new Error(`HTTP ${status}`);
  const rows = JSON.parse(text)?.feed?.results;
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 100) throw new Error('bad results length');
  if (!rows.every((r) => /^\d+$/.test(r?.id))) throw new Error('bad id');
  return rows;
}

// Returns rows, or null after all attempts failed.
export async function fetchChart(cc, kind, { fetch = globalThis.fetch, sleep } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(feedUrl(cc, kind), { signal: AbortSignal.timeout(TIMEOUT) });
      return parseFeed(res.status, await res.text());
    } catch {
      if (attempt >= DELAYS.length) return null;
      await sleep(DELAYS[attempt]);
    }
  }
}

// Charts ("cc/kind") to fetch this run.
export function planCharts(countries, existing, force) {
  const all = countries.flatMap((cc) => Object.keys(KINDS).map((kind) => `${cc}/${kind}`));
  if (!existing || force) return all;
  const has = (key) => { const [cc, kind] = key.split('/'); return Boolean(existing.charts?.[cc]?.[kind]); };
  return [...new Set([...(existing.failed || []), ...all.filter((key) => !has(key))])];
}

// results: { "cc/kind": rows | null }. New successes replace, failures keep the old value.
export function mergeRaw(existing, date, fetchedAt, results) {
  const charts = structuredClone(existing?.charts || {});
  for (const [key, rows] of Object.entries(results)) {
    if (!rows) continue;
    const [cc, kind] = key.split('/');
    (charts[cc] ||= {})[kind] = rows.map((r) => String(r.id));
  }
  const sorted = Object.fromEntries(Object.keys(charts).sort().map((cc) => [cc, charts[cc]]));
  const failed = [...new Set([...(existing?.failed || []), ...Object.keys(results)])]
    .filter((key) => { const [cc, kind] = key.split('/'); return !sorted[cc]?.[kind]; })
    .sort();
  return { date, fetchedAt, charts: sorted, failed };
}

// Mutates and returns apps. Rows are visited us first, then alphabetical cc; the first row per app wins.
// fullRun = every requested chart was fetched now. On a partial re-run we cannot tell where existing
// values came from, so only us rows may overwrite an existing entry (us > others).
export function updateApps(apps, results, fullRun) {
  const keys = Object.keys(results).filter((k) => results[k])
    .sort((a, b) => b.startsWith('us/') - a.startsWith('us/') || (a < b ? -1 : a > b ? 1 : 0));
  const done = new Set();
  for (const key of keys) {
    const us = key.startsWith('us/');
    for (const row of results[key]) {
      const id = String(row.id);
      const old = apps[id];
      // Genre names are localized per storefront, so store the numeric genreId; the site names it.
      const g = genreId(row.genres?.[0]?.genreId);
      if (done.has(id) || (old && !fullRun && !us)) {
        if (g && old && !realGenre(old.g)) old.g = g; // kept row has no genre: take the next one seen
        continue;
      }
      done.add(id);
      apps[id] = { n: row.name, a: row.artistName, i: row.artworkUrl100, g: g || genreId(old?.g) };
    }
  }
  return apps;
}

// A numeric genreId, or '' (older data stored localized names, which count as missing). '0' = lookup found none.
const genreId = (g) => (/^\d+$/.test(g ?? '') ? g : '');
// '0' only means "the US lookup found nothing"; a genre from any feed row replaces it.
const realGenre = (g) => (genreId(g) && g !== '0' ? g : '');

export const lookupUrl = (ids) => `https://itunes.apple.com/lookup?country=us&id=${ids.join(',')}`;

// The feed leaves genres empty for ~10% of rows (often the biggest apps), so ask the iTunes Lookup API
// for the rest. Apple allows ~20 calls/min: batches of 150 ids, 3.5 s apart, at most 30 calls a run;
// whatever is left waits for the next run. Ids the lookup does not return (not in the US store) get '0'.
// shortcut: a batch that keeps failing (e.g. one bad id) is retried every run; split batches if that shows up.
export async function fillGenres(apps, { fetch = globalThis.fetch, sleep, maxCalls = 30, batch = 150 } = {}) {
  const missing = Object.keys(apps).filter((id) => !genreId(apps[id].g));
  let filled = 0, calls = 0, errors = 0;
  for (let i = 0; i < missing.length && calls < maxCalls && errors < 3; i += batch) {
    if (calls++) await sleep(3500);
    const ids = missing.slice(i, i + batch);
    try {
      const res = await fetch(lookupUrl(ids), { signal: AbortSignal.timeout(15000) });
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      const found = new Map(JSON.parse(await res.text()).results
        .filter((r) => /^\d+$/.test(String(r.primaryGenreId ?? '')))
        .map((r) => [String(r.trackId), String(r.primaryGenreId)]));
      for (const id of ids) {
        apps[id].g = found.get(id) || '0';
        if (found.has(id)) filled++;
      }
    } catch {
      errors++;
    }
  }
  return { missing: missing.length, filled, calls, errors };
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

async function writeJson(file, value) {
  await mkdir(join(file, '..'), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value));
  await rename(tmp, file);
}

async function pool(items, limit, fn) {
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; await fn(items[i]); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

// Returns the process exit code.
export async function run({
  date, countries, dataDir, concurrency = 8, force = false,
  fetch = globalThis.fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  now = () => new Date(), log = console.log, logErr = console.error,
}) {
  const start = now();
  const rawFile = join(dataDir, 'raw', date.slice(0, 4), `${date}.json`);
  const appsFile = join(dataDir, 'apps.json');
  const existing = await readJson(rawFile);
  const plan = planCharts(countries, existing, force);
  if (plan.length === 0) {
    log('nothing to do');
    return 0;
  }

  const results = {};
  await pool(plan, concurrency, async (key) => {
    const [cc, kind] = key.split('/');
    results[key] = await fetchChart(cc, kind, { fetch, sleep });
  });

  const ok = plan.filter((key) => results[key]).length;
  const failedNow = plan.filter((key) => !results[key]);
  const raw = mergeRaw(existing, date, now().toISOString(), results);
  // The 90% rule applies to the whole day after merging, not to this run's plan: a re-run that only
  // retries a few still-failing charts must not throw away a day that is already 99% complete.
  const all = planCharts(countries, null, true);
  const have = all.filter((key) => { const [cc, kind] = key.split('/'); return raw.charts[cc]?.[kind]; }).length;
  const summary = `${date} ok ${ok}/${plan.length} failed: ${failedNow.join(',') || '-'} day ${have}/${all.length} ${((now() - start) / 1000).toFixed(1)}s`;
  // A --force run must also refresh 90% itself, or old charts would pass the day rule unrefreshed.
  if (have < all.length * 0.9 || (force && ok < plan.length * 0.9)) {
    logErr(`${summary} (below 90%, nothing written)`);
    return 1;
  }

  const apps = updateApps((await readJson(appsFile)) || {}, results, !existing || force);
  const genres = await fillGenres(apps, { fetch, sleep });
  // apps first: if the raw write fails after it, a re-run still refetches those charts.
  await writeJson(appsFile, apps);
  await writeJson(rawFile, raw);
  log(`${summary} | genres: ${genres.filled}/${genres.missing} filled, ${genres.calls} lookups, ${genres.errors} errors`);
  return 0;
}

async function main() {
  const { values } = parseArgs({
    options: {
      date: { type: 'string', default: new Date().toISOString().slice(0, 10) },
      countries: { type: 'string' },
      data: { type: 'string', default: 'data' },
      concurrency: { type: 'string', default: '8' },
      force: { type: 'boolean', default: false },
    },
  });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date)) throw new Error(`bad --date ${values.date}`);
  const countries = values.countries
    ? values.countries.split(',').map((c) => c.trim().toLowerCase()).filter(Boolean)
    : JSON.parse(await readFile(new URL('../countries.json', import.meta.url), 'utf8'));
  const concurrency = Number(values.concurrency);
  if (!(concurrency >= 1)) throw new Error(`bad --concurrency ${values.concurrency}`);
  process.exitCode = await run({ date: values.date, countries, dataDir: values.data, concurrency, force: values.force });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exitCode = 1; });
}
