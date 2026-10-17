import type { Asset } from './assets'
import { categoryBucketOf } from './bucketBudget'
import { NEEDS_SHARE, SAVING_RATE_TARGET, WANTS_SHARE } from './assumptions'
import { periodOf } from './dates'
import { isSpending, type Category, type MonthKey, type Transaction } from './types'

/**
 * Aylık paranın yolu: 50/30/20 kuralıyla gelirin üç kovası ve dönemde her kovaya giden tutar.
 * Zorunlu gider ve ihtiyaçlar (kira, fatura, market, ulaşım, sağlık, eğitim, kredi ve taksit
 * ödemeleri) %50, istekler (restoran, giyim, eğlence, abonelik, diğer) %30, borç kapama ve birikim
 * (Yatırımlarım'a eklenenler, borç bakiyesinden yapılan ödemeler) %20. Saf fonksiyonlar.
 */

export type FlowKey = 'needs' | 'wants' | 'saving'
export const FLOW_KEYS: FlowKey[] = ['needs', 'wants', 'saving']
export const FLOW_SHARES: Record<FlowKey, number> = { needs: NEEDS_SHARE, wants: WANTS_SHARE, saving: SAVING_RATE_TARGET }

/** Dönemde giderlerin kovası: istek kategorileri istek, geri kalan her şey (taksit ve kredi dahil) zorunlu. İadeler düşülür. */
export function flowSpent(txs: Transaction[], month: MonthKey, startDay: number, categories: ReadonlyMap<string, Pick<Category, 'name'>>): { needs: number; wants: number } {
  let needs = 0
  let wants = 0
  for (const t of txs) {
    if (!isSpending(t) || periodOf(t.date, startDay) !== month) continue
    const n = t.type === 'expense' ? Math.abs(t.amountKurus) : -Math.abs(t.amountKurus)
    // Ekstre taksiti, borç planı satırı ve kredi ödemesi istek kategorisinde olsa da zorunludur
    const debt = !!t.installment || t.source === 'planned'
    const want = !debt && (t.categoryId ? categoryBucketOf(t.categoryId, categories.get(t.categoryId)?.name ?? '') === 'want' : true)
    if (want) wants += n
    else needs += n
  }
  return { needs: Math.max(0, needs), wants: Math.max(0, wants) }
}

/**
 * Dönemde Yatırımlarım'a eklenen (alış − satış) ve borç kayıtlarından düşülen tutar.
 * Kaydın ilk işlemi mevcut birikimin ya da borcun açılış bakiyesidir; bu ayın birikimi sayılmaz.
 */
export function flowSaved(assets: Asset[], month: MonthKey, startDay: number): number {
  let saved = 0
  for (const a of assets) {
    for (const [i, t] of a.trades.entries()) {
      if (i === 0 || periodOf(t.date, startDay) !== month) continue
      const value = Math.round(t.quantity * t.unitPriceKurus)
      // Borçta satış = bakiye azaldı (ödeme); yatırımda alış = birikim
      if (a.kind === 'debt') saved += t.side === 'sell' ? value : 0
      else saved += t.side === 'buy' ? value : -value
    }
  }
  return Math.max(0, saved)
}

export interface FlowRow {
  key: FlowKey
  share: number
  targetKurus: number
  /** Zorunlu ve isteklerde harcanan, birikimde ayrılan tutar. */
  spentKurus: number
  ok: boolean
}

export interface MoneyFlowResult {
  incomeKurus: number
  rows: FlowRow[]
}

export function buildMoneyFlow(incomeKurus: number, spent: { needs: number; wants: number }, savedKurus: number): MoneyFlowResult {
  const rows = FLOW_KEYS.map((key) => {
    const share = FLOW_SHARES[key]
    const targetKurus = Math.round(incomeKurus * share)
    const spentKurus = key === 'saving' ? savedKurus : spent[key]
    // Birikim hedefin altındayken uyarı değildir; ay içinde dolar
    return { key, share, targetKurus, spentKurus, ok: key === 'saving' ? true : spentKurus <= targetKurus }
  })
  return { incomeKurus, rows }
}
