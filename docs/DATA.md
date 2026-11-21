# Data contract

Every script and the site follow this file. Change it first if a format changes.

## Source

Apple RSS v2 feed, no key:

```
https://rss.marketingtools.apple.com/api/v2/{cc}/apps/{top-free|top-paid}/100/apps.json
```

- `{cc}`: one of the 165 lowercase storefront codes in `countries.json` (probed 2026-11-21).
  Other codes return 500/502 or time out slowly, so never probe outside this list.
- Response: `feed.results[]`, each with `id, name, artistName, artworkUrl100, genres[{name}], url, releaseDate, kind`.
  No rank field: rank = array index + 1. About 10% of rows have empty `genres`.
- Small storefronts return fewer than 100 rows (seen: 30–99). That is valid data.
- The feed hangs ~35–40% of requests at random (measured 2026-11-21, same at concurrency 1, 4 and 8) and sometimes returns 500/502/504 or a non-JSON body. Normal responses take 1–3 s. So: 5 s timeout, 6 attempts, concurrency 8; a full run takes ~3–4 minutes, and the daily workflow runs fetch twice (the second pass only retries charts still missing).
- 100 is the max; asking for more returns 500.

Chart kinds in this project: `free` (top-free) and `paid` (top-paid) apps from the v2 feed above, which has no games,
and `gfree` / `gpaid` for **games** from the legacy iTunes RSS filtered to genre 6014:

```
https://itunes.apple.com/{cc}/rss/{topfreeapplications|toppaidapplications}/limit=100/genre=6014/json
```

- Response: `feed.entry[]` (a single object when there is one row) with `id.attributes["im:id"]`, `im:name.label`,
  `im:artist.label`, `im:image[]` (last = 100 px), `category.attributes["im:id"]` = `6014`. `fetch.mjs` maps it to the v2 row shape.
- Measured 2026-11-21: all 330 game charts (165 countries) on the first try, ~1 s each, no hangs; many have 97–99 rows.
- For games, `g` in `apps.json` is the first subgenre id (`7001` Action … `7019` Word) from the lookup's `genreIds`;
  the feed's plain `6014` never overwrites a subgenre.

**The 90% rule is per feed.** Apps (`free`+`paid`, 330 charts) and games (`gfree`+`gpaid`, 330 charts) are judged
separately on the merged day: a feed with at least 90% of its charts is saved, a feed below 90% keeps whatever was already
saved for it (its new charts are dropped and listed in `failed`). `fetch.mjs` exits 1 if any feed was below 90% and writes
nothing only when every feed is. The workflow still commits and deploys what was saved, then fails the run (email).

## Committed data (`data/`)

### `data/raw/YYYY/YYYY-MM-DD.json` — one file per UTC day, minified

```json
{
  "date": "2026-11-22",
  "fetchedAt": "2026-11-22T03:19:44.120Z",
  "charts": { "tr": { "free": ["1234", "5678"], "paid": ["..."] }, "us": { "...": [] } },
  "failed": ["sb/paid"]
}
```

- `charts[cc][kind]` is the list of app ids in rank order (index 0 = rank 1).
- A chart that failed after all retries is absent from `charts` and listed in `failed` as `"cc/kind"`.
- Re-running on the same date merges: charts that succeed now replace old ones; charts that fail now keep the old value.

### `data/apps.json` — app metadata, minified, keyed by id

```json
{ "1234": { "n": "Name", "a": "Artist", "i": "https://is1-ssl.mzstatic.com/...100x100bb.png", "g": "6023" } }
```

- Updated on each fetch. Name/artist/icon come from the `us` row when the app is in a US chart that day, else from the first country (alphabetical) where it appears. On a partial re-run only `us` rows overwrite an existing entry.
- `g` is the App Store **genre id** (`genres[0].genreId`), not the name: feed names are localized per storefront (e.g. "Productividad", "教育"). The site maps ids to Turkish names. When no row carries a genre (common for the biggest apps), the lookup step below fills it from `primaryGenreId`. `"0"` = the lookup returned nothing (not in the US store); it is not looked up again for the genre alone, but it is replaced whenever the app is looked up for ratings and the lookup returns it. A non-numeric `g` (older data) counts as missing.
- App Store link is derived, never stored: `https://apps.apple.com/app/id{id}`.
- **Rating fields** (from the iTunes Lookup API, US store, refreshed daily for every app in that day's charts):
  `r` = `averageUserRating` rounded to 1 decimal (omitted when `userRatingCount` is 0), `rc` = `userRatingCount`,
  `rd` = `releaseDate` as `YYYY-MM-DD`. Omitted entirely for apps the US lookup does not return (not in the US store).
  Ratings are per storefront; we use the US store for every app because it is the largest sample. Say so wherever they are shown.

### `data/ratings/YYYY/YYYY-MM-DD.json` — daily US rating counts, minified

```json
{ "6448311069": 12435658, "1440147259": 0 }
```

- `id -> userRatingCount` for every id the lookup returned that day; `null` for chart ids the lookup did not return (or returned without a count), so later runs that day do not ask again. Used only to compute rating-count growth; nulls are ignored.

### Lookup step (in `fetch.mjs`, after charts are merged and before writing)

- Ids to look up: every id in the merged day's charts that is not already in that day's ratings file, plus every app in `apps.json` whose genre is missing (`fillGenres` rules above).
- `https://itunes.apple.com/lookup?country=us&id=…`, batches of 150 ids, 3.5 s between calls, at most 90 calls per run, 15 s timeout; stop after 3 failed calls (the rest is retried on the next run of the same day, or skipped).
- From each result: `primaryGenreId` -> `g` (only when `g` is missing or `"0"`), `averageUserRating`/`userRatingCount`/`releaseDate` -> `r`/`rc`/`rd`, and `rc` into the day's ratings file. Ids not returned (or returned without `userRatingCount`): `g = "0"` if missing, and `r`/`rc`/`rd` are removed, so a stale US rating never outlives the app's US listing. Ids not looked up in this run (call cap, failed call) keep yesterday's values.
- Lookup failures never fail the run.

## Built data (`site/data/`, git-ignored, written by `scripts/build.mjs`)

Definitions (all use the latest raw day `D` and calendar days before it):

- **prevDate / weekAgoDate** (per chart file): `D-1` / `D-7` if that day has this chart, else null. When null, the site shows `p` / `w` = null as "no data", not as "new".

- **points(r)** = `101 - r` (rank 1 → 100 points, rank 100 → 1 point).
- **prev**: rank on `D-1` (null if absent or that day is missing).
- **week ago** `w`: rank on `D-7` (null if absent or that day is missing).
- **risers**: items in today's chart with `w != null` and `w - r > 0`, sorted by `w - r` desc, then `r` asc; top 25.
- **newcomers**: items in today's chart that are absent from every raw day in `D-7..D-1` that has this chart; sorted by `r`; top 25. Empty if no earlier day has this chart.
- **week / month / quarter**: window of 7 / 30 / 90 calendar days ending at `D`. Per app: `score = Σ points(r)` over days in the window where it is in the chart, `days` = that count, `avg` = mean rank over those days (1 decimal). Sorted by score desc, then avg asc; top 100.
- **global (per kind)**: per app on one day, `score = Σ points(r)` over all countries whose chart for that kind exists that day; `c` = number of those countries; `best` = `[cc, r, n]`: the lowest r, the first cc (alphabetical) with it, and `n` = how many countries share that rank. Global today = top 100 by score desc, then c desc. Global prev/week-ago ranks are the app's rank in the global top 100 of `D-1` / `D-7`. Global week/month/quarter: `score` summed over the window's days, `days` = days in that day's global top 100, `avg` = mean global rank over those days.

### `site/data/meta.json`

```json
{ "date": "2026-11-22", "fetchedAt": "...", "days": 31, "first": "2026-10-23",
  "countries": ["ae", "..."], "failed": ["sb/paid"], "built": "...", "ratingsDate": "2026-11-22" }
```

`countries` = codes with at least one chart on `D`. `ratingsDate` = date of the newest ratings file at or before `D` (null if none).

### `site/data/c/{cc}-{kind}.json` and `site/data/c/global-{kind}.json`

```json
{
  "date": "2026-11-22", "cc": "tr", "kind": "free", "prevDate": "2026-11-21", "weekAgoDate": null,
  "today":    [ { "id": "1", "r": 1, "p": 2, "w": 9, "h": [9, 7, 5, null, 3, 2, 1] } ],
  "risers":   [ { "id": "1", "r": 1, "w": 9 } ],
  "newcomers":[ { "id": "1", "r": 3 } ],
  "week":     [ { "id": "1", "score": 650, "days": 7, "avg": 3.4 } ],
  "month":    [ { "id": "1", "score": 2800, "days": 30, "avg": 5.1 } ],
  "quarter":  [ { "id": "1", "score": 8100, "days": 88, "avg": 6.0 } ],
  "apps": { "1": { "n": "...", "a": "...", "i": "...", "g": "6007", "r": 4.8, "rc": 12435658, "rd": "2023-05-18", "rg": 41210, "rgd": 30 } }
}
```

- `h` = ranks for `D-6..D` (7 values, null = not in chart or day missing).
- Global files also carry `s` (score), `c` (country count) and `best` on `today` items.
- `apps` holds metadata only for ids that appear in this file, so the page never loads `data/apps.json`.
  It carries `n, a, i, g` and, when known, `r, rc, rd` from `apps.json`, plus **rating-count growth**:
  `rg` = `rc` in the newest ratings file at or before `D` minus `rc` in the oldest ratings file within
  `D-30 .. D-1` that has the id; `rgd` = days between those two files. Both omitted when there is no such pair.
- A chart file exists only if that chart exists on `D`.

### `site/data/apps/{id}.json` — per-app history, last 90 days

```json
{ "id": "1", "n": "...", "a": "...", "i": "...", "g": "...", "r": 4.8, "rc": 12435658, "rd": "2023-05-18", "rg": 41210, "rgd": 30,
  "dates": ["2026-08-25", "...", "2026-11-22"],
  "ranks": { "tr/free": [null, 4, 3], "us/paid": [null, null, 88] },
  "global": { "free": [null, 12, 9] } }
```

- `dates` = every calendar day in the 90-day window ending at `D` (missing days included, their ranks null).
- `ranks` only includes charts where the app appears at least once in the window.
- `global[kind]` = the app's rank in the global top 100 per date (omitted if never in it).
- Only apps that appear in any chart in the window get a file.

## Limits we design for

- 165 countries × 4 kinds = 660 chart requests/day plus ~100 lookup calls. Raw day file ≈ 800–900 KB minified, ratings file ≈ 220 KB.
- **Git growth (measured 2026-11-21, 30 simulated days from real files with ~4% daily id churn):** git's own zlib + delta
  compression stores raw + ratings at ≈ 285 KB/day (raw ≈ 194, ratings ≈ 92) ≈ **100 MB/year**, about 1/4 of the file sizes.
  Gzipping the files made the repo *larger* (322 KB/day: git can no longer delta consecutive days) and a compact
  id-dictionary format gave no gain (308 KB/day), so files stay plain minified JSON. Deleting old files would not shrink
  history either. Re-measure with real data after ~30 days (`git count-objects -vH`); the biggest lever left is storing
  ratings weekly instead of daily (≈ −30%)..
- GitHub repo soft limit 1 GB, Pages site 1 GB, 100 GB/month bandwidth.

## Static pages (`site/top/`, git-ignored, written by `scripts/pages.mjs`)

Run after `build.mjs` (`npm run build` runs both). Reads `site/data/meta.json` and `site/data/c/*.json`; English only, no JS.

- `site/top/{cc}-{kind}.html`: one per chart file whose name matches `^([a-z]{2}|global)-(free|paid|gfree|gpaid)\.json$` (others are skipped). Today's top 100 (rank, change vs `prevDate` when it exists, name → `../app.html?id=`, developer, English genre, US rating), up to 10 risers and newcomers, links to the country's other kinds, the hub and `../#/{cc}/{kind}/today`, and a JSON-LD `ItemList` of the top 10. Rows with a non-numeric id are dropped. Every data string is HTML-escaped; JSON-LD escapes `<`, `>`, `&`.
- `site/top/index.html`: hub, Worldwide first, then countries by English name (`Intl.DisplayNames('en')`).
- `site/sitemap.xml`: home, `top/`, every chart page, `privacy.html`; `lastmod` = `meta.date`. `site/robots.txt`: allow all + `Sitemap:` line.
- Absolute URLs use `https://hacisimsek.github.io/chartlog/` (constant `BASE` in `pages.mjs`; change it with a custom domain).
- Size (2026-11-21 real data): 664 chart pages + hub ≈ 22 MB.
