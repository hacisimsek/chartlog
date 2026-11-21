import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, readdir, writeFile, mkdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { feedUrl, parseFeed, fetchChart, planCharts, mergeRaw, updateApps, lookupApps, lookupUrl, run } from '../scripts/fetch.mjs';

const fixture = (name) => readFileSync(new URL(`fixtures/fetch/${name}`, import.meta.url), 'utf8');
const TR = fixture('tr-free.json');
const US = fixture('us-free.json');
const rows = (body) => JSON.parse(body).feed.results;
const feedOf = (n) => JSON.stringify({ feed: { results: Array.from({ length: n }, (_, i) => ({ ...rows(TR)[0], id: String(5000 + i) })) } });

const ok = (body) => ({ status: 200, body });
const FAIL = { status: 500, body: 'error' };
const lookupBody = (results) => ok(JSON.stringify({ results }));
// Lookup that returns every requested id.
const echoLookup = (url) => lookupBody(url.split('id=')[1].split(',').map((id) => ({ trackId: Number(id), userRatingCount: 0 })));

// routes: { "cc/kind" | "lookup": response | (url) => response | [responses in order, last one repeats] }; unknown routes get 500.
function mockFetch(routes) {
  const calls = [];
  const fetch = async (url) => {
    const m = url.match(/v2\/(\w+)\/apps\/top-(free|paid)\//);
    const key = m ? `${m[1]}/${m[2]}` : 'lookup';
    calls.push(key);
    let r = routes[key] ?? FAIL;
    if (Array.isArray(r)) r = r.length > 1 ? r.shift() : r[0];
    if (typeof r === 'function') r = r(url);
    return { status: r.status, text: async () => r.body };
  };
  return { fetch, calls };
}

// Most run() tests cover the apps feeds only; game charts have their own tests below.
const base = { date: '2026-11-22', kinds: ['free', 'paid'], sleep: async () => {}, now: () => new Date('2026-11-22T03:00:00Z'), log: () => {}, logErr: () => {} };
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
  routes.lookup = echoLookup;

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
  assert.deepEqual(apps['1001'], { n: 'Food US', a: 'Food Inc', i: 'https://is1-ssl.mzstatic.com/image/thumb/a/100x100bb.png', g: '6023', rc: 0 });
  assert.equal(apps['1002'].n, 'Game US');
  assert.equal(apps['1002'].g, '6014'); // us row has no genre, a later row fills it
  assert.equal(apps['1003'].g, '0'); // no row has a genre and the lookup has none either
  assert.ok(!(await listFiles(dir)).some((f) => f.endsWith('.tmp')));

  // Re-run asks for one more country: only gb/paid (failed) and it/* (missing) are fetched.
  const second = mockFetch({ 'gb/paid': ok(feedOf(37)), 'it/free': ok(TR), 'it/paid': ok(TR), lookup: echoLookup });
  assert.equal(await run({ ...base, countries: [...countries, 'it'], dataDir: dir, fetch: second.fetch }), 0);
  assert.deepEqual(second.calls.toSorted(), ['gb/paid', 'it/free', 'it/paid', 'lookup']); // lookup: the 37 new ids only
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
  assert.equal(new Set(calls.filter((c) => c !== 'lookup')).size, 10);
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
  assert.deepEqual(planCharts(['tr'], null, false), ['tr/free', 'tr/paid', 'tr/gfree', 'tr/gpaid']);
  assert.deepEqual(planCharts(['tr'], null, false, ['free', 'paid']), ['tr/free', 'tr/paid']);
  const existing = { charts: { tr: { free: ['1'] } }, failed: ['tr/paid', 'xx/free'] };
  const K = ['free', 'paid'];
  assert.deepEqual(planCharts(['tr', 'us'], existing, false, K), ['tr/paid', 'xx/free', 'us/free', 'us/paid']);
  assert.deepEqual(planCharts(['tr'], existing, true, K), ['tr/free', 'tr/paid']);
  assert.deepEqual(planCharts(['tr'], { charts: { tr: { free: [], paid: [] } }, failed: [] }, false, K).length, 0);
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

const lookupFetch = (respond) => {
  const urls = [];
  const fetch = async (url) => {
    urls.push(url);
    const r = respond(url.split('id=')[1].split(','), urls.length);
    return { status: r.status, text: async () => r.body };
  };
  return { fetch, urls };
};
const nosleep = async () => {};

test('lookupApps: batches lookups, marks ids the lookup does not return as 0, keeps ids on errors', async () => {
  const apps = { 1: { g: '' }, 2: { g: 'Juegos' }, 3: { g: '6007' }, 4: { g: '' }, 5: { g: '' } };
  const { fetch, urls } = lookupFetch((ids, n) => (n === 2 ? FAIL : lookupBody([{ trackId: 1, primaryGenreId: 6014 }, { trackId: 2, primaryGenreId: 6005 }])));
  const slept = [];
  const r = await lookupApps(apps, new Set(), {}, { fetch, sleep: async (ms) => slept.push(ms), batch: 2 });
  assert.deepEqual(urls, [lookupUrl(['1', '2']), lookupUrl(['4', '5'])]);
  assert.deepEqual(slept, [3500]);
  assert.deepEqual(r, { ids: 4, found: 2, calls: 2, errors: 1 });
  assert.deepEqual([apps[1].g, apps[2].g, apps[3].g, apps[4].g, apps[5].g], ['6014', '6005', '6007', '', '']);
  const none = { 9: { g: '' } };
  await lookupApps(none, new Set(), {}, { fetch: async () => ({ status: 200, text: async () => '{"results":[]}' }), sleep: nosleep });
  assert.equal(none[9].g, '0');
});

test('lookupApps: rating fields, rc=0 drops r, ids not returned lose stale ratings', async () => {
  const apps = { 1: { g: '6014' }, 2: { g: '6005', r: 4.2, rc: 5 }, 3: { g: '6000', r: 3, rc: 9, rd: '2019-01-01' } };
  const ratings = {};
  const { fetch } = lookupFetch(() => lookupBody([
    { trackId: 1, primaryGenreId: 6000, averageUserRating: 4.66666, userRatingCount: 1234, releaseDate: '2023-05-18T07:00:00Z' },
    { trackId: 2, primaryGenreId: 6005, averageUserRating: 0, userRatingCount: 0, releaseDate: '2024-01-02T00:00:00Z' },
  ]));
  const r = await lookupApps(apps, new Set(['1', '2', '3']), ratings, { fetch, sleep: nosleep });
  assert.deepEqual(r, { ids: 3, found: 2, calls: 1, errors: 0 });
  assert.deepEqual(apps[1], { g: '6014', r: 4.7, rc: 1234, rd: '2023-05-18' }); // a real genre is not replaced
  assert.deepEqual(apps[2], { g: '6005', rc: 0, rd: '2024-01-02' });
  assert.deepEqual(apps[3], { g: '6000' }); // looked up, not in the US store: stale ratings dropped
  assert.deepEqual(ratings, { 1: 1234, 2: 0, 3: null }); // 3: not returned -> null, not asked again today
});

test('lookupApps: skips ids already in the ratings file; "0" genre is not re-looked-up but its rating is refreshed', async () => {
  const apps = { 1: { g: '6014' }, 2: { g: '0' }, 3: { g: '0' } };
  const { fetch, urls } = lookupFetch(() => lookupBody([{ trackId: 2, primaryGenreId: 6016, averageUserRating: 3.04, userRatingCount: 7 }]));
  await lookupApps(apps, new Set(['1', '2']), { 1: 50 }, { fetch, sleep: nosleep });
  assert.deepEqual(urls, [lookupUrl(['2'])]); // 1 already looked up today, 3 not in a chart and genre '0'
  assert.deepEqual(apps[2], { g: '6016', r: 3, rc: 7 });
});

test('lookupApps: at most maxCalls calls, stops after 3 failed calls', async () => {
  const apps = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i), { g: '' }]));
  const capped = lookupFetch(() => lookupBody([]));
  assert.equal((await lookupApps(apps, new Set(), {}, { fetch: capped.fetch, sleep: nosleep, batch: 1, maxCalls: 4 })).calls, 4);
  const failing = lookupFetch(() => FAIL);
  const r = await lookupApps(apps, new Set(), {}, { fetch: failing.fetch, sleep: nosleep, batch: 1 });
  assert.deepEqual(r, { ids: 6, found: 0, calls: 3, errors: 3 });
  const thrown = await lookupApps(apps, new Set(), {}, { fetch: async () => { throw new Error('timeout'); }, sleep: nosleep, batch: 1 });
  assert.equal(thrown.errors, 3);
});

test('run writes the day ratings file, merges it on re-run, and a later pass only looks up what is left', async () => {
  const dir = await tmp();
  const ratingsPath = join(dir, 'ratings', '2026', '2026-11-22.json');
  const countries = ['de', 'fr', 'gb', 'tr', 'us'];
  const routes = {};
  for (const cc of countries) for (const kind of ['free', 'paid']) routes[`${cc}/${kind}`] = ok(TR);
  routes['us/free'] = ok(US);
  delete routes['gb/paid'];
  // First pass: lookup returns only 1001; 1002 and 1003 are absent (not in the US store).
  routes.lookup = lookupBody([{ trackId: 1001, primaryGenreId: 6023, averageUserRating: 4.5, userRatingCount: 10, releaseDate: '2020-01-01T08:00:00Z' }]);
  const logged = [];
  const first = mockFetch(routes);
  assert.equal(await run({ ...base, countries, dataDir: dir, fetch: first.fetch, log: (s) => logged.push(s) }), 0);
  assert.match(logged[0], /\| lookup: 1\/3 found, 1 calls, 0 errors$/);
  // 1002 and 1003 were not returned: stored as null so no later pass today asks for them again.
  assert.deepEqual(await readJson(ratingsPath), { 1001: 10, 1002: null, 1003: null });
  let apps = await readJson(join(dir, 'apps.json'));
  assert.deepEqual(apps['1001'], { n: 'Food US', a: 'Food Inc', i: 'https://is1-ssl.mzstatic.com/image/thumb/a/100x100bb.png', g: '6023', r: 4.5, rc: 10, rd: '2020-01-01' });
  assert.equal(apps['1003'].g, '0');

  // Second pass retries gb/paid (new id 5000); only 5000 is looked up, and the file is merged.
  const second = mockFetch({ ...routes, 'gb/paid': ok(feedOf(1)), lookup: lookupBody([{ trackId: 5000, userRatingCount: 1, averageUserRating: 5 }]) });
  assert.equal(await run({ ...base, countries, dataDir: dir, fetch: second.fetch }), 0);
  assert.deepEqual(second.calls.filter((c) => c === 'lookup'), ['lookup']);
  assert.deepEqual(await readJson(ratingsPath), { 1001: 10, 1002: null, 1003: null, 5000: 1 });
  apps = await readJson(join(dir, 'apps.json'));
  assert.equal(apps['1001'].rc, 10);

  // Third pass: every chart fetched and every chart id answered today, so no call at all.
  const third = mockFetch({});
  logged.length = 0;
  assert.equal(await run({ ...base, countries, dataDir: dir, fetch: third.fetch, log: (s) => logged.push(s) }), 0);
  assert.deepEqual(third.calls, []);
  assert.deepEqual(logged, ['nothing to do']);
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

test('lookupApps: chart ids the lookup does not return are stored as null and not asked again', async () => {
  const apps = { 1: { g: '6007' }, 2: { g: '6007' } };
  const ratings = {};
  const urls = [];
  const fetch = async (url) => { urls.push(url); return { status: 200, text: async () => JSON.stringify({ results: [{ trackId: 1, primaryGenreId: 6007, userRatingCount: 5, averageUserRating: 4.2 }] }) }; };
  await lookupApps(apps, ['1', '2'], ratings, { fetch, sleep: async () => {} });
  assert.deepEqual(ratings, { 1: 5, 2: null });
  await lookupApps(apps, ['1', '2'], ratings, { fetch, sleep: async () => {} });
  assert.equal(urls.length, 1);
});

// Legacy iTunes RSS (game charts): https://itunes.apple.com/{cc}/rss/top…applications/limit=100/genre=6014/json
const legacyEntry = (id, name = `Game ${id}`) => ({
  'im:name': { label: name },
  'im:image': [{ label: 'https://is1-ssl.mzstatic.com/a/53x53bb.png' }, { label: 'https://is1-ssl.mzstatic.com/a/100x100bb.png' }],
  id: { label: `https://apps.apple.com/us/app/x/id${id}`, attributes: { 'im:id': String(id) } },
  'im:artist': { label: 'Studio' },
  category: { attributes: { 'im:id': '6014', label: 'Games' } },
});
const legacyFeed = (entry) => JSON.stringify({ feed: entry === undefined ? {} : { entry } });

test('game charts: feedUrl and legacy parsing (array, single object, empty, bad id)', () => {
  assert.equal(feedUrl('tr', 'gfree'), 'https://itunes.apple.com/tr/rss/topfreeapplications/limit=100/genre=6014/json');
  assert.equal(feedUrl('tr', 'gpaid'), 'https://itunes.apple.com/tr/rss/toppaidapplications/limit=100/genre=6014/json');
  assert.equal(feedUrl('tr', 'free'), 'https://rss.marketingtools.apple.com/api/v2/tr/apps/top-free/100/apps.json');
  const rows = parseFeed(200, legacyFeed([legacyEntry(7), legacyEntry(8)]));
  assert.deepEqual(rows[0], { id: '7', name: 'Game 7', artistName: 'Studio', artworkUrl100: 'https://is1-ssl.mzstatic.com/a/100x100bb.png', genres: [{ genreId: '6014' }] });
  assert.equal(parseFeed(200, legacyFeed(legacyEntry(9))).length, 1); // one row comes as an object
  assert.throws(() => parseFeed(200, legacyFeed(undefined)));
  assert.throws(() => parseFeed(200, legacyFeed([{ ...legacyEntry(1), id: { attributes: { 'im:id': 'x' } } }])));
});

test('game genres: lookup stores the subgenre, the feed\'s plain 6014 does not overwrite it, ratings survive a full run', async () => {
  const apps = {};
  updateApps(apps, { 'us/gfree': parseFeed(200, legacyFeed([legacyEntry(7)])) }, true);
  assert.equal(apps[7].g, '6014');
  const fetch = async () => ({ status: 200, text: async () => JSON.stringify({ results: [{ trackId: 7, primaryGenreId: 6014, genreIds: ['6014', '7012', '6016'], userRatingCount: 40, averageUserRating: 4.44, releaseDate: '2025-02-03T00:00:00Z' }] }) });
  await lookupApps(apps, ['7'], {}, { fetch, sleep: async () => {} });
  assert.deepEqual(apps[7], { n: 'Game 7', a: 'Studio', i: 'https://is1-ssl.mzstatic.com/a/100x100bb.png', g: '7012', rc: 40, r: 4.4, rd: '2025-02-03' });
  updateApps(apps, { 'us/gfree': parseFeed(200, legacyFeed([legacyEntry(7, 'Game 7 v2')])) }, true);
  assert.deepEqual(apps[7], { n: 'Game 7 v2', a: 'Studio', i: 'https://is1-ssl.mzstatic.com/a/100x100bb.png', g: '7012', rc: 40, r: 4.4, rd: '2025-02-03' });
});

test('lookupApps: an app looked up now without a US rating loses its old rating fields', async () => {
  const apps = { 1: { g: '6007', r: 4.6, rc: 1200, rd: '2020-01-01' }, 2: { g: '6007', r: 4, rc: 9, rd: '2021-01-01' } };
  const fetch = async () => ({ status: 200, text: async () => JSON.stringify({ results: [{ trackId: 2, primaryGenreId: 6007 }] }) });
  await lookupApps(apps, ['1', '2'], {}, { fetch, sleep: async () => {} });
  assert.deepEqual(apps[1], { g: '6007' }); // not returned
  assert.deepEqual(apps[2], { g: '6007' }); // returned without userRatingCount
});
