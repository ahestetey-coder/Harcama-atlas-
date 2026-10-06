// Plus+ koç sohbeti. Giriş yapmış kullanıcı, izin verdiği özet bilgileri ve sorusunu gönderir;
// yanıt OpenAI ile üretilir. Sohbet ve özet sunucuda saklanmaz, günlüğe yazılmaz.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { cors, istanbulDay, json, openaiChat, type ChatMessage } from '../_shared/openai.ts'

const DAILY_LIMIT = Number(Deno.env.get('COACH_DAILY_LIMIT') || 30)

const SYSTEM = `Sen "Harcama Atlası" uygulamasının Türkçe konuşan finans koçusun. Sıcak, kısa ve net yaz (en çok 6 cümle).
Kurallar:
- Yalnızca sana verilen ÖZET verilerdeki rakamları kullan; yeni rakam uydurma. Hesaplar uygulamada yapılır, sen açıklarsın.
- Belirli bir hisse, fon, kripto para, döviz veya banka ürünü önerme; alım-satım veya portföy tavsiyesi verme. Kişi isterse bunun lisanslı bir yatırım danışmanının işi olduğunu söyle.
- Borç varsa önce borç planını, sonra acil durum birikimini, sonra düzenli yatırım tutarını öne çıkar.
- Getiri veya tarih garantisi verme; tahminlerin varsayım olduğunu belirt.
- Kişisel kimlik, kart veya hesap bilgisi isteme.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Yalnızca POST' }, 405)
  const auth = req.headers.get('Authorization') ?? ''
  const url = Deno.env.get('SUPABASE_URL')!
  const user = await createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } }).auth.getUser()
  const uid = user.data.user?.id
  if (!uid) return json({ error: 'Giriş gerekli' }, 401)

  let body: { summary?: unknown; messages?: Array<{ role: string; content: string }> }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Geçersiz istek' }, 400)
  }
  const summary = JSON.stringify(body.summary ?? {})
  const history = (body.messages ?? []).slice(-12).filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
  if (summary.length > 6000 || !history.length || history.some((m) => m.content.length > 1500) || history[history.length - 1].role !== 'user') {
    return json({ error: 'Geçersiz istek' }, 400)
  }

  // Günlük kullanım sınırı
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const day = istanbulDay()
  const { data: row } = await admin.from('ha_coach_usage').select('count').eq('user_id', uid).eq('day', day).maybeSingle()
  const used = row?.count ?? 0
  if (used >= DAILY_LIMIT) return json({ error: `Bugünkü soru sınırına (${DAILY_LIMIT}) ulaştınız. Yarın tekrar sorabilirsiniz.` }, 429)
  await admin.from('ha_coach_usage').upsert({ user_id: uid, day, count: used + 1 })

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM },
    { role: 'system', content: `Kullanıcının izin verdiği özet veriler (tutarlar TL): ${summary}` },
    ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ]
  try {
    const reply = await openaiChat(messages, { maxTokens: 500 })
    return json({ reply: reply.trim(), remaining: DAILY_LIMIT - used - 1 })
  } catch {
    return json({ error: 'Koç şu an yanıt veremiyor. Biraz sonra tekrar deneyin.' }, 502)
  }
})
