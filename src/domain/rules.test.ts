import { describe, expect, it } from 'vitest'
import { buildDefaultRules } from '../data/seed'
import { normalizeText } from './normalize'
import { evaluateRules, findRuleConflicts, PRIORITY, ruleMatches, validateRulePattern } from './rules'
import type { Rule } from './types'

const now = '2026-01-01T00:00:00.000Z'
const rule = (pattern: string, categoryId: string, extra: Partial<Rule> = {}): Rule => ({
  id: pattern + categoryId,
  pattern,
  matchMode: 'word',
  categoryId,
  priority: PRIORITY.default,
  enabled: true,
  origin: 'user',
  createdAt: now,
  updatedAt: now,
  ...extra,
})

describe('normalizasyon', () => {
  it('Türkçe harf, büyük/küçük harf ve boşlukları eşitler', () => {
    expect(normalizeText('  Migros   Ticaret A.Ş.  İstanbul ')).toBe('MIGROS TICARET A S ISTANBUL')
    expect(normalizeText('şok marketler')).toBe(normalizeText('ŞOK MARKETLER'))
    expect(normalizeText('Petrol Ofisi')).toBe('PETROL OFISI')
    expect(normalizeText('ıiIİ')).toBe('IIII')
  })
})

describe('kategori kuralları', () => {
  const defaults = buildDefaultRules(now)
  const categoryFor = (desc: string) => evaluateRules(defaults, normalizeText(desc)).winner?.rule.categoryId ?? null

  it('örnek iş yerlerini doğru kategoriye eşler', () => {
    expect(categoryFor('SHELL KADIKOY ISTANBUL')).toBe('cat-akaryakit')
    expect(categoryFor('OPET OTOYOL')).toBe('cat-akaryakit')
    expect(categoryFor('Petrol Ofisi Ataşehir')).toBe('cat-akaryakit')
    expect(categoryFor('MİGROS-MMM 1234 İSTANBUL')).toBe('cat-market')
    expect(categoryFor('MIGROSJET 45')).toBe('cat-market')
    expect(categoryFor('BİM A.Ş. 5021')).toBe('cat-market')
    expect(categoryFor('A101 YENİ MAĞAZACILIK')).toBe('cat-market')
    expect(categoryFor('ŞOK MARKETLER')).toBe('cat-market')
  })
  it('kısa kelimeler başka iş yeri adlarının içinde eşleşmez', () => {
    expect(categoryFor('BIMEKS BILGISAYAR')).toBeNull()
    expect(categoryFor('SOKAKTA KAHVE')).toBeNull()
    expect(categoryFor('BPX TEKNOLOJI')).toBeNull()
    expect(categoryFor('SHELLFISH RESTORAN')).toBe('cat-restoran')
  })
  it('tanınmayan iş yeri için tahmin yapmaz', () => {
    expect(categoryFor('XYZ DANISMANLIK LTD')).toBeNull()
  })
  it('kısa ifadelerle riskli eşleşme modlarını reddeder', () => {
    expect(validateRulePattern('BIM', 'contains')).toBeTruthy()
    expect(validateRulePattern('BIM', 'prefix')).toBeTruthy()
    expect(validateRulePattern('MIGROS', 'prefix')).toBeNull()
    expect(ruleMatches({ pattern: 'BIM', matchMode: 'contains' }, 'BIMEKS')).toBeNull()
  })
  it('öncelik → özgüllük → yaş sırasını uygular', () => {
    const rules = [
      rule('MIGROS', 'market'),
      rule('MIGROS KANGURU', 'eglence'),
      rule('KANGURU', 'bebek', { priority: PRIORITY.learned }),
    ]
    const ev = evaluateRules(rules, normalizeText('Migros Kanguru Oyun Alanı'))
    expect(ev.winner?.rule.categoryId).toBe('bebek')
    expect(ev.conflict).toBe(true)
    expect(ev.matches.map((m) => m.rule.categoryId)).toEqual(['bebek', 'eglence', 'market'])
    const ev2 = evaluateRules(rules.slice(0, 2), normalizeText('Migros Kanguru'))
    expect(ev2.winner?.rule.categoryId).toBe('eglence')
  })
  it('devre dışı kuralları atlar', () => {
    const ev = evaluateRules([rule('MIGROS', 'market', { enabled: false })], 'MIGROS')
    expect(ev.winner).toBeNull()
  })
  it('çakışan kuralları listeler', () => {
    const c = findRuleConflicts([rule('MIGROS', 'market'), rule('MIGROS', 'diger'), rule('MIGROS KANGURU', 'eglence'), rule('SHELL', 'akaryakit')])
    expect(c.length).toBe(3)
  })
})
