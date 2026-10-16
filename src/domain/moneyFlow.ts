import type { AutoBudget } from './autoBudget'
import { categoryBucketOf } from './bucketBudget'
import { NEEDS_SHARE, SAVING_RATE_TARGET, WANTS_SHARE } from './assumptions'
import { periodOf } from './dates'
import { merchantKey } from './normalize'
import { isSpending, type Category, type MonthKey, type Transaction } from './types'

/**
 * Aylık paranın yolu: gelirin dört kovaya bilimsel hedef dağılımı (ihtiyaçlar, istekler, borç ve
 * taksit, birikim) ve dönemde her kovaya harcanan tutar. Hedefler Plus'ta dört kovalı bütçe
 * motorundan (kişisel), Ücretsiz pakette sabit 50/30/20 oranlarından gelir. Saf fonksiyonlar.
 */

export type FlowKey = 'needs' | 'wants' | 'debt' | 'saving'
export const FLOW_KEYS: FlowKey[] = ['needs', 'wants', 'debt', 'saving']

/** Ücretsiz paketin sabit oranları: 50/30/20; borç ödemesi varsa ihtiyaçların %15'i borca ayrılır. */
export const FIXED_DEBT_SHARE = 0.15

/** Gelirin payları (0..1), toplamı 1. */
export type FlowShares = Record<FlowKey, number>

export function fixedShares(hasDebt: boolean): FlowShares {
  const debt = hasDebt ? FIXED_DEBT_SHARE : 0
  return { needs: NEEDS_SHARE - debt, wants: WANTS_SHARE, debt, saving: SAVING_RATE_TARGET }
}

/** Motorun kişisel kovaları → dört kova payı; zorunlu sabitlerin borç dışı kısmı ihtiyaçlara girer. */
export function personalShares(a: AutoBudget): FlowShares | null {
  const b = a.buckets
  if (!b || b.incomeKurus <= 0) return null
  const income = b.incomeKurus
  const debt = Math.max(0, a.debtKurus)
  const wants = Math.max(0, b.buckets.wants.kurus)
  const saving = Math.max(0, b.buckets.saving.kurus)
  const needs = Math.max(0, income - debt - wants - saving)
  const sum = needs + wants + debt + saving
  return { needs: needs / sum, wants: wants / sum, debt: debt / sum, saving: saving / sum }
}

/** Taksit ve kredi ödemesi mi: ekstre taksiti, borç planından yansıyan satır ya da taksit kaydıyla eşleşen gider. */
export function isDebtPayment(t: Transaction, installmentKeys: ReadonlySet<string>): boolean {
  return !!t.installment || t.source === 'planned' || t.id.startsWith('plan:') || (installmentKeys.size > 0 && installmentKeys.has(merchantKey(t.description)))
}

/** Dönemde kovalara harcanan (iadeler düşülür); birikim harcanmaz, gelirden kalan olarak hesaplanır. */
export function flowSpent(
  txs: Transaction[],
  month: MonthKey,
  startDay: number,
  categories: ReadonlyMap<string, Pick<Category, 'name'>>,
  installmentKeys: ReadonlySet<string>,
): Record<Exclude<FlowKey, 'saving'>, number> {
  const out = { needs: 0, wants: 0, debt: 0 }
  for (const t of txs) {
    if (!isSpending(t) || periodOf(t.date, startDay) !== month) continue
    const n = t.type === 'expense' ? Math.abs(t.amountKurus) : -Math.abs(t.amountKurus)
    if (isDebtPayment(t, installmentKeys)) {
      out.debt += n
      continue
    }
    const bucket = t.categoryId ? categoryBucketOf(t.categoryId, categories.get(t.categoryId)?.name ?? '') : 'want'
    if (bucket === 'want') out.wants += n
    else out.needs += n
  }
  return { needs: Math.max(0, out.needs), wants: Math.max(0, out.wants), debt: Math.max(0, out.debt) }
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
  personal: boolean
  rows: FlowRow[]
}

export function buildMoneyFlow(incomeKurus: number, shares: FlowShares, spent: Record<Exclude<FlowKey, 'saving'>, number>, personal: boolean): MoneyFlowResult {
  const left = incomeKurus - spent.needs - spent.wants - spent.debt
  const rows = FLOW_KEYS.map((key) => {
    const targetKurus = Math.round(incomeKurus * shares[key])
    const spentKurus = key === 'saving' ? left : spent[key]
    return { key, share: shares[key], targetKurus, spentKurus, ok: key === 'saving' ? spentKurus >= targetKurus : spentKurus <= targetKurus }
  })
  return { incomeKurus, personal, rows }
}
