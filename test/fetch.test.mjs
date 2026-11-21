import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, readdir, writeFile, mkdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseFeed, fetchChart, planCharts, mergeRaw, updateApps, fillGenres, lookupUrl, run } from '../scripts/fetch.mjs';

const fixture = (name) => readFileSync(new URL(`fixtures/fetch/${name}`, import.meta.url), 'utf8');
const TR = fixture('tr-free.json');
const US = fixture('us-free.json');
const rows = (body) => JSON.parse(body).feed.results;
const feedOf = (n) => JSON.stringify({ feed: { results: Array.from({ length: n }, (_, i) => ({ ...rows(TR)[0], id: String(5000 + i) })) } });

const ok = (body) => ({ status: 200, body });
const FAIL = { status: 500, body: 'error' };

// routes: { "cc/kind": response | [responses in order, last one repeats] }; unknown charts get 500.
function mockFetch(routes) {
  const calls = [];
  const fetch = async (url) => {
    const [, cc, kind] = url.match(/v2\/(\w+)\/apps\/top-(free|paid)\//);
    const key = `${cc}/${kind}`;
    calls.push(key);
    let r = routes[key] ?? FAIL;
    if (Array.isArray(r)) r = r.length > 1 ? r.shift() : r[0];
    return { status: r.status, text: async () => r.body };
  };
  return { fetch, calls };
}

const base = { date: '2026-11-22', sleep: async () => {}, now: () => new Date('2026-11-22T03:00:00Z'), log: () => {}, logErr: () => {} };
const tmp = () => mkdtemp(join(tmpdir(), 'chartlog-fetch-'));
const readJson = async (f) => JSON.parse(await readFile(f, 'utf8'));
const rawPath = (dir) => join(dir, 'raw', '2026', '2026-11-22.json');

async function listFiles(dir) {
  return (await readdir(dir, { recursive: true, withFileTypes: true })).filter((d) => d.isFile()).map((d) => d.name);
}

test('parseFeed rejects bad responses', () => {
  assert.throws(() => parseFeed(500, TR), /HTTP 500/);
  assert.throws(() => parseFeed(200, '<html>oops</html>'));
  assert.throws(() => parseFeed(200, '{"feed":{"results":[]}}'), /length/);
  assert.throws(() => parseFeed(200, '{"feed":{}}'), /length/);
  assert.throws(() => parseFeed(200, feedOf(101)), /length/);
  const bad = JSON.parse(TR);
  bad.feed.results[1].id = 'id12';
  assert.throws(() => parseFeed(200, JSON.stringify(bad)), /bad id/);
});

test('parseFeed accepts a small storefront with 37 rows', () => {
  assert.equal(parseFeed(200, feedOf(37)).length, 37);
});

test('fetchChart retries with backoff, then succeeds', async () => {
  const { fetch, calls } = mockFetch({ 'tr/free': [FAIL, ok('not json'), ok(TR)] });
  const slept = [];
  const result = await fetchChart('tr', 'free', { fetch, sleep: async (ms) => slept.push(ms) });
  assert.equal(result.length, 3);
  assert.equal(calls.length, 3);
  assert.deepEqual(slept, [500, 1000]);
});

test('fetchChart gives up after 6 attempts', async () => {
  const { fetch, calls } = mockFetch({});
  assert.equal(await fetchChart('tr', 'free', { fetch, sleep: async () => {} }), null);
  assert.equal(calls.length, 6);
});

test('below 90% success writes nothing and exits 1', async () => {
  const dir = await tmp();
  const { fetch } = mockFetch({ 'tr/free': ok(TR) });
  assert.equal(await run({ ...base, countries: ['tr', 'us'], dataDir: dir, fetch }), 1);
  assert.deepEqual(await listFiles(dir), []);
});

test('run writes raw + apps, re-run fetches only failed/missing charts, then nothing to do', async () => {
  const dir = await tmp();
  const countries = ['de', 'fr', 'gb', 'tr', 'us'];
  const routes = {};
  for (const cc of countries) for (const kind of ['free', 'paid']) routes[`${cc}/${kind}`] = ok(TR);
  routes['us/free'] = ok(US);
  delete routes['gb/paid']; // 9/10 = exactly 90%: still written

  const first = mockFetch(routes);
  assert.equal(await run({ ...base, countries, dataDir: dir, fetch: first.fetch }), 0);
  let raw = await readJson(rawPath(dir));
  assert.equal(raw.date, '2026-11-22');
  assert.equal(raw.fetchedAt, '2026-11-22T03:00:00.000Z');
  assert.deepEqual(raw.failed, ['gb/paid']);
  assert.deepEqual(raw.charts.tr.free, ['1001', '1002', '1003']);
  assert.deepEqual(Object.keys(raw.charts), countries);
  assert.equal(raw.charts.gb.paid, undefined);
  const apps = await readJson(join(dir, 'apps.json'));
  assert.deepEqual(apps['1001'], { n: 'Food US', a: 'Food Inc', i: 'https://is1-ssl.mzstatic.com/image/thumb/a/100x100bb.png', g: '6023' });
  assert.equal(apps['1002'].n, 'Game US');
  assert.equal(apps['1002'].g, '6014'); // us row has no genre, a later row fills it
  assert.equal(apps['1003'].g, '');
  assert.ok(!(await listFiles(dir)).some((f) => f.endsWith('.tmp')));

  // Re-run asks for one more country: only gb/paid (failed) and it/* (missing) are fetched.
  const second = mockFetch({ 'gb/paid': ok(feedOf(37)), 'it/free': ok(TR), 'it/paid': ok(TR) });
  assert.equal(await run({ ...base, countries: [...countries, 'it'], dataDir: dir, fetch: second.fetch }), 0);
  assert.deepEqual(second.calls.toSorted(), ['gb/paid', 'it/free', 'it/paid']);
  raw = await readJson(rawPath(dir));
  assert.deepEqual(raw.failed, []);
  assert.equal(raw.charts.gb.paid.length, 37);
  assert.deepEqual(raw.charts.us.free, ['1001', '1002']);
  // Partial re-run from non-us charts must not overwrite us metadata.
  assert.equal((await readJson(join(dir, 'apps.json')))['1001'].n, 'Food US');

  const before = (await stat(rawPath(dir))).mtimeMs;
  const third = mockFetch({});
  const logged = [];
  assert.equal(await run({ ...base, countries: [...countries, 'it'], dataDir: dir, fetch: third.fetch, log: (s) => logged.push(s) }), 0);
  assert.deepEqual(third.calls, []);
  assert.deepEqual(logged, ['nothing to do']);
  assert.equal((await stat(rawPath(dir))).mtimeMs, before);
});

test('--force refetches all; a chart failing now keeps its old value', async () => {
  const dir = await tmp();
  await mkdir(join(dir, 'raw', '2026'), { recursive: true });
  const old = { date: '2026-11-22', fetchedAt: 'x', charts: { de: { free: ['9'] } }, failed: ['zz/paid'] };
  await writeFile(rawPath(dir), JSON.stringify(old));
  const countries = ['de', 'fr', 'gb', 'tr', 'us'];
  const routes = {};
  for (const cc of countries) for (const kind of ['free', 'paid']) routes[`${cc}/${kind}`] = ok(TR);
  delete routes['de/free'];
  const { fetch, calls } = mockFetch(routes);
  assert.equal(await run({ ...base, countries, dataDir: dir, fetch, force: true }), 0);
  assert.equal(new Set(calls).size, 10);
  const raw = await readJson(rawPath(dir));
  assert.deepEqual(raw.charts.de.free, ['9']);
  assert.deepEqual(raw.failed, ['zz/paid']);
});

test('small storefront with 37 rows is stored', async () => {
  const dir = await tmp();
  const { fetch } = mockFetch({ 'sb/free': ok(feedOf(37)), 'sb/paid': ok(feedOf(37)) });
  assert.equal(await run({ ...base, countries: ['sb'], dataDir: dir, fetch }), 0);
  assert.equal((await readJson(rawPath(dir))).charts.sb.free.length, 37);
});

test('planCharts', () => {
  assert.deepEqual(planCharts(['tr'], null, false), ['tr/free', 'tr/paid']);
  const existing = { charts: { tr: { free: ['1'] } }, failed: ['tr/paid', 'xx/free'] };
  assert.deepEqual(planCharts(['tr', 'us'], existing, false), ['tr/paid', 'xx/free', 'us/free', 'us/paid']);
  assert.deepEqual(planCharts(['tr'], existing, true), ['tr/free', 'tr/paid']);
  assert.deepEqual(planCharts(['tr'], { charts: { tr: { free: [], paid: [] } }, failed: [] }, false).length, 0);
});

test('mergeRaw: successes replace, failures keep old, failed lists charts still without data', () => {
  const old = { charts: { tr: { free: ['1'], paid: ['2'] } }, failed: ['us/free'] };
  const merged = mergeRaw(old, 'd', 't', { 'tr/free': rows(TR), 'tr/paid': null, 'us/free': null, 'us/paid': rows(US) });
  assert.deepEqual(merged.charts, { tr: { free: ['1001', '1002', '1003'], paid: ['2'] }, us: { paid: ['1001', '1002'] } });
  assert.deepEqual(merged.failed, ['us/free']);
  assert.deepEqual(old.charts.tr.free, ['1']); // input not mutated
});

test('updateApps: us beats others, genre kept when the new row has none', () => {
  const apps = { 1002: { n: 'Old', a: 'Old', i: 'old', g: 'Games' } }; // old data: localized name = missing
  updateApps(apps, { 'tr/free': rows(TR), 'us/free': rows(US) }, true);
  assert.equal(apps['1001'].n, 'Food US');
  assert.equal(apps['1002'].n, 'Game US');
  assert.equal(apps['1002'].g, '6014');
  assert.equal(apps['1003'].n, 'Arac');

  // Partial re-run: tr row may add new apps but not overwrite existing ones.
  const partial = { 1001: { n: 'Food US', a: 'Food Inc', i: 'x', g: '' } };
  updateApps(partial, { 'tr/free': rows(TR) }, false);
  assert.equal(partial['1001'].n, 'Food US');
  assert.equal(partial['1001'].g, '6023'); // empty genre still gets filled
  assert.equal(partial['1002'].n, 'Oyun TR');
});

test('fillGenres: batches lookups, marks ids the lookup does not return as 0, keeps ids on errors', async () => {
  const apps = { 1: { g: '' }, 2: { g: 'Juegos' }, 3: { g: '6007' }, 4: { g: '' }, 5: { g: '' } };
  const urls = [];
  const fetch = async (url) => {
    urls.push(url);
    if (urls.length === 2) return { status: 503, text: async () => '' };
    return { status: 200, text: async () => JSON.stringify({ results: [{ trackId: 1, primaryGenreId: 6014 }, { trackId: 2, primaryGenreId: 6005 }] }) };
  };
  const slept = [];
  const r = await fillGenres(apps, { fetch, sleep: async (ms) => slept.push(ms), batch: 2 });
  assert.deepEqual(urls, [lookupUrl(['1', '2']), lookupUrl(['4', '5'])]);
  assert.deepEqual(slept, [3500]);
  assert.deepEqual(r, { missing: 4, filled: 2, calls: 2, errors: 1 });
  assert.deepEqual([apps[1].g, apps[2].g, apps[3].g, apps[4].g, apps[5].g], ['6014', '6005', '6007', '', '']);
  const none = { 9: { g: '' } };
  await fillGenres(none, { fetch: async () => ({ status: 200, text: async () => '{"results":[]}' }), sleep: async () => {} });
  assert.equal(none[9].g, '0');
});

test('re-run that only retries a still-failing chart keeps the day (90% rule is on the merged day)', async () => {
  const dir = await tmp();
  const countries = ['de', 'fr', 'gb', 'tr', 'us'];
  const routes = {};
  for (const cc of countries) for (const kind of ['free', 'paid']) routes[`${cc}/${kind}`] = ok(TR);
  delete routes['gb/paid'];
  assert.equal(await run({ ...base, countries, dataDir: dir, fetch: mockFetch(routes).fetch }), 0);
  // Second pass plans only gb/paid, which fails again: 0/1 this run, but the day is still 9/10.
  const second = mockFetch(routes);
  assert.equal(await run({ ...base, countries, dataDir: dir, fetch: second.fetch }), 0);
  assert.deepEqual(second.calls.filter((c) => !c.startsWith('lookup')), Array(6).fill('gb/paid'));
  const raw = await readJson(rawPath(dir));
  assert.deepEqual(raw.failed, ['gb/paid']);
  assert.equal(Object.keys(raw.charts).length, 5);
});

test('updateApps: a feed genre replaces the "0" marker from an earlier lookup', () => {
  const apps = { 1001: { n: 'Food US', a: 'Food Inc', i: 'x', g: '0' } };
  updateApps(apps, { 'tr/free': rows(TR) }, false); // partial run, non-us row
  assert.equal(apps['1001'].g, '6023');
  const full = { 1002: { n: 'Old', a: 'Old', i: 'x', g: '0' } };
  updateApps(full, { 'us/free': rows(US), 'tr/free': rows(TR) }, true); // us row for 1002 has no genre, tr row does
  assert.equal(full['1002'].g, '6014');
});

test('--force over a complete day still needs 90% fresh charts, else writes nothing', async () => {
  const dir = await tmp();
  const countries = ['de', 'fr', 'gb', 'tr', 'us'];
  const routes = {};
  for (const cc of countries) for (const kind of ['free', 'paid']) routes[`${cc}/${kind}`] = ok(TR);
  assert.equal(await run({ ...base, countries, dataDir: dir, fetch: mockFetch(routes).fetch }), 0);
  const before = await readFile(rawPath(dir), 'utf8');
  const degraded = { 'tr/free': ok(TR), 'us/free': ok(US) }; // 2/10 fresh
  assert.equal(await run({ ...base, countries, dataDir: dir, force: true, fetch: mockFetch(degraded).fetch, now: () => new Date('2026-11-22T09:00:00Z') }), 1);
  assert.equal(await readFile(rawPath(dir), 'utf8'), before);
});
