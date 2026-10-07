import { describe, expect, it } from 'vitest'
import { autoPriceCode, autoQuote, holdingSummary, migrateAssetKind, normalizeSymbol, quoteUpdates, parseQuantity, portfolio, priceAt, rateUpdates, valueHistory, type Asset, type AssetTrade } from './assets'

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

describe('TCMB kuruyla otomatik fiyat', () => {
  const usd = (unit = 'USD') => ({ ...asset('fx', [{ date: '2026-09-01', side: 'buy', quantity: 1000, unitPriceKurus: 4000 }]), unit })
  const rates = [
    { code: 'USD', valueTl: 41.2345 },
    { code: 'EUR', valueTl: 48.1 },
  ]

  it('yalnızca birimi döviz kodu olan döviz varlıklarını eşler', () => {
    expect(autoPriceCode({ kind: 'fx', unit: 'usd' })).toBe('USD')
    expect(autoPriceCode({ kind: 'fx', unit: 'Dolar' })).toBeNull()
    expect(autoPriceCode({ kind: 'gold', unit: 'USD' })).toBeNull()
  })

  it('kuru fiyat olarak yazar ve kâr/zarar güncel kurla hesaplanır', () => {
    const a = usd()
    const [u] = rateUpdates([a, asset('gold', [])], rates, '2026-10-07')
    expect(u).toEqual({ assetId: a.id, valuation: { date: '2026-10-07', unitPriceKurus: 4123.45, source: 'tcmb' } })
    const withRate = { ...a, valuations: [u.valuation] }
    const s = holdingSummary(withRate, '2026-10-07')
    expect(s.price?.source).toBe('tcmb')
    expect(s.valueKurus).toBe(4123450)
    expect(s.unrealizedKurus).toBe(4123450 - 4000000)
  })

  it('aynı gün elle girilen fiyatın üzerine yazmaz, aynı kuru tekrar yazmaz', () => {
    const manual = { ...usd(), valuations: [{ date: '2026-10-07', unitPriceKurus: 4200, source: 'manual' as const }] }
    const same = { ...usd(), valuations: [{ date: '2026-10-07', unitPriceKurus: 4123.45, source: 'tcmb' as const }] }
    const old = { ...usd(), valuations: [{ date: '2026-10-07', unitPriceKurus: 4100, source: 'tcmb' as const }] }
    const ids = rateUpdates([manual, same, old, { ...usd('JPY') }, { ...usd(), archived: true }], rates, '2026-10-07').map((u) => u.assetId)
    expect(ids).toEqual([old.id])
  })
})

describe('piyasa fiyatıyla otomatik güncelleme', () => {
  const stock = (quote?: Asset['quote'], kind: Asset['kind'] = 'stock') => ({ ...asset(kind, [{ date: '2026-09-01', side: 'buy', quantity: 10, unitPriceKurus: 30000 }]), quote })

  it('sembolü olan hisse, fon ve kripto ile gram altını eşler', () => {
    expect(autoQuote(stock({ market: 'bist', symbol: 'THYAO' }))).toEqual({ market: 'bist', symbol: 'THYAO' })
    expect(autoQuote(stock(undefined))).toBeNull()
    expect(autoQuote(stock({ market: 'crypto', symbol: 'BTC' }))).toBeNull() // hisse türünde kripto piyasası olmaz
    expect(autoQuote(stock({ market: 'us', symbol: 'AAPL' }))).toBeNull() // BIST hissesi yabancı borsaya bakmaz
    expect(migrateAssetKind(stock({ market: 'us', symbol: 'AAPL' })).kind).toBe('foreign')
    expect(migrateAssetKind(stock({ market: 'bist', symbol: 'THYAO' })).kind).toBe('stock')
    expect(autoQuote({ kind: 'gold', unit: 'gram' })).toEqual({ market: 'gold', symbol: 'XAU' })
    expect(autoQuote({ kind: 'gold', unit: 'adet' })).toBeNull()
    expect(normalizeSymbol(' thyao.is ')).toBe('THYAO')
    expect(normalizeSymbol('a b')).toBeNull()
  })

  it('fiyatı yazar, elle girilen aynı günlük fiyatı korur', () => {
    const a = stock({ market: 'us', symbol: 'SPY' }, 'foreign')
    const b = { ...stock({ market: 'us', symbol: 'SPY' }, 'foreign'), valuations: [{ date: '2026-10-07', unitPriceKurus: 1, source: 'manual' as const }] }
    const c = stock({ market: 'bist', symbol: 'YOK' })
    const u = quoteUpdates([a, b, c], [{ market: 'us', symbol: 'SPY', priceTl: 330.5, date: '2026-10-07' }])
    expect(u).toEqual([{ assetId: a.id, valuation: { date: '2026-10-07', unitPriceKurus: 33050, source: 'piyasa' } }])
    const s = holdingSummary({ ...a, valuations: [u[0].valuation] }, '2026-10-07')
    expect(s.unrealizedKurus).toBe(330500 - 300000)
  })
})
