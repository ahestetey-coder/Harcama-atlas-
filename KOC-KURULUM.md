# Plus+ koç: yapay zekâ sohbeti ve günlük ekonomi özeti kurulumu

Koçun borç planı, yatırım tutarı ve kurala bağlı mesajları kurulum gerektirmez; uygulamada hemen çalışır.
Aşağıdaki adımlar yalnızca **serbest sohbet** (OpenAI) ve **günlük ekonomi özeti** için gerekir.
Sunucu fonksiyonları (`coach-chat`, `coach-news`) Supabase projesine yüklendi; anahtarlar eklenene kadar çalışmazlar.

Anahtarları hiçbir zaman sohbete yapıştırmayın; yalnızca Supabase paneline girin.

## 1. Veritabanı (bir kez)

Supabase > SQL Editor'de `koc-ve-haberler.sql` dosyasının **"Her sabah 07:00'de" satırına kadar olan** kısmını çalıştırın.
Bu; haber kaynakları, günlük özetler ve sohbet kullanım sayacı tablolarını kurar. Tekrar çalıştırmak zararsızdır.

## 2. OpenAI anahtarı

1. platform.openai.com'da hesap açın, Billing bölümünden kredi yükleyin.
2. API keys > Create new secret key ile bir anahtar oluşturun.

## 3. Supabase sırları

Supabase > Edge Functions > Secrets bölümüne ekleyin:

| Ad | Değer |
| --- | --- |
| `OPENAI_API_KEY` | OpenAI anahtarınız |
| `CRON_SECRET` | Uzun, rastgele bir metin (ör. bir parola üreticisinden 40 karakter) |
| `X_BEARER_TOKEN` | X geliştirici hesabınızın Bearer Token'ı (X kullanılacaksa) |
| `OPENAI_MODEL` | İsteğe bağlı; boşsa `gpt-4o-mini` |
| `COACH_DAILY_LIMIT` | İsteğe bağlı; kişi başı günlük soru sınırı, boşsa 30 |

## 4. X hesabı (isteğe bağlı)

developer.x.com'da bir proje ve uygulama oluşturun, kullanım başı ödeme için kredi yükleyin ve Bearer Token'ı alın.
Okunan her gönderi ücretlidir (Ekim 2026'da gönderi başına yaklaşık 0,005 $); 10 hesap günde 20'şer gönderi atarsa ayda yaklaşık 30 $.

## 5. Kaynakları ekleyin

Uygulamada **Yönetici paneli > Günlük ekonomi özeti kaynakları** bölümünden X kullanıcı adlarını ve haber sitelerinin RSS adreslerini ekleyin.

## 6. Günlük görevi açın

`koc-ve-haberler.sql` dosyasının son bölümündeki `BURAYA_CRON_SECRET` yazısını 3. adımdaki `CRON_SECRET` değeriyle değiştirip yalnızca o bölümü çalıştırın.
Özet her sabah 07:00'de (İstanbul) hazırlanır; Koçum ekranında ve Finansal bilgi sayfasında görünür.

## Nasıl çalışır

- **Sohbet:** Kişi Koçum ekranında izin verirse yalnızca özet rakamlar (gelir, gider, borç bakiyeleri ve faizleri adsız, birikim, plan, hedef) gönderilir. Ekstreler, işlemler, iş yeri adları gönderilmez. Sohbet sunucuda saklanmaz.
- **Günlük özet:** Son 24 saatin maddeleri toplanır, OpenAI yalnızca bu maddelerden özet yazar. Kaynak, bağlantı ve tarih modelden değil gerçek maddeden eklenir; her madde haber, yorum veya tahmin olarak işaretlenir.
- Koç belirli bir yatırım ürünü önermez, alım-satım tavsiyesi vermez.
