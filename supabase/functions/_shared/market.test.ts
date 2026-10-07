import { describe, expect, it } from 'vitest'
import { parseBinanceTicker, parseQuoteRequests, parseTefasHistory, parseYahooChart, tefasDate, toTl, yahooSymbol } from './market'

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
    const t = parseTefasHistory({ data: [{ TARIH: String(Date.UTC(2026, 9, 5, 21)), FIYAT: 1.2, FONUNVAN: 'Örnek Fon' }, { TARIH: String(Date.UTC(2026, 9, 6, 21)), FIYAT: 1.25, FONUNVAN: 'Örnek Fon' }] })
    expect(t).toEqual({ price: 1.25, currency: 'TRY', date: '2026-10-07', name: 'Örnek Fon', provider: 'TEFAS' })
    expect(parseTefasHistory({ data: [] })).toBeNull()
    expect(tefasDate(Date.UTC(2026, 9, 7, 12))).toBe('07.10.2026')
  })

  it('TL karşılığını kurla, altını gram başına hesaplar', () => {
    const rates = new Map([['USD', 49.2]])
    expect(toTl({ price: 10, currency: 'USD', date: '', name: null, provider: 'Yahoo Finance' }, 'us', rates)).toBeCloseTo(492)
    expect(toTl({ price: 286.25, currency: 'TRY', date: '', name: null, provider: 'Yahoo Finance' }, 'bist', rates)).toBe(286.25)
    expect(toTl({ price: 3110.34768, currency: 'USD', date: '', name: null, provider: 'Yahoo Finance' }, 'gold', rates)).toBeCloseTo(4920)
    expect(toTl({ price: 1, currency: 'CAD', date: '', name: null, provider: 'Yahoo Finance' }, 'us', rates)).toBeNull()
  })
})
