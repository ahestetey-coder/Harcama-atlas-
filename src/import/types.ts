import type { ForeignAmount, ImportFileKind, Installment, TxType } from '../domain/types'

/** Kaynak belgede işlemin geldiği yer. */
export interface SourceRef {
  kind: 'pdf-line' | 'ocr-line' | 'sheet-row' | 'manual-row'
  page?: number
  /** Satır numarası (sayfa içinde 1'den başlar) veya tablo satırı. */
  line?: number
  text: string
}

export interface DocCell {
  x: number
  x2: number
  text: string
  /** OCR kelime güveni (0–100, Tesseract ölçüsü). */
  conf?: number
}

export interface DocLine {
  page: number
  index: number
  y: number
  cells: DocCell[]
  text: string
  origin: 'text' | 'ocr'
}

export interface PageInfo {
  page: number
  mode: 'text' | 'ocr' | 'skipped'
  textItems: number
  /** OCR kullanıldıysa ortalama kelime güveni (Tesseract). */
  ocrConfidence?: number
  note?: string
}

export type DuplicateDecision = 'skip' | 'keep' | null

export interface DraftRow {
  /** Kaydedilince işlem kimliği olur; yeniden denemede aynı kayıt tekrar oluşmaz. */
  id: string
  include: boolean
  date: string | null
  dateRaw: string
  description: string
  /** Pozitif kuruş; belirsiz/okunamayan tutarda null. */
  amountKurus: number | null
  amountRaw: string
  amountCandidates?: number[]
  type: TxType
  categoryId: string | null
  /** Harcama grubu (Bireysel, Ortak…); boşsa grupsuz. */
  groupId?: string | null
  categorySource?: 'rule' | 'file' | 'manual' | 'confirmed-other'
  ruleNote?: string
  ruleConflict?: string
  learn?: boolean
  learnPattern?: string
  /** 'TRY' veya döviz kodu. Döviz satırında TL karşılığı `amountKurus`'tur. */
  currency: string
  foreign?: ForeignAmount
  installment?: Installment
  source: SourceRef
  /** Ayrıştırmaya dair bilgilendirici uyarılar. */
  notes: string[]
  duplicateOf?: string[]
  duplicateDecision?: DuplicateDecision
  inFileDuplicate?: boolean
  lowOcrConfidence?: boolean
  /** Kural dışında bırakılma nedeni (ör. gelen para). */
  excludedReason?: string
}

export interface IgnoredLine {
  line: DocLine
  reason: string
}

export interface StatementTotal {
  label: string
  amountKurus: number
  source: SourceRef
}

export interface ParseOutput {
  rows: DraftRow[]
  ignored: IgnoredLine[]
  unparsed: DocLine[]
  totals: StatementTotal[]
  periodText?: string
  /** Belge geneline ait açıklamalar (ör. işaret düzeni). */
  notes?: string[]
  parserId: string
  parserLabel: string
}

export interface ParsedDocument {
  kind: ImportFileKind
  lines: DocLine[]
  pages: PageInfo[]
  rawText: string
  /** OCR kullanıldıysa (görsel veya taranmış sayfa). */
  usedOcr: boolean
}

export type CellValue = string | number | boolean | Date | null

export interface SheetTable {
  name: string
  rows: CellValue[][]
}

export type RowStatus = 'valid' | 'problem' | 'duplicate' | 'excluded'

export interface RowProblem {
  field: 'date' | 'amount' | 'description' | 'category' | 'currency'
  message: string
}
