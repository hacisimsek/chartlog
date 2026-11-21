import { GOATCOUNTER_CODE } from './config.js';

export const STRINGS = {
  site: 'CHARTLOG',
  global: 'Global',
  scopeLabel: 'Ülke',
  kindLabel: 'Liste türü',
  viewsLabel: 'Görünüm',
  free: 'Ücretsiz',
  paid: 'Ücretli',
  today: 'Bugün',
  risers: 'Yükselenler',
  newcomers: 'Yeni girenler',
  week: 'Hafta',
  month: 'Ay',
  updated: 'güncel:',
  hideIcons: 'İkonları gizle',
  loading: 'Yükleniyor…',
  loadError: 'Veri yüklenemedi. Bağlantınızı kontrol edip sayfayı yenileyin.',
  noChart: 'Bu ülke/liste için bugün veri yok.',
  noItems: 'Bu görünümde gösterilecek uygulama yok.',
  needDays: (have, need) => `Veri birikiyor: ${have} gün var, bu görünüm için ${need} gün gerekiyor.`,
  stale: date => `Son veri ${date} tarihli; listeler güncel olmayabilir.`,
  col: {
    rank: '#', delta: 'Δ', deltaSr: 'Dünden değişim', app: 'Uygulama', category: 'Kategori',
    spark: '7G', sparkSr: 'Son 7 gün', countries: 'Ülke', best: 'En iyi', score: 'Puan',
    rise: '▲', riseSr: 'Yükseliş', weekAgo: '7 gün önce', todayRank: 'Bugün', days: 'Gün', avg: 'Ort. sıra',
    chart: 'Liste', country: 'Ülke', position: 'Sıra',
  },
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
};

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
try { regionNames = new Intl.DisplayNames(['tr'], { type: 'region' }); } catch { /* old browser: show codes */ }

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

// App Store genre ids (docs/DATA.md: apps.g). '0' or missing = unknown. Unknown ids show as "—".
const GENRES = {
  6000: 'İş', 6001: 'Hava Durumu', 6002: 'Araçlar', 6003: 'Seyahat', 6004: 'Spor', 6005: 'Sosyal Ağ',
  6006: 'Başvuru Kaynakları', 6007: 'Verimlilik', 6008: 'Fotoğraf ve Video', 6009: 'Haberler', 6010: 'Navigasyon',
  6011: 'Müzik', 6012: 'Yaşam Tarzı', 6013: 'Sağlık ve Fitness', 6014: 'Oyunlar', 6015: 'Finans',
  6016: 'Eğlence', 6017: 'Eğitim', 6018: 'Kitaplar', 6020: 'Tıp', 6021: 'Dergi ve Gazete',
  6022: 'Kataloglar', 6023: 'Yemek ve İçecek', 6024: 'Alışveriş', 6025: 'Çıkartmalar',
  6026: 'Geliştirici Araçları', 6027: 'Grafik ve Tasarım',
};
export const genreName = g => GENRES[g] || '—';

export const fmtDate = d => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : '');
export const fmtShort = d => fmtDate(d).slice(0, 5);
export const fmtNum = n => Number(n).toLocaleString('tr-TR');
export const fmtAvg = n => Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function fmtStamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function initShell({ onIconsChange } = {}) {
  for (const n of document.querySelectorAll('[data-s]')) n.textContent = STRINGS[n.dataset.s];
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
    el('p', {}, STRINGS.source, ' · ', el('a', { href: 'privacy.html' }, STRINGS.privacy), ' · ',
      el('a', { href: REPO_URL, rel: 'noopener' }, STRINGS.github)),
  );

  if (typeof GOATCOUNTER_CODE === 'string' && /^[a-z0-9-]+$/.test(GOATCOUNTER_CODE)) {
    const s = el('script', { async: '', 'data-goatcounter': `https://${GOATCOUNTER_CODE}.goatcounter.com/count` });
    s.src = 'https://gc.zgo.at/count.js';
    document.head.append(s);
  }
}
