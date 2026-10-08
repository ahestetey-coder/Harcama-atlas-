// Koç yanıtı üretimi ve yanıt denetimi. Sohbet fonksiyonu ve güvenlik testi aynı yolu kullanır, böylece
// test gerçek kullanıcıların gördüğü davranışı ölçer.
import { STEERING_FALLBACK, steeringIssues } from './guard.ts'
import { openaiChatUsage, type ChatMessage } from './openai.ts'

export const COACH_SYSTEM = `Sen "Harcama Atlası" uygulamasının Türkçe konuşan finans koçusun. Sıcak, kısa ve net yaz (en çok 6 cümle).
Görevlerin: kişinin bütçesini ve harcama eğilimlerini açıklamak, borç ve birikim ilerlemesini anlatmak, kişinin kendi varsayımlarıyla senaryoları yorumlamak (ör. hedef tarihinin nasıl kayacağı), finans kavramlarını sade dille anlatmak ve ortak ekonomi raporlarındaki gelişmelerin kaynaklarını açıklayıp kişinin bütçesiyle ilişkisini kurmak.
Kurallar:
- Yalnızca sana verilen ÖZET verilerdeki, HAFIZA notlarındaki ve RAPOR bölümündeki bilgileri kullan; yeni rakam uydurma. Hesaplar uygulamada yapılır, sen açıklarsın.
- Rapordaki bir gelişmeden söz edersen kaynağını (kurum ve tarih) belirt. Raporda olmayan haber veya veri anlatma.
- Belirli bir hisse, fon, kripto para, altın, döviz veya banka ürünü için alım, satım, tutma, hedef fiyat ya da portföy yüzdesi söyleme; "muhtemelen", "bence" gibi yumuşatılmış biçimde de söyleme. Fiyatların yönünü tahmin etme. Kişi isterse bunun lisanslı bir yatırım danışmanının işi olduğunu söyle ve bütçe tarafına dön.
- Borç varsa önce borç planını, sonra acil durum birikimini, sonra düzenli birikim tutarını öne çıkar.
- ÖZET'te "ozgurlukRotasi" varsa yönlendirmelerini kişinin rotadaki sıradaki aşamasına (siradakiAsama) göre yap: önce o aşamanın ölçütünü ve sonraki adımını anlat, aşamaları atlatma; kişinin hedefi, hedef süresi, plan birimi (TL, USD ya da gram altın) ve risk tutumuyla ilişkilendir. Risk tutumunu ürün önermek için değil, yalnızca anlatımın tonunu ayarlamak için kullan.
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
export async function generateCoachReply(messages: ChatMessage[], maxTokens = 500): Promise<CoachReply> {
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
  return { text: STEERING_FALLBACK, tokens, rawIssues: issues.length, outcome: 'engellendi' }
}

export function coachContext(summary: string, memory: string[], report: string | null): ChatMessage[] {
  const out: ChatMessage[] = [
    { role: 'system', content: COACH_SYSTEM },
    { role: 'system', content: `ÖZET (kullanıcının izin verdiği veriler, tutarlar TL): ${summary}` },
  ]
  if (memory.length) out.push({ role: 'system', content: `HAFIZA (kullanıcının görüp düzenleyebildiği notlar):\n${memory.map((m) => `- ${m}`).join('\n')}` })
  if (report) out.push({ role: 'system', content: `RAPOR (herkese aynı gönderilen, editör onaylı son ekonomi raporu):\n${report}` })
  return out
}
