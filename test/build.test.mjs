import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import {
  points, addDays, dateRange, chartLists, windowTop, chartView, globalDay, globalSeries, globalView, appHistory,
} from '../scripts/lib.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const DATA = join(ROOT, 'test/fixtures/build/data');
const D = '2026-11-10';
const RAW = join(DATA, 'raw/2026');
const days = Object.fromEntries(readdirSync(RAW).map(f => [f.slice(0, 10), JSON.parse(readFileSync(join(RAW, f), 'utf8'))]));
const N = Array(6).fill(null);
const ids = list => list.map(x => x.id);
const filler = (n, p) => Array.from({ length: n }, (_, i) => `${p}${i}`);

test('points and dates', () => {
  assert.equal(points(1), 100);
  assert.equal(points(100), 1);
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.deepEqual(dateRange('2026-03-01', 3), ['2026-02-27', '2026-02-28', '2026-03-01']);
});

test('chart today: p, w, h with missing day and absent ranks', () => {
  const v = chartView(chartLists(days, 'tr', 'free'), D);
  assert.deepEqual(v.today.slice(0, 5), [
    { id: '2', r: 1, p: 2, w: 3, h: [2, null, 2, 1, 1, 2, 1] },
    { id: '4', r: 2, p: null, w: 4, h: [...N, 2] },
    { id: '1', r: 3, p: 1, w: 2, h: [1, null, 1, 2, 2, 1, 3] },
    { id: '6', r: 4, p: null, w: 6, h: [...N, 4] },
    { id: '3', r: 5, p: null, w: 1, h: [3, null, 3, 3, 3, null, 5] },
  ]);
  assert.deepEqual(ids(v.today), ['2', '4', '1', '6', '3', '7', '10', '11']);
});

test('risers: by w - r desc, then r asc', () => {
  const v = chartView(chartLists(days, 'tr', 'free'), D);
  assert.deepEqual(v.risers, [
    { id: '7', r: 6, w: 9 },
    { id: '2', r: 1, w: 3 },
    { id: '4', r: 2, w: 4 },
    { id: '6', r: 4, w: 6 },
  ]);
});

test('newcomers: absent from D-7..D-1 (D-8 does not count); empty with no earlier day', () => {
  assert.deepEqual(chartView(chartLists(days, 'tr', 'free'), D).newcomers, [{ id: '10', r: 7 }, { id: '11', r: 8 }]);
  assert.deepEqual(chartView(chartLists(days, 'tr', 'paid'), D).newcomers, []);
  assert.equal(chartView(chartLists(days, 'sb', 'paid'), D), null); // failed on D -> no chart
});

test('week and month: score, days, avg, order', () => {
  const v = chartView(chartLists(days, 'tr', 'free'), D);
  assert.deepEqual(v.week.slice(0, 4), [
    { id: '2', score: 597, days: 6, avg: 1.5 },
    { id: '1', score: 596, days: 6, avg: 1.7 },
    { id: '3', score: 488, days: 5, avg: 3.4 },
    { id: '4', score: 99, days: 1, avg: 2 },
  ]);
  assert.deepEqual(ids(v.week), ['2', '1', '3', '4', '5', '6', '7', '10', '11']);
  assert.deepEqual(v.month.slice(0, 3), [
    { id: '1', score: 895, days: 9, avg: 1.6 },
    { id: '2', score: 893, days: 9, avg: 1.8 },
    { id: '3', score: 784, days: 8, avg: 3 },
  ]);
  assert.deepEqual(ids(v.month), ['1', '2', '3', '4', '5', '6', '11', '7', '8', '10', '9']);
});

test('window: equal score sorted by avg asc', () => {
  const lists = { '2026-01-01': ['x'], '2026-01-02': ['y', 'x'], '2026-01-03': ['y'], '2026-01-04': [...filler(99, 'f'), 'x'] };
  const top = windowTop(lists, '2026-01-04', 7);
  assert.deepEqual(top.slice(0, 2), [
    { id: 'y', score: 200, days: 2, avg: 1 },
    { id: 'x', score: 200, days: 3, avg: 34.3 },
  ]);
});

test('window with scores: sums scores on days outside the list', () => {
  const lists = { '2026-01-01': ['a'], '2026-01-02': ['b'] };
  const scores = { '2026-01-01': new Map([['a', 10], ['b', 7]]), '2026-01-02': new Map([['b', 5], ['a', 3]]) };
  assert.deepEqual(windowTop(lists, '2026-01-02', 7, scores), [
    { id: 'a', score: 13, days: 1, avg: 1 },
    { id: 'b', score: 12, days: 1, avg: 1 },
  ]);
});

test('globalDay: score, c, best tie by alphabetical cc, score tie by c desc', () => {
  const day = {
    charts: {
      us: { free: ['a'] },
      ca: { free: ['a'] },
      aa: { free: ['p', 'q'] },
      bb: { free: ['z', 'p'] },
      cc: { free: [...filler(50, 'c'), 'q'] },
      dd: { free: [...filler(50, 'd'), 'q'] },
    },
  };
  const g = globalDay(day, 'free');
  assert.deepEqual(g.top[0], { id: 'a', s: 200, c: 2, best: ['ca', 1, 2] });
  assert.deepEqual(g.top.slice(1, 3), [
    { id: 'q', s: 199, c: 3, best: ['aa', 2, 1] },
    { id: 'p', s: 199, c: 2, best: ['aa', 1, 1] },
  ]);
  assert.equal(globalDay(day, 'paid'), null);
});

test('global view: today, ranks, risers, newcomers, week', () => {
  const v = globalView(globalSeries(days, 'free', D), D);
  assert.deepEqual(v.today.slice(0, 4), [
    { id: '4', r: 1, p: 3, w: 4, h: [...Array(5).fill(null), 3, 1], s: 296, c: 3, best: ['sb', 2, 2] },
    { id: '20', r: 2, p: null, w: null, h: [...N, 2], s: 200, c: 2, best: ['sb', 1, 2] },
    { id: '2', r: 3, p: 1, w: 3, h: [2, null, 2, 1, 1, 1, 3], s: 199, c: 2, best: ['tr', 1, 1] },
    { id: '1', r: 4, p: 2, w: 2, h: [1, null, 1, 2, 2, 2, 4], s: 98, c: 1, best: ['tr', 3, 1] },
  ]);
  assert.deepEqual(ids(v.today), ['4', '20', '2', '1', '6', '3', '7', '10', '11']);
  assert.deepEqual(v.risers, [{ id: '4', r: 1, w: 4 }, { id: '7', r: 7, w: 9 }, { id: '6', r: 5, w: 6 }]);
  assert.deepEqual(v.newcomers, [{ id: '20', r: 2 }, { id: '10', r: 8 }, { id: '11', r: 9 }]);
  assert.deepEqual(v.week.slice(0, 5), [
    { id: '2', score: 796, days: 6, avg: 1.7 },
    { id: '1', score: 596, days: 6, avg: 2 },
    { id: '3', score: 488, days: 5, avg: 3.6 },
    { id: '4', score: 395, days: 2, avg: 2 },
    { id: '20', score: 200, days: 1, avg: 2 },
  ]);

  const paid = globalView(globalSeries(days, 'paid', D), D);
  assert.deepEqual(paid.today, [
    { id: '31', r: 1, p: null, w: null, h: [...N, 1], s: 199, c: 2, best: ['us', 1, 1] },
    { id: '30', r: 2, p: null, w: null, h: [...N, 2], s: 100, c: 1, best: ['tr', 1, 1] },
  ]);
  assert.deepEqual(paid.newcomers, []);
});

test('app history: 90 dates incl. missing days, only charts it appeared in, global ranks', () => {
  const globalLists = { free: globalSeries(days, 'free', D).lists, paid: globalSeries(days, 'paid', D).lists };
  const { dates, apps } = appHistory(days, D, globalLists);
  assert.equal(dates.length, 90);
  assert.equal(dates[0], '2026-08-13');
  assert.equal(dates[89], D);
  assert.ok(dates.includes('2026-11-05'));
  const a = apps.get('4');
  assert.deepEqual(Object.keys(a.ranks).sort(), ['sb/free', 'tr/free', 'us/free']);
  assert.deepEqual(a.ranks['tr/free'].slice(82), [4, null, null, null, null, null, null, 2]);
  assert.deepEqual(a.ranks['us/free'].slice(82), [...N, 2, 3]);
  assert.deepEqual(a.ranks['sb/free'].slice(82), [...N, null, 2]);
  assert.ok(a.ranks['tr/free'].slice(0, 82).every(x => x === null));
  assert.deepEqual(a.global.free.slice(82), [4, null, null, null, null, null, 3, 1]);
  assert.equal(a.global.paid, undefined);
  assert.equal(apps.has('99'), false); // only in a day outside the window
});

test('build end to end', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'chartlog-build-'));
  const out = join(tmp, 'out');
  mkdirSync(out);
  writeFileSync(join(out, 'stale.json'), '{}');
  try {
    const run = spawnSync(process.execPath, [join(ROOT, 'scripts/build.mjs'), '--data', DATA, '--out', out], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(existsSync(join(out, 'stale.json')), false);
    const read = p => JSON.parse(readFileSync(join(out, p), 'utf8'));

    const meta = read('meta.json');
    assert.deepEqual({ ...meta, built: undefined }, {
      date: D, fetchedAt: '2026-11-10T03:19:44.120Z', days: 10, first: '2026-06-01',
      countries: ['sb', 'tr', 'us'], failed: ['sb/paid'], built: undefined,
    });
    assert.deepEqual(readdirSync(join(out, 'c')).sort(),
      ['global-free.json', 'global-paid.json', 'sb-free.json', 'tr-free.json', 'tr-paid.json', 'us-free.json', 'us-paid.json']);

    const tr = read('c/tr-free.json');
    assert.equal(tr.cc, 'tr');
    assert.equal(tr.kind, 'free');
    assert.deepEqual(Object.keys(tr.apps).sort(), ['1', '2', '3', '4', '5']); // 6..11 have no metadata
    assert.deepEqual(tr.apps['4'], { n: 'Four', a: 'A4', i: 'https://x/4.png', g: 'Food & Drink' });
    assert.equal(tr.today.length, 8);
    assert.equal(read('c/global-free.json').cc, 'global');
    assert.equal(read('c/global-free.json').today[0].s, 296);

    const files = readdirSync(join(out, 'apps'));
    for (const f of files) read(`apps/${f}`);
    assert.equal(files.includes('99.json'), false);
    const app4 = read('apps/4.json');
    assert.equal(app4.n, 'Four');
    assert.equal(app4.dates.length, 90);
    assert.deepEqual(app4.global.free.slice(-2), [3, 1]);
    const app10 = read('apps/10.json');
    assert.equal(app10.n, undefined);
    assert.deepEqual(app10.ranks['tr/free'].slice(-1), [7]);

    const empty = join(tmp, 'empty');
    mkdirSync(join(empty, 'raw'), { recursive: true });
    const fail = spawnSync(process.execPath, [join(ROOT, 'scripts/build.mjs'), '--data', empty, '--out', join(tmp, 'o2')], { encoding: 'utf8' });
    assert.equal(fail.status, 1);
    assert.match(fail.stderr, /no raw day file/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('chartView: prevDate/weekAgoDate are null when that day has no chart', () => {
  const v = chartView({ '2026-11-10': ['a'], '2026-11-03': ['a'] }, '2026-11-10');
  assert.equal(v.prevDate, null);
  assert.equal(v.weekAgoDate, '2026-11-03');
  assert.equal(v.today[0].p, null);
  assert.equal(chartView({ '2026-11-10': ['a'], '2026-11-09': ['b'] }, '2026-11-10').prevDate, '2026-11-09');
});
