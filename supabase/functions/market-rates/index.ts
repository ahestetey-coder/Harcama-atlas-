// Varlıklarım için güncel fiyatlar: TCMB gösterge kurları ve istenirse hisse, ETF, fon, kripto ve gram altın.
// Tarayıcı bu kaynaklara doğrudan erişemediği (CORS) için fiyatlar burada okunur. İstek yalnızca sembol
// listesi taşır; miktar, tutar ya da maliyet gönderilmez ve semboller kaydedilmez ya da günlüğe yazılmaz.
import { cors, json } from '../_shared/openai.ts'
import { parseTcmbRates } from '../_shared/research.ts'
import { serviceClient, userId } from '../_shared/server.ts'
import {
  parseBinanceTicker,
  parseQuoteRequests,
  parseTefasHistory,
  parseYahooChart,
  tefasDate,
  toTl,
  yahooSymbol,
  type QuoteRequest,
  type RawQuote,
} from '../_shared/market.ts'

const TCMB_URL = 'https://www.tcmb.gov.tr/kurlar/today.xml'
const RATES_TTL_MS = 30 * 60 * 1000
const QUOTE_TTL_MS = 10 * 60 * 1000
const TEFAS_TTL_MS = 3 * 60 * 60 * 1000
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

type Rates = { date: string; source: 'tcmb'; rates: { code: string; name: string; valueTl: number }[] }
let ratesCache: { at: number; body: Rates } | null = null
const quoteCache = new Map<string, { at: number; q: RawQuote }>()

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
  const res = await fetch(url, { ...init, headers: { 'User-Agent': UA, Accept: 'application/json', ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(10000) })
  if (!res.ok) return null
  try {
    return await res.json()
  } catch {
    return null
  }
}

async function fetchQuote(q: QuoteRequest): Promise<RawQuote | null> {
  if (q.market === 'crypto') return parseBinanceTicker(await getJson(`https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(`${q.symbol}USDT`)}`), Date.now())
  if (q.market === 'tefas') {
    const now = Date.now()
    const form = new URLSearchParams({ fontip: 'YAT', sfontur: '', fonkod: q.symbol, fongrup: '', bastarih: tefasDate(now - 14 * 86400000), bittarih: tefasDate(now), fonturkod: '', fonunvantip: '' })
    const body = await getJson('https://www.tefas.gov.tr/api/DB/BindHistoryInfo', {
      method: 'POST',
      body: form.toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', Origin: 'https://www.tefas.gov.tr', Referer: 'https://www.tefas.gov.tr/TarihselVeriler.aspx' },
    })
    return parseTefasHistory(body)
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

const CHECK_SYMBOLS: QuoteRequest[] = [
  { market: 'bist', symbol: 'THYAO' },
  { market: 'us', symbol: 'AAPL' },
  { market: 'us', symbol: 'SPY' },
  { market: 'crypto', symbol: 'BTC' },
  { market: 'gold', symbol: 'XAU' },
  { market: 'tefas', symbol: 'TTE' },
]

const ERROR_TEXT: Record<QuoteRequest['market'], string> = {
  bist: 'Borsa İstanbul\'da bu sembol bulunamadı',
  us: 'ABD borsalarında bu sembol bulunamadı',
  tefas: 'TEFAS fiyatı alınamadı',
  crypto: 'Bu kripto için USDT paritesi bulunamadı',
  gold: 'Altın fiyatı alınamadı',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const body: unknown = req.method === 'POST' ? await req.json().catch(() => null) : null
  // Sağlık denetimi: sabit örnek sembollerle bütün kaynakları dener (girişsiz; kullanıcı sembolü kabul etmez)
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
