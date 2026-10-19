import { formatDate } from './dates'
import { formatKurus } from './money'
import { normalizeText } from './normalize'
import type { GroupSettlement, SpendGroup, Transaction } from './types'

/**
 * "Tümü" görünümü kişiseldir.
 *
 *  - Toplamlara yalnızca kendi eklediğiniz giderler girer (ortak gruba eklenmiş olsa da).
 *  - Ortak gruba başka üyelerin eklediği giderler listede görünür ama toplamlara girmez.
 *  - Yönetici bir dönemi paylaştırdıysa, o dönemde ödediğinizle payınız arasındaki fark bir satır
 *    olarak eklenir: payınızdan fazla ödediyseniz alacak (gelir), az ödediyseniz borç (gider).
 *    Böylece o dönemin ortak gideri toplamınıza tam payınız kadar yansır.
 */
export function personalView(txs: Transaction[], groups: SpendGroup[], selfId: string | null): Transaction[] {
  const own = txs.filter((t) => isCounted(t) && t.source !== 'settlement')
  if (selfId)
    for (const g of groups) {
      if (!g.cloudId) continue
      for (const s of g.settlements ?? []) {
        const tx = settlementTx(g, s, selfId, paidIn(own, g.id, s))
        if (tx) own.push(tx)
      }
    }
  return sortTxs(own)
}

/** "Tümü" listesi: toplamlara girenler ve (bilgi için) üyelerin ortak giderleri. */
export function personalListView(txs: Transaction[], groups: SpendGroup[], selfId: string | null): Transaction[] {
  return sortTxs([...personalView(txs, groups, selfId), ...txs.filter((t) => t.source === 'shared')])
}

/** Bu işlem "Tümü" toplamlarına girer mi? (Üyelerin ortak giderleri girmez.) */
export function isCounted(t: Transaction): boolean {
  return t.source !== 'shared'
}

function sortTxs(txs: Transaction[]): Transaction[] {
  return txs.sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)))
}

/** Dönem içinde gruba kendi yaptığınız net harcama (gider − iade). */
function paidIn(own: Transaction[], groupId: string, s: GroupSettlement): number {
  let paid = 0
  for (const t of own)
    if (t.groupId === groupId && t.date >= s.start && t.date <= s.end) paid += t.type === 'expense' ? t.amountKurus : t.type === 'refund' ? -t.amountKurus : 0
  return paid
}

/** Paylaşımın fark satırı (pay − ödenen); fark yoksa null. */
export function settlementTx(g: SpendGroup, s: GroupSettlement, selfId: string, paidKurus: number): Transaction | null {
  const share = s.shares[selfId] ?? 0
  const diff = share - paidKurus
  if (diff === 0) return null
  // Satırın tarihi dönemin son günü; dönem bitmeden paylaştırıldıysa paylaştırıldığı gün
  const settledOn = s.createdAt.slice(0, 10)
  const date = settledOn < s.start ? s.start : settledOn < s.end ? settledOn : s.end
  const description = `${g.name} paylaşımı · ${diff > 0 ? 'borç' : 'alacak'}`
  return {
    id: `pay:${g.id}:${s.start}`,
    date,
    amountKurus: Math.abs(diff),
    type: diff > 0 ? 'expense' : 'refund',
    description,
    normalizedDescription: normalizeText(description),
    categoryId: null,
    groupId: g.id,
    memberId: selfId,
    note: `${settlementRangeText(s)} · payınız ${formatKurus(share)}, ödediğiniz ${formatKurus(paidKurus)} · toplam ${formatKurus(s.totalKurus)}, ${Object.keys(s.shares).length} kişi`,
    source: 'settlement',
    createdAt: s.createdAt,
    updatedAt: s.createdAt,
  }
}

/** "1 – 30 Eylül 2026", "15 Eylül – 14 Ekim 2026" */
export function settlementRangeText(s: Pick<GroupSettlement, 'start' | 'end'>): string {
  const a = formatDate(s.start, 'long')
  const b = formatDate(s.end, 'long')
  if (s.start.slice(0, 7) === s.end.slice(0, 7)) return `${Number(s.start.slice(8, 10))} – ${b}`
  return `${s.start.slice(0, 4) === s.end.slice(0, 4) ? a.replace(/ \d{4}$/, '') : a} – ${b}`
}

/** Görüntülenen döneme denk gelen paylaşım: aynı günde başlayan, yoksa dönemle çakışan ilk paylaşım. */
export function findSettlement(g: SpendGroup | undefined, range: { start: string; end: string }): GroupSettlement | undefined {
  const list = g?.settlements ?? []
  return list.find((s) => s.start === range.start) ?? list.find((s) => s.start <= range.end && s.end >= range.start)
}
