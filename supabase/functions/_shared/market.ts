// Varlıklarım için piyasa fiyatı okuyucuları: saf ayrıştırma kuralları. Deno'ya ya da tarayıcıya bağlı değil;
// sunucu fonksiyonu ve birim testleri aynı kodu kullanır.

export type QuoteMarket = 'bist' | 'us' | 'tefas' | 'crypto' | 'gold'

export interface QuoteRequest {
  market: QuoteMarket
  symbol: string
}

export interface RawQuote {
  price: number
  currency: string
  /** Fiyatın ait olduğu gün (İstanbul saatine göre YYYY-AA-GG). */
  date: string
  name: string | null
  provider: 'Yahoo Finance' | 'Binance' | 'TEFAS'
}

export const MARKETS: QuoteMarket[] = ['bist', 'us', 'tefas', 'crypto', 'gold']
export const MAX_QUOTES = 40
/** Bir troy ons altının gram karşılığı. */
export const TROY_OUNCE_GRAMS = 31.1034768

/** İstek gövdesindeki sembolleri doğrular, tekrarları atar. Geçersiz olanlar sessizce düşer. */
export function parseQuoteRequests(body: unknown): QuoteRequest[] {
  const list = (body as { quotes?: unknown })?.quotes
  if (!Array.isArray(list)) return []
  const seen = new Set<string>()
  const out: QuoteRequest[] = []
  for (const q of list) {
    const market = (q as { market?: unknown })?.market
    const raw = (q as { symbol?: unknown })?.symbol
    if (typeof market !== 'string' || !MARKETS.includes(market as QuoteMarket) || typeof raw !== 'string') continue
    const symbol = raw.trim().toUpperCase().replace(/\.IS$/, '')
    if (!/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(symbol)) continue
    const key = `${market}:${symbol}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ market: market as QuoteMarket, symbol })
    if (out.length >= MAX_QUOTES) break
  }
  return out
}

export function istanbulDate(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date(ms))
}

/** Yahoo Finance sembolü: Borsa İstanbul için .IS eki, altın için ons vadeli (GC=F). */
export function yahooSymbol(q: QuoteRequest): string {
  if (q.market === 'bist') return `${q.symbol}.IS`
  if (q.market === 'gold') return 'GC=F'
  return q.symbol
}

/** Yahoo Finance chart yanıtı → son fiyat. */
export function parseYahooChart(json: unknown): RawQuote | null {
  const meta = (json as { chart?: { result?: { meta?: Record<string, unknown> }[] } })?.chart?.result?.[0]?.meta
  if (!meta) return null
  const price = Number(meta.regularMarketPrice)
  const time = Number(meta.regularMarketTime)
  const currency = typeof meta.currency === 'string' ? meta.currency.toUpperCase() : ''
  if (!Number.isFinite(price) || price <= 0 || !currency || !Number.isFinite(time)) return null
  const name = typeof meta.longName === 'string' ? meta.longName : typeof meta.shortName === 'string' ? meta.shortName : null
  return { price, currency, date: istanbulDate(time * 1000), name, provider: 'Yahoo Finance' }
}

/** Binance ticker yanıtı ({symbol, price}) → USD fiyat (USDT paritesi). */
export function parseBinanceTicker(json: unknown, now: number): RawQuote | null {
  const price = Number((json as { price?: unknown })?.price)
  if (!Number.isFinite(price) || price <= 0) return null
  return { price, currency: 'USD', date: istanbulDate(now), name: null, provider: 'Binance' }
}

/** TEFAS tarihsel veri yanıtı → en son günün fiyatı. */
export function parseTefasHistory(json: unknown): RawQuote | null {
  const rows = (json as { data?: unknown })?.data
  if (!Array.isArray(rows) || rows.length === 0) return null
  let best: { t: number; price: number; name: string | null } | null = null
  for (const r of rows as Record<string, unknown>[]) {
    const t = Number(r.TARIH)
    const price = Number(r.FIYAT)
    if (!Number.isFinite(t) || !Number.isFinite(price) || price <= 0) continue
    if (!best || t > best.t) best = { t, price, name: typeof r.FONUNVAN === 'string' ? r.FONUNVAN : null }
  }
  return best ? { price: best.price, currency: 'TRY', date: istanbulDate(best.t), name: best.name, provider: 'TEFAS' } : null
}

export function tefasDate(ms: number): string {
  const [y, m, d] = istanbulDate(ms).split('-')
  return `${d}.${m}.${y}`
}

/**
 * Fiyatı TL'ye çevirir. Altında ons fiyatı grama bölünür. Kuru bilinmeyen para biriminde null döner.
 * rates: 1 birimin TL karşılığı (TCMB).
 */
export function toTl(q: RawQuote, market: QuoteMarket, rates: Map<string, number>): number | null {
  const fx = q.currency === 'TRY' ? 1 : rates.get(q.currency)
  if (!fx) return null
  const tl = q.price * fx
  return market === 'gold' ? tl / TROY_OUNCE_GRAMS : tl
}
