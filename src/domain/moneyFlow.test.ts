import { describe, expect, it } from 'vitest'
import { buildMoneyFlow, fixedShares, flowSpent } from './moneyFlow'
import type { Transaction } from './types'

const tx = (p: Partial<Transaction>): Transaction =>
  ({ id: p.id ?? Math.random().toString(), date: '2026-10-05', amountKurus: 0, type: 'expense', description: 'x', normalizedDescription: 'x', categoryId: null, source: 'manual', createdAt: '', updatedAt: '', ...p }) as Transaction

describe('moneyFlow', () => {
  it('Ücretsiz sabit oranlar 50/30/20, borç varsa ihtiyaçlardan %15', () => {
    expect(fixedShares(false)).toEqual({ needs: 0.5, wants: 0.3, debt: 0, saving: 0.2 })
    const s = fixedShares(true)
    expect(s.needs).toBeCloseTo(0.35)
    expect(s.debt).toBeCloseTo(0.15)
  })

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
    expect(flowSpent(txs, '2026-10', 1, cats, new Set())).toEqual({ needs: 1_765_000, wants: 400_000, debt: 500_000 })
  })

  it('hedef tutarları gelirden; birikim gelirden kalan', () => {
    const f = buildMoneyFlow(10_000_000, fixedShares(false), { needs: 1_765_000, wants: 4_000_000, debt: 0 }, false)
    const [needs, wants, , saving] = f.rows
    expect(needs.targetKurus).toBe(5_000_000)
    expect(needs.ok).toBe(true)
    expect(wants.ok).toBe(false)
    expect(saving.spentKurus).toBe(4_235_000)
    expect(saving.ok).toBe(true)
  })
})
