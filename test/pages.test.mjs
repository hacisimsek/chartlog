import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const SCRIPT = new URL('../scripts/pages.mjs', import.meta.url).pathname;
const EVIL = '<img src=x onerror=alert(1)></script><script>alert(2)</script>';
const BASE = 'https://hacisimsek.github.io/chartlog/top/';

const dir = mkdtempSync(join(tmpdir(), 'chartlog-pages-'));
const data = join(dir, 'data');
const out = join(dir, 'out');
mkdirSync(join(data, 'c'), { recursive: true });
writeFileSync(join(data, 'meta.json'), JSON.stringify({ date: '2026-11-21' }));
const chart = (cc, kind, extra = {}) => writeFileSync(join(data, 'c', `${cc}-${kind}.json`), JSON.stringify({
  date: '2026-11-21', cc, kind, prevDate: '2026-11-20', weekAgoDate: null,
  today: [{ id: '1', r: 1, p: 2 }, { id: '2', r: 2, p: null }, { id: 'x"><b>', r: 3, p: 1 }],
  risers: [{ id: '1', r: 1, w: 9 }], newcomers: [],
  apps: { 1: { n: EVIL, a: 'Dev & Co', g: '6007', r: 4.75 }, 2: { n: 'Second', a: 'B', g: '7012' } },
  ...extra,
}));
chart('us', 'free');
chart('us', 'gpaid');
chart('global', 'free');
chart('jp', 'gfree', { prevDate: null });
chart('xx1', 'free');      // bad cc
chart('us', 'grossing');   // bad kind
const run = spawnSync(process.execPath, [SCRIPT, '--data', data, '--out', out], { encoding: 'utf8' });
const page = f => readFileSync(join(out, 'top', f), 'utf8');

test('pages: runs and writes only valid chart files plus the hub', () => {
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(readdirSync(join(out, 'top')).sort(),
    ['global-free.html', 'index.html', 'jp-gfree.html', 'us-free.html', 'us-gpaid.html']);
});

test('pages: titles, canonical, lang, links', () => {
  const us = page('us-free.html');
  assert.match(us, /<html lang="en">/);
  assert.match(us, /<title>Top Free iPhone Apps in United States — App Store Chart, Nov 21, 2026 \| chartlog<\/title>/);
  assert.match(us, new RegExp(`<link rel="canonical" href="${BASE}us-free.html">`));
  assert.match(us, /href="us-gpaid.html">Paid games/);
  assert.match(us, /href="..\/#\/us\/free\/today"/);
  assert.match(us, /href="..\/app.html\?id=1"/);
  assert.match(us, /Productivity/);
  assert.match(us, /4\.8/);
  assert.match(us, /Rising this week/);
  assert.doesNotMatch(us, /New this week/);
  assert.match(page('us-gpaid.html'), /<title>Top Paid iPhone Games in United States/);
  assert.match(page('global-free.html'), /<title>Top Free iPhone Apps Worldwide — /);
  const jp = page('jp-gfree.html');
  assert.match(jp, /<title>Top Free iPhone Games in Japan/);
  assert.doesNotMatch(jp, /class="delta"/); // no prevDate -> no change column
  const hub = page('index.html');
  assert.ok(hub.indexOf('Worldwide') < hub.indexOf('Japan') && hub.indexOf('Japan') < hub.indexOf('United States'));
});

test('pages: data strings are escaped in HTML and JSON-LD; bad ids dropped', () => {
  const us = page('us-free.html');
  assert.ok(!us.includes('<img'), 'raw <img in HTML');
  assert.ok(!us.includes('<script>alert'), 'script breakout');
  assert.equal(us.match(/<\/script>/g).length, 1, 'only the JSON-LD block closes a script');
  assert.match(us, /&#60;img src=x onerror=alert\(1\)&#62;/);
  assert.match(us, /Dev &#38; Co/);
  assert.ok(!us.includes('x"><b>'), 'invalid id must not reach the page');
  const ld = JSON.parse(us.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(ld['@type'], 'ItemList');
  assert.equal(ld.itemListElement[0].name, EVIL);
  assert.equal(ld.itemListElement.length, 2);
});

test('pages: sitemap and robots', () => {
  const sm = readFileSync(join(out, 'sitemap.xml'), 'utf8');
  for (const f of ['', 'us-free.html', 'us-gpaid.html', 'global-free.html', 'jp-gfree.html']) assert.ok(sm.includes(`<loc>${BASE}${f}</loc>`), f);
  assert.ok(sm.includes('<loc>https://hacisimsek.github.io/chartlog/privacy.html</loc>'));
  assert.ok(!sm.includes('xx1') && !sm.includes('grossing'));
  assert.equal(sm.match(/<lastmod>2026-11-21<\/lastmod>/g).length, 6); // privacy.html is static: no lastmod
  assert.match(readFileSync(join(out, 'robots.txt'), 'utf8'), /Sitemap: https:\/\/hacisimsek.github.io\/chartlog\/sitemap.xml/);
  assert.ok(!existsSync(join(out, 'top', 'xx1-free.html')));
});
