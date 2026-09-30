import { describe, expect, it } from 'vitest'
import { formatKurus, inferNumberFormat, parseAmount } from './money'

const ok = (s: string, hint?: 'tr' | 'en' | 'auto') => {
  const r = parseAmount(s, hint)
  if (!r.ok) throw new Error(`beklenmedik hata: ${s} → ${r.message}`)
  return r.kurus
}

describe('Türkçe tutar ayrıştırma', () => {
  it('1.234,56 biçimini kuruşa çevirir', () => {
    expect(ok('1.234,56')).toBe(123456)
    expect(ok('12.345.678,90')).toBe(1234567890)
    expect(ok('0,99')).toBe(99)
    expect(ok('150')).toBe(15000)
    expect(ok('150,5')).toBe(15050)
  })
  it('para birimi ve işaretleri tanır', () => {
    expect(ok('1.234,56 TL')).toBe(123456)
    expect(ok('₺ 99,90')).toBe(9990)
    expect(ok('-150,00')).toBe(-15000)
    expect(ok('150,00-')).toBe(-15000)
    expect(ok('(150,00)')).toBe(-15000)
    expect(ok('+150,00')).toBe(15000)
    expect(ok('1 234,56')).toBe(123456)
    const r = parseAmount('25,00 USD')
    expect(r.ok && r.currency).toBe('USD')
  })
  it('İngilizce biçimi açıkça notla kabul eder', () => {
    const r = parseAmount('1,234.56')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.kurus).toBe(123456)
      expect(r.note).toBeTruthy()
    }
  })
  it('belirsiz biçimleri sessizce yorumlamaz', () => {
    const r = parseAmount('1.234')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('ambiguous')
      expect(r.candidates).toEqual([123400, 123])
    }
    expect(parseAmount('12,345').ok).toBe(false)
  })
  it('sütun ipucuyla belirsizliği çözer', () => {
    expect(ok('1.234', 'tr')).toBe(123400)
    expect(ok('1,234', 'en')).toBe(123400)
  })
  it('geçersiz metinleri reddeder', () => {
    expect(parseAmount('abc').ok).toBe(false)
    expect(parseAmount('1.234,567').ok).toBe(false)
    expect(parseAmount('').ok).toBe(false)
    expect(parseAmount('1.23.4').ok).toBe(false)
  })
  it('sütun biçimini örneklerden çıkarır', () => {
    expect(inferNumberFormat(['1.234,56', '12,00', '1.234'])).toBe('tr')
    expect(inferNumberFormat(['1,234.56', '12.00'])).toBe('en')
    expect(inferNumberFormat(['1.234', '5.678'])).toBe('auto')
    expect(inferNumberFormat(['150', '200'])).toBe('auto')
  })
  it('kuruşu Türkçe biçimde gösterir', () => {
    expect(formatKurus(123456)).toBe('1.234,56 ₺')
    expect(formatKurus(-5)).toBe('-0,05 ₺')
    expect(formatKurus(100000000)).toBe('1.000.000,00 ₺')
  })
})
