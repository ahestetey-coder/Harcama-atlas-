import { decideType, detectInstallment, isFeeLine, isSummaryLine, isTransactionTotalLine } from '../domain/classify'
import { DATE_TOKEN_RE, parseDate } from '../domain/dates'
import { detectCurrency, inferNumberFormat, parseAmount, type NumberFormatHint } from '../domain/money'
import { cleanDescription, foldTr } from '../domain/normalize'
import { newDraftId } from './mapping'
import type { DocCell, DocLine, DraftRow, ParseOutput, ParsedDocument, StatementTotal } from './types'

/**
 * Ekstre ayrıştırıcıları için modüler yapı. Bankaya özgü bir ayrıştırıcı eklemek için
 * `StatementParser` arayüzünü uygulayıp `PARSERS` dizisine genel ayrıştırıcıdan önce ekleyin.
 * Gerçek bir örnekle doğrulanmamış bankalar için `verified: false` bırakın; arayüz
 * "destekleniyor" iddiasında bulunmaz.
 */
export interface StatementParser {
  id: string
  label: string
  verified: boolean
  detect(doc: ParsedDocument): boolean
  parse(doc: ParsedDocument): ParseOutput
}

/** Para tutarı gibi görünen parça: 1.234,56 / 1,234.56 / 150,00- / -99,90 / 25,00 USD */
const AMOUNT_TOKEN =
  /^[-+(]?\s*(?:₺|\$|€|£)?\s*(?:\d{1,3}(?:[.\s']\d{3})+|\d+)(?:[.,]\d{1,2})?\s*(?:TL|TRY|USD|EUR|GBP|₺|\$|€|£)?\s*[-+)]?\s*(?:TL|TRY|USD|EUR|GBP)?$/i
const AMOUNT_IN_TEXT =
  /(?:^|\s)([-+]?\s?(?:₺|\$|€|£)?\s?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}\s?(?:TL|TRY|USD|EUR|GBP|₺|\$|€)?\s?[-+]?)(?=\s|$)/gi

function looksLikeAmount(text: string): boolean {
  const t = text.trim()
  if (!t || !/\d/.test(t)) return false
  if (DATE_TOKEN_RE.test(t)) return false
  if (/^\d{1,2}\s*\/\s*\d{1,2}$/.test(t)) return false // taksit 3/12
  if (!AMOUNT_TOKEN.test(t)) return false
  // Kuruş hanesi olmayan kısa tam sayılar (ör. "12") tutar sayılmaz; ekstrelerde tutarlar kuruşlu yazılır.
  return /[.,]\d{1,2}\s*(?:TL|TRY|USD|EUR|GBP|₺|\$|€|£)?\s*[-+)]?\s*$/i.test(t) || /(TL|TRY|₺|USD|EUR|\$|€)/i.test(t)
}

interface HeaderLayout {
  page: number
  dateX?: number
  descX?: number
  amountX?: number
  amountLabel?: string
  foreignX?: number
  installmentX?: number
}

function detectHeader(lines: DocLine[]): HeaderLayout[] {
  const out: HeaderLayout[] = []
  for (const l of lines) {
    const f = foldTr(l.text)
    if (!/TARIH/.test(f) || !/(TUTAR|TL|BORC)/.test(f) || !/(ACIKLAMA|ISLEM|ISYERI|IS YERI)/.test(f)) continue
    const h: HeaderLayout = { page: l.page }
    for (const c of l.cells) {
      const t = foldTr(c.text)
      const center = (c.x + c.x2) / 2
      if (/TARIH/.test(t) && h.dateX === undefined) h.dateX = center
      else if (/(ACIKLAMA|ISYERI|IS YERI|ISLEM DETAY)/.test(t)) h.descX = c.x
      else if (/TAKSIT/.test(t) && !/TUTAR/.test(t)) h.installmentX = center
      else if (/(DOVIZ|USD|EUR|ORIJINAL)/.test(t)) h.foreignX = c.x2
      else if (/(TUTAR|TL|BORC)/.test(t)) {
        h.amountX = c.x2
        h.amountLabel = c.text
      }
    }
    out.push(h)
  }
  return out
}

function yearHint(doc: ParsedDocument): { year?: number; month?: number; periodText?: string } {
  for (const l of doc.lines) {
    const f = foldTr(l.text)
    if (/(HESAP KESIM|EKSTRE TARIHI|KESIM TARIHI|EKSTRE DONEMI|DONEM)/.test(f)) {
      const m = /(\d{1,2})[./-](\d{1,2})[./-](\d{4})/.exec(l.text)
      if (m) return { year: +m[3], month: +m[2], periodText: cleanDescription(l.text) }
    }
  }
  const m = /(\d{1,2})[./-](\d{1,2})[./-](\d{4})/.exec(doc.rawText)
  return m ? { year: +m[3], month: +m[2] } : {}
}

function amountFromCell(cell: DocCell, hint: NumberFormatHint) {
  return parseAmount(cell.text, hint)
}

/** OCR'da kelimeler ayrı gelir; yakın kelimeleri hücrelerde birleştirir. */
export function mergeCloseCells(cells: DocCell[], gapFactor = 0.9): DocCell[] {
  if (cells.length < 2) return cells
  const sorted = [...cells].sort((a, b) => a.x - b.x)
  const avgChar =
    sorted.reduce((s, c) => s + (c.x2 - c.x) / Math.max(1, c.text.length), 0) / sorted.length
  const out: DocCell[] = [{ ...sorted[0] }]
  for (let i = 1; i < sorted.length; i++) {
    const prev = out[out.length - 1]
    const c = sorted[i]
    const gap = c.x - prev.x2
    const bothAmountParts = /^[\d.,]+$/.test(prev.text) && /^[\d.,]+[-+]?$|^(TL|₺)$/i.test(c.text)
    if (gap < avgChar * gapFactor * 2 && !(looksLikeAmount(prev.text) && !bothAmountParts)) {
      prev.text = `${prev.text} ${c.text}`
      prev.x2 = c.x2
      prev.conf = prev.conf !== undefined && c.conf !== undefined ? Math.min(prev.conf, c.conf) : (prev.conf ?? c.conf)
    } else out.push({ ...c })
  }
  return out
}

/**
 * Genel ekstre ayrıştırıcı: bankaya özgü değildir. Satırları konum bilgisiyle ele alır:
 * satır başındaki tarih, sağdaki tutar sütunu ve aradaki açıklama. Tüm metni tek satırda
 * birleştirip tutar aramaz.
 */
export const genericParser: StatementParser = {
  id: 'generic',
  label: 'Genel ekstre okuyucu (bankaya özgü değil)',
  verified: false,
  detect: () => true,
  parse(doc) {
    const rows: DraftRow[] = []
    const ignored: ParseOutput['ignored'] = []
    const unparsed: DocLine[] = []
    const totals: StatementTotal[] = []
    const headers = detectHeader(doc.lines)
    const { year, month, periodText } = yearHint(doc)

    const allAmountTexts = doc.lines.flatMap((l) => l.cells.map((c) => c.text).filter(looksLikeAmount))
    const hint = inferNumberFormat(allAmountTexts)
    let contextDate: string | null = null

    for (const line of doc.lines) {
      const cells = line.origin === 'ocr' ? mergeCloseCells(line.cells) : line.cells
      const text = cleanDescription(line.text)
      if (!text) continue
      const header = headers.find((h) => h.page === line.page) ?? headers[0]
      const firstCells = cells.slice(0, 2).map((c) => c.text.trim())
      const dateMatch = DATE_TOKEN_RE.exec(firstCells[0] ?? '') ?? DATE_TOKEN_RE.exec(text)
      const shortDate = !dateMatch ? /^(\d{1,2}[./]\d{1,2})\b/.exec(firstCells[0] ?? '') : null
      const amountCells = cells.filter((c, i) => i > 0 && looksLikeAmount(c.text))

      const summary = isSummaryLine(text)
      if (summary) {
        if (isTransactionTotalLine(text)) {
          const cell = amountCells[amountCells.length - 1]
          const p = cell ? amountFromCell(cell, hint) : null
          if (p && p.ok) totals.push({ label: text.replace(cell!.text, '').trim(), amountKurus: Math.abs(p.kurus), source: srcRef(line) })
        }
        ignored.push({ line, reason: `Özet satırı ("${summary.toLocaleLowerCase('tr')}"): işlem olarak alınmadı.` })
        continue
      }
      // Yalnızca tarihten oluşan satır: mobil uygulama ekran görüntülerindeki tarih başlığı
      if (dateMatch && !amountCells.length) {
        const rest = foldTr(text.replace(dateMatch[1], ''))
          .replace(/\b(PAZARTESI|SALI|CARSAMBA|PERSEMBE|CUMA|CUMARTESI|PAZAR|BUGUN|DUN)\b/g, '')
          .replace(/[^A-Z0-9]/g, '')
        if (!rest) {
          const hd = parseDate(dateMatch[1])
          if (hd.ok) contextDate = hd.date
          continue
        }
      }
      let usedContext = false
      if (!dateMatch && !shortDate) {
        if (contextDate && amountCells.length && cells.length >= 2 && /[A-Za-zÇĞİÖŞÜçğıöşü]{2,}/.test(cells[0].text)) usedContext = true
        else {
          if (amountCells.length || AMOUNT_IN_TEXT.test(text)) unparsed.push(line)
          AMOUNT_IN_TEXT.lastIndex = 0
          continue
        }
      }
      const dateRaw = usedContext ? '' : (dateMatch ?? shortDate)![1]
      const dp: ReturnType<typeof parseDate> = usedContext
        ? { ok: true, date: contextDate!, note: 'Tarih, üstteki tarih başlığından alındı.' }
        : parseDate(dateRaw, { fallbackYear: shortDate ? inferYear(dateRaw, year, month) : undefined })

      // Tutar sütunu seçimi
      let amountCell: DocCell | undefined
      let foreignCell: DocCell | undefined
      const tlCells = amountCells.filter((c) => {
        const cur = detectCurrency(c.text)
        return !cur || cur === 'TRY'
      })
      const fxCells = amountCells.filter((c) => {
        const cur = detectCurrency(c.text)
        return cur && cur !== 'TRY'
      })
      if (header?.amountX !== undefined && tlCells.length) {
        amountCell = [...tlCells].sort((a, b) => Math.abs(a.x2 - header.amountX!) - Math.abs(b.x2 - header.amountX!))[0]
      } else amountCell = tlCells[tlCells.length - 1]
      if (fxCells.length) foreignCell = fxCells[0]
      if (!amountCell && header?.foreignX !== undefined) {
        // Döviz sütunu başlıktan biliniyorsa para birimi olmayan hücre TL sayılmaz.
        foreignCell = foreignCell ?? amountCells.find((c) => Math.abs(c.x2 - header.foreignX!) < 20)
      }

      // Açıklama: tarih ile ilk tutar arasındaki hücreler
      const firstAmountIdx = cells.findIndex((c) => c === (amountCells[0] ?? amountCell))
      const end = firstAmountIdx > 0 ? firstAmountIdx : cells.length
      const descParts: string[] = []
      cells.slice(0, end).forEach((c, i) => {
        let t = c.text.trim()
        if (i === 0 && dateRaw) t = t.replace(dateRaw, '').trim()
        if (t && !DATE_TOKEN_RE.test(t)) descParts.push(t)
      })
      const description = cleanDescription(descParts.join(' '))

      const notes: string[] = []
      if (dp.ok && dp.note) notes.push(dp.note)
      if (!dp.ok) notes.push(dp.message)

      let amountKurus: number | null = null
      let candidates: number[] | undefined
      let signedForType = 0
      const installment = detectInstallment(description) ?? (header?.installmentX !== undefined ? installmentFromCells(cells, header.installmentX) : null)

      if (amountCell) {
        const p = amountFromCell(amountCell, hint)
        if (p.ok) {
          amountKurus = Math.abs(p.kurus)
          signedForType = p.kurus
          if (p.note) notes.push(p.note)
        } else if (p.reason === 'ambiguous') {
          candidates = p.candidates?.map(Math.abs)
          notes.push(p.message)
        } else notes.push(p.message)
      }

      if (installment && amountKurus !== null) {
        const others = tlCells.filter((c) => c !== amountCell).map((c) => amountFromCell(c, hint)).filter((p) => p.ok).map((p) => Math.abs((p as { kurus: number }).kurus))
        const larger = others.filter((k) => k > amountKurus!)
        if (larger.length) {
          // Taksitli işlemde toplam alışveriş tutarı gidere eklenmez, yalnızca bu aya yansıyan taksit alınır.
          installment.purchaseTotalKurus = Math.max(...larger)
        } else if (header?.amountX === undefined && others.length) {
          // Başlık yoksa küçük tutar aylık taksit, büyük tutar alışveriş toplamıdır.
          const monthly = Math.min(amountKurus, ...others)
          if (monthly < amountKurus) {
            installment.purchaseTotalKurus = amountKurus
            amountKurus = monthly
          }
        } else if (installment.total > 0) {
          notes.push('Taksitli işlem: tutarın bu aya yansıyan taksit tutarı olduğunu doğrulayın.')
        }
        if (installment.purchaseTotalKurus && installment.total > 0) {
          const expected = Math.round(installment.purchaseTotalKurus / installment.total)
          if (Math.abs(expected - amountKurus!) > 100)
            notes.push('Taksit tutarı, toplam tutarın taksit sayısına bölümüyle uyuşmuyor; kontrol edin.')
        }
      }

      let foreign: DraftRow['foreign']
      let currency = 'TRY'
      if (foreignCell) {
        const fp = parseAmount(foreignCell.text, hint)
        const cur = detectCurrency(foreignCell.text) ?? 'USD'
        if (fp.ok) foreign = { currency: cur, amountMinor: Math.abs(fp.kurus) }
        if (!amountCell) {
          currency = cur
          notes.push(`Döviz işlemi (${cur}); TL karşılığı belgede bulunamadı. TL tutarını girin veya satırı hariç tutun.`)
        } else notes.push(`Döviz işlemi: ${foreignCell.text.trim()} — TL karşılığı alındı.`)
      }

      const decision = decideType(description, signedForType)
      notes.push(...decision.warnings)
      if (isFeeLine(description)) notes.push('Faiz/ücret satırı: gerçek bir masrafsa gider olarak kalabilir.')
      const lowConf = line.origin === 'ocr' && amountCell?.conf !== undefined && amountCell.conf < 70
      if (lowConf) notes.push('OCR bu tutarı düşük güvenle okudu; belgeyle karşılaştırın.')

      rows.push({
        id: newDraftId(),
        include: true,
        date: dp.ok ? dp.date : null,
        dateRaw,
        description,
        amountKurus: currency === 'TRY' ? amountKurus : null,
        amountRaw: amountCell?.text ?? foreignCell?.text ?? '',
        amountCandidates: candidates,
        type: decision.type,
        categoryId: null,
        currency: 'TRY',
        foreign,
        installment: installment ?? undefined,
        source: srcRef(line),
        notes,
        lowOcrConfidence: lowConf || undefined,
      })
    }
    return { rows, ignored, unparsed, totals, periodText, parserId: this.id, parserLabel: this.label }
  },
}

function installmentFromCells(cells: DocCell[], x: number) {
  const c = cells.find((cell) => Math.abs((cell.x + cell.x2) / 2 - x) < 30 && /^\d{1,2}\s*\/\s*\d{1,2}$/.test(cell.text.trim()))
  return c ? detectInstallment(c.text) : null
}

function inferYear(dateRaw: string, year?: number, month?: number): number | undefined {
  if (!year) return undefined
  const m = /^(\d{1,2})[./](\d{1,2})/.exec(dateRaw)
  if (m && month && +m[2] > month + 1) return year - 1 // Ocak ekstresindeki Aralık işlemi
  return year
}

function srcRef(line: DocLine): DraftRow['source'] {
  return { kind: line.origin === 'ocr' ? 'ocr-line' : 'pdf-line', page: line.page, line: line.index + 1, text: line.text }
}

export const PARSERS: StatementParser[] = [genericParser]

export function parseStatement(doc: ParsedDocument): ParseOutput {
  const parser = PARSERS.find((p) => p.detect(doc)) ?? genericParser
  return parser.parse(doc)
}
