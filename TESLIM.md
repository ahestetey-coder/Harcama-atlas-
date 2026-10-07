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

## 12. Güncelleme (01.10.2026): ekleyen kişi ve kişi filtresi

İstek: panelde ve diğer listelerde ortak gruba eklenen giderlerin kimin eklediği görünsün; kişi bazında filtrelenebilsin.

- **Ekleyen rozeti:** Paylaşılan gruptaki her işlemde ekleyenin adı (kendi kayıtlarınızda "Siz") renkli bir rozetle gösterilir: panelin son işlemleri, işlemler listesi ve panelden açılan ayrıntı pencereleri.
- **Kişi filtresi:** Ortak bir grupta başka üye varsa, panelde ve işlemler sayfasında grup filtresinin altında "Ekleyen: Herkes / Siz / üyeler" seçenekleri çıkar. Seçilen kişiye göre toplamlar, kategori dağılımı, günlük grafik, gruplar kartı ve liste süzülür. İşlemler sayfasının filtre panelinde de "Ekleyen kişi" seçimi vardır. Seçim iki sayfa arasında korunur.
- **Kişilere göre kartı:** Bir kişiye dokununca bütün panel o kişiye göre süzülür; tekrar dokununca filtre kalkar.
- "Siz" seçiliyken grup filtresi "Tüm gruplar" ise kişisel harcamalarınız da görünür; yalnızca ortak harcamalarınızı görmek için grubu da "Ortak" seçin.

**Testler.** 111 birim testi, 29 uçtan uca test ve 3 giriş testi geçti. Üyeler testi; rozetleri, panelde ve işlemler sayfasında kişi filtresini doğrular.

## 13. Güncelleme (01.10.2026): üst alan düzeni ve tema düğmesi

- Panel ve İşlemler sayfalarında grup ve "Ekleyen" filtreleri tek bir şeritte, etiketli iki satır olarak toplandı. Mobilde satırlar alt satıra kaymaz; seçenekler yana kaydırılır ve sağ kenar yumuşakça solar.
- Ay seçici mobilde tam genişlikte; İşlemler sayfasındaki CSV düğmesi mobilde yalnızca simge olarak görünür.
- Hata düzeltmesi: mobilde İşlemler sayfasında "Gider ekle" düğmesi alt menüdeki + düğmesine ek olarak bir de üstte görünüyordu (gizleme sınıfı düğmenin kendi görünürlük sınıfıyla çakışıyordu). Panelde "İçe aktar" düğmesi için de aynısı geçerliydi.
- Açık/koyu tema: mobil üst çubukta ve masaüstü yan menüde güneş/ay düğmesi eklendi. Ayarlar › Görünüm'de "Sistem" seçeneği de durur. Seçim cihazda hatırlanır.

## 14. Güncelleme (01.10.2026): yönetici paneli

İstek: kayıtlı kullanıcıları görebileceğim, şifrelerini yönetebileceğim bir yönetici paneli.

- **Sayfa:** Yönetici paneli (menüde yalnızca yöneticiye görünür). Özet kutuları (toplam hesap, son 7 günde yeni, son 7 günde giriş, dondurulmuş), arama, durum filtresi (Tümü / Etkin / Dondurulmuş / Onaysız) ve kullanıcı listesi: ad, e-posta, giriş yöntemi (Google / e-posta), son giriş, ortak grup ve harcama sayısı.
- **Hesap işlemleri:** şifre yenileme e-postası gönderme, e-postayı elle doğrulama, hesabı dondurma (giriş yapamaz, açık oturumları kapanır) veya dondurmayı kaldırma, hesabı silme (sahibi olduğu ortak gruplar ve buluttaki harcamalarıyla). Kendi hesabınız ve yönetici hesapları dondurulamaz ve silinemez.
- **Şifreler:** Supabase şifreleri geri çevrilemez biçimde (hash) saklar; yönetici dahil kimse göremez. Bu yüzden panel şifre göstermez, şifre yenileme bağlantısı gönderir.
- **Güvenlik:** Yetki veritabanında denetlenir (`ha_admins` tablosu ve `ha_admin_*` fonksiyonları). Gizli servis anahtarı tarayıcıya konmadı.
- **Sınır:** Dondurulan hesabın elindeki giriş belgesi en fazla bir saat daha geçerli kalabilir; yenilenemez.
- **Durum:** Yönetici fonksiyonları canlı veritabanına bu oturumdan eklenemedi (yetki onayı gerekiyor). Kurulum SQL'i paylaşılan klasörde: `harcama-atlasi-kurulum/yonetici-paneli.sql`.

**Testler.** SQL testleri (yönetici olmayan listeyi göremez, hesap silemez, yönetici tablosunu okuyamaz; yönetici dondurur, oturumları kapanır, e-posta doğrular, hesap siler, kendini donduramaz), giriş testlerine yönetici paneli testi eklendi (Supabase taklit edilerek). Gerçek Supabase'de denenmedi.

## 15. Güncelleme (02.10.2026): gideri paylaştır

İstek: ortak grupta birden fazla üye varsa, grubun giderini üye sayısına bölerek paylaştıran bir düğme.

- Panelde paylaşılan bir grup seçiliyken ve grupta en az iki üye varken grup filtresinin altında "Gideri paylaştır" kutusu çıkar (dönem toplamı ve kişi başı tutarla). "Kişilere göre" kartında da "Paylaştır" bağlantısı vardır.
- Açılan pencere seçili dönemin grup giderini gruptaki bütün üyelere eşit böler: her kişinin ödediği, alacağı veya borcu ve denkleşmek için en az sayıda ödeme ("Mert → Siz 130,00 ₺"). Hiç harcaması olmayan üye de payını öder.
- Kart ödemesi/transfer sayılmaz; iadeler ödeyenin harcamasından düşer. Kuruş artığı kaybolmaz, birer kuruş olarak dağıtılır.
- "Özeti paylaş" telefonda paylaşım menüsünü açar (WhatsApp vb.), bilgisayarda özeti panoya kopyalar.
- Bu bir hesaplaşma özetidir; kayıtlar değişmez, yeni işlem oluşturulmaz.

**Testler.** 115 birim testi (4 yeni: eşit bölme, harcamasız üye, transfer/iade, kuruş artığı) ve 29 uçtan uca test geçti; üyeler testi paylaştırma penceresini de doğrular.

## 16. Düzeltme (02.10.2026): yeni cihazda ortak grup eşitlenmiyordu

Sorun: Bir hesap ortak gruba bir tarayıcıda davetle katıldıktan sonra başka bir yerde (ana ekrana eklenen uygulama, başka tarayıcı veya telefon) açıldığında, oradaki "Ortak" grubu buluttaki gruba bağlı olmadığı için hiçbir şey eşitlenmiyordu: ne diğer üyelerin harcamaları geliyor ne de orada "Ortak" seçilen harcamalar gönderiliyordu. (iPhone'da ana ekrana eklenen uygulamanın verisi Safari'den ayrıdır.)

Düzeltme: Eşitleme sırasında hesabın üyesi olduğu bütün bulut grupları bu cihazdaki aynı adlı gruba (yoksa yeni bir gruba) kendiliğinden bağlanır. Bağlanınca o cihazda daha önce "Ortak" seçilmiş harcamalar da gönderilir.

Test: aynı hesabın ikinci cihazı davetsiz eşitlenir, diğer üyenin harcamasını alır ve kendi harcamasını gönderir.

Ek düzeltme: otomatik eşitleme yalnızca cihazda bağlı bir grup varsa başlıyordu; bu yüzden ilk düzeltme yeni cihazda hiç çalışmıyordu (Supabase kayıtlarında Kariyer hesabından girişten sonra hiç grup isteği gelmediği görüldü). Artık oturum açıkken her zaman eşitlenir. Giriş testine "girişten sonra grup listesi istenir" kontrolü eklendi.

## 17. Ortak gider paylaşımı ve kişisel "Tümü" görünümü (02.10.2026)

**"Tümü" artık kişiseldir** (panel ve İşlemler):
- Ortak gruba başka üyelerin eklediği giderler sayılmaz; kendi eklediğiniz giderler, ortak grupta olsa da sayılır. Bu kural yönetici ve üyeler için aynıdır.
- Yönetici bir dönemi paylaştırdıysa o dönem için grubun giderleri yerine yalnızca size düşen pay sayılır ("Ortak payı" satırı, salt okunur).
- Ortak grup seçildiğinde grubun bütün giderleri, ekleyen kişiyle birlikte eskisi gibi görünür. Kişi filtresi yalnızca bir grup seçiliyken çıkar.

**Paylaştırma:**
- Yalnızca grup yöneticisi "Gideri paylaştır" ile dönemi paylaştırır, günceller veya geri alır. Paylaşım buluta (ha_settlements) kaydedilir ve üyelere eşitlenir; kayıtlar silinmez veya değişmez.
- Paylaştırıldıktan sonra grubun giderleri değişirse pencere bunu gösterir; yönetici "Paylaşımı güncelle" ile yeni tutarları yansıtır.
- Üye paylaşımı yalnızca görür ("Paylaşımı gör").

**Dönemler:**
- Herkes kendi dönemini Ayarlar'dan belirler; "Tümü" bu döneme göre hesaplanır.
- Paylaşılan grubun dönemi her zaman yöneticinin belirlediği dönemdir (belirlenmediyse takvim ayı). "Tümü" ekranında her ortak grup için yöneticinin dönemi ve o dönemin paylaştırılıp paylaştırılmadığı hatırlatılır ("Yönetici Ortak giderini sizinle paylaştı · payınız …").

**Kurulum:** Sunucuya yeni tablo ve iki fonksiyon gerekir (supabase/schema.sql'de; ayrıca gider-paylasimi.sql). Kurulmadan önce uygulama eskisi gibi eşitlenir, yalnızca paylaştırma "Bulut veritabanı kurulmamış" uyarısı verir.

**Testler:** 122 birim testi (yeni: Tümü hesabı, paylaşımın eşitlenmesi, yalnızca yöneticinin paylaştırması, paylaşım okunamazsa eşitlemenin sürmesi), 30 uçtan uca test (üye görünümü), 5 giriş testi (yöneticinin paylaştırıp geri alması) ve SQL güvenlik testleri geçti.

### 17a. Düzeltme (02.10.2026)

- **Dönem ayarı:** 17. bölümde ortak grup yöneticinin dönemine sabitlenmişti; bu yüzden kişisel dönem ayarı etkilemiyordu. Eski haline döndü: grup için dönem ayarlanmışsa o, yoksa herkesin kendi dönemi geçerli.
- **Tümü listesi:** Üyelerin ortak giderleri Tümü listesinde de görünür ("Toplama girmez" etiketiyle) ama toplamlara girmez.
- **Paylaşım farkı:** Paylaştırılınca kendi giderleriniz yerinde kalır; ödediğinizle payınız arasındaki fark eklenir. Fazla ödeyene "<Grup> paylaşımı · alacak" (gelir), az ödeyene "<Grup> paylaşımı · borç" (gider). Fark, paylaşımdan sonra eklenen kendi giderlerinize göre de güncel kalır.
- Paylaşım, görüntülenen dönemle çakışan paylaşımı bulur; yönetici sonradan dönem ayarını değiştirirse eski paylaşım gösterilir ve geri alınabilir.

## 18. Mobil düzen, hız ve "+" menüsü (03.10.2026)

- **Klavye:** Giriş alanları mobilde 16 px (iOS odaklanınca sayfayı büyütmez). Alttan açılan pencereler klavyenin üstünde kalır (visualViewport ile `--kb`/`--vvh`), odaklanan alan görünür alana kaydırılır, klavye açıkken alt menü gizlenir. Görünüm etiketine `interactive-widget=resizes-content` eklendi.
- **Sığma:** Yatay taşma engellendi (`overflow-x: clip`), çentik/alt çubuk için güvenli alan boşlukları eklendi; formun yapışkan "Kaydet" alt çubuğu altında içerik görünmüyor. 390 px genişlikte tüm sayfalarda taşma yok (Chromium öykünmesi).
- **Hız:** Sayfa geçişindeki bekleyen çıkış animasyonu kaldırıldı (kısa giriş animasyonu kaldı). İşlem, kategori, grup, ayar ve üye verileri tek seferde okunup tüm sayfalarca paylaşılıyor; her geçişte IndexedDB yeniden okunmuyor. Sayfa kodları boşta önceden yükleniyor. Sabit arka plan yalnızca masaüstünde.
- **"+" menüsü:** Ortadaki düğme artık "Ne eklemek istersiniz?" menüsünü açar: Gider, İade, Kart ödemesi; Ekstre yükle (PDF/CSV/Excel), Ekran görüntüsü, Fotoğraf çek; Kategori, Grup, Üye davet et. Seçilen belge doğrudan İçe aktar akışına gider ve yine yalnızca cihazda okunur. Masaüstünde "Gider ekle" yanındaki düğmeden aynı menü açılır.
- **Sınır:** Gerçek iOS/Android klavye davranışı bu ortamda test edilemedi; Chromium mobil öykünmesiyle doğrulandı. Gerçek telefonda kontrol edilmeli.

## 19. Mobil uygulama altyapısı (06.10.2026)

- Aynı kod Capacitor 8 ile Android (`android/`) ve iOS (`ios/`) projesine çevrildi. Uygulama kimliği `com.harcamaatlasi.app` (mağazada yayınlandıktan sonra değiştirilemez). Web sürümü ve GitHub Pages aynen çalışmaya devam eder.
- Uygulama simgesi ve açılış ekranı `assets/` içindeki görsellerden üretildi (`npx @capacitor/assets generate`).
- Uygulama içinde servis çalışanı (PWA güncelleme sorusu) kapalıdır; güncellemeler mağazadan gelir. Durum çubuğu temaya uyar.
- `.github/workflows/mobile.yml` her gönderimde Android hata ayıklama APK'sını derler (Artifacts'tan indirilebilir) ve iOS'u simülatör için imzasız derler.
- Komutlar: `npm run mobile:sync`, `npm run mobile:android` (Android Studio), `npm run mobile:ios` (Mac + Xcode).
- **Sınır:** Bu ortamda Android SDK indirilemediği için derleme yalnızca GitHub Actions'ta doğrulanır. Mağaza için imzalı sürüm, geliştirici hesapları açılınca eklenecek.

## 20. Mağaza şartları: hesap silme, gizlilik, giriş (06.10.2026)

- **Hesabımı sil:** Ayarlar'da yeni "Hesap" kartı (e-posta, Çıkış yap, Hesabımı sil). Silme "SİL" yazılarak onaylanır; `ha_delete_my_account()` hesabı, yöneticisi olunan ortak grupları, diğer gruplara eklenen harcamaları, üyelikleri ve davetleri buluttan siler. İsteğe bağlı olarak (varsayılan açık) bu cihazdaki kayıtlar da silinir. SQL testi ve uçtan uca test eklendi. Canlı veritabanına `harcama-atlasi-kurulum/hesap-silme.sql` dosyasının bir kez çalıştırılması gerekir.
- **Gizlilik politikası:** `public/gizlilik.html` (yayında `/gizlilik.html`). Giriş ekranından ve Ayarlar'dan bağlantı verildi; mağaza kayıtlarında bu adres kullanılacak. Ayarlar'daki eski "senkronizasyon yoktur" metni güncel duruma göre düzeltildi.
- **Giriş:** Mobil uygulamada Google ile giriş düğmesi gösterilmez (yalnızca e-posta). Web sürümünde değişiklik yok. Mobil uygulamadaki doğrulama ve şifre yenileme e-postaları web adresine döner.

## 21. Paketler (Ücretsiz / Plus / Plus+) ve Plus bütçe planı (06.10.2026)

- **Paket altyapısı:** `src/domain/plans.ts` hangi özelliğin hangi pakette olduğunu tanımlar; `src/state/plan.tsx` geçerli paketi verir, `PlanGate` kilitli özelliklerde tanıtım kartı gösterir. Bugünkü bütün özellikler Ücretsiz pakettedir.
- **Satın alma henüz yok:** Herkesin satın aldığı paket şimdilik Ücretsiz. Ödeme, uygulama mağazalarda yayımlanınca App Store / Google Play aboneliğiyle bağlanacak. Bu sırada yönetici hesabı, demo modu ve yerel kullanım "Paketler" sayfasından Plus veya Plus+ önizlemesi açabilir (yalnızca bu cihazda, `ha:plan-preview`).
- **Paketler sayfası** (`#/paketler`): üç paketin karşılaştırması; hazır olan özellikler işaretli, diğerleri "Yakında".
- **Plus bütçe planı** (`#/butce`): kategori limitleri, haftalık (Pazartesi–Pazar) bütçe, kullanılmayan bütçenin bir sonraki döneme devri (yalnızca bir dönem, birikmez), %70/%80/%90 uyarı eşiği, uyarı listesi ve günlük ortalamaya dayalı ay sonu tahmini. Hesaplar kişisel (Tümü) net gidere göre yapılır. Ayarlar kaydında (`budgetPlan`) saklanır ve yedeğe dahildir. Panelin bütçe kartında uyarı sayısı görünür.
- **Sınır:** Ay sonu tahmini henüz abonelik/düzenli ödemeleri ayrıca hesaba katmıyor; o özellik eklenince katılacak. Uyarılar uygulama içinde gösterilir, telefon bildirimi henüz yok.

## 22. Plus: düzenli ödemeler, taksitler ve hatırlatmalar (06.10.2026)

- **Düzenli ödemeler** (`#/odemeler`): abonelik, düzenli ödeme (kira, fatura) veya elle taksit eklenir; haftalık/aylık/yıllık sıklık, ilk ödeme günü, kategori, hatırlatma (ödeme günü, 1, 3 veya 7 gün önce), durdurma. Yeni tablo `recurring` (veritabanı şeması v6), yedeğe dahil.
- **Taksitler:** İçe aktarılan ekstrelerdeki "5/12 taksit" bilgisinden kalan taksitler, son taksit tarihi ve kalan tutar otomatik çıkarılır; ekstrede görünmeyen taksit elle eklenebilir.
- **Gelecek dönemlerin ödeme yükü:** önümüzdeki 6 dönem için düzenli ödeme ve taksit toplamı (yığılmış çubuk, ekran okuyucu için tablo).
- **Öneriler:** Son aylarda her ay benzer gün ve tutarda tekrarlanan harcamalar önerilir; kullanıcı "Ekle" demeden kaydedilmez, "×" ile gizlenen öneri tekrar gösterilmez.
- **Hatırlatma:** Hatırlatma zamanı gelen ödemeler panelin üstünde ve "Önümüzdeki 30 gün" listesinde gösterilir. Telefon bildirimi (uygulama kapalıyken) henüz yok.
- **Ay sonu tahmini** artık düzenli ödemeleri tempoya katmıyor; dönem sonuna kadar kalan düzenli ödeme ve taksitleri ayrıca ekliyor.

## 23. Plus: birikim hedefleri ve ayrıntılı raporlar (06.10.2026)

- **Birikim hedefleri** (`#/hedefler`): Tatil, Araç, Acil durum fonu, Ev, Eğitim hazır seçenekleri veya serbest ad; hedef tutar, isteğe bağlı hedef tarihi, simge ve renk. Her hedefte biriken tutar, ilerleme çubuğu, kalan tutar, hedef tarihe yetişmek için aylık gereken tutar, son 3 ayın ortalaması, "bu tempoyla" tahmini tamamlanma ayı ve durum (Yolunda, Geride, Tarihi geçti, Tarihsiz, Tamamlandı). Para ekleme ve çekme kaydedilir (biriken tutardan fazlası çekilemez), hareketler tek tek silinebilir, hedef arşivlenebilir. Yeni tablo `goals` (veritabanı şeması v7), yedeğe dahil. Para ekleme bir kayıttır, banka hesabında işlem yapmaz.
- **Raporlar** (`#/raporlar`): seçili dönemin toplamı, önceki döneme göre fark ve son 3 dönem ortalaması; kategorilerin ortalamayla veya önceki dönemle karşılaştırması; en çok harcanan iş yerleri (önceki dönem tutarıyla); son 6 dönemin net harcama grafiği (ekran okuyucu için tablo).
- **Tasarruf uyarıları** cihazda kurallarla hazırlanır: toplam harcama ortalamanın %15 ve 500 TL üstündeyse, bir kategori ortalamanın %30 ve 500 TL üstündeyse (olası tasarruf tutarıyla), daha önce görülmeyen bir iş yerine 2.000 TL ve üstü harcandıysa, bir kategori ortalamanın belirgin altındaysa. Süren dönemde "ortalamanın altında" mesajı verilmez. Hiçbir veri dışarı gönderilmez.
- **Sınır:** Karşılaştırma için önceki dönemlerde kayıt gerekir; eşikler sabit kurallardır, kişiye göre öğrenmez.

## 24. Plus: Varlıklarım (06.10.2026)

- **Varlıklar** (`#/varliklar`): mevduat, döviz, fon, altın, hisse, nakit ve diğer. Altın (gram, çeyrek, yarım, tam, Cumhuriyet), döviz (USD, EUR, GBP) ve mevduat için hazır seçenekler. Her varlık miktar, birim, alış tarihi ve birim alış fiyatıyla eklenir; sonradan alış/satış veya para yatırma/çekme kaydedilir. Eldekinden fazlası satılamaz.
- **Değerleme:** Fiyatlar (mevduatta güncel bakiye) kullanıcı tarafından girilir; her varlıkta fiyatın kaynağı ("Fiyat elle girildi" veya "İşlem fiyatı") ve tarihi görünür. 30 günden eski fiyatlar için uyarı gösterilir. Otomatik piyasa fiyatı yok.
- **Özet:** net varlık (varlıklar − borçlar), toplam varlık, borçlar, net yatırılan tutar ve yatırım kazancı/kaybı ayrı ayrı. Kazanç ortalama maliyet yöntemiyle hesaplanır; satış yapılmışsa gerçekleşen ve eldeki (gerçekleşmemiş) kazanç ayrı gösterilir. Mevduat faizi kazanç olarak görünür.
- **Dağılım:** türlere göre çubuk ve yüzdeli liste (sabit renk sırası, açık ve koyu temada doğrulanmış palet).
- **Zaman içinde değer:** Yalnızca kullanıcının işlem veya fiyat girdiği günlerde, o güne kadar bilinen fiyatlarla hesaplanan değer ve yatırılan tutar çizilir. Aradaki günler için değer üretilmez; iki farklı günden az veri varsa grafik gösterilmez.
- **Borçlar:** elle eklenen borçlar (kredi kartı, ihtiyaç/konut kredisi…) ve "Düzenli ödemeler"deki kalan taksitlerin otomatik toplamı (net varlığa katılması kapatılabilir).
- Yeni tablo `assets` (veritabanı şeması v8), yedeğe dahil. Yatırım tavsiyesi verilmez.
- **Sınır:** Fiyatlar elle girilir; otomatik fiyat kaynağı seçildiğinde eklenecek. Komisyon ve vergi ayrıca tutulmuyor (birim fiyata dahil edilebilir).

## 25. Plus: gelişmiş paylaşım (06.10.2026)

- **Paylaşım yöntemi:** Panelde paylaşılan grup seçiliyken "Gideri paylaştır" penceresinde grup yöneticisi gideri eşit, yüzdeyle (toplam 100 olmalı), ağırlıkla (ör. 2:1) veya kişi başı tutarla bölebilir (tutar yazılmayanlar kalanı eşit böler). Paylaşıma yalnızca seçili üyeler katılır. Kural tutarsızsa uyarı çıkar ve paylaştırma düğmesi kapanır. Paylar kuruşu kuruşuna toplamı korur. Seçilen kural yöneticinin cihazında saklanır; üyeler yöneticinin kaydettiği payları görür.
- **Ödeme durumu:** Paylaştırılmış dönemde "Denkleşmek için" listesindeki her ödeme, yönetici veya ödemenin tarafları tarafından "Ödendi" işaretlenebilir; tarih ve işaretleyen kişi bütün üyelere görünür. Paylaşım geri alınınca işaretler de silinir.
- **Ortak bütçe:** Panelde bir grup seçiliyken bütçe kartı o grubun bütçesini gösterir. Paylaşılan grupta bütçeyi yalnızca yönetici belirler, üyeler görür; yerel gruplarda herkes kendi cihazında belirler.
- **Grubun düzenli giderleri:** Düzenli ödeme bir gruba bağlanabilir (ör. ortak kira). Ödeme günü gelince "Düzenli ödemeler" sayfasında tek dokunuşla o grubun gideri olarak eklenir; aynı ödeme ikinci kez eklenmez.
- **Kurulum:** Ödeme durumu ve ortak bütçe için canlı veritabanında `harcama-atlasi-kurulum/gelismis-paylasim.sql` bir kez çalıştırılmalı. Çalıştırılmadan önce uygulama bu iki özellik dışında aynen çalışır (eşitleme hata vermez). SQL testleri ve eski şemaya üzerine kurulum denendi.
- **Sınır:** Plus kontrolü kişinin kendi paketine göredir; ödeme işaretlemek de Plus ister, işaretleri görmek herkese açıktır.

## 26. Plus+: Finansal Özgürlük Yolculuğum, gelecek senaryoları ve finansal bilgi (06.10.2026)

- **Mini anket** (`#/yolculuk`): hedef (finansal bağımsızlık, finansal güvence, erken emeklilik veya serbest ad), süre, hedefte aylık yaşam gideri, aylık net gelir, zorunlu giderler, gelir düzeni, korunacak harcama öncelikleri ve çekim oranı (varsayılan %4). Uygulamada bulunan bilgiler (son 3 dönemin ortalama gideri, düzenli ödemelerin aylık toplamı, Varlıklarım'daki birikim ve borç) ankete kendiliğinden gelir ve "Uygulamadan" diye işaretlenir; bulunamayanlar "Eksik" diye sarı görünür. Gelir uygulamada tutulmadığı için kullanıcı girer. Rota, kullanıcı "Doğruladım" dedikten sonra oluşur ve ayarlarda (cihazda, yedeğe dahil) saklanır.
- **Rota:** bütçe dengesi, acil durum birikimi (zorunlu giderin 3 ayı), borç yükü (bir aylık gelirin altı), düzenli birikim (gelirin en az %10'u) ve hedef yaşam gideri. Her aşamada ölçüt, durum, sonraki adım ve ilerleme çubuğu var; aşamalar birbirinden bağımsız ilerler. Haritadaki işaret gerçek ilerlemeye göre yürür (hareket azaltma ayarında animasyonsuz). Yeni tamamlanan aşama bir kez kutlanır.
- **Göstergeler:** finansal güvence (hızlı kullanılabilir birikimin zorunlu giderleri kaç ay karşıladığı), hedef ilerlemesi (net varlık / hedef birikim; kendi koyduğunuz para ve piyasa değişimi ayrı) ve tahmini rota (olumlu ile temkinli varsayım arasında yıl aralığı).
- **Gelecek senaryoları** (`#/senaryolar`): yolculuk bilgileriyle başlar. Ek aylık birikim, gelir kaybı (ay ve o sürede aylık gider), büyük harcama (tutar ve yıl), enflasyon ve üç senaryonun reel getiri varsayımı değiştirilebilir (varsayılan temkinli %0, orta %2, olumlu %4). Sonuçlar bugünün parasıyla veya nominal görülebilir; grafik, hedefe ulaşma yılı ve yıllara göre tablo. Olasılık veya garanti sunulmaz.
- **Finansal bilgi** (`#/ogren`): risk, likidite, masraf ve vergiler, çeşitlendirme, enflasyon/reel getiri ve acil durum birikimi üzerine kısa genel metinler. **Ekonomi gündemi** bölümünde haber yok: bir haber kaynağı bağlanmadığı için uygulama haber göstermez ve kendi başına haber yazmaz. Kaynak bağlandığında her haber kaynağı ve tarihiyle, haber / yorum / tahmin ayrı etiketle görünecek.
- Hiçbiri alım-satım veya portföy tavsiyesi vermez. Hesaplar cihazda yapılır, hiçbir veri dışarı gönderilmez.
- **Henüz yok:** Yapay zekâ koçu (sağlayıcı kararı bekleniyor) ve ekonomi haberleri (kaynak kararı bekleniyor) "Yakında" olarak görünür.
- **Sınır:** Tahminler sabit getiri varsayımlarıyla yapılan basit hesaplardır; vergi, komisyon ve gelir artışı modellenmez.

## 27. Plus+: Koçum (borç planı, yatırım tutarı, yapay zekâ sohbeti, günlük ekonomi özeti) (06.10.2026)

- **Borç bilgisi:** Varlıklarım'daki borçlara aylık faiz ve aylık ödeme (asgari/taksit) eklenebilir. Boş Varlıklarım sayfasında da "Borç ekle" var. Düzenli ödemelerdeki kalan taksitler faizsiz, sabit planlı borç olarak plana katılır.
- **Plan** (`#/koc`): gelir − ortalama gider fazlasının gelir düzenine göre %90/%75/%60'ı plana ayrılır (kalanı tampon). Sıra: önce borçlar (asgariler ödenir, kalan tutar en yüksek faizli veya seçilirse en küçük borca gider), sonra 3 aylık zorunlu gider kadar acil durum birikimi, sonra her ay düzenli yatırım. Her aşamanın ay aralığı ve aylık tutarı, borçsuz olma tarihi, toplam faiz, yalnızca asgari ödemeye göre faiz farkı ve hedef birikime tahmini tarih gösterilir. "Borç ödemelerim giderlerime dahil" seçeneği çift sayımı önler.
- **Yapılandırma hesabı:** Seçilen borçlar girilen yeni faiz ve vadeyle tek krediye çevrilirse aylık taksit ve faiz farkı hesaplanır. Teklif değil, hesaplamadır.
- **Koç mesajları (kurallarla):** anket eksikse, gider gelirden fazlaysa, asgari ödemeler sığmıyorsa, bütçe limiti dolmak üzereyse veya aşıldıysa, ödeme günü yaklaşıyorsa, bir borç kapandıysa ve her ayın planı. Okundu olarak işaretlenebilir; panelin üstünde okunmamış mesaj şeridi çıkar. Hazır sorular (borcum ne zaman biter, ne kadar yatırıma ayırmalıyım, acil durum birikimim yeterli mi, hedefime ne zaman ulaşırım, bütçem nasıl) cihazda yanıtlanır.
- **Yapay zekâ sohbeti (OpenAI):** Kişi izin verirse serbest soru sorabilir. Yalnızca özet rakamlar gönderilir (gelir, gider, adsız borç bakiyeleri ve faizleri, birikim, plan, hedef, dönem bütçesi); ekstre, işlem, iş yeri adı, e-posta gönderilmez. Sohbet sunucuda saklanmaz, "Sohbeti sil" ile ekrandan silinir. Kişi başı günlük sınır 30 soru. Sunucu fonksiyonu `coach-chat` Supabase'e yüklendi; OpenAI anahtarı eklenene kadar "yanıt veremiyor" mesajı döner.
- **Günlük ekonomi özeti:** `coach-news` sunucu fonksiyonu her sabah yöneticinin eklediği X hesaplarının (X API, ücretli) ve RSS adreslerinin son 24 saatini okur, OpenAI yalnızca bu maddelerden Türkçe özet yazar. Kaynak, bağlantı ve tarih modelden değil gerçek maddeden eklenir; her madde haber / yorum / tahmin olarak işaretlenir. Özet Koçum'da ve Finansal bilgi sayfasında görünür. Kaynaklar Yönetici paneli'nden eklenir.
- **Kurulum:** `harcama-atlasi-kurulum/koc-ve-haberler.sql` (tablolar ve günlük görev) ve `KOC-KURULUM.md` (OpenAI anahtarı, CRON_SECRET, X Bearer Token). SQL testleri ve eski şemaya iki kez kurulum denendi. OpenAI ve X çağrıları anahtar olmadığı için gerçek servise karşı denenmedi; sohbet ve özet akışı sahte sunucu yanıtlarıyla test edildi.
- **Sınır:** Koç belirli bir yatırım ürünü önermez, alım-satım tavsiyesi vermez. Telefona bildirim (push) mağaza uygulamasıyla gelecek; şimdilik mesajlar uygulama içinde görünür.

## 28. Ortak ekonomi araştırma ajanı ve hafızalı kişisel koç (07.10.2026)

- **Yerini aldığı:** 27. bölümdeki günlük özet (`coach-news`) kaldırıldı; yerine editör onaylı ortak raporlar geldi. Kurulum dosyası `harcama-atlasi-kurulum/arastirma-ajani.sql`, eski `koc-ve-haberler.sql`'in yerini alır. Ayrıntılı kurulum `KOC-KURULUM.md`.
- **Kaynaklar** (Yönetici paneli > Araştırma ajanı): 4 grup (Türkiye resmî, küresel resmî, haber ve uzman, piyasa fiyatı). Her kaynakta erişim türü, kullanım koşulu durumu (inceleniyor / uygun / izin yok) ve notu, kontrol sıklığı, son başarılı kontrol, son madde tarihi (gecikme) ve son hata görünür. Yalnızca açık ve koşulları uygun kaynaklar okunur. Önerilen resmî kaynaklar kapalı ve "inceleniyor" olarak eklendi. Okunabilen türler: RSS/Atom, TCMB kur dosyası, X (X API anahtarıyla).
- **Fiyatlar:** osman'ın kararıyla şimdilik yalnızca TCMB gösterge kurları; önceki yayına göre değişim kuralla hesaplanır. Fiyat grubuna yalnızca resmî kur dosyası veya API konabilir (veritabanı kuralı); haber sayfası fiyatı kullanılmaz.
- **Toplama** (`research-collect`, 10 dakikada bir): her madde kaynak bağlantısı, yazar/kurum, yayın ve alınma zamanı, dönem, içerik türüyle saklanır. Tekrar anahtarı (kaynak kimliği veya sadeleştirilmiş bağlantı) aynı maddenin iki kez kaydını önler. Başlık benzerliğiyle aynı olayın kopyaları birleştirilir ve ilk resmî açıklamaya bağlanır. Yayın takvimindeki açıklamaların çevresinde kaynak 10 dakikada bir kontrol edilir. Hata kaynağın satırına yazılır, sonraki çalışma kaldığı yerden devam eder.
- **Uzmanlar:** ad, unvan, kurum, alan, kişisel görüş / kurum adına, seçim gerekçesi. Uzmana bağlı kaynakların maddeleri uzman yorumu (beklenti dili varsa tahmin) sayılır.
- **Raporlar** (`research-report`): günlük (06.30), haftalık (pazartesi), aylık (ayın 1'i) taslak ve yöneticinin elle başlattığı acil bülten. Her konu 7 başlıkla yazılır; kaynak listesi gerçek maddelerden kurulur, her bölüm kaynak numarası taşır. Yayın öncesi denetim: kaynaksız iddia, listede olmayan kaynak, eski veri ve eski uzman görüşü, kaynakta geçmeyen rakam, yatırım yönlendirmesi ve kesinlik dili. Taslak yalnızca yönetici onayıyla ve denetim temizse yayınlanır; düzeltmeler sunucuda yeniden denetlenir ve değişiklik geçmişine yazılır.
- **Kullanıcı tarafı:** Finansal bilgi > Ekonomi gündemi yayınlanmış raporları türe göre süzerek 7 bölüm ve kaynaklarıyla gösterir (resmî veri, haber, uzman yorumu, tahmin, kişisel görüş etiketleri). Eski günlük rapor "X gün önce yayınlandı" diye işaretlenir. Koçum'da son rapor özetlenir.
- **Kişisel koç:** Koçun hafızası kartında kullanıcı hangi bilgi gruplarının (gelir, giderler, borçlar, birikim ve hedefler, bütçe) gönderileceğini seçer, gönderilen değerleri görür; hedef, tercih ve not ekler, düzeltir, siler. Uzun sohbetin eski kısmı özetlenip hafızaya "Sohbet özeti" olarak yazılır. Hafıza cihazda (ayarlarda, yedeğe dahil) durur; sunucuda saklanmaz, ortak havuza girmez. Koç son yayınlanan raporu ve kaynaklarını bilir.
- **Günlük sınır:** 30 soru, yalnızca başarılı yanıt sayılır, Türkiye saatiyle gece yarısı yenilenir; teknik hatada hak düşmez. Sınır yönetici panelinden değişir.
- **Yönlendirme denetimi:** Her koç yanıtı sunucuda kurallarla denetlenir (belirli araç + al/sat/tut/yönel, hedef fiyat, portföy yüzdesi, "muhtemelen yükselir" gibi yön tahmini, kesinlik dili). Yakalanırsa model bir kez uyarılıp yeniden yazdırılır, yine olmazsa hazır güvenli metin gider. 23 örnek yanıtla birim testi var; 10 örnek sohbetlik güvenlik testi (`coach-eval`) panelden ve haftalık çalışır.
- **Limitler ve ölçümler:** günlük kaynak ve piyasa isteği, aylık araştırma ve koç token sınırları. Ölçümler (son 30 gün): kaynaksız iddia, kaynakta olmayan rakam, eski veri oranı, resmî açıklamayı yakalama süresi (medyan), rapor düzeltme oranı, raporda ve koçta yakalanan yönlendirme, son güvenlik testi.
- **Sınırlar:** OpenAI ve X çağrıları gerçek anahtarlarla denenmedi; testler taklit yanıtlarla yapıldı. Önerilen RSS adreslerinin çoğu 07.10.2026'da yayında görüldü (Fed, ECB, BLS, SEC, BIS, TCMB kurları); IMF ve TCMB PPK adresi doğrulanamadı. TÜİK ve KAP için açık RSS bulunamadı. Veri/API/sayfa türleri için okuyucu yok. Olay eşleştirme başlık benzerliğine dayanır; farklı dillerdeki aynı haberi birleştirmez.

## 29. Hesaba paket tanımlama (07.10.2026)

- Yönetici paneli > kullanıcı penceresinde **Paket** (Ücretsiz / Plus / Plus+) ve isteğe bağlı bitiş tarihi seçilir. Mağaza ödemesi bağlanana kadar paketler böyle tanımlanır; satırı olmayan hesap Ücretsiz'dir, süresi biten paket kendiliğinden Ücretsiz sayılır.
- Uygulama hesabın paketini açılışta sunucudan okur (`ha_my_plan`). Yönetici önizlemesi ayrıca çalışmaya devam eder.
- Koç sohbeti sunucuda da Plus+ (veya yönetici) ister.
- Kurulum: `harcama-atlasi-kurulum/paket-tanimlama.sql`; son satırı yönetici hesaplarına süresiz Plus+ verir. Eski şemanın üzerine iki kez kurulum denendi.

## 30. Sade arayüz, gelir kaydı ve yeni menüler (07.10.2026)

- **Alt menü:** yüzen cam çubuk; Özet · İşlemler · Bütçe · **+** · Varlık · Koç · Menü. "İçe aktar" sekmesi kaldırıldı.
- **Menü:** sayfalar dört bölümde (Günlük, Planlama, Varlık ve gelecek, Hesap ve veri); masaüstü kenar menüsü de aynı bölümlerle.
- **"+" menüsü:** Gider, **Gelir**, İade, Kart ödemesi; Ekstre, Ekran görüntüsü, Fotoğraf, İçe aktar; Düzenli ödeme, Birikim hedefi, Varlık/borç, Bütçe limiti; Kategori, Grup, Üye davet, Koça sor. Paketi gereken kısayolda Plus/Plus+ etiketi görünür.
- **İçe aktarma** artık bulunulan sayfanın üstünde açılan tam boy pencerede yapılır; okunmuş bir dosya varken kapatmadan önce sorulur. `#/ice-aktar` adresi çalışmaya devam eder.
- **Gelir kaydı:** yeni işlem türü. Harcama toplamlarına, bütçeye, raporlara ve paylaşıma girmez; Özet kartında "Gelir" ve "Kalan" gösterir. Gelir kayıtları yalnızca cihazda kalır, ortak gruba atanamaz ve buluta gönderilmez.
- **Özet (eski Panel):** tek özet kartı (net gider, karşılaştırma, gelir/kalan, bütçe), ana özelliklere kısayollar, kategoriler (ilk 5, istenirse tümü), son 6 işlem; günlük gider grafiği istenince açılır.
- **İşlemler:** arama, tür sekmeleri (Tümü/Gider/Gelir/İade/Transfer), Gider/Gelir/İşlem kutuları; diğer filtreler ve CSV tek "Filtreler" penceresinde.
- **Efektler:** sayfa geçişi, sayarak artan tutar, özet kartında hareketli ışık, kayan sekme seçimi, alttan pencere açılınca sayfanın geriye çekilmesi, "+" düğmesinde nabız. "Hareketi azalt" ayarında hepsi kapanır.
- Varlıklarım sayfasındaki dağılım grafiği daire grafik oldu.

## 31. Varlıklarım: TCMB kuruyla otomatik döviz fiyatı ve kâr/zarar (07.10.2026)

- Yeni sunucu fonksiyonu `market-rates`, TCMB `today.xml` gösterge kurlarını (döviz satış) okur ve 30 dakika önbellekte tutar. Tarayıcı TCMB'ye doğrudan erişemediği için gerekir. İstek gövdesi boştur; varlık, miktar ya da tutar gönderilmez.
- Döviz türündeki ve birimi döviz kodu olan (USD, EUR, GBP…) varlıklar, Varlıklarım açıldığında oturum başına bir kez, ayrıca "Kurları güncelle" düğmesiyle güncellenir. Kur, TCMB yayın tarihiyle `source: 'tcmb'` fiyat kaydı olarak yazılır. Aynı gün elle girilmiş fiyatın üzerine yazılmaz.
- Her satırda "Otomatik" etiketi, "TCMB kuru · tarih" kaynağı ve "Kâr / Zarar" tutarı ile yüzdesi görünür. Toplam kazanç/kayıp kartı bu fiyatlarla hesaplanır.
- Altın, fon ve hisse için otomatik fiyat yoktur (piyasa verisinde yalnızca TCMB kararı). Bunların fiyatı elle girilir.
- Otomatik kur için hesapla giriş gerekir. Testlerde TCMB yanıtı taklit edildi; fonksiyon Supabase'e kuruldu (sürüm 1) ama bu ortamın ağ kuralı Supabase'e erişimi engellediği için canlı çağrı buradan denenemedi; ilk gerçek deneme uygulamada yapılacak.

## 32. Varlıklarım: hisse, ETF, kripto, fon ve altın güncel fiyatı; USD görünümü (07.10.2026)

osman'ın isteğiyle "piyasa verisinde yalnızca TCMB" kararı genişletildi.
- `market-rates` sunucu fonksiyonu (sürüm 3) TCMB kurlarına ek olarak sembol listesi alır. Kaynaklar: Borsa İstanbul, ABD hisse ve ETF'leri ile gram altın (ons vadeli fiyatı × USD kuru ÷ 31,1035) için Yahoo Finance; kripto için Binance USDT paritesi × USD kuru; fonlar için TEFAS. Sembol isteği için giriş gerekir; istek yalnızca piyasa ve sembol taşır.
- Canlı deneme (07.10.2026, Supabase sunucusundan): THYAO 286,25 ₺, AAPL, SPY, BTC ve gram altın fiyatı alındı. TEFAS'ın eski adresi kapalıydı; yeni adresiyle fon fiyatı da alındı (bkz. bölüm 33).
- Yahoo Finance ve Binance'in açık uç noktaları resmî ya da lisanslı bir veri hizmeti değildir; fiyatlar gecikmeli olabilir ve uç nokta haber vermeden değişebilir. Mağaza yayını öncesinde lisanslı bir sağlayıcıya geçilmesi önerilir.
- Yeni varlık türü "Kripto"; "Hisse" türü "Hisse / ETF" oldu. Hisse için borsa (BIST / ABD) ve sembol, fon için TEFAS kodu, kripto için sembol girilir. Sembolsüz varlıkların fiyatı eskisi gibi elle girilir.
- Özet kartında ₺ TL / $ USD seçimi: tutarlar son TCMB USD kuruyla çevrilir; kazanç TL bazında hesaplanıp bugünkü kurla gösterilir.
- İsteğe bağlı ortak önbellek: `supabase/fiyat-onbellegi.sql` (ha_price_cache). Tablo yoksa fonksiyon yalnızca bellek önbelleğiyle çalışır.
- Testler: 224 birim testi; e2e'de sahte fiyat yanıtıyla ETF, kripto, fiyat alınamadı uyarısı ve USD görünümü sınandı.

## 33. TEFAS fon fiyatı, BIST / yabancı hisse ayrımı, yazarken öneri (07.10.2026)

- TEFAS'ın yeni API'si (`/api/funds/fonGnlBlgSiraliGetir`, JSON, tarih YYYYAAGG) kullanılıyor. Dakikada birkaç istek sınırı olduğu için fon başına değil, yatırım, emeklilik ve borsa yatırım fonu tiplerinin son 6 günlük listesi tek seferde alınıp 2 saat önbellekte tutulur. Canlı deneme: TTE 1,212706 ₺ (07.10.2026).
- Türler ayrıldı: "Hisse (BIST)" ve "Yabancı hisse / ETF" (Yahoo sembolü; ABD dışı borsalar için ek ile, ör. SAP.DE; GBp/ZAc alt birimleri düzeltilir). Eski ABD sembollü hisseler veritabanı sürüm 9 geçişiyle ve yedekten dönüşte yeni türe taşınır. "Diğer" dağılımda gri.
- Ad ve sembol alanında yazarken öneri: BIST ve yabancı için Yahoo Finance araması, fon için TEFAS listesi (kod ya da adın parçası, Türkçe harf duyarsız), kripto için CoinGecko araması (yalnızca Binance'te USDT paritesi olanlar). Seçilince ad ve sembol birlikte dolar. Arama için giriş gerekir; istek yalnızca arama metnini taşır.
- Canlı denemede Yahoo araması "aselsan" için ASELS.IS döndürdü; arama uç noktası girişli kullanıcı istediği için uygulama içinden canlı denenemedi, e2e'de sahte yanıtla sınandı.
- Önceki sürümde kripto rengi (--asset-8) CSS'te tanımlı değildi; düzeltildi.
