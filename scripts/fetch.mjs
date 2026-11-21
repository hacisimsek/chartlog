// Fetch Apple App Store top charts for one UTC day into data/raw, data/ratings and data/apps.json (see docs/DATA.md).
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

// free/paid: Apple's RSS v2 apps feed (it has no games). gfree/gpaid: games, from the legacy iTunes RSS
// filtered to genre 6014 (measured 2026-11-21: all 330 charts on the first try, ~1 s, no hangs).
export const KINDS = { free: 'top-free', paid: 'top-paid', gfree: 'topfreeapplications', gpaid: 'toppaidapplications' };
const FEEDS = { apps: ['free', 'paid'], games: ['gfree', 'gpaid'] };
const DELAYS = [500, 1000, 2000, 3000, 5000];
// Normal responses take 1-3 s, but ~35-40% of requests hang at random (measured 2026-11-21,
// independent of concurrency), so fail fast and retry: 6 attempts leave ~0.4% failing per chart.
const TIMEOUT = 5000;

export const feedUrl = (cc, kind) => (kind.startsWith('g')
  ? `https://itunes.apple.com/${cc}/rss/${KINDS[kind]}/limit=100/genre=6014/json`
  : `https://rss.marketingtools.apple.com/api/v2/${cc}/apps/${KINDS[kind]}/100/apps.json`);

// Legacy iTunes RSS entry -> the v2 row shape the rest of this file uses. `entry` is a single object
// (not an array) when the chart has one row.
const legacyRow = (e) => ({
  id: e?.id?.attributes?.['im:id'],
  name: e?.['im:name']?.label,
  artistName: e?.['im:artist']?.label,
  artworkUrl100: e?.['im:image']?.at?.(-1)?.label,
  genres: [{ genreId: e?.category?.attributes?.['im:id'] }],
});

// Returns feed rows, or throws with the reason the response is not valid.
export function parseFeed(status, text) {
  if (status !== 200) throw new Error(`HTTP ${status}`);
  const feed = JSON.parse(text)?.feed;
  const entry = feed?.entry;
  const rows = feed?.results ?? (entry && (Array.isArray(entry) ? entry : [entry]).map(legacyRow));
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
export function planCharts(countries, existing, force, kinds = Object.keys(KINDS)) {
  const all = countries.flatMap((cc) => kinds.map((kind) => `${cc}/${kind}`));
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
      let g = genreId(row.genres?.[0]?.genreId);
      if (g === '6014' && /^70\d\d$/.test(old?.g ?? '')) g = old.g; // keep the game subgenre the lookup found
      if (done.has(id) || (old && !fullRun && !us)) {
        if (g && old && !realGenre(old.g)) old.g = g; // kept row has no genre: take the next one seen
        continue;
      }
      done.add(id);
      // ...old keeps the lookup's rating fields (r/rc/rd) until today's lookup refreshes them.
      apps[id] = { ...old, n: row.name, a: row.artistName, i: row.artworkUrl100, g: g || genreId(old?.g) };
    }
  }
  return apps;
}

// A numeric genreId, or '' (older data stored localized names, which count as missing). '0' = lookup found none.
const genreId = (g) => (/^\d+$/.test(g ?? '') ? g : '');
// '0' only means "the US lookup found nothing"; a genre from any feed row replaces it.
const realGenre = (g) => (genreId(g) && g !== '0' ? g : '');

// Looked up now and no US rating: old values would otherwise survive via updateApps' ...old forever.
const dropRatings = (app) => { delete app.r; delete app.rc; delete app.rd; };

export const lookupUrl = (ids) => `https://itunes.apple.com/lookup?country=us&id=${ids.join(',')}`;

// One iTunes Lookup pass (US store) for genres the feed left empty (~10% of rows, often the biggest apps)
// and for ratings of every app in today's charts. Apple allows ~20 calls/min: batches of 150 ids, 3.5 s
// apart, at most 90 calls a run; whatever is left waits for the next run of the day.
// chartIds: ids in the merged day's charts. ratings: that day's ratings file (id -> rc, or null when
// the lookup had no rating for it), mutated; ids already in it are not looked up again that day. Ids the lookup does not return get g='0' if g is missing.
// shortcut: a batch that keeps failing (e.g. one bad id) is retried every run; split batches if that shows up.
export async function lookupApps(apps, chartIds, ratings, { fetch = globalThis.fetch, sleep, maxCalls = 90, batch = 150 } = {}) {
  const inCharts = new Set(chartIds);
  const ids = [...new Set([
    ...[...inCharts].filter((id) => apps[id] && !(id in ratings)),
    ...Object.keys(apps).filter((id) => !genreId(apps[id].g)),
  ])];
  let found = 0, calls = 0, errors = 0;
  for (let i = 0; i < ids.length && calls < maxCalls && errors < 3; i += batch) {
    if (calls++) await sleep(3500);
    const chunk = ids.slice(i, i + batch);
    try {
      const res = await fetch(lookupUrl(chunk), { signal: AbortSignal.timeout(15000) });
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      const byId = new Map(JSON.parse(await res.text()).results.map((r) => [String(r.trackId), r]));
      for (const id of chunk) {
        const app = apps[id], r = byId.get(id);
        if (!r) {
          if (!genreId(app.g)) app.g = '0';
          if (inCharts.has(id)) ratings[id] = null; // not in the US store: don't ask again today
          dropRatings(app);
          continue;
        }
        found++;
        const g = String(r.primaryGenreId ?? '');
        // Games: store the first subgenre (7001 Action … 7019 Word) instead of the plain 6014 "Games".
        const sub = (r.genreIds || []).find((x) => /^70\d\d$/.test(x));
        if (sub) app.g = sub;
        else if (!realGenre(app.g)) app.g = /^\d+$/.test(g) ? g : '0';
        if (!Number.isInteger(r.userRatingCount)) { if (inCharts.has(id)) ratings[id] = null; dropRatings(app); continue; }
        app.rc = ratings[id] = r.userRatingCount;
        if (app.rc > 0) app.r = Math.round(r.averageUserRating * 10) / 10;
        else delete app.r;
        if (r.releaseDate) app.rd = r.releaseDate.slice(0, 10);
      }
    } catch {
      errors++;
    }
  }
  return { ids: ids.length, found, calls, errors };
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
  date, countries, dataDir, concurrency = 8, force = false, kinds = Object.keys(KINDS),
  fetch = globalThis.fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  now = () => new Date(), log = console.log, logErr = console.error,
}) {
  const start = now();
  const rawFile = join(dataDir, 'raw', date.slice(0, 4), `${date}.json`);
  const appsFile = join(dataDir, 'apps.json');
  const ratingsFile = join(dataDir, 'ratings', date.slice(0, 4), `${date}.json`);
  const existing = await readJson(rawFile);
  const plan = planCharts(countries, existing, force, kinds);
  // Lookups the first pass left (call cap, errors) are retried by a later pass even when no chart is.
  const lookup = async (raw, apps) => {
    const ratings = (await readJson(ratingsFile)) || {};
    const chartIds = new Set(Object.values(raw?.charts || {}).flatMap((c) => Object.values(c).flat()));
    const stats = await lookupApps(apps, chartIds, ratings, { fetch, sleep });
    return { ratings, stats, line: `lookup: ${stats.found}/${stats.ids} found, ${stats.calls} calls, ${stats.errors} errors` };
  };
  if (plan.length === 0) {
    const apps = (await readJson(appsFile)) || {};
    const { ratings, stats, line } = await lookup(existing, apps);
    if (!stats.calls) {
      log('nothing to do');
      return 0;
    }
    await writeJson(appsFile, apps);
    if (Object.keys(ratings).length) await writeJson(ratingsFile, ratings);
    log(`${date} charts complete | ${line}`);
    return 0;
  }

  const results = {};
  await pool(plan, concurrency, async (key) => {
    const [cc, kind] = key.split('/');
    results[key] = await fetchChart(cc, kind, { fetch, sleep });
  });

  // The 90% rule is applied per feed (apps: v2 feed, games: legacy iTunes RSS), so one feed failing
  // does not throw away the other's day. It counts the whole day after merging, not this run's plan:
  // a re-run that only retries a few still-failing charts must not discard a 99% complete feed.
  // A --force run must also refresh 90% of the feed itself, or old charts would pass unrefreshed.
  const bad = [];
  const parts = [];
  for (const [feed, feedKinds] of Object.entries(FEEDS)) {
    const fk = kinds.filter((k) => feedKinds.includes(k));
    if (!fk.length) continue;
    const mine = plan.filter((key) => fk.includes(key.split('/')[1]));
    const ok = mine.filter((key) => results[key]).length;
    const day = mergeRaw(existing, date, '', Object.fromEntries(mine.map((key) => [key, results[key]])));
    const all = planCharts(countries, null, true, fk);
    const have = all.filter((key) => { const [cc, kind] = key.split('/'); return day.charts[cc]?.[kind]; }).length;
    const below = have < all.length * 0.9 || (force && mine.length && ok < mine.length * 0.9);
    parts.push(`${feed} ok ${ok}/${mine.length} day ${have}/${all.length}${below ? ' BELOW 90%, not saved' : ''}`);
    if (below) {
      bad.push(feed);
      for (const key of mine) results[key] = null; // keep the saved value (if any); listed in failed
    }
  }
  const failedNow = plan.filter((key) => !results[key]);
  const summary = `${date} ${parts.join(' | ')} | failed: ${failedNow.length > 12 ? `${failedNow.length} charts` : failedNow.join(',') || '-'} ${((now() - start) / 1000).toFixed(1)}s`;
  if (bad.length === parts.length) {
    logErr(`${summary} (nothing written)`);
    return 1;
  }
  const raw = mergeRaw(existing, date, now().toISOString(), results);

  const apps = updateApps((await readJson(appsFile)) || {}, results, !existing || force);
  const { ratings, line } = await lookup(raw, apps);
  // apps and ratings first: if the raw write fails after them, a re-run still refetches those charts.
  await writeJson(appsFile, apps);
  if (Object.keys(ratings).length) await writeJson(ratingsFile, ratings);
  await writeJson(rawFile, raw);
  // Exit 1 when a feed was below 90%: the workflow still commits and deploys what was saved, then fails the run.
  (bad.length ? logErr : log)(`${summary} | ${line}`);
  return bad.length ? 1 : 0;
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
