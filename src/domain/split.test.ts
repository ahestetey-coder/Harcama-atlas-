import { describe, expect, it } from 'vitest'
import { isEqualShares, splitBy, splitEqually, splitWithShares } from './split'
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

describe('gelişmiş paylaşım', () => {
  const txs = () => [tx(600, 'a'), tx(400, 'b')]
  it('yüzdeye göre böler', () => {
    const r = splitBy([M('a'), M('b'), M('c')], txs(), null, { method: 'percent', participants: null, values: { a: 50, b: 30, c: 20 } })
    expect(Object.fromEntries(r.people.map((p) => [p.id, p.shareKurus]))).toEqual({ a: 50000, b: 30000, c: 20000 })
    expect(r.transfers).toEqual([
      { fromId: 'c', toId: 'a', amountKurus: 10000 },
      { fromId: 'c', toId: 'b', amountKurus: 10000 },
    ])
  })
  it('yüzdeler 100 etmezse uyarır ve eşit böler', () => {
    const r = splitBy([M('a'), M('b')], txs(), null, { method: 'percent', participants: null, values: { a: 70, b: 20 } })
    expect(r.error).toContain('100')
    expect(r.people.every((p) => p.shareKurus === 50000)).toBe(true)
  })
  it('ağırlıkla ve yalnızca seçili üyelerle böler; kuruş kaybolmaz', () => {
    const r = splitBy([M('a'), M('b'), M('c')], [tx(100, 'a')], null, { method: 'weights', participants: ['a', 'b'], values: { a: 2, b: 1 } })
    const s = Object.fromEntries(r.people.map((p) => [p.id, p.shareKurus]))
    expect(s).toEqual({ a: 6667, b: 3333, c: 0 })
    expect(r.people.find((p) => p.id === 'c')!.included).toBe(false)
  })
  it('tutarla böler; tutarı girilmeyen kalanı paylaşır', () => {
    const r = splitBy([M('a'), M('b'), M('c')], txs(), null, { method: 'amounts', participants: null, values: { a: 20000 } })
    expect(Object.fromEntries(r.people.map((p) => [p.id, p.shareKurus]))).toEqual({ a: 20000, b: 40000, c: 40000 })
    const bad = splitBy([M('a'), M('b')], txs(), null, { method: 'amounts', participants: null, values: { a: 20000, b: 20000 } })
    expect(bad.error).toContain('1.000,00')
  })
  it('kayıtlı paylarla hesaplar', () => {
    const r = splitWithShares([M('a'), M('b')], txs(), null, { a: 70000, b: 30000 })
    expect(r.transfers).toEqual([{ fromId: 'a', toId: 'b', amountKurus: 10000 }])
    expect(isEqualShares({ a: 50000, b: 50000 })).toBe(true)
    expect(isEqualShares({ a: 70000, b: 30000 })).toBe(false)
  })
})
