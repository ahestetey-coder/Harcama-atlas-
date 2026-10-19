import { diffDays } from './dates'
import { merchantKey, tokenize } from './normalize'
import type { Transaction, TxType } from './types'

export interface DuplicateCandidate {
  date: string
  amountKurus: number
  type: TxType
  normalizedDescription: string
  description: string
  accountAlias?: string
}

/**
 * Açıklama benzerliği: aynı normalize metin, aynı iş yeri anahtarı
 * veya anlamlı kelimelerin çoğunluğunun ortak olması.
 */
export function descriptionsSimilar(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  const ka = merchantKey(a)
  const kb = merchantKey(b)
  if (ka && kb && (ka === kb || ka.split(' ')[0] === kb.split(' ')[0])) return true
  const ta = new Set(tokenize(a).filter((t) => t.length > 2 && !/^\d+$/.test(t)))
  const tb = new Set(tokenize(b).filter((t) => t.length > 2 && !/^\d+$/.test(t)))
  if (!ta.size || !tb.size) return false
  let common = 0
  for (const t of ta) if (tb.has(t)) common++
  return common / Math.min(ta.size, tb.size) >= 0.6
}

/**
 * Mevcut kayıtlar arasında tekrar şüphesi taşıyanları bulur. Kayıtları asla otomatik silmez;
 * sonuç kullanıcıya yan yana gösterilir.
 * - İçe aktarılmış kayıtlar: aynı gün, aynı tutar, aynı tür ve benzer açıklama.
 * - Manuel kayıtlar: açıklama serbest yazıldığı için ±1 gün ve aynı tutar yeterli sayılır.
 * - Her iki tarafta kart/hesap adı varsa ve farklıysa şüphe yok.
 */
export function findDuplicateMatches(candidate: DuplicateCandidate, existing: Transaction[]): Transaction[] {
  const out: Transaction[] = []
  for (const t of existing) {
    if (t.amountKurus !== candidate.amountKurus) continue
    if (t.type !== candidate.type) continue
    if (candidate.accountAlias && t.accountAlias && normalizeAlias(candidate.accountAlias) !== normalizeAlias(t.accountAlias)) continue
    const dd = Math.abs(diffDays(t.date, candidate.date))
    if (t.source === 'manual' || t.source === 'demo') {
      if (dd <= 1) out.push(t)
      continue
    }
    if (dd === 0 && descriptionsSimilar(t.normalizedDescription, candidate.normalizedDescription)) out.push(t)
  }
  return out
}

function normalizeAlias(s: string): string {
  return s.trim().toLocaleLowerCase('tr-TR')
}
