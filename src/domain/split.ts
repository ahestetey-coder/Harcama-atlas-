import type { Transaction } from './types'

export interface SplitMember {
  id: string
  name: string
  color: string
}

export interface SplitShare extends SplitMember {
  /** Kişinin bu dönemde gruba yaptığı net harcama (gider − iade). */
  paidKurus: number
  /** Eşit paylaşımda düşen pay. */
  shareKurus: number
  /** paid − share: artıysa alacaklı, eksiyse borçlu. */
  balanceKurus: number
}

export interface SplitTransfer {
  fromId: string
  toId: string
  amountKurus: number
}

export interface SplitResult {
  totalKurus: number
  /** Kişi başı pay (kuruş artığı ilk kişilere birer kuruş eklenir). */
  perPersonKurus: number
  people: SplitShare[]
  transfers: SplitTransfer[]
}

/**
 * Ortak grubun giderini üyelere eşit böler ve kimin kime ne ödemesi gerektiğini hesaplar.
 * Kart ödemesi/transfer sayılmaz; iadeler ödeyenin harcamasından düşer. Üye bilgisi olmayan
 * kayıtlar cihaz sahibinindir. Listede olmayan ama harcaması olan kişi de paylaşıma katılır.
 */
export function splitEqually(members: SplitMember[], txs: Transaction[], selfId: string | null): SplitResult {
  const paid = new Map<string, number>()
  const people = new Map(members.map((m) => [m.id, m]))
  for (const t of txs) {
    if (t.type === 'transfer') continue
    const id = t.memberId ?? selfId ?? 'self'
    if (!people.has(id)) people.set(id, { id, name: 'Grup üyesi', color: '#94a3b8' })
    paid.set(id, (paid.get(id) ?? 0) + (t.type === 'expense' ? t.amountKurus : -t.amountKurus))
  }
  const list = [...people.values()]
  const n = list.length
  const total = list.reduce((s, m) => s + (paid.get(m.id) ?? 0), 0)
  if (n === 0) return { totalKurus: 0, perPersonKurus: 0, people: [], transfers: [] }

  const base = Math.floor(total / n)
  let rest = total - base * n
  // Kuruş artığı en çok ödeyenden başlayarak dağıtılır (ödeme yapan biraz fazla pay alır, kimse kuruş kaybetmez)
  const order = [...list].sort((a, b) => (paid.get(b.id) ?? 0) - (paid.get(a.id) ?? 0) || a.id.localeCompare(b.id))
  const share = new Map(order.map((m) => [m.id, base + (rest-- > 0 ? 1 : 0)]))

  const result: SplitShare[] = list.map((m) => {
    const p = paid.get(m.id) ?? 0
    const s = share.get(m.id)!
    return { ...m, paidKurus: p, shareKurus: s, balanceKurus: p - s }
  })

  // En büyük borçlu en büyük alacaklıya öder; en az sayıda ödemeyle denkleşir.
  const debtors = result.filter((p) => p.balanceKurus < 0).map((p) => ({ id: p.id, amount: -p.balanceKurus }))
  const creditors = result.filter((p) => p.balanceKurus > 0).map((p) => ({ id: p.id, amount: p.balanceKurus }))
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

  result.sort((a, b) => b.balanceKurus - a.balanceKurus || a.name.localeCompare(b.name, 'tr'))
  return { totalKurus: total, perPersonKurus: base, people: result, transfers }
}
