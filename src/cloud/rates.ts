import type { SupabaseClient } from '@supabase/supabase-js'
import type { AssetQuote, MarketRate, QuoteMarket } from '../domain/assets'

export interface QuoteResult {
  market: QuoteMarket
  symbol: string
  ok: boolean
  priceTl?: number
  /** Kaynaktaki fiyat ve para birimi (ör. 336,64 USD). */
  price?: number
  currency?: string
  date?: string
  name?: string | null
  provider?: string
  error?: string
}

export interface MarketData {
  /** TCMB kurlarının geçerli olduğu gün; kurlar alınamadıysa null. */
  date: string | null
  rates: MarketRate[]
  quotes: QuoteResult[]
}

const isDate = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)

/**
 * TCMB gösterge kurları ve istenen sembollerin güncel fiyatı. İstek yalnızca piyasa ve sembol taşır;
 * miktar, maliyet ya da tutar gönderilmez.
 */
export async function fetchMarket(client: SupabaseClient, quotes: AssetQuote[] = []): Promise<MarketData> {
  const { data, error } = await client.functions.invoke('market-rates', { body: quotes.length ? { quotes } : {} })
  if (error) {
    let msg = 'Güncel fiyatlar alınamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.'
    try {
      const b = await (error as { context?: Response }).context?.json()
      if (b?.error) msg = b.error
    } catch {
      /* yok say */
    }
    throw new Error(msg)
  }
  const d = data as { date?: unknown; rates?: unknown; quotes?: unknown }
  if (!Array.isArray(d?.rates)) throw new Error('Fiyat yanıtı beklenen biçimde değil.')
  const rates = d.rates
    .filter((r): r is { code: string; valueTl: number } => typeof r?.code === 'string' && typeof r?.valueTl === 'number' && Number.isFinite(r.valueTl) && r.valueTl > 0)
    .map((r) => ({ code: r.code, valueTl: r.valueTl }))
  const list = Array.isArray(d.quotes) ? (d.quotes as QuoteResult[]) : []
  const results = list
    .filter((q) => typeof q?.market === 'string' && typeof q?.symbol === 'string')
    .map((q) => (q.ok && typeof q.priceTl === 'number' && Number.isFinite(q.priceTl) && q.priceTl > 0 && isDate(q.date) ? q : { market: q.market, symbol: q.symbol, ok: false, error: typeof q.error === 'string' ? q.error : 'Fiyat alınamadı' }))
  return { date: isDate(d.date) ? d.date : null, rates, quotes: results }
}
