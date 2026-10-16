import { describe, expect, it } from 'vitest'
import { buildMoneyFlow, flowSpent, RULE_SHARES } from './moneyFlow'
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
    const [needs, wants, saving] = f.rows
    expect(f.rows.map((r) => r.key)).toEqual(['needs', 'wants', 'saving'])
    expect(needs.targetKurus).toBe(5_000_000)
    expect(needs.spentKurus).toBe(1_965_000)
    expect(needs.ok).toBe(true)
    expect(wants.ok).toBe(false)
    expect(saving.spentKurus).toBe(4_035_000)
    expect(saving.ok).toBe(true)
  })
})
