import type { SupabaseClient } from '@supabase/supabase-js'
import type { MarketRate } from '../domain/assets'

export interface TcmbRates {
  /** Kurların geçerli olduğu gün (TCMB yayın tarihi). */
  date: string
  rates: MarketRate[]
}

/** TCMB gösterge kurları; istek kullanıcı verisi taşımaz. */
export async function fetchTcmbRates(client: SupabaseClient): Promise<TcmbRates> {
  const { data, error } = await client.functions.invoke('market-rates', { body: {} })
  if (error) {
    let msg = 'Kurlar alınamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.'
    try {
      const b = await (error as { context?: Response }).context?.json()
      if (b?.error) msg = b.error
    } catch {
      /* yok say */
    }
    throw new Error(msg)
  }
  const d = data as { date?: unknown; rates?: unknown }
  if (typeof d?.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.date) || !Array.isArray(d.rates)) throw new Error('Kur yanıtı beklenen biçimde değil.')
  const rates = d.rates
    .filter((r): r is { code: string; valueTl: number } => typeof r?.code === 'string' && typeof r?.valueTl === 'number' && Number.isFinite(r.valueTl) && r.valueTl > 0)
    .map((r) => ({ code: r.code, valueTl: r.valueTl }))
  return { date: d.date, rates }
}
