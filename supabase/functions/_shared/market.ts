// Varlıklarım için piyasa fiyatı okuyucuları: saf ayrıştırma kuralları. Deno'ya ya da tarayıcıya bağlı değil;
// sunucu fonksiyonu ve birim testleri aynı kodu kullanır.

export type QuoteMarket = 'bist' | 'us' | 'tefas' | 'crypto' | 'gold' | 'commodity'

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

export const MARKETS: QuoteMarket[] = ['bist', 'us', 'tefas', 'crypto', 'gold', 'commodity']
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

/**
 * Emtialar: Yahoo vadeli işlem sembolü ve fiyatı uygulamadaki birime çeviren çarpan
 * (değerli metaller ons → gram, bakır libre → kg; petrol varil, doğal gaz MMBtu olduğu gibi).
 */
export const COMMODITY_FUTURES: Record<string, { yahoo: string; perUnit: number }> = {
  XAG: { yahoo: 'SI=F', perUnit: 1 / TROY_OUNCE_GRAMS },
  XPT: { yahoo: 'PL=F', perUnit: 1 / TROY_OUNCE_GRAMS },
  XPD: { yahoo: 'PA=F', perUnit: 1 / TROY_OUNCE_GRAMS },
  BRENT: { yahoo: 'BZ=F', perUnit: 1 },
  WTI: { yahoo: 'CL=F', perUnit: 1 },
  COPPER: { yahoo: 'HG=F', perUnit: 2.20462262 },
  NATGAS: { yahoo: 'NG=F', perUnit: 1 },
}

/** Yahoo Finance sembolü: Borsa İstanbul için .IS eki, altın ve emtialar için vadeli işlem sembolü. */
export function yahooSymbol(q: QuoteRequest): string | null {
  if (q.market === 'bist') return `${q.symbol}.IS`
  if (q.market === 'gold') return 'GC=F'
  if (q.market === 'commodity') return COMMODITY_FUTURES[q.symbol]?.yahoo ?? null
  return q.symbol
}

/** Yahoo Finance chart yanıtı → son fiyat. */
export function parseYahooChart(json: unknown): RawQuote | null {
  const meta = (json as { chart?: { result?: { meta?: Record<string, unknown> }[] } })?.chart?.result?.[0]?.meta
  if (!meta) return null
  const price = Number(meta.regularMarketPrice)
  const time = Number(meta.regularMarketTime)
  const raw = typeof meta.currency === 'string' ? meta.currency : ''
  if (!Number.isFinite(price) || price <= 0 || !raw || !Number.isFinite(time)) return null
  // Londra (GBp) ve Johannesburg (ZAc) fiyatları alt birimle gelir
  const minor = raw === 'GBp' || raw === 'ZAc' || raw === 'ILA'
  const currency = raw === 'ILA' ? 'ILS' : raw.toUpperCase()
  const name = typeof meta.longName === 'string' ? meta.longName : typeof meta.shortName === 'string' ? meta.shortName : null
  return { price: minor ? price / 100 : price, currency, date: istanbulDate(time * 1000), name, provider: 'Yahoo Finance' }
}

/** Binance ticker yanıtı ({symbol, price}) → USD fiyat (USDT paritesi). */
export function parseBinanceTicker(json: unknown, now: number): RawQuote | null {
  const price = Number((json as { price?: unknown })?.price)
  if (!Number.isFinite(price) || price <= 0) return null
  return { price, currency: 'USD', date: istanbulDate(now), name: null, provider: 'Binance' }
}

export interface TefasFund {
  code: string
  name: string
  price: number
  /** YYYY-AA-GG */
  date: string
}

/** TEFAS fon tipleri: yatırım, emeklilik, borsa yatırım fonu. */
export const TEFAS_KINDS = ['YAT', 'EMK', 'BYF'] as const

const ymd = (iso: string) => iso.replaceAll('-', '')

/** TEFAS fonGnlBlgSiraliGetir isteği: fon kodu verilmezse o tipteki bütün fonlar gelir. */
export function tefasBody(kind: string, fromIso: string, toIso: string, code: string | null = null): Record<string, unknown> {
  return {
    fonTipi: kind,
    fonKodu: code,
    aramaMetni: null,
    fonTurKod: null,
    fonGrubu: null,
    sfonTurKod: null,
    fonTurAciklama: null,
    kurucuKod: null,
    basTarih: ymd(fromIso),
    bitTarih: ymd(toIso),
    basSira: 1,
    bitSira: 100000,
    dil: 'TR',
    sFonTurKod: '',
    fonKod: '',
    fonGrup: '',
    fonUnvanTip: '',
  }
}

/**
 * TEFAS yanıtı → her fonun en son günkü fiyatı. Veri yoksa (tatil) TEFAS "out of bounds" mesajı döner;
 * bu boş liste sayılır. Başka hata mesajında null döner.
 */
export function parseTefasList(json: unknown): TefasFund[] | null {
  const j = json as { errorMessage?: unknown; resultList?: unknown }
  if (!j || typeof j !== 'object') return null
  if (typeof j.errorMessage === 'string' && j.errorMessage) return /out of bounds|bulunamad/i.test(j.errorMessage) ? [] : null
  if (!Array.isArray(j.resultList)) return []
  const best = new Map<string, TefasFund>()
  for (const r of j.resultList as Record<string, unknown>[]) {
    const code = typeof r.fonKodu === 'string' ? r.fonKodu.trim().toUpperCase() : ''
    const date = typeof r.tarih === 'string' ? r.tarih.slice(0, 10) : ''
    const price = Number(r.fiyat)
    if (!code || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(price) || price <= 0) continue
    const prev = best.get(code)
    if (!prev || date > prev.date) best.set(code, { code, name: typeof r.fonUnvan === 'string' ? r.fonUnvan.trim() : code, price, date })
  }
  return [...best.values()]
}

export function tefasQuote(f: TefasFund): RawQuote {
  return { price: f.price, currency: 'TRY', date: f.date, name: f.name, provider: 'TEFAS' }
}

// ---------- Sembol ve ad araması ----------

export interface Suggestion {
  symbol: string
  name: string
  /** Borsa ya da kaynak (ör. NASDAQ, BIST, TEFAS). */
  exchange: string | null
}

/** Türkçe büyük harf ve aksan sadeleştirmesi (arama karşılaştırması için). */
export function fold(s: string): string {
  return s
    .toLocaleUpperCase('tr')
    .replace(/İ/g, 'I')
    .replace(/Ş/g, 'S')
    .replace(/Ğ/g, 'G')
    .replace(/Ü/g, 'U')
    .replace(/Ö/g, 'O')
    .replace(/Ç/g, 'C')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Fon listesinde arama: kodun başı eşleşenler önce, sonra adında geçenler. */
export function searchFunds(funds: TefasFund[], q: string, limit = 8): Suggestion[] {
  const f = fold(q)
  if (!f) return []
  const code = funds.filter((x) => x.code.startsWith(f))
  const name = funds.filter((x) => !x.code.startsWith(f) && f.split(' ').every((w) => fold(x.name).includes(w)))
  return [...code.sort((a, b) => a.code.localeCompare(b.code)), ...name]
    .slice(0, limit)
    .map((x) => ({ symbol: x.code, name: x.name, exchange: 'TEFAS' }))
}

/** Yahoo Finance arama yanıtı → BIST ya da yabancı borsa önerileri (hisse ve ETF). */
export function parseYahooSearch(json: unknown, market: 'bist' | 'us', limit = 8): Suggestion[] {
  const quotes = (json as { quotes?: unknown })?.quotes
  if (!Array.isArray(quotes)) return []
  const out: Suggestion[] = []
  for (const q of quotes as Record<string, unknown>[]) {
    const sym = typeof q.symbol === 'string' ? q.symbol : ''
    const type = typeof q.quoteType === 'string' ? q.quoteType : ''
    if (!sym || !['EQUITY', 'ETF', 'MUTUALFUND'].includes(type)) continue
    const isBist = sym.endsWith('.IS')
    if ((market === 'bist') !== isBist) continue
    const symbol = market === 'bist' ? sym.slice(0, -3) : sym
    if (!/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(symbol)) continue
    const name = typeof q.longname === 'string' ? q.longname : typeof q.shortname === 'string' ? q.shortname : symbol
    const exchange = typeof q.exchDisp === 'string' ? q.exchDisp : typeof q.exchange === 'string' ? q.exchange : null
    out.push({ symbol, name, exchange: market === 'bist' ? 'BIST' : exchange })
    if (out.length >= limit) break
  }
  return out
}

/** CoinGecko arama yanıtı → kripto önerileri; yalnızca Binance'te USDT paritesi olanlar. */
export function parseCoinSearch(json: unknown, usdtBases: Set<string>, limit = 8): Suggestion[] {
  const coins = (json as { coins?: unknown })?.coins
  if (!Array.isArray(coins)) return []
  const out: Suggestion[] = []
  const seen = new Set<string>()
  for (const c of coins as Record<string, unknown>[]) {
    const symbol = typeof c.symbol === 'string' ? c.symbol.toUpperCase() : ''
    if (!symbol || seen.has(symbol) || !usdtBases.has(symbol)) continue
    seen.add(symbol)
    out.push({ symbol, name: typeof c.name === 'string' ? c.name : symbol, exchange: 'Binance' })
    if (out.length >= limit) break
  }
  return out
}

/** Binance tüm fiyatlar yanıtı → USDT paritesi olan varlıklar ve USD fiyatları. */
export function parseBinanceAll(json: unknown): Map<string, number> {
  const out = new Map<string, number>()
  if (!Array.isArray(json)) return out
  for (const t of json as { symbol?: unknown; price?: unknown }[]) {
    if (typeof t.symbol !== 'string' || !t.symbol.endsWith('USDT')) continue
    const p = Number(t.price)
    if (Number.isFinite(p) && p > 0) out.set(t.symbol.slice(0, -4), p)
  }
  return out
}

/**
 * Fiyatı TL'ye çevirir. Altında ons fiyatı grama bölünür. Kuru bilinmeyen para biriminde null döner.
 * rates: 1 birimin TL karşılığı (TCMB).
 */
export function toTl(q: RawQuote, market: QuoteMarket, rates: Map<string, number>, symbol?: string): number | null {
  const fx = q.currency === 'TRY' ? 1 : rates.get(q.currency)
  if (!fx) return null
  const tl = q.price * fx
  if (market === 'gold') return tl / TROY_OUNCE_GRAMS
  if (market === 'commodity') {
    const c = symbol ? COMMODITY_FUTURES[symbol] : undefined
    return c ? tl * c.perUnit : null
  }
  return tl
}
