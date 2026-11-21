# chartlog

Apple App Store üst listelerini her gün arşivleyen, ücretsiz ve giriş gerektirmeyen bir site.

- **Kapsam:** 165 ülke (`countries.json`), her ülke için ücretsiz ve ücretli ilk 100 **uygulama** ve **oyun** listesi (günde 660 liste). Uygulamalar Apple'ın RSS v2 feed'inden, oyunlar eski iTunes RSS'in oyun kategorisinden (genre 6014) gelir; oyunlarda alt tür (Bulmaca, Strateji…) gösterilir.
- **Sıklık:** Günde bir kez (UTC 03:17), UTC 15:17'de yedek çalışma.
- **Görünümler:** Ana sayfa **Popüler · 30 gün**: son 30 günde listede en yüksekte ve en uzun kalan uygulamalar (her gün için `101 − sıra` puanı toplanır). Ayrıca 7 ve 90 günlük popüler listeler, bugün, yükselenler, yeni girenler; bütün ülkeleri birleştiren global liste ve uygulama başına 90 günlük geçmiş.
- **Radar:** Sayfanın üstünde, seçili ülke ve liste için dört sinyal: hızla yükselenler, yeni girenler, popüler ama puanı düşük olanlar, değerlendirmesi hızla artanlar; ayrıca popülerlik–puan dağılım grafiği. Yükselenler ve yeni girenler için en az 8 günlük veri gerekir. Radar gizlenebilir.
- **Fırsat sinyalleri:** Her gün listedeki uygulamaların puanı (★), değerlendirme sayısı, değerlendirme artışı (en fazla 30 gün) ve çıkış tarihi Apple'ın iTunes Lookup API'sinden alınır (ABD App Store'u). "Puanı 4,0'ın altında" ve "Son 12 ayda çıktı" filtreleri, popüler ama kullanıcıların memnun olmadığı ya da yeni çıkıp hızla yükselen uygulamaları süzer. Apple kopya uygulamaları reddeder (App Review Kural 4.1); aynı fikre farklı bir yaklaşım getirmek serbesttir.
- **Canlı site:** https://hacisimsek.github.io/chartlog/
- **Dil:** Varsayılan İngilizce (site global kitleye hitap ediyor). Türkçe, sağ üstteki TR/EN düğmesiyle seçilir (seçim tarayıcıda saklanır). Doğrudan link için `?lang=tr` veya `?lang=en`. Metinler `site/common.js` içindeki `TR` ve `EN` nesnelerinde.
- **Arama motoru sayfaları:** `/top/` altında her ülke ve liste için sunucuda üretilmiş, JavaScript gerektirmeyen İngilizce sayfalar (ör. `top/us-free.html`), hepsine link veren bir dizin (`top/index.html`), `sitemap.xml` ve `robots.txt`. Ayrıntı aşağıda, *SEO* bölümünde.

## Nasıl çalışır

```
GitHub Actions cron (günde 2 kez)
  │  scripts/fetch.mjs: 165 ülke × 4 liste = 660 istek
  ▼
data/raw/YYYY/YYYY-MM-DD.json + data/apps.json   (repoya commit edilir)
  │  scripts/build.mjs
  ▼
site/data/   (özetler; repoya girmez)
  │  scripts/pages.mjs
  ▼
site/top/*.html + sitemap.xml + robots.txt   (statik SEO sayfaları; repoya girmez)
  │  actions/deploy-pages
  ▼
GitHub Pages: hacisimsek.github.io/chartlog/
```

- Apple'ın feed'i isteklerin %35-40'ını rastgele bekletiyor. Bu yüzden her liste 5 sn zaman aşımıyla 6 kez denenir, iş 1 dakika arayla ikinci bir tur daha atar ve bu tur sadece eksik kalan listeleri dener. Uygulama ve oyun feed'leri ayrı değerlendirilir: bir feed'in listelerinin en az %90'ı geldiyse o feed kaydedilir, gelmeyenler `failed` alanında listelenir. Bir feed %90'ın altında kalırsa sadece o feed'in yeni verisi atılır; diğeri yine commit edilip yayınlanır, ama çalıştırma hata verir ve GitHub sahibine e-posta atar. İki feed de çökerse hiçbir şey yazılmaz ve eski site yayında kalır.
- Aynı gün tekrar çalışınca sadece eksik veya başarısız listeler tekrar denenir. Yedek çalışma bu yüzden eksikleri tamamlar. Gün tamamsa hiçbir şey yapmaz.
- Elle tetikleme: Actions sekmesi → `daily` → *Run workflow*. `force` seçilirse bugünün bütün listeleri yeniden çekilir.
- Kod `main`'e push edilince site yeniden build edilir ve yayınlanır (veri çekilmez).

## Localde çalıştırma

Node 20 veya üstü gerekir; siteyi localde sunmak için python3 de gerekir (`npm run serve`/`npm run dev` onu kullanır). Bağımlılık yok, `npm install` gerekmez.

```sh
npm test                               # testler (ağa çıkmaz)
npm run fetch -- --countries tr,us     # sadece TR ve US listelerini çek
npm run dev                            # build alır, siteyi sunar
```

Sonra tarayıcıda http://localhost:8000 adresini aç.

## Veri formatı

Ham veri, uygulama bilgileri ve build çıktıları [docs/DATA.md](docs/DATA.md) dosyasında tanımlı. Bu dosya bütün scriptler ve site için bağlayıcıdır.

## Sınırlar

- **İndirme sayısı yok.** Apple bunu yayınlamıyor. Sadece sıra var.
- **Google Play yok (karar, 21.11.2026).** Google Play'in resmi, herkese açık bir liste kaynağı yok. Eski `collection/topselling_*` adresleri artık listeyi vermiyor. Listeler sadece Google'ın belgesiz iç API'sinden (`/_/PlayStoreUi/data/batchexecute`) geliyor, `robots.txt` ise `Disallow: /_` ile buna otomatik erişimi yasaklıyor. Bu yüzden kazıma yapılmıyor. Google resmi bir kaynak açarsa yeniden değerlendirilir.
- **Geçmiş, ilk toplama gününden başlar.** Apple eski listeleri vermiyor; geriye dönük veri yok.
- **Boyut:** Günlük dosyalar yaklaşık 1 MB (sıralar + değerlendirme sayıları), ama git bunları kendisi sıkıştırıp ardışık günlerin farkını sakladığı için repo günde yaklaşık 285 KB, yılda yaklaşık 100 MB büyür (30 günlük simülasyonla ölçüldü). GitHub'ın önerdiği 1 GB sınırına yaklaşık 10 yıl var. Dosyaları gzip ile sıkıştırmak repoyu büyüttüğü için yapılmıyor; ayrıntı `docs/DATA.md`'de.
- **GitHub'ın 60 gün kuralı:** Hareketsiz repolarda zamanlanmış işler 60 gün sonra durdurulur. Günlük veri commit'leri bu sayacı sıfırlar.

## SEO

Ana site hash ile yönlenen, tarayıcıda çizilen bir uygulama (`#/us/free/today`); arama motorları bunu iyi indekslemez. Bu yüzden `scripts/pages.mjs` her build'de `site/data`'dan taranabilir statik sayfalar üretir (`npm run build` iki adımı da çalıştırır):

- `site/top/{ülke}-{liste}.html` (ör. `us-free.html`, `jp-gfree.html`, `global-paid.html`): benzersiz başlık ("Top Free iPhone Apps in United States — App Store Chart, Nov 21, 2026"), ilk 3 uygulamayı içeren açıklama, canonical URL, günün ilk 100'ü tablo olarak, haftanın yükselenleri ve yeni girenleri, JSON-LD `ItemList`, ülkenin diğer listelerine, dizine ve etkileşimli görünüme linkler.
- `site/top/index.html`: bütün sayfaların dizini (önce Worldwide, sonra ülkeler İngilizce adlarına göre).
- `site/sitemap.xml` ve `site/robots.txt`. Üçü de üretilir, repoya girmez.
- Apple'dan gelen her metin (uygulama, geliştirici adı) HTML'de ve JSON-LD'de escape edilir; ülke kodu, liste türü ve uygulama numarası kullanılmadan önce doğrulanır.

**Sahibin yapması gerekenler:**

- Site `hacisimsek.github.io/chartlog/` altında bir *proje sitesi*. Tarayıcılar `robots.txt`'yi yalnızca alan adının kökünden (`hacisimsek.github.io/robots.txt`) okur, bizim `chartlog/robots.txt` dosyamızı okumaz. Bu yüzden sitemap'i elle bildir: [Google Search Console](https://search.google.com/search-console) ve [Bing Webmaster Tools](https://www.bing.com/webmasters) üzerinde `https://hacisimsek.github.io/chartlog/` için mülk ekle (URL öneki), sonra `https://hacisimsek.github.io/chartlog/sitemap.xml` adresini gönder.
- Özel bir alan adı (ör. `chartlog.app`) SEO'ya yardım eder (kendi `robots.txt`'si, marka adı, kalıcı adres) ama yıllık ücretlidir; bütçe 0 olduğu için şimdilik yok. Alınırsa `pages.mjs` içindeki `BASE` sabitini değiştir.

## Ziyaretçi sayımı (GoatCounter)

Çerez kullanmayan, ücretsiz GoatCounter kullanılır.

1. https://www.goatcounter.com adresinde ücretsiz hesap aç ve bir kod seç (örnek: `chartlog` → `chartlog.goatcounter.com`).
2. Bu kodu `site/config.js` dosyasına yaz.
3. Commit edip `main`'e push et. Site yeniden yayınlanır ve ziyaretler sayılmaya başlar.

## Kurulum notu (GitHub Pages)

Repo ayarlarında *Settings → Pages → Build and deployment → Source* değeri **GitHub Actions** olmalı.

## Hukuki notlar

- Bu proje Apple Inc. ile bağlantılı değildir; Apple tarafından desteklenmez veya onaylanmaz.
- Uygulama ikonları kopyalanmaz, doğrudan Apple'ın sunucusundan (CDN) gösterilir. Her satır sitenin uygulama sayfasına, o sayfa da App Store'a link verir.
- Sitede ikonları kapatıp sadece metin gösteren bir ayar vardır.
- Hak sahibi isterse ilgili içerik kaldırılır.
- App Store, Apple Inc.'in ticari markasıdır.

## Yol haritası

- Daha fazla görünüm: kategori ve ülke karşılaştırmaları.
- Feed'in güncellenme saati gözlenip cron saatinin ayarlanması.

## Lisans

Kod [MIT](LICENSE) lisanslıdır.

Toplanan veriler (`data/` klasörü) Apple'ın herkese açık RSS feed'inden gelir ve MIT lisansının kapsamında değildir.
