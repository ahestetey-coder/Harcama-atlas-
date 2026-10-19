import { describe, expect, it } from 'vitest'
import type { Asset } from './assets'
import { buildMoneyFlow, flowSaved, flowSpent } from './moneyFlow'
import type { Transaction } from './types'

const tx = (p: Partial<Transaction>): Transaction =>
  ({ id: p.id ?? Math.random().toString(), date: '2026-10-05', amountKurus: 0, type: 'expense', description: 'x', normalizedDescription: 'x', categoryId: null, source: 'manual', createdAt: '', updatedAt: '', ...p }) as Transaction
const asset = (kind: string, trades: Asset['trades']): Asset => ({ id: kind, name: kind, kind, trades }) as unknown as Asset

describe('moneyFlow', () => {
  it('giderleri zorunlu ve istek olarak ayırır; taksit ve plan satırı zorunlu, iade düşer, gelir ve başka dönem girmez', () => {
    const cats = new Map([['cat-market', { name: 'Market' }], ['cat-restoran', { name: 'Restoran' }], ['cat-kira', { name: 'Kira' }]])
    const txs = [
      tx({ amountKurus: 1_765_000, categoryId: 'cat-market' }),
      tx({ amountKurus: 2_000_000, categoryId: 'cat-kira' }),
      tx({ amountKurus: 500_000, categoryId: 'cat-restoran' }),
      tx({ amountKurus: 100_000, categoryId: 'cat-restoran', type: 'refund' }),
      tx({ amountKurus: 300_000, categoryId: 'cat-restoran', installment: { current: 2, total: 6 } }),
      tx({ id: 'plan:debt:a:3', amountKurus: 4_800_000, source: 'planned' }),
      tx({ amountKurus: 9_999_900, type: 'income' }),
      tx({ amountKurus: 700_000, categoryId: 'cat-market', date: '2026-09-05' }),
    ]
    expect(flowSpent(txs, '2026-10', 1, cats)).toEqual({ needs: 1_765_000 + 2_000_000 + 300_000 + 4_800_000, wants: 400_000 })
  })

  it('birikim: dönemde yatırım alışı − satışı ve borçtan düşülen ödeme', () => {
    const assets = [
      asset('gold', [
        { id: '1', date: '2026-10-03', side: 'buy', quantity: 2, unitPriceKurus: 400_000 },
        { id: '2', date: '2026-10-08', side: 'sell', quantity: 1, unitPriceKurus: 300_000 },
        { id: '3', date: '2026-09-03', side: 'buy', quantity: 10, unitPriceKurus: 400_000 },
      ]),
      asset('debt', [
        { id: '4', date: '2026-10-10', side: 'sell', quantity: 1, unitPriceKurus: 1_000_000 },
        { id: '5', date: '2026-10-01', side: 'buy', quantity: 1, unitPriceKurus: 5_000_000 },
      ]),
    ]
    expect(flowSaved(assets, '2026-10', 1)).toBe(500_000 + 1_000_000)
  })

  it('50/30/20 hedefleri boş başlar; aşım kırmızı, birikim eksikken uyarı değil', () => {
    const empty = buildMoneyFlow(10_000_000, { needs: 0, wants: 0 }, 0)
    expect(empty.rows.map((r) => [r.key, r.targetKurus, r.spentKurus, r.ok])).toEqual([
      ['needs', 5_000_000, 0, true],
      ['wants', 3_000_000, 0, true],
      ['saving', 2_000_000, 0, true],
    ])
    const f = buildMoneyFlow(10_000_000, { needs: 6_000_000, wants: 1_000_000 }, 500_000)
    expect(f.rows[0].ok).toBe(false)
    expect(f.rows[2].spentKurus).toBe(500_000)
  })
})
