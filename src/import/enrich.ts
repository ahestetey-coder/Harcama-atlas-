import { findDuplicateMatches } from '../domain/duplicates'
import { merchantKey, normalizeText } from '../domain/normalize'
import { evaluateRules } from '../domain/rules'
import type { Category, ImportFileKind, ImportRecord, Rule, Transaction, TxSource } from '../domain/types'
import type { ImportCommit, LearnRuleRequest } from '../data/repository'
import { OTHER_CATEGORY_ID } from '../data/seed'
import type { DraftRow, RowProblem, RowStatus } from './types'

/** Kategorisi olmayan satırlara kural önerisi uygular. Tanınmayan iş yeri için tahmin yapmaz. */
export function applyRules(rows: DraftRow[], rules: Rule[], categories: Category[]): DraftRow[] {
  const byId = new Map(categories.map((c) => [c.id, c]))
  return rows.map((r) => {
    if (r.categorySource === 'manual' || r.categorySource === 'confirmed-other' || r.categorySource === 'file') return r
    const ev = evaluateRules(rules, normalizeText(r.description))
    if (!ev.winner) return { ...r, categoryId: null, categorySource: undefined, ruleNote: undefined, ruleConflict: undefined }
    const cat = byId.get(ev.winner.rule.categoryId)
    const others = ev.matches.filter((m) => m.rule.categoryId !== ev.winner!.rule.categoryId)
    return {
      ...r,
      categoryId: cat && !cat.archived ? cat.id : null,
      categorySource: cat && !cat.archived ? 'rule' : undefined,
      ruleNote: `Kural: "${ev.winner.rule.pattern}" (öncelik ${ev.winner.rule.priority})`,
      ruleConflict: ev.conflict
        ? `Çakışma: ${others.map((m) => `"${m.rule.pattern}" → ${byId.get(m.rule.categoryId)?.name ?? '?'} (öncelik ${m.rule.priority})`).join(', ')} de eşleşti; öncelik sırasına göre ${cat?.name ?? '?'} seçildi.`
        : undefined,
    }
  })
}

/** Mevcut kayıtlarla ve dosya içinde tekrar şüphelerini işaretler. */
export function markDuplicates(rows: DraftRow[], existing: Transaction[], accountAlias?: string): DraftRow[] {
  const seen = new Map<string, number>()
  return rows.map((r) => {
    if (!r.date || r.amountKurus === null) return { ...r, duplicateOf: undefined }
    const matches = findDuplicateMatches(
      {
        date: r.date,
        amountKurus: r.amountKurus,
        type: r.type,
        description: r.description,
        normalizedDescription: normalizeText(r.description),
        accountAlias,
      },
      existing,
    )
    const key = `${r.date}|${r.amountKurus}|${r.type}|${normalizeText(r.description)}`
    const n = (seen.get(key) ?? 0) + 1
    seen.set(key, n)
    return {
      ...r,
      duplicateOf: matches.length ? matches.map((m) => m.id) : undefined,
      duplicateDecision: matches.length ? (r.duplicateDecision ?? null) : undefined,
      inFileDuplicate: n > 1 || undefined,
    }
  })
}

export function rowProblems(r: DraftRow, activeCategoryIds: Set<string>): RowProblem[] {
  const p: RowProblem[] = []
  if (!r.date) p.push({ field: 'date', message: 'Tarih eksik veya okunamadı.' })
  if (r.amountKurus === null) {
    if (r.foreign) p.push({ field: 'currency', message: `Döviz tutarı (${r.foreign.currency}): TL karşılığını girin.` })
    else if (r.amountCandidates) p.push({ field: 'amount', message: 'Tutar biçimi belirsiz: doğru değeri seçin.' })
    else p.push({ field: 'amount', message: 'Tutar eksik veya okunamadı.' })
  } else if (r.amountKurus <= 0) p.push({ field: 'amount', message: 'Tutar sıfırdan büyük olmalı.' })
  if (!r.description.trim()) p.push({ field: 'description', message: 'Açıklama eksik.' })
  if (r.type === 'expense') {
    if (!r.categoryId) p.push({ field: 'category', message: 'Kategori seçilmeli.' })
    else if (!activeCategoryIds.has(r.categoryId)) p.push({ field: 'category', message: 'Seçilen kategori arşivde veya silinmiş.' })
  }
  return p
}

export function rowStatus(r: DraftRow, activeCategoryIds: Set<string>): RowStatus {
  if (!r.include || r.duplicateDecision === 'skip') return 'excluded'
  if (rowProblems(r, activeCategoryIds).length) return 'problem'
  if (r.duplicateOf?.length && r.duplicateDecision !== 'keep') return 'duplicate'
  return 'valid'
}

export interface ReviewCounts {
  total: number
  valid: number
  problem: number
  duplicate: number
  excluded: number
  expenseKurus: number
  refundKurus: number
  transferKurus: number
}

export function reviewCounts(rows: DraftRow[], activeCategoryIds: Set<string>): ReviewCounts {
  const c: ReviewCounts = { total: rows.length, valid: 0, problem: 0, duplicate: 0, excluded: 0, expenseKurus: 0, refundKurus: 0, transferKurus: 0 }
  for (const r of rows) {
    const s = rowStatus(r, activeCategoryIds)
    c[s]++
    if (s === 'valid' && r.amountKurus) {
      if (r.type === 'expense') c.expenseKurus += r.amountKurus
      else if (r.type === 'refund') c.refundKurus += r.amountKurus
      else c.transferKurus += r.amountKurus
    }
  }
  return c
}

export function confirmOther(r: DraftRow): DraftRow {
  return { ...r, categoryId: OTHER_CATEGORY_ID, categorySource: 'confirmed-other' }
}

export function suggestLearnPattern(description: string): string {
  return merchantKey(description) || normalizeText(description).split(' ').slice(0, 2).join(' ')
}

const KIND_SOURCE: Record<ImportFileKind, TxSource> = { pdf: 'pdf', csv: 'csv', xlsx: 'xlsx', image: 'image' }

/**
 * Yalnızca geçerli satırlardan (dahil, sorunsuz, tekrar kararı "ayrı işlem") kayıt paketi üretir.
 * Sorunlu satırlar hiçbir koşulda pakete girmez.
 */
export function buildCommit(opts: {
  importId: string
  rows: DraftRow[]
  activeCategoryIds: Set<string>
  file: { name: string; kind: ImportFileKind; size: number; hash: string }
  parserId?: string
  accountAlias?: string
  paymentMethod?: Transaction['paymentMethod']
  isDemo: boolean
}): ImportCommit {
  const now = new Date().toISOString()
  const valid = opts.rows.filter((r) => rowStatus(r, opts.activeCategoryIds) === 'valid')
  const txs: Transaction[] = valid.map((r) => ({
    id: r.id,
    date: r.date!,
    amountKurus: r.amountKurus!,
    type: r.type,
    description: r.description.trim(),
    normalizedDescription: normalizeText(r.description),
    categoryId: r.categoryId,
    categorySource: r.categorySource ?? 'manual',
    source: opts.isDemo ? 'demo' : KIND_SOURCE[opts.file.kind],
    importId: opts.importId,
    installment: r.installment,
    foreign: r.foreign,
    accountAlias: opts.accountAlias?.trim() || undefined,
    paymentMethod: opts.paymentMethod,
    createdAt: now,
    updatedAt: now,
  }))
  const learnedRules: LearnRuleRequest[] = valid
    .filter((r) => r.learn && r.categoryId && r.learnPattern?.trim())
    .map((r) => ({ pattern: r.learnPattern!.trim(), categoryId: r.categoryId! }))
  const record: ImportRecord = {
    id: opts.importId,
    fileName: opts.file.name,
    fileKind: opts.file.kind,
    fileSize: opts.file.size,
    fileHash: opts.file.hash,
    importedAt: now,
    transactionCount: txs.length,
    skippedCount: opts.rows.length - txs.length,
    totalExpenseKurus: txs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amountKurus, 0),
    totalRefundKurus: txs.filter((t) => t.type === 'refund').reduce((s, t) => s + t.amountKurus, 0),
    status: 'active',
    parserId: opts.parserId,
    accountAlias: opts.accountAlias?.trim() || undefined,
  }
  return { record, transactions: txs, learnedRules }
}

export async function sha256(buffer: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', buffer)
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
