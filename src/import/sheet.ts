import Papa from 'papaparse'
import { IMPORT_LIMITS } from '../config/app'
import { decodeText } from './text'
import type { CellValue, SheetTable } from './types'

export interface CsvResult {
  table: SheetTable
  delimiter: string
  encodingNotes: string[]
  encoding: string
}

const DELIMITER_LABEL: Record<string, string> = { ';': 'noktalı virgül', ',': 'virgül', '\t': 'sekme', '|': 'dikey çizgi' }
export const delimiterLabel = (d: string) => DELIMITER_LABEL[d] ?? d

/** CSV metnindeki ayırıcıyı tırnak dışındaki tutarlı sütun sayısına göre seçer. */
export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 30)
  let best = ';'
  let bestScore = -1
  for (const d of [';', ',', '\t', '|']) {
    const counts = lines.map((l) => countOutsideQuotes(l, d))
    if (!counts.length || counts[0] === 0) continue
    const mode = counts.sort((a, b) => a - b)[Math.floor(counts.length / 2)]
    const consistent = counts.filter((c) => c === mode).length
    const score = consistent * 10 + mode
    if (mode > 0 && score > bestScore) {
      bestScore = score
      best = d
    }
  }
  return best
}

function countOutsideQuotes(line: string, d: string): number {
  let n = 0
  let q = false
  for (const ch of line) {
    if (ch === '"') q = !q
    else if (ch === d && !q) n++
  }
  return n
}

export function parseCsv(buffer: ArrayBuffer, name = 'CSV'): CsvResult {
  const decoded = decodeText(buffer)
  const delimiter = detectDelimiter(decoded.text)
  const res = Papa.parse<string[]>(decoded.text, { delimiter, skipEmptyLines: 'greedy' })
  const rows: CellValue[][] = res.data.slice(0, IMPORT_LIMITS.maxRows + 50).map((r) => r.map((c) => (typeof c === 'string' ? c.trim() : c)))
  if (!rows.length) throw new ImportError('Dosyada okunabilir satır bulunamadı.')
  return { table: { name, rows }, delimiter, encodingNotes: decoded.notes, encoding: decoded.encoding }
}

export class ImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImportError'
  }
}

/**
 * XLSX okuma. Formül çalıştırılmaz; yalnızca dosyada kayıtlı hesaplanmış değerler okunur.
 * Makro içeren .xlsm ve eski .xls biçimi kabul edilmez.
 */
export async function parseXlsx(file: Blob): Promise<SheetTable[]> {
  const { default: readXlsxFile } = await import('read-excel-file/browser')
  try {
    const sheets = await readXlsxFile(file)
    return sheets.map((s) => ({
      name: s.sheet,
      rows: (s.data as unknown[][]).slice(0, IMPORT_LIMITS.maxRows + 50).map((r) => r.map(toCell)),
    }))
  } catch (e) {
    const msg = (e as Error)?.message ?? ''
    if (/password|encrypt/i.test(msg)) throw new ImportError('Excel dosyası parola korumalı. Parolayı Excel\'de kaldırıp yeniden deneyin.')
    throw new ImportError('Excel dosyası okunamadı. Dosya bozuk olabilir veya .xlsx biçiminde olmayabilir.')
  }
}

function toCell(v: unknown): CellValue {
  if (v === null || v === undefined) return null
  if (v instanceof Date || typeof v === 'number' || typeof v === 'boolean') return v
  return String(v).trim()
}

/** Tablo hücresini görüntü metnine çevirir. */
export function cellText(v: CellValue): string {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, '0')
    return `${p(v.getUTCDate())}.${p(v.getUTCMonth() + 1)}.${v.getUTCFullYear()}`
  }
  if (typeof v === 'number') return String(v)
  return String(v)
}
