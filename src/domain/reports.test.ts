import { describe, expect, it } from 'vitest'
import { normalizeText } from './normalize'
import { periodReport } from './reports'
import type { Transaction } from './types'

let seq = 0
const tx = (date: string, lira: number, categoryId: string | null, description = 'MARKET', type: Transaction['type'] = 'expense'): Transaction => ({
  id: String(++seq),
  date,
  amountKurus: Math.round(lira * 100),
  type,
  description,
  normalizedDescription: normalizeText(description),
  categoryId,
  source: 'manual',
  createdAt: '',
  updatedAt: '',
})
const names = (id: string | null) => (id === 'yemek' ? 'Yemek' : id === 'market' ? 'Market' : 'Diğer')

describe('dönem raporu', () => {
  const txs = [
    ...['2026-07', '2026-08', '2026-09'].flatMap((m) => [tx(`${m}-05`, 3000, 'market'), tx(`${m}-12`, 1000, 'yemek', 'BURGER')]),
    tx('2026-10-03', 3100, 'market'),
    tx('2026-10-04', 2500, 'yemek', 'BURGER'),
    tx('2026-10-05', 2500, 'diger', 'MOBILYA EVI'),
    tx('2026-10-05', 500, 'yemek', 'BURGER', 'refund'),
    tx('2026-10-06', 9999, null, 'KART ODEME', 'transfer'),
  ]
  const r = periodReport(txs, '2026-10', 1, names)

  it('toplamları ve kategori karşılaştırmasını hesaplar (iade düşülür, transfer sayılmaz)', () => {
    expect(r.currentKurus).toBe(760000)
    expect(r.previousKurus).toBe(400000)
    expect(r.averageKurus).toBe(400000)
    expect(r.historyMonths).toBe(3)
    const yemek = r.categories.find((c) => c.categoryId === 'yemek')!
    expect(yemek).toMatchObject({ currentKurus: 200000, previousKurus: 100000, averageKurus: 100000, diffVsAverage: 100000 })
  })
  it('iş yerlerini ve 6 dönemlik eğilimi verir', () => {
    expect(r.merchants[0]).toMatchObject({ name: 'MARKET', currentKurus: 310000, previousKurus: 300000 })
    expect(r.trend.map((t) => t.month)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'])
    expect(r.trend.map((t) => t.netKurus)).toEqual([0, 0, 400000, 400000, 400000, 760000])
  })
  it('olağandışı artışları açıklar', () => {
    const kinds = r.insights.map((i) => i.kind)
    expect(kinds).toContain('total-up')
    expect(kinds).toContain('category-up')
    expect(kinds).toContain('merchant-new')
    const up = r.insights.find((i) => i.kind === 'category-up')!
    expect(up.text).toContain('Yemek')
    expect(up.text).toContain('tasarruf')
    // Uyarılar önce gelir
    expect(r.insights[0].tone).toBe('warning')
  })
  it('süren dönemde "altında" mesajı vermez', () => {
    const low = [...['2026-07', '2026-08', '2026-09'].map((m) => tx(`${m}-05`, 3000, 'market')), tx('2026-10-03', 100, 'market')]
    expect(periodReport(low, '2026-10', 1, names).insights.map((i) => i.kind)).toEqual(['category-down'])
    expect(periodReport(low, '2026-10', 1, names, true).insights).toEqual([])
  })
  it('geçmiş yoksa uyarı üretmez', () => {
    expect(periodReport([tx('2026-10-03', 5000, 'market')], '2026-10', 1, names).insights).toEqual([])
  })
})
