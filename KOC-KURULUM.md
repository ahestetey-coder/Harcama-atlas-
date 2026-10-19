# Plus+ koç ve ortak ekonomi araştırma ajanı kurulumu

Koçun borç planı, yatırım tutarı, kurala bağlı mesajları ve kişisel hafızası kurulum gerektirmez; uygulamada hemen çalışır.
Aşağıdaki adımlar yalnızca **serbest sohbet** (OpenAI) ve **ortak ekonomi raporları** için gerekir.
Sunucu fonksiyonları (`coach-chat`, `coach-eval`, `research-collect`, `research-report`) Supabase projesine yüklendi; anahtarlar eklenene kadar çalışmazlar.

Anahtarları hiçbir zaman sohbete yapıştırmayın; yalnızca Supabase paneline girin.

## 1. Veritabanı (bir kez)

Supabase > SQL Editor'de `arastirma-ajani.sql` dosyasını **"ZAMANLAYICI" başlığına kadar** çalıştırın (önce `yonetici-paneli.sql` kurulu olmalı).
Bu dosya eski `koc-ve-haberler.sql`'in yerini alır: kaynaklar, uzmanlar, yayın takvimi, toplanan maddeler, raporlar ve değişiklik geçmişi, kullanım limitleri ve ölçüm tablolarını kurar. Tekrar çalıştırmak zararsızdır.

Önerilen resmî kaynaklar (TCMB kurları ve PPK kararları, Fed, ECB, BLS, SEC, IMF, BIS) **kapalı ve "koşullar inceleniyor"** olarak eklenir; siz koşullarını okuyup açana kadar hiçbiri okunmaz.

## 2. OpenAI anahtarı

1. platform.openai.com'da hesap açın, Billing bölümünden kredi yükleyin.
2. API keys > Create new secret key ile bir anahtar oluşturun.

## 3. Supabase sırları

Supabase > Edge Functions > Secrets bölümüne ekleyin:

| Ad | Değer |
| --- | --- |
| `OPENAI_API_KEY` | OpenAI anahtarınız |
| `CRON_SECRET` | Uzun, rastgele bir metin (ör. bir parola üreticisinden 40 karakter) |
| `X_BEARER_TOKEN` | X geliştirici hesabınızın Bearer Token'ı (X hesapları izlenecekse) |
| `OPENAI_MODEL` | İsteğe bağlı; boşsa `gpt-4o-mini` |

Kişi başı günlük soru sınırı (varsayılan 30) ve diğer limitler artık **Yönetici paneli > Araştırma ajanı > Ölçümler** bölümünden değiştirilir.

## 4. X hesapları (isteğe bağlı)

developer.x.com'da bir proje ve uygulama oluşturun, kullanım başı ödeme için kredi yükleyin ve Bearer Token'ı alın.
Okunan her gönderi ücretlidir (Ekim 2026'da gönderi başına yaklaşık 0,005 $). Anahtar yoksa X kaynakları panelde "X erişim anahtarı tanımlı değil" hatasıyla görünür, diğer kaynaklar çalışır.

## 5. Kaynakları, uzmanları ve takvimi girin

**Yönetici paneli > Araştırma ajanı**:

- **Kaynaklar:** Her kaynağın kullanım koşullarını okuyun, uygunsa "Koşullar uygun" yapıp açın. Panel her kaynağın son başarılı kontrolünü, son maddenin tarihini (gecikme) ve hatayı gösterir.
- **Uzmanlar:** 8–10 uzman veya araştırma yayını ekleyin, kişisel görüş mü kurum adına mı konuştuğunu seçin. Uzmanın X hesabını veya RSS beslemesini Kaynaklar'dan ekleyip uzmana bağlayın.
- **Takvim:** Planlı açıklamaları (TÜİK verileri, faiz kararları) girin; bağlı kaynak açıklama çevresinde 10 dakikada bir kontrol edilir.

## 6. Zamanlayıcıyı açın

`arastirma-ajani.sql` dosyasının son bölümündeki `BURAYA_CRON_SECRET` yazısını 3. adımdaki `CRON_SECRET` değeriyle değiştirip yalnızca o bölümü çalıştırın.

- Kaynak toplama: 10 dakikada bir
- Günlük rapor taslağı: 06.30, haftalık: pazartesi 07.00, aylık: ayın 1'i 07.30 (İstanbul)
- Koç güvenlik testi: pazar 08.00

## 7. Taslakları onaylayın

Taslaklar **kendiliğinden yayınlanmaz**. Raporlar sekmesinde taslağı açın, yayın öncesi denetimin sonucunu okuyun, gerekiyorsa metni düzeltip "Kaydet ve denetle" deyin, sonra "Onayla ve yayınla". Denetimde sorun kalan taslak yayınlanamaz.

## Nasıl çalışır

- **Toplama:** Yalnızca açık ve koşulları uygun kaynaklar okunur. Her madde kaynak bağlantısı, yazar/kurum, yayın ve alınma zamanı, dönem ve içerik türüyle (resmî veri, şirket açıklaması, haber, uzman yorumu, tahmin) saklanır. Aynı madde iki kez kaydedilmez; aynı olayın haberleri birleştirilip ilk resmî açıklamaya bağlanır. Hata olursa kaynak bir sonraki çalışmada kaldığı yerden devam eder.
- **Fiyatlar:** Şimdilik yalnızca TCMB gösterge kurları (USD, EUR, GBP, CHF, JPY); önceki yayına göre değişim kuralla hesaplanır. BIST, altın ve kripto fiyatı lisanslı sağlayıcı seçilene kadar gösterilmez; haber sayfalarındaki fiyatlar kullanılmaz.
- **Raporlar:** En önemli olaylar seçilir (resmî kaynak, kaynak sayısı), her biri 7 başlıkla yazılır: Ne oldu? · Neden önemli? · Uzmanlar nasıl yorumluyor? · Ortak araştırma değerlendirmesi · Belirsizlik ve senaryolar · Sonraki işaret · Kaynaklar. Kaynak listesi yapay zekâdan değil gerçek maddelerden kurulur.
- **Yayın öncesi denetim:** Kaynaksız iddia, listede olmayan kaynak, eski veri veya eski uzman görüşü, kaynakta geçmeyen rakam, al-sat/hedef fiyat/portföy oranı gibi yönlendirme dili ve "kesin/garanti" gibi ifadeler yakalanır.
- **Koç:** Kişi izin verirse yalnızca açık bıraktığı özet bilgi grupları ve cihazdaki hafıza notları gönderilir; sohbet ve hafıza sunucuda saklanmaz ve ortak havuza girmez. Koç, son yayınlanan raporu ve kaynaklarını bilir. Her yanıt yönlendirme denetiminden geçer; yakalanırsa bir kez yeniden yazdırılır, yine olmazsa hazır güvenli metin gider.
- **Günlük sınır:** Kişi başı 30 soru, yalnızca yanıtlanan sorular sayılır, Türkiye saatiyle gece yarısı yenilenir. Teknik hatada hak düşmez.

## Sınırlar

- Yapay zekâ çağrıları ve X erişimi gerçek anahtarlarla henüz denenmedi; testler taklit yanıtlarla yapıldı.
- TÜİK ve KAP için herkese açık bir RSS adresi bulunamadı. TÜİK açıklamaları takvime girilebilir; KAP verisi için KAP'ın lisanslı veri hizmeti gerekir.
- "İndirilebilir veri", "resmî API" ve "açık sayfa" türleri için okuyucu henüz yazılmadı; bu türdeki kaynaklar panelde hata olarak görünür.
