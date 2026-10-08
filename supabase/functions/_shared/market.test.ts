import { describe, expect, it } from 'vitest'
import { fold, parseBinanceAll, parseBinanceTicker, parseCoinSearch, parseQuoteRequests, parseTefasList, parseYahooChart, parseYahooSearch, searchFunds, tefasBody, toTl, yahooSymbol } from './market'

describe('piyasa fiyatı okuyucuları', () => {
  it('istekteki sembolleri doğrular ve tekrarları atar', () => {
    const q = parseQuoteRequests({ quotes: [{ market: 'bist', symbol: ' thyao.is ' }, { market: 'bist', symbol: 'THYAO' }, { market: 'us', symbol: 'SPY' }, { market: 'x', symbol: 'A' }, { market: 'us', symbol: 'a b' }, { market: 'crypto' }] })
    expect(q).toEqual([
      { market: 'bist', symbol: 'THYAO' },
      { market: 'us', symbol: 'SPY' },
    ])
    expect(parseQuoteRequests({})).toEqual([])
    expect(yahooSymbol({ market: 'bist', symbol: 'THYAO' })).toBe('THYAO.IS')
    expect(yahooSymbol({ market: 'gold', symbol: 'XAU' })).toBe('GC=F')
  })

  it('Yahoo yanıtından son fiyatı, para birimini ve İstanbul gününü okur', () => {
    const q = parseYahooChart({ chart: { result: [{ meta: { currency: 'USD', regularMarketPrice: 336.645, regularMarketTime: 1791398430, longName: 'Apple Inc.' } }] } })
    expect(q).toMatchObject({ price: 336.645, currency: 'USD', name: 'Apple Inc.', provider: 'Yahoo Finance' })
    expect(q?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(parseYahooChart({ chart: { result: null, error: { code: 'Not Found' } } })).toBeNull()
  })

  it('Binance ve TEFAS yanıtlarını okur', () => {
    expect(parseBinanceTicker({ symbol: 'BTCUSDT', price: '83304.01000000' }, Date.UTC(2026, 9, 7, 12))).toMatchObject({ price: 83304.01, currency: 'USD', date: '2026-10-07' })
    expect(parseBinanceTicker({ code: -1121, msg: 'Invalid symbol.' }, 0)).toBeNull()
    const t = parseTefasList({
      errorMessage: null,
      resultList: [
        { fonKodu: 'TTE', fonUnvan: 'İŞ PORTFÖY TEKNOLOJİ FONU', tarih: '2026-10-06', fiyat: 1.208225 },
        { fonKodu: 'TTE', fonUnvan: 'İŞ PORTFÖY TEKNOLOJİ FONU', tarih: '2026-10-07', fiyat: 1.212706 },
        { fonKodu: 'AAK', fonUnvan: 'ATA PORTFÖY ÇOKLU VARLIK', tarih: '2026-10-07', fiyat: 0 },
      ],
    })
    expect(t).toEqual([{ code: 'TTE', name: 'İŞ PORTFÖY TEKNOLOJİ FONU', price: 1.212706, date: '2026-10-07' }])
    expect(parseTefasList({ errorMessage: 'Index 0 out of bounds for length 0', resultList: null })).toEqual([])
    expect(parseTefasList({ errorMessage: 'Hata:java.lang.NullPointerException', resultList: null })).toBeNull()
    expect(tefasBody('YAT', '2026-10-01', '2026-10-07')).toMatchObject({ fonTipi: 'YAT', fonKodu: null, basTarih: '20261001', bitTarih: '20261007' })
  })

  it('TL karşılığını kurla, altını gram başına hesaplar', () => {
    const rates = new Map([['USD', 49.2]])
    expect(toTl({ price: 10, currency: 'USD', date: '', name: null, provider: 'Yahoo Finance' }, 'us', rates)).toBeCloseTo(492)
    expect(toTl({ price: 286.25, currency: 'TRY', date: '', name: null, provider: 'Yahoo Finance' }, 'bist', rates)).toBe(286.25)
    expect(toTl({ price: 3110.34768, currency: 'USD', date: '', name: null, provider: 'Yahoo Finance' }, 'gold', rates)).toBeCloseTo(4920)
    expect(toTl({ price: 1, currency: 'CAD', date: '', name: null, provider: 'Yahoo Finance' }, 'us', rates)).toBeNull()
    // gümüş: ons fiyatı grama; bakır: libre fiyatı kg'a
    expect(toTl({ price: 31.1034768, currency: 'USD', date: '', name: null, provider: 'Yahoo Finance' }, 'commodity', rates, 'XAG')).toBeCloseTo(49.2)
    expect(toTl({ price: 1, currency: 'USD', date: '', name: null, provider: 'Yahoo Finance' }, 'commodity', rates, 'COPPER')).toBeCloseTo(108.47, 1)
    expect(toTl({ price: 1, currency: 'USD', date: '', name: null, provider: 'Yahoo Finance' }, 'commodity', rates, 'XYZ')).toBeNull()
    expect(yahooSymbol({ market: 'commodity', symbol: 'BRENT' })).toBe('BZ=F')
  })

  it('fon, hisse ve kripto aramasında önerileri sıralar ve süzer', () => {
    const funds = [
      { code: 'TTE', name: 'İŞ PORTFÖY BIST TEKNOLOJİ FONU', price: 1, date: '2026-10-07' },
      { code: 'AFT', name: 'AK PORTFÖY YENİ TEKNOLOJİLER FONU', price: 1, date: '2026-10-07' },
      { code: 'TI2', name: 'İŞ PORTFÖY KISA VADELİ BORÇLANMA', price: 1, date: '2026-10-07' },
    ]
    expect(searchFunds(funds, 'tt').map((s) => s.symbol)).toEqual(['TTE'])
    expect(searchFunds(funds, 'teknoloji').map((s) => s.symbol)).toEqual(['TTE', 'AFT'])
    expect(searchFunds(funds, 'iş portföy kısa').map((s) => s.symbol)).toEqual(['TI2'])
    expect(fold('İş Portföy')).toBe('IS PORTFOY')

    const yahoo = {
      quotes: [
        { symbol: 'ASELS.IS', shortname: 'ASELSAN', quoteType: 'EQUITY', exchDisp: 'Istanbul' },
        { symbol: 'AAPL', longname: 'Apple Inc.', quoteType: 'EQUITY', exchDisp: 'NASDAQ' },
        { symbol: 'SPY', longname: 'SPDR S&P 500 ETF Trust', quoteType: 'ETF', exchDisp: 'NYSEArca' },
        { symbol: 'AAPL260116C00200000', quoteType: 'OPTION' },
      ],
    }
    expect(parseYahooSearch(yahoo, 'bist')).toEqual([{ symbol: 'ASELS', name: 'ASELSAN', exchange: 'BIST' }])
    expect(parseYahooSearch(yahoo, 'us').map((s) => s.symbol)).toEqual(['AAPL', 'SPY'])

    const bases = parseBinanceAll([{ symbol: 'BTCUSDT', price: '83000' }, { symbol: 'ETHBTC', price: '0.03' }, { symbol: 'ETHUSDT', price: '2500' }])
    expect([...bases.keys()]).toEqual(['BTC', 'ETH'])
    const coins = { coins: [{ symbol: 'btc', name: 'Bitcoin' }, { symbol: 'wbtc', name: 'Wrapped Bitcoin' }, { symbol: 'BTC', name: 'Kopya' }] }
    expect(parseCoinSearch(coins, new Set(bases.keys()))).toEqual([{ symbol: 'BTC', name: 'Bitcoin', exchange: 'Binance' }])
    expect(parseYahooChart({ chart: { result: [{ meta: { currency: 'GBp', regularMarketPrice: 9050, regularMarketTime: 1791398430 } }] } })).toMatchObject({ price: 90.5, currency: 'GBP' })
  })
})
