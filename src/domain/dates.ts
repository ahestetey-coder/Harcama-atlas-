import type { IsoDate, MonthKey } from './types'

/**
 * Tarihler takvim günü ('YYYY-AA-GG') olarak saklanır. Date nesnesine yalnızca
 * görüntüleme veya gün sayma için UTC öğlen saatiyle çevrilir; saat dilimi kayması olmaz.
 */

export const MONTH_NAMES = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
export const MONTH_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
const WEEKDAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']

const pad = (n: number, w = 2) => String(n).padStart(w, '0')

export function isValidYmd(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1) return false
  return d <= daysInMonth(y, m)
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function toIsoDate(y: number, m: number, d: number): IsoDate {
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`
}

export function isIsoDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  return !!m && isValidYmd(+m[1], +m[2], +m[3])
}

/** Cihazın yerel takvimine göre bugün. */
export function todayIso(now: Date = new Date()): IsoDate {
  return toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

export function monthOf(date: IsoDate): MonthKey {
  return date.slice(0, 7)
}

export function currentMonth(now: Date = new Date()): MonthKey {
  return monthOf(todayIso(now))
}

export function parseMonthKey(key: MonthKey): { year: number; month: number } {
  const [y, m] = key.split('-').map(Number)
  return { year: y, month: m }
}

export function addMonths(key: MonthKey, delta: number): MonthKey {
  const { year, month } = parseMonthKey(key)
  const idx = year * 12 + (month - 1) + delta
  return `${pad(Math.floor(idx / 12), 4)}-${pad((idx % 12) + 1)}`
}

export function monthLabel(key: MonthKey): string {
  const { year, month } = parseMonthKey(key)
  return `${MONTH_NAMES[month - 1]} ${year}`
}

export function monthRange(key: MonthKey): { start: IsoDate; end: IsoDate } {
  const { year, month } = parseMonthKey(key)
  return { start: toIsoDate(year, month, 1), end: toIsoDate(year, month, daysInMonth(year, month)) }
}

export function dayOf(date: IsoDate): number {
  return Number(date.slice(8, 10))
}

export function formatDate(date: IsoDate, style: 'short' | 'long' | 'weekday' = 'short'): string {
  if (!isIsoDate(date)) return date
  const [y, m, d] = date.split('-').map(Number)
  if (style === 'short') return `${pad(d)}.${pad(m)}.${y}`
  if (style === 'long') return `${d} ${MONTH_NAMES[m - 1]} ${y}`
  const wd = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()
  return `${d} ${MONTH_NAMES[m - 1]}, ${WEEKDAYS[wd]}`
}

export function addDays(date: IsoDate, delta: number): IsoDate {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + delta, 12))
  return toIsoDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
}

export function diffDays(a: IsoDate, b: IsoDate): number {
  const [y1, m1, d1] = a.split('-').map(Number)
  const [y2, m2, d2] = b.split('-').map(Number)
  return Math.round((Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2)) / 86_400_000)
}

export type DateOrder = 'dmy' | 'mdy' | 'auto'

export type DateParseResult =
  | { ok: true; date: IsoDate; yearGuessed?: boolean; note?: string }
  | { ok: false; reason: 'empty' | 'invalid' | 'ambiguous'; message: string }

const MONTH_LOOKUP: Record<string, number> = {}
MONTH_NAMES.forEach((n, i) => {
  MONTH_LOOKUP[foldMonth(n)] = i + 1
})
MONTH_SHORT.forEach((n, i) => {
  MONTH_LOOKUP[foldMonth(n)] = i + 1
})
Object.assign(MONTH_LOOKUP, { eyl: 9, agu: 8, agus: 8, sub: 2, haz: 6, tem: 7, kas: 11, ara: 12, nis: 4, mar: 3, may: 5, oca: 1, eki: 10 })

function foldMonth(s: string): string {
  return s
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/\.$/, '')
}

function expandYear(y: number): number {
  if (y >= 100) return y
  return y + 2000
}

/**
 * Türkçe tarih metnini takvim gününe çevirir.
 * Desteklenen: 15.09.2026, 15/09/2026, 15-09-2026, 15.09.26, 2026-09-15, 15 Eylül 2026, 15 EYL 2026, 15.09 (yıl `fallbackYear`).
 * Varsayılan sıra gün-ay-yıl'dır (Türkiye). `order: 'mdy'` ABD biçimi için.
 */
export function parseDate(input: unknown, opts: { order?: DateOrder; fallbackYear?: number } = {}): DateParseResult {
  if (input === null || input === undefined || input === '') return { ok: false, reason: 'empty', message: 'Tarih boş.' }
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return { ok: false, reason: 'invalid', message: 'Geçersiz tarih.' }
    // Excel tarihleri UTC gece yarısı olarak gelir; UTC bileşenleri takvim gününü verir.
    return { ok: true, date: toIsoDate(input.getUTCFullYear(), input.getUTCMonth() + 1, input.getUTCDate()) }
  }
  const s = String(input).trim().replace(/\s+/g, ' ')
  if (!s) return { ok: false, reason: 'empty', message: 'Tarih boş.' }
  const order = opts.order ?? 'dmy'

  let m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[ T].*)?$/.exec(s)
  if (m) {
    const [y, mo, d] = [+m[1], +m[2], +m[3]]
    return isValidYmd(y, mo, d) ? { ok: true, date: toIsoDate(y, mo, d) } : invalid(s)
  }
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/.exec(s)
  if (m) {
    const a = +m[1]
    const b = +m[2]
    const y = expandYear(+m[3])
    let d = a
    let mo = b
    if (order === 'mdy') {
      d = b
      mo = a
    }
    if (!isValidYmd(y, mo, d)) return invalid(s)
    return { ok: true, date: toIsoDate(y, mo, d) }
  }
  m = /^(\d{1,2})[./](\d{1,2})\.?$/.exec(s)
  if (m && opts.fallbackYear) {
    const d = order === 'mdy' ? +m[2] : +m[1]
    const mo = order === 'mdy' ? +m[1] : +m[2]
    if (!isValidYmd(opts.fallbackYear, mo, d)) return invalid(s)
    return { ok: true, date: toIsoDate(opts.fallbackYear, mo, d), yearGuessed: true, note: 'Yıl belgede yoktu; ekstre döneminden alındı.' }
  }
  m = /^(\d{1,2})[\s.-]+([A-Za-zÇĞİÖŞÜçğıöşü]+)\.?[\s.-]+(\d{2}|\d{4})$/.exec(s)
  if (m) {
    const mo = MONTH_LOOKUP[foldMonth(m[2])] ?? MONTH_LOOKUP[foldMonth(m[2]).slice(0, 3)]
    const y = expandYear(+m[3])
    if (!mo || !isValidYmd(y, mo, +m[1])) return invalid(s)
    return { ok: true, date: toIsoDate(y, mo, +m[1]) }
  }
  return invalid(s)
}

function invalid(s: string): DateParseResult {
  return { ok: false, reason: 'invalid', message: `"${s}" tarih olarak okunamadı.` }
}

/** Sütundaki örneklerden gün/ay sırasını çıkarır; kanıt yoksa gün-ay-yıl (Türkiye) varsayılır. */
export function inferDateOrder(samples: string[]): { order: 'dmy' | 'mdy'; evidence: boolean } {
  let dmy = false
  let mdy = false
  for (const s of samples) {
    const m = /^(\d{1,2})[./-](\d{1,2})[./-]\d{2,4}/.exec(String(s).trim())
    if (!m) continue
    if (+m[1] > 12) dmy = true
    if (+m[2] > 12) mdy = true
  }
  if (mdy && !dmy) return { order: 'mdy', evidence: true }
  return { order: 'dmy', evidence: dmy }
}

/** Tarih benzeri token: satır başında işlem tarihi aramak için. */
export const DATE_TOKEN_RE =
  /^(\d{1,2}[./-]\d{1,2}[./-](?:\d{4}|\d{2})|\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık|Oca|Şub|Mar|Nis|May|Haz|Tem|Ağu|Eyl|Eki|Kas|Ara|OCAK|ŞUBAT|MART|NİSAN|MAYIS|HAZİRAN|TEMMUZ|AĞUSTOS|EYLÜL|EKİM|KASIM|ARALIK|OCA|ŞUB|MAR|NİS|MAY|HAZ|TEM|AĞU|EYL|EKİ|KAS|ARA)\.?\s+\d{2,4})/
