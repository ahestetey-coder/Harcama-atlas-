// Günlük ekonomi özeti: yöneticinin eklediği RSS adreslerini ve X hesaplarını son 24 saat için tarar,
// OpenAI ile Türkçe özetler ve ha_coach_broadcasts tablosuna günün özeti olarak yazar.
// Özet yalnızca bulunan maddelerden yazılır; her maddenin kaynağı, bağlantısı ve tarihi saklanır.
// Zamanlanmış görev (pg_cron) çağırır; "x-cron-secret" başlığı CRON_SECRET ile eşleşmeli.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { cors, istanbulDay, json, openaiChat } from '../_shared/openai.ts'

interface RawItem {
  source: string
  url: string
  publishedAt: string
  text: string
}

const DAY_MS = 24 * 60 * 60 * 1000

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

const tag = (block: string, name: string) => block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'))?.[1] ?? ''

async function readRss(url: string, label: string | null, since: number): Promise<RawItem[]> {
  const res = await fetch(url, { headers: { 'User-Agent': 'HarcamaAtlasi/1.0 (+gunluk-ozet)' } })
  if (!res.ok) return []
  const xml = await res.text()
  const channel = label || decode(tag(xml, 'title')) || new URL(url).hostname
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) ?? []
  const out: RawItem[] = []
  for (const b of blocks) {
    const date = Date.parse(decode(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date')))
    if (!Number.isFinite(date) || date < since) continue
    const link = decode(tag(b, 'link')) || b.match(/<link[^>]*href="([^"]+)"/i)?.[1] || ''
    const text = `${decode(tag(b, 'title'))}. ${decode(tag(b, 'description') || tag(b, 'summary')).slice(0, 400)}`
    if (/^https?:\/\//i.test(link)) out.push({ source: channel, url: link, publishedAt: new Date(date).toISOString(), text })
    if (out.length >= 8) break
  }
  return out
}

async function readX(handles: string[], since: number): Promise<RawItem[]> {
  const token = Deno.env.get('X_BEARER_TOKEN')
  if (!token || !handles.length) return []
  const h = { Authorization: `Bearer ${token}` }
  const users = await fetch(`https://api.x.com/2/users/by?usernames=${handles.join(',')}`, { headers: h }).then((r) => (r.ok ? r.json() : { data: [] }))
  const out: RawItem[] = []
  for (const u of users.data ?? []) {
    const q = new URLSearchParams({ max_results: '10', exclude: 'replies,retweets', 'tweet.fields': 'created_at', start_time: new Date(since).toISOString() })
    const r = await fetch(`https://api.x.com/2/users/${u.id}/tweets?${q}`, { headers: h })
    if (!r.ok) continue
    const t = await r.json()
    for (const p of t.data ?? []) out.push({ source: `@${u.username}`, url: `https://x.com/${u.username}/status/${p.id}`, publishedAt: p.created_at, text: String(p.text).slice(0, 500) })
  }
  return out
}

const SYSTEM = `Sen bir ekonomi editörüsün. Sana numaralı haber ve paylaşım maddeleri verilecek. Görevin, uygulama kullanıcılarına "finans koçu" ağzından kısa bir Türkçe günlük özet yazmak.
Kurallar:
- YALNIZCA verilen maddelerdeki bilgileri kullan; madde dışında bilgi, rakam veya olay ekleme.
- Her önemli konuyu ayrı bir madde yap ve hangi numaralı maddeye dayandığını "ref" ile belirt.
- Her maddeyi türüne göre işaretle: "haber" (olan bir olay/açıklama), "yorum" (bir kişinin görüşü), "tahmin" (geleceğe dair beklenti).
- Alım-satım, portföy veya belirli ürün tavsiyesi verme. Garanti ifadesi kullanma.
- En çok 6 madde. Her madde en çok 2 cümle.
JSON döndür: {"title": "kısa başlık", "summary": "koçun 2-3 cümlelik girişi", "items": [{"ref": 1, "kind": "haber|yorum|tahmin", "text": "..."}]}`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const secret = Deno.env.get('CRON_SECRET')
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'Yetkisiz' }, 401)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: sources, error } = await db.from('ha_news_sources').select('kind, value, label').eq('active', true)
  if (error) return json({ error: 'Kaynaklar okunamadı' }, 500)
  const since = Date.now() - DAY_MS
  const rss = (sources ?? []).filter((s) => s.kind === 'rss')
  const xs = (sources ?? []).filter((s) => s.kind === 'x').map((s) => s.value)
  const items: RawItem[] = []
  for (const s of rss) items.push(...(await readRss(s.value, s.label, since).catch(() => [])))
  items.push(...(await readX(xs, since).catch(() => [])))
  if (!items.length) return json({ ok: true, skipped: 'Son 24 saatte madde bulunamadı' })

  const list = items.slice(0, 60)
  const prompt = list.map((it, i) => `[${i + 1}] (${it.source}, ${it.publishedAt}) ${it.text}`).join('\n')
  let parsed: { title?: string; summary?: string; items?: Array<{ ref?: number; kind?: string; text?: string }> }
  try {
    parsed = JSON.parse(await openaiChat([{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }], { json: true, maxTokens: 1200 }))
  } catch {
    return json({ error: 'Özet üretilemedi' }, 502)
  }
  // Kaynak bilgisi modelden değil, gerçek maddelerden eklenir; geçersiz referanslı madde atılır.
  const out = (parsed.items ?? [])
    .filter((x) => Number.isInteger(x.ref) && x.ref! >= 1 && x.ref! <= list.length && typeof x.text === 'string' && ['haber', 'yorum', 'tahmin'].includes(x.kind ?? ''))
    .slice(0, 6)
    .map((x) => {
      const src = list[x.ref! - 1]
      return { kind: x.kind, text: x.text!.slice(0, 400), source: src.source, url: src.url, publishedAt: src.publishedAt }
    })
  if (!out.length) return json({ ok: true, skipped: 'Geçerli madde yok' })
  const day = istanbulDay()
  const { error: e2 } = await db
    .from('ha_coach_broadcasts')
    .upsert({ day, title: String(parsed.title ?? 'Günün ekonomi özeti').slice(0, 120), summary: String(parsed.summary ?? '').slice(0, 600), items: out }, { onConflict: 'day' })
  if (e2) return json({ error: 'Kaydedilemedi' }, 500)
  return json({ ok: true, day, items: out.length })
})
