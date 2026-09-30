// Sentetik örnek içe aktarma dosyalarını ve uygulama ikonlarını üretir.
// Tüm veriler UYDURMADIR; hiçbir gerçek bankanın biçimini temsil etmez.
// Kullanım: npm run samples   (Chromium için Playwright gerekir)
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import writeXlsxFile from 'write-excel-file/node'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'public', 'ornek-dosyalar')
mkdirSync(out, { recursive: true })
mkdirSync(join(root, 'public', 'icons'), { recursive: true })

const exe = process.env.CHROMIUM_PATH ?? ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p))
const browser = await chromium.launch(exe ? { executablePath: exe } : {})

const tl = (k) => {
  const neg = k < 0
  const a = Math.abs(k)
  const s = Math.trunc(a / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + String(a % 100).padStart(2, '0')
  return (neg ? '-' : '') + s
}

// ---------- Kredi kartı ekstresi (metin PDF) ----------
const rows = [
  ['01.09.2026', 'MİGROS KADIKÖY', '', 123456],
  ['02.09.2026', 'SHELL ATAŞEHİR', '', 185000],
  ['03.09.2026', 'TEKNOSA ATAŞEHİR', '3/12', 100000, 1200000],
  ['04.09.2026', 'STARBUCKS BAĞDAT CAD', '', 14500],
  ['05.09.2026', 'ÖDEMENİZ İÇİN TEŞEKKÜR EDERİZ', '', -845000],
  ['06.09.2026', 'ZARA İADE', '', -45000],
  ['08.09.2026', 'NETFLIX.COM<span style="display:inline-block;width:40px"></span>9,99 USD', '', 32967],
  ['10.09.2026', 'A101 YENİ MAĞAZACILIK', '', 28745],
  ['12.09.2026', 'İGDAŞ DOĞALGAZ', '', 112030],
  ['14.09.2026', 'KUAFÖR SELİN', '', 65000],
  ['18.09.2026', 'YEMEKSEPETİ', '', 41290],
  ['20.09.2026', 'AKDİ FAİZ', '', 4520],
  ['20.09.2026', 'BSMV', '', 678],
  ['22.09.2026', 'ECZANE YAŞAM', '', 23840],
]
const spend = rows.filter((r) => r[3] > 0).reduce((s, r) => s + r[3], 0)
const refunds = 45000
const prev = 845000
const payment = 845000
const periodTotal = spend - refunds
const debt = prev + periodTotal - payment

const statementHtml = (scanned = false) => `<!doctype html><html lang="tr"><head><meta charset="utf-8"><style>
  body{font-family:'DejaVu Sans',sans-serif;color:#111;margin:36px 40px;font-size:11px}
  h1{font-size:18px;margin:0}.muted{color:#555}
  .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0b1220;padding-bottom:10px}
  .sum{display:grid;grid-template-columns:1fr 1fr;gap:4px 40px;margin:14px 0 18px}
  .sum div{display:flex;justify-content:space-between}
  table{width:100%;border-collapse:collapse}
  th{text-align:left;border-bottom:1px solid #333;padding:5px 4px;font-size:10.5px}
  td{padding:5px 4px;border-bottom:1px solid #ddd}
  .r{text-align:right}.tot td{font-weight:bold;border-top:1px solid #333}
  .note{margin-top:18px;font-size:9px;color:#666}
  ${scanned ? 'body{filter:contrast(1.05)} .page{transform:rotate(0.4deg)}' : ''}
</style></head><body><div class="page">
<div class="top"><div><h1>ATLAS BANK (SENTETİK)</h1><div class="muted">Kredi Kartı Hesap Özeti — test amaçlı uydurma belge</div></div>
<div class="r"><div>Kart: **** **** **** 0000</div><div>Kart takma adı: Test Kartı</div></div></div>
<div class="sum">
  <div><span>Hesap Kesim Tarihi</span><span>25.09.2026</span></div>
  <div><span>Son Ödeme Tarihi</span><span>05.10.2026</span></div>
  <div><span>Önceki Dönem Borcu</span><span>${tl(prev)}</span></div>
  <div><span>Dönem Borcu</span><span>${tl(debt)}</span></div>
  <div><span>Asgari Ödeme Tutarı</span><span>${tl(Math.round(debt * 0.4))}</span></div>
  <div><span>Kart Limiti</span><span>50.000,00</span></div>
</div>
<table><thead><tr><th style="width:80px">Tarih</th><th>Açıklama</th><th style="width:60px">Taksit</th><th class="r" style="width:90px">Tutar (TL)</th></tr></thead><tbody>
${rows
  .map(
    (r) =>
      `<tr><td>${r[0]}</td><td>${r[1]}${r[4] ? `<span style="display:inline-block;width:40px"></span><span class="muted">${tl(r[4])}</span>` : ''}</td><td>${r[2]}</td><td class="r">${tl(r[3])}</td></tr>`,
  )
  .join('\n')}
<tr class="tot"><td></td><td>Dönem İçi Harcamalar Toplamı</td><td></td><td class="r">${tl(periodTotal)}</td></tr>
</tbody></table>
<p class="note">Bu belge ${'Harcama Atlası'} uygulamasının test edilmesi için üretilmiş sentetik bir örnektir. Gerçek bir bankaya, karta veya kişiye ait değildir.</p>
</div></body></html>`

const page = await browser.newPage()
await page.setContent(statementHtml())
await page.pdf({ path: join(out, 'ornek-kredi-karti-ekstresi.pdf'), format: 'A4', printBackground: true })

// ---------- Taranmış (yalnızca görüntü) PDF ----------
const scanPage = await browser.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 2 })
await scanPage.setContent(statementHtml(true))
const scanPng = await scanPage.screenshot({ fullPage: true })
await page.setContent(`<!doctype html><html><body style="margin:0"><img src="data:image/png;base64,${scanPng.toString('base64')}" style="width:100%"></body></html>`)
await page.pdf({ path: join(out, 'ornek-taranmis-ekstre.pdf'), format: 'A4', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } })

// ---------- Şifreli PDF (parola: 1234) ----------
try {
  execFileSync('python3', [
    '-c',
    `import pypdf,sys
r=pypdf.PdfReader(sys.argv[1]); w=pypdf.PdfWriter()
[w.add_page(p) for p in r.pages]
w.encrypt(user_password="1234", owner_password="sahip-1234", algorithm="AES-128")
w.write(sys.argv[2])`,
    join(out, 'ornek-kredi-karti-ekstresi.pdf'),
    join(out, 'ornek-sifreli-ekstre-parola-1234.pdf'),
  ])
} catch (e) {
  console.warn('Şifreli PDF üretilemedi (pypdf gerekli):', e.message)
}

// ---------- Mobil bankacılık ekran görüntüsü (PNG) ----------
const shot = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 })
await shot.setContent(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><style>
  body{margin:0;font-family:'DejaVu Sans',sans-serif;background:#fff;color:#111}
  .bar{background:#0b1220;color:#fff;padding:18px 18px 14px;font-size:17px;font-weight:bold}
  .sub{font-size:12px;color:#9aa5b8;font-weight:normal;margin-top:2px}
  .day{padding:14px 18px 6px;font-size:13px;color:#555;font-weight:bold;background:#f3f4f6}
  .tx{display:flex;justify-content:space-between;padding:12px 18px;border-bottom:1px solid #eee;font-size:15px}
  .cat{font-size:12px;color:#777;margin-top:3px}.amt{font-weight:bold}.pos{color:#059669}
</style></head><body>
<div class="bar">Atlas Mobil (sentetik)<div class="sub">Kart hareketleri · test görseli</div></div>
<div class="day">15 Eylül 2026 Salı</div>
<div class="tx"><div>STARBUCKS BAĞDAT CAD<div class="cat">Kafe</div></div><div class="amt">-145,00 TL</div></div>
<div class="tx"><div>MİGROS KADIKÖY<div class="cat">Market</div></div><div class="amt">-842,35 TL</div></div>
<div class="day">14 Eylül 2026 Pazartesi</div>
<div class="tx"><div>OPET KOZYATAĞI<div class="cat">Akaryakıt</div></div><div class="amt">-1.650,00 TL</div></div>
<div class="tx"><div>DEFACTO İADE<div class="cat">Giyim</div></div><div class="amt pos">+449,90 TL</div></div>
<div class="day">12 Eylül 2026 Cumartesi</div>
<div class="tx"><div>YEMEKSEPETİ<div class="cat">Yemek</div></div><div class="amt">-386,50 TL</div></div>
<div class="tx"><div>BİTAKSİ<div class="cat">Ulaşım</div></div><div class="amt">-212,00 TL</div></div>
</body></html>`)
await shot.screenshot({ path: join(out, 'ornek-ekran-goruntusu.png') })

// ---------- İkonlar ----------
const svg = readFileSync(join(root, 'public', 'favicon.svg'), 'utf8')
for (const size of [192, 512]) {
  const p = await browser.newPage({ viewport: { width: size, height: size } })
  await p.setContent(`<html><body style="margin:0;background:#0b1220">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`)
  await p.screenshot({ path: join(root, 'public', 'icons', `icon-${size}.png`) })
}
await browser.close()

// ---------- CSV (UTF-8 BOM, noktalı virgül, kart ekstresi) ----------
const csv = [
  'ATLAS BANK (SENTETİK) - Kart hareketleri',
  'İşlem Tarihi;Açıklama;Tutar;Kategori',
  '01.09.2026;MİGROS KADIKÖY;1.234,56;',
  '02.09.2026;SHELL ATAŞEHİR;1.850,00;',
  '04.09.2026;STARBUCKS BAĞDAT CAD;145,00;',
  '05.09.2026;ÖDEMENİZ İÇİN TEŞEKKÜR EDERİZ;-8.450,00;',
  '06.09.2026;ZARA İADE;-450,00;',
  '07.09.2026;NETFLIX.COM;229,99;Abonelikler',
  '09.09.2026;KUAFÖR SELİN;650,00;',
  '11.09.2026;AMAZON US;25,00 USD;',
  '13.09.2026;"LC WAIKIKI; OUTLET";899,90;',
  '16.09.2026;=HYPERLINK("http://ornek.invalid";"tikla");10,00;',
  ';Dönem Borcu;5.604,35;',
].join('\r\n')
writeFileSync(join(out, 'ornek-kart-ekstresi.csv'), '﻿' + csv, 'utf8')

// ---------- CSV (Windows-1254, virgül, banka hesap hareketleri borç/alacak) ----------
const cp1254 = { ş: 0xfe, Ş: 0xde, ı: 0xfd, İ: 0xdd, ğ: 0xf0, Ğ: 0xd0, ü: 0xfc, Ü: 0xdc, ö: 0xf6, Ö: 0xd6, ç: 0xe7, Ç: 0xc7 }
const acc = [
  'Tarih,Açıklama,Borç,Alacak,Bakiye',
  '01/09/2026,KİRA ÖDEMESİ EFT,"18.500,00",,"41.500,00"',
  '03/09/2026,BİM A.Ş. ÜSKÜDAR,"312,40",,"41.187,60"',
  '05/09/2026,MAAŞ ÖDEMESİ,,"60.000,00","101.187,60"',
  '08/09/2026,ENERJİSA ELEKTRİK,"784,15",,"100.403,45"',
  '10/09/2026,BOYNER İADE,,"299,00","100.702,45"',
  '12/09/2026,ŞOK MARKETLER,"156,75",,"100.545,70"',
].join('\r\n')
writeFileSync(join(out, 'ornek-hesap-hareketleri-windows1254.csv'), Buffer.from([...acc].map((c) => cp1254[c] ?? c.charCodeAt(0))))

// ---------- XLSX (iki sayfa; formül hücresi çalıştırılmaz) ----------
const d = (y, m, day) => new Date(Date.UTC(y, m - 1, day))
const HEADER = ['Tarih', 'Açıklama', 'Tutar', 'Para Birimi'].map((value) => ({ value, fontWeight: 'bold' }))
const xRows = [
  [d(2026, 8, 3), 'MİGROS KADIKÖY', 985.4, 'TRY'],
  [d(2026, 8, 5), 'OPET OTOYOL', 1720, 'TRY'],
  [d(2026, 8, 9), 'SPOTIFY', 99.99, 'TRY'],
  [d(2026, 8, 14), 'EBEBEK ATAŞEHİR', 764.3, 'TRY'],
  [d(2026, 8, 20), 'BOOKING.COM', 120, 'EUR'],
  [d(2026, 8, 27), 'CİNEMAXİMUM', 420, 'TRY'],
].map(([date, desc, amt, cur]) => [{ value: date, type: Date, format: 'dd.mm.yyyy' }, { value: desc }, { value: amt, type: Number, format: '#,##0.00' }, { value: cur }])
await writeXlsxFile(
  [
    { sheet: 'Özet', data: [[{ value: 'Sentetik test dosyası' }], [{ value: 'Ağustos 2026 kart hareketleri' }]] },
    { sheet: 'Hareketler', data: [HEADER, ...xRows, [null, { value: 'Toplam (formül)' }, { value: 'SUM(C2:C7)', type: 'Formula' }, null]], columns: [{ width: 12 }, { width: 28 }, { width: 12 }, { width: 10 }] },
  ],
  {},
).toFile(join(out, 'ornek-kart-hareketleri.xlsx'))

writeFileSync(
  join(out, 'index.html'),
  `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sentetik örnek dosyalar</title>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 16px;line-height:1.6;color:#0e1726;background:#f6f5f0}a{color:#047857}code{background:#e8e7e0;padding:1px 5px;border-radius:4px}</style></head><body>
<h1>Sentetik örnek dosyalar</h1>
<p>Bu dosyalar tamamen uydurmadır ve yalnızca içe aktarma akışını denemek içindir. <strong>Gerçek banka biçimleriyle uyumluluğu kanıtlamaz.</strong></p>
<ul>
<li><a href="ornek-kredi-karti-ekstresi.pdf">ornek-kredi-karti-ekstresi.pdf</a> — metin içeren PDF: taksit (3/12), iade, kart ödemesi, döviz, faiz/BSMV, özet satırları.</li>
<li><a href="ornek-taranmis-ekstre.pdf">ornek-taranmis-ekstre.pdf</a> — aynı ekstrenin yalnızca görüntü (taranmış) hali; OCR ile okunur.</li>
<li><a href="ornek-sifreli-ekstre-parola-1234.pdf">ornek-sifreli-ekstre-parola-1234.pdf</a> — parola korumalı PDF (parola: <code>1234</code>).</li>
<li><a href="ornek-ekran-goruntusu.png">ornek-ekran-goruntusu.png</a> — mobil uygulama ekran görüntüsü; tarih başlıkları altında işlemler.</li>
<li><a href="ornek-kart-ekstresi.csv">ornek-kart-ekstresi.csv</a> — UTF-8 BOM, noktalı virgül, Türkçe tutarlar, döviz satırı, formül enjeksiyonu denemesi.</li>
<li><a href="ornek-hesap-hareketleri-windows1254.csv">ornek-hesap-hareketleri-windows1254.csv</a> — Windows-1254 kodlama, virgül ayırıcı, borç/alacak sütunları.</li>
<li><a href="ornek-kart-hareketleri.xlsx">ornek-kart-hareketleri.xlsx</a> — iki sayfalı Excel; Excel tarih hücreleri, EUR satırı, çalıştırılmayan formül.</li>
</ul></body></html>`,
)
console.log('Sentetik örnekler üretildi:', out)
