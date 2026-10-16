import { describe, expect, it } from 'vitest'
import { buildMoneyFlow, flowSpent, RULE_SHARES, ruleShares } from './moneyFlow'
import type { Transaction } from './types'

const tx = (p: Partial<Transaction>): Transaction =>
  ({ id: p.id ?? Math.random().toString(), date: '2026-10-05', amountKurus: 0, type: 'expense', description: 'x', normalizedDescription: 'x', categoryId: null, source: 'manual', createdAt: '', updatedAt: '', ...p }) as Transaction

describe('moneyFlow', () => {
  it('harcamayı kovalara ayırır; taksit borca, iade düşer, gelir ve başka dönem girmez', () => {
    const cats = new Map([['cat-market', { name: 'Market' }], ['cat-restoran', { name: 'Restoran' }]])
    const txs = [
      tx({ amountKurus: 1_765_000, categoryId: 'cat-market' }),
      tx({ amountKurus: 500_000, categoryId: 'cat-restoran' }),
      tx({ amountKurus: 100_000, categoryId: 'cat-restoran', type: 'refund' }),
      tx({ amountKurus: 300_000, categoryId: 'cat-restoran', installment: { current: 2, total: 6 } }),
      tx({ id: 'plan:debt:a:3', amountKurus: 200_000, source: 'planned' }),
      tx({ amountKurus: 9_999_900, type: 'income' }),
      tx({ amountKurus: 700_000, categoryId: 'cat-market', date: '2026-09-05' }),
    ]
    expect(flowSpent(txs, '2026-10', 1, cats, new Set())).toEqual({ fixed: 0, needs: 1_765_000, wants: 400_000, debt: 500_000 })
  })

  it('hedef tutarları gelirden; birikim gelirden kalan', () => {
    const f = buildMoneyFlow(10_000_000, RULE_SHARES, { fixed: 300_000, needs: 1_465_000, wants: 4_000_000, debt: 200_000 })
    const [needs, wants, debt, saving] = f.rows
    expect(debt.spentKurus).toBe(0)
    expect(f.rows.map((r) => r.key)).toEqual(['needs', 'wants', 'debt', 'saving'])
    expect(needs.targetKurus).toBe(5_000_000)
    expect(needs.spentKurus).toBe(1_965_000)
    expect(needs.ok).toBe(true)
    expect(wants.ok).toBe(false)
    expect(saving.spentKurus).toBe(4_035_000)
    expect(saving.ok).toBe(true)
  })

  it('%20 birikim ve borç kapatmaya ayrılır, toplam %20 kalır', () => {
    expect(ruleShares(null, false)).toMatchObject({ needs: 0.5, wants: 0.3, debt: 0, saving: 0.2 })
    expect(ruleShares(null, true)).toMatchObject({ debt: 0.1, saving: 0.1 })
    const s = ruleShares(0.75, true)
    expect(s.debt + s.saving).toBeCloseTo(0.2)
    expect(s.debt).toBeCloseTo(0.15)
  })

  it('taksit zorunlu giderde; istek payından sonra kalan önce borç kapatmaya, sonra birikime', () => {
    const f = buildMoneyFlow(10_000_000, ruleShares(null, true), { fixed: 0, needs: 2_000_000, wants: 1_000_000, debt: 4_800_000 })
    const [needs, , debt, saving] = f.rows
    expect(needs.spentKurus).toBe(6_800_000)
    expect(needs.ok).toBe(false)
    expect(debt.targetKurus).toBe(1_000_000)
    // İstek payı (3.000.000) ayrılır; kalan 200.000 önce borç kapatmaya
    expect(debt.spentKurus).toBe(200_000)
    expect(debt.ok).toBe(false)
    expect(saving.spentKurus).toBe(0)
    expect(saving.ok).toBe(false)
  })
})
