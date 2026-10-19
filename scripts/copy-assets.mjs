// OCR (Tesseract) ve PDF.js yardımcı dosyalarını public/ altına kopyalar.
// Böylece uygulama bu dosyaları kendi sunucusundan sunar; belgeler hiçbir
// uzak sunucuya gönderilmez.
import { cpSync, mkdirSync, existsSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const nm = join(root, 'node_modules')
const pub = join(root, 'public')

const copies = [
  ['tesseract.js/dist/worker.min.js', 'ocr/worker.min.js'],
  ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'ocr/core/tesseract-core-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'ocr/core/tesseract-core-simd-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js', 'ocr/core/tesseract-core-relaxedsimd-lstm.wasm.js'],
  ['@tesseract.js-data/tur/4.0.0_best_int/tur.traineddata.gz', 'ocr/lang/tur.traineddata.gz'],
  ['@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'ocr/lang/eng.traineddata.gz'],
  ['pdfjs-dist/cmaps', 'pdfjs/cmaps'],
  ['pdfjs-dist/standard_fonts', 'pdfjs/standard_fonts'],
  ['pdfjs-dist/wasm', 'pdfjs/wasm'],
]

const manifest = {}
for (const [from, to] of copies) {
  const src = join(nm, from)
  if (!existsSync(src)) {
    console.warn(`[copy-assets] bulunamadı: ${from}`)
    continue
  }
  const dest = join(pub, to)
  mkdirSync(dirname(dest), { recursive: true })
  cpSync(src, dest, { recursive: true })
  if (statSync(src).isFile()) manifest[to] = statSync(src).size
}
writeFileSync(join(pub, 'ocr', 'manifest.json'), JSON.stringify(manifest, null, 2))
console.log('[copy-assets] OCR ve PDF.js dosyaları public/ altına kopyalandı.')
