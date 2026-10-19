import { describe, expect, it } from 'vitest'
import { personalListView, personalView, settlementRangeText } from './personal'
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
const net = (txs: Transaction[]) => txs.reduce((s, t) => s + (t.type === 'expense' ? t.amountKurus : t.type === 'refund' ? -t.amountKurus : 0), 0) / 100
const settled = (shares: Record<string, number>, o: Partial<NonNullable<SpendGroup['settlements']>[number]> = {}) =>
  group({ settlements: [{ start: '2026-09-01', end: '2026-09-30', totalKurus: 100000, shares, createdBy: 'osman', createdAt: '2026-10-01T10:00:00Z', ...o }] })

describe('Tümü görünümü (kişisel)', () => {
  // Osman'ın cihazı: grupsuz 100, ortakta kendi 1000; Ayşe'nin ortaktaki 0
  const osmanTxs = [tx('2026-09-05', 100), tx('2026-09-10', 1000, { groupId: 'ortak', memberId: 'osman' }), tx('2026-09-12', 50, { groupId: 'ortak', memberId: 'ayse', source: 'shared' })]

  it('paylaşım yokken toplama yalnızca kendi eklediğiniz giderler girer; üyeninki listede görünür', () => {
    expect(net(personalView(osmanTxs, [group()], 'osman'))).toBe(1100)
    expect(personalListView(osmanTxs, [group()], 'osman').map((t) => t.amountKurus / 100)).toEqual([50, 1000, 100])
  })

  it('paylaşımdan sonra fazla ödeyene alacak, az ödeyene borç satırı eklenir', () => {
    const g = settled({ osman: 52500, ayse: 52500 }, { totalKurus: 105000 })
    const osman = personalView(osmanTxs, [g], 'osman')
    const alacak = osman.find((t) => t.source === 'settlement')!
    expect(alacak).toMatchObject({ type: 'refund', amountKurus: 47500, description: 'Ortak paylaşımı · alacak', date: '2026-09-30' })
    expect(alacak.note).toContain('1 – 30 Eylül 2026')
    expect(net(osman)).toBe(100 + 525) // kendi gideri yerinde kalır; ortak gider payı kadar yansır

    const ayseTxs = [tx('2026-09-20', 30), tx('2026-09-10', 1000, { groupId: 'ortak', memberId: 'osman', source: 'shared' }), tx('2026-09-12', 50, { groupId: 'ortak', memberId: 'ayse' })]
    const ayse = personalView(ayseTxs, [g], 'ayse')
    expect(ayse.find((t) => t.source === 'settlement')).toMatchObject({ type: 'expense', amountKurus: 47500, description: 'Ortak paylaşımı · borç' })
    expect(net(ayse)).toBe(30 + 525)
  })

  it('payınız kadar ödediyseniz satır eklenmez; dönem dışı giderler etkilenmez', () => {
    const g = settled({ osman: 100000 })
    expect(personalView(osmanTxs, [g], 'osman').some((t) => t.source === 'settlement')).toBe(false)
    const aug = settled({ ayse: 1000 }, { start: '2026-08-01', end: '2026-08-31' })
    expect(net(personalView(osmanTxs, [aug], 'osman'))).toBe(1100)
  })

  it('dönem bitmeden paylaştırılırsa satır paylaştırıldığı güne yazılır', () => {
    const g = settled({ osman: 500 }, { start: '2026-09-15', end: '2026-10-14', createdAt: '2026-10-02T10:00:00Z' })
    expect(personalView([], [g], 'osman')[0].date).toBe('2026-10-02')
    expect(settlementRangeText(g.settlements![0])).toBe('15 Eylül – 14 Ekim 2026')
  })
})
