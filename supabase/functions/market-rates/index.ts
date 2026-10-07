// Varlıklarım için güncel fiyatlar ve sembol araması: TCMB gösterge kurları; istenirse Borsa İstanbul ve yabancı
// borsa hisse/ETF'leri, TEFAS fonları, kripto ve gram altın. Tarayıcı bu kaynaklara doğrudan erişemediği (CORS)
// için burada okunur. İstek yalnızca sembol ya da arama metni taşır; miktar, tutar ya da maliyet gönderilmez,
// semboller ve aramalar günlüğe yazılmaz.
import { cors, json } from '../_shared/openai.ts'
import { parseTcmbRates } from '../_shared/research.ts'
import { serviceClient, userId } from '../_shared/server.ts'
import {
  istanbulDate,
  parseBinanceAll,
  parseCoinSearch,
  parseQuoteRequests,
  parseTefasList,
  parseYahooChart,
  parseYahooSearch,
  searchFunds,
  TEFAS_KINDS,
  tefasBody,
  tefasQuote,
  toTl,
  yahooSymbol,
  type QuoteMarket,
  type QuoteRequest,
  type RawQuote,
  type Suggestion,
  type TefasFund,
} from '../_shared/market.ts'

const TCMB_URL = 'https://www.tcmb.gov.tr/kurlar/today.xml'
const TEFAS_URL = 'https://www.tefas.gov.tr/api/funds/fonGnlBlgSiraliGetir'
const RATES_TTL_MS = 30 * 60 * 1000
const QUOTE_TTL_MS = 10 * 60 * 1000
const BINANCE_TTL_MS = 5 * 60 * 1000
const TEFAS_TTL_MS = 2 * 60 * 60 * 1000
const SEARCH_TTL_MS = 60 * 60 * 1000
const DAY = 86400000
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36'

type Rates = { date: string; source: 'tcmb'; rates: { code: string; name: string; valueTl: number }[] }
let ratesCache: { at: number; body: Rates } | null = null
const quoteCache = new Map<string, { at: number; q: RawQuote }>()
const searchCache = new Map<string, { at: number; list: Suggestion[] }>()

async function getRates(): Promise<Rates | null> {
  if (ratesCache && Date.now() - ratesCache.at < RATES_TTL_MS) return ratesCache.body
  try {
    const res = await fetch(TCMB_URL, { headers: { Accept: 'application/xml' }, signal: AbortSignal.timeout(10000) })
    if (!res.ok) throw new Error(`TCMB ${res.status}`)
    const parsed = parseTcmbRates(await res.text())
    if (!parsed) throw new Error('TCMB yanıtı okunamadı')
    const body: Rates = { date: parsed.date, source: 'tcmb', rates: parsed.rates.map((r) => ({ code: r.code, name: r.name, valueTl: r.value })) }
    ratesCache = { at: Date.now(), body }
    return body
  } catch (e) {
    console.error('market-rates tcmb', e instanceof Error ? e.message : 'hata')
    return ratesCache?.body ?? null
  }
}

async function getJson(url: string, init?: RequestInit): Promise<unknown> {
  try {
    const res = await fetch(url, { ...init, headers: { 'User-Agent': UA, Accept: 'application/json', ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(15000) })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// ---------- Binance: bütün USDT paritelerinin fiyatı tek istekte ----------
let binanceCache: { at: number; prices: Map<string, number> } | null = null
async function getBinance(): Promise<Map<string, number> | null> {
  if (binanceCache && Date.now() - binanceCache.at < BINANCE_TTL_MS) return binanceCache.prices
  const prices = parseBinanceAll(await getJson('https://api.binance.com/api/v3/ticker/price'))
  if (prices.size) binanceCache = { at: Date.now(), prices }
  return binanceCache?.prices ?? null
}

// ---------- TEFAS: yatırım, emeklilik ve borsa yatırım fonlarının son fiyatları tek seferde ----------
// TEFAS dakikada birkaç istekle sınırlı; bu yüzden fon başına değil, fon tipi başına bir istek atılır.
let fundsCache: { at: number; funds: Map<string, TefasFund> } | null = null
let fundsLoading: Promise<Map<string, TefasFund> | null> | null = null
async function getFunds(): Promise<Map<string, TefasFund> | null> {
  if (fundsCache && Date.now() - fundsCache.at < TEFAS_TTL_MS) return fundsCache.funds
  if (fundsLoading) return fundsLoading
  fundsLoading = (async () => {
    const now = Date.now()
    const funds = new Map<string, TefasFund>()
    let failed = false
    for (const kind of TEFAS_KINDS) {
      const body = await getJson(TEFAS_URL, {
        method: 'POST',
        body: JSON.stringify(tefasBody(kind, istanbulDate(now - 6 * DAY), istanbulDate(now))),
        headers: { 'Content-Type': 'application/json', Accept: '*/*', Origin: 'https://www.tefas.gov.tr', Referer: 'https://www.tefas.gov.tr/tr/fon-verileri' },
      })
      const list = parseTefasList(body)
      if (!list) {
        failed = true
        continue
      }
      for (const f of list) if (!funds.has(f.code)) funds.set(f.code, f)
    }
    if (funds.size && !failed) fundsCache = { at: now, funds }
    else if (funds.size) fundsCache = { at: now - TEFAS_TTL_MS + 10 * 60 * 1000, funds: new Map([...(fundsCache?.funds ?? []), ...funds]) }
    return fundsCache?.funds ?? null
  })().finally(() => {
    fundsLoading = null
  })
  return fundsLoading
}

async function fetchQuote(q: QuoteRequest): Promise<RawQuote | null> {
  if (q.market === 'crypto') {
    const usd = (await getBinance())?.get(q.symbol)
    return usd ? { price: usd, currency: 'USD', date: istanbulDate(Date.now()), name: null, provider: 'Binance' } : null
  }
  if (q.market === 'tefas') {
    const f = (await getFunds())?.get(q.symbol)
    return f ? tefasQuote(f) : null
  }
  return parseYahooChart(await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol(q))}?range=1d&interval=1d`))
}

/** Ortak önbellek tablosu (ha_price_cache) kuruluysa oradan okur; yoksa yalnızca bellek önbelleği kullanılır. */
async function cachedQuotes(keys: string[]): Promise<Map<string, { at: number; q: RawQuote }>> {
  const out = new Map<string, { at: number; q: RawQuote }>()
  try {
    const { data, error } = await serviceClient().from('ha_price_cache').select('key, price, currency, name, as_of, provider, fetched_at').in('key', keys)
    if (error) return out
    for (const r of data ?? []) out.set(r.key, { at: Date.parse(r.fetched_at), q: { price: Number(r.price), currency: r.currency, date: r.as_of, name: r.name, provider: r.provider } })
  } catch {
    /* tablo yok */
  }
  return out
}

async function storeQuotes(rows: { key: string; q: RawQuote }[]): Promise<void> {
  if (!rows.length) return
  try {
    await serviceClient()
      .from('ha_price_cache')
      .upsert(rows.map(({ key, q }) => ({ key, price: q.price, currency: q.currency, name: q.name, as_of: q.date, provider: q.provider, fetched_at: new Date().toISOString() })))
  } catch {
    /* tablo yok */
  }
}

async function search(market: QuoteMarket, q: string): Promise<Suggestion[]> {
  const key = `${market}:${q.toLocaleLowerCase('tr')}`
  const hit = searchCache.get(key)
  if (hit && Date.now() - hit.at < SEARCH_TTL_MS) return hit.list
  let list: Suggestion[] = []
  if (market === 'tefas') list = searchFunds([...((await getFunds())?.values() ?? [])], q)
  else if (market === 'crypto') {
    const bases = await getBinance()
    if (bases) {
      list = parseCoinSearch(await getJson(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`), new Set(bases.keys()))
      const sym = q.trim().toUpperCase()
      if (bases.has(sym) && !list.some((s) => s.symbol === sym)) list.unshift({ symbol: sym, name: sym, exchange: 'Binance' })
    }
  } else if (market === 'bist' || market === 'us') {
    const url = (s: string) => `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(s)}&quotesCount=20&newsCount=0&listsCount=0&lang=tr-TR&region=TR`
    list = parseYahooSearch(await getJson(url(q)), market)
    if (market === 'bist' && list.length === 0 && /^[A-Za-z0-9]{2,8}$/.test(q.trim())) list = parseYahooSearch(await getJson(url(`${q.trim()}.IS`)), market)
  }
  searchCache.set(key, { at: Date.now(), list })
  if (searchCache.size > 2000) searchCache.clear()
  return list
}

// Sağlık denetimi: sabit örnek sembollerle bütün kaynakları dener (girişsiz; kullanıcı sembolü kabul etmez)
const CHECK_SYMBOLS: QuoteRequest[] = [
  { market: 'bist', symbol: 'THYAO' },
  { market: 'us', symbol: 'AAPL' },
  { market: 'us', symbol: 'SPY' },
  { market: 'crypto', symbol: 'BTC' },
  { market: 'gold', symbol: 'XAU' },
  { market: 'tefas', symbol: 'TTE' },
]

const ERROR_TEXT: Record<QuoteMarket, string> = {
  bist: "Borsa İstanbul'da bu sembol bulunamadı",
  us: 'Yabancı borsalarda bu sembol bulunamadı',
  tefas: 'TEFAS fiyatı alınamadı; fon kodunu kontrol edin',
  crypto: 'Bu kripto için USDT paritesi bulunamadı',
  gold: 'Altın fiyatı alınamadı',
}

const MARKETS: QuoteMarket[] = ['bist', 'us', 'tefas', 'crypto', 'gold']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const body: unknown = req.method === 'POST' ? await req.json().catch(() => null) : null

  const s = (body as { search?: { market?: unknown; q?: unknown } })?.search
  if (s) {
    const market = s.market as QuoteMarket
    const q = typeof s.q === 'string' ? s.q.trim().slice(0, 40) : ''
    if (!MARKETS.includes(market) || q.length < 1) return json({ suggestions: [] })
    if (!(await userId(req))) return json({ error: 'Arama için giriş yapın.' }, 401)
    return json({ suggestions: await search(market, q) })
  }

  const check = (body as { check?: unknown })?.check === true
  const wanted = check ? CHECK_SYMBOLS : parseQuoteRequests(body)
  const rates = await getRates()
  if (!wanted.length) return rates ? json(rates) : json({ error: 'TCMB kurları şu an alınamadı. Biraz sonra tekrar deneyin.' }, 502)
  if (!check && !(await userId(req))) return json({ error: 'Güncel fiyatlar için giriş yapın.' }, 401)

  const rateMap = new Map((rates?.rates ?? []).map((r) => [r.code, r.valueTl]))
  const now = Date.now()
  const keys = wanted.map((q) => `${q.market}:${q.symbol}`)
  const shared = await cachedQuotes(keys)
  const fresh: { key: string; q: RawQuote }[] = []
  const quotes = await Promise.all(
    wanted.map(async (w, i) => {
      const key = keys[i]
      const ttl = w.market === 'tefas' ? TEFAS_TTL_MS : QUOTE_TTL_MS
      let hit = quoteCache.get(key) ?? shared.get(key)
      if (!hit || now - hit.at > ttl) {
        const q = await fetchQuote(w).catch(() => null)
        if (q) {
          hit = { at: now, q }
          quoteCache.set(key, hit)
          fresh.push({ key, q })
        }
      }
      if (!hit) return { market: w.market, symbol: w.symbol, ok: false as const, error: ERROR_TEXT[w.market] }
      const priceTl = toTl(hit.q, w.market, rateMap)
      if (priceTl === null) return { market: w.market, symbol: w.symbol, ok: false as const, error: `${hit.q.currency} kuru bulunamadı` }
      return { market: w.market, symbol: w.symbol, ok: true as const, priceTl, price: hit.q.price, currency: hit.q.currency, date: hit.q.date, name: hit.q.name, provider: hit.q.provider }
    }),
  )
  await storeQuotes(fresh)
  return json({ ...(rates ?? { date: null, source: 'tcmb', rates: [] }), quotes })
})
