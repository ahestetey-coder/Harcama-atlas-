import type { Lang } from '../lib/i18n'
import { tt, ttf } from '../lib/i18n'
import type { PlannedNotification } from './notifications'

/**
 * Gündem: YouTube kanallarından günde iki kez üretilen piyasa notları ve finans yazıları.
 * Yazılar zamanlanmış görevle public/gundem/ altına yazılır ve yayındaki siteden okunur;
 * publish_at gelmeden yazı listede görünmez (birden fazla yazı 30 dk arayla yayına girer).
 */
export type ArticleCategory = 'piyasa-notu' | 'finans-haberleri' | 'finans-egitimi' | 'kisisel-finans' | 'kripto'

export const ARTICLE_CATEGORIES: ArticleCategory[] = ['piyasa-notu', 'finans-haberleri', 'finans-egitimi', 'kisisel-finans', 'kripto']

export const CATEGORY_LABEL: Record<ArticleCategory, string> = {
  'piyasa-notu': tt('Piyasa notları'),
  'finans-haberleri': tt('Finans haberleri'),
  'finans-egitimi': tt('Finans eğitimi'),
  'kisisel-finans': tt('Kişisel finans'),
  kripto: tt('Kripto'),
}

type Pair = Record<Lang, string>

export interface ArticleMeta {
  slug: string
  videoId: string
  channel: string
  category: ArticleCategory
  publishAt: string
  title: Pair
  summary: Pair
  cover?: string
  coverAlt?: Pair
}

export interface ArticleBody {
  slug: string
  body: Pair
}

export interface ArticleIndex {
  articles: ArticleMeta[]
}

/** Yayına girmiş yazılar, en yeniden eskiye. */
export function visibleArticles(list: ArticleMeta[], now: Date, category?: ArticleCategory | null): ArticleMeta[] {
  const t = now.getTime()
  return list
    .filter((a) => Date.parse(a.publishAt) <= t && (!category || a.category === category))
    .sort((a, b) => Date.parse(b.publishAt) - Date.parse(a.publishAt))
}

/**
 * Koçun yazı bildirimleri: ileride yayına girecekler o saate kurulur; son açılıştan beri yayına
 * girmiş olanlar (en fazla 12 saat geriye) hemen gösterilir. `seenAt` ilk kez null ise geçmiş bildirilmez.
 */
export function articleNotifications(list: ArticleMeta[], lang: Lang, now: Date, seenAt: number | null): PlannedNotification[] {
  const t = now.getTime()
  const from = seenAt == null ? t : Math.max(seenAt, t - 12 * 3600_000)
  const out: PlannedNotification[] = []
  for (const a of list) {
    const at = Date.parse(a.publishAt)
    if (Number.isNaN(at) || at <= from || at > t + 48 * 3600_000) continue
    out.push({
      key: `gundem:${a.slug}`,
      kind: 'gundem',
      at: new Date(Math.max(at, t + 2000)),
      title: ttf('Koç: Yeni {0}', categoryNoun(a.category)),
      body: a.title[lang] || a.title.tr,
      route: `/gundem/${a.slug}`,
    })
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime())
}

function categoryNoun(c: ArticleCategory): string {
  return c === 'piyasa-notu' ? tt('piyasa notu') : c === 'finans-haberleri' ? tt('finans haberi') : tt('yazı')
}

/* ---------- Basit Markdown: başlık, paragraf, madde, tablo, görsel, kalın ---------- */

export type Inline = { text: string; bold?: boolean }
export type Block =
  | { type: 'h'; text: string }
  | { type: 'p'; parts: Inline[] }
  | { type: 'ul'; items: Inline[][] }
  | { type: 'table'; head: string[]; rows: string[][] }
  | { type: 'img'; src: string; alt: string }

export function parseInline(s: string): Inline[] {
  const out: Inline[] = []
  const re = /\*\*(.+?)\*\*/g
  let last = 0
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) })
    out.push({ text: m[1], bold: true })
    last = m.index + m[0].length
  }
  if (last < s.length) out.push({ text: s.slice(last) })
  return out.map((p) => ({ ...p, text: p.text.replace(/\*/g, '') }))
}

const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())

/** Yalnızca https görsellere izin verilir. */
function safeSrc(src: string): string | null {
  return /^https:\/\//.test(src) ? src : null
}

export function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r/g, '').split('\n')
  const out: Block[] = []
  let para: string[] = []
  const flush = () => {
    if (para.length) out.push({ type: 'p', parts: parseInline(para.join(' ')) })
    para = []
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line || line.startsWith('<!--')) {
      flush()
      continue
    }
    const h = /^#{1,4}\s+(.*)$/.exec(line)
    if (h) {
      flush()
      out.push({ type: 'h', text: h[1].replace(/\*/g, '') })
      continue
    }
    if (line.startsWith('![')) {
      // Yalnızca https görseller; bozuk ya da güvensiz görsel satırı atlanır
      flush()
      const img = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(line)
      const src = img && safeSrc(img[2])
      if (img && src) out.push({ type: 'img', src, alt: img[1] })
      continue
    }
    if (/^[-*]\s+/.test(line)) {
      flush()
      const items: Inline[][] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) items.push(parseInline(lines[i++].trim().replace(/^[-*]\s+/, '')))
      i--
      out.push({ type: 'ul', items })
      continue
    }
    if (line.startsWith('|') && i + 1 < lines.length && /^\|?\s*:?-{2,}/.test(lines[i + 1].trim())) {
      flush()
      const head = cells(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]).map((c) => c.replace(/\*/g, '')))
      i--
      out.push({ type: 'table', head, rows })
      continue
    }
    para.push(line)
  }
  flush()
  return out
}
