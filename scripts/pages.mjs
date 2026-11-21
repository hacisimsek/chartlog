// Writes crawlable English chart pages from built data: {out}/top/*.html, {out}/sitemap.xml, {out}/robots.txt.
// Usage: node scripts/pages.mjs [--data site/data] [--out site]   (run after build.mjs; contract: docs/DATA.md)
import { readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({ options: { data: { type: 'string', default: 'site/data' }, out: { type: 'string', default: 'site' } } });
const BASE = 'https://hacisimsek.github.io/chartlog/';
const KINDS = ['free', 'paid', 'gfree', 'gpaid'];
const FILE = /^([a-z]{2}|global)-(free|paid|gfree|gpaid)\.json$/;
const KIND_TEXT = { free: 'Free iPhone Apps', paid: 'Paid iPhone Apps', gfree: 'Free iPhone Games', gpaid: 'Paid iPhone Games' };
const KIND_SHORT = { free: 'Free apps', paid: 'Paid apps', gfree: 'Free games', gpaid: 'Paid games' };
// English names of App Store genre ids; copy of the map in site/common.js (that file is browser-only).
const GENRES = {
  6000: 'Business', 6001: 'Weather', 6002: 'Utilities', 6003: 'Travel', 6004: 'Sports', 6005: 'Social Networking',
  6006: 'Reference', 6007: 'Productivity', 6008: 'Photo & Video', 6009: 'News', 6010: 'Navigation', 6011: 'Music',
  6012: 'Lifestyle', 6013: 'Health & Fitness', 6014: 'Games', 6015: 'Finance', 6016: 'Entertainment', 6017: 'Education',
  6018: 'Books', 6020: 'Medical', 6021: 'Magazines & Newspapers', 6022: 'Catalogs', 6023: 'Food & Drink', 6024: 'Shopping',
  6025: 'Stickers', 6026: 'Developer Tools', 6027: 'Graphics & Design', 7001: 'Action', 7002: 'Adventure', 7003: 'Casual',
  7004: 'Board', 7005: 'Card', 7006: 'Casino', 7007: 'Dice', 7008: 'Educational', 7009: 'Family', 7011: 'Music',
  7012: 'Puzzle', 7013: 'Racing', 7014: 'Role Playing', 7015: 'Simulation', 7016: 'Sports', 7017: 'Strategy',
  7018: 'Trivia', 7019: 'Word',
};

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
// JSON inside <script>: no raw <, >, & so a name cannot close the script element.
const jsonLd = o => JSON.stringify(o).replace(/[<>&\u2028\u2029]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const regions = new Intl.DisplayNames('en', { type: 'region' });
const place = cc => (cc === 'global' ? 'Worldwide' : regions.of(cc.toUpperCase()));
const fmtDate = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
const pageName = (cc, kind) => `${cc}-${kind}.html`;
const appUrl = id => `../app.html?id=${id}`;
const validId = id => typeof id === 'string' && /^\d+$/.test(id);

const meta = JSON.parse(readFileSync(join(args.data, 'meta.json'), 'utf8'));
if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.date)) throw new Error(`pages: bad meta.date ${meta.date}`);
const D = meta.date;
const dateText = fmtDate(D);

// cc -> Set of kinds with a chart file; anything not matching FILE (bad cc/kind) is skipped.
const charts = new Map();
for (const f of readdirSync(join(args.data, 'c'))) {
  const m = FILE.exec(f);
  if (!m) { if (f.endsWith('.json')) console.warn(`pages: skipped ${f}`); continue; }
  if (!charts.has(m[1])) charts.set(m[1], new Set());
  charts.get(m[1]).add(m[2]);
}
const order = [...charts.keys()].filter(cc => cc !== 'global').sort((a, b) => place(a).localeCompare(place(b), 'en'));
if (charts.has('global')) order.unshift('global');

const layout = ({ title, desc, canonical, head = '', body }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:type" content="website">
<meta name="color-scheme" content="light dark">
<link rel="stylesheet" href="../style.css">
${head}</head>
<body>
<header class="top"><a class="brand" href="../">CHARTLOG</a></header>
<main class="prose" style="max-width:1180px">
${body}
</main>
<footer>
<p>Not affiliated with Apple Inc. App Store is a trademark of Apple Inc. Data: Apple RSS feeds; ratings from the US App Store.</p>
<p><a href="./">All charts</a> · <a href="../">Interactive charts</a> · <a href="../privacy.html">Privacy</a> · <a href="https://github.com/hacisimsek/chartlog" rel="noopener">GitHub</a></p>
</footer>
</body>
</html>
`;

function chartPage(cc, kind, c) {
  const apps = c.apps ?? {};
  const name = id => apps[id]?.n || `App ${id}`;
  const today = (c.today ?? []).filter(x => validId(x.id)).slice(0, 100);
  const where = cc === 'global' ? 'Worldwide' : `in ${place(cc)}`;
  const title = `Top ${KIND_TEXT[kind]} ${where} — App Store Chart, ${dateText} | chartlog`;
  const top3 = today.slice(0, 3).map(x => name(x.id)).join(', ');
  const what = KIND_TEXT[kind].replace('iPhone ', '').toLowerCase();
  const desc = `Today's top ${today.length} ${what} on the App Store ${where} (${dateText})${top3 ? `: ${top3} and more` : ''}. Daily ranks, changes and new entries.`;
  const canonical = `${BASE}top/${pageName(cc, kind)}`;
  const hasPrev = !!c.prevDate;
  const delta = x => {
    if (x.p == null) return '<span class="new">NEW</span>';
    const d = x.p - x.r;
    return d > 0 ? `<span class="up">▲${d}</span>` : d < 0 ? `<span class="down">▼${-d}</span>` : '<span class="nil">=</span>';
  };
  const rows = today.map(x => {
    const a = apps[x.id] ?? {};
    return `<tr><td class="rank">${Number(x.r)}</td>${hasPrev ? `<td class="delta">${delta(x)}</td>` : ''}` +
      `<td class="app"><a class="app-link" href="${appUrl(x.id)}"><span class="app-text"><span class="app-name">${esc(name(x.id))}</span>` +
      `<span class="app-artist">${esc(a.a)}</span></span></a></td><td class="quiet">${esc(GENRES[a.g] ?? '—')}</td>` +
      `<td class="num">${typeof a.r === 'number' ? a.r.toFixed(1) : '—'}</td></tr>`;
  }).join('\n');
  const list = (head, items, note) => (items.length ? `<h2>${head}</h2>\n<ol>\n${items.slice(0, 10).map(x =>
    `<li><a href="${appUrl(x.id)}">${esc(name(x.id))}</a> <span class="muted">${note(x)}</span></li>`).join('\n')}\n</ol>\n` : '');
  const risers = list('Rising this week', (c.risers ?? []).filter(x => validId(x.id)), x => `#${Number(x.w)} → #${Number(x.r)}`);
  const newcomers = list('New this week', (c.newcomers ?? []).filter(x => validId(x.id)), x => `#${Number(x.r)}`);
  const others = KINDS.filter(k => k !== kind && charts.get(cc).has(k))
    .map(k => `<a href="${pageName(cc, k)}">${KIND_SHORT[k]}</a>`).join(' · ');
  const ld = {
    '@context': 'https://schema.org', '@type': 'ItemList', name: title.split(' — ')[0], itemListOrder: 'https://schema.org/ItemListOrderAscending',
    numberOfItems: Math.min(10, today.length),
    itemListElement: today.slice(0, 10).map(x => ({ '@type': 'ListItem', position: Number(x.r), name: name(x.id), url: `${BASE}app.html?id=${x.id}` })),
  };
  const body = `<h1>Top ${esc(KIND_TEXT[kind])} ${esc(where)}</h1>
<p>The ${today.length} most popular ${esc(what)} on the Apple App Store ${esc(where)} on ${esc(dateText)}, from Apple's public top-chart feeds.${hasPrev ? ' Changes are against the previous day.' : ''} Ratings are from the US App Store.</p>
<p>${others ? `${esc(place(cc))}: ${others} · ` : ''}<a href="./">All countries</a> · <a href="../#/${cc}/${kind}/today">Interactive view with trends and Radar</a></p>
<div class="table-wrap"><table class="chart">
<thead><tr><th class="rank">#</th>${hasPrev ? '<th class="delta"><abbr title="Change since yesterday">Δ</abbr></th>' : ''}<th>App</th><th>Category</th><th class="num"><abbr title="Average user rating, US App Store">★ US</abbr></th></tr></thead>
<tbody>
${rows}
</tbody></table></div>
${risers}${newcomers}`;
  return layout({ title, desc, canonical, body, head: `<script type="application/ld+json">${jsonLd(ld)}</script>\n` });
}

function hub() {
  const title = `App Store Top Charts by Country — ${dateText} | chartlog`;
  const desc = `Today's top 100 free and paid iPhone apps and games for ${charts.size - (charts.has('global') ? 1 : 0)} countries and worldwide, updated daily (${dateText}).`;
  const items = order.map(cc => `<li><strong>${esc(place(cc))}</strong>: ${KINDS.filter(k => charts.get(cc).has(k))
    .map(k => `<a href="${pageName(cc, k)}">${KIND_SHORT[k]}</a>`).join(' · ')}</li>`).join('\n');
  const body = `<h1>App Store top charts by country</h1>
<p>Daily top 100 iPhone apps and games on the Apple App Store, for every country we track, on ${esc(dateText)}. <a href="../">Open the interactive charts</a> for trends, risers and the Radar.</p>
<ul>
${items}
</ul>`;
  return layout({ title, desc, canonical: `${BASE}top/`, body });
}

const topDir = join(args.out, 'top');
rmSync(topDir, { recursive: true, force: true });
mkdirSync(topDir, { recursive: true });
const urls = [BASE, `${BASE}top/`];
for (const cc of order) {
  for (const kind of KINDS) {
    if (!charts.get(cc).has(kind)) continue;
    const c = JSON.parse(readFileSync(join(args.data, 'c', `${cc}-${kind}.json`), 'utf8'));
    writeFileSync(join(topDir, pageName(cc, kind)), chartPage(cc, kind, c));
    urls.push(`${BASE}top/${pageName(cc, kind)}`);
  }
}
writeFileSync(join(topDir, 'index.html'), hub());
urls.push(`${BASE}privacy.html`);
writeFileSync(join(args.out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `<url><loc>${esc(u)}</loc>${u.endsWith('privacy.html') ? '' : `<lastmod>${D}</lastmod>`}</url>`).join('\n')}
</urlset>
`);
writeFileSync(join(args.out, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${BASE}sitemap.xml\n`);

const bytes = readdirSync(topDir).reduce((s, f) => s + statSync(join(topDir, f)).size, 0);
console.log(`pages: ${D}, ${urls.length - 3} chart pages + hub (${(bytes / 1e6).toFixed(1)} MB) -> ${topDir}, sitemap ${urls.length} urls`);
