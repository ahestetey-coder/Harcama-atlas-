# Harcama Atlası: teslim raporu

Tarih: 30 Eylül 2026

## 1. Özet

Harcama Atlası, aylık giderleri yalnızca tarayıcıda (IndexedDB) tutan, Türkçe, çalışan bir web
uygulamasıdır. React 19 + TypeScript + Vite ile yazıldı. Yapay zekâ servisi, ücretli API veya
bulut OCR kullanılmaz; PDF okuma (pdf.js) ve OCR (Tesseract, Türkçe + İngilizce) cihazda
çalışır. Kaynak kod, README, sentetik örnek dosyalar ve üretim derlemesi bu klasördedir.

Tamamlananlar:

- **Panel:** Ay seçimi; brüt, iade, net, işlem sayısı ve en yüksek kategori. Önceki ay
  karşılaştırması yanıltıcı değildir; ay bitmediyse aynı gün aralığıyla kıyaslar ve bunu yazar.
  Kategori halkası yalnızca brüt giderlerden çizilir. Günlük grafik, son işlemler ve bütçe
  vardır. Dilime, kategoriye veya güne tıklayınca ilgili işlemler açılır.
- **Elle giriş:** Kategori seçmeden gider kaydedilmez. İade ve transfer ayrı türlerdir.
  "Bu iş yeri için sonraki işlemlerde de kullan" seçeneği vardır. Çift tıklama tek kayıt
  oluşturur.
- **İşlemler:** Arama, 5 filtre, düzenleme, geri alınabilir silme, toplu kategori değiştirme ve
  toplu silme. CSV dışa aktarma formül enjeksiyonuna karşı korumalıdır.
- **Kategoriler ve kurallar:** Ekleme, adlandırma, simge, renk, arşiv ve aktararak silme.
  Kurallar düzenlenebilir, önceliklidir, çakışmalar gösterilir ve bir test aracı vardır.
  Kurallar elle seçilen kategoriyi ezmez.
- **İçe aktarma:** PDF (metin, taranmış, şifreli), CSV, XLSX, PNG ve JPEG. Akış: dosya seç,
  oku, incele/düzelt, onayla. İnceleme ekranı satır satır düzenleme, satır ekleme ve hariç
  tutma, sayaçlar ve kaynak metin sunar. Kayıt atomiktir. Aktarım geçmişi tutulur ve bir
  aktarım tek adımda geri alınabilir.
- **Tekrar kontrolü:** Dosya özeti ile tarih, tutar, açıklama ve kart eşleşmesine bakılır.
  Hiçbir kayıt otomatik silinmez; kullanıcı "Atla" veya "Ayrı işlem olarak ekle" seçer.
- **Yedekleme:** JSON yedek ve doğrulamalı geri yükleme (etki önizlemesi, birleştir veya
  değiştir). "Bütün verileri sil" için SİL yazmak gerekir.
- **Görünüm ve modlar:** Açık, koyu ve sistem teması hatırlanır. Masaüstünde yan menü, mobilde
  alt menü ve öne çıkan "Gider ekle" düğmesi vardır. Ayrı bir demo modu ve PWA ile çevrimdışı
  kullanım bulunur.

## 2. Çalıştırma

```bash
cd harcama-atlasi
npm install        # bağımlılıklar + OCR/PDF dosyalarını public/ altına kopyalar
npm run dev        # geliştirme: http://localhost:5173
npm run build      # üretim derlemesi → dist/
npm run preview    # derlemeyi sunar: http://localhost:4173
```

`dist/` klasörü hazır üretim derlemesidir; herhangi bir statik sunucuyla (HTTPS veya localhost)
yayınlanabilir.

**Adres hakkında:** Uygulama geliştirme konteynerinde `http://localhost:4173` adresinde
çalıştırıldı ve test edildi. **Bu adres yalnızca o konteynerin içinde geçerlidir; sizin
bilgisayarınızdan açılamaz.** Herhangi bir dış yere yayınlanmadı, GitHub deposu bağlı
olmadığı için kod da hiçbir depoya gönderilmedi. Kendi bilgisayarınızda yukarıdaki
komutlarla çalıştırabilirsiniz.

## 3. Testler ve sonuçlar

Tüm komutlar temiz derlemede, son kod üzerinde çalıştırıldı:

| Denetim | Komut | Sonuç |
|---|---|---|
| Tür denetimi | `npm run typecheck` | Hatasız |
| Lint | `npm run lint` | Hatasız |
| Birim + entegrasyon | `npm test` | **80/80 geçti** (8 dosya) |
| Tarayıcı (Playwright, Chromium) | `npm run test:e2e` | **23/23 geçti** (masaüstü 1366px + mobil 360px) |
| Üretim derlemesi | `npm run build` | Başarılı; PWA ön belleği 43 dosya, ~3,4 MB |

**Birim testlerinin kapsamı:**

- Tutar ayrıştırma: `1.234,56`, belirsiz `1.234`, işaretler, A/B/CR ekleri, döviz.
- Tarihler: Türkçe ay adları ve saat dilimi kayması olmaması.
- Normalizasyon ve kural eşleştirme: kısa ifadelerin başka kelimelerin içinde eşleşmemesi,
  öncelik ve çakışma.
- Aylık özet: transfer hariç tutulur, iade bir kez düşülür, karşılaştırma kuralları uygulanır.
- Satır sınıflandırma: özet satırı, kart ödemesi, taksit ve faiz.
- Kodlama tespiti: BOM, Windows-1254 ve UTF-16.
- Veri katmanı: atomik ve idempotent içe aktarma kaydı, geri alma, yedek doğrulama, geri
  yükleme ve şema geçişi.
- Örnek dosyaların uçtan uca ayrıştırılması: PDF'de 14 satır; ekstre toplamı kaydedilecek
  gider eksi iadeye eşittir.

**Tarayıcı testlerinin kapsamı:**

- Kategorisiz gider reddedilir; ekle, düzenle, ara, filtrele, sil ve geri al çalışır.
- Toplu kategori değiştirme ve toplu silme çalışır. Çift tıklama tek kayıt oluşturur.
- Kayıtlar sayfa yenilendikten sonra kalır.
- Ay değiştirmede brüt, iade, net ve kategori çekmecesi tutarlıdır.
- CSV içe aktarma: 10 satırdan 7'si geçerli, 3'ü sorunlu. Sorunlu satırlar kaydedilmez ve
  dönem borcu işlem sayılmaz. Aynı dosyanın ikinci kez yüklenmesi uyarı verir. Aktarım geri
  alınabilir.
- Sorunlu satır düzeltilince (açık "Diğer" onayı) kaydedilebilir.
- XLSX sayfa seçimi ve Windows-1254 hesap dökümü okunur; hesaba gelen para gider takibi dışında
  bırakılır.
- Metin PDF okunur ve ekstre toplamıyla karşılaştırılır.
- Şifreli PDF: yanlış parola reddedilir, parola tarayıcı depolamasında kalmaz.
- **PNG ekran görüntüsü ve taranmış PDF, tarayıcıda yerel OCR ile okunur.** Bu sırada
  uygulama dışına tek bir ağ isteği bile gitmediği doğrulandı.
- Koyu tema seçimi yenilemeden sonra korunur.
- Klavye: modal içinde odak tuzağı çalışır, Esc ile kapanır ve odak açan düğmeye döner;
  fare kullanmadan gider eklenebilir.
- Yedek al, SİL onayıyla tümünü sil ve yedekten geri yükle zinciri çalışır. Bozuk yedek
  reddedilir.
- Demo modu gerçek verilerle karışmaz. CSV dışa aktarmada formül koruması çalışır.
- Mobil: alt menü, "Gider ekle" düğmesi, kart listesi ve tüm sayfalarda yatay taşma olmaması.

**Ek elle doğrulamalar:**

- Çevrimdışı çalışma betikle doğrulandı: service worker kurulduktan sonra ağ kapatıldı.
  İşlemler sayfası açıldı, PNG OCR ile okundu ve metin PDF okundu.
- 4 görünümde (1440px açık ve koyu, 390px açık, 360px koyu) 7 sayfanın ekran görüntüsü alındı
  ve incelendi. Sayfa hatası ve yatay taşma yok. Örnekler `ekran-goruntuleri/` klasöründe.

**Testlerin bulup düzelttiğim hatalar:**

- pdf.js 6'nın standart derlemesi `Map.getOrInsertComputed` kullandığından şifreli ve taranmış
  PDF'ler Chromium'da hata veriyordu. Polyfill içeren "legacy" derlemeye geçildi.
- Koddan açılan pencereler kapanınca odak açan düğmeye dönmüyordu; düzeltildi.
- Mobil logo görünmüyordu (tekrarlanan SVG kimliği); düzeltildi.
- Yedek doğrulama hataları İngilizceydi; Türkçeleştirildi.

## 4. Desteklenen dosyalar ve sınırlar

| Tür | Sınır |
|---|---|
| PDF | 20 MB, 40 sayfa. Metinsiz sayfalar sayfa sayfa belirlenir ve en çok 10 sayfa OCR ile okunur. Şifreli PDF'de parola sorulur ve saklanmaz. |
| CSV | 10 MB, 5.000 satır. UTF-8 (BOM'lu veya BOM'suz), UTF-16, Windows-1254; `;` `,` ve sekme ayırıcı; sütun eşleştirme ekranı vardır. |
| XLSX | 10 MB, 5.000 satır. Sayfa seçilir; formül ve makro çalıştırılmaz. Eski `.xls` desteklenmez. |
| PNG / JPEG | 12 MB, 40 megapiksel. Döndürme, kırpma ve kontrast/ters çevirme vardır; OCR ilerlemesi gösterilir, iptal edilip yeniden denenebilir. |

**Doğruluk kuralları:**

- Tutarlar tam sayı kuruş olarak tutulur ve belirsiz biçimler kullanıcıya sorulur.
- Tarihler saat dilimi kayması olmayan takvim günleridir.
- Döviz tutarı TL'ye eklenmez.
- Kart ödemeleri ve transferler toplamlara girmez; özet satırları işlem sayılmaz.
- İade bir kez düşülür.
- Taksitte yalnızca o ayki taksit yazılır: 12.000 TL'lik alışverişin 3/12 taksidi 1.000 TL
  gider olur ve gelecek taksitler üretilmez.
- Faiz ve ücret satırları kategori önerisiyle incelemeye gelir.
- Ekstre toplamı kontrol edilir; dönem borcu gider toplamı sayılmaz.
- Tanınmayan iş yeri "Kategori seçilmeli" olarak gelir.

**Önemli:** Bankaya özel ayrıştırıcı yoktur; genel bir okuyucu kullanılır ve arayüz bunu
açıkça söyler. **Sentetik örnek dosyalarla yapılan testler, gerçek banka ekstreleriyle
uyumluluğu kanıtlamaz.** Gerçek ekstrelerde satır bölme, sütun düzeni veya OCR kalitesi
farklı sonuç verebilir. Bu nedenle her aktarım onaydan önce incelenmelidir.

## 5. Veriler ve yedekleme

- Finansal veriler yalnızca bu tarayıcının IndexedDB alanındadır. Ayrı bir veri katmanı,
  sürümlü şema ve geçişler kullanılır. localStorage'da yalnızca tema ve demo tercihi tutulur.
- **Eşitleme yoktur.** Ayarlar ve Yedekleme ekranları bunu açıkça yazar.
- Tarayıcı verilerini temizlemek, gizli pencere kullanmak veya tarayıcıyı kaldırmak kayıtları
  siler. Düzenli JSON yedeği alın. Yedekleme ekranı ayrıca kalıcı depolama izni isteyebilir.
- Yüklenen belgeler saklanmaz ve hiçbir sunucuya gönderilmez. Konsola finansal içerik
  yazılmaz. Kart numarası, CVV veya banka parolası istenmez.
- OCR dosyaları (~17 MB; tur ve eng dil dosyaları ile motor) uygulamayla birlikte sunulur.
  Ayarlar ekranında boyutları ve önbellek durumları gösterilir.

## 6. Klasör içeriği

- `harcama-atlasi/`: kaynak kod (node_modules hariç), `README.md`, `dist/` (üretim
  derlemesi) ve `public/ornek-dosyalar/` (7 sentetik örnek dosya).
- `harcama-atlasi/ekran-goruntuleri/`: masaüstü ve mobil ekran görüntüleri.

## 7. Kalan engeller ve sınırlar

- **Yayın yok:** Dış hesap veya depo erişimi olmadığı için uygulama bir URL'de yayınlanmadı.
  Yayınlamak için `dist/` klasörünü bir statik barındırmaya (ör. GitHub Pages, Netlify)
  yüklemek veya proje için bir GitHub deposu bağlamak gerekir.
- **Gerçek banka doğrulaması yok:** Gerçek (anonimleştirilmiş) ekstre örnekleri olmadan
  bankaya özel ayrıştırıcı yazılmadı. Örnek gelirse `StatementParser` arayüzüyle eklenebilir
  (README'de anlatılıyor).
- Tarayıcı testleri yalnızca Chromium'da çalıştırıldı. Firefox ve Safari'de otomatik test
  yapılmadı. pdf.js için polyfill'li derleme seçildi, ancak Safari'de elle denenmesi önerilir.
- Döviz işlemleri için kur dönüşümü yapılmaz; TL karşılığı elle girilir.

## 8. Güncelleme (30.09.2026): görüntü ve PDF okuma iyileştirmeleri

Gerçek bir mobil banka dökümünde görülen hatalar üzerine yapıldı. Belgenin kendisi depoya eklenmedi; testler yalnızca düzenini taklit eden uydurma verilerle yazıldı.

- **Tutar sütunu:** "Tutar" başlıklı sütun önceliklidir; ParafPara/Puan/Bonus gibi sütunlar tutar sayılmaz.
- **İşaret düzeni:** Harcamaları eksi (−) yazan belgeler algılanır; artı tutarlar iade, indirim veya ödeme olarak yorumlanır ve içe aktarma ekranında not gösterilir.
- **Gereksiz satırlar:** Sayfa başlığı (tarih ve saat), sayfa numarası, bakiye ve limit satırları işlem sayılmaz. 0,00 tutarlı puan satırları hariç tutulur.
- **Taksit:** "500,00 TL / 6 - 1. Taksit" biçimi okunur; kalan borç alışveriş toplamı sanılmaz.
- **Bitişik şehir adı:** "LOKANTAANKARA" gibi açıklamalar ayrılır.
- **Mobil ekranlar:** Tarihin işlemin altında olduğu düzen, yılsız "27 Eylül" tarihleri, Unicode eksi işareti ve saatler desteklenir.
- **OCR düzeltmeleri:** "₺" simgesinin "£" veya "L" okunması, çift işaret ve rakam yerine harf okunması düzeltilir.
- **Taranmış ekstreler:** İki satıra bölünen sütun başlıkları ve tutarı alt satırda olan iki satırlı işlemler okunur.
- **Kategori kuralları:** Yeni varsayılan kurallar eklendi (akaryakıt, lokanta, fatura vb.). Var olan veritabanlarına geçişle eklenir; silinmiş kurallar geri gelmez.

**Ölçüm.** `npm run bench` komutu, `scripts/bench/cases` altındaki 5 zor sentetik örneği okur: iki mobil ekran görüntüsü (biri koyu tema), bir eğik ve gürültülü telefon fotoğrafı, farklı düzende bir PDF ve düşük kaliteli taranmış bir PDF. Toplam 38 işlem var.
- Doğru okunan işlem (tarih, tutar ve tür) sayısı 22'den 38'e çıktı.
- Bu örnekler sentetiktir ve gerçek banka uyumluluğunu kanıtlamaz.

**Testler.** 91 birim testi ve 23 uçtan uca test geçti.

## 9. Güncelleme (01.10.2026): üyeler ve ortak harcamalar

İstek: üye eklemek, üyeyi bir gruba dahil etmek, üyenin kendi harcamasını ekleyebilmesi ve ortak harcamaların panelde toplam ve kategorilere göre görülmesi. Seçilen yöntem: bulut eşitleme.

- **Nasıl çalışır:** Kullanıcının kendi açacağı ücretsiz Supabase projesi kullanılır. Bir grup “Paylaşıma aç” ile buluta bağlanır, “Üye davet et” ile 7 gün geçerli bir bağlantı üretilir. Üye bağlantıyı açıp hesap oluşturur ve gruba katılır.
- **Ne gider:** Yalnızca paylaşılan gruptaki kendi harcamalarınız (tarih, tutar, tür, açıklama, kategori adı/simgesi/rengi, not, taksit). Diğer gruplar, grupsuz kayıtlar, belgeler ve ekstre metinleri cihazdan çıkmaz.
- **Güvenlik:** Satır düzeyi güvenlik ve yalnızca kimlik denetleyen fonksiyonlarla yazma. Herkes yalnızca kendi işlemini değiştirebilir. Uygulamada da üyenin eklediği kayıt salt okunur gösterilir; silme ve toplu işlemler bu kayıtları atlar. Paylaşılan grup, paylaşımdan ayrılmadan silinemez.
- **Panel:** Grup filtresinden paylaşılan grup seçilince toplam ve kategori dağılımı tüm üyelerin harcamalarını içerir. Yeni “Kişilere göre” kartı kimin ne harcadığını gösterir. İşlem listesinde ekleyen üyenin adı görünür.
- **Kurulum:** `BULUT-KURULUM.md`.

**Testler.**
- Güvenlik kuralları yerel PostgreSQL 16 üzerinde test edildi (`npm run test:sql`): üye olmayan okuyamaz, başkasının işlemi değiştirilemez, süresi dolan davet reddedilir vb.
- Eşitleme mantığı bellek içi sahte bulutla iki cihaz senaryosunda test edildi (`src/cloud/sync.test.ts`).
- 104 birim testi ve 28 uçtan uca test geçti.
- Supabase bağlayıcısıyla `harcama-atlasi` projesi oluşturuldu ve şema uygulandı. Gerçek veritabanında geri alınan bir işlem içinde denendi: grup oluşturma, davet, katılma ve işlem ekleme çalıştı; gruba üye olmayan kullanıcı hiçbir işlem göremedi.
- Uygulamanın tarayıcıdan Supabase'e bağlanması geliştirme ortamından denenemedi (ağ erişimi yok). İlk gerçek kullanımda bir sorun çıkarsa bildirin.

## 10. Güncelleme (01.10.2026): giriş ekranı ve hesaplar

İstek: herkesin kendi hesabıyla girdiği, kolay kayıt ve giriş ekranları; Google ile giriş.

- **Giriş zorunlu:** Yayındaki sitede uygulama açılmadan önce giriş ekranı gelir. Sekmeler "Giriş yap" ve "Kayıt ol"; ayrıca şifre göster/gizle, "Şifremi unuttum" (e-postayla yenileme bağlantısı) ve yeni şifre belirleme ekranı var.
- **Google ile giriş:** "Google ile devam et" düğmesi, Supabase'de Google girişi açıldığında kendiliğinden görünür. Açmak için Google Cloud'da bir OAuth istemcisi gerekir; adımlar `BULUT-KURULUM.md` dosyasında.
- **Hesaba göre ayrı veri:** Bir cihazdaki mevcut kayıtlar o cihazda ilk giriş yapan hesaba ait olur. Aynı cihazda başka bir hesap girerse ona ayrı ve boş bir veritabanı açılır. Çıkış yapınca kayıtlar silinmez.
- **Ad:** Kayıtta yazılan ad (veya Google hesabındaki ad), grup üyelerinin gördüğü ad olarak kullanılır.
- **Sınır:** Kişisel harcamalar hâlâ yalnızca cihazda tutulur; başka bir cihazda aynı hesapla girildiğinde yalnızca paylaşılan gruplar gelir.

**Testler.**
- 104 birim testi ve 28 uçtan uca test geçti.
- Giriş ekranı için 3 yeni uçtan uca test geçti (`npm run test:e2e:auth`): yanlış şifre, kayıt, şifre sıfırlama, Google düğmesi, iki hesabın verilerinin ayrı kalması ve çıkış. Bu testlerde Supabase taklit edilir.
- Gerçek Supabase ile tarayıcıdan giriş bu ortamdan denenemedi.

## 11. Güncelleme (01.10.2026): ay döngüsü

İstek: ayın başlangıç ve bitiş gününü kullanıcı ve grubun yöneticisi belirleyebilsin.

- **Kişisel döngü:** Ayarlar › Ay döngüsü. Başlangıç günü 1–28 arasında seçilir; bitiş günü sonraki ayın bir önceki günüdür (ör. 15 → 15 Eyl – 14 Eki). 29–31 seçilemez, çünkü her ayda bulunmaz.
- **Grup döngüsü:** Kategoriler ve gruplar › Harcama grupları › düzenle › Ay döngüsü. Boş bırakılırsa kişisel ayar kullanılır. Panelde o grup seçiliyken dönemler grubun döngüsüne göre hesaplanır.
- **Paylaşılan grup:** Döngüyü yalnızca grubu paylaşıma açan kişi (grup yöneticisi) değiştirebilir. Bu kural veritabanında da zorlanır (`ha_set_group_cycle`). Değişiklik eşitlemeyle bütün üyelere gelir; diğer üyelerde alan kilitli görünür.
- **Etkilenen ekranlar:** panel (toplamlar, günlük grafik, önceki dönemle karşılaştırma), ay seçici, işlemler listesindeki dönem filtresi, içe aktarma özeti ve kayıt bildirimi.
- Bir dönem, başladığı ayın adıyla anılır: 15 Eyl – 14 Eki dönemi "Eylül" dönemidir.

**Testler.** 111 birim testi, 29 uçtan uca test, 3 giriş testi ve SQL güvenlik testleri geçti. Yeni testler: dönem hesapları, döngüyle aylık özet, yöneticinin döngüyü belirleyip üyeye eşitlenmesi, üyenin değiştirememesi (hem eşitleme katmanında hem SQL'de), ayar ekranından panelin değişmesi.
