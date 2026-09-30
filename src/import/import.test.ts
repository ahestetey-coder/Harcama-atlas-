import { describe, expect, it } from 'vitest'
import { buildDefaultCategories, buildDefaultRules } from '../data/seed'
import { normalizeText } from '../domain/normalize'
import type { Transaction } from '../domain/types'
import { applyRules, markDuplicates, reviewCounts, rowProblems } from './enrich'
import { guessMapping, rowsFromMapping } from './mapping'
import { detectDelimiter, parseCsv } from './sheet'
import { parseStatement } from './statement'
import { decodeText, repairMojibake } from './text'
import type { DocLine, ParsedDocument } from './types'

const now = '2026-01-01T00:00:00.000Z'
const categories = buildDefaultCategories(now)
const rules = buildDefaultRules(now)
const activeIds = new Set(categories.map((c) => c.id))
const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer

/** Windows-1254 kodlaması (yalnızca testte kullanılan Türkçe harfler) */
function cp1254(s: string): ArrayBuffer {
  const map: Record<string, number> = { ş: 0xfe, Ş: 0xde, ı: 0xfd, İ: 0xdd, ğ: 0xf0, Ğ: 0xd0, ü: 0xfc, Ü: 0xdc, ö: 0xf6, Ö: 0xd6, ç: 0xe7, Ç: 0xc7 }
  return new Uint8Array([...s].map((ch) => map[ch] ?? ch.charCodeAt(0))).buffer
}

describe('metin kod çözme', () => {
  it('UTF-8 BOM, Windows-1254 ve bozuk karakter onarımı', () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('Şok;İade')])
    expect(decodeText(bom.buffer).text).toBe('Şok;İade')
    const w = decodeText(cp1254('Açıklama;Tutar\nŞOK MARKET;12,50'))
    expect(w.encoding).toBe('windows-1254')
    expect(w.text).toContain('ŞOK MARKET')
    expect(repairMojibake('MÄ°GROS KADIKÃ–Y')).toBe('MİGROS KADIKÖY')
    expect(repairMojibake('Normal metin')).toBeNull()
  })
  it('ayırıcıyı tırnak içini sayarak bulur', () => {
    expect(detectDelimiter('Tarih;Açıklama;Tutar\n01.09.2026;"A;B";1.234,56')).toBe(';')
    expect(detectDelimiter('Tarih,Açıklama,Tutar\n01.09.2026,"A","1.234,56"')).toBe(',')
    expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t')
  })
})

describe('CSV sütun eşleştirme', () => {
  const csv = [
    'Hesap: Test Kartı',
    'İşlem Tarihi;Açıklama;Tutar;Kategori',
    '01.09.2026;MİGROS KADIKÖY;1.234,56;',
    '02.09.2026;SHELL ATAŞEHİR;850,00;',
    '03.09.2026;XYZ DANIŞMANLIK;100,00;',
    '04.09.2026;ZARA İADE;-450,00;',
    '05.09.2026;ÖDEMENİZ İÇİN TEŞEKKÜR;-5.000,00;',
    '06.09.2026;NETFLIX;99,99;Eğlence',
    ';Dönem Borcu;12.345,00;',
    '07.09.2026;AMAZON US;25,00 USD;',
    '08.09.2026;BELİRSİZ;1.234;',
  ].join('\n')
  const { table } = parseCsv(enc(csv))
  const m = guessMapping(table)
  it('başlık satırını ve sütunları tahmin eder', () => {
    expect(m.headerRow).toBe(1)
    expect([m.date, m.description, m.amount, m.category]).toEqual([0, 1, 2, 3])
    expect(m.numberFormat).toBe('tr')
    expect(m.statementKind).toBe('card')
  })
  const rows = applyRules(rowsFromMapping(table, m, categories), rules, categories)
  const by = (d: string) => rows.find((r) => r.description.startsWith(d))!
  it('türleri doğru belirler, kart ödemesini transfer yapar', () => {
    expect(by('MİGROS')).toMatchObject({ amountKurus: 123456, type: 'expense', categoryId: 'cat-market' })
    expect(by('ZARA')).toMatchObject({ amountKurus: 45000, type: 'refund' })
    expect(by('ÖDEMENİZ')).toMatchObject({ amountKurus: 500000, type: 'transfer' })
    expect(by('NETFLIX')).toMatchObject({ categoryId: 'cat-eglence', categorySource: 'file' })
  })
  it('tanınmayan iş yerine kategori uydurmaz', () => {
    expect(by('XYZ').categoryId).toBeNull()
    expect(rowProblems(by('XYZ'), activeIds).map((p) => p.field)).toContain('category')
  })
  it('özet satırını dışarıda bırakır, dövizi TL karşılığı olmadan kaydetmez, belirsizi sorar', () => {
    const borc = rows.find((r) => r.description === 'Dönem Borcu')
    expect(borc === undefined || borc.include === false).toBe(true)
    expect(by('AMAZON')).toMatchObject({ amountKurus: null, foreign: { currency: 'USD', amountMinor: 2500 } })
    expect(rowProblems(by('AMAZON'), activeIds)[0].field).toBe('currency')
    expect(by('BELİRSİZ').amountKurus).toBe(123400) // sütun Türkçe biçimli → binlik ayırıcı
  })
  it('sayımlar', () => {
    const c = reviewCounts(rows, activeIds)
    expect(c.valid).toBe(5)
    expect(c.problem).toBe(3) // XYZ (kategori), AMAZON (döviz), BELİRSİZ (kategori)
  })
})

describe('banka hesap hareketleri (borç/alacak)', () => {
  const csv = 'Tarih,Açıklama,Borç,Alacak\n01/09/2026,A101 MAĞAZA,"45,50",\n02/09/2026,MAAŞ ÖDEMESİ,,"50.000,00"\n03/09/2026,BOYNER İADE,,"300,00"'
  const { table } = parseCsv(enc(csv))
  const m = guessMapping(table)
  const rows = rowsFromMapping(table, m, categories)
  it('gelen parayı iade saymaz, varsayılan olarak dışarıda bırakır', () => {
    expect(m.amountMode).toBe('debitCredit')
    expect(rows[0]).toMatchObject({ type: 'expense', amountKurus: 4550 })
    expect(rows[1]).toMatchObject({ type: 'transfer', include: false })
    expect(rows[2]).toMatchObject({ type: 'refund', amountKurus: 30000, include: true })
  })
})

function line(page: number, index: number, cells: Array<[number, string]>): DocLine {
  return { page, index, y: index * 12, origin: 'text', cells: cells.map(([x, text]) => ({ x, x2: x + text.length * 5, text })), text: cells.map((c) => c[1]).join('  ') }
}

describe('PDF ekstre ayrıştırma (konumlu satırlar)', () => {
  const lines: DocLine[] = [
    line(1, 0, [[40, 'ATLAS BANK (SENTETİK)']]),
    line(1, 1, [[40, 'Hesap Kesim Tarihi: 25.09.2026']]),
    line(1, 2, [[40, 'Önceki Dönem Borcu'], [400, '8.450,00']]),
    line(1, 3, [[40, 'Asgari Ödeme Tutarı'], [400, '3.380,00']]),
    line(1, 4, [[40, 'Tarih'], [110, 'Açıklama'], [330, 'Taksit'], [420, 'Tutar (TL)']]),
    line(1, 5, [[40, '01.09.2026'], [110, 'MİGROS KADIKÖY'], [440, '1.234,56']]),
    line(1, 6, [[40, '03.09.2026'], [110, 'TEKNOSA ATAŞEHİR'], [250, '12.000,00'], [330, '3/12'], [440, '1.000,00']]),
    line(1, 7, [[40, '05.09.2026'], [110, 'ÖDEMENİZ İÇİN TEŞEKKÜR EDERİZ'], [440, '-8.450,00']]),
    line(1, 8, [[40, '06.09.2026'], [110, 'ZARA İADE'], [440, '-450,00']]),
    line(1, 9, [[40, '07.09.2026'], [110, 'AKDİ FAİZ'], [440, '45,20']]),
    line(1, 10, [[40, '08.09.2026'], [110, 'NETFLIX.COM'], [300, '9,99 USD'], [440, '329,67']]),
    line(1, 11, [[40, '09.09.2026'], [110, 'OPET OTOYOL'], [440, '1.500,00']]),
    line(1, 12, [[40, 'Dönem İçi Harcamalar Toplamı'], [440, '4.109,43']]),
    line(1, 13, [[40, 'Dönem Borcu'], [440, '4.109,43']]),
    line(1, 14, [[40, 'Kart Limiti'], [440, '50.000,00']]),
  ]
  const doc: ParsedDocument = { kind: 'pdf', lines, pages: [{ page: 1, mode: 'text', textItems: 40 }], rawText: lines.map((l) => l.text).join('\n'), usedOcr: false }
  const out = parseStatement(doc)
  const rows = applyRules(out.rows, rules, categories)
  const by = (d: string) => rows.find((r) => r.description.startsWith(d))!

  it('özet satırlarını işlem olarak almaz', () => {
    expect(rows.length).toBe(7)
    expect(out.ignored.length).toBe(6) // hesap kesim, önceki borç, asgari, toplam, dönem borcu, limit
    expect(rows.some((r) => /Borcu|Limit|Asgari/i.test(r.description))).toBe(false)
  })
  it('taksitte bu aya yansıyan taksiti alır, toplamı gidere eklemez', () => {
    expect(by('TEKNOSA')).toMatchObject({ amountKurus: 100000, type: 'expense', installment: { current: 3, total: 12, purchaseTotalKurus: 1200000 } })
  })
  it('kart ödemesi transfer, iade ayrı tür, faiz inceleme notuyla gelir', () => {
    expect(by('ÖDEMENİZ')).toMatchObject({ type: 'transfer', amountKurus: 845000 })
    expect(by('ZARA')).toMatchObject({ type: 'refund', amountKurus: 45000 })
    expect(by('AKDİ')).toMatchObject({ type: 'expense', categoryId: 'cat-banka' })
    expect(by('AKDİ').notes.join(' ')).toMatch(/Faiz/)
  })
  it('döviz satırında TL karşılığını alır, dövizi ayrıca saklar', () => {
    expect(by('NETFLIX')).toMatchObject({ amountKurus: 32967, foreign: { currency: 'USD', amountMinor: 999 } })
  })
  it('kaynaktaki işlem toplamını bulur (dönem borcuyla eşitlik varsaymaz)', () => {
    expect(out.totals.map((t) => t.amountKurus)).toEqual([410943])
    const c = reviewCounts(rows, activeIds)
    // TEKNOSA için kural yok → kategori seçilene dek sorunlu, toplama girmez
    expect(c.expenseKurus - c.refundKurus).toBe(123456 + 4520 + 32967 + 150000 - 45000)
  })
  it('her satırı kaynak satıra bağlar', () => {
    expect(by('MİGROS').source).toMatchObject({ page: 1, line: 6 })
  })
})

describe('ekran görüntüsü düzeni (tarih başlıkları)', () => {
  const lines: DocLine[] = [
    { ...line(1, 0, [[20, '15 Eylül 2026 Salı']]), origin: 'ocr' },
    { ...line(1, 1, [[20, 'STARBUCKS'], [60, 'BAĞDAT'], [100, 'CAD'], [300, '-145,00'], [340, 'TL']]), origin: 'ocr' },
    { ...line(1, 2, [[20, 'Kafe'], [60, '/'], [80, 'Restoran']]), origin: 'ocr' },
  ]
  const doc: ParsedDocument = { kind: 'image', lines, pages: [], rawText: '', usedOcr: true }
  it('tarihi başlıktan alır ve bunu belirtir', () => {
    const out = parseStatement(doc)
    expect(out.rows.length).toBe(1)
    expect(out.rows[0]).toMatchObject({ date: '2026-09-15', amountKurus: 14500 })
    expect(out.rows[0].notes.join(' ')).toMatch(/tarih başlığından/)
  })
})

describe('tekrar şüphesi işaretleme', () => {
  const existing: Transaction[] = [
    { id: 'e1', date: '2026-09-01', amountKurus: 123456, type: 'expense', description: 'MIGROS KADIKOY', normalizedDescription: normalizeText('MIGROS KADIKOY'), categoryId: 'cat-market', source: 'csv', createdAt: '', updatedAt: '' },
  ]
  it('mevcut kayıtla eşleşeni işaretler, kararı kullanıcıya bırakır', () => {
    const rows = markDuplicates(
      [
        { id: 'a', include: true, date: '2026-09-01', dateRaw: '', description: 'MİGROS KADIKÖY', amountKurus: 123456, amountRaw: '', type: 'expense', categoryId: 'cat-market', currency: 'TRY', source: { kind: 'pdf-line', text: '' }, notes: [] },
        { id: 'b', include: true, date: '2026-09-01', dateRaw: '', description: 'SHELL', amountKurus: 123456, amountRaw: '', type: 'expense', categoryId: 'cat-akaryakit', currency: 'TRY', source: { kind: 'pdf-line', text: '' }, notes: [] },
      ],
      existing,
    )
    expect(rows[0].duplicateOf).toEqual(['e1'])
    expect(rows[0].duplicateDecision).toBeNull()
    expect(rows[1].duplicateOf).toBeUndefined()
    expect(reviewCounts(rows, activeIds)).toMatchObject({ duplicate: 1, valid: 1 })
  })
})
