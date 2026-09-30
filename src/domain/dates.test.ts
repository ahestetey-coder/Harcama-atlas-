import { describe, expect, it } from 'vitest'
import { addMonths, inferDateOrder, monthLabel, parseDate, todayIso } from './dates'

describe('Türkçe tarih ayrıştırma', () => {
  const d = (s: unknown, o?: Parameters<typeof parseDate>[1]) => {
    const r = parseDate(s, o)
    return r.ok ? r.date : `HATA:${r.reason}`
  }
  it('yaygın biçimleri takvim gününe çevirir', () => {
    expect(d('15.09.2026')).toBe('2026-09-15')
    expect(d('15/09/2026')).toBe('2026-09-15')
    expect(d('5.9.26')).toBe('2026-09-05')
    expect(d('2026-09-15')).toBe('2026-09-15')
    expect(d('15 Eylül 2026')).toBe('2026-09-15')
    expect(d('15 EYL 2026')).toBe('2026-09-15')
    expect(d('1 Şubat 2024')).toBe('2024-02-01')
    expect(d('15.09.2026 14:35')).toBe('2026-09-15')
  })
  it('geçersiz günleri reddeder', () => {
    expect(d('31.02.2026')).toBe('HATA:invalid')
    expect(d('13/13/2026')).toBe('HATA:invalid')
    expect(d('')).toBe('HATA:empty')
  })
  it('yılsız tarihte ekstre yılını kullanır ve bunu belirtir', () => {
    const r = parseDate('15.09', { fallbackYear: 2026 })
    expect(r.ok && r.date).toBe('2026-09-15')
    expect(r.ok && r.yearGuessed).toBe(true)
  })
  it('Excel UTC tarihlerinde gün kayması olmaz', () => {
    expect(d(new Date(Date.UTC(2026, 8, 30)))).toBe('2026-09-30')
    expect(d(new Date(Date.UTC(2026, 0, 1)))).toBe('2026-01-01')
  })
  it('bugünü yerel takvimden alır', () => {
    expect(todayIso(new Date(2026, 8, 30, 23, 59))).toBe('2026-09-30')
    expect(todayIso(new Date(2026, 9, 1, 0, 1))).toBe('2026-10-01')
  })
  it('gün/ay sırasını örneklerden çıkarır', () => {
    expect(inferDateOrder(['09/15/2026', '09/01/2026'])).toEqual({ order: 'mdy', evidence: true })
    expect(inferDateOrder(['15/09/2026'])).toEqual({ order: 'dmy', evidence: true })
    expect(inferDateOrder(['01/09/2026']).order).toBe('dmy')
    expect(d('09/15/2026', { order: 'mdy' })).toBe('2026-09-15')
  })
  it('ay geçişleri', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(monthLabel('2026-09')).toBe('Eylül 2026')
  })
})
