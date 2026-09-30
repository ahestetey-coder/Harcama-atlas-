import { decideType, detectInstallment, isPaymentLine, isRefundLine, isSummaryLine } from '../domain/classify'
import { inferDateOrder, parseDate } from '../domain/dates'
import { detectCurrency, inferNumberFormat, parseAmount, type NumberFormatHint } from '../domain/money'
import { cleanDescription, normalizeText } from '../domain/normalize'
import type { Category } from '../domain/types'
import { cellText } from './sheet'
import type { CellValue, DraftRow, SheetTable } from './types'

export type StatementKind = 'card' | 'account'

export interface ColumnMapping {
  headerRow: number
  date: number | null
  description: number | null
  amountMode: 'single' | 'debitCredit'
  amount: number | null
  debit: number | null
  credit: number | null
  category: number | null
  currency: number | null
  /** Tek tutar sütununda giderlerin işareti. */
  expenseSign: 'positive' | 'negative'
  statementKind: StatementKind
  dateOrder: 'dmy' | 'mdy'
  numberFormat: NumberFormatHint
}

const HEADER_PATTERNS: Record<'date' | 'description' | 'amount' | 'debit' | 'credit' | 'category' | 'currency', RegExp[]> = {
  date: [/^ISLEM TARIHI$/, /TARIH/, /^DATE$/, /TRANSACTION DATE/],
  description: [/ACIKLAMA/, /ISYERI|IS YERI|UYE ISYERI/, /DESCRIPTION|MERCHANT/, /^ISLEM$/, /ISLEM DETAY/],
  amount: [/^TUTAR$/, /ISLEM TUTARI/, /TUTAR/, /AMOUNT/, /MIKTAR/],
  debit: [/^BORC$/, /BORC TUTARI/, /GIDEN|CIKAN/, /DEBIT/],
  credit: [/^ALACAK$/, /ALACAK TUTARI/, /GELEN|GIREN/, /CREDIT/],
  category: [/KATEGORI/, /CATEGORY/],
  currency: [/PARA BIRIMI/, /DOVIZ CINSI/, /^DOVIZ$/, /CURRENCY/],
}

function findColumn(headers: string[], key: keyof typeof HEADER_PATTERNS, taken: Set<number>): number | null {
  for (const re of HEADER_PATTERNS[key]) {
    const i = headers.findIndex((h, idx) => !taken.has(idx) && re.test(h))
    if (i >= 0) return i
  }
  return null
}

/** Başlık satırını ve sütunları tahmin eder. Kullanıcı eşleştirme ekranında değiştirebilir. */
export function guessMapping(table: SheetTable): ColumnMapping {
  let headerRow = 0
  let bestHits = 0
  for (let r = 0; r < Math.min(table.rows.length, 25); r++) {
    const hs = table.rows[r].map((c) => normalizeText(cellText(c)))
    let hits = 0
    for (const key of Object.keys(HEADER_PATTERNS) as Array<keyof typeof HEADER_PATTERNS>) {
      if (hs.some((h) => HEADER_PATTERNS[key].some((re) => re.test(h)))) hits++
    }
    if (hits > bestHits) {
      bestHits = hits
      headerRow = r
    }
  }
  const headers = (table.rows[headerRow] ?? []).map((c) => normalizeText(cellText(c)))
  const taken = new Set<number>()
  const take = (k: keyof typeof HEADER_PATTERNS) => {
    const i = findColumn(headers, k, taken)
    if (i !== null) taken.add(i)
    return i
  }
  const date = take('date')
  const debit = take('debit')
  const credit = take('credit')
  const amount = take('amount')
  const description = take('description')
  const category = take('category')
  const currency = take('currency')
  const amountMode = debit !== null && credit !== null ? 'debitCredit' : 'single'

  const body = table.rows.slice(headerRow + 1)
  const amountCol = amountMode === 'single' ? (amount ?? debit ?? credit) : null
  const amountSamples = body
    .flatMap((r) => (amountMode === 'single' ? [r[amountCol ?? -1]] : [r[debit ?? -1], r[credit ?? -1]]))
    .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
  const dateSamples = body.map((r) => r[date ?? -1]).filter((v): v is string => typeof v === 'string')
  let negatives = 0
  let positives = 0
  for (const r of body) {
    const p = parseAmount(r[amountCol ?? -1] as string | number | null, 'auto')
    if (p.ok) {
      if (p.kurus < 0) negatives++
      else if (p.kurus > 0) positives++
    }
  }
  const expenseSign = negatives > positives ? 'negative' : 'positive'
  return {
    headerRow,
    date,
    description,
    amountMode,
    amount: amountMode === 'single' ? amountCol : null,
    debit: amountMode === 'debitCredit' ? debit : null,
    credit: amountMode === 'debitCredit' ? credit : null,
    category,
    currency,
    expenseSign,
    statementKind: expenseSign === 'negative' || amountMode === 'debitCredit' ? 'account' : 'card',
    dateOrder: inferDateOrder(dateSamples).order,
    numberFormat: inferNumberFormat(amountSamples),
  }
}

export function mappingProblems(m: ColumnMapping): string[] {
  const p: string[] = []
  if (m.date === null) p.push('Tarih sütununu seçin.')
  if (m.description === null) p.push('Açıklama sütununu seçin.')
  if (m.amountMode === 'single' && m.amount === null) p.push('Tutar sütununu seçin.')
  if (m.amountMode === 'debitCredit' && (m.debit === null || m.credit === null)) p.push('Borç ve alacak sütunlarını seçin.')
  return p
}

let rowSeq = 0
const draftId = () => `${Date.now().toString(36)}-${(rowSeq++).toString(36)}-${crypto.randomUUID().slice(0, 8)}`
export const newDraftId = () => crypto.randomUUID?.() ?? draftId()

/** Eşleştirmeye göre tablo satırlarından taslak işlemler üretir. Kategoriler sonra kurallarla önerilir. */
export function rowsFromMapping(table: SheetTable, m: ColumnMapping, categories: Category[]): DraftRow[] {
  const out: DraftRow[] = []
  const catByName = new Map(categories.map((c) => [normalizeText(c.name), c.id]))
  const get = (r: CellValue[], i: number | null) => (i === null ? null : (r[i] ?? null))
  for (let ri = m.headerRow + 1; ri < table.rows.length; ri++) {
    const r = table.rows[ri]
    if (!r || r.every((c) => c === null || cellText(c).trim() === '')) continue
    const sourceText = r.map(cellText).filter(Boolean).join(' | ')
    const description = cleanDescription(cellText(get(r, m.description)))
    const notes: string[] = []

    // Tarih
    const dateCell = get(r, m.date)
    const dp = parseDate(dateCell, { order: m.dateOrder })
    const date = dp.ok ? dp.date : null

    // Tutar
    let signed: number | null = null
    let amountRaw: string
    let candidates: number[] | undefined
    let credit = false
    let currency = 'TRY'
    const takeAmount = (v: CellValue) => {
      const p = parseAmount(v as string | number | null, typeof v === 'number' ? 'en' : m.numberFormat)
      if (p.ok) {
        if (p.note) notes.push(p.note)
        if (p.currency && p.currency !== 'TRY') currency = p.currency
        return p.kurus
      }
      if (p.reason === 'ambiguous') candidates = p.candidates
      else if (p.reason === 'invalid') notes.push(p.message)
      return null
    }
    if (m.amountMode === 'single') {
      const v = get(r, m.amount)
      amountRaw = cellText(v)
      const k = takeAmount(v)
      if (k !== null) {
        signed = m.expenseSign === 'negative' ? -k : k
        credit = signed < 0
      }
    } else {
      const dv = get(r, m.debit)
      const cv = get(r, m.credit)
      const dk = cellText(dv).trim() ? takeAmount(dv) : null
      const ck = cellText(cv).trim() ? takeAmount(cv) : null
      if (dk && Math.abs(dk) > 0) {
        signed = Math.abs(dk)
        amountRaw = cellText(dv)
      } else if (ck && Math.abs(ck) > 0) {
        signed = -Math.abs(ck)
        credit = true
        amountRaw = cellText(cv)
      } else {
        amountRaw = cellText(dv) || cellText(cv)
      }
    }
    const curCell = cellText(get(r, m.currency)).trim()
    if (curCell) {
      const c = detectCurrency(curCell) ?? (/^[A-Z]{3}$/i.test(curCell) ? curCell.toUpperCase() : undefined)
      if (c) currency = c === 'YTL' ? 'TRY' : c
    }

    if (!description && signed === null && !date) continue
    if (isSummaryLine(description) && !date) continue

    const decision = decideType(description, signed ?? 0, credit)
    let type = decision.type
    let include = true
    let excludedReason: string | undefined
    if (credit && m.statementKind === 'account' && !isRefundLine(description) && !isPaymentLine(description)) {
      // Banka hesabına gelen para gelir/transfer olabilir; gider takibinde iade sayılmaz.
      type = 'transfer'
      include = false
      excludedReason = 'Hesaba gelen para (gelir/transfer). İade ise türünü "İade" yapıp dahil edin.'
    } else {
      notes.push(...decision.warnings)
    }
    if (isSummaryLine(description)) {
      include = false
      excludedReason = 'Özet satırı (dönem borcu, limit, toplam vb.) işlem olarak alınmaz.'
    }

    let categoryId: string | null = null
    let categorySource: DraftRow['categorySource']
    const catCell = cellText(get(r, m.category)).trim()
    if (catCell) {
      const id = catByName.get(normalizeText(catCell))
      if (id) {
        categoryId = id
        categorySource = 'file'
      } else notes.push(`Dosyadaki "${catCell}" kategorisi uygulamada yok; kategori seçin veya ekleyin.`)
    }

    const foreignCurrency = currency !== 'TRY'
    const amountAbs = signed === null ? null : Math.abs(signed)
    out.push({
      id: newDraftId(),
      include,
      date,
      dateRaw: cellText(dateCell),
      description,
      amountKurus: foreignCurrency ? null : amountAbs,
      amountRaw,
      amountCandidates: candidates?.map((c) => Math.abs(c)),
      type,
      categoryId,
      categorySource,
      currency: 'TRY',
      foreign: foreignCurrency && amountAbs !== null ? { currency, amountMinor: amountAbs } : undefined,
      installment: detectInstallment(description) ?? undefined,
      source: { kind: 'sheet-row', line: ri + 1, text: sourceText },
      notes: dp.ok ? (dp.note ? [dp.note, ...notes] : notes) : [dp.ok === false && dp.reason !== 'empty' ? dp.message : 'Tarih bulunamadı.', ...notes],
      excludedReason,
    })
  }
  return out
}
