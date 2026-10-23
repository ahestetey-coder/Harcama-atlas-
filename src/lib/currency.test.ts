import { afterEach, describe, expect, it, vi } from 'vitest'
import { curText, initCurrency } from './currency'
import { formatKurus, formatKurusCompact, formatWhole, parseUserAmount } from '../domain/money'

const store = new Map<string, string>()
vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) })

describe('ana para birimi', () => {
  afterEach(() => {
    localStorage.removeItem('ha:para')
    initCurrency('tr')
  })

  it('İngilizcede varsayılan USD; tutarlar $ ve İngilizce sayı biçimiyle', () => {
    localStorage.removeItem('ha:para')
    expect(initCurrency('en')).toBe('USD')
    expect(formatKurus(123456)).toBe('$1,234.56')
    expect(formatKurus(-5000)).toBe('-$50.00')
    expect(formatWhole(1765000)).toBe('$17,650')
    expect(formatKurusCompact(1234567)).toBe('$12.3K')
    expect(formatKurusCompact(250000000)).toBe('$2.5M')
    const p = parseUserAmount('1,234.50')
    expect(p.ok && p.kurus).toBe(123450)
    expect(curText('Amount (TL)')).toBe('Amount ($)')
    expect(curText('₺{0}/month')).toBe('${0}/month')
  })

  it('Türkçede TL kalır; kayıtlı seçim dilden önce gelir', () => {
    localStorage.removeItem('ha:para')
    expect(initCurrency('tr')).toBe('TRY')
    expect(formatKurus(123456)).toBe('1.234,56 ₺')
    expect(curText('Tutar (TL)')).toBe('Tutar (TL)')
    localStorage.setItem('ha:para', 'TRY')
    expect(initCurrency('en')).toBe('TRY')
  })
})
