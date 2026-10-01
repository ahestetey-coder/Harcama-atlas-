# Üyelerle paylaşım: bulut kurulumu

> **Yayındaki site için kurulum yapıldı (01.10.2026).** `harcama-atlasi` adlı Supabase projesi oluşturuldu, `supabase/schema.sql` uygulandı ve adres ile herkese açık anahtar GitHub Pages derlemesine eklendi (`.github/workflows/pages.yml`). Yayındaki sitede yalnızca 3. adımdaki giriş ayarlarının yapılması gerekir. Aşağıdaki adımlar uygulamayı kendi projesiyle kurmak isteyenler içindir.

Harcama Atlası normalde bütün verisini yalnızca tarayıcınızda (IndexedDB) tutar. Başka bir kişiyle ortak harcama yapmak için iki cihazın buluşacağı bir yer gerekir. Bunun için sizin açacağınız **ücretsiz bir Supabase projesi** kullanılır. Kurulum bir kez yapılır ve yaklaşık 10 dakika sürer.

## Buluta ne gider, ne gitmez?

| Buluta gider | Cihazda kalır |
|---|---|
| Paylaşıma açtığınız gruptaki (ör. “Ortak”) **kendi** harcamalarınız: tarih, tutar, tür, açıklama, kategori adı/simgesi/rengi, not, taksit bilgisi | Diğer gruplardaki ve grupsuz bütün harcamalarınız |
| Grup adı ve rengi, üyelerin görünen adları | Yüklediğiniz PDF/görüntü dosyaları, ekstre metinleri, aktarım geçmişi |
| Hesap için e-posta adresiniz (Supabase Auth) | Ödeme yöntemi, hesap takma adı, bütçe, kurallar, ayarlar |

Güvenlik kuralları veritabanında zorlanır (`supabase/schema.sql`):

- Her kullanıcı yalnızca üyesi olduğu grupları, üyeleri ve o gruplardaki işlemleri okuyabilir (satır düzeyi güvenlik, RLS).
- Tablolara doğrudan yazma izni yoktur. Bütün yazmalar, kimliği ve üyeliği denetleyen fonksiyonlardan geçer.
- Herkes yalnızca **kendi** işlemini ekler, değiştirir veya siler.
- Davet kodları 7 gün geçerlidir.
- Grup sahibi bir üyeyi çıkarabilir; çıkarılan üyenin işlemleri de silinir.

## 1. Supabase projesi açın

1. <https://supabase.com> adresinde ücretsiz hesap açın.
2. **New project** seçin. Bir ad verin, bir veritabanı parolası belirleyin (bu parolayı uygulamaya girmeyeceksiniz) ve size yakın bir bölge seçin (ör. Frankfurt).
3. Projenin hazırlanmasını bekleyin.

## 2. Tabloları ve güvenlik kurallarını oluşturun

1. Sol menüden **SQL Editor** > **New query** açın.
2. Bu depodaki [`supabase/schema.sql`](supabase/schema.sql) dosyasının **tamamını** kopyalayıp yapıştırın.
3. **Run** düğmesine basın. “Success. No rows returned” görmelisiniz.

Dosya tekrar çalıştırılabilir; ileride güncellenirse aynı adımı yinelemeniz yeterlidir, verileriniz silinmez.

## 3. Giriş ayarları

**Authentication** > **URL Configuration** bölümünde:

- **Site URL**: `https://ahestetey-coder.github.io/Harcama-atlas-/`
- **Redirect URLs** listesine de aynı adresi ekleyin.

Supabase yeni hesaplar için varsayılan olarak e-posta doğrulaması ister. Doğrulama bağlantısı sizi uygulamaya geri getirir, ardından giriş yaparsınız.

İsterseniz **Authentication** > **Sign In / Providers** > **Email** altında **Confirm email** seçeneğini kapatabilirsiniz. Bu durumda hesap hemen açılır. Supabase'in ücretsiz e-posta gönderimi saatte birkaç e-postayla sınırlı olduğu için bu seçenek küçük bir aile grubunda işinizi kolaylaştırır.

### Google ile giriş (isteğe bağlı)

Giriş ekranındaki **Google ile devam et** düğmesi, Supabase'de Google girişi açıldığında kendiliğinden görünür.

1. <https://console.cloud.google.com/apis/credentials> adresinde bir proje seçin veya oluşturun.
2. **OAuth consent screen** (OAuth izin ekranı) bölümünde uygulama adını (Harcama Atlası) ve e-postanızı girin. Kullanıcı türü **External** olsun, sonra **Publish app** deyin.
3. **Credentials** > **Create credentials** > **OAuth client ID** > **Web application** seçin.
   - **Authorized JavaScript origins**: `https://ahestetey-coder.github.io`
   - **Authorized redirect URIs**: `https://<proje-kodu>.supabase.co/auth/v1/callback`. Yayındaki site için bu adres `https://muonkdoiiuxwmcgshyza.supabase.co/auth/v1/callback`.
4. Oluşan **Client ID** ve **Client secret** değerlerini Supabase'de **Authentication** > **Sign In / Providers** > **Google** altına yapıştırın ve **Enable** deyin.

## 4. Uygulamayı projeye bağlayın

1. Supabase'de **Project Settings** > **API** (veya **Data API**) sayfasını açın.
2. **Project URL** (ör. `https://abcd.supabase.co`) ve **anon public** anahtarını kopyalayın.
   - **service_role** anahtarını hiçbir yere girmeyin; o anahtar bütün güvenlik kurallarını atlar.
3. Harcama Atlası'nda **Üyeler ve paylaşım** sayfasını açın, iki değeri yapıştırıp **Bağlan** deyin.
4. **Hesap oluştur** ile kendinize bir hesap açın. Banka parolanızı kullanmayın.

## 5. Grubu paylaşın ve üye davet edin

1. **Adınız** alanına üyelerin sizi göreceği adı yazın.
2. **Ortak** (veya istediğiniz) grubun yanındaki **Paylaşıma aç** düğmesine basın.
3. **Üye davet et** ile oluşan bağlantıyı kopyalayıp üyeye gönderin (WhatsApp, e-posta…).
4. Üye bağlantıyı açar, hesap oluşturur, adını yazar ve **Gruba katıl** der. Supabase adresi davet bağlantısında olduğu için üyenin ayrıca bir şey girmesine gerek yoktur.

Bundan sonra:

- Herkes harcamasını kendi cihazında ekler ve **grubu “Ortak” seçer**. İçe aktarılan ekstrelerde de satırların grubu “Ortak” yapılabilir.
- Uygulama açıkken eşitleme kendiliğinden yapılır: değişiklikten kısa süre sonra, dakikada bir ve bağlantı geri geldiğinde. **Şimdi eşitle** ile elle de yapılabilir.
- Panelde grup filtresinden **Ortak** seçilince toplam, kategori dağılımı ve **Kişilere göre** kartı görünür.
- Üyenin eklediği harcamayı yalnızca o üye değiştirebilir veya silebilir. Siz yalnızca görüntülersiniz.

## Sınırlar

- Eşitleme için internet gerekir. Çevrimdışı eklenen ortak harcamalar bağlantı gelince gönderilir.
- Üyenin harcamasının kategorisi sizin cihazınızda **kategori adına** göre eşleştirilir; aynı adda kategoriniz yoksa otomatik oluşturulur.
- Supabase ücretsiz planında bir hafta hiç kullanılmayan projeler duraklatılabilir. Supabase panelinden tek tıkla yeniden başlatılır.
- Bu özellik, gerçek bir Supabase projesine karşı geliştirme ortamından denenemedi. Güvenlik kuralları yerel bir PostgreSQL üzerinde (`npm run test:sql`), eşitleme mantığı ise bellek içi bir sahte bulutla (`src/cloud/sync.test.ts`) test edildi.
