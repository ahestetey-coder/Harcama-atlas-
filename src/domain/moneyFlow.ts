import { categoryBucketOf } from './bucketBudget'
import { NEEDS_SHARE, SAVING_RATE_TARGET, WANTS_SHARE } from './assumptions'
import { periodOf } from './dates'
import { merchantKey } from './normalize'
import { isSpending, type Category, type MonthKey, type Transaction } from './types'

/**
 * Aylık paranın yolu: gelirin 50/30/20 hedefleri (zorunlu giderler ve ihtiyaçlar, istekler, birikim)
 * ve dönemde her kovaya harcanan tutar. Saf fonksiyonlar.
 */

export type FlowKey = 'fixed' | 'needs' | 'wants' | 'debt' | 'saving'
export const FLOW_KEYS: FlowKey[] = ['fixed', 'needs', 'wants', 'debt', 'saving']

/** Gelirin payları (0..1), toplamı 1. */
export type FlowShares = Record<FlowKey, number>

/**
 * 50/30/20 kuralı, esnetilmez: zorunlu giderler ve ihtiyaçlar (kira, fatura, borç ve taksit dahil)
 * %50, istekler %30, birikim ve borç kapatma %20. Bütçe sayfası ve Özet aynı hedefleri gösterir.
 */
export const RULE_SHARES: FlowShares = { fixed: 0, needs: NEEDS_SHARE, wants: WANTS_SHARE, debt: 0, saving: SAVING_RATE_TARGET }

/** Taksit ve kredi ödemesi mi: ekstre taksiti, borç planından yansıyan satır ya da taksit kaydıyla eşleşen gider. */
export function isDebtPayment(t: Transaction, installmentKeys: ReadonlySet<string>): boolean {
  return !!t.installment || t.source === 'planned' || t.id.startsWith('plan:') || (installmentKeys.size > 0 && installmentKeys.has(merchantKey(t.description)))
}

/** Dönemde kovalara harcanan (iadeler düşülür); kira, banka ücreti ve düzenli fatura/abonelik zorunlu sabittir. Birikim gelirden kalandır. */
export function flowSpent(
  txs: Transaction[],
  month: MonthKey,
  startDay: number,
  categories: ReadonlyMap<string, Pick<Category, 'name'>>,
  installmentKeys: ReadonlySet<string>,
  fixedKeys: ReadonlySet<string> = new Set(),
): Record<Exclude<FlowKey, 'saving'>, number> {
  const out = { fixed: 0, needs: 0, wants: 0, debt: 0 }
  for (const t of txs) {
    if (!isSpending(t) || periodOf(t.date, startDay) !== month) continue
    const n = t.type === 'expense' ? Math.abs(t.amountKurus) : -Math.abs(t.amountKurus)
    if (isDebtPayment(t, installmentKeys)) {
      out.debt += n
      continue
    }
    const bucket = t.categoryId ? categoryBucketOf(t.categoryId, categories.get(t.categoryId)?.name ?? '') : 'want'
    if (bucket === 'fixed' || bucket === 'fee' || (fixedKeys.size > 0 && fixedKeys.has(merchantKey(t.description)))) out.fixed += n
    else if (bucket === 'want') out.wants += n
    else out.needs += n
  }
  return { fixed: Math.max(0, out.fixed), needs: Math.max(0, out.needs), wants: Math.max(0, out.wants), debt: Math.max(0, out.debt) }
}

export interface FlowRow {
  key: FlowKey
  share: number
  targetKurus: number
  /** Birikimde gelirden kalan tutar. */
  spentKurus: number
  ok: boolean
}

export interface MoneyFlowResult {
  incomeKurus: number
  rows: FlowRow[]
}

export function buildMoneyFlow(incomeKurus: number, shares: FlowShares, raw: Record<Exclude<FlowKey, 'saving'>, number>): MoneyFlowResult {
  // Payı olmayan kova gösterilmez; harcaması bir üst kovaya girer (borç → zorunlu sabitler → ihtiyaçlar)
  const spent = { ...raw }
  if (shares.debt <= 0) {
    if (shares.fixed > 0) spent.fixed += spent.debt
    else spent.needs += spent.debt
    spent.debt = 0
  }
  if (shares.fixed <= 0) {
    spent.needs += spent.fixed
    spent.fixed = 0
  }
  const left = incomeKurus - spent.fixed - spent.needs - spent.wants - spent.debt
  const rows = FLOW_KEYS.filter((k) => k === 'saving' || k === 'needs' || shares[k] > 0).map((key) => {
    const targetKurus = Math.round(incomeKurus * shares[key])
    const spentKurus = key === 'saving' ? left : spent[key]
    return { key, share: shares[key], targetKurus, spentKurus, ok: key === 'saving' ? spentKurus >= targetKurus : spentKurus <= targetKurus }
  })
  return { incomeKurus, rows }
}
