# Harcama Atlası

Aylık giderleri tarayıcıda, cihaz dışına veri göndermeden takip eden Türkçe bir web uygulaması.
Elle gider girişi, PDF/CSV/Excel/görsel ekstre içe aktarma, kural tabanlı kategori önerisi,
aylık özet paneli, yedekleme ve çevrimdışı kullanım içerir. Yapay zekâ servisi veya bulut OCR
yoktur. İsteğe bağlı üye paylaşımı açılmadıkça hiçbir veri cihazdan çıkmaz.

> Uygulamanın adı `src/config/app.ts` içindeki `APP_CONFIG.name` alanından gelir. Adı yalnızca
> orada değiştirmeniz yeterlidir (sayfa başlığı, menü, PWA manifesti ve yedek dosya adları dahil).

## Hızlı başlangıç

Gereken: Node.js 20.19+ (22 veya 24 önerilir) ve npm.

```bash
npm install            # bağımlılıklar + OCR/PDF dosyalarını public/ altına kopyalar
npm run dev            # geliştirme sunucusu: http://localhost:5173
npm run build          # tür denetimi + üretim derlemesi (dist/)
npm run preview        # derlenmiş sürümü sunar: http://localhost:4173
```

Derlenmiş `dist/` klasörü herhangi bir statik sunucuda çalışır (yollar görelidir, yönlendirme
`#/` ile yapılır). Service worker ve IndexedDB için sayfa `http://localhost` veya HTTPS üzerinden
açılmalıdır; `file://` ile açmak desteklenmez.

### Denetimler ve testler

```bash
npm run typecheck      # TypeScript
npm run lint           # ESLint
npm test               # Vitest birim + entegrasyon testleri (örnek dosyaların ayrıştırılması dahil)
npm run test:e2e       # Playwright tarayıcı testleri (vite preview'i 4174 portunda kendisi başlatır)
npm run samples        # public/ornek-dosyalar altındaki sentetik örnek dosyaları yeniden üretir
```

Playwright, `PW_CHROMIUM` ortam değişkeniyle verilen Chromium'u kullanır (varsayılan, bu projenin
geliştirildiği konteynerdeki yol). Kendi makinenizde `npx playwright install chromium` çalıştırıp
`PW_CHROMIUM=` (boş) ile başlatabilirsiniz.

## Özellikler

- **Panel:** Ay seçimi; brüt gider, iadeler, net gider, işlem sayısı, en yüksek kategori.
  Önceki ay karşılaştırması yanıltmaz: veri yoksa gösterilmez, içinde bulunulan ay için önceki
  ayın aynı gün aralığıyla kıyaslanır ve bu açıkça yazılır. Kategori halkası yalnızca brüt
  giderlerden çizilir (iadeler ayrı gösterilir). Günlük gider grafiği, son işlemler, isteğe bağlı
  aylık bütçe. Dilime/kategoriye/güne tıklayınca ilgili işlemler açılır.
- **Ay döngüsü:** Ay her zaman 1'inde başlamak zorunda değil. Ayarlar'dan kişisel başlangıç günü
  (1–28) seçilir; ör. 15 seçilince ay 15'inden sonraki ayın 14'üne kadar sürer. Her grup kendi
  döngüsünü kullanabilir; paylaşılan grubun döngüsünü yalnızca grup yöneticisi belirler ve
  bütün üyelere eşitlenir.
- **Ekleyen kişi:** Paylaşılan gruptaki her harcamada (panelin son işlemleri, işlemler listesi,
  ayrıntı pencereleri) harcamayı kimin eklediği görünür. Panelde ve işlemler sayfasında "Ekleyen"
  filtresiyle yalnızca bir kişinin harcamaları gösterilebilir.
- **Elle giriş:** Kategori seçmeden gider kaydedilmez. İade ve kart ödemesi/transfer ayrı
  türlerdir. "Bu iş yeri için sonraki işlemlerde de kullan" seçeneği kural oluşturur.
  Çift tıklama iki kayıt oluşturmaz.
- **İşlemler:** Arama (Türkçe harf ve büyük/küçük harf duyarsız), dönem, kategori, tür, ödeme
  aracı ve kaynak filtreleri; düzenleme; geri alınabilir silme; toplu kategori değiştirme ve
  toplu silme; filtrelenmiş işlemleri CSV olarak dışa aktarma (formül enjeksiyonuna karşı
  korumalı). Masaüstünde tablo, mobilde kart görünümü.
- **Kategoriler ve kurallar:** Ekleme, yeniden adlandırma, simge/renk, arşivleme, başka
  kategoriye aktararak silme. Kurallar düzenlenebilir; açıklamalar normalize edilir (Türkçe
  harfler, büyük/küçük harf, boşluklar), kısa ifadeler başka kelimelerin içinde eşleşmez
  ("BP", "SHELLFISH" içinde değil yalnızca kelime olarak eşleşir). Öncelik: öğrenilmiş kurallar >
  kullanıcı kuralları > varsayılan kurallar, sonra daha özel ifade. Çakışmalar kural ekranında
  ve kural test aracında gösterilir. Kurallar kullanıcının elle seçtiği kategoriyi asla ezmez.
- **İçe aktarma:** Dosya seç → oku → incele/düzelt → onayla. Onaydan önce hiçbir şey
  kaydedilmez; kayıt tek bir IndexedDB işleminde yapılır; her aktarım geçmişte görünür ve tek
  adımda geri alınabilir.
- **Tekrar kontrolü:** Aynı dosya (SHA-256 özeti) ve aynı tarih + tutar + normalize açıklama +
  kart takma adı eşleşmeleri işaretlenir. Hiçbiri otomatik silinmez; kullanıcı "Atla" veya
  "Ayrı işlem olarak ekle" seçer.
- **Tema:** Açık, koyu ve sistem; seçim hatırlanır. Animasyonlar 150–250 ms ve
  `prefers-reduced-motion` desteklenir.
- **Hesapla giriş:** Uygulama bir Supabase adresiyle derlendiyse (yayındaki site) giriş ekranı açılır:
  e-posta ve şifreyle kayıt veya giriş, şifre sıfırlama ve (Supabase'de açıldıysa) Google ile giriş.
  Her hesabın kayıtları aynı cihazda bile ayrı veritabanında tutulur. Adres verilmeden yapılan
  derlemelerde (yerel geliştirme) giriş istenmez. Giriş testleri: `npm run test:e2e:auth`
  (Supabase taklit edilir).
- **Üyeler ve paylaşım (isteğe bağlı):** Bir grubu (ör. Ortak) paylaşıma açıp davet
  bağlantısıyla üye eklenir. Herkes kendi harcamasını ekler; grubun toplamı, kategori dağılımı
  ve kişilere göre dağılımı panelde görünür. Kendi Supabase projeniz gerekir; kurulum:
  [BULUT-KURULUM.md](BULUT-KURULUM.md). Yalnızca paylaşılan gruptaki kendi harcamalarınız buluta
  gider.
- **Demo modu:** Ayrı bir IndexedDB veritabanı kullanır; gerçek verilerle karışmaz.
- **Çevrimdışı:** PWA. Uygulama kabuğu önbelleğe alınır; OCR ve PDF dosyaları ilk
  kullanımda (veya Ayarlar'dan tek tıkla) önbelleğe alınır ve durumları Ayarlar'da gösterilir.

## Desteklenen dosyalar ve sınırlar

| Tür | Ayrıntı | Sınır |
|---|---|---|
| PDF (metin) | pdf.js ile konumlu metin; satırlar koordinata göre yeniden kurulur | 20 MB, 40 sayfa |
| PDF (taranmış) | Metni olmayan sayfalar tek tek belirlenip yerel OCR ile okunur | En çok 10 sayfa OCR |
| Şifreli PDF | Parola bu okuma için sorulur, hiçbir yerde saklanmaz | — |
| CSV | UTF-8, BOM, UTF-16, Windows-1254 (Türkçe); `;` `,` sekme ayırıcı; sütun eşleştirme ekranı | 10 MB, 5.000 satır |
| XLSX | Sayfa seçimi; formüller ve makrolar çalıştırılmaz (formül hücreleri okunmaz) | 10 MB, 5.000 satır |
| PNG / JPEG | Döndürme, kırpma, kontrast/ters çevirme; Tesseract (Türkçe + İngilizce) | 12 MB, 40 MP |

Eski `.xls` biçimi desteklenmez; Excel'de `.xlsx` veya CSV olarak kaydedip yükleyin.

**Bankaya özel ayrıştırıcı yoktur.** Tüm PDF ve görseller genel bir ekstre okuyucusuyla
işlenir ve inceleme ekranı bunu açıkça belirtir ("belirli bir bankanın gerçek ekstresiyle
doğrulanmadı"). Okunamayan belgelerde ham metin gösterilir ve satırlar elle eklenebilir.
**Sentetik örnek dosyalarla yapılan testler gerçek banka ekstreleriyle uyumluluğu kanıtlamaz.**

### Doğruluk kuralları

- Para her yerde **tam sayı kuruş** olarak tutulur. `1.234,56` → 123456 kuruş. `1.234` gibi
  belirsiz bir değer sessizce yorumlanmaz; inceleme ekranında iki olasılık sorulur.
- Tarihler saat dilimi olmadan takvim günü (`YYYY-MM-DD`) olarak tutulur.
- Döviz tutarları TL'ye eklenmez; TL karşılığı belgede yoksa satır "sorunlu" olarak gelir.
- Kart borcu ödemeleri ve transferler toplamlara girmez; "Dönem borcu", "Asgari ödeme",
  "Limit" gibi özet satırları işlem sayılmaz.
- İadeler ayrı türdür ve ait olduğu aydan bir kez düşülür.
- Taksitte yalnızca o ayki taksit tutarı yazılır (12.000 TL'lik alışverişin `3/12` taksidi
  1.000 TL); gelecek taksitler üretilmez.
- Faiz, ücret ve BSMV satırları "Banka Ücreti/Faiz" önerisiyle incelemeye gelir.
- Belgede işlem toplamı varsa kaydedilecek gider − iade ile karşılaştırılır. Dönem borcu
  gider toplamı olarak varsayılmaz.
- Tanınmayan iş yeri için kategori tahmin edilmez ("Kategori seçilmeli"); "Diğer" yalnızca
  kullanıcı açıkça onaylarsa atanır.
- OCR kalitesi (Tesseract kelime güveni) ile ayrıştırma sonucu ayrı gösterilir. OCR tutar veya
  tarih uydurmaz; okunamayan alan boş kalır ve satır sorunlu olarak işaretlenir.

## Veri, gizlilik ve yedekleme

- Finansal veriler bu tarayıcının **IndexedDB** alanında tutulur (Dexie, sürümlü şema ve
  geçişler). `localStorage` tema ve demo modu tercihi ile (paylaşım açıldıysa) Supabase oturum
  anahtarı için kullanılır.
- **Eşitleme yalnızca paylaşılan gruplar içindir.** Paylaşım açılmadıkça hiçbir şey cihazdan
  çıkmaz. Açıldığında yalnızca o gruptaki kendi harcamalarınız (tarih, tutar, tür, açıklama,
  kategori adı, not, taksit) sizin Supabase projenize gönderilir; belgeler, diğer gruplar ve
  grupsuz kayıtlar gönderilmez. Erişim kuralları veritabanında (RLS) zorlanır:
  `supabase/schema.sql`, testleri `npm run test:sql`.
- Tarayıcı verilerini temizlemek, gizli pencere kullanmak veya tarayıcıyı kaldırmak kayıtları
  kalıcı olarak silebilir. Yedekleme ekranı bunu açıkça söyler ve kalıcı depolama izni
  isteyebilir.
- **JSON yedek:** Tüm işlemler, kategoriler, kurallar, aktarım geçmişi ve ayarlar. Geri yükleme
  öncesinde dosya doğrulanır ve etkisi (mevcut/yedekteki sayılar) gösterilir; "Birleştir" veya
  "Değiştir" seçilir.
- Yüklenen belgeler saklanmaz; yalnızca onaylanan işlemler kaydedilir. Belge içeriği hiçbir
  sunucuya gönderilmez (e2e testleri dış ağ isteği olmadığını kontrol eder).
- Konsola finansal içerik yazılmaz; metin HTML olarak çalıştırılmaz.
- Tam kart numarası, CVV veya banka parolası istenmez. "Bütün verileri sil" `SİL` yazarak
  onaylanır.

## Mimari

```
src/
  config/app.ts        Uygulama adı ve içe aktarma sınırları
  domain/              Saf iş mantığı (UI ve veritabanından bağımsız, birim testli)
    money.ts           Tutar ayrıştırma/biçimlendirme (kuruş)
    dates.ts           Tarih ayrıştırma (gg.aa.yyyy, Türkçe ay adları…)
    normalize.ts       Türkçe normalizasyon, iş yeri anahtarı
    rules.ts           Kural eşleştirme, öncelik, çakışma tespiti
    classify.ts        Satır türü (gider/iade/transfer/özet), taksit tespiti
    summary.ts         Aylık özet ve önceki ay karşılaştırması
    duplicates.ts      Tekrar şüphesi
  data/                Veri katmanı
    db.ts              Dexie şeması ve geçişler
    repository.ts      Tüm okuma/yazma işlemleri (UI yalnızca bunu kullanır)
    backup.ts          Yedek biçimi ve zod doğrulaması
    seed.ts, demo.ts   Varsayılan kategoriler/kurallar, demo verisi
  import/              İçe aktarma hattı
    text.ts            Kodlama tespiti
    sheet.ts           CSV/XLSX okuma
    mapping.ts         Sütun eşleştirme → taslak satırlar
    pdf.ts             pdf.js metin çıkarma, sayfa bazında OCR'a düşme, parola
    ocr.ts             Tesseract oturumu (Web Worker, ilerleme, iptal)
    image.ts           Döndür/kırp/iyileştir
    statement.ts       Ekstre ayrıştırıcıları (StatementParser) ve genel okuyucu
    enrich.ts          Kural önerisi, tekrar işaretleme, doğrulama, kayıt paketi
  state/               React bağlamları (tema, veri, arayüz)
  components/, pages/  Arayüz
e2e/                   Playwright testleri
scripts/               Örnek dosya üretimi, OCR/PDF dosyalarının kopyalanması
public/ornek-dosyalar/ Sentetik örnek dosyalar
```

### Bankaya özel ayrıştırıcı eklemek

1. `src/import/statement.ts` içinde `StatementParser` arayüzünü uygulayan bir nesne yazın
   (`detect` belgeyi tanır, `parse` satırları ve varsa ekstre toplamını döndürür).
2. `PARSERS` dizisine genel okuyucudan **önce** ekleyin.
3. Gerçek bir ekstreyle doğrulayana kadar `verified: false` bırakın; arayüz doğrulanmamış
   okuyucular için uyarı gösterir.
4. Anonimleştirilmiş örnekle `src/import/samples.test.ts` benzeri bir test ekleyin.

### OCR ve PDF dosyaları

`npm install` sonrası `scripts/copy-assets.mjs` şu dosyaları `public/` altına kopyalar ve
`public/ocr/manifest.json` içine boyutlarını yazar:

- `ocr/worker.min.js` (tesseract.js 7 worker)
- `ocr/core/tesseract-core-*-lstm.wasm.js` (tarayıcıya göre biri kullanılır, ~3,9 MB)
- `ocr/lang/tur.traineddata.gz` (~2,1 MB), `ocr/lang/eng.traineddata.gz` (~3,0 MB)
- `pdfjs/cmaps`, `pdfjs/standard_fonts`, `pdfjs/wasm`

Bunlar uygulamayla birlikte sunulur; CDN'den indirilmez. Ayarlar ekranı OCR dosyalarının
boyutunu ve çevrimdışı önbellekte olup olmadığını gösterir.

## Örnek dosyalar (sentetik)

`public/ornek-dosyalar/` altında, uygulamanın içinden de indirilebilen, tamamen uydurma
"ATLAS BANK (SENTETİK)" verileri vardır:

- `ornek-kredi-karti-ekstresi.pdf`: metin tabanlı ekstre (taksit, iade, döviz, faiz, özet satırları, işlem toplamı)
- `ornek-taranmis-ekstre.pdf`: aynı ekstrenin yalnızca görüntüden oluşan sürümü (OCR)
- `ornek-sifreli-ekstre-parola-1234.pdf`: parolası `1234`
- `ornek-ekran-goruntusu.png`: mobil bankacılık ekran görüntüsü benzeri
- `ornek-kart-ekstresi.csv`: UTF-8 BOM, `;` ayırıcı, döviz, formül ve tırnaklı alan içerir
- `ornek-hesap-hareketleri-windows1254.csv`: Windows-1254 kodlu, borç/alacak sütunlu hesap dökümü
- `ornek-kart-hareketleri.xlsx`: iki sayfalı (Özet, Hareketler), formül hücresi içerir

## Bilinen sınırlar

- Gerçek banka ekstreleriyle doğrulanmış ayrıştırıcı yoktur; her aktarım satır satır
  incelenmelidir.
- OCR doğruluğu görüntü kalitesine bağlıdır ve düşük çözünürlüklü görsellerde tutarlar
  eksik okunabilir (bu durumda satır sorunlu olarak gelir).
- Döviz işlemleri için kur dönüşümü yapılmaz; TL karşılığını elle girmeniz gerekir.
- Yalnızca paylaşılan gruplar eşitlenir; kişisel veriler cihazlar arasında eşitlenmez.
- Paylaşım özelliği gerçek bir Supabase projesine karşı geliştirme ortamından denenemedi
  (ayrıntı: BULUT-KURULUM.md, “Sınırlar”).
