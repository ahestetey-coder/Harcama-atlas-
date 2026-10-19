/**
 * Sentetik örnek dosyalarla uçtan uca ayrıştırma testi (Node ortamında).
 * Not: Sentetik dosyalar gerçek banka biçimleriyle uyumluluğu kanıtlamaz.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildDefaultCategories, buildDefaultRules } from '../data/seed'
import { applyRules, reviewCounts } from './enrich'
import { guessMapping, rowsFromMapping } from './mapping'
import { groupTextItems } from './pdf'
import { parseCsv } from './sheet'
import { parseStatement } from './statement'
import type { DocLine, ParsedDocument, SheetTable } from './types'

const dir = join(__dirname, '../../public/ornek-dosyalar')
const now = '2026-01-01T00:00:00.000Z'
const categories = buildDefaultCategories(now)
const rules = buildDefaultRules(now)
const active = new Set(categories.map((c) => c.id))
const buf = (f: string) => {
  const b = readFileSync(join(dir, f))
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}

async function pdfLines(file: string, password?: string): Promise<DocLine[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf(file)), password, useSystemFonts: false }).promise
  const lines: DocLine[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const tc = await page.getTextContent()
    lines.push(...groupTextItems(tc.items as never, p, page.getViewport({ scale: 1 }).height))
  }
  return lines
}

describe('sentetik metin PDF ekstresi', async () => {
  const lines = await pdfLines('ornek-kredi-karti-ekstresi.pdf')
  const doc: ParsedDocument = { kind: 'pdf', lines, pages: [], rawText: lines.map((l) => l.text).join('\n'), usedOcr: false }
  const out = parseStatement(doc)
  const rows = applyRules(out.rows, rules, categories)
  const by = (d: string) => rows.find((r) => r.description.startsWith(d))
  it('bütün işlem satırlarını konumlu metinden çıkarır', () => {
    expect(rows.length).toBe(14)
    expect(by('MİGROS')).toMatchObject({ date: '2026-09-01', amountKurus: 123456, type: 'expense', categoryId: 'cat-market' })
  })
  it('taksit, iade, ödeme, döviz ve faiz satırları', () => {
    expect(by('TEKNOSA')).toMatchObject({ amountKurus: 100000, installment: { current: 3, total: 12, purchaseTotalKurus: 1200000 } })
    expect(by('ÖDEMENİZ')?.type).toBe('transfer')
    expect(by('ZARA')).toMatchObject({ type: 'refund', amountKurus: 45000 })
    expect(by('NETFLIX')).toMatchObject({ amountKurus: 32967, foreign: { currency: 'USD', amountMinor: 999 } })
    expect(by('AKDİ FAİZ')?.categoryId).toBe('cat-banka')
  })
  it('özet satırlarını almaz, işlem toplamını bulur', () => {
    expect(rows.some((r) => /Borcu|Limit|Asgari|Kesim/i.test(r.description))).toBe(false)
    expect(out.totals.length).toBe(1)
    expect(out.periodText).toMatch(/25\.09\.2026/)
  })
  it('kullanıcı eksik kategorileri seçince kaynak toplamıyla eşleşir', () => {
    const fixed = rows.map((r) => (r.type === 'expense' && !r.categoryId ? { ...r, categoryId: 'cat-diger', categorySource: 'manual' as const } : r))
    const c = reviewCounts(fixed, active)
    expect(c.problem).toBe(0)
    expect(c.expenseKurus - c.refundKurus).toBe(out.totals[0].amountKurus)
  })
})

describe('parolalı PDF', () => {
  it('parolasız açılmaz, doğru parolayla aynı sonucu verir', async () => {
    await expect(pdfLines('ornek-sifreli-ekstre-parola-1234.pdf')).rejects.toMatchObject({ name: 'PasswordException' })
    const lines = await pdfLines('ornek-sifreli-ekstre-parola-1234.pdf', '1234')
    expect(parseStatement({ kind: 'pdf', lines, pages: [], rawText: '', usedOcr: false }).rows.length).toBe(14)
  })
})

describe('taranmış PDF', () => {
  it('metin katmanı yoktur (OCR gerekir)', async () => {
    const lines = await pdfLines('ornek-taranmis-ekstre.pdf')
    expect(lines.map((l) => l.text).join('').length).toBeLessThan(25)
  })
})

describe('sentetik CSV dosyaları', () => {
  it('UTF-8 BOM noktalı virgüllü kart ekstresi', () => {
    const { table, delimiter } = parseCsv(buf('ornek-kart-ekstresi.csv'))
    expect(delimiter).toBe(';')
    const rows = applyRules(rowsFromMapping(table, guessMapping(table), categories), rules, categories)
    expect(rows.find((r) => r.description.startsWith('LC WAIKIKI'))).toMatchObject({ amountKurus: 89990, categoryId: 'cat-giyim' })
    expect(rows.find((r) => r.description.startsWith('AMAZON'))?.amountKurus).toBeNull()
    expect(rows.find((r) => r.description.startsWith('=HYPERLINK'))).toBeTruthy()
  })
  it('Windows-1254 borç/alacak hesap hareketleri', () => {
    const r = parseCsv(buf('ornek-hesap-hareketleri-windows1254.csv'))
    expect(r.encoding).toBe('windows-1254')
    const m = guessMapping(r.table)
    expect(m.amountMode).toBe('debitCredit')
    const rows = rowsFromMapping(r.table, m, categories)
    expect(rows.find((x) => x.description === 'ŞOK MARKETLER')?.amountKurus).toBe(15675)
    expect(rows.find((x) => x.description === 'MAAŞ ÖDEMESİ')).toMatchObject({ include: false, type: 'transfer' })
    expect(rows.find((x) => x.description === 'BOYNER İADE')).toMatchObject({ include: true, type: 'refund' })
  })
})

describe('sentetik XLSX', () => {
  it('sayfaları okur, tarihleri gün kaymadan alır, formülü çalıştırmaz', async () => {
    const { default: read } = await import('read-excel-file/node')
    const sheets = await read(readFileSync(join(dir, 'ornek-kart-hareketleri.xlsx')))
    expect(sheets.map((s) => s.sheet)).toEqual(['Özet', 'Hareketler'])
    const table: SheetTable = { name: 'Hareketler', rows: sheets[1].data as never }
    const m = guessMapping(table)
    const rows = rowsFromMapping(table, m, categories)
    expect(rows[0]).toMatchObject({ date: '2026-08-03', amountKurus: 98540 })
    expect(rows.find((r) => r.description === 'BOOKING.COM')).toMatchObject({ amountKurus: null, foreign: { currency: 'EUR', amountMinor: 12000 } })
    const formulaRow = rows.find((r) => r.description.startsWith('Toplam'))
    expect(formulaRow?.amountKurus ?? null).toBeNull()
  })
})
