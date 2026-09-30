import { decideType, detectInstallment, isFeeLine, isPaymentLine, isRefundLine, isSummaryLine, isTransactionTotalLine } from '../domain/classify'
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

/** Para tutarı gibi görünen parça: 1.234,56 / 1,234.56 / 150,00- / -99,90 / 25,00 USD / -₺124,22 */
const AMOUNT_TOKEN =
  /^[-+(]?\s*(?:₺|\$|€|£)?\s*(?:\d{1,3}(?:[.\s']\d{3})+|\d+)(?:[.,]\d{1,2})?\s*(?:TL|TRY|USD|EUR|GBP|₺|\$|€|£)?\s*[-+)]?\s*(?:TL|TRY|USD|EUR|GBP)?$/i
const AMOUNT_IN_TEXT =
  /(?:^|\s)([-+]?\s?(?:₺|\$|€|£)?\s?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}\s?(?:TL|TRY|USD|EUR|GBP|₺|\$|€)?\s?[-+]?)(?=\s|$)/gi
const TIME_RE = /\b\d{1,2}:\d{2}(?::\d{2})?\b/g
const WEEKDAY_RE = /\b(PAZARTESI|SALI|CARSAMBA|PERSEMBE|CUMA|CUMARTESI|PAZAR|BUGUN|DUN)\b/g

/** Unicode eksi/tireleri ve bölünmez boşlukları sadeleştirir (mobil uygulamalar "−124,22" yazar). */
function normCellText(t: string): string {
  return t.replace(/[−–—]/g, '-').replace(/[\u00a0\u202f]/g, ' ')
}

function looksLikeAmount(text: string): boolean {
  const t = normCellText(text).trim()
  if (!t || !/\d/.test(t)) return false
  if (DATE_TOKEN_RE.test(t)) return false
  if (/^\d{1,2}\s*\/\s*\d{1,2}$/.test(t)) return false // taksit 3/12
  if (!AMOUNT_TOKEN.test(t)) return false
  // Kuruş hanesi olmayan kısa tam sayılar (ör. "12") tutar sayılmaz; ekstrelerde tutarlar kuruşlu yazılır.
  return /[.,]\d{1,2}\s*(?:TL|TRY|USD|EUR|GBP|₺|\$|€|£)?\s*[-+)]?\s*$/i.test(t) || /(TL|TRY|₺|USD|EUR|\$|€)/i.test(t)
}

interface ColumnRange {
  x: number
  x2: number
}

interface HeaderLayout {
  page: number
  dateX?: number
  descX?: number
  amountX?: number
  amountLabel?: string
  foreignX?: number
  installmentX?: number
  /** Puan/bonus/ParafPara gibi tutar olmayan para sütunları: işlem tutarı sanılmamalı. */
  pointCols: ColumnRange[]
}

const POINT_COL_RE = /(PUAN|PARAF|BONUS|\bMIL\b|MILES|CHIP|KAZANIM|CASHBACK|WORLD|MAXI)/
const AMOUNT_COL_RE = /(TUTAR|\bTL\b|BORC|AMOUNT)/

function detectHeader(lines: DocLine[]): HeaderLayout[] {
  const out: HeaderLayout[] = []
  const isHeader = (f: string) => /TARIH/.test(f) && AMOUNT_COL_RE.test(f) && /(ACIKLAMA|ISLEM|ISYERI|IS YERI)/.test(f)
  for (let i = 0; i < lines.length; i++) {
    let l = lines[i]
    const f = foldTr(l.text)
    if (!isHeader(f)) {
      // Başlık iki satıra bölünmüş olabilir (taranmış belgeler): rakamsız ardışık iki satırı birleştir.
      const next = lines[i + 1]
      if (!next || next.page !== l.page || /\d/.test(l.text) || /\d/.test(next.text)) continue
      const joined = `${l.text} ${next.text}`
      if (!isHeader(foldTr(joined)) || !/TARIH/.test(f) === !/TARIH/.test(foldTr(next.text))) continue
      l = { ...l, cells: [...l.cells, ...next.cells], text: joined }
    }
    const h: HeaderLayout = { page: l.page, pointCols: [] }
    let amountScore = -1
    for (const c of l.cells) {
      const t = foldTr(c.text)
      const center = (c.x + c.x2) / 2
      if (/TARIH/.test(t) && h.dateX === undefined) h.dateX = center
      else if (/(ACIKLAMA|ISYERI|IS YERI|ISLEM DETAY)/.test(t)) h.descX = c.x
      else if (POINT_COL_RE.test(t)) h.pointCols.push({ x: c.x, x2: c.x2 })
      else if (/(TAKSIT|KALAN)/.test(t) && !/^TUTAR/.test(t)) h.installmentX = center
      else if (/(DOVIZ|USD|EUR|ORIJINAL)/.test(t)) h.foreignX = c.x2
      else if (AMOUNT_COL_RE.test(t)) {
        // Birden çok aday varsa asıl "Tutar" sütununu seç (ör. "Tutar" > "Borç (TL)").
        const score = /^(ISLEM )?TUTAR/.test(t) ? 3 : /TUTAR/.test(t) ? 2 : 1
        if (score > amountScore) {
          amountScore = score
          h.amountX = c.x2
          h.amountLabel = c.text
        }
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
  if (m) return { year: +m[3], month: +m[2] }
  // "Eylül 2026" gibi ay-yıl başlığı
  const my = /\b(OCAK|SUBAT|MART|NISAN|MAYIS|HAZIRAN|TEMMUZ|AGUSTOS|EYLUL|EKIM|KASIM|ARALIK)\s+(\d{4})\b/.exec(foldTr(doc.rawText))
  return my ? { year: +my[2], month: TR_MONTHS.indexOf(my[1]) + 1 } : {}
}

const TR_MONTHS = ['OCAK', 'SUBAT', 'MART', 'NISAN', 'MAYIS', 'HAZIRAN', 'TEMMUZ', 'AGUSTOS', 'EYLUL', 'EKIM', 'KASIM', 'ARALIK']
/** Yılsız Türkçe tarih: "27 Eylül", "27 Eyl" (mobil uygulamalar). */
const DAY_MONTH_RE = /^(\d{1,2})\s+(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık|Oca|Şub|Mar|Nis|May|Haz|Tem|Ağu|Eyl|Eki|Kas|Ara)\.?(?=\s|$|[·,])/i

function amountFromCell(cell: DocCell, hint: NumberFormatHint) {
  return parseAmount(normCellText(cell.text), hint)
}

/** Türkiye'nin il adları (5+ harf): PDF'te iş yeri adına bitişik yazılan şehir adını ayırmak için. */
const CITIES = [
  'ADANA', 'ADIYAMAN', 'AFYONKARAHİSAR', 'AKSARAY', 'AMASYA', 'ANKARA', 'ANTALYA', 'ARDAHAN', 'ARTVİN', 'BALIKESİR', 'BARTIN', 'BATMAN', 'BAYBURT',
  'BİLECİK', 'BİNGÖL', 'BİTLİS', 'BURDUR', 'BURSA', 'ÇANAKKALE', 'ÇANKIRI', 'ÇORUM', 'DENİZLİ', 'DİYARBAKIR', 'DÜZCE', 'EDİRNE', 'ELAZIĞ',
  'ERZİNCAN', 'ERZURUM', 'ESKİŞEHİR', 'GAZİANTEP', 'GİRESUN', 'GÜMÜŞHANE', 'HAKKARİ', 'HATAY', 'IĞDIR', 'ISPARTA', 'İSTANBUL', 'ISTANBUL',
  'İZMİR', 'IZMIR', 'KAHRAMANMARAŞ', 'KARABÜK', 'KARAMAN', 'KASTAMONU', 'KAYSERİ', 'KIRIKKALE', 'KIRKLARELİ', 'KIRŞEHİR', 'KİLİS',
  'KOCAELİ', 'KONYA', 'KÜTAHYA', 'MALATYA', 'MANİSA', 'MARDİN', 'MERSİN', 'MUĞLA', 'NEVŞEHİR', 'NİĞDE', 'OSMANİYE', 'SAKARYA', 'SAMSUN',
  'ŞANLIURFA', 'SİİRT', 'SİNOP', 'ŞIRNAK', 'SİVAS', 'TEKİRDAĞ', 'TOKAT', 'TRABZON', 'TUNCELİ', 'YALOVA', 'YOZGAT', 'ZONGULDAK',
]
const GLUED_CITY_RE = new RegExp(`([A-Za-zÇĞİÖŞÜçğıöşü0-9.)])(${CITIES.join('|')})$`)

/** "LOKANTA 1ANKARA" → "LOKANTA 1 ANKARA". Yalnızca bitişik yazılmış il adı ayrılır. */
export function splitGluedCity(description: string): string {
  return description.replace(GLUED_CITY_RE, '$1 $2')
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
    const bothAmountParts = /^[-−+]?[₺]?[\d.,]+$/.test(prev.text) && /^[\d.,]+[-+]?$|^(TL|₺)$/i.test(c.text)
    const signThenNumber = /^[-−+]?₺?$/.test(prev.text) && /^[\d.,]+/.test(c.text)
    if (gap < avgChar * gapFactor * 2 && !(looksLikeAmount(prev.text) && !bothAmountParts)) {
      prev.text = signThenNumber ? `${prev.text}${c.text}` : `${prev.text} ${c.text}`
      prev.x2 = c.x2
      prev.conf = prev.conf !== undefined && c.conf !== undefined ? Math.min(prev.conf, c.conf) : (prev.conf ?? c.conf)
    } else out.push({ ...c })
  }
  return out
}

interface LineInfo {
  line: DocLine
  cells: DocCell[]
  text: string
  dateMatch: RegExpExecArray | null
  shortDate: RegExpExecArray | null
  dayMonth: RegExpExecArray | null
  amountCells: DocCell[]
}

/**
 * Genel ekstre ayrıştırıcı: bankaya özgü değildir. Satırları konum bilgisiyle ele alır:
 * satır başındaki tarih, sağdaki tutar sütunu ve aradaki açıklama. Tüm metni tek satırda
 * birleştirip tutar aramaz.
 *
 * Desteklenen düzenler:
 * - Tarih | Açıklama | Tutar (| Taksit | Puan …) tablo satırları
 * - Mobil ekran: tarih başlığı ve altında işlemler
 * - Mobil ekran: işlem satırı ve hemen altında tarih(/saat) satırı
 * İşaret düzeni belgeden çıkarılır: harcamaların çoğu eksi yazılmışsa (bazı banka dökümleri
 * ve mobil uygulamalar) artı tutarlar alacak (iade/ödeme) sayılır.
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
    const notes: string[] = []
    const headers = detectHeader(doc.lines)
    const { year, month, periodText } = yearHint(doc)

    const allAmountTexts = doc.lines.flatMap((l) => l.cells.map((c) => normCellText(c.text)).filter(looksLikeAmount))
    const hint = inferNumberFormat(allAmountTexts)
    const headerFor = (line: DocLine) => headers.find((h) => h.page === line.page) ?? headers[0]

    const infos: LineInfo[] = []
    for (const line of doc.lines) {
      const cells = (line.origin === 'ocr' ? mergeCloseCells(line.cells) : line.cells).map((c) => ({ ...c, text: normCellText(c.text) }))
      const text = cleanDescription(normCellText(line.text))
      if (!text) continue
      const firstCells = cells.slice(0, 2).map((c) => c.text.trim())
      const dateMatch = DATE_TOKEN_RE.exec(firstCells[0] ?? '') ?? DATE_TOKEN_RE.exec(text)
      const shortDate = !dateMatch ? /^(\d{1,2}[./]\d{1,2})(?![./]?\d)\b/.exec(firstCells[0] ?? '') : null
      const dayMonth = !dateMatch && !shortDate ? DAY_MONTH_RE.exec(firstCells[0] ?? '') ?? DAY_MONTH_RE.exec(text) : null
      const amountCells = cells.filter((c, i) => i > 0 && looksLikeAmount(c.text))
      infos.push({ line, cells, text, dateMatch, shortDate, dayMonth, amountCells })
    }

    // Tutar sütunu seçimi: başlıktaki "Tutar" sütununa en yakın TL hücresi; puan sütunları hariç.
    const pickAmount = (info: LineInfo) => {
      const header = headerFor(info.line)
      const nearPoint = (c: DocCell) =>
        !!header?.pointCols.some((pc) => {
          const dPoint = Math.min(Math.abs(c.x2 - pc.x2), Math.abs(c.x - pc.x))
          return header.amountX === undefined ? dPoint < 25 : dPoint < Math.abs(c.x2 - header.amountX)
        })
      const tlCells = info.amountCells.filter((c) => {
        const cur = detectCurrency(c.text)
        return (!cur || cur === 'TRY') && !nearPoint(c)
      })
      const fxCells = info.amountCells.filter((c) => {
        const cur = detectCurrency(c.text)
        return cur && cur !== 'TRY'
      })
      let amountCell: DocCell | undefined
      if (header?.amountX !== undefined && tlCells.length) {
        amountCell = [...tlCells].sort((a, b) => Math.abs(a.x2 - header.amountX!) - Math.abs(b.x2 - header.amountX!))[0]
      } else amountCell = tlCells[tlCells.length - 1]
      return { header, tlCells, fxCells, amountCell }
    }

    // İşaret düzeni: tarihli işlem satırlarındaki tutarların çoğu eksi mi?
    // Ödeme/iade/indirim satırları her iki düzende de alacak olduğundan sayılmaz;
    // açık "+" işaretli tutar varsa eksiler harcamadır.
    let neg = 0
    let pos = 0
    let explicitPlus = 0
    for (const info of infos) {
      if (!(info.dateMatch || info.shortDate || info.dayMonth) && !info.amountCells.length) continue
      if (isSummaryLine(info.text)) continue
      const { amountCell } = pickAmount(info)
      if (!amountCell) continue
      const p = amountFromCell(amountCell, hint)
      if (!p.ok || p.kurus === 0) continue
      if (p.kurus < 0) neg++
      else if (/^\s*\+/.test(normCellText(amountCell.text))) explicitPlus++
      else if (!isPaymentLine(info.text) && !isRefundLine(info.text)) pos++
    }
    const expenseNegative = neg >= 1 && ((explicitPlus > 0 && pos === 0) || (neg >= 2 && neg > pos))
    if (expenseNegative)
      notes.push('Bu belgede harcamalar eksi (−) işaretli yazılmış; artı tutarlar iade, indirim veya ödeme olarak yorumlandı. Satırları kontrol edin.')

    const makeRow = (info: LineInfo, dateRaw: string, dp: ReturnType<typeof parseDate>) => {
      const { line, cells, amountCells } = info
      const { header, tlCells, fxCells, amountCell } = pickAmount(info)
      let foreignCell: DocCell | undefined = fxCells[0]
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
      const description = splitGluedCity(cleanDescription(descParts.join(' ').replace(TIME_RE, ' ')))

      const rowNotes: string[] = []
      if (dp.ok && dp.note) rowNotes.push(dp.note)
      if (!dp.ok) rowNotes.push(dp.message)

      let amountKurus: number | null = null
      let candidates: number[] | undefined
      let signedForType = 0
      // Taksit bilgisi açıklamada veya ayrı bir hücrede olabilir ("3/12", "6 - 1. Taksit").
      const afterDesc = cells.slice(end).filter((c) => c !== amountCell && !looksLikeAmount(c.text))
      let installment = detectInstallment(description)
      let installmentCell: DocCell | undefined
      if (!installment) {
        for (const c of afterDesc) {
          const inst = /TAKS[İI]T/i.test(c.text) || /^\d{1,2}\s*\/\s*\d{1,2}$/.test(c.text.trim()) ? detectInstallment(c.text) : null
          if (inst) {
            installment = inst
            if (/TAKS[İI]T/i.test(c.text)) installmentCell = c
            break
          }
        }
      }
      if (!installment && header?.installmentX !== undefined) installment = installmentFromCells(cells, header.installmentX)

      if (amountCell) {
        const p = amountFromCell(amountCell, hint)
        if (p.ok) {
          amountKurus = Math.abs(p.kurus)
          signedForType = expenseNegative ? -p.kurus : p.kurus
          if (p.note) rowNotes.push(p.note)
        } else if (p.reason === 'ambiguous') {
          candidates = p.candidates?.map(Math.abs)
          rowNotes.push(p.message)
        } else rowNotes.push(p.message)
      }

      if (installment && amountKurus !== null) {
        if (installmentCell) {
          // "510,84 TL / 6 - 1. Taksit": baştaki tutar kalan borçtur, alışveriş toplamı değildir.
          const rem = /^\s*([\d.,]+\s*(?:TL|₺)?)\s*\//i.exec(installmentCell.text)
          if (rem) rowNotes.push(`Taksitli işlem; bu aya yansıyan taksit alındı. Belgede kalan borç: ${rem[1].trim()}.`)
        } else {
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
            rowNotes.push('Taksitli işlem: tutarın bu aya yansıyan taksit tutarı olduğunu doğrulayın.')
          }
          if (installment.purchaseTotalKurus && installment.total > 0) {
            const expected = Math.round(installment.purchaseTotalKurus / installment.total)
            if (Math.abs(expected - amountKurus!) > 100) rowNotes.push('Taksit tutarı, toplam tutarın taksit sayısına bölümüyle uyuşmuyor; kontrol edin.')
          }
        }
        if (dp.ok && installment.current > 1 && year && month && dp.date.slice(0, 7) < `${year}-${String(month).padStart(2, '0')}`)
          rowNotes.push('Önceki bir ayda başlayan taksit: kayıt tarihi ilk alışveriş tarihidir; isterseniz tarihi bu ayla değiştirin.')
      }

      let foreign: DraftRow['foreign']
      let currency = 'TRY'
      if (foreignCell) {
        const fp = parseAmount(foreignCell.text, hint)
        const cur = detectCurrency(foreignCell.text) ?? 'USD'
        if (fp.ok) foreign = { currency: cur, amountMinor: Math.abs(fp.kurus) }
        if (!amountCell) {
          currency = cur
          rowNotes.push(`Döviz işlemi (${cur}); TL karşılığı belgede bulunamadı. TL tutarını girin veya satırı hariç tutun.`)
        } else rowNotes.push(`Döviz işlemi: ${foreignCell.text.trim()} — TL karşılığı alındı.`)
      }

      const decision = decideType(description, signedForType)
      rowNotes.push(...decision.warnings.filter((w) => !(expenseNegative && w.startsWith('Alacak'))))
      if (isFeeLine(description)) rowNotes.push('Faiz/ücret satırı: gerçek bir masrafsa gider olarak kalabilir.')
      const lowConf = line.origin === 'ocr' && amountCell?.conf !== undefined && amountCell.conf < 70
      if (lowConf) rowNotes.push('OCR bu tutarı düşük güvenle okudu; belgeyle karşılaştırın.')
      const zero = amountKurus === 0

      rows.push({
        id: newDraftId(),
        include: !zero,
        excludedReason: zero ? 'Tutarı 0,00: puan/kampanya bilgisi, harcama değil.' : undefined,
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
        notes: rowNotes,
        lowOcrConfidence: lowConf || undefined,
      })
    }

    const dateOf = (info: LineInfo): { raw: string; dp: ReturnType<typeof parseDate> } | null => {
      if (info.dateMatch) return { raw: info.dateMatch[1], dp: parseDate(info.dateMatch[1]) }
      if (info.shortDate) return { raw: info.shortDate[1], dp: parseDate(info.shortDate[1], { fallbackYear: inferYear(info.shortDate[1], year, month) }) }
      if (info.dayMonth) {
        const raw = info.dayMonth[0].trim()
        const m = TR_MONTHS.findIndex((x) => x.startsWith(foldTr(info.dayMonth![2]).slice(0, 3))) + 1
        const y = year && month && m > month + 1 ? year - 1 : (year ?? new Date().getFullYear())
        const dp = parseDate(`${info.dayMonth[1]}.${m}.${y}`)
        return { raw, dp: dp.ok ? { ...dp, note: year ? 'Yıl belgedeki dönemden alındı.' : 'Yıl belgede yok; bu yıl varsayıldı, kontrol edin.' } : dp }
      }
      return null
    }
    const restAfterDate = (info: LineInfo, raw: string) =>
      foldTr(info.text.replace(raw, ''))
        .replace(TIME_RE, '')
        .replace(WEEKDAY_RE, '')
        .replace(/[^A-Z0-9]/g, '')

    let contextDate: string | null = null
    let pending: LineInfo | null = null
    // Tarih + açıklama bir satırda, tutar bir alt satırda (iki satırlı açıklamalı ekstreler)
    let openDated: { info: LineInfo; raw: string; dp: ReturnType<typeof parseDate> } | null = null
    const flushPending = () => {
      if (pending) unparsed.push(pending.line)
      pending = null
    }

    for (const info of infos) {
      const { line, text, amountCells } = info
      const open = openDated
      openDated = null
      const summary = isSummaryLine(text)
      if (summary) {
        flushPending()
        if (isTransactionTotalLine(text)) {
          const cell = amountCells[amountCells.length - 1]
          const p = cell ? amountFromCell(cell, hint) : null
          if (p && p.ok) totals.push({ label: text.replace(cell!.text, '').trim(), amountKurus: Math.abs(p.kurus), source: srcRef(line) })
        }
        ignored.push({ line, reason: `Özet satırı ("${summary.toLocaleLowerCase('tr')}"): işlem olarak alınmadı.` })
        continue
      }
      const d = dateOf(info)

      if (d && !amountCells.length) {
        // Tutarsız tarih satırı: (a) üstteki işlemin tarihi (tarih altta düzeni) veya (b) tarih başlığı.
        if (pending) {
          const p: LineInfo = pending
          pending = null
          makeRow(p, '', d.dp.ok ? { ...d.dp, note: 'Tarih, işlemin altındaki satırdan alındı.' } : d.dp)
          continue
        }
        if (!restAfterDate(info, d.raw)) {
          if (d.dp.ok) contextDate = d.dp.date
        } else openDated = { info, raw: d.raw, dp: d.dp }
        // Sayfa başlığı/altbilgisi gibi tutarsız satırlar işlem değildir.
        continue
      }

      if (!d && open && open.info.line.page === line.page && info.cells.some((c) => looksLikeAmount(c.text))) {
        flushPending()
        const cells = [...open.info.cells, ...info.cells]
        const merged: LineInfo = { ...open.info, cells, text: `${open.info.text} ${text}`, amountCells: cells.filter((c, i) => i > 0 && looksLikeAmount(c.text)) }
        makeRow(merged, open.raw, open.dp)
        continue
      }

      if (!d) {
        const hasText = info.cells.length >= 2 && /[A-Za-zÇĞİÖŞÜçğıöşü]{2,}/.test(info.cells[0].text)
        if (amountCells.length && hasText) {
          if (contextDate) {
            flushPending()
            makeRow(info, '', { ok: true, date: contextDate, note: 'Tarih, üstteki tarih başlığından alındı.' })
          } else {
            flushPending()
            pending = info // tarih bir sonraki satırda olabilir
          }
          continue
        }
        if (amountCells.length || AMOUNT_IN_TEXT.test(text)) unparsed.push(line)
        AMOUNT_IN_TEXT.lastIndex = 0
        continue
      }

      flushPending()
      makeRow(info, d.raw, d.dp)
    }
    flushPending()
    return { rows, ignored, unparsed, totals, periodText, notes, parserId: this.id, parserLabel: this.label }
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
