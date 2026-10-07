import { isSpending, type Transaction } from './types'

export interface SplitMember {
  id: string
  name: string
  color: string
}

export interface SplitShare extends SplitMember {
  /** Kişinin bu dönemde gruba yaptığı net harcama (gider − iade). */
  paidKurus: number
  /** Kişiye düşen pay. */
  shareKurus: number
  /** paid − share: artıysa alacaklı, eksiyse borçlu. */
  balanceKurus: number
  /** Paylaşıma katılıyor mu (seçili üyeler). */
  included: boolean
}

export interface SplitTransfer {
  fromId: string
  toId: string
  amountKurus: number
}

export interface SplitResult {
  totalKurus: number
  /** Eşit paylaşımda kişi başı pay; diğer yöntemlerde katılımcı ortalaması. */
  perPersonKurus: number
  people: SplitShare[]
  transfers: SplitTransfer[]
  /** Kural tutarsızsa (ör. yüzdeler 100 etmiyor) açıklama; paylar o zaman eşit dağıtılır. */
  error?: string
}

/** Plus gelişmiş paylaşım: yöntem ve katılımcılar. */
export type SplitMethod = 'equal' | 'percent' | 'weights' | 'amounts'

export const SPLIT_METHOD_LABEL: Record<SplitMethod, string> = {
  equal: 'Eşit',
  percent: 'Yüzde',
  weights: 'Ağırlık',
  amounts: 'Tutar',
}

export interface SplitRule {
  method: SplitMethod
  /** Katılan üyeler; boşsa (null) herkes. */
  participants: string[] | null
  /** percent: yüzde (toplam 100) · weights: pozitif katsayı · amounts: kuruş. */
  values: Record<string, number>
}

export const EQUAL_RULE: SplitRule = { method: 'equal', participants: null, values: {} }

/** Net harcamaları kişilere göre toplar. Üye bilgisi olmayan kayıtlar cihaz sahibinindir. */
function paidBy(members: SplitMember[], txs: Transaction[], selfId: string | null) {
  const paid = new Map<string, number>()
  const people = new Map(members.map((m) => [m.id, m]))
  for (const t of txs) {
    if (!isSpending(t)) continue
    const id = t.memberId ?? selfId ?? 'self'
    if (!people.has(id)) people.set(id, { id, name: 'Grup üyesi', color: '#94a3b8' })
    paid.set(id, (paid.get(id) ?? 0) + (t.type === 'expense' ? t.amountKurus : -t.amountKurus))
  }
  const list = [...people.values()]
  const total = list.reduce((s, m) => s + (paid.get(m.id) ?? 0), 0)
  return { paid, list, total }
}

/** Ağırlıklara göre tam kuruşlu paylar (en büyük kalan yöntemi; toplam korunur). */
function byWeights(total: number, ids: string[], weights: number[], tieOrder: string[]): Map<string, number> {
  const sum = weights.reduce((a, b) => a + b, 0)
  const raw = ids.map((id, i) => ({ id, exact: (total * weights[i]) / sum }))
  const out = new Map(raw.map((r) => [r.id, Math.floor(r.exact)]))
  let rest = total - [...out.values()].reduce((a, b) => a + b, 0)
  const frac = (x: number) => x - Math.floor(x)
  const order = [...raw].sort((a, b) => frac(b.exact) - frac(a.exact) || tieOrder.indexOf(a.id) - tieOrder.indexOf(b.id))
  for (const r of order) {
    if (rest <= 0) break
    out.set(r.id, out.get(r.id)! + 1)
    rest--
  }
  return out
}

/** Kurala göre paylar. Hata varsa eşit paylaşıma döner ve açıklamayı verir. */
export function sharesFor(total: number, allIds: string[], rule: SplitRule, tieOrder: string[] = allIds): { shares: Map<string, number>; error?: string } {
  const ids = rule.participants ? allIds.filter((id) => rule.participants!.includes(id)) : allIds
  const equal = () => byWeights(total, ids, ids.map(() => 1), tieOrder)
  if (ids.length === 0) return { shares: byWeights(total, allIds, allIds.map(() => 1), tieOrder), error: 'Paylaşıma en az bir kişi katılmalı.' }
  if (rule.method === 'equal') return { shares: equal() }
  const v = (id: string) => rule.values[id] ?? 0
  if (rule.method === 'percent') {
    const sum = ids.reduce((s, id) => s + v(id), 0)
    if (Math.abs(sum - 100) > 0.001) return { shares: equal(), error: `Yüzdelerin toplamı 100 olmalı (şu an ${sum.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}).` }
    return { shares: byWeights(total, ids, ids.map(v), tieOrder) }
  }
  if (rule.method === 'weights') {
    if (ids.some((id) => v(id) <= 0)) return { shares: equal(), error: 'Her katılımcının ağırlığı sıfırdan büyük olmalı.' }
    return { shares: byWeights(total, ids, ids.map(v), tieOrder) }
  }
  // amounts: tutarı girilmeyen katılımcılar kalanı eşit böler
  const fixed = ids.filter((id) => rule.values[id] != null)
  const free = ids.filter((id) => rule.values[id] == null)
  const fixedSum = fixed.reduce((s, id) => s + v(id), 0)
  const tl = (k: number) => `${(k / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`
  if (free.length === 0 && fixedSum !== total) return { shares: equal(), error: `Tutarların toplamı ${tl(total)} olmalı (şu an ${tl(fixedSum)}).` }
  if (fixedSum > total) return { shares: equal(), error: `Girilen tutarlar toplam gideri (${tl(total)}) aşıyor.` }
  const shares = new Map(fixed.map((id) => [id, v(id)]))
  if (free.length) for (const [id, s] of byWeights(total - fixedSum, free, free.map(() => 1), tieOrder)) shares.set(id, s)
  return { shares }
}

/** Paylara göre kimin kime ne ödeyeceği (en büyük borçlu en büyük alacaklıya; en az sayıda ödeme). */
function transfersOf(people: SplitShare[]): SplitTransfer[] {
  const debtors = people.filter((p) => p.balanceKurus < 0).map((p) => ({ id: p.id, amount: -p.balanceKurus }))
  const creditors = people.filter((p) => p.balanceKurus > 0).map((p) => ({ id: p.id, amount: p.balanceKurus }))
  debtors.sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id))
  creditors.sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id))
  const transfers: SplitTransfer[] = []
  let i = 0
  let j = 0
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount)
    if (amount > 0) transfers.push({ fromId: debtors[i].id, toId: creditors[j].id, amountKurus: amount })
    debtors[i].amount -= amount
    creditors[j].amount -= amount
    if (debtors[i].amount === 0) i++
    if (creditors[j].amount === 0) j++
  }
  return transfers
}

function build(list: SplitMember[], paid: Map<string, number>, total: number, shares: Map<string, number>, included: (id: string) => boolean, error?: string): SplitResult {
  const people: SplitShare[] = list.map((m) => {
    const p = paid.get(m.id) ?? 0
    const s = shares.get(m.id) ?? 0
    return { ...m, paidKurus: p, shareKurus: s, balanceKurus: p - s, included: included(m.id) }
  })
  const transfers = transfersOf(people)
  people.sort((a, b) => b.balanceKurus - a.balanceKurus || a.name.localeCompare(b.name, 'tr'))
  const n = people.filter((p) => p.included).length
  return { totalKurus: total, perPersonKurus: n ? Math.floor(total / n) : 0, people, transfers, error }
}

/**
 * Ortak grubun giderini kurala göre böler (eşit, yüzde, ağırlık veya tutar; seçili üyeler).
 * Kart ödemesi/transfer sayılmaz; iadeler ödeyenin harcamasından düşer. Listede olmayan ama harcaması
 * olan kişi de listeye girer. Kuruş artıkları en çok ödeyenden başlayarak dağıtılır.
 */
export function splitBy(members: SplitMember[], txs: Transaction[], selfId: string | null, rule: SplitRule): SplitResult {
  const { paid, list, total } = paidBy(members, txs, selfId)
  if (list.length === 0) return { totalKurus: 0, perPersonKurus: 0, people: [], transfers: [] }
  const tieOrder = [...list].sort((a, b) => (paid.get(b.id) ?? 0) - (paid.get(a.id) ?? 0) || a.id.localeCompare(b.id)).map((m) => m.id)
  const { shares, error } = sharesFor(total, list.map((m) => m.id), rule, tieOrder)
  const noneSelected = !!rule.participants && !list.some((m) => rule.participants!.includes(m.id))
  return build(list, paid, total, shares, (id) => noneSelected || !rule.participants || rule.participants.includes(id), error)
}

export function splitEqually(members: SplitMember[], txs: Transaction[], selfId: string | null): SplitResult {
  return splitBy(members, txs, selfId, EQUAL_RULE)
}

/** Kayıtlı paylarla (yöneticinin paylaştırması) sonuç: ödenenler canlı, paylar sabit. */
export function splitWithShares(members: SplitMember[], txs: Transaction[], selfId: string | null, shares: Record<string, number>): SplitResult {
  const { paid, list, total } = paidBy(members, txs, selfId)
  for (const id of Object.keys(shares)) if (!list.some((m) => m.id === id)) list.push({ id, name: 'Grup üyesi', color: '#94a3b8' })
  return build(list, paid, total, new Map(Object.entries(shares)), (id) => (shares[id] ?? 0) > 0)
}

/** Kaydedilmiş paylar eşit paylaşım mı? (Kural bilinmiyorsa başlangıç yöntemini seçmek için.) */
export function isEqualShares(shares: Record<string, number>): boolean {
  const v = Object.values(shares)
  return v.length > 0 && Math.min(...v) > 0 && Math.max(...v) - Math.min(...v) <= 1
}
