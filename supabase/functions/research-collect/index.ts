// Ortak araştırma ajanı: kaynak toplama. Zamanlayıcı (pg_cron) her 10 dakikada çağırır; yönetici panelden
// "Şimdi kontrol et" ile de çalıştırabilir. Yalnızca açık ve kullanım koşulları "izinli" işaretlenmiş kaynaklar
// okunur; her kaynak kendi aralığında, planlı bir yayının çevresinde 10 dakikada bir kontrol edilir.
// Hata olursa kaynağın hata bilgisi güncellenir, diğer kaynaklar etkilenmez; sonraki çalışmada kaldığı yerden
// devam eder (aynı madde dedupe_key sayesinde iki kez kaydedilmez).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { cors, json } from '../_shared/openai.ts'
import {
  dedupeKey,
  extractPeriod,
  isDue,
  isHot,
  matchEvent,
  parseFeed,
  parseTcmbRates,
  primaryOf,
  type ContentType,
  type EventCandidate,
  type FeedEntry,
} from '../_shared/research.ts'
import { addUsage, agentSettings, cronOrAdmin, serviceClient, usage } from '../_shared/server.ts'

interface Source {
  id: string
  kind: 'x' | 'rss' | 'tcmb_kur' | 'data' | 'api' | 'page'
  value: string
  label: string | null
  grp: string
  default_type: ContentType
  poll_minutes: number
  expert_id: string | null
  last_checked_at: string | null
  last_item_at: string | null
  items_total: number
}

interface NewItem {
  dedupe_key: string
  url: string
  title: string
  body: string
  author: string | null
  institution: string
  published_at: string
  period: string | null
  content_type: ContentType
  expert_id: string | null
  data?: unknown
}

const UA = 'HarcamaAtlasi-Arastirma/1.0 (+https://ahestetey-coder.github.io/Harcama-atlas-/)'
const FIRST_RUN_DAYS = 3
const FORECAST = /(?<![\p{L}])(bekliyor(?:uz|um)|beklenti\p{L}*|tahmin\p{L}*|öngör\p{L}*|forecast\p{L}*|expect\p{L}*|projection\p{L}*|outlook)(?![\p{L}])/iu
const CURRENCIES = ['USD', 'EUR', 'GBP', 'CHF', 'JPY']

async function get(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' }, signal: AbortSignal.timeout(20000) })
  if (!res.ok) throw new Error(`Kaynak ${res.status} yanıtı verdi`)
  return await res.text()
}

const trNum = (v: number, digits = 4) => v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: digits })

async function readTcmb(db: SupabaseClient, s: Source): Promise<NewItem[]> {
  const parsed = parseTcmbRates(await get(s.value))
  if (!parsed) throw new Error('Kur dosyası okunamadı')
  const { data: prev } = await db.from('ha_research_items').select('data, published_at').eq('source_id', s.id).lt('published_at', `${parsed.date}T00:00:00Z`).order('published_at', { ascending: false }).limit(1).maybeSingle()
  const prevRates = new Map<string, number>(((prev?.data as { rates?: Array<{ code: string; value: number }> } | null)?.rates ?? []).map((r) => [r.code, r.value]))
  // Değişim kuralla hesaplanır; rapor yalnızca bu rakamları kullanabilir.
  const rates = parsed.rates
    .filter((r) => CURRENCIES.includes(r.code))
    .map((r) => {
      const p = prevRates.get(r.code)
      return { code: r.code, name: r.name, value: Number(r.value.toFixed(4)), prev: p ?? null, changePct: p ? Number((((r.value - p) / p) * 100).toFixed(2)) : null }
    })
  const [y, m, d] = parsed.date.split('-')
  const body = rates.map((r) => `${r.name} (${r.code}) döviz satış: ${trNum(r.value)} TL${r.changePct != null ? `; önceki yayına göre %${trNum(r.changePct, 2)}` : ''}`).join('. ')
  return [
    {
      dedupe_key: `tcmb-kur:${parsed.date}`,
      url: `https://www.tcmb.gov.tr/kurlar/${y}${m}/${d}${m}${y}.xml`,
      title: `TCMB gösterge kurları, ${d}.${m}.${y}`,
      body,
      author: null,
      institution: 'TCMB',
      // TCMB gösterge kurları 15.30'da (TSİ) ilan edilir.
      published_at: `${parsed.date}T12:30:00Z`,
      period: parsed.date,
      content_type: 'resmi_veri',
      expert_id: null,
      data: { rates },
    },
  ]
}

async function readX(s: Source, since: number): Promise<FeedEntry[]> {
  const token = Deno.env.get('X_BEARER_TOKEN')
  if (!token) throw new Error('X erişim anahtarı (X_BEARER_TOKEN) tanımlı değil')
  const h = { Authorization: `Bearer ${token}` }
  const u = await fetch(`https://api.x.com/2/users/by/username/${s.value}`, { headers: h, signal: AbortSignal.timeout(20000) })
  if (!u.ok) throw new Error(`X kullanıcı sorgusu ${u.status}`)
  const id = (await u.json())?.data?.id
  if (!id) throw new Error('X hesabı bulunamadı')
  const q = new URLSearchParams({ max_results: '10', exclude: 'replies,retweets', 'tweet.fields': 'created_at', start_time: new Date(since).toISOString() })
  const r = await fetch(`https://api.x.com/2/users/${id}/tweets?${q}`, { headers: h, signal: AbortSignal.timeout(20000) })
  if (!r.ok) throw new Error(`X gönderi sorgusu ${r.status}`)
  const t = await r.json()
  return (t.data ?? []).map((p: { id: string; text: string; created_at: string }) => ({
    title: String(p.text).slice(0, 140),
    url: `https://x.com/${s.value}/status/${p.id}`,
    author: `@${s.value}`,
    publishedAt: p.created_at,
    text: String(p.text).slice(0, 1200),
    guid: `x:${p.id}`,
  }))
}

function toItems(s: Source, channel: string, entries: FeedEntry[], since: number, expertName: string | null): NewItem[] {
  return entries
    .filter((e) => Date.parse(e.publishedAt) >= since && Date.parse(e.publishedAt) <= Date.now() + 3600000)
    .slice(0, 30)
    .map((e) => {
      let type: ContentType = s.expert_id ? 'uzman_yorumu' : s.default_type
      if (type === 'uzman_yorumu' && FORECAST.test(`${e.title} ${e.text}`)) type = 'tahmin'
      return {
        dedupe_key: dedupeKey(e),
        url: e.url,
        title: e.title || channel,
        body: e.text,
        author: expertName ?? e.author,
        institution: s.label || channel || new URL(s.kind === 'x' ? 'https://x.com' : s.value).hostname,
        published_at: e.publishedAt,
        period: extractPeriod(`${e.title} ${e.text.slice(0, 200)}`),
        content_type: type,
        expert_id: s.expert_id,
      }
    })
}

/** Yeni maddeleri kaydeder, olaya bağlar ve aynı olayın haberlerini ilk resmî açıklamaya bağlar. Yeni madde sayısını döner. */
async function store(db: SupabaseClient, sourceId: string, items: NewItem[]): Promise<number> {
  if (!items.length) return 0
  const keys = items.map((i) => i.dedupe_key)
  const { data: existing } = await db.from('ha_research_items').select('dedupe_key').in('dedupe_key', keys)
  const seen = new Set((existing ?? []).map((r: { dedupe_key: string }) => r.dedupe_key))
  const fresh = items.filter((i, idx) => !seen.has(i.dedupe_key) && keys.indexOf(i.dedupe_key) === idx)
  if (!fresh.length) return 0
  const { data: recentRows } = await db
    .from('ha_research_items')
    .select('id, title, published_at, content_type, event_key, primary_item_id')
    .gte('published_at', new Date(Date.now() - 4 * 86400000).toISOString())
    .order('published_at', { ascending: false })
    .limit(500)
  const recent: Array<EventCandidate & { primaryId: string | null }> = (recentRows ?? []).map((r) => ({ id: r.id, title: r.title, publishedAt: r.published_at, contentType: r.content_type, eventKey: r.event_key, primaryId: r.primary_item_id }))
  let added = 0
  for (const it of fresh) {
    const ev = matchEvent({ title: it.title, publishedAt: it.published_at }, recent)
    const cluster = recent.filter((r) => r.eventKey === ev.eventKey)
    const { data: ins, error } = await db
      .from('ha_research_items')
      .upsert({ ...it, source_id: sourceId, event_key: ev.eventKey }, { onConflict: 'dedupe_key', ignoreDuplicates: true })
      .select('id')
      .maybeSingle()
    if (error || !ins) continue
    added++
    const me = { id: ins.id as string, title: it.title, publishedAt: it.published_at, contentType: it.content_type, eventKey: ev.eventKey, primaryId: null as string | null }
    const primary = primaryOf([...cluster, me])
    if (primary && (primary.contentType === 'resmi_veri' || primary.contentType === 'sirket_aciklamasi')) {
      const others = [...cluster, me].filter((c) => c.id !== primary.id && c.primaryId !== primary.id).map((c) => c.id)
      if (others.length) await db.from('ha_research_items').update({ primary_item_id: primary.id }).in('id', others)
      for (const c of [...cluster, me]) if (c.id !== primary.id) c.primaryId = primary.id
    }
    recent.unshift(me)
  }
  return added
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const db = serviceClient()
  const who = await cronOrAdmin(req, db)
  if (!who) return json({ error: 'Yetkisiz' }, 401)
  let only: string | null = null
  try {
    only = (await req.json())?.sourceId ?? null
  } catch {
    /* gövdesiz çağrı */
  }

  const settings = await agentSettings(db)
  let collectLeft = settings.collect_daily_max - (await usage(db, 'collect', 'day'))
  let marketLeft = settings.market_daily_max - (await usage(db, 'market', 'day'))
  const { data: run } = await db.from('ha_agent_runs').insert({ job: 'toplama' }).select('id').single()

  let q = db.from('ha_news_sources').select('*').eq('active', true).eq('terms_status', 'izinli')
  if (only) q = q.eq('id', only)
  const { data: sources, error } = await q
  if (error) {
    await db.from('ha_agent_runs').update({ finished_at: new Date().toISOString(), ok: false, error: 'Kaynaklar okunamadı' }).eq('id', run?.id)
    return json({ error: 'Kaynaklar okunamadı' }, 500)
  }
  const now = new Date()
  const { data: cal } = await db
    .from('ha_release_calendar')
    .select('source_id, release_at')
    .gte('release_at', new Date(now.getTime() - 3 * 3600000).toISOString())
    .lte('release_at', new Date(now.getTime() + 3600000).toISOString())
  const { data: experts } = await db.from('ha_experts').select('id, name, active')
  const expertName = new Map((experts ?? []).filter((e) => e.active).map((e) => [e.id as string, e.name as string]))

  const stats = { kontrol: 0, yeni: 0, hata: 0, atlanan: 0, sinir: false }
  for (const s of (sources ?? []) as Source[]) {
    const hot = isHot((cal ?? []).filter((c) => c.source_id === s.id), now)
    if (!only && !isDue(s, hot, now)) {
      stats.atlanan++
      continue
    }
    if (s.expert_id && !expertName.has(s.expert_id)) {
      stats.atlanan++
      continue
    }
    const market = s.kind === 'tcmb_kur'
    if (collectLeft <= 0 || (market && marketLeft <= 0)) {
      stats.sinir = true
      break
    }
    collectLeft--
    if (market) marketLeft--
    await addUsage(db, market ? 'market' : 'collect', 1)
    stats.kontrol++
    const checkedAt = new Date().toISOString()
    try {
      // Kaldığı yerden devam: son maddenin 1 gün öncesinden itibaren okunur (geç yayımlananlar için pay).
      const since = s.last_item_at ? Date.parse(s.last_item_at) - 86400000 : Date.now() - FIRST_RUN_DAYS * 86400000
      let items: NewItem[]
      if (s.kind === 'rss') {
        const feed = parseFeed(await get(s.value), s.value)
        items = toItems(s, feed.channel, feed.entries, since, s.expert_id ? expertName.get(s.expert_id)! : null)
      } else if (s.kind === 'x') {
        items = toItems(s, `@${s.value}`, await readX(s, since), since, s.expert_id ? expertName.get(s.expert_id)! : null)
      } else if (s.kind === 'tcmb_kur') {
        items = await readTcmb(db, s)
      } else {
        throw new Error('Bu erişim türü için okuyucu henüz yok; RSS veya resmî veri adresi kullanın')
      }
      const added = await store(db, s.id, items)
      stats.yeni += added
      const latest = items.reduce<string | null>((a, i) => (!a || i.published_at > a ? i.published_at : a), s.last_item_at)
      await db.from('ha_news_sources').update({ last_checked_at: checkedAt, last_ok_at: checkedAt, last_error: null, last_item_at: latest, items_total: s.items_total + added }).eq('id', s.id)
    } catch (e) {
      stats.hata++
      await db
        .from('ha_news_sources')
        .update({ last_checked_at: checkedAt, last_error: String(e instanceof Error ? e.message : e).slice(0, 300), last_error_at: checkedAt })
        .eq('id', s.id)
    }
  }
  await db.from('ha_agent_runs').update({ finished_at: new Date().toISOString(), ok: stats.hata === 0, stats }).eq('id', run?.id)
  return json({ ok: true, ...stats })
})
