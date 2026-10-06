import { describe, expect, it } from 'vitest'
import { holdingSummary, parseQuantity, portfolio, priceAt, valueHistory, type Asset, type AssetTrade } from './assets'

let seq = 0
const asset = (kind: Asset['kind'], trades: Omit<AssetTrade, 'id'>[], valuations: [string, number][] = []): Asset => ({
  id: String(++seq),
  kind,
  name: kind,
  unit: 'x',
  trades: trades.map((t, i) => ({ ...t, id: String(i) })),
  valuations: valuations.map(([date, lira]) => ({ date, unitPriceKurus: lira * 100, source: 'manual' })),
  archived: false,
  createdAt: '',
  updatedAt: '',
})

describe('varlık özeti', () => {
  it('ortalama maliyetle gerçekleşen ve gerçekleşmemiş kazancı ayırır', () => {
    const gold = asset(
      'gold',
      [
        { date: '2026-01-10', side: 'buy', quantity: 10, unitPriceKurus: 300000 },
        { date: '2026-03-10', side: 'buy', quantity: 10, unitPriceKurus: 400000 },
        { date: '2026-06-10', side: 'sell', quantity: 5, unitPriceKurus: 450000 },
      ],
      [['2026-10-01', 5000]],
    )
    const s = holdingSummary(gold, '2026-10-06')
    expect(s.quantity).toBe(15)
    // ortalama maliyet 3.500 TL
    expect(s.costKurus).toBe(15 * 350000)
    expect(s.valueKurus).toBe(15 * 500000)
    expect(s.unrealizedKurus).toBe(15 * 150000)
    expect(s.realizedKurus).toBe(5 * 100000)
    expect(s.contributedKurus).toBe(10 * 300000 + 10 * 400000 - 5 * 450000)
    expect(s.price).toEqual({ unitPriceKurus: 500000, date: '2026-10-01', source: 'manual' })
  })
  it('elle fiyat yoksa son işlem fiyatını kullanır; aynı gün elle girilen fiyat önceliklidir', () => {
    const fx = asset('fx', [{ date: '2026-09-01', side: 'buy', quantity: 100, unitPriceKurus: 4100 }])
    expect(priceAt(fx, '2026-10-06')).toEqual({ unitPriceKurus: 4100, date: '2026-09-01', source: 'trade' })
    const fx2 = asset('fx', [{ date: '2026-09-01', side: 'buy', quantity: 100, unitPriceKurus: 4100 }], [['2026-09-01', 41.5]])
    expect(priceAt(fx2, '2026-10-06')?.source).toBe('manual')
  })
  it('mevduat faizi kazanç olarak görünür; borç net varlıktan düşülür', () => {
    const dep = asset('deposit', [{ date: '2026-08-01', side: 'buy', quantity: 100000, unitPriceKurus: 100 }], [['2026-10-01', 1.04]])
    const debt = asset('debt', [{ date: '2026-08-01', side: 'buy', quantity: 20000, unitPriceKurus: 100 }])
    const p = portfolio([dep, debt], '2026-10-06', 500000)
    expect(p.assetsKurus).toBe(10400000)
    expect(p.contributedKurus).toBe(10000000)
    expect(p.unrealizedKurus).toBe(400000)
    expect(p.debtsKurus).toBe(2000000 + 500000)
    expect(p.netWorthKurus).toBe(10400000 - 2500000)
    expect(p.allocation).toEqual([{ kind: 'deposit', valueKurus: 10400000, share: 1 }])
  })
  it('değer geçmişini yalnızca girilen tarihler için hesaplar', () => {
    const fx = asset('fx', [{ date: '2026-09-01', side: 'buy', quantity: 100, unitPriceKurus: 4000 }], [['2026-10-01', 42]])
    const h = valueHistory([fx], '2026-10-06')
    expect(h).toEqual([
      { date: '2026-09-01', valueKurus: 400000, contributedKurus: 400000 },
      { date: '2026-10-01', valueKurus: 420000, contributedKurus: 400000 },
    ])
  })
  it('miktarı Türkçe biçimde okur', () => {
    expect(parseQuantity('1,25')).toBe(1.25)
    expect(parseQuantity('1.250,5')).toBe(1250.5)
    expect(parseQuantity('1.250')).toBe(1250)
    expect(parseQuantity('0.5')).toBe(0.5)
    expect(parseQuantity('abc')).toBeNull()
    expect(parseQuantity('0')).toBeNull()
  })
})
