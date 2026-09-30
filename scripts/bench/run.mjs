/**
 * Görüntü/PDF okuma karşılaştırması: scripts/bench/cases altındaki sentetik örnekleri
 * uygulamanın kendi okuma kodu ile (tarayıcıda, yerel OCR) okur ve truth.json ile karşılaştırır.
 * Satır sayılır: tarih + tutar + tür doğruysa "tam", yalnız tutar doğruysa "tutar".
 * Çalıştırma: node scripts/bench/run.mjs   (önce: node scripts/bench/generate-hard.mjs)
 */
import { chromium } from '@playwright/test'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const here = dirname(fileURLToPath(import.meta.url))
const casesDir = join(here, 'cases')
const truth = JSON.parse(readFileSync(join(casesDir, 'truth.json'), 'utf8'))
const only = process.argv[2]

const server = await createServer({ root: join(here, '../..'), server: { port: 5199, strictPort: true }, logLevel: 'error' })
await server.listen()
const executablePath = process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const browser = await chromium.launch({ executablePath: executablePath || undefined })
const page = await browser.newPage()
await page.goto('http://localhost:5199/')

let totalFull = 0
let totalAmount = 0
let totalExpected = 0
let totalExtra = 0
for (const name of readdirSync(casesDir).filter((f) => truth[f] && (!only || f.includes(only)))) {
  const b64 = readFileSync(join(casesDir, name)).toString('base64')
  const t0 = Date.now()
  const out = await page.evaluate(
    async ({ name, b64 }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const { OcrSession } = await import('/src/import/ocr.ts')
      const { parseStatement } = await import('/src/import/statement.ts')
      const session = new OcrSession()
      let doc
      if (name.endsWith('.pdf')) {
        const { readPdf } = await import('/src/import/pdf.ts')
        doc = await readPdf(bytes.buffer, {
          ocr: async () => {
            await session.init(() => {})
            return session
          },
        })
      } else {
        const { loadImage, prepareImage } = await import('/src/import/image.ts')
        await session.init(() => {})
        const bmp = await loadImage(new Blob([bytes]))
        const canvas = prepareImage(bmp, { rotation: 0, crop: null, enhance: true })
        const res = await session.recognize(canvas, 1)
        doc = { kind: 'image', lines: res.lines, pages: [], rawText: res.text, usedOcr: true }
      }
      await session.dispose()
      const parsed = parseStatement(doc)
      return {
        rows: parsed.rows.map((r) => ({ date: r.date, amountKurus: r.amountKurus, type: r.type, desc: r.description })),
        text: doc.rawText,
      }
    },
    { name, b64 },
  )
  const exp = truth[name]
  const used = new Set()
  let full = 0
  let amount = 0
  const misses = []
  for (const e of exp) {
    let i = out.rows.findIndex((r, k) => !used.has(k) && r.amountKurus === e.amountKurus && r.date === e.date && r.type === e.type)
    if (i >= 0) {
      full++
      amount++
      used.add(i)
      continue
    }
    i = out.rows.findIndex((r, k) => !used.has(k) && r.amountKurus === e.amountKurus)
    if (i >= 0) {
      amount++
      used.add(i)
      misses.push(`  ~ ${e.desc}: beklenen ${e.date} ${e.type}, okunan ${out.rows[i].date} ${out.rows[i].type}`)
    } else misses.push(`  - ${e.desc} ${e.date} ${e.amountKurus} ${e.type} okunamadı`)
  }
  const extra = out.rows.filter((_, k) => !used.has(k))
  totalFull += full
  totalAmount += amount
  totalExpected += exp.length
  totalExtra += extra.length
  console.log(`${name}: tam ${full}/${exp.length}, tutar ${amount}/${exp.length}, fazla ${extra.length} (${((Date.now() - t0) / 1000).toFixed(1)} sn)`)
  if (process.env.VERBOSE) {
    for (const m of misses) console.log(m)
    for (const x of extra) console.log(`  + fazla: ${x.date} ${x.amountKurus} ${x.type} ${x.desc}`)
    if (process.env.VERBOSE === '2') console.log(out.text)
  }
}
console.log(`TOPLAM: tam ${totalFull}/${totalExpected}, tutar ${totalAmount}/${totalExpected}, fazla ${totalExtra}`)
await browser.close()
await server.close()
