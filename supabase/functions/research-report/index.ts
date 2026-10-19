// Ortak araştırma ajanı: rapor taslağı ve editör düzeltmeleri.
//
// generate (zamanlayıcı veya yönetici): pencere içindeki maddeleri olaylara göre gruplar, en önemli olayları seçer
//   (resmî kaynak, kaynak sayısı ve uzman yorumu ağırlıklı), her olay için 7 bölümlü metni yapay zekâya yazdırır.
//   Kaynak listesi modelden değil gerçek maddelerden kurulur; rakamlar yalnızca kaynak metinlerinden ve kurallarla
//   hesaplanmış değerlerden gelebilir. Yayın öncesi denetim sonucu taslağa yazılır. Taslak YAYINLANMAZ; yayını
//   yönetici (editör) panelden yapar.
// save (yönetici): editörün metin düzeltmesini kaydeder, denetimi yeniden çalıştırır, değişiklik geçmişine ekler.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { cors, json, openaiChatUsage } from '../_shared/openai.ts'
import {
  checkReport,
  CONTENT_LABEL,
  NO_OPINION,
  OPINION_DAYS,
  SECTION_KEYS,
  similarity,
  titleTokens,
  type ContentType,
  type ReportKind,
  type ReportSource,
  type ReportTopic,
  type SectionKey,
} from '../_shared/research.ts'
import { addUsage, agentSettings, cronOrAdmin, serviceClient, usage } from '../_shared/server.ts'

interface Item {
  id: string
  url: string
  title: string
  body: string
  author: string | null
  institution: string
  published_at: string
  period: string | null
  content_type: ContentType
  expert_id: string | null
  event_key: string | null
  primary_item_id: string | null
  data: unknown
}

const WINDOW_H: Record<ReportKind, number> = { gunluk: 24, acil: 24, haftalik: 24 * 7, aylik: 24 * 30 }
const TOPICS: Record<ReportKind, number> = { gunluk: 7, acil: 1, haftalik: 7, aylik: 6 }
const KIND_NAME: Record<ReportKind, string> = { gunluk: 'Günlük ekonomi raporu', haftalik: 'Haftalık ekonomi raporu', aylik: 'Aylık ekonomi raporu', acil: 'Acil bülten' }
const ITEM_COLS = 'id, url, title, body, author, institution, published_at, period, content_type, expert_id, event_key, primary_item_id, data'

const FOCUS: Record<ReportKind, string> = {
  gunluk: 'Son 24 saatin en önemli gelişmelerini anlat.',
  acil: 'Tek bir önemli gelişme için kısa bir acil bülten yaz.',
  haftalik: 'Haftanın gelişmelerini ve özellikle beklentilerin ve uzman görüşlerinin hafta içinde nasıl değiştiğini anlat.',
  aylik: 'Ayın geniş eğilimlerini anlat; tek tek haberlerden çok yönü ve birikimli etkiyi öne çıkar.',
}

const SYSTEM = (kind: ReportKind) => `Sen bir ekonomi araştırma editörüsün. ${FOCUS[kind]}
Her konu için sana numaralı kaynaklar verilecek: tür (Resmî veri, Şirket açıklaması, Haber, Uzman yorumu, Tahmin), kurum/yazar, yayın tarihi, dönem ve metin. Uzman kaynaklarında "kişisel görüş" ya da "kurum adına" bilgisi var.
Her konu için şu 6 bölümü Türkçe yaz (her biri en çok 3 cümle), her bölümde dayandığın kaynak numaralarını "refs" olarak ver:
- ne_oldu: Olanı yalnızca kaynaklara dayanarak anlat; ilk resmî açıklamayı öne koy.
- neden_onemli: Hane bütçesi, fiyatlar, faiz veya kur açısından neden önemli olabileceğini koşullu dille anlat.
- uzmanlar: Yalnızca Uzman yorumu/Tahmin türündeki kaynakları kullan. Kimin ne dediğini, nerede birleşip nerede ayrıştıklarını ve ayrışmanın hangi varsayımdan kaynaklandığını yaz. Kişisel görüşü kurum görüşü gibi sunma ("X'in kişisel görüşüne göre"). Uygun uzman kaynağı yoksa tam olarak şunu yaz ve refs boş olsun: "${NO_OPINION}"
- degerlendirme: Ortak araştırma değerlendirmesi: kaynakları birlikte tartarak dengeli, koşullu bir sonuç.
- senaryolar: Belirsizliği ve en az iki koşullu senaryoyu "…olursa …olabilir" biçiminde yaz.
- sonraki_isaret: İzlenecek bir sonraki veri, karar veya açıklama (verilen yayın takvimi veya kaynaklardan).
Kurallar:
- Yalnızca verilen kaynaklardaki bilgileri kullan. Kaynakta olmayan rakam yazma; rakamları kaynaktaki yazılışıyla aynen kullan, kendin hesaplama.
- Koşullu dil kullan; "kesin", "garanti", "mutlaka" gibi ifadeler kullanma, söz verme.
- Belirli bir hisse, fon, kripto, altın veya döviz için al/sat/tut, hedef fiyat, portföy oranı ya da fiyat yönü tahmini yazma; "muhtemelen" diye de yazma.
JSON döndür: {"topics": [{"title": "kısa başlık", "sections": {"ne_oldu": {"text": "...", "refs": [1]}, "neden_onemli": {...}, "uzmanlar": {...}, "degerlendirme": {...}, "senaryolar": {...}, "sonraki_isaret": {...}}}]} — konular sana verilen sırayla.`

const isOfficial = (t: ContentType) => t === 'resmi_veri' || t === 'sirket_aciklamasi'
const isOpinion = (t: ContentType) => t === 'uzman_yorumu' || t === 'tahmin'

function evidenceText(i: Item): string {
  return `${i.title}. ${i.body}${i.data ? ` ${JSON.stringify(i.data)}` : ''}`
}

/** Pencere içindeki maddeleri olaylara ayırır ve önem sırasına dizer. */
function pickEvents(items: Item[], kind: ReportKind, eventKey: string | null): Item[][] {
  const groups = new Map<string, Item[]>()
  for (const i of items) {
    if (isOpinion(i.content_type)) continue
    const k = i.event_key ?? i.id
    groups.set(k, [...(groups.get(k) ?? []), i])
  }
  let list = [...groups.entries()]
  if (eventKey) list = list.filter(([k]) => k === eventKey)
  const score = (g: Item[]) => (g.some((i) => isOfficial(i.content_type)) ? 3 : 0) + Math.min(g.length, 5) + Date.parse(g[0].published_at) / 1e13
  return list
    .map(([, g]) => g)
    .sort((a, b) => score(b) - score(a))
    .slice(0, TOPICS[kind])
}

function sourcesFor(group: Item[], opinions: Item[], experts: Map<string, { name: string; speaks_for: string }>): { sources: ReportSource[]; items: Item[] } {
  const ordered = [...group].sort((a, b) => Number(isOfficial(b.content_type)) - Number(isOfficial(a.content_type)) || a.published_at.localeCompare(b.published_at)).slice(0, 6)
  const tokens = titleTokens(ordered.map((i) => i.title).join(' '))
  const related = opinions
    .map((o) => ({ o, s: similarity(tokens, titleTokens(`${o.title} ${o.body.slice(0, 300)}`)) }))
    .filter((x) => x.s >= 0.25)
    .sort((a, b) => b.s - a.s)
    .slice(0, 4)
    .map((x) => x.o)
  const all = [...ordered, ...related]
  return {
    items: all,
    sources: all.map((i, idx) => {
      const ex = i.expert_id ? experts.get(i.expert_id) : null
      return {
        n: idx + 1,
        itemId: i.id,
        title: i.title,
        url: i.url,
        author: ex?.name ?? i.author,
        institution: i.institution,
        publishedAt: i.published_at,
        period: i.period,
        type: i.content_type,
        ...(isOpinion(i.content_type) ? { personal: (ex?.speaks_for ?? 'kisisel') === 'kisisel' } : {}),
      }
    }),
  }
}

function sanitizeSections(raw: unknown): Record<SectionKey, { text: string; refs: number[] }> {
  const src = (raw ?? {}) as Record<string, { text?: unknown; refs?: unknown }>
  const out = {} as Record<SectionKey, { text: string; refs: number[] }>
  for (const k of SECTION_KEYS) {
    const s = src[k] ?? {}
    out[k] = {
      text: typeof s.text === 'string' ? s.text.trim().slice(0, 1200) : '',
      refs: Array.isArray(s.refs) ? [...new Set(s.refs.filter((r): r is number => Number.isInteger(r)))].slice(0, 10) : [],
    }
  }
  return out
}

async function calendarText(db: SupabaseClient): Promise<string> {
  const { data } = await db
    .from('ha_release_calendar')
    .select('institution, title, release_at, period')
    .gte('release_at', new Date().toISOString())
    .order('release_at')
    .limit(15)
  return (data ?? []).map((c) => `${c.institution}: ${c.title}${c.period ? ` (${c.period})` : ''}, ${new Date(c.release_at).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`).join('\n')
}

async function evidenceFor(db: SupabaseClient, topics: ReportTopic[], calendar: string): Promise<Map<number, string>[]> {
  const ids = [...new Set(topics.flatMap((t) => t.sources.map((s) => s.itemId)))]
  const { data } = ids.length ? await db.from('ha_research_items').select(ITEM_COLS).in('id', ids) : { data: [] }
  const byId = new Map(((data ?? []) as Item[]).map((i) => [i.id, i]))
  return topics.map((t) => new Map<number, string>([[0, calendar], ...t.sources.map((s) => [s.n, byId.has(s.itemId) ? evidenceText(byId.get(s.itemId)!) : ''] as [number, string])]))
}

async function generate(db: SupabaseClient, kind: ReportKind, eventKey: string | null, by: string) {
  const settings = await agentSettings(db)
  if ((await usage(db, 'ai_research', 'month')) >= settings.ai_research_monthly_tokens) return json({ error: 'Araştırma için ayrılan aylık yapay zekâ sınırı doldu' }, 429)
  const end = new Date()
  const start = new Date(end.getTime() - WINDOW_H[kind] * 3600000)
  const opinionStart = new Date(end.getTime() - OPINION_DAYS[kind] * 86400000)
  const { data: rows } = await db.from('ha_research_items').select(ITEM_COLS).gte('published_at', start.toISOString()).lte('published_at', end.toISOString()).order('published_at', { ascending: false }).limit(400)
  const { data: opRows } = await db.from('ha_research_items').select(ITEM_COLS).in('content_type', ['uzman_yorumu', 'tahmin']).gte('published_at', opinionStart.toISOString()).order('published_at', { ascending: false }).limit(200)
  const { data: exRows } = await db.from('ha_experts').select('id, name, speaks_for')
  const experts = new Map((exRows ?? []).map((e) => [e.id as string, { name: e.name as string, speaks_for: e.speaks_for as string }]))
  const events = pickEvents((rows ?? []) as Item[], kind, eventKey)
  if (!events.length) return json({ ok: true, skipped: 'Bu dönemde rapor yazılacak kaynaklı gelişme yok' })

  const { data: run } = await db.from('ha_agent_runs').insert({ job: 'rapor', stats: { kind } }).select('id').single()
  const built = events.map((g) => sourcesFor(g, (opRows ?? []) as Item[], experts))
  const calendar = await calendarText(db)
  const prompt = built
    .map((b, ti) => {
      const src = b.sources
        .map((s, k) => `[${s.n}] ${CONTENT_LABEL[s.type]}${s.personal === undefined ? '' : s.personal ? ', kişisel görüş' : ', kurum adına'} · ${s.author ? `${s.author}, ` : ''}${s.institution} · yayın ${s.publishedAt}${s.period ? ` · dönem ${s.period}` : ''}\n${evidenceText(b.items[k]).slice(0, 1500)}`)
        .join('\n')
      return `### Konu ${ti + 1}\n${src}`
    })
    .join('\n\n')
  let parsed: { topics?: Array<{ title?: unknown; sections?: unknown }> }
  let tokens: number
  try {
    const r = await openaiChatUsage(
      [
        { role: 'system', content: SYSTEM(kind) },
        { role: 'user', content: `${prompt}\n\n### Yaklaşan yayın takvimi\n${calendar || '(kayıt yok)'}` },
      ],
      { json: true, maxTokens: 900 * built.length + 300, temperature: 0.2 },
    )
    tokens = r.tokens
    parsed = JSON.parse(r.text)
  } catch (e) {
    await db.from('ha_agent_runs').update({ finished_at: new Date().toISOString(), ok: false, error: String(e instanceof Error ? e.message : e).slice(0, 300) }).eq('id', run?.id)
    return json({ error: 'Rapor taslağı yazılamadı' }, 502)
  }
  await addUsage(db, 'ai_research', tokens)
  const topics: ReportTopic[] = built.map((b, ti) => {
    const t = parsed.topics?.[ti]
    return { title: typeof t?.title === 'string' && t.title.trim() ? t.title.trim().slice(0, 140) : b.items[0].title.slice(0, 140), eventKey: b.items[0].event_key, sections: sanitizeSections(t?.sections), sources: b.sources }
  })
  const checks = checkReport(kind, topics, await evidenceFor(db, topics, calendar), end)
  const day = end.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', year: 'numeric' })
  const title = kind === 'acil' ? `${KIND_NAME.acil}: ${topics[0].title}` : `${KIND_NAME[kind]} · ${day}`
  const { data: rep, error } = await db
    .from('ha_reports')
    .insert({ kind, title, window_start: start.toISOString(), window_end: end.toISOString(), topics, checks, first_checks: checks, created_by: by === 'cron' ? 'otomatik' : 'yonetici' })
    .select('id')
    .single()
  if (error) return json({ error: 'Taslak kaydedilemedi' }, 500)
  await db.from('ha_report_revisions').insert({ report_id: rep.id, version: 1, topics, checks, edited_by: by === 'cron' ? null : by, note: 'Otomatik taslak' })
  await db.from('ha_agent_runs').update({ finished_at: new Date().toISOString(), ok: true, stats: { kind, topics: topics.length, tokens, ok: checks.ok, issues: checks.issues.length } }).eq('id', run?.id)
  return json({ ok: true, id: rep.id, checks })
}

async function save(db: SupabaseClient, id: string, rawTopics: unknown, note: string, by: string) {
  const { data: rep } = await db.from('ha_reports').select('id, kind, status, topics, version, window_end').eq('id', id).maybeSingle()
  if (!rep) return json({ error: 'Rapor bulunamadı' }, 404)
  if (rep.status === 'reddedildi' || rep.status === 'geri_cekildi') return json({ error: 'Önce taslağa alın' }, 409)
  const old = rep.topics as ReportTopic[]
  const incoming = Array.isArray(rawTopics) ? (rawTopics as Array<{ title?: unknown; sections?: unknown; remove?: unknown }>) : []
  if (incoming.length !== old.length) return json({ error: 'Konu sayısı değişemez; konu çıkarmak için "remove" kullanın' }, 400)
  // Editör metni ve başlığı düzeltebilir, kaynak numaralarını değiştirebilir; kaynak listesi gerçek maddelerden gelir, değişmez.
  const topics: ReportTopic[] = old
    .map((t, i) => ({ t, x: incoming[i] }))
    .filter(({ x }) => x?.remove !== true)
    .map(({ t, x }) => ({ ...t, title: typeof x?.title === 'string' && x.title.trim() ? x.title.trim().slice(0, 140) : t.title, sections: sanitizeSections(x?.sections) }))
  if (!topics.length) return json({ error: 'Raporda en az bir konu kalmalı' }, 400)
  const calendar = await calendarText(db)
  // Yayın denetimi yayın anına göre değil, raporun dönemine göre yapılır.
  const checks = checkReport(rep.kind as ReportKind, topics, await evidenceFor(db, topics, calendar), new Date(rep.window_end))
  if (rep.status === 'yayinda' && !checks.ok) return json({ error: 'Yayındaki rapor denetimden geçmeyen bir metinle değiştirilemez', checks }, 422)
  const version = rep.version + 1
  const { error } = await db.from('ha_reports').update({ topics, checks, version, updated_at: new Date().toISOString() }).eq('id', id).eq('version', rep.version)
  if (error) return json({ error: 'Kaydedilemedi' }, 500)
  await db.from('ha_report_revisions').insert({ report_id: id, version, topics, checks, edited_by: by, note: note.slice(0, 300) || null, after_publish: rep.status === 'yayinda' })
  return json({ ok: true, checks, version })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const db = serviceClient()
  const who = await cronOrAdmin(req, db)
  if (!who) return json({ error: 'Yetkisiz' }, 401)
  let body: { action?: string; kind?: string; eventKey?: string; id?: string; topics?: unknown; note?: string } = {}
  try {
    body = await req.json()
  } catch {
    /* boş */
  }
  if ((body.action ?? 'generate') === 'generate') {
    const kind = (['gunluk', 'haftalik', 'aylik', 'acil'] as const).find((k) => k === body.kind) ?? 'gunluk'
    return await generate(db, kind, typeof body.eventKey === 'string' ? body.eventKey : null, who)
  }
  if (body.action === 'save' && who !== 'cron' && typeof body.id === 'string') return await save(db, body.id, body.topics, String(body.note ?? ''), who)
  return json({ error: 'Geçersiz istek' }, 400)
})

