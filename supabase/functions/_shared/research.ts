// Ortak ekonomi araştırma ajanının saf kuralları: kaynak okuma, tekrar ayıklama, olay eşleştirme,
// dönem çıkarma, rakam ve tarih denetimi, yayın öncesi rapor kontrolleri. Deno'ya ya da tarayıcıya bağlı değil;
// sunucu fonksiyonları ve birim testleri aynı kodu kullanır.
import { steeringIssues, type SteeringIssue } from './guard.ts'

export type ContentType = 'resmi_veri' | 'sirket_aciklamasi' | 'haber' | 'uzman_yorumu' | 'tahmin'
export type SourceGroup = 'tr_resmi' | 'global_resmi' | 'haber_uzman' | 'piyasa'
export type SourceKind = 'rss' | 'x' | 'tcmb_kur' | 'data' | 'api' | 'page'

export const CONTENT_LABEL: Record<ContentType, string> = {
  resmi_veri: 'Resmî veri',
  sirket_aciklamasi: 'Şirket açıklaması',
  haber: 'Haber',
  uzman_yorumu: 'Uzman yorumu',
  tahmin: 'Tahmin',
}

export interface FeedEntry {
  title: string
  url: string
  author: string | null
  publishedAt: string
  text: string
  /** Kaynağın kendi kimliği (guid/id), varsa. */
  guid: string | null
}

const decodeEntities = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ')
    .trim()

const tag = (block: string, name: string) => block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))?.[1] ?? ''

function absolute(link: string, base: string | undefined): string {
  if (/^https?:\/\//i.test(link) || !base || !link.startsWith('/')) return link
  try {
    return new URL(link, base).toString()
  } catch {
    return link
  }
}

/**
 * RSS 2.0, RDF ve Atom beslemelerini okur. Göreli bağlantılar beslemenin adresine göre tamamlanır;
 * bağlantısı http(s) olmayan veya tarihi okunamayan maddeler atlanır.
 */
export function parseFeed(xml: string, baseUrl?: string): { channel: string; entries: FeedEntry[] } {
  const head = xml.split(/<item[\s>]|<entry[\s>]/i)[0]
  const channel = decodeEntities(tag(head, 'title'))
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) ?? []
  const entries: FeedEntry[] = []
  for (const b of blocks) {
    const date = Date.parse(decodeEntities(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date')))
    if (!Number.isFinite(date)) continue
    const link = absolute(decodeEntities(tag(b, 'link')) || b.match(/<link[^>]*href="([^"]+)"/i)?.[1] || '', baseUrl)
    if (!/^https?:\/\//i.test(link)) continue
    const author = decodeEntities(tag(b, 'dc:creator') || tag(tag(b, 'author'), 'name') || tag(b, 'author')) || null
    entries.push({
      title: decodeEntities(tag(b, 'title')).slice(0, 300),
      url: link,
      author: author ? author.slice(0, 120) : null,
      publishedAt: new Date(date).toISOString(),
      text: decodeEntities(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content')).slice(0, 1200),
      guid: decodeEntities(tag(b, 'guid') || tag(b, 'id')) || null,
    })
  }
  return { channel, entries }
}

export interface Rate {
  code: string
  name: string
  /** Döviz satış (yoksa alış) gösterge kuru. */
  value: number
}

/** TCMB "today.xml" gösterge kurları. Tarih "MM/DD/YYYY" biçimindeki Date özniteliğinden okunur. */
export function parseTcmbRates(xml: string): { date: string; rates: Rate[] } | null {
  const d = xml.match(/<Tarih_Date[^>]*\sDate="(\d{2})\/(\d{2})\/(\d{4})"/i)
  if (!d) return null
  const rates: Rate[] = []
  for (const m of xml.matchAll(/<Currency[^>]*CurrencyCode="([A-Z]{3})"[^>]*>([\s\S]*?)<\/Currency>/gi)) {
    const unit = Number(tag(m[2], 'Unit')) || 1
    const v = Number(tag(m[2], 'ForexSelling') || tag(m[2], 'ForexBuying'))
    if (!Number.isFinite(v) || v <= 0) continue
    rates.push({ code: m[1], name: decodeEntities(tag(m[2], 'Isim')) || m[1], value: v / unit })
  }
  return rates.length ? { date: `${d[3]}-${d[1]}-${d[2]}`, rates } : null
}

/** Bağlantıyı karşılaştırma için sadeleştirir: şema, www, izleme parametreleri ve sondaki / atılır. */
export function normalizeUrl(u: string): string {
  try {
    const url = new URL(u)
    url.hash = ''
    for (const k of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$|s$|t$)/i.test(k)) url.searchParams.delete(k)
    url.searchParams.sort()
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    return `${host}${url.pathname.replace(/\/+$/, '')}${url.search}`
  } catch {
    return u.trim().toLowerCase()
  }
}

/** 53 bit FNV benzeri karma; tekrar anahtarı için yeterli, kriptografik değil. */
export function hashKey(s: string): string {
  let h1 = 0xdeadbeef ^ s.length
  let h2 = 0x41c6ce57 ^ s.length
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

/** Aynı maddenin tekrar kaydedilmemesi için anahtar: kaynağın kimliği, yoksa sadeleştirilmiş bağlantı. */
export function dedupeKey(e: { url: string; guid?: string | null }): string {
  return hashKey(e.guid && !/^https?:/i.test(e.guid) ? `g:${e.guid}` : `u:${normalizeUrl(e.url)}`)
}

const STOP = new Set(
  'a an and the of to in on for at by with from as is are was be has have its it that this ve ile bir bu da de için olarak olan gibi daha en çok ise ya veya ki mi göre üzere sonra önce yüzde yeni'.split(' '),
)

/** Başlığın anlamlı sözcükleri (küçük harf, 3+ harf veya sayı). */
export function titleTokens(title: string): Set<string> {
  const words = title
    .toLocaleLowerCase('tr-TR')
    .replace(/[^\p{L}\p{N}%,.]+/gu, ' ')
    .split(' ')
    .map((w) => w.replace(/[.,]+$/, ''))
    .filter((w) => w && !STOP.has(w) && (w.length >= 3 || /\d/.test(w)))
  return new Set(words)
}

export function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let n = 0
  for (const w of a) if (b.has(w)) n++
  return n / Math.min(a.size, b.size)
}

export interface EventCandidate {
  id: string
  title: string
  publishedAt: string
  contentType: ContentType
  eventKey: string | null
}

const EVENT_WINDOW_MS = 3 * 24 * 60 * 60 * 1000

/**
 * Yeni maddeyi son 3 gündeki maddelerle başlık benzerliğine göre aynı olaya bağlar. Eşleşme yoksa yeni olay
 * açılır. Olayın "birincil" maddesi, olaydaki en erken resmî veri veya şirket açıklamasıdır; yoksa en erken madde.
 */
export function matchEvent(item: { title: string; publishedAt: string }, recent: EventCandidate[], threshold = 0.6): { eventKey: string; matchedId: string | null } {
  const tokens = titleTokens(item.title)
  const t = Date.parse(item.publishedAt)
  let best: { c: EventCandidate; s: number } | null = null
  for (const c of recent) {
    if (Math.abs(Date.parse(c.publishedAt) - t) > EVENT_WINDOW_MS) continue
    const s = similarity(tokens, titleTokens(c.title))
    if (s >= threshold && (!best || s > best.s)) best = { c, s }
  }
  if (best) return { eventKey: best.c.eventKey ?? best.c.id, matchedId: best.c.id }
  return { eventKey: hashKey(`e:${[...tokens].sort().join(' ')}:${item.publishedAt.slice(0, 10)}`), matchedId: null }
}

export function primaryOf<T extends { publishedAt: string; contentType: ContentType }>(items: T[]): T | null {
  const official = items.filter((i) => i.contentType === 'resmi_veri' || i.contentType === 'sirket_aciklamasi')
  const pool = official.length ? official : items
  return pool.reduce<T | null>((a, b) => (!a || Date.parse(b.publishedAt) < Date.parse(a.publishedAt) ? b : a), null)
}

const MONTHS_TR = ['ocak', 'şubat', 'mart', 'nisan', 'mayıs', 'haziran', 'temmuz', 'ağustos', 'eylül', 'ekim', 'kasım', 'aralık']
const MONTHS_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

/** Verinin ait olduğu dönem ("2026-09", "2026-Ç3", "2026"); bulunamazsa null. */
export function extractPeriod(text: string): string | null {
  const l = text.toLocaleLowerCase('tr-TR')
  const months = [...MONTHS_TR, ...MONTHS_EN]
  const mm = l.match(new RegExp(`(${months.join('|')})\\s+(20\\d{2})`, 'u'))
  if (mm) return `${mm[2]}-${String((months.indexOf(mm[1]) % 12) + 1).padStart(2, '0')}`
  const q = l.match(/(20\d{2})\s*(?:yılının\s*)?(?:q|ç)([1-4])|([1-4])\.\s*çeyre\p{L}*\s*(?:\(?\s*(20\d{2}))?|(?:q|ç)([1-4])\s*(20\d{2})/u)
  if (q) {
    const year = q[1] ?? q[4] ?? q[6]
    const n = q[2] ?? q[3] ?? q[5]
    if (year) return `${year}-Ç${n}`
  }
  return null
}

/** Metindeki sayılar, karşılaştırma için sadeleştirilmiş biçimde ("3,5" ve "3.5" → "3.5"; "1.250" → "1250"). */
export function numbersIn(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(/(?<![\p{L}\d])(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)(?![\d])/gu)) {
    out.push(canonicalNumber(m[1]))
  }
  return out
}

export function canonicalNumber(raw: string): string {
  let s = raw
  const thousands = /^\d{1,3}([.,])\d{3}(\1\d{3})*([.,]\d+)?$/.exec(s)
  if (thousands && (thousands[3] || s.split(thousands[1]).length > 2 || s.length > 5)) {
    s = s.split(thousands[1]).join('')
    s = s.replace(',', '.')
  } else s = s.replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? String(n) : raw
}

const DATE_RE = new RegExp(`(?<!\\d)\\d{1,2}\\s+(?:${[...MONTHS_TR, ...MONTHS_EN].join('|')})\\p{L}*`, 'giu')

/**
 * Açıklama gerektirmeyen sayılar denetimden muaf: tarihlerdeki gün ("5 Ekim"), yıllar, sıra sayıları
 * ("2. çeyrek") ve yüzde olmayan 12'ye kadar küçük tam sayılar ("3 ay", "5 gelişme").
 */
function checkable(text: string): string[] {
  const cleaned = text
    .replace(DATE_RE, ' ')
    .replace(/(?<![\d.,])(?:19|20)\d{2}(?![\d.,]\d)/g, ' ')
    .replace(/(?<![\d.,])\d{1,2}\.(?=\s)/g, ' ')
  const out: string[] = []
  for (const m of cleaned.matchAll(/(%\s?|yüzde\s?)?(?<![\p{L}\d])(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)(?!\d)(\s?%)?/giu)) {
    const n = canonicalNumber(m[2])
    const v = Number(n)
    const pct = !!(m[1] || m[3])
    if (!pct && Number.isInteger(v) && v <= 12) continue
    out.push(n)
  }
  return out
}

/** Metinde geçip kaynak metinlerinde (veya hesaplanmış değerlerde) bulunmayan sayılar. */
export function unsupportedNumbers(text: string, evidence: string[]): string[] {
  const pool = new Set(evidence.flatMap(numbersIn))
  return [...new Set(checkable(text))].filter((n) => !pool.has(n))
}

// ---------------------------------------------------------------------------------------------
// Raporlar

export type ReportKind = 'gunluk' | 'haftalik' | 'aylik' | 'acil'

export const SECTION_KEYS = ['ne_oldu', 'neden_onemli', 'uzmanlar', 'degerlendirme', 'senaryolar', 'sonraki_isaret'] as const
export type SectionKey = (typeof SECTION_KEYS)[number]

export const SECTION_TITLE: Record<SectionKey | 'kaynaklar', string> = {
  ne_oldu: 'Ne oldu?',
  neden_onemli: 'Neden önemli?',
  uzmanlar: 'Uzmanlar nasıl yorumluyor?',
  degerlendirme: 'Ortak araştırma değerlendirmesi',
  senaryolar: 'Belirsizlik ve senaryolar',
  sonraki_isaret: 'Sonraki işaret',
  kaynaklar: 'Kaynaklar',
}

export interface ReportSource {
  n: number
  itemId: string
  title: string
  url: string
  author: string | null
  institution: string
  publishedAt: string
  period: string | null
  type: ContentType
  /** Uzman görüşüyse uzmanın kişisel mi kurumsal mı konuştuğu. */
  personal?: boolean
}

export interface ReportSection {
  text: string
  refs: number[]
}

export interface ReportTopic {
  title: string
  eventKey: string | null
  sections: Record<SectionKey, ReportSection>
  sources: ReportSource[]
}

export interface ReportIssue {
  topic: number
  section: SectionKey | 'kaynaklar' | null
  kind: 'kaynaksiz' | 'bilinmeyen-kaynak' | 'eski-veri' | 'kaynaksiz-rakam' | 'yonlendirme' | 'eksik-bolum' | 'eski-gorus' | 'kesin-dil'
  detail: string
}

export interface ReportChecks {
  ok: boolean
  checkedAt: string
  issues: ReportIssue[]
  counts: { kaynaksiz: number; eskiVeri: number; kaynaksizRakam: number; yonlendirme: number; kaynakSayisi: number }
}

/** Rapor türüne göre bir kaynağın "güncel" sayıldığı en uzun süre (gün). */
export const FRESH_DAYS: Record<ReportKind, number> = { gunluk: 3, acil: 2, haftalik: 10, aylik: 40 }
/** Uzman görüşlerinin kanıt olarak kullanılabileceği en uzun süre (gün). */
export const OPINION_DAYS: Record<ReportKind, number> = { gunluk: 14, acil: 7, haftalik: 21, aylik: 60 }

/** Kaynak gerektiren bölümler (iddia içerir). "Sonraki işaret" yayın takvimine de dayanabilir. */
const NEEDS_REFS: SectionKey[] = ['ne_oldu', 'neden_onemli', 'uzmanlar', 'degerlendirme']

const CERTAINTY = /(?<![\p{L}])(kesin(?:likle)?|garanti(?:li|si)?|mutlaka|şüphesiz|kaçınılmaz)(?![\p{L}])/iu
const NO_OPINION = 'Bu konuda güncel ve kaynaklı uzman yorumu yok.'

/**
 * Yayın öncesi denetim: her iddia bölümünün kaynağı var mı, kaynaklar listede mi ve güncel mi, metindeki
 * rakamlar kaynaklarda veya hesaplanmış değerlerde geçiyor mu, uzman görüşü güncel mi, yönlendirme veya kesin
 * dil var mı. Hiç sorun yoksa ok=true; editör onayı ayrıca gerekir.
 */
export function checkReport(kind: ReportKind, topics: ReportTopic[], evidence: Map<number, string>[] | null, now = new Date()): ReportChecks {
  const issues: ReportIssue[] = []
  const freshMs = FRESH_DAYS[kind] * 86400000
  const opinionMs = OPINION_DAYS[kind] * 86400000
  if (!topics.length) issues.push({ topic: -1, section: null, kind: 'eksik-bolum', detail: 'Raporda konu yok' })
  topics.forEach((t, ti) => {
    const byN = new Map(t.sources.map((s) => [s.n, s]))
    if (!t.sources.length) issues.push({ topic: ti, section: 'kaynaklar', kind: 'kaynaksiz', detail: 'Konunun kaynağı yok' })
    for (const s of t.sources) {
      if (!/^https?:\/\//i.test(s.url)) issues.push({ topic: ti, section: 'kaynaklar', kind: 'bilinmeyen-kaynak', detail: `[${s.n}] bağlantısı geçersiz` })
      const age = now.getTime() - Date.parse(s.publishedAt)
      const limit = s.type === 'uzman_yorumu' || s.type === 'tahmin' ? opinionMs : freshMs
      if (!Number.isFinite(age) || age > limit) issues.push({ topic: ti, section: 'kaynaklar', kind: s.type === 'uzman_yorumu' || s.type === 'tahmin' ? 'eski-gorus' : 'eski-veri', detail: `[${s.n}] ${s.publishedAt.slice(0, 10)} tarihli; bu rapor için eski` })
      if (age < -3600000) issues.push({ topic: ti, section: 'kaynaklar', kind: 'eski-veri', detail: `[${s.n}] yayın tarihi gelecekte görünüyor` })
    }
    for (const key of SECTION_KEYS) {
      const sec = t.sections[key]
      if (!sec || !sec.text?.trim()) {
        issues.push({ topic: ti, section: key, kind: 'eksik-bolum', detail: `${SECTION_TITLE[key]} boş` })
        continue
      }
      const noOpinion = key === 'uzmanlar' && sec.text.trim() === NO_OPINION
      if (NEEDS_REFS.includes(key) && !sec.refs.length && !noOpinion) issues.push({ topic: ti, section: key, kind: 'kaynaksiz', detail: `${SECTION_TITLE[key]} bölümünde kaynak yok` })
      for (const r of sec.refs) if (!byN.has(r)) issues.push({ topic: ti, section: key, kind: 'bilinmeyen-kaynak', detail: `[${r}] kaynak listesinde yok` })
      if (key === 'uzmanlar' && !noOpinion) {
        for (const r of sec.refs) {
          const s = byN.get(r)
          if (s && s.type !== 'uzman_yorumu' && s.type !== 'tahmin') issues.push({ topic: ti, section: key, kind: 'kaynaksiz', detail: `[${r}] uzman görüşü değil (${CONTENT_LABEL[s.type]})` })
        }
      }
      // Rakamlar: yalnızca bu bölümün kaynaklarında (ve hesaplanmış değerlerde) geçenler kullanılabilir.
      const ev = evidence?.[ti]
      if (ev) {
        const texts = (sec.refs.length ? sec.refs : t.sources.map((s) => s.n)).map((r) => ev.get(r) ?? '')
        const bad = unsupportedNumbers(sec.text, [...texts, ev.get(0) ?? ''])
        if (bad.length) issues.push({ topic: ti, section: key, kind: 'kaynaksiz-rakam', detail: `Kaynakta bulunmayan rakam: ${bad.join(', ')}` })
      }
      for (const s of steeringIssues(sec.text) as SteeringIssue[]) issues.push({ topic: ti, section: key, kind: 'yonlendirme', detail: s.sentence })
      if (CERTAINTY.test(sec.text)) issues.push({ topic: ti, section: key, kind: 'kesin-dil', detail: 'Koşullu dil yerine kesinlik ifadesi var' })
    }
  })
  const count = (k: ReportIssue['kind'][]) => issues.filter((i) => k.includes(i.kind)).length
  return {
    ok: issues.length === 0,
    checkedAt: now.toISOString(),
    issues,
    counts: {
      kaynaksiz: count(['kaynaksiz', 'bilinmeyen-kaynak']),
      eskiVeri: count(['eski-veri', 'eski-gorus']),
      kaynaksizRakam: count(['kaynaksiz-rakam']),
      yonlendirme: count(['yonlendirme', 'kesin-dil']),
      kaynakSayisi: topics.reduce((n, t) => n + t.sources.length, 0),
    },
  }
}

export { NO_OPINION }

// ---------------------------------------------------------------------------------------------
// Toplama zamanlaması

export interface SourceSchedule {
  poll_minutes: number
  last_checked_at: string | null
}

/** Planlı bir yayına (TÜİK verisi, faiz kararı) 30 dk kala ile 3 saat sonrası arasında kaynak sık (10 dk) kontrol edilir. */
export function isHot(releases: { release_at: string }[], now = new Date()): boolean {
  const t = now.getTime()
  return releases.some((r) => {
    const d = Date.parse(r.release_at) - t
    return d <= 30 * 60000 && d >= -3 * 3600000
  })
}

export function isDue(s: SourceSchedule, hot: boolean, now = new Date()): boolean {
  if (!s.last_checked_at) return true
  const every = hot ? Math.min(10, s.poll_minutes) : s.poll_minutes
  return now.getTime() - Date.parse(s.last_checked_at) >= every * 60000 - 30000
}
