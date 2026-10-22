# Harcama Atlası web sitesi

Tanıtım sitesi, Finansal Harita testi, web'den abonelik satın alma ve yönetme. Astro 7 + Tailwind 4, Cloudflare Pages'te yayında:
https://harcama-atlas.pages.dev (Cloudflare projesi `harcama-atlas`, yayın dalı `web-sitesi`, kök klasör `site`, Node sürümü `.node-version`).

## Kurulum

```bash
cd site
npm ci
cp .env.example .env   # değerler herkese açıktır; gizli anahtar yoktur
npm run dev            # http://localhost:4321
```

Ortam değişkenleri `.env.example` içinde açıklanmıştır. Cloudflare Pages'te aynı adlarla Settings > Environment variables altına girilir.

| Değişken | Ne işe yarar |
| --- | --- |
| `PUBLIC_APP_URL` | Web uygulamasının adresi (test buradan gömülür, "Uygulamayı aç" buraya gider) |
| `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` | Uygulamayla aynı Supabase projesi ve hesaplar |
| `PUBLIC_POSTHOG_KEY`, `PUBLIC_POSTHOG_HOST` | Ziyaret istatistikleri. Boşsa analitik ve çerez onayı kutusu hiç çalışmaz; doluysa yalnızca "Kabul et"ten sonra yüklenir |

## Kalite kontrolleri

```bash
npm run lint
npm run typecheck
npm run build
PW_CHROMIUM=/opt/pw-browsers/chromium npx playwright test   # masaüstü 1440px + mobil 390px
```

Lighthouse ölçümü için `npm run build` sonrası `dist` klasörünü sıkıştırma yapan bir sunucuyla (ör. `npx serve dist`) açıp mobil ayarlarla ölçün.

## Ödeme (Paddle)

Paddle satıcıdır (merchant of record). Kurulum ayrıntıları ve SQL: `../supabase/web-odeme.sql`, Edge Functions `ha-billing` ve `ha-paddle-webhook`.

- Webhook adresi: `https://muonkdoiiuxwmcgshyza.supabase.co/functions/v1/ha-paddle-webhook` (yönetim panelinde Web satışları > Bağlantı > "Şimdi aktar" ile Paddle'a kaydedilir)
- Paddle varsayılan ödeme bağlantısı: `https://harcama-atlas.pages.dev/odeme`
- Supabase Auth yönlendirme adresi: `https://harcama-atlas.pages.dev/**`
- Fiyatlar ve kampanya kodları uygulamadaki yönetim panelinden yönetilir; site canlı fiyatları `ha_web_prices` tablosundan okur.
- Gerçek ödemeye geçmeden önce: Paddle canlı hesabı, canlı client token ve uygulamadaki ödemesiz paket seçiminin kapatılması.

Mağaza abonelikleri (App Store, Google Play) ve RevenueCat henüz yok; mağaza hesapları açılınca eklenecek.

## Yasal metinler

`src/pages/yasal/` altındaki metinler **taslaktır ve yayına alınmadan önce bir hukukçu tarafından incelenmelidir.**
Şirket bilgileri (unvan, adres, MERSİS, vergi, KEP, e-posta, telefon) `src/data/company.ts` dosyasından gelir; boş alanlar sayfada sarı "doldurulacak" etiketiyle görünür.
`LEGAL_DRAFT = true` yapılırsa sayfalara taslak uyarısı da eklenir.

Metinlerde benimsenen ve hukukçuyla teyit edilmesi gereken kurallar:

- Her ödemeden sonraki 14 gün içinde tam iade; iptal dönem sonunda geçerli olur.
- Web'de çözülüp hesaba bağlanmayan Finansal Harita testleri en fazla 12 ay saklanır (silme işi henüz kurulmadı).
- Yurt dışı aktarımlar (Paddle, OpenAI, PostHog, Cloudflare, GitHub, Google) KVKK m. 9'a göre standart sözleşmeyle yapılır.

## Blog

Yazılar `src/content/blog/*.md` dosyalarıdır. Ön bilgiler: `title`, `description`, `date`, isteğe bağlı `updated`, `tags`, `cta` (`test` veya `plus`), `draft`.
Site haritası (`/sitemap.xml`) ve RSS (`/blog/rss.xml`) yayınlanan yazıları kendiliğinden içerir.
