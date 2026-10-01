import { describe, expect, it } from 'vitest'
import { normalizeText } from './normalize'
import { compareWithPrevious, summarizeMonth } from './summary'
import type { Transaction } from './types'

let seq = 0
const tx = (date: string, lira: number, type: Transaction['type'], categoryId: string | null = 'market', desc = 'X'): Transaction => ({
  id: String(++seq),
  date,
  amountKurus: Math.round(lira * 100),
  type,
  description: desc,
  normalizedDescription: normalizeText(desc),
  categoryId,
  source: 'manual',
  createdAt: '',
  updatedAt: '',
})

describe('aylık özet', () => {
  const data = [
    tx('2026-09-01', 1000, 'expense', 'market'),
    tx('2026-09-02', 250.5, 'expense', 'restoran'),
    tx('2026-09-03', 200, 'refund', 'market'),
    tx('2026-09-05', 5000, 'transfer', null, 'KART ÖDEMESİ'),
    tx('2026-09-30', 49.5, 'expense', 'market'),
    tx('2026-08-31', 999, 'expense', 'market'),
    tx('2026-10-01', 1, 'expense', 'market'),
  ]
  const s = summarizeMonth(data, '2026-09')

  it('gider ve iadeleri ayrı toplar, neti hesaplar', () => {
    expect(s.expenseKurus).toBe(130000)
    expect(s.refundKurus).toBe(20000)
    expect(s.netKurus).toBe(110000)
  })
  it('kart ödemesini/transferi gidere katmaz', () => {
    expect(s.transferKurus).toBe(500000)
    expect(s.count).toBe(4)
    expect(s.transferCount).toBe(1)
  })
  it('iadeyi bir kez düşer (iki kez eksiye çevirmez)', () => {
    const market = s.byCategory.find((c) => c.categoryId === 'market')!
    expect(market.expenseKurus).toBe(104950)
    expect(market.refundKurus).toBe(20000)
    expect(market.netKurus).toBe(84950)
  })
  it('ay sınırlarını takvim gününe göre uygular', () => {
    expect(s.daily[0].expenseKurus).toBe(100000)
    expect(s.daily[29].expenseKurus).toBe(4950)
    expect(s.daily.length).toBe(30)
  })
  it('negatif net kategoriyi korur ama en yüksek kategori brüt gidere göre seçilir', () => {
    const d2 = [tx('2026-07-01', 100, 'expense', 'giyim'), tx('2026-07-02', 300, 'refund', 'giyim'), tx('2026-07-03', 50, 'expense', 'market')]
    const s2 = summarizeMonth(d2, '2026-07')
    expect(s2.byCategory.find((c) => c.categoryId === 'giyim')!.netKurus).toBe(-20000)
    expect(s2.topCategory?.categoryId).toBe('giyim')
    expect(s2.netKurus).toBe(-15000)
  })
})

describe('ay döngüsüyle özet', () => {
  const data = [
    tx('2026-09-14', 700, 'expense', 'market'),
    tx('2026-09-15', 100, 'expense', 'market'),
    tx('2026-09-30', 50, 'expense', 'market'),
    tx('2026-10-14', 25, 'expense', 'restoran'),
    tx('2026-10-15', 900, 'expense', 'market'),
  ]
  it('dönemi başlangıç gününden sonraki ayın bir önceki gününe kadar sayar', () => {
    const s = summarizeMonth(data, '2026-09', undefined, 15)
    expect(s.expenseKurus).toBe(17500)
    expect(s.count).toBe(3)
    expect(s.daily.length).toBe(30)
    expect(s.daily[0]).toMatchObject({ date: '2026-09-15', day: 15, expenseKurus: 10000 })
    expect(s.daily[29]).toMatchObject({ date: '2026-10-14', day: 14, expenseKurus: 2500 })
  })
  it('önceki dönemle aynı gün sayısına kadar karşılaştırır', () => {
    const c = compareWithPrevious(data, '2026-10', '2026-09', '2026-10-15', 15)
    // 15 Ekim dönemin 1. günü: önceki dönemin yalnızca ilk günü (15 Eylül) sayılır
    expect(c).toMatchObject({ kind: 'ok', previousNetKurus: 10000, diffKurus: 80000, partial: true })
  })
})

describe('önceki ay karşılaştırması', () => {
  it('önceki ayda veri yoksa yüzde üretmez', () => {
    const c = compareWithPrevious([tx('2026-09-01', 10, 'expense')], '2026-09', '2026-08', '2026-10-15')
    expect(c.kind).toBe('none')
  })
  it('sıfır tabanda yüzde göstermez', () => {
    const c = compareWithPrevious([tx('2026-09-01', 10, 'expense'), tx('2026-08-01', 10, 'expense'), tx('2026-08-02', 10, 'refund')], '2026-09', '2026-08', '2026-10-15')
    expect(c.kind === 'ok' && c.percent).toBeNull()
    expect(c.kind === 'ok' && c.diffKurus).toBe(1000)
  })
  it('tamamlanmamış ayı önceki ayın aynı gün aralığıyla karşılaştırır', () => {
    const data = [tx('2026-09-02', 100, 'expense'), tx('2026-08-01', 50, 'expense'), tx('2026-08-20', 500, 'expense')]
    const c = compareWithPrevious(data, '2026-09', '2026-08', '2026-09-10')
    expect(c.kind).toBe('ok')
    if (c.kind === 'ok') {
      expect(c.partial).toBe(true)
      expect(c.previousNetKurus).toBe(5000)
      expect(c.percent).toBe(100)
    }
  })
})
