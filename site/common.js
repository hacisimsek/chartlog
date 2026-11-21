import { GOATCOUNTER_CODE } from './config.js';

const TR = {
  site: 'CHARTLOG',
  global: 'Global',
  scopeLabel: 'Ülke',
  kindLabel: 'Liste türü',
  typeLabel: 'Uygulama veya oyun',
  apps: 'Uygulamalar',
  games: 'Oyunlar',
  viewsLabel: 'Görünüm',
  free: 'Ücretsiz',
  paid: 'Ücretli',
  gfree: 'Oyun · Ücretsiz',
  gpaid: 'Oyun · Ücretli',
  today: 'Bugün',
  risers: 'Yükselenler',
  newcomers: 'Yeni girenler',
  week: '7 gün',
  month: 'Popüler · 30 gün',
  quarter: '90 gün',
  updated: 'güncel:',
  hideIcons: 'İkonları gizle',
  loading: 'Yükleniyor…',
  loadError: 'Veri yüklenemedi. Bağlantınızı kontrol edip sayfayı yenileyin.',
  noChart: 'Bu ülke/liste için bugün veri yok.',
  noItems: 'Bu görünümde gösterilecek uygulama yok.',
  needDays: (have, need) => `Veri birikiyor: ${have} gün var, bu görünüm için ${need} gün gerekiyor.`,
  stale: date => `Son veri ${date} tarihli; listeler güncel olmayabilir.`,
  // radar
  radar: 'Radar',
  radarLede: 'Son günlerde popülerleşen ve daha iyisi yapılabilecek uygulamalar.',
  radarHide: "Radar'ı gizle",
  radarShow: "Radar'ı göster",
  sigRise: 'Hızla yükselenler', sigRiseWhy: '7 gün öncesine göre en çok sıra kazananlar.',
  sigNew: 'Yeni girenler', sigNewWhy: 'Önceki 7 günde listede olmayıp bugün girenler.',
  sigLow: 'Popüler ama puanı düşük', sigLowWhy: "Puanı 4,0'ın altında, son 30 günde en çok gün listede kalanlar.",
  sigGrow: 'Değerlendirmesi hızla artanlar', sigGrowWhy: 'Bugün listede olup değerlendirme sayısı oransal olarak en çok artanlar.',
  shownOf: (n, t) => `${t} uygulamanın ${n} tanesi`,
  sigNone: 'Bu listede şu an yok.',
  sigNoData: 'Bu liste için 7 gün öncesinin verisi yok.',
  places: 'sıra',
  ratingsShort: 'değ.',
  daysIn: d => `${d} gün listede`,
  scatterTitle: 'Popülerlik ve puan',
  scatterX: 'Popülerlik (30 günlük skor) →',
  quadrant: 'Popüler, puanı düşük',
  scatterSr: (n, q) => `${n} uygulama, ${q} tanesi popüler ve puanı 4,0'ın altında.`,
  scatterList: 'Grafiği liste olarak göster',
  noRating: n => `${n} uygulamanın puanı yok, grafikte gösterilmedi.`,
  notInToday: 'Bugün listede değil',
  col: {
    rank: '#', delta: 'Δ', deltaSr: 'Dünden değişim', app: 'Uygulama', category: 'Kategori',
    spark: '7G', sparkSr: 'Son 7 gün', countries: 'Ülke', best: 'En iyi', score: 'Skor',
    rise: '▲', riseSr: 'Yükseliş', weekAgo: '7 gün önce', todayRank: 'Bugün', days: 'Gün', avg: 'Ort. sıra',
    chart: 'Liste', country: 'Ülke', position: 'Sıra',
    stars: '★', starsSr: 'Kullanıcı puanı (ABD)', ratings: 'Değerlendirme', growth: 'Değ. artışı',
    growthSr: 'Değerlendirme sayısındaki artış (en fazla son 30 gün)', released: 'Çıkış',
  },
  ratingsCount: n => `${n} değerlendirme`,
  growthIn: (n, d) => `${d} günde ${n}`,
  daysShort: d => `${d} g`,
  releasedOn: d => `Çıkış: ${d}`,
  usSource: "ABD App Store'u",
  filtersLabel: 'Fırsat filtreleri',
  filterLow: "Puanı 4,0'ın altında",
  filterRecent: 'Son 12 ayda çıktı',
  filterCount: (n, total) => `${n} / ${total} uygulama`,
  filterEmpty: 'Seçili filtrelere uyan uygulama yok.',
  ratingsNoteA: "Puan ve değerlendirme sayıları ABD App Store'undan. Benzer bir uygulama yapacaksan: Apple kopya uygulamaları reddeder (",
  ratingsNoteLink: 'Kural 4.1',
  ratingsNoteB: '); aynı fikre farklı bir yaklaşım getirmek serbest.',
  isNew: 'YENİ',
  noPrev: 'Önceki gün için veri yok',
  bestShared: (r, n) => `#${r} · ${n} ülke`,
  same: 'değişmedi',
  upBy: n => `${n} sıra yükseldi`,
  downBy: n => `${n} sıra düştü`,
  sparkText: (daysAgo, from, to) => `${daysAgo} gün önce ${from}., bugün ${to}.`,
  sparkOnlyToday: r => `Son 7 günde yalnızca bugün listede: ${r}.`,
  // app page
  badId: 'Geçersiz uygulama numarası.',
  appNotFound: 'Bu uygulama son 90 günde hiçbir listede yok.',
  openStore: "App Store'da aç",
  historyTitle: 'Sıra geçmişi',
  seriesLabel: 'Liste',
  currentTitle: date => `Son gün sıraları (${date})`,
  notInAnyChart: 'Son gün hiçbir listede değil.',
  chartSummary: (label, total, n, best, bestDate, last) =>
    `${label}: son ${total} günün ${n} gününde listede. En iyi sıra ${best} (${bestDate}). ` +
    (last != null ? `Son gün ${last}. sırada.` : 'Son gün listede değil.'),
  // footer
  notAffiliated: "Apple Inc. ile bağlantılı değildir. App Store, Apple Inc.'in ticari markasıdır.",
  source: 'Veri kaynağı: Apple RSS',
  privacy: 'Gizlilik',
  github: 'GitHub',
  langSwitch: 'EN',
  titleTail: 'App Store listeleri | CHARTLOG',
  introTitle: 'Ülkelere göre App Store listeleri, her gün arşivlenir',
  introText: '165 ülkede en popüler ücretsiz ve ücretli iPhone uygulamaları ve oyunları: yükselenler, yeni girenler, haftalık, aylık ve üç aylık sıralar.',
  allCharts: 'Tüm listelere ülke ülke göz at',
  appDesc: (n, by) => `${n}${by ? ` (${by})` : ''}: son 90 günde ülke ve liste bazında App Store sıra geçmişi, puan ve değerlendirme sayısı.`,
  langSwitchLabel: 'EN – Switch to English', // starts with the visible text (WCAG 2.5.3)
};

const EN = {
  site: 'CHARTLOG',
  global: 'Global',
  scopeLabel: 'Country',
  kindLabel: 'Chart type',
  typeLabel: 'Apps or games',
  apps: 'Apps',
  games: 'Games',
  viewsLabel: 'View',
  free: 'Free',
  paid: 'Paid',
  gfree: 'Games · Free',
  gpaid: 'Games · Paid',
  today: 'Today',
  risers: 'Risers',
  newcomers: 'New entries',
  week: '7 days',
  month: 'Popular · 30 days',
  quarter: '90 days',
  updated: 'updated:',
  hideIcons: 'Hide icons',
  loading: 'Loading…',
  loadError: 'Could not load the data. Check your connection and reload the page.',
  noChart: 'No data for this country/chart today.',
  noItems: 'No apps to show in this view.',
  needDays: (have, need) => `Collecting data: ${have} ${have === 1 ? 'day' : 'days'} so far, this view needs ${need}.`,
  stale: date => `Latest data is from ${date}; charts may be out of date.`,
  // radar
  radar: 'Radar',
  radarLede: 'Apps that got popular recently and could be done better.',
  radarHide: 'Hide Radar',
  radarShow: 'Show Radar',
  sigRise: 'Rising fast', sigRiseWhy: 'Most places gained since 7 days ago.',
  sigNew: 'New entries', sigNewWhy: 'In the chart today, absent the 7 days before.',
  sigLow: 'Popular but low-rated', sigLowWhy: 'Rated below 4.0, most days in the chart over the last 30 days.',
  sigGrow: 'Ratings growing fast', sigGrowWhy: 'In the chart today, biggest relative growth in rating count.',
  shownOf: (n, t) => `${n} of ${t} apps`,
  sigNone: 'None in this chart right now.',
  sigNoData: 'No data for this chart from 7 days ago.',
  places: 'places',
  ratingsShort: 'ratings',
  daysIn: d => `${d} ${d === 1 ? 'day' : 'days'} in chart`,
  scatterTitle: 'Popularity vs rating',
  scatterX: 'Popularity (30-day score) →',
  quadrant: 'Popular, low-rated',
  scatterSr: (n, q) => `${n} apps, ${q} of them popular and rated below 4.0.`,
  scatterList: 'Show the chart as a list',
  noRating: n => `${n} ${n === 1 ? 'app has' : 'apps have'} no rating and ${n === 1 ? 'is' : 'are'} not plotted.`,
  notInToday: "Not in today's chart",
  col: {
    rank: '#', delta: 'Δ', deltaSr: 'Change since yesterday', app: 'App', category: 'Category',
    spark: '7D', sparkSr: 'Last 7 days', countries: 'Countries', best: 'Best', score: 'Score',
    rise: '▲', riseSr: 'Rise', weekAgo: '7 days ago', todayRank: 'Today', days: 'Days', avg: 'Avg. rank',
    chart: 'Chart', country: 'Country', position: 'Rank',
    stars: '★', starsSr: 'Rating (US)', ratings: 'Ratings', growth: 'Rating growth',
    growthSr: 'Increase in ratings (up to the last 30 days)', released: 'Released',
  },
  ratingsCount: n => `${n} ratings`,
  growthIn: (n, d) => `${n} in ${d} ${d === 1 ? 'day' : 'days'}`,
  daysShort: d => `${d} d`,
  releasedOn: d => `Released ${d}`,
  usSource: 'US App Store',
  filtersLabel: 'Opportunity filters',
  filterLow: 'Rated below 4.0',
  filterRecent: 'Released in the last 12 months',
  filterCount: (n, total) => `${n} of ${total} apps`,
  filterEmpty: 'No apps match the selected filters.',
  ratingsNoteA: 'Ratings and rating counts come from the US App Store. Building something similar? Apple rejects copycat apps (',
  ratingsNoteLink: 'Guideline 4.1',
  ratingsNoteB: '); a different take on the same idea is fine.',
  isNew: 'NEW',
  noPrev: 'No data for the previous day',
  bestShared: (r, n) => `#${r} · ${n} countries`,
  same: 'unchanged',
  upBy: n => `up ${n}`,
  downBy: n => `down ${n}`,
  sparkText: (daysAgo, from, to) => `#${from} ${daysAgo} ${daysAgo === 1 ? 'day' : 'days'} ago, #${to} today.`,
  sparkOnlyToday: r => `In the chart only today in the last 7 days: #${r}.`,
  // app page
  badId: 'Invalid app id.',
  appNotFound: 'This app has not been in any chart in the last 90 days.',
  openStore: 'Open in the App Store',
  historyTitle: 'Rank history',
  seriesLabel: 'Chart',
  currentTitle: date => `Ranks on the latest day (${date})`,
  notInAnyChart: 'Not in any chart on the latest day.',
  chartSummary: (label, total, n, best, bestDate, last) =>
    `${label}: in the chart on ${n} of the last ${total} days. Best rank #${best} (${bestDate}). ` +
    (last != null ? `#${last} on the latest day.` : 'Not in the chart on the latest day.'),
  // footer
  notAffiliated: 'Not affiliated with Apple Inc. App Store is a trademark of Apple Inc.',
  source: 'Data source: Apple RSS',
  privacy: 'Privacy',
  github: 'GitHub',
  langSwitch: 'TR',
  titleTail: 'App Store Top Charts | CHARTLOG',
  introTitle: 'App Store top charts by country, archived daily',
  introText: 'Top free and paid iPhone apps and games in 165 countries, with trending and fastest rising apps, new entries and weekly, monthly and quarterly rankings.',
  allCharts: 'Browse all charts by country',
  appDesc: (n, by) => `${n}${by ? ` by ${by}` : ''}: App Store top chart rank history by country over the last 90 days, with rating and rating count.`,
  langSwitchLabel: "TR – Türkçe'ye geç",
};

// Language: ?lang=en|tr, else the saved choice, else English (the site is global; crawlers get English).
const LANG_KEY = 'chartlog:lang';
function pickLang() {
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'tr' || q === 'en') {
    try { localStorage.setItem(LANG_KEY, q); } catch { /* storage blocked: only this page follows ?lang */ }
    return q;
  }
  try { const saved = localStorage.getItem(LANG_KEY); if (saved === 'tr' || saved === 'en') return saved; } catch { /* storage blocked */ }
  return 'en';
}
const QUERY_TR = new URLSearchParams(location.search).get('lang') === 'tr';
export const SITE_URL = 'https://hacisimsek.github.io/chartlog/';

// Canonical + hreflang links; a ?lang=tr page is its own canonical so the two languages do not collapse into one.
export function setCanonical(path) {
  const href = tr => { const u = new URL(path, SITE_URL); u.searchParams.delete('lang'); if (tr) u.searchParams.set('lang', 'tr'); return u.href; };
  const put = (sel, attrs) => {
    const n = document.head.querySelector(sel) || document.head.appendChild(document.createElement('link'));
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  };
  put('link[rel="canonical"]', { rel: 'canonical', href: href(QUERY_TR) });
  for (const [l, tr] of [['en', false], ['tr', true], ['x-default', false]]) put(`link[hreflang="${l}"]`, { rel: 'alternate', hreflang: l, href: href(tr) });
  document.head.querySelector('meta[property="og:url"]')?.setAttribute('content', href(QUERY_TR));
}
export const LANG = pickLang();
const LOCALE = LANG === 'tr' ? 'tr-TR' : 'en-US';
export const STRINGS = LANG === 'tr' ? TR : EN;

const REPO_URL = 'https://github.com/hacisimsek/chartlog';
const ICON_KEY = 'chartlog:hideIcons';
let hideIcons = false;

// Builds DOM only through textContent/attributes: every data string comes from Apple's feed.
export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) e.setAttribute(k, v);
  e.append(...children.filter(c => c != null && c !== false).map(c => (c instanceof Node ? c : String(c))));
  return e;
}

export function svgEl(tag, attrs = {}, text) {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = String(text);
  return e;
}

// Polylines split at nulls; a lone point becomes a dot.
export function drawSegments(svg, values, x, y, dot) {
  let seg = [];
  const flush = () => {
    if (seg.length === 1) svg.append(svgEl('circle', { cx: seg[0][0], cy: seg[0][1], r: dot }));
    else if (seg.length) svg.append(svgEl('polyline', { points: seg.join(' ') }));
    seg = [];
  };
  values.forEach((v, i) => (v == null ? flush() : seg.push([x(i).toFixed(1), y(v).toFixed(1)])));
  flush();
}

// Screen readers do not notice #content being swapped, so loading/result/error text also goes
// to the visually hidden role="status" element in each page.
export function announce(message) {
  const status = document.getElementById('status');
  if (status) status.textContent = message;
}

export function setState(container, message, cls = 'state') {
  container.setAttribute('aria-busy', message === STRINGS.loading ? 'true' : 'false');
  container.replaceChildren(el('p', { class: cls }, message));
  announce(message);
}

// Resolves to null on 404 (missing chart/app file), throws on any other failure.
export async function fetchJSON(url) {
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

let regionNames = null;
try { regionNames = new Intl.DisplayNames([LANG], { type: 'region' }); } catch { /* old browser: show codes */ }

export function countryName(cc) {
  if (cc === 'global') return STRINGS.global;
  try { return regionNames?.of(cc.toUpperCase()) || cc.toUpperCase(); } catch { return cc.toUpperCase(); }
}

export function chartLabel(cc, kind) {
  return `${cc === 'global' ? STRINGS.global : cc.toUpperCase()} · ${STRINGS[kind]}`;
}

export function appHref(id) {
  return /^\d+$/.test(id) ? `app.html?id=${id}` : null;
}

export function safeIcon(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname.endsWith('.mzstatic.com') ? u.href : null;
  } catch { return null; }
}

export function iconEl(url, size) {
  const src = !hideIcons && safeIcon(url);
  if (!src) return null;
  const img = el('img', { class: 'icon', width: size, height: size, alt: '', loading: 'lazy', decoding: 'async' });
  img.src = src;
  return img;
}

// App Store genre ids (docs/DATA.md: apps.g) -> [Turkish, English]. '0' or missing = unknown, shown as "—".
const GENRES = {
  6000: ['İş', 'Business'], 6001: ['Hava Durumu', 'Weather'], 6002: ['Araçlar', 'Utilities'],
  6003: ['Seyahat', 'Travel'], 6004: ['Spor', 'Sports'], 6005: ['Sosyal Ağ', 'Social Networking'],
  6006: ['Başvuru Kaynakları', 'Reference'], 6007: ['Verimlilik', 'Productivity'],
  6008: ['Fotoğraf ve Video', 'Photo & Video'], 6009: ['Haberler', 'News'], 6010: ['Navigasyon', 'Navigation'],
  6011: ['Müzik', 'Music'], 6012: ['Yaşam Tarzı', 'Lifestyle'], 6013: ['Sağlık ve Fitness', 'Health & Fitness'],
  6014: ['Oyunlar', 'Games'], 6015: ['Finans', 'Finance'], 6016: ['Eğlence', 'Entertainment'],
  6017: ['Eğitim', 'Education'], 6018: ['Kitaplar', 'Books'], 6020: ['Tıp', 'Medical'],
  6021: ['Dergi ve Gazete', 'Magazines & Newspapers'], 6022: ['Kataloglar', 'Catalogs'],
  6023: ['Yemek ve İçecek', 'Food & Drink'], 6024: ['Alışveriş', 'Shopping'], 6025: ['Çıkartmalar', 'Stickers'],
  6026: ['Geliştirici Araçları', 'Developer Tools'], 6027: ['Grafik ve Tasarım', 'Graphics & Design'],
  // Game subgenres (fetch.mjs stores the first one the lookup returns for a game).
  7001: ['Aksiyon', 'Action'], 7002: ['Macera', 'Adventure'], 7003: ['Gündelik', 'Casual'], 7004: ['Kutu Oyunu', 'Board'],
  7005: ['Kart', 'Card'], 7006: ['Kumarhane', 'Casino'], 7007: ['Zar', 'Dice'], 7008: ['Eğitici', 'Educational'],
  7009: ['Aile', 'Family'], 7011: ['Müzik', 'Music'], 7012: ['Bulmaca', 'Puzzle'], 7013: ['Yarış', 'Racing'],
  7014: ['Rol Yapma', 'Role Playing'], 7015: ['Simülasyon', 'Simulation'], 7016: ['Spor', 'Sports'],
  7017: ['Strateji', 'Strategy'], 7018: ['Bilgi Yarışması', 'Trivia'], 7019: ['Kelime', 'Word'],
};
export const genreName = g => GENRES[g]?.[LANG === 'tr' ? 0 : 1] || '—';

// Dates are UTC calendar days (YYYY-MM-DD). Turkish: 21.11.2026 / 21.11; English: Nov 21, 2026 / Nov 21.
const dayFmt = (opts) => d => (/^\d{4}-\d{2}-\d{2}$/.test(d)
  ? new Date(d + 'T00:00:00Z').toLocaleDateString(LOCALE, { timeZone: 'UTC', ...opts }) : '');
export const fmtDate = dayFmt(LANG === 'tr' ? { day: '2-digit', month: '2-digit', year: 'numeric' } : { day: 'numeric', month: 'short', year: 'numeric' });
// Turkish short forms are built by hand: CLDR's tr day+month pattern is dd/MM, not the dotted 21.11.
export const fmtShort = LANG === 'tr' ? d => fmtDate(d).slice(0, 5) : dayFmt({ day: 'numeric', month: 'short' });
export const fmtNum = n => Number(n).toLocaleString(LOCALE);
export const fmtAvg = n => Number(n).toLocaleString(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const fmtCompact = n => Number(n).toLocaleString(LOCALE, { notation: 'compact', maximumFractionDigits: 1 });
export const fmtPct = n => Number(n).toLocaleString(LOCALE, { style: 'percent', maximumFractionDigits: 0 });
export const signed = (n, f = fmtNum) => (n > 0 ? '+' : '') + f(n);
export const compareNames = (a, b) => a.localeCompare(b, LANG);

export function fmtStamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = n => String(n).padStart(2, '0');
  if (LANG === 'tr') return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
  return d.toLocaleString(LOCALE, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
}

export function initShell({ onIconsChange } = {}) {
  document.documentElement.lang = LANG;
  // No static canonical in the HTML: GitHub Pages serves the same file for ?lang=tr, so raw and rendered canonicals would differ.
  if (document.head.querySelector('link[hreflang]')) setCanonical(location.pathname.split('/').pop());
  for (const n of document.querySelectorAll('[data-lang]')) n.hidden = n.dataset.lang !== LANG; // privacy page
  for (const n of document.querySelectorAll('[data-s]')) n.textContent = STRINGS[n.dataset.s];
  const langBtn = document.getElementById('lang-toggle');
  if (langBtn) {
    langBtn.hidden = false; // hidden in the HTML so it never shows as an empty, dead button without JS
    langBtn.setAttribute('aria-label', STRINGS.langSwitchLabel);
    langBtn.setAttribute('lang', LANG === 'tr' ? 'en' : 'tr');
    langBtn.addEventListener('click', () => {
      const next = LANG === 'tr' ? 'en' : 'tr';
      try { localStorage.setItem(LANG_KEY, next); } catch { /* not persisted: only this page follows ?lang */ }
      const url = new URL(location.href);
      url.searchParams.set('lang', next);
      location.replace(url); // strings are picked once at load, so reload in the other language
    });
  }
  for (const n of document.querySelectorAll('[data-s-aria]')) n.setAttribute('aria-label', STRINGS[n.dataset.sAria]);

  try { hideIcons = localStorage.getItem(ICON_KEY) === '1'; } catch { /* storage blocked: default show */ }
  const toggle = document.getElementById('icon-toggle');
  if (toggle) {
    toggle.setAttribute('aria-pressed', String(hideIcons));
    toggle.addEventListener('click', () => {
      hideIcons = !hideIcons;
      toggle.setAttribute('aria-pressed', String(hideIcons));
      try { localStorage.setItem(ICON_KEY, hideIcons ? '1' : '0'); } catch { /* not persisted */ }
      onIconsChange?.();
    });
  }

  document.getElementById('footer')?.replaceChildren(
    el('p', {}, STRINGS.notAffiliated),
    el('p', {}, STRINGS.source, ' · ', el('a', { href: 'top/' }, STRINGS.allCharts), ' · ', el('a', { href: 'privacy.html' }, STRINGS.privacy), ' · ',
      el('a', { href: REPO_URL, rel: 'noopener' }, STRINGS.github)),
  );

  if (typeof GOATCOUNTER_CODE === 'string' && /^[a-z0-9-]+$/.test(GOATCOUNTER_CODE)) {
    const s = el('script', { async: '', 'data-goatcounter': `https://${GOATCOUNTER_CODE}.goatcounter.com/count` });
    s.src = 'https://gc.zgo.at/count.js';
    document.head.append(s);
  }
}
