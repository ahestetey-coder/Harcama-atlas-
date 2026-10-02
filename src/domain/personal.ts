import { formatDate } from './dates'
import { formatKurus } from './money'
import { normalizeText } from './normalize'
import type { GroupSettlement, SpendGroup, Transaction } from './types'

/**
 * "Tümü" görünümü: hesabın kendi harcaması.
 *
 *  - Ortak gruba başka üyelerin eklediği giderler sayılmaz.
 *  - Kendi eklediğiniz giderler, gruba eklenmiş olsa da sayılır.
 *  - Yönetici bir dönemi paylaştırdıysa o dönem için grubun giderleri yerine yalnızca size düşen
 *    pay sayılır ("<Grup> payı" satırı).
 */
export function personalView(txs: Transaction[], groups: SpendGroup[], selfId: string | null): Transaction[] {
  const settled = groups.filter((g) => g.cloudId && g.settlements?.length)
  const isSettled = (t: Transaction) => settled.some((g) => t.groupId === g.id && g.settlements!.some((s) => t.date >= s.start && t.date <= s.end))
  const out = txs.filter((t) => t.source !== 'shared' && t.source !== 'settlement' && !isSettled(t))
  if (selfId) for (const g of settled) for (const s of g.settlements!) {
    const tx = settlementTx(g, s, selfId)
    if (tx) out.push(tx)
  }
  return out.sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)))
}

/** Paylaşımda size düşen payın satırı; payınız yoksa null. */
export function settlementTx(g: SpendGroup, s: GroupSettlement, selfId: string): Transaction | null {
  const share = s.shares[selfId] ?? 0
  if (share <= 0) return null
  // Payın tarihi dönemin son günü; dönem bitmeden paylaştırıldıysa paylaştırıldığı gün
  const settledOn = s.createdAt.slice(0, 10)
  const date = settledOn < s.start ? s.start : settledOn < s.end ? settledOn : s.end
  const description = `${g.name} payı`
  const people = Object.keys(s.shares).length
  return {
    id: `pay:${g.id}:${s.start}`,
    date,
    amountKurus: share,
    type: 'expense',
    description,
    normalizedDescription: normalizeText(description),
    categoryId: null,
    groupId: g.id,
    memberId: selfId,
    note: `${settlementRangeText(s)} dönemi paylaştırıldı · toplam ${formatKurus(s.totalKurus)} · ${people} kişi`,
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

/** Grubun belirtilen dönemi başlatan paylaşımı. */
export function findSettlement(g: SpendGroup | undefined, start: string): GroupSettlement | undefined {
  return g?.settlements?.find((s) => s.start === start)
}
