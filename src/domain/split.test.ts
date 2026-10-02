import { describe, expect, it } from 'vitest'
import { splitEqually } from './split'
import type { Transaction } from './types'

let seq = 0
const tx = (lira: number, memberId: string | undefined, type: Transaction['type'] = 'expense'): Transaction => ({
  id: String(++seq),
  date: '2026-10-01',
  amountKurus: Math.round(lira * 100),
  type,
  description: 'X',
  normalizedDescription: 'X',
  categoryId: null,
  memberId,
  source: memberId ? 'shared' : 'manual',
  createdAt: '',
  updatedAt: '',
})
const M = (id: string) => ({ id, name: id, color: '#000' })

describe('gideri eşit paylaştırma', () => {
  it('toplamı üye sayısına böler ve borçluyu alacaklıya yönlendirir', () => {
    const r = splitEqually([M('ben'), M('ayse')], [tx(300, undefined), tx(100, 'ayse')], 'ben')
    expect(r.totalKurus).toBe(40000)
    expect(r.perPersonKurus).toBe(20000)
    expect(r.people.map((p) => [p.id, p.paidKurus, p.balanceKurus])).toEqual([
      ['ben', 30000, 10000],
      ['ayse', 10000, -10000],
    ])
    expect(r.transfers).toEqual([{ fromId: 'ayse', toId: 'ben', amountKurus: 10000 }])
  })

  it('hiç harcaması olmayan üye de payını öder; transfer ve iade doğru sayılır', () => {
    const r = splitEqually([M('a'), M('b'), M('c')], [tx(90, 'a'), tx(1000, 'b', 'transfer'), tx(30, 'a', 'refund')], null)
    expect(r.totalKurus).toBe(6000)
    expect(r.people.find((p) => p.id === 'c')).toMatchObject({ paidKurus: 0, shareKurus: 2000, balanceKurus: -2000 })
    expect(r.transfers).toEqual([
      { fromId: 'b', toId: 'a', amountKurus: 2000 },
      { fromId: 'c', toId: 'a', amountKurus: 2000 },
    ])
  })

  it('kuruş artığını kaybetmez: paylar toplamı tam toplama eşittir', () => {
    const r = splitEqually([M('a'), M('b'), M('c')], [tx(100, 'a')], null)
    expect(r.people.reduce((s, p) => s + p.shareKurus, 0)).toBe(10000)
    expect(r.people.reduce((s, p) => s + p.balanceKurus, 0)).toBe(0)
    expect(r.transfers.reduce((s, t) => s + t.amountKurus, 0)).toBe(6666)
  })

  it('herkes eşit ödediyse transfer yoktur', () => {
    const r = splitEqually([M('a'), M('b')], [tx(50, 'a'), tx(50, 'b')], null)
    expect(r.transfers).toEqual([])
  })
})
