// Plus+ koç sohbeti. Giriş yapmış kullanıcı, izin verdiği özet bilgileri, cihazındaki hafıza notlarını ve
// sorusunu gönderir; yanıt OpenAI ile üretilir ve yatırım yönlendirmesi denetiminden geçer. Sohbet, özet ve
// hafıza sunucuda saklanmaz, günlüğe yazılmaz; ortak araştırma havuzuna hiç girmez.
// Günlük soru sınırı yalnızca başarılı yanıtta, İstanbul saatine göre sayılır.
import { coachContext, generateCoachReply } from '../_shared/coach.ts'
import { cors, istanbulDay, json, openaiChatUsage } from '../_shared/openai.ts'
import { addUsage, agentSettings, serviceClient, usage, userId } from '../_shared/server.ts'

const SECTION_LABEL: Record<string, string> = { ne_oldu: 'Ne oldu', neden_onemli: 'Neden önemli' }

interface StoredTopic {
  title: string
  sections: Record<string, { text: string }>
  sources: Array<{ n: number; institution: string; author: string | null; publishedAt: string; url: string; type: string }>
}

/** Son yayınlanmış günlük rapor ve son 2 günün acil bültenleri, koçun kaynak gösterebileceği kısa metin olarak. */
async function latestReport(db: ReturnType<typeof serviceClient>): Promise<string | null> {
  const { data } = await db
    .from('ha_reports')
    .select('kind, title, published_at, topics')
    .eq('status', 'yayinda')
    .in('kind', ['gunluk', 'acil'])
    .gte('published_at', new Date(Date.now() - 3 * 86400000).toISOString())
    .order('published_at', { ascending: false })
    .limit(3)
  if (!data?.length) return null
  const lines: string[] = []
  for (const r of data) {
    lines.push(`# ${r.title} (yayın: ${String(r.published_at).slice(0, 10)})`)
    for (const t of (r.topics ?? []) as StoredTopic[]) {
      lines.push(`## ${t.title}`)
      for (const k of Object.keys(SECTION_LABEL)) if (t.sections?.[k]?.text) lines.push(`${SECTION_LABEL[k]}: ${t.sections[k].text}`)
      lines.push(`Kaynaklar: ${t.sources.map((s) => `[${s.n}] ${s.author ? `${s.author}, ` : ''}${s.institution}, ${s.publishedAt.slice(0, 10)} (${s.type})`).join('; ')}`)
    }
  }
  return lines.join('\n').slice(0, 5000)
}

const SUMMARY_PROMPT = `Aşağıdaki koç sohbetini kullanıcının cihazındaki "koç hafızası" için özetle. Yalnızca kullanıcının kendisi hakkında söylediği ve ileride işe yarayacak bilgileri yaz: hedefleri, tercihleri, kaygıları, verdiği kararlar. En çok 4 kısa madde, her biri tek cümle, "- " ile başlasın. Yatırım tavsiyesi veya yeni bilgi ekleme. Kart, hesap veya kimlik bilgisi yazma.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Yalnızca POST' }, 405)
  const uid = await userId(req)
  if (!uid) return json({ error: 'Giriş gerekli' }, 401)

  let body: { summary?: unknown; memory?: unknown; mode?: string; messages?: Array<{ role: string; content: string }> }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Geçersiz istek' }, 400)
  }
  const summary = JSON.stringify(body.summary ?? {})
  const memory = (Array.isArray(body.memory) ? body.memory : []).filter((m): m is string => typeof m === 'string').map((m) => m.slice(0, 400)).slice(0, 30)
  const history = (body.messages ?? []).slice(-24).filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
  if (summary.length > 6000 || memory.join('').length > 6000 || !history.length || history.some((m) => m.content.length > 1500)) return json({ error: 'Geçersiz istek' }, 400)

  const db = serviceClient()
  // Sohbet Plus+ paketine dahil (yönetici her zaman kullanabilir).
  const [{ data: plan }, { data: admin }] = await Promise.all([db.rpc('ha_plan_of', { p_user: uid }), db.from('ha_admins').select('user_id').eq('user_id', uid).maybeSingle()])
  if (plan !== 'plusplus' && !admin) return json({ error: 'Koç sohbeti Plus+ paketine dahildir.' }, 403)
  const settings = await agentSettings(db)
  if ((await usage(db, 'ai_coach', 'month')) >= settings.ai_coach_monthly_tokens) return json({ error: 'Koç bu ay için ayrılan kullanım sınırına ulaştı. Yönetici sınırı artırana kadar sohbet kapalı.' }, 429)

  // Sohbet özeti (hafızaya yazılır): kullanıcı sorusu sayılmaz, ama yapay zekâ maliyetine eklenir.
  if (body.mode === 'summarize') {
    if (history.length < 4) return json({ error: 'Geçersiz istek' }, 400)
    try {
      const r = await openaiChatUsage([{ role: 'system', content: SUMMARY_PROMPT }, { role: 'user', content: history.map((m) => `${m.role === 'user' ? 'Kullanıcı' : 'Koç'}: ${m.content}`).join('\n') }], { maxTokens: 250, temperature: 0.1 })
      await addUsage(db, 'ai_coach', r.tokens)
      const notes = r.text
        .split('\n')
        .map((l) => l.replace(/^[-•*]\s*/, '').trim())
        .filter(Boolean)
        .slice(0, 4)
      return json({ notes })
    } catch {
      return json({ error: 'Sohbet özetlenemedi' }, 502)
    }
  }

  if (history[history.length - 1].role !== 'user') return json({ error: 'Geçersiz istek' }, 400)
  const limit = settings.coach_daily_limit
  const day = istanbulDay()
  const { data: row } = await db.from('ha_coach_usage').select('count').eq('user_id', uid).eq('day', day).maybeSingle()
  if ((row?.count ?? 0) >= limit) return json({ error: `Bugünkü soru sınırına (${limit}) ulaştınız. Türkiye saatiyle gece yarısı yenilenir.` }, 429)

  const messages = [...coachContext(summary, memory, await latestReport(db).catch(() => null)), ...history.slice(-12).map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))]
  let reply
  try {
    reply = await generateCoachReply(messages)
  } catch {
    // Teknik hata: soru hakkından düşülmez.
    return json({ error: 'Koç şu an yanıt veremiyor. Biraz sonra tekrar deneyin; bu deneme günlük hakkınızdan sayılmadı.' }, 502)
  }
  await addUsage(db, 'ai_coach', reply.tokens)
  if (reply.outcome === 'yeniden_yazildi') await addUsage(db, 'koc_yeniden', 1)
  if (reply.outcome === 'engellendi') await addUsage(db, 'koc_engel', 1)
  // Başarılı yanıttan sonra sayılır; aynı anda gelen isteklerle sınır aşılmışsa yanıt verilmez.
  const { data: used, error } = await db.rpc('ha_coach_usage_bump', { p_user: uid, p_day: day, p_limit: limit, p_tokens: reply.tokens })
  if (error) return json({ error: 'Koç şu an yanıt veremiyor. Biraz sonra tekrar deneyin.' }, 500)
  if (used === -1) return json({ error: `Bugünkü soru sınırına (${limit}) ulaştınız. Türkiye saatiyle gece yarısı yenilenir.` }, 429)
  return json({ reply: reply.text, remaining: Math.max(0, limit - Number(used)), checked: reply.outcome !== 'temiz' })
})
