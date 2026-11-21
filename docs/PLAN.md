# App Store Liste Arşivi: Uygulama Planı

> **Not:** Bu ilk plandır (TR/US). Kapsam sonradan Apple'ın desteklediği 165 ülkeye ve ülkeler arası global sıralamaya genişletildi. Güncel ve bağlayıcı veri sözleşmesi [DATA.md](DATA.md); kurulum ve çalışma şekli [README](../README.md).

Son güncelleme: 21 Kasım 2026. Kodlama 22 Kasım sabahı başlıyor.
Dayanak: canlı testler ve deep-research raporu (22 kaynak, 25 iddia doğrulandı, 5 iddia çürütüldü).

## 1. Hedef ve kapsam

Apple App Store listelerini her gün arşivleyen, ücretsiz ve giriş gerektirmeyen bir site.

- **Takip edilecek listeler:** TR ve US; ücretsiz ve ücretli; ilk 100. Toplam 4 liste.
- **Sayfalar:** bugünün listesi, yükselenler ve yeni girenler, haftalık/aylık özet, uygulama başına sıra geçmişi.
- **Ziyaretçi sayımı.**
- **Maliyet:** 0 TL. Ticari özellik yok; GitHub'ın Pages kuralları da ticari kullanımı yasaklıyor.
- **Önce local:** Her şey localde çalışır ve test edilir. Sonra `hacisimsek` hesabında public repo açılır.

**Kapsam dışı (şimdilik):** kullanıcı hesabı, e-posta bildirimi, Google Play, indirme tahmini, ekstra ülkeler.

## 2. Araştırmanın netleştirdikleri

| Konu | Bulgu | Plana etkisi |
|---|---|---|
| Apple RSS v2 feed | 4 liste de anahtarsız çalışıyor. En fazla 100 kayıt dönüyor; 101, 150 ve 200 isteyince 500/504 hatası geliyor. US ücretli liste bir kez JSON olmayan yanıt döndü, tekrar denemede düzeldi. | Tekrar deneme ekle. Yanıtta 100 kayıt yoksa commit etme. |
| Feed alanları | Kayıtlarda sadece 8 alan var: `id`, `name`, `artistName`, `artworkUrl100`, `genres`, `url`, `releaseDate`, `kind`. **Sıra alanı yok**, sıra dizideki konumdan çıkıyor. %10 kayıtta `genres` boş. | `rank = index+1`. Bilinmeyen alanlar gelince hata verme. |
| Feed'in güncellenme saati | Apple belgelemiyor; tahmin ettiğimiz saat de doğrulanamadı. | İlk günlerde gözlemle. Veri değişmemişse commit yok. |
| iTunes Lookup API | Dakikada yaklaşık 20 istek; Apple sınırı değiştirebilir. Toplu sorguda tek hatalı ID bütün sorguyu bozabiliyor. | Puan sayısı Faz 5'e kalır, isteğe bağlı. |
| Puan sayısı artışı | İndirme sayısını sadece kabaca gösteriyor; tek kaynak bir blog. | "Günlük yeni puan" olarak gösterilir, asla "indirme" diye yazılmaz. |
| **İkonlar ve isimler (hukuki risk)** | Apple'ın lisansı sadece kendi uygulamasını tanıtan geliştiricileri kapsıyor. Search API şartlarına göre ikon sadece uygulamayı tanıtmak için ve mağaza linkiyle birlikte kullanılabilir. Apple kaldırılmasını isteyebilir. | İkonu Apple'ın sunucusundan göster, kopyalama. Her satır App Store sayfasına link versin. Footer'a "Apple ile bağlantılı değildir" yaz. Apple logosu ve rozeti kullanma. **Ayarla kapatılabilen, sadece metin gösteren mod** olsun. |
| GitHub Pages | Site en fazla 1 GB, aylık 100 GB trafik (aşılırsa yavaşlatma). Repo için önerilen sınır 1 GB. | Günlük dosyalar küçük kalmalı. Yılda birkaç on MB; sorun değil. |
| 60 gün kuralı | Public repoda 60 gün hareket olmazsa zamanlanmış iş kapanıyor. Günlük commit sayacı sıfırlıyor. | Sitede "son güncelleme" tarihi göster. Bozulursa GitHub hata e-postası atar. |
| GitHub Actions şartları | Kazıma işi açıkça yasak değil, ama gri alan. Ağır yük oluşturmak ve Actions'ı backend gibi kullanmak yasak. | Günde 1 hafif çalışma. Repo, kendi sitesini yayınlıyor gibi konumlansın. |
| GitHub Flat Data | Bu iş için yapılmış hazır action Ağustos 2026'da arşivlendi. | Kendi kısa scriptimizi yazarız. |
| Ziyaretçi sayımı | **GoatCounter:** ücretsiz, çerez yok, IP diske yazılmıyor, herkese açık sayaç gösterebiliyor. **Cloudflare:** çalışıyor, ama github.io adreslerinin desteklendiği doğrulanmadı. GA4 ve KVKK ayrıntıları doğrulanmadı. | **GoatCounter seçildi.** Kısa bir gizlilik notu eklenir; bu hukuki görüş değil. |
| Rakipler | Herkese açık tek tarihsel veri seti 2019'da bitiyor. Rakiplerle ilgili iddiaların çoğu doğrulanamadı. | "Boşluk var" iddiası henüz kanıtlanmadı. Faz 3'ten önce rakipler elle kontrol edilmeli. |

## 3. Teknik kararlar

Teknoloji seçimi araştırmada doğrulanamadı, aşağıdaki seçimler mühendislik kararı.

- **Dil: Node 20+, bağımlılık yok.** Hazır `fetch` ve `node --test` yeterli, `package.json`'da bağımlılık olmayacak. Ön yüz de JS olduğu için tek dil kullanılır.
- **Ön yüz:** Düz HTML, CSS ve vanilla JS. Framework ve grafik kütüphanesi yok. Sıra grafiği elle çizilen küçük bir SVG olur.
- **Build:** `node scripts/build.mjs` ham veriden özet JSON dosyalarını üretir. Tarayıcı hesap yapmaz, hazır dosyaları okur.
- **Local sunucu:** `python3 -m http.server -d site`, kurulum gerektirmez.
- **Yayın:** Actions artifact ile Pages'e deploy edilir. Build çıktısı repoya commit edilmez.

### Klasör yapısı

```
data/raw/{tr,us}/{top-free,top-paid}/YYYY-MM-DD.json   # günlük ham kayıt (commit edilir)
data/apps.json                                         # id → ad, geliştirici, ikon, kategori, url
scripts/fetch.mjs                                      # Apple'dan çeker, doğrular, kaydeder
scripts/build.mjs                                      # özetleri site/data altına yazar
scripts/*.test.mjs                                     # node --test
site/index.html, site/app.html, site/app.js, site/style.css
site/data/  (build çıktısı, .gitignore'da)
.github/workflows/daily.yml
```

### Günlük ham kayıt formatı (küçük tutmak için)

```json
{ "date": "2026-11-22", "feedUpdated": "...", "ids": ["1234", "5678", "..."] }
```

Sıra = dizideki konum + 1. Uygulama bilgileri sadece `apps.json`'da tutulur, ham dosyalarda tekrarlanmaz.

### Build çıktıları (`site/data/`)

- `latest-{ülke}-{liste}.json`: bugünün listesi; dünküne göre değişim, YENİ etiketi.
- `risers-{ülke}-{liste}.json`: 7 günlük en büyük yükselişler ve yeni girenler.
- `summary-{ülke}-{liste}-{week|month}.json`: ortalama sıra ve listede kalınan gün sayısı.
- `apps/{id}.json`: her listedeki sıra geçmişi.
- `meta.json`: son güncelleme tarihi ve kaç günlük veri olduğu.

## 4. Fazlar

### Faz 0: Veri toplayıcı (22 Kasım sabahı, local)

- `fetch.mjs`: 4 liste çekilir. 3 deneme yapılır, aralarında bekleme olur. Her yanıtta 100 kayıt olduğu ve JSON'un geçerli olduğu kontrol edilir.
- Gelen veri ham dosyaya ve `apps.json`'a yazılır. Aynı gün ikinci kez çalışırsa dosyanın üzerine yazar.
- Tekrar deneme, doğrulama ve sıra hesabı için testler yazılır; testler örnek (fixture) verilerle çalışır.
- **Tamamlandı sayılır:** `node scripts/fetch.mjs` 4 dosya üretiyor ve `node --test` geçiyor.

### Faz 0.5: Repo ve günlük cron (22 Kasım, aynı gün; karar verildi)

- Önce `gh auth login` ile `hacisimsek` hesabına geçilir.
- `hacisimsek` hesabında public repo açılır. Sadece toplayıcı, testleri ve `daily.yml` push edilir.
- `daily.yml`: günlük cron ve elle tetikleme (`workflow_dispatch`). Önce testler, sonra `fetch.mjs` çalışır. Veri değiştiyse commit atılır, değişmediyse atılmaz. İzin olarak sadece `contents: write` verilir.
- Site kodu localde kalır, Faz 3'te push edilir.
- **Neden aynı gün:** Geçmiş veri sonradan alınamaz. Site localde gelişirken veri GitHub'da birikir.
- **Tamamlandı sayılır:** Elle tetiklenen ilk çalışma 4 dosyayı commit etmiş olur, ertesi gün zamanlanmış çalışma da commit atar.

### Faz 1: Build ve özetler (local, 1-2 gün)

- `build.mjs` yukarıdaki çıktıları üretir.
- 7-30 günlük veri birikene kadar sahte (fixture) geçmiş veriyle test edilir.
- **Tamamlandı sayılır:** Sahte veriyle yükselenler ve haftalık özet doğru çıkıyor, testler geçiyor.

### Faz 2: Site (local, 3-4 gün)

- Önce 2-3 farklı tasarım yönü gösterilir ve biri seçilir. Tasarımda hazır "vibe-coded" efektler (aurora arka plan, parlayan kenarlar vb.) kullanılmaz.
- Sayfalar: Bugün, Yükselenler, Hafta/Ay, Uygulama detayı. Ülke ve liste seçimi; kategori filtresi.
- Sadece metin gösteren mod, Apple'la bağlantı olmadığını belirten not ve "son güncelleme" tarihi eklenir.
- Mobil uyum ve erişilebilirlik (klavyeyle kullanım, kontrast) kontrol edilir.
- **Tamamlandı sayılır:** `python3 -m http.server -d site` ile bütün sayfalar telefon ve masaüstü genişliğinde çalışıyor.

### Faz 3: Yayın (yarım gün)

- `daily.yml` genişletilir: veri çekilir, commit atılır, build alınır, Pages'e deploy edilir.
- GoatCounter hesabı açılır, snippet eklenir, gizlilik notu yazılır.
- Yayın öncesi rakipler elle kontrol edilir: 42matters'ta TR seçilip 60 gün öncesine bakılır, Appfigures'ın ücretsiz sıralama sayfası incelenir.
- **Tamamlandı sayılır:** Site `hacisimsek.github.io/<repo>` adresinde açılıyor ve GoatCounter ziyaretleri sayıyor.

### Faz 4: Gerçek veriyle doğrulama (veri biriktikçe)

- 7. gün: haftalık özet ve yükselenler gerçek veriyle kontrol edilir.
- 30. gün: aylık özet kontrol edilir.
- Apple'ın feed'i hangi saatte güncellediği gözlenir ve cron saati buna göre ayarlanır.

### Faz 5: İsteğe bağlı eklemeler

- Puan sayısı artışı ("günlük yeni puan"). Toplu Lookup sorgusu yapılır, istekler arasında bekleme olur, tek hatalı ID bütün sorguyu bozmasın diye önlem alınır.
- Yeni ülkeler, özel alan adı (yaklaşık 10 $/yıl; tek ücretli kalem), GA4 ve çerez onayı.

## 5. Açık sorular

1. Apple feed'i her gün hangi saatte güncelliyor? (Faz 4'te gözlenecek.)
2. Feed'den gelen ikonları göstermek Apple şartlarına uygun mu? (Risk, sadece metin modu ve kaldırmaya hazır olmakla azaltılıyor.)
3. Çerezsiz analitik için KVKK'ya göre aydınlatma metni gerekiyor mu? (Gizlilik notu konacak, gerekirse bir avukata sorulmalı.)
4. Rakiplerde gerçekten bu boşluk var mı? (Faz 3'ten önce elle kontrol.)

## 6. Yarın başlamadan önce gerekenler

- Node: v25.8.1 kurulu ✓ (21.11 kontrol edildi)
- Repo adı: öneri `chartlog-tr`. İsimde "App Store" kullanılmaması önerilir, Apple'ın markası.
- GoatCounter hesabı Faz 3'te açılacak, yarın gerekmiyor.
