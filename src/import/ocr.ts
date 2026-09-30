import type { DocCell, DocLine } from './types'

/**
 * Yerel OCR (Tesseract.js). Motor, çalışan ve Türkçe/İngilizce dil dosyaları uygulamayla
 * birlikte /ocr/ altından sunulur; görüntü hiçbir sunucuya gönderilmez. OCR ayrı bir
 * Web Worker'da çalışır, arayüz donmaz.
 */

export interface OcrProgress {
  status: string
  /** 0–1 */
  progress: number
}

export interface OcrPageResult {
  lines: DocLine[]
  text: string
  /** Tesseract'ın ortalama kelime güveni (0–100). Ayrıştırma doğruluğu değildir. */
  meanConfidence: number
  wordCount: number
}

export class OcrCancelledError extends Error {
  constructor() {
    super('OCR iptal edildi.')
    this.name = 'OcrCancelledError'
  }
}

const STATUS_TR: Record<string, string> = {
  'loading tesseract core': 'OCR motoru yükleniyor',
  'initializing tesseract': 'OCR motoru hazırlanıyor',
  'initialized tesseract': 'OCR motoru hazır',
  'loading language traineddata': 'Dil dosyaları yükleniyor',
  'loading language traineddata (from cache)': 'Dil dosyaları önbellekten yükleniyor',
  'loaded language traineddata': 'Dil dosyaları yüklendi',
  'initializing api': 'Tanıma hazırlanıyor',
  'initialized api': 'Tanıma hazır',
  'recognizing text': 'Metin tanınıyor',
}

function assetUrl(path: string): string {
  return new URL(path, document.baseURI).href
}

type TesseractWorker = Awaited<ReturnType<(typeof import('tesseract.js'))['createWorker']>>

/** Tek bir OCR oturumu. İptal edildiğinde çalışan sonlandırılır; yeniden denemede yenisi açılır. */
export class OcrSession {
  private worker: TesseractWorker | null = null
  private onProgress: (p: OcrProgress) => void = () => {}
  private cancelled = false
  private rejectCurrent: ((e: Error) => void) | null = null

  async init(onProgress: (p: OcrProgress) => void): Promise<void> {
    this.onProgress = onProgress
    if (this.worker) return
    const { createWorker, OEM, PSM } = await import('tesseract.js')
    const worker = await this.guard(
      createWorker(['tur', 'eng'], OEM.LSTM_ONLY, {
        workerPath: assetUrl('ocr/worker.min.js'),
        corePath: assetUrl('ocr/core/'),
        langPath: assetUrl('ocr/lang'),
        gzip: true,
        cacheMethod: 'none',
        workerBlobURL: false,
        logger: (m) => this.onProgress({ status: STATUS_TR[m.status] ?? m.status, progress: m.progress ?? 0 }),
        errorHandler: () => {},
      }),
    )
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
    })
    this.worker = worker
  }

  private guard<T>(p: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.rejectCurrent = reject
      p.then(resolve, reject).finally(() => {
        this.rejectCurrent = null
      })
    })
  }

  async recognize(image: HTMLCanvasElement | Blob, page: number): Promise<OcrPageResult> {
    if (this.cancelled) throw new OcrCancelledError()
    if (!this.worker) throw new Error('OCR başlatılmadı')
    const res = await this.guard(this.worker.recognize(image, {}, { blocks: true, text: true }))
    return toLines(res.data, page)
  }

  async cancel(): Promise<void> {
    this.cancelled = true
    this.rejectCurrent?.(new OcrCancelledError())
    const w = this.worker
    this.worker = null
    if (w) await w.terminate().catch(() => {})
  }

  async dispose(): Promise<void> {
    const w = this.worker
    this.worker = null
    if (w) await w.terminate().catch(() => {})
  }
}

interface TWord {
  text: string
  confidence: number
  bbox: { x0: number; y0: number; x1: number; y1: number }
}

/**
 * Tesseract blok/satır yapısına güvenmeden bütün kelimeleri dikey konuma göre satırlara
 * yeniden gruplar. Böylece aynı satırdaki tarih, açıklama ve tutar farklı bloklara düşse de
 * birlikte kalır.
 */
function toLines(data: { blocks: Array<{ paragraphs: Array<{ lines: Array<{ words: TWord[] }> }> }> | null; text: string }, page: number): OcrPageResult {
  const words: TWord[] = []
  for (const b of data.blocks ?? []) for (const p of b.paragraphs) for (const l of p.lines) for (const w of l.words) if (w.text.trim()) words.push(w)
  const lines = groupWords(words, page)
  const conf = words.length ? words.reduce((s, w) => s + w.confidence, 0) / words.length : 0
  return { lines, text: lines.map((l) => l.text).join('\n'), meanConfidence: Math.round(conf), wordCount: words.length }
}

export function groupWords(words: TWord[], page: number): DocLine[] {
  const sorted = [...words].sort((a, b) => (a.bbox.y0 + a.bbox.y1) / 2 - (b.bbox.y0 + b.bbox.y1) / 2)
  const groups: TWord[][] = []
  for (const w of sorted) {
    const cy = (w.bbox.y0 + w.bbox.y1) / 2
    const h = Math.max(4, w.bbox.y1 - w.bbox.y0)
    const g = groups[groups.length - 1]
    if (g) {
      const gy = g.reduce((s, x) => s + (x.bbox.y0 + x.bbox.y1) / 2, 0) / g.length
      if (Math.abs(cy - gy) < h * 0.55) {
        g.push(w)
        continue
      }
    }
    groups.push([w])
  }
  return groups.map((g, index) => {
    const cells: DocCell[] = g
      .sort((a, b) => a.bbox.x0 - b.bbox.x0)
      .map((w) => ({ x: w.bbox.x0, x2: w.bbox.x1, text: w.text, conf: w.confidence }))
    return { page, index, y: g[0].bbox.y0, cells, text: cells.map((c) => c.text).join(' '), origin: 'ocr' as const }
  })
}

/** OCR dosyalarının boyutları (copy-assets tarafından üretilen manifest). */
export async function ocrAssetInfo(): Promise<{ totalBytes: number; files: Record<string, number> } | null> {
  try {
    const res = await fetch(assetUrl('ocr/manifest.json'))
    if (!res.ok) return null
    const files = (await res.json()) as Record<string, number>
    // Tarayıcı üç çekirdek dosyasından yalnızca birini indirir.
    const core = Object.entries(files).filter(([k]) => k.includes('/core/'))
    const coreMax = Math.max(0, ...core.map(([, v]) => v))
    const rest = Object.entries(files).filter(([k]) => !k.includes('/core/')).reduce((s, [, v]) => s + v, 0)
    return { totalBytes: rest + coreMax, files }
  } catch {
    return null
  }
}

/** OCR dosyaları çevrimdışı önbellekte mi? (Servis çalışanı "ocr-assets" önbelleği) */
export async function ocrCacheStatus(): Promise<'ready' | 'partial' | 'missing' | 'unsupported'> {
  if (!('caches' in window)) return 'unsupported'
  try {
    const info = await ocrAssetInfo()
    if (!info) return 'missing'
    const cache = await caches.open('ocr-assets')
    const needed = ['ocr/worker.min.js', 'ocr/lang/tur.traineddata.gz', 'ocr/lang/eng.traineddata.gz']
    const hits = await Promise.all(needed.map((p) => cache.match(assetUrl(p))))
    const coreHits = await Promise.all(Object.keys(info.files).filter((k) => k.includes('/core/')).map((p) => cache.match(assetUrl(p))))
    const n = hits.filter(Boolean).length
    if (n === needed.length && coreHits.some(Boolean)) return 'ready'
    return n > 0 ? 'partial' : 'missing'
  } catch {
    return 'unsupported'
  }
}

/** OCR dosyalarını çevrimdışı kullanım için önbelleğe indirir. */
export async function downloadOcrAssets(onProgress: (done: number, total: number) => void): Promise<void> {
  const info = await ocrAssetInfo()
  if (!info) throw new Error('OCR dosya listesi alınamadı.')
  const cache = await caches.open('ocr-assets')
  const files = Object.keys(info.files)
  let done = 0
  for (const f of files) {
    const url = assetUrl(f)
    if (!(await cache.match(url))) {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`${f} indirilemedi.`)
      await cache.put(url, res)
    }
    done++
    onProgress(done, files.length)
  }
}
