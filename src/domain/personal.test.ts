import { describe, expect, it } from 'vitest'
import { personalView, settlementRangeText } from './personal'
import type { SpendGroup, Transaction } from './types'

let seq = 0
const tx = (date: string, lira: number, o: Partial<Transaction> = {}): Transaction => ({
  id: `t${++seq}`,
  date,
  amountKurus: Math.round(lira * 100),
  type: 'expense',
  description: 'X',
  normalizedDescription: 'X',
  categoryId: null,
  source: 'manual',
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  ...o,
})
const group = (o: Partial<SpendGroup> = {}): SpendGroup => ({
  id: 'ortak',
  name: 'Ortak',
  color: '#000',
  cloudId: 'c1',
  cloudOwnerId: 'osman',
  archived: false,
  order: 0,
  createdAt: '',
  updatedAt: '',
  ...o,
})
const sum = (txs: Transaction[]) => txs.reduce((s, t) => s + t.amountKurus, 0) / 100

describe('Tümü görünümü (kişisel)', () => {
  const txs = [
    tx('2026-09-05', 100), // grupsuz, kendi
    tx('2026-09-10', 600, { groupId: 'ortak', memberId: 'osman' }), // ortakta kendi
    tx('2026-09-12', 400, { groupId: 'ortak', memberId: 'ayse', source: 'shared' }), // üyenin
  ]

  it('paylaşım yokken üyelerin giderini saymaz, kendi eklediklerinizi sayar', () => {
    const v = personalView(txs, [group()], 'osman')
    expect(v.map((t) => t.amountKurus / 100)).toEqual([600, 100])
  })

  it('paylaştırılan dönemde grubun giderleri yerine yalnızca payınız sayılır', () => {
    const g = group({ settlements: [{ start: '2026-09-01', end: '2026-09-30', totalKurus: 100000, shares: { osman: 50000, ayse: 50000 }, createdBy: 'osman', createdAt: '2026-10-01T10:00:00Z' }] })
    const osman = personalView(txs, [g], 'osman')
    expect(sum(osman)).toBe(600)
    const pay = osman.find((t) => t.source === 'settlement')!
    expect(pay).toMatchObject({ description: 'Ortak payı', amountKurus: 50000, date: '2026-09-30', groupId: 'ortak' })
    expect(pay.note).toContain('1 – 30 Eylül 2026')
    // Üye: kendi eklediği yok; payı ekstra gider olarak gelir
    const ayseTxs = txs.filter((t) => t.groupId).map((t) => ({ ...t, source: t.memberId === 'osman' ? ('shared' as const) : ('manual' as const) }))
    const ayse = personalView([tx('2026-09-20', 30), ...ayseTxs], [g], 'ayse')
    expect(ayse.map((t) => [t.description, t.amountKurus / 100])).toEqual([
      ['Ortak payı', 500],
      ['X', 30],
    ])
  })

  it('dönem dışındaki ortak giderleriniz ve payı olmayan paylaşımlar etkilenmez', () => {
    const g = group({ settlements: [{ start: '2026-08-01', end: '2026-08-31', totalKurus: 1000, shares: { ayse: 1000 }, createdBy: 'osman', createdAt: '2026-09-01T10:00:00Z' }] })
    const v = personalView(txs, [g], 'osman')
    expect(sum(v)).toBe(700)
    expect(v.some((t) => t.source === 'settlement')).toBe(false)
  })

  it('dönem bitmeden paylaştırılırsa pay, paylaştırıldığı güne yazılır', () => {
    const g = group({ settlements: [{ start: '2026-09-15', end: '2026-10-14', totalKurus: 1000, shares: { osman: 500 }, createdBy: 'osman', createdAt: '2026-10-02T10:00:00Z' }] })
    expect(personalView([], [g], 'osman')[0].date).toBe('2026-10-02')
    expect(settlementRangeText(g.settlements![0])).toBe('15 Eylül – 14 Ekim 2026')
  })
})
