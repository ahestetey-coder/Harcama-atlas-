import { IMPORT_LIMITS } from '../config/app'
import type { OcrProgress, OcrSession } from './ocr'
import { ImportError } from './sheet'
import type { DocCell, DocLine, PageInfo, ParsedDocument } from './types'

// "legacy" derleme, pdf.js'in kullandığı yeni JS özellikleri (ör. Map.getOrInsertComputed) için
// polyfill içerir; bu olmadan Chrome 141 ve Safari gibi tarayıcılarda PDF okuma hata verir.
type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs')
let pdfjsPromise: Promise<PdfJs> | null = null

async function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const lib = await import('pdfjs-dist/legacy/build/pdf.mjs')
      const workerUrl = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default
      lib.GlobalWorkerOptions.workerSrc = workerUrl
      return lib
    })()
  }
  return pdfjsPromise
}

export class PdfPasswordError extends Error {
  readonly incorrect: boolean
  constructor(incorrect: boolean) {
    super(incorrect ? 'Parola hatalı.' : 'Bu PDF parola korumalı.')
    this.name = 'PdfPasswordError'
    this.incorrect = incorrect
  }
}

export interface PdfProgress {
  phase: 'text' | 'ocr'
  page: number
  pages: number
  ocr?: OcrProgress
}

/** Bir sayfada bu sayıdan az metin karakteri varsa taranmış (görsel) sayfa sayılır. */
const MIN_TEXT_CHARS = 25

interface TextItemLike {
  str: string
  transform: number[]
  width: number
  height: number
}

/**
 * PDF'ten konumlu metin çıkarır. Metin içermeyen (taranmış) sayfalar için OCR'a geçer;
 * karma PDF'ler sayfa bazında değerlendirilir. Parola saklanmaz.
 */
export async function readPdf(
  data: ArrayBuffer,
  opts: { password?: string; ocr?: () => Promise<OcrSession>; onProgress?: (p: PdfProgress) => void; signal?: AbortSignal },
): Promise<ParsedDocument> {
  const pdfjs = await loadPdfJs()
  const base = new URL('pdfjs/', document.baseURI).href
  const task = pdfjs.getDocument({
    data: new Uint8Array(data.slice(0)),
    password: opts.password,
    cMapUrl: base + 'cmaps/',
    cMapPacked: true,
    standardFontDataUrl: base + 'standard_fonts/',
    wasmUrl: base + 'wasm/',
    enableXfa: false,
  })
  let doc
  try {
    doc = await task.promise
  } catch (e) {
    const err = e as { name?: string; code?: number }
    if (err?.name === 'PasswordException') throw new PdfPasswordError(err.code === pdfjs.PasswordResponses.INCORRECT_PASSWORD)
    if (err?.name === 'InvalidPDFException') throw new ImportError('PDF dosyası bozuk veya geçerli bir PDF değil.')
    throw new ImportError('PDF okunamadı. Dosya bozuk veya desteklenmeyen bir biçimde olabilir.')
  }
  try {
    if (doc.numPages > IMPORT_LIMITS.maxPdfPages)
      throw new ImportError(`PDF ${doc.numPages} sayfa. En fazla ${IMPORT_LIMITS.maxPdfPages} sayfalık ekstreler okunabilir; dosyayı bölerek yükleyin.`)
    const lines: DocLine[] = []
    const pages: PageInfo[] = []
    let ocrPages = 0
    let session: OcrSession | null = null
    for (let p = 1; p <= doc.numPages; p++) {
      if (opts.signal?.aborted) throw new DOMException('İptal edildi', 'AbortError')
      opts.onProgress?.({ phase: 'text', page: p, pages: doc.numPages })
      const page = await doc.getPage(p)
      const content = await page.getTextContent()
      const items = (content.items as unknown as TextItemLike[]).filter((i) => typeof i.str === 'string')
      const chars = items.reduce((s, i) => s + i.str.trim().length, 0)
      if (chars >= MIN_TEXT_CHARS) {
        const viewport = page.getViewport({ scale: 1 })
        const pageLines = groupTextItems(items, p, viewport.height)
        lines.push(...pageLines)
        pages.push({ page: p, mode: 'text', textItems: items.length })
        continue
      }
      if (!opts.ocr) {
        pages.push({ page: p, mode: 'skipped', textItems: items.length, note: 'Metin yok; OCR kapalı.' })
        continue
      }
      if (ocrPages >= IMPORT_LIMITS.maxOcrPdfPages) {
        pages.push({ page: p, mode: 'skipped', textItems: items.length, note: `OCR sınırı (${IMPORT_LIMITS.maxOcrPdfPages} sayfa) aşıldı.` })
        continue
      }
      ocrPages++
      session ??= await opts.ocr()
      const viewport = page.getViewport({ scale: 2.5 })
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      await page.render({ canvas, viewport }).promise
      opts.onProgress?.({ phase: 'ocr', page: p, pages: doc.numPages })
      const res = await session.recognize(canvas, p)
      canvas.width = 0
      canvas.height = 0
      lines.push(...res.lines)
      pages.push({ page: p, mode: 'ocr', textItems: items.length, ocrConfidence: res.meanConfidence })
    }
    return {
      kind: 'pdf',
      lines,
      pages,
      rawText: lines.map((l) => l.text).join('\n'),
      usedOcr: pages.some((p) => p.mode === 'ocr'),
    }
  } finally {
    await task.destroy().catch(() => {})
  }
}

/**
 * PDF metin öğelerini satırlara gruplar (y konumu), satır içinde x'e göre sıralar ve
 * birbirine yapışık öğeleri tek hücrede birleştirir. Sütun ilişkisi hücre x konumlarında korunur.
 */
export function groupTextItems(items: TextItemLike[], page: number, pageHeight: number): DocLine[] {
  const parts = items
    .filter((i) => i.str.trim())
    .flatMap((i) => {
      const x = i.transform[4]
      const yTop = pageHeight - i.transform[5]
      const h = Math.abs(i.height || i.transform[3] || 10)
      // Tek öğe içinde geniş boşlukla ayrılmış sütunlar ("NETFLIX.COM    9,99 USD") ayrı hücre olur.
      const pieces = i.str.split(/(\s{3,})/)
      if (pieces.length === 1) return [{ x, x2: x + i.width, y: yTop, h, text: i.str }]
      const cw = i.width / Math.max(1, i.str.length)
      let off = 0
      const res: Array<{ x: number; x2: number; y: number; h: number; text: string }> = []
      for (const p of pieces) {
        if (p.trim()) res.push({ x: x + off * cw, x2: x + (off + p.length) * cw, y: yTop, h, text: p })
        off += p.length
      }
      return res
    })
    .sort((a, b) => a.y - b.y || a.x - b.x)
  const rows: Array<typeof parts> = []
  for (const p of parts) {
    const row = rows[rows.length - 1]
    if (row) {
      const ry = row[0].y
      if (Math.abs(p.y - ry) <= Math.max(2, Math.min(p.h, row[0].h) * 0.45)) {
        row.push(p)
        continue
      }
    }
    rows.push([p])
  }
  return rows.map((row, index) => {
    row.sort((a, b) => a.x - b.x)
    const cells: DocCell[] = []
    for (const p of row) {
      const prev = cells[cells.length - 1]
      const gap = prev ? p.x - prev.x2 : Infinity
      const charW = p.text.length ? (p.x2 - p.x) / p.text.length : 5
      if (prev && gap < Math.max(1.5, charW * 0.9)) {
        prev.text += (gap > charW * 0.25 ? ' ' : '') + p.text
        prev.x2 = p.x2
      } else cells.push({ x: p.x, x2: p.x2, text: p.text })
    }
    for (const c of cells) c.text = c.text.replace(/\s+/g, ' ').trim()
    return { page, index, y: row[0].y, cells, text: cells.map((c) => c.text).join('  '), origin: 'text' as const }
  })
}
