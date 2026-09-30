import { useCallback, useRef, useState } from 'react'
import { IMPORT_LIMITS } from '../../config/app'
import type { ImportFileKind, ImportRecord } from '../../domain/types'
import { applyRules, markDuplicates, sha256 } from '../../import/enrich'
import { loadImage, prepareImage, type ImageAdjustments } from '../../import/image'
import { guessMapping, rowsFromMapping, type ColumnMapping } from '../../import/mapping'
import { OcrCancelledError, OcrSession, type OcrProgress } from '../../import/ocr'
import { PdfPasswordError, readPdf } from '../../import/pdf'
import { ImportError, parseCsv, parseXlsx } from '../../import/sheet'
import { parseStatement } from '../../import/statement'
import type { DocLine, DraftRow, IgnoredLine, PageInfo, SheetTable, StatementTotal } from '../../import/types'
import { useData } from '../../state/data'

export interface FileInfo {
  name: string
  size: number
  kind: ImportFileKind
  hash: string
  /** Yalnızca bellekte tutulur; kayıt sonrası veya iptalde bırakılır. */
  file: File
}

export interface ReviewData {
  rows: DraftRow[]
  ignored: IgnoredLine[]
  unparsed: DocLine[]
  totals: StatementTotal[]
  lines: DocLine[]
  pages: PageInfo[]
  periodText?: string
  parserLabel: string
  parserVerified: boolean
  notes: string[]
  usedOcr: boolean
  ocrConfidence?: number
  sheet?: SheetTable
}

export type Stage =
  | { k: 'select' }
  | { k: 'duplicate-file'; existing: ImportRecord }
  | { k: 'password'; incorrect: boolean }
  | { k: 'reading'; label: string; progress: number | null; detail?: string; cancellable: boolean }
  | { k: 'mapping'; tables: SheetTable[]; sheetIndex: number; mapping: ColumnMapping; notes: string[] }
  | { k: 'image'; bitmap: ImageBitmap }
  | { k: 'review' }
  | { k: 'done'; importId: string; count: number; skipped: number; expenseKurus: number; refundKurus: number }
  | { k: 'error'; message: string; canRetry: boolean }

export const ACCEPT = '.pdf,.csv,.txt,.xlsx,.png,.jpg,.jpeg,application/pdf,text/csv,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export function detectKind(file: File): ImportFileKind | null {
  const n = file.name.toLowerCase()
  if (n.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf'
  if (n.endsWith('.csv') || n.endsWith('.txt') || file.type === 'text/csv') return 'csv'
  if (n.endsWith('.xlsx')) return 'xlsx'
  if (/\.(png|jpe?g)$/.test(n) || file.type === 'image/png' || file.type === 'image/jpeg') return 'image'
  return null
}

export function kindLimit(kind: ImportFileKind): number {
  return kind === 'pdf' ? IMPORT_LIMITS.maxPdfBytes : kind === 'image' ? IMPORT_LIMITS.maxImageBytes : IMPORT_LIMITS.maxSheetBytes
}

export function useImportFlow() {
  const { repo } = useData()
  const [stage, setStage] = useState<Stage>({ k: 'select' })
  const [info, setInfo] = useState<FileInfo | null>(null)
  const [review, setReview] = useState<ReviewData | null>(null)
  const [importId, setImportId] = useState<string>('')
  const [accountAlias, setAccountAlias] = useState('')
  const ocrRef = useRef<OcrSession | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const passwordRef = useRef<string | undefined>(undefined)
  const lastAdjust = useRef<ImageAdjustments | null>(null)

  const reset = useCallback(() => {
    abortRef.current?.abort()
    void ocrRef.current?.dispose()
    ocrRef.current = null
    passwordRef.current = undefined
    setInfo(null)
    setReview(null)
    setImportId('')
    setStage((s) => {
      if (s.k === 'image') s.bitmap.close()
      return { k: 'select' }
    })
  }, [])

  const enrich = useCallback(
    async (rows: DraftRow[]) => {
      const [rules, categories, existing] = await Promise.all([repo.db.rules.toArray(), repo.db.categories.toArray(), repo.db.transactions.toArray()])
      return markDuplicates(applyRules(rows, rules, categories), existing, accountAlias || undefined)
    },
    [repo, accountAlias],
  )

  const toReview = useCallback(
    async (data: Omit<ReviewData, 'rows'> & { rows: DraftRow[] }) => {
      const rows = await enrich(data.rows)
      setReview({ ...data, rows })
      setImportId(crypto.randomUUID())
      setStage({ k: 'review' })
    },
    [enrich],
  )

  const ocrFactory = useCallback(async () => {
    const s = new OcrSession()
    ocrRef.current = s
    await s.init((p: OcrProgress) => setStage((st) => (st.k === 'reading' ? { ...st, detail: p.status, progress: p.progress } : st)))
    return s
  }, [])

  const runPdf = useCallback(
    async (fi: FileInfo) => {
      const ac = new AbortController()
      abortRef.current = ac
      setStage({ k: 'reading', label: 'PDF okunuyor', progress: null, cancellable: true })
      try {
        const buffer = await fi.file.arrayBuffer()
        const doc = await readPdf(buffer, {
          password: passwordRef.current,
          signal: ac.signal,
          ocr: ocrFactory,
          onProgress: (p) =>
            setStage((st) =>
              st.k === 'reading'
                ? {
                    ...st,
                    label: p.phase === 'ocr' ? `Taranmış sayfa ${p.page}/${p.pages} OCR ile okunuyor` : `Sayfa ${p.page}/${p.pages} okunuyor`,
                    progress: p.phase === 'text' ? p.page / p.pages : st.progress,
                  }
                : st,
            ),
        })
        passwordRef.current = undefined // parola saklanmaz
        await ocrRef.current?.dispose()
        ocrRef.current = null
        const out = parseStatement(doc)
        const ocrPages = doc.pages.filter((p) => p.mode === 'ocr')
        const notes: string[] = [...(out.notes ?? [])]
        const skipped = doc.pages.filter((p) => p.mode === 'skipped')
        if (skipped.length) notes.push(`${skipped.length} sayfa okunamadı: ${skipped.map((p) => `s.${p.page} (${p.note})`).join(', ')}`)
        if (ocrPages.length) notes.push(`${ocrPages.map((p) => p.page).join(', ')}. sayfa(lar) metin içermediği için OCR ile okundu.`)
        await toReview({
          ...out,
          lines: doc.lines,
          pages: doc.pages,
          parserVerified: false,
          notes,
          usedOcr: doc.usedOcr,
          ocrConfidence: ocrPages.length ? Math.round(ocrPages.reduce((s, p) => s + (p.ocrConfidence ?? 0), 0) / ocrPages.length) : undefined,
        })
      } catch (e) {
        await ocrRef.current?.dispose()
        ocrRef.current = null
        if (e instanceof PdfPasswordError) return setStage({ k: 'password', incorrect: e.incorrect })
        if (e instanceof OcrCancelledError || (e as Error)?.name === 'AbortError') return setStage({ k: 'error', message: 'Okuma iptal edildi. Kaydedilmiş hiçbir şey yok.', canRetry: true })
        // Yalnızca hata türü/mesajı yazılır; belge içeriği yazılmaz.
        if (!(e instanceof ImportError)) console.warn('PDF okuma hatası:', (e as Error)?.name, (e as Error)?.message)
        setStage({ k: 'error', message: e instanceof ImportError ? e.message : 'PDF okunurken beklenmeyen bir hata oluştu.', canRetry: !(e instanceof ImportError) })
      }
    },
    [ocrFactory, toReview],
  )

  const runImageOcr = useCallback(
    async (bitmap: ImageBitmap, adj: ImageAdjustments) => {
      lastAdjust.current = adj
      const canvas = prepareImage(bitmap, adj)
      setStage({ k: 'reading', label: 'Görsel OCR ile okunuyor', progress: 0, cancellable: true })
      try {
        const s = await ocrFactory()
        const res = await s.recognize(canvas, 1)
        await s.dispose()
        ocrRef.current = null
        bitmap.close()
        const doc = { kind: 'image' as const, lines: res.lines, pages: [{ page: 1, mode: 'ocr' as const, textItems: 0, ocrConfidence: res.meanConfidence }], rawText: res.text, usedOcr: true }
        const out = parseStatement(doc)
        const notes: string[] = [...(out.notes ?? [])]
        if (res.wordCount === 0) notes.push('Görselde metin bulunamadı. Kırpma veya iyileştirme ile yeniden deneyin.')
        await toReview({ ...out, lines: doc.lines, pages: doc.pages, parserVerified: false, notes, usedOcr: true, ocrConfidence: res.meanConfidence })
      } catch (e) {
        await ocrRef.current?.dispose()
        ocrRef.current = null
        if (e instanceof OcrCancelledError) {
          setStage({ k: 'image', bitmap })
          return
        }
        setStage({ k: 'error', message: 'OCR tamamlanamadı. OCR dosyaları yüklenemediyse internet bağlantısını kontrol edin veya Ayarlar’dan indirin; sonra yeniden deneyin.', canRetry: true })
      }
    },
    [ocrFactory, toReview],
  )

  const start = useCallback(
    async (fi: FileInfo) => {
      setInfo(fi)
      if (fi.kind === 'pdf') return runPdf(fi)
      if (fi.kind === 'image') {
        setStage({ k: 'reading', label: 'Görsel açılıyor', progress: null, cancellable: false })
        try {
          const bitmap = await loadImage(fi.file)
          setStage({ k: 'image', bitmap })
        } catch (e) {
          setStage({ k: 'error', message: e instanceof ImportError ? e.message : 'Görsel açılamadı.', canRetry: false })
        }
        return
      }
      setStage({ k: 'reading', label: fi.kind === 'csv' ? 'CSV okunuyor' : 'Excel okunuyor', progress: null, cancellable: false })
      try {
        let tables: SheetTable[]
        let notes: string[] = []
        if (fi.kind === 'csv') {
          const r = parseCsv(await fi.file.arrayBuffer(), fi.name)
          tables = [r.table]
          notes = r.encodingNotes
        } else tables = await parseXlsx(fi.file)
        const nonEmpty = tables.filter((t) => t.rows.length > 0)
        if (!nonEmpty.length) throw new ImportError('Dosyada veri bulunamadı.')
        const idx = Math.max(0, tables.indexOf(nonEmpty[0]))
        setStage({ k: 'mapping', tables, sheetIndex: idx, mapping: guessMapping(tables[idx]), notes })
      } catch (e) {
        setStage({ k: 'error', message: e instanceof ImportError ? e.message : 'Dosya okunamadı.', canRetry: false })
      }
    },
    [runPdf],
  )

  /** Dosyayı doğrular, özetini çıkarır, daha önce yüklenip yüklenmediğini kontrol eder. */
  const selectFile = useCallback(
    async (file: File): Promise<string | null> => {
      const kind = detectKind(file)
      if (!kind) {
        if (/\.xls$/i.test(file.name)) return 'Eski Excel (.xls) biçimi desteklenmiyor. Dosyayı Excel’de “.xlsx” olarak kaydedip yükleyin.'
        if (/\.xlsm$/i.test(file.name)) return 'Makro içeren Excel dosyaları (.xlsm) güvenlik nedeniyle kabul edilmez. “.xlsx” olarak kaydedin.'
        return 'Desteklenmeyen dosya türü. PDF, CSV, XLSX, PNG veya JPEG yükleyin.'
      }
      const limit = kindLimit(kind)
      if (file.size > limit) return `Dosya çok büyük (${(file.size / 1048576).toFixed(1)} MB). Bu tür için sınır ${(limit / 1048576).toFixed(0)} MB.`
      if (file.size === 0) return 'Dosya boş.'
      const hash = await sha256(await file.arrayBuffer())
      const fi: FileInfo = { name: file.name, size: file.size, kind, hash, file }
      setInfo(fi)
      const existing = await repo.findImportByHash(hash)
      if (existing) {
        setStage({ k: 'duplicate-file', existing })
        return null
      }
      void start(fi)
      return null
    },
    [repo, start],
  )

  const submitPassword = useCallback(
    (pw: string) => {
      passwordRef.current = pw
      if (info) void runPdf(info)
    },
    [info, runPdf],
  )

  const cancelReading = useCallback(() => {
    abortRef.current?.abort()
    void ocrRef.current?.cancel()
  }, [])

  const retry = useCallback(() => {
    if (!info) return reset()
    void start(info)
  }, [info, start, reset])

  const confirmMapping = useCallback(
    async (table: SheetTable, mapping: ColumnMapping, notes: string[]) => {
      const categories = await repo.db.categories.toArray()
      const rows = rowsFromMapping(table, mapping, categories)
      await toReview({
        rows,
        ignored: [],
        unparsed: [],
        totals: [],
        lines: [],
        pages: [],
        parserLabel: info?.kind === 'xlsx' ? `Excel sütun eşleştirme (${table.name})` : 'CSV sütun eşleştirme',
        parserVerified: true,
        notes,
        usedOcr: false,
        sheet: table,
      })
    },
    [repo, toReview, info],
  )

  return {
    stage,
    setStage,
    info,
    review,
    setReview,
    importId,
    accountAlias,
    setAccountAlias,
    selectFile,
    start,
    reset,
    submitPassword,
    cancelReading,
    retry,
    confirmMapping,
    runImageOcr,
    enrich,
  }
}
