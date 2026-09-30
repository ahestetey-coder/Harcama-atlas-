import { describe, expect, it } from 'vitest'
import { decideType, detectInstallment, isSummaryLine } from './classify'
import { descriptionsSimilar, findDuplicateMatches } from './duplicates'
import { normalizeText } from './normalize'
import type { Transaction } from './types'

describe('ekstre satırı sınıflandırma', () => {
  it('kart ödemesini transfer sayar', () => {
    expect(decideType('ÖDEMENİZ İÇİN TEŞEKKÜR EDERİZ', -500000).type).toBe('transfer')
    expect(decideType('Kredi Kartı Ödemesi', 500000).type).toBe('transfer')
  })
  it('iadeyi pozitif tutarla ve bir kez çıkarılacak şekilde saklar', () => {
    expect(decideType('ZARA İADE', -45000)).toMatchObject({ type: 'refund', amountKurus: 45000 })
    expect(decideType('ZARA İADE', 45000)).toMatchObject({ type: 'refund', amountKurus: 45000 })
    const credit = decideType('BILINMEYEN ALACAK', -1000)
    expect(credit.type).toBe('refund')
    expect(credit.warnings.length).toBe(1)
  })
  it('özet satırlarını işlem saymaz', () => {
    expect(isSummaryLine('Önceki Dönem Borcu')).toBeTruthy()
    expect(isSummaryLine('ASGARİ ÖDEME TUTARI')).toBeTruthy()
    expect(isSummaryLine('Kullanılabilir Limit')).toBeTruthy()
    expect(isSummaryLine('Dönem İçi Harcamalar Toplamı')).toBeTruthy()
    expect(isSummaryLine('MIGROS KADIKOY')).toBeNull()
  })
  it('taksiti bulur, tarihi taksit sanmaz', () => {
    expect(detectInstallment('TEKNOSA 3/12 TAKSİT')).toEqual({ current: 3, total: 12 })
    expect(detectInstallment('Taksit 2/6')).toEqual({ current: 2, total: 6 })
    expect(detectInstallment('MEDIA MARKT (3/12)')).toEqual({ current: 3, total: 12 })
    expect(detectInstallment('15/09/2026 MIGROS')).toBeNull()
    expect(detectInstallment('12/03 ABC')).toBeNull()
    expect(detectInstallment('MIGROS')).toBeNull()
  })
})

describe('tekrar kontrolü', () => {
  const base = (over: Partial<Transaction>): Transaction => ({
    id: 'e1',
    date: '2026-09-10',
    amountKurus: 12550,
    type: 'expense',
    description: 'MIGROS KADIKOY',
    normalizedDescription: normalizeText('MIGROS KADIKOY'),
    categoryId: 'cat-market',
    source: 'pdf',
    createdAt: '',
    updatedAt: '',
    ...over,
  })
  const cand = { date: '2026-09-10', amountKurus: 12550, type: 'expense' as const, description: 'MİGROS-MMM KADIKÖY', normalizedDescription: normalizeText('MİGROS-MMM KADIKÖY') }

  it('farklı dosyadaki aynı işlemi şüpheli bulur', () => {
    expect(findDuplicateMatches(cand, [base({})]).length).toBe(1)
  })
  it('aynı gün aynı tutarlı farklı iş yerini şüpheli saymaz', () => {
    expect(findDuplicateMatches({ ...cand, description: 'SHELL', normalizedDescription: 'SHELL' }, [base({})]).length).toBe(0)
  })
  it('manuel girilen kaydı ekstreden gelince yakalar (±1 gün)', () => {
    expect(findDuplicateMatches({ ...cand, date: '2026-09-11' }, [base({ source: 'manual', description: 'market alışverişi', normalizedDescription: 'MARKET ALISVERISI' })]).length).toBe(1)
  })
  it('farklı kart adlarında şüphe üretmez', () => {
    expect(findDuplicateMatches({ ...cand, accountAlias: 'Bonus' }, [base({ accountAlias: 'Maximum' })]).length).toBe(0)
  })
  it('açıklama benzerliği', () => {
    expect(descriptionsSimilar('STARBUCKS BAGDAT CAD', 'STARBUCKS 1234')).toBe(true)
    expect(descriptionsSimilar('STARBUCKS', 'KAHVE DUNYASI')).toBe(false)
  })
})
