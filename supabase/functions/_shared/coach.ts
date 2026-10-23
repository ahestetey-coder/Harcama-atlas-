// Koç yanıtı üretimi ve yanıt denetimi. Sohbet fonksiyonu ve güvenlik testi aynı yolu kullanır, böylece
// test gerçek kullanıcıların gördüğü davranışı ölçer.
import { STEERING_FALLBACK, STEERING_FALLBACK_EN, steeringIssues } from './guard.ts'
import { openaiChatUsage, type ChatMessage } from './openai.ts'

export const COACH_SYSTEM = `Sen "Harcama Atlası" uygulamasının Türkçe konuşan finans koçusun. Sıcak, kısa ve net yaz (en çok 6 cümle).
Görevlerin: kişinin bütçesini ve harcama eğilimlerini açıklamak, borç ve birikim ilerlemesini anlatmak, kişinin kendi varsayımlarıyla senaryoları yorumlamak (ör. hedef tarihinin nasıl kayacağı), finans kavramlarını sade dille anlatmak ve ortak ekonomi raporlarındaki gelişmelerin kaynaklarını açıklayıp kişinin bütçesiyle ilişkisini kurmak.
Kurallar:
- Yalnızca sana verilen ÖZET verilerdeki, HAFIZA notlarındaki ve RAPOR bölümündeki bilgileri kullan; yeni rakam uydurma. Hesaplar uygulamada yapılır, sen açıklarsın.
- Rapordaki bir gelişmeden söz edersen kaynağını (kurum ve tarih) belirt. Raporda olmayan haber veya veri anlatma.
- Belirli bir hisse, fon, kripto para, altın, döviz veya banka ürünü için alım, satım, tutma, hedef fiyat ya da portföy yüzdesi söyleme; "muhtemelen", "bence" gibi yumuşatılmış biçimde de söyleme. Fiyatların yönünü tahmin etme. Kişi isterse bunun lisanslı bir yatırım danışmanının işi olduğunu söyle ve bütçe tarafına dön.
- Borç varsa önce borç planını, sonra acil durum birikimini, sonra düzenli birikim tutarını öne çıkar.
- ÖZET'te "ozgurlukRotasi" varsa yönlendirmelerini kişinin rotadaki sıradaki aşamasına (siradakiAsama) göre yap: önce o aşamanın ölçütünü ve sonraki adımını anlat, aşamaları atlatma; kişinin hedefi, hedef süresi, plan birimi (TL, USD ya da gram altın) ve risk tutumuyla ilişkilendir. Risk tutumunu ürün önermek için değil, yalnızca anlatımın tonunu ayarlamak için kullan.
- "ozgurlukRotasi" içinde gerekenAylikBirikim, aylikFark, kaldiraclar, borcBitisTakvimi ve duzenliOdemeBitisleri varsa bunları somut tarih ve tutarlarla anlat: ör. "Borç 1 Mart 2027'de kapanınca ayda 4.000 TL birikime eklenir", "Hedef yaşı 52'ye çekmek tek başına yeterli". basariOlasiligiYuzde bir benzetim sonucudur; "olasılık" derken varsayıma dayalı olduğunu söyle. beklenenSenaryo ve risk profili yalnızca hisse/tahvil oranını anlatır; belirli bir fon, hisse ya da ürün önerme.
- Getiri veya tarih garantisi verme; tahminlerin varsayım olduğunu belirt.
- Kişisel kimlik, kart veya hesap bilgisi isteme.`

export interface CoachReply {
  text: string
  tokens: number
  /** İlk yanıtta bulunan yönlendirme sayısı (yeniden yazılmadan önce). */
  rawIssues: number
  outcome: 'temiz' | 'yeniden_yazildi' | 'engellendi'
}

/**
 * Yanıtı üretir ve denetler. İlk yanıtta kişisel yatırım yönlendirmesi varsa model bir kez daha, sorunlu
 * cümleler gösterilerek uyarılır; ikinci yanıt da temiz değilse hazır güvenli metin döner.
 */
export async function generateCoachReply(messages: ChatMessage[], maxTokens = 500, lang: 'tr' | 'en' = 'tr'): Promise<CoachReply> {
  const first = await openaiChatUsage(messages, { maxTokens })
  const issues = steeringIssues(first.text)
  if (!issues.length) return { text: first.text.trim(), tokens: first.tokens, rawIssues: 0, outcome: 'temiz' }
  const retry = await openaiChatUsage(
    [
      ...messages,
      { role: 'assistant', content: first.text },
      {
        role: 'system',
        content: `Bu yanıt kurallara aykırı, kişisel yatırım yönlendirmesi içeriyor: ${issues.map((i) => `"${i.sentence}"`).join('; ')}. Yanıtı baştan yaz: belirli bir araç için alım-satım, tutma, hedef fiyat, portföy oranı veya fiyat yönü söyleme; bütçe, borç, birikim tutarı ve kavramlar üzerinden yardımcı ol.`,
      },
    ],
    { maxTokens, temperature: 0.1 },
  )
  const tokens = first.tokens + retry.tokens
  if (!steeringIssues(retry.text).length) return { text: retry.text.trim(), tokens, rawIssues: issues.length, outcome: 'yeniden_yazildi' }
  return { text: lang === 'en' ? STEERING_FALLBACK_EN : STEERING_FALLBACK, tokens, rawIssues: issues.length, outcome: 'engellendi' }
}

/** İngilizce seçen kullanıcıya: kurallar aynı, yanıt dili İngilizce. */
export const COACH_LANG_EN = `DİL: Kullanıcı uygulamayı İngilizce kullanıyor. Yanıtlarını doğal, sade İngilizceyle yaz (İngiliz İngilizcesi). Yukarıdaki kuralların hepsi aynen geçerli. Türkçe kurum adlarını (TCMB, TÜİK) koru, gerekirse kısaca açıkla.`

export type CoachCurrency = 'TRY' | 'USD'

/** Kullanıcının ana para birimi: özet tutarları bu birimdedir ve koç tutarları bu birimle yazar. */
export function currencyRule(currency: CoachCurrency, lang: 'tr' | 'en'): string {
  if (currency === 'USD') return `PARA BİRİMİ: Kullanıcının ana para birimi ABD doları. ÖZET'teki bütün tutarlar dolardır; tutarları "$" ile yaz (ör. $1,250). TL'ye çevirme, TL ya da "₺" kullanma.`
  return lang === 'en' ? `PARA BİRİMİ: Tutarlar TL'dir; "₺" ile yaz.` : `PARA BİRİMİ: Tutarlar TL'dir.`
}

export function coachContext(summary: string, memory: string[], report: string | null, lang: 'tr' | 'en' = 'tr', currency: CoachCurrency = 'TRY'): ChatMessage[] {
  const out: ChatMessage[] = [
    { role: 'system', content: COACH_SYSTEM },
    ...(lang === 'en' ? [{ role: 'system' as const, content: COACH_LANG_EN }] : []),
    { role: 'system', content: currencyRule(currency, lang) },
    { role: 'system', content: `ÖZET (kullanıcının izin verdiği veriler, tutarlar ${currency === 'USD' ? 'ABD doları' : 'TL'}): ${summary}` },
  ]
  if (memory.length) out.push({ role: 'system', content: `HAFIZA (kullanıcının görüp düzenleyebildiği notlar):\n${memory.map((m) => `- ${m}`).join('\n')}` })
  if (report) out.push({ role: 'system', content: `RAPOR (herkese aynı gönderilen, editör onaylı son ekonomi raporu):\n${report}` })
  return out
}
