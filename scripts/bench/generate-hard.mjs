/* global document */
/**
 * Görüntü/PDF okuma karşılaştırma örnekleri (sentetik, "zor" durumlar) ve doğru cevapları üretir.
 * Gerçek banka belgesi değildir; gerçek belgelerde sık görülen düzen ve bozulmaları taklit eder.
 * Çalıştırma: node scripts/bench/generate-hard.mjs
 */
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, 'cases')
mkdirSync(out, { recursive: true })
const executablePath = process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const browser = await chromium.launch({ executablePath: executablePath || undefined })

// Ortak işlem listesi: [gün, açıklama, tutar (TL), tür]
const TX = [
  [27, 'BİM A.Ş. MODA', 124.22, 'expense'],
  [26, 'CİNEMAXİMUM KADIKÖY', 329.15, 'expense'],
  [25, 'MARTI TECH İSTANBUL', 152.3, 'expense'],
  [24, 'ZARA İADE', 450.0, 'refund'],
  [22, 'TRENDYOL.COM', 1234.56, 'expense'],
  [20, 'A101 YENİ MAĞAZACILIK', 89.9, 'expense'],
  [18, 'SHELL ATAŞEHİR', 2150.0, 'expense'],
  [15, 'GETİR', 412.75, 'expense'],
]
const tl = (v) => v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const iso = (d) => `2026-09-${String(d).padStart(2, '0')}`
const dmy = (d, sep = '.') => `${String(d).padStart(2, '0')}${sep}09${sep}2026`
const truth = {}
const cases = []
const save = (name, rows) => {
  truth[name] = rows
  cases.push(name)
}
const expected = (rows = TX) => rows.map(([d, desc, amt, type]) => ({ date: iso(d), amountKurus: Math.round(amt * 100), type, desc }))

const MOBILE_CSS = `body{margin:0;font-family:'DejaVu Sans',sans-serif}
.bar{padding:18px;font-size:17px;font-weight:bold}.tx{display:flex;justify-content:space-between;align-items:flex-start;padding:12px 18px;border-bottom:1px solid var(--line)}
.m{font-size:15px;font-weight:600}.s{font-size:12px;color:var(--sub);margin-top:4px}.a{font-size:15px;font-weight:700;white-space:nowrap}.pos{color:#10b981}`

async function png(html, file, { width = 390, height = 760, dpr = 2 } = {}) {
  const p = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr })
  await p.setContent(html)
  const buf = await p.screenshot({ fullPage: true })
  await p.close()
  if (file) writeFileSync(join(out, file), buf)
  return buf
}

// 1) Açık tema; tarih ve saat işlemin ALTINDA, tutarlarda Unicode eksi (−) ve "TL"
{
  const rows = TX.map(([d, desc, amt, type]) => `<div class="tx"><div><div class="m">${desc}</div><div class="s">${dmy(d)} ${10 + (d % 9)}:${String(d * 2).padStart(2, '0')}</div></div><div class="a ${type === 'refund' ? 'pos' : ''}">${type === 'refund' ? '+' : '−'}${tl(amt)} TL</div></div>`).join('')
  await png(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><style>:root{--line:#eee;--sub:#777}${MOBILE_CSS}body{background:#fff;color:#111}.bar{background:#004b8d;color:#fff}</style></head><body><div class="bar">Hesap Hareketleri</div>${rows}</body></html>`, 'mobil-tarih-altta.png')
  save('mobil-tarih-altta.png', expected())
}

// 2) Koyu tema; yıl olmadan Türkçe ay adı ("27 Eylül"), ₺ ön ekli tutarlar
{
  const rows = TX.map(([d, desc, amt, type]) => `<div class="tx"><div><div class="m">${desc}</div><div class="s">${d} Eylül · Kredi kartı</div></div><div class="a ${type === 'refund' ? 'pos' : ''}">${type === 'refund' ? '+' : '-'}₺${tl(amt)}</div></div>`).join('')
  await png(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><style>:root{--line:#1f2937;--sub:#9ca3af}${MOBILE_CSS}body{background:#0b1220;color:#e5e7eb}.bar{background:#111827}</style></head><body><div class="bar">Kart Hareketleri<div class="s">Eylül 2026</div></div>${rows}</body></html>`, 'mobil-koyu-yilsiz.png')
  save('mobil-koyu-yilsiz.png', expected())
}

// 3) Telefonla çekilmiş fotoğraf: 1. görselin eğik, gölgeli, gürültülü, JPEG sıkıştırılmış hali
{
  const src = await png(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><style>:root{--line:#ddd;--sub:#666}${MOBILE_CSS}body{background:#fff;color:#111}.bar{background:#004b8d;color:#fff}</style></head><body><div class="bar">Hesap Hareketleri</div>${TX.map(([d, desc, amt, type]) => `<div class="tx"><div><div class="m">${desc}</div><div class="s">${dmy(d)}</div></div><div class="a">${type === 'refund' ? '+' : '-'}${tl(amt)} TL</div></div>`).join('')}</body></html>`, null)
  const p = await browser.newPage({ viewport: { width: 1000, height: 1800 } })
  await p.setContent(`<canvas id="c"></canvas><img id="i" src="data:image/png;base64,${src.toString('base64')}">`)
  const b64 = await p.evaluate(async () => {
    const img = document.getElementById('i')
    await img.decode()
    const W = 900, H = Math.round((img.height / img.width) * 820) + 80
    const c = document.getElementById('c')
    c.width = W
    c.height = H
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#6b6259' // masa
    ctx.fillRect(0, 0, W, H)
    ctx.save()
    ctx.translate(W / 2, H / 2)
    ctx.rotate((3.2 * Math.PI) / 180)
    ctx.transform(1, 0.015, -0.02, 1, 0, 0)
    ctx.drawImage(img, -410, -(H - 80) / 2, 820, H - 80)
    ctx.restore()
    // Eşit olmayan aydınlatma
    const g = ctx.createLinearGradient(0, 0, W, H)
    g.addColorStop(0, 'rgba(255,240,200,0.18)')
    g.addColorStop(1, 'rgba(0,0,0,0.38)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
    // Gürültü ve hafif bulanıklık
    const d = ctx.getImageData(0, 0, W, H)
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let k = 0; k < d.data.length; k += 4) {
      const n = (rnd() - 0.5) * 38
      d.data[k] += n
      d.data[k + 1] += n
      d.data[k + 2] += n
    }
    ctx.putImageData(d, 0, 0)
    ctx.filter = 'blur(0.6px)'
    ctx.drawImage(c, 0, 0)
    return c.toDataURL('image/jpeg', 0.55).split(',')[1]
  })
  await p.close()
  writeFileSync(join(out, 'telefon-fotografi.jpg'), Buffer.from(b64, 'base64'))
  save('telefon-fotografi.jpg', expected())
}

// 4) Farklı düzende metin PDF: gg/aa/yyyy, "TL" sonekli tutarlar, iki satıra bölünen açıklama,
//    taksit sütunu, puan sütunu, sayfa başlığı ve ödeme satırı
const PDF_TX = [
  [1, 'MİGROS TİCARET A.Ş.', 'KADIKÖY İSTANBUL', 1234.56, 'expense', '', '12,35'],
  [3, 'TEKNOSA İÇ VE DIŞ TİC.', 'ATAŞEHİR', 1000.0, 'expense', '3/12', '0,00'],
  [5, 'HESABINIZDAN YAPILAN ÖDEME', '', 8450.0, 'transfer', '', ''],
  [7, 'NETFLIX.COM', 'AMSTERDAM NL', 229.99, 'expense', '', '2,30'],
  [9, 'KOTON MAĞAZACILIK İADE', '', 350.0, 'refund', '', ''],
  [12, 'TURKCELL FATURA', 'OTOMATİK ÖDEME', 389.0, 'expense', '', '3,89'],
  [14, 'YEMEKSEPETİ', '', 256.4, 'expense', '', '2,56'],
]
const pdfHtml = (scan = false) => `<!doctype html><html lang="tr"><head><meta charset="utf-8"><style>
body{font-family:'DejaVu Sans',sans-serif;font-size:10.5px;color:#111;margin:28px}
h1{font-size:15px;margin:0}.meta{display:flex;justify-content:space-between;margin:10px 0 14px;font-size:10px}
table{width:100%;border-collapse:collapse}th{text-align:left;border-bottom:1.5px solid #333;padding:5px 4px;font-size:10px}
td{padding:5px 4px;vertical-align:top;border-bottom:1px solid #ddd}.r{text-align:right;white-space:nowrap}.sub{color:#555;font-size:9.5px}
${scan ? 'body{filter:contrast(0.9)}' : ''}
</style></head><body>
<h1>KART EKSTRESİ (SENTETİK ÖRNEK)</h1>
<div class="meta"><div>Hesap Kesim Tarihi: 20/09/2026<br>Son Ödeme Tarihi: 30/09/2026</div><div>Dönem Borcu: 4.510,39 TL<br>Asgari Ödeme Tutarı: 1.804,16 TL</div></div>
<table><thead><tr><th>İşlem Tarihi</th><th>Açıklama</th><th>Taksit</th><th class="r">Tutar (TL)</th><th class="r">Puan</th></tr></thead><tbody>
${PDF_TX.map(([d, a, b, amt, type, inst, puan]) => `<tr><td>${dmy(d, '/')}</td><td>${a}${b ? `<div class="sub">${b}</div>` : ''}</td><td>${inst}</td><td class="r">${type === 'expense' ? '' : '-'}${tl(amt)} TL</td><td class="r">${puan}</td></tr>`).join('')}
</tbody></table>
<p style="margin-top:14px">Dönem İçi Harcamalar Toplamı: 3.759,95 TL</p>
</body></html>`
const pdfTruth = PDF_TX.map(([d, a, , amt, type]) => ({ date: iso(d), amountKurus: Math.round(amt * 100), type, desc: a }))
{
  const p = await browser.newPage()
  await p.setContent(pdfHtml())
  await p.pdf({ path: join(out, 'ekstre-farkli-duzen.pdf'), format: 'A4', printBackground: true })
  await p.close()
  save('ekstre-farkli-duzen.pdf', pdfTruth)
}
// 5) Aynı ekstrenin düşük kaliteli taraması (hafif eğik, gri, gürültülü)
{
  const p = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1.6 })
  await p.setContent(pdfHtml(true))
  const shotBuf = await p.screenshot()
  await p.setContent(`<canvas id="c"></canvas><img id="i" src="data:image/png;base64,${shotBuf.toString('base64')}">`)
  const b64 = await p.evaluate(async () => {
    const img = document.getElementById('i')
    await img.decode()
    const c = document.getElementById('c')
    c.width = img.width
    c.height = img.height
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#f4f1ea'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.translate(c.width / 2, c.height / 2)
    ctx.rotate((1.1 * Math.PI) / 180)
    ctx.drawImage(img, -img.width / 2, -img.height / 2)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    const d = ctx.getImageData(0, 0, c.width, c.height)
    let seed = 3
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let k = 0; k < d.data.length; k += 4) {
      const g = 0.3 * d.data[k] + 0.59 * d.data[k + 1] + 0.11 * d.data[k + 2] + (rnd() - 0.5) * 30
      d.data[k] = d.data[k + 1] = d.data[k + 2] = g
    }
    ctx.putImageData(d, 0, 0)
    return c.toDataURL('image/jpeg', 0.6).split(',')[1]
  })
  await p.setContent(`<!doctype html><html><head><style>@page{size:A4;margin:0}body{margin:0}img{width:210mm;height:297mm;display:block}</style></head><body><img src="data:image/jpeg;base64,${b64}"></body></html>`)
  await p.pdf({ path: join(out, 'ekstre-taranmis-dusuk-kalite.pdf'), format: 'A4', printBackground: true })
  await p.close()
  save('ekstre-taranmis-dusuk-kalite.pdf', pdfTruth)
}

writeFileSync(join(out, 'truth.json'), JSON.stringify(truth, null, 2))
await browser.close()
console.log('Üretildi:', cases.join(', '))
