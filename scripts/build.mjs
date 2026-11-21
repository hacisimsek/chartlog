// Builds site/data from data/raw + data/apps.json. Usage: node scripts/build.mjs [--data data] [--out site/data]
import { readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { dateRange, chartLists, chartView, globalSeries, globalView, appHistory } from './lib.mjs';

const { values: args } = parseArgs({ options: { data: { type: 'string', default: 'data' }, out: { type: 'string', default: 'site/data' } } });
const rawDir = join(args.data, 'raw');
const KINDS = ['free', 'paid'];

const all = (existsSync(rawDir) ? readdirSync(rawDir) : [])
  .filter(y => /^\d{4}$/.test(y))
  .flatMap(y => readdirSync(join(rawDir, y)).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map(f => f.slice(0, 10)))
  .sort();
if (!all.length) {
  console.error(`build: no raw day file in ${rawDir}/YYYY/YYYY-MM-DD.json`);
  process.exit(1);
}
const D = all.at(-1);
const have = new Set(all);
const days = {};
for (const d of dateRange(D, 90)) if (have.has(d)) days[d] = JSON.parse(readFileSync(join(rawDir, d.slice(0, 4), `${d}.json`), 'utf8'));
const appsPath = join(args.data, 'apps.json');
const meta = existsSync(appsPath) ? JSON.parse(readFileSync(appsPath, 'utf8')) : {};
const today = days[D];

rmSync(args.out, { recursive: true, force: true });
mkdirSync(join(args.out, 'c'), { recursive: true });
mkdirSync(join(args.out, 'apps'), { recursive: true });
const write = (path, obj) => writeFileSync(join(args.out, path), JSON.stringify(obj));

write('meta.json', {
  date: D,
  fetchedAt: today.fetchedAt,
  days: all.length,
  first: all[0],
  countries: Object.keys(today.charts).filter(cc => Object.keys(today.charts[cc]).length).sort(),
  failed: today.failed ?? [],
  built: new Date().toISOString(),
});

function writeChart(cc, kind, v) {
  const ids = new Set([v.today, v.risers, v.newcomers, v.week, v.month].flat().map(x => x.id));
  const apps = {};
  for (const id of ids) if (meta[id]) apps[id] = meta[id];
  write(`c/${cc}-${kind}.json`, { date: D, cc, kind, ...v, apps });
}

let charts = 0;
for (const [cc, kinds] of Object.entries(today.charts)) {
  for (const kind of Object.keys(kinds)) {
    writeChart(cc, kind, chartView(chartLists(days, cc, kind), D));
    charts++;
  }
}

const globalLists = {};
for (const kind of KINDS) {
  const series = globalSeries(days, kind, D);
  globalLists[kind] = series.lists;
  const v = globalView(series, D);
  if (v) writeChart('global', kind, v);
}

const { dates, apps } = appHistory(days, D, globalLists);
for (const [id, h] of apps) write(`apps/${id}.json`, { id, ...meta[id], dates, ...h });

console.log(`build: ${D}, ${Object.keys(days).length} raw days read, ${charts} charts, ${apps.size} apps -> ${args.out}`);
