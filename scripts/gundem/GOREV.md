# Finansal Gündem: günlük YouTube yazı görevi

Bu görev her gün 09:00 ve 21:00'de (Türkiye saati) kendiliğinden başlar. Tek başına çalış, kimseye soru sorma, Türkçe raporla.
Sahibi: osman (GitHub ahestetey-coder). Depo: ahestetey-coder/Harcama-atlas- (bu dosya `scripts/gundem/GOREV.md`).

## 0. Hazırlık
- Depoyu klonla, `main` dalında çalış. Yardımcı: `python3 scripts/gundem/gundem.py` (komutlar dosyanın başında).
- `YT_TRANSCRIPT_API_KEY` ortam değişkeni bu ortamda tanımlı; anahtarı asla yazdırma, loglama ya da commit etme.

## 1. Yeni videoları bul
- `python3 scripts/gundem/gundem.py scan` → kanal sırasına göre (1 Selcoin … 8 Coin Bureau) son 12 saatte yayınlanmış, daha önce işlenmemiş videolar ve canlı yayınlar. Shorts zaten elenir. Önceki çalışma (ör. kullanım limiti yüzünden) yapılamadıysa tarama otomatik olarak son başarılı taramadan beri olanları kapsar (en çok 7 gün); kaçanları bu çalışmada işle.
- Liste boşsa: hiçbir şey üretme, Higgsfield kredisi harcama, `gundem.py done` çalıştır, `scripts/gundem/` değişikliklerini commit edip push et, "Yeni içerik yok" de ve bitir.
- Yarıda kalmaya karşı: her yazıyı `add` ettikten hemen sonra commit edip push et (ilk yazı yayına hemen girer). Sonraki çalışma işlenmiş videoları atlar.
- Kanal hatası olursa o kanalı atla, raporda belirt.

## 2. Her video için (kanal sırasıyla)
1. `python3 scripts/gundem/gundem.py transcript VIDEO_ID` → `/tmp/gundem/VIDEO_ID.txt`. Transkript yoksa (canlı yayın sürüyor olabilir) videoyu atla; içerik UYDURMA. Sonraki taramada tekrar denenir.
2. Transkripti baştan sona oku ve aşağıdaki **editör talimatıyla** Türkçe yazıyı yaz (videoyu "izlemek" = transkripti tamamen okumak; ekrandaki grafikleri transkriptten anlaşılabildiği kadar kullan). İngilizce videolarda da yazı önce Türkçe yazılır.
3. Kategoriyi seç:
   - `piyasa-notu`: fiyat seviyeleri, destek/direnç, piyasa görünümü (borsa, altın, döviz, emtia)
   - `finans-haberleri`: güncel ekonomi/şirket/merkez bankası haberleri ve olaylar
   - `finans-egitimi`: kalıcı değeri olan kavram anlatımı, yatırım teorisi, araştırma
   - `kisisel-finans`: bütçe, birikim, emeklilik, borç, kişisel para yönetimi
   - `kripto`: ağırlıklı olarak kripto paralar
4. Türkçe metni İngilizceye eksiksiz çevir (aynı yapı ve kurallar, yatırım tavsiyesi yasağı dahil). Sabit başlıklar: Kısaca → In Brief, Öne Çıkan Varlıklar → Key Assets (tablo: Asset | Outlook | Why? | Key Level; Görünüm: Positive / Negative / Neutral / Under pressure / Watching), Dikkat Edilecekler → What to Watch. Son cümle tam olarak: "This note was compiled from open-source data and content available online; it does not constitute investment advice."
5. Görseller (Higgsfield konektörü): 1 kapak + 2 ya da 3 içerik görseli; tek `generate_image_batch` çağrısı, model `nano_banana_2`, 16:9, 1k; sonra `jobs_wait`. Yazının konusuna uygun, ilgi çekici, fotogerçekçi editoryal görseller; görselde yazı, rakam, logo, tanınabilir gerçek kişi olmasın. Deneme üretimi yapma, video başına en fazla 4 görsel. Sonuç adreslerini (https) doğrudan kullan.
6. İçerik görsellerini her iki dildeki metnin uygun bölüm aralarına ayrı satır olarak koy: `![açıklama](https://...)` (aynı adresler, açıklama dile göre).
7. Yazı dosyasını `/tmp/gundem/SLUG.json` olarak yaz ve `python3 scripts/gundem/gundem.py add /tmp/gundem/SLUG.json` çalıştır:
   ```json
   {
     "slug": "kisa-turkce-karaktersiz-baslik-2026-10-23",
     "videoId": "...", "channel": "Kanal adı", "category": "piyasa-notu",
     "publishAt": "2026-10-23T09:05:00+03:00",
     "title": {"tr": "...", "en": "..."},
     "summary": {"tr": "Kişisiz dille tek cümle", "en": "..."},
     "cover": "https://...", "coverAlt": {"tr": "...", "en": "..."},
     "body": {"tr": "Markdown (başlık hariç; ilk satır kısa giriş paragrafı ya da ## Kısaca)", "en": "..."},
     "onBlog": true
   }
   ```
   - `publishAt`: ilk yazı için şimdi + 5 dakika; sonraki her yazı bir öncekinden **30 dakika** sonra (kanal sırasıyla). Uygulama yazıyı bu saatte gösterir ve koç bildirimi bu saatte gelir.
   - `onBlog`: kategori `finans-egitimi` veya `kisisel-finans` ise `true`, değilse `false`.
   - Gövde Markdown'ı: `##` ara başlıklar, `- ` maddeler, `|` tablo, `**kalın**`; başka HTML kullanma. Başlık (title) gövdeye yazılmaz.

## 3. Uygulamaya yayınla
- Her yazıdan sonra: `git add public/gundem scripts/gundem && git commit -m "Gündem: <başlık>"`, `git push origin main` (reddedilirse `git pull --rebase origin main` ve tekrar). GitHub Pages ~2 dakikada yayına alır; mobil derleme bu klasör için çalışmaz.
- Tüm videolar bitince `python3 scripts/gundem/gundem.py done` çalıştır, commit ve push et.
- Kullanım limitine takılıp görev başlayamazsa ya da yarıda kalırsa ayrıca bir şey yapma: limit açıldıktan sonraki ilk çalışma kaçanları toplar.

## 4. Web sitesi blogu (yalnızca `onBlog: true` olanlar)
- Her blog yazısını kendi `publishAt` saatinde ekle: gerekirse o saate kadar arka planda bekle (`sleep` ile, Bash'in run_in_background seçeneğiyle; ön planda uzun sleep yapma).
- Saati gelince: `git pull --rebase origin main`, `python3 scripts/gundem/gundem.py blog SLUG` (görselleri indirip `site/public/blog/SLUG/` altına koyar), `cd site && npm ci && npm run build` ile doğrula (ilk seferden sonra `npm ci` gerekmez), commit, `git push origin main`.
- Sonra web sitesi dalını eşitle: `git fetch origin web-sitesi && git checkout -B web-sitesi origin/web-sitesi && git merge --no-edit origin/main && git push origin web-sitesi && git checkout main`. (Canlı site web-sitesi dalından yayınlanır; main ve web-sitesi aynı kalmalı.) Çakışma olursa web-sitesi'ne dokunma, raporla.
- Blog yalnızca Türkçedir; İngilizce sürüm uygulamada.

## 5. Rapor
Kısa Türkçe özet: hangi kanaldan hangi video, yazı başlıkları, kategori, yayın saatleri, bloga eklenenler, harcanan Higgsfield kredisi, atlanan videolar ve nedeni.

---

## Editör talimatı (osman'ın metni, aynen uygula)

Sen deneyimli bir finans editörüsün. Sana verilen YouTube videosunu baştan sona 
izle ve aşağıdaki kurallara göre Türkçe bir piyasa notu yaz.

## 1. YAZIM ÜSLUBU: KISA, NET, KEYİFLİ
- Okuması keyifli, akıcı bir dil kullan; ekonomi gazetesinin iyi yazılmış bir 
  piyasa köşesi gibi. Ciddi ama sıkıcı değil.
- Kısa cümleler kur. Bir paragraf en fazla 3 cümle olsun.
- Her bölüm tek bir net mesajla başlasın; okur sadece ilk cümleleri okusa bile 
  ana fikri alsın.
- Teknik jargonu azalt. Gerekli terimleri sade dille kullan, ağır kısaltma ve 
  akademik ifadelerden kaçın.
- Rakamları boğmadan ver: her bölümde sadece hikâyeyi anlatan en önemli 
  rakamları kullan, gerisini ele.
- "-mektedir, -maktadır" kalıplarını sürekli tekrarlama; cümle yapılarını çeşitlendir.
- Abartılı veya heyecan yaratan ifadeler kullanma ("uçacak", "çöküş", "kaçırmayın" gibi).
- Toplam uzunluk 500-700 kelimeyi geçmesin.

## 2. ANLATIM: VERİYE DAYALI, KİŞİSİZ DİL
- Hiçbir bilgiyi bir kişiye atfetme. "Konuşmacı", "uzman", "video", "belirtildi", 
  "ifade edildi", "aktarıldı", "değerlendirildi" gibi kaynağa veya söyleyene 
  gönderme yapan ifadeler KULLANMA.
- Her tespiti doğrudan veriye, grafiğe veya piyasa koşuluna dayandır:
  - YANLIŞ: "Konuşmacıya göre ons altında 4.000–4.100 USD ucuzluk bölgesidir."
  - DOĞRU: "Ons altın 4.000–4.100 dolar aralığında güçlü bir desteğe dayanmış durumda."
- Kişisel pozisyon ve niyet beyanlarını nota alma; arkasındaki gerekçeyi yaz.
- Zaman damgası veya video süresi KULLANMA.

## 3. İÇERİK
Videodan en değerli bilgileri seç:
- Kritik veriler: beklenti ve gerçekleşen rakamlar, fiyat seviyeleri, 
  destek/direnç noktaları, önemli tarihler
- Bu verilerin neden önemli olduğu ve piyasalara olası etkisi
- Ekranda gösterilen grafik ve tabloların ne anlattığı
- Riskler ve "şu olursa tablo değişir" türü koşullar

## 4. YATIRIM TAVSİYESİ YASAĞI
- "Alınmalı", "satılmalı", "kaçınılmalı", "fırsat", "ucuz", "cazip", "tercih 
  edilebilir" gibi yönlendirici ifadeler KULLANMA.
- Görünümleri olgusal dille ver: "destek bölgesinde", "direnci zorluyor", 
  "baskı altında", "risk artıyor" gibi.

## 5. DOĞRULUK
- SADECE videoda geçen bilgileri kullan. Kendi bilgini, güncel fiyatları veya 
  yorumunu ekleme.
- Emin olmadığın veya net olmayan bir rakamı nota alma; tahmin etme.

## 6. YAPI
- Başlık: merak uyandıran ama abartısız, en fazla 10 kelime
- "Kısaca": en kritik 3 bulgu, her biri tek cümle
- 3-4 kısa bölüm, her birine net ve akılda kalıcı bir ara başlık
- "Öne Çıkan Varlıklar" tablosu:
  | Varlık | Görünüm | Neden? | Kritik Seviye |
  Görünüm: Pozitif / Negatif / Nötr / Baskı altında / İzlemede
  "Neden?" sütunu en fazla 10 kelime olsun.
- "Dikkat Edilecekler": en önemli 2-3 risk, her biri tek cümle
- En sonda, ayrı bir paragraf olarak tam şu cümle:
  "Bu not, internet üzerindeki açık kaynak veri ve içeriklerden derlenmiştir; 
  yatırım tavsiyesi niteliği taşımaz."
