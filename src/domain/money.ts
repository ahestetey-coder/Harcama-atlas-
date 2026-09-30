/**
 * Para tutarları her yerde tam sayı kuruş olarak tutulur.
 * Ayrıştırma belirsiz biçimleri sessizce yorumlamaz; `ambiguous` döner.
 */

export type NumberFormatHint = 'tr' | 'en' | 'auto'

export type AmountParseResult =
  | {
      ok: true
      /** İşaretli kuruş değeri (negatif olabilir). */
      kurus: number
      /** Kaynakta açıkça negatif/alacak işareti vardı. */
      negative: boolean
      /** Algılanan para birimi (varsa). */
      currency?: string
      /** Yorumlama notu (ör. İngilizce biçim). */
      note?: string
    }
  | {
      ok: false
      reason: 'empty' | 'invalid' | 'ambiguous'
      /** Belirsiz durumda iki olası yorum (kuruş). */
      candidates?: number[]
      message: string
    }

const CURRENCY_TOKENS: Array<[RegExp, string]> = [
  [/₺|\bTL\b|\bTRY\b|\bYTL\b/i, 'TRY'],
  [/\$|\bUSD\b/i, 'USD'],
  [/€|\bEUR\b|\bEURO\b/i, 'EUR'],
  [/£|\bGBP\b/i, 'GBP'],
  [/\bCHF\b/i, 'CHF'],
]

export function detectCurrency(text: string): string | undefined {
  for (const [re, code] of CURRENCY_TOKENS) if (re.test(text)) return code
  return undefined
}

/** Tek bir tutar metnini kuruşa çevirir. */
export function parseAmount(input: string | number | null | undefined, hint: NumberFormatHint = 'auto'): AmountParseResult {
  if (input === null || input === undefined) return { ok: false, reason: 'empty', message: 'Tutar boş.' }
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return { ok: false, reason: 'invalid', message: 'Tutar sayı değil.' }
    const kurus = Math.round(input * 100)
    return { ok: true, kurus, negative: kurus < 0 }
  }
  let s = String(input).replace(/\u00a0|\u202f/g, ' ').trim()
  if (!s) return { ok: false, reason: 'empty', message: 'Tutar boş.' }

  const currency = detectCurrency(s)
  s = s.replace(/₺|\$|€|£/g, '').replace(/\b(TL|TRY|YTL|USD|EUR|EURO|GBP|CHF)\b/gi, '').trim()

  let negative = false
  // (150,00) muhasebe biçimi
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1).trim()
  }
  // Sonda/başta işaret: "150,00-", "-150,00", "+150,00", "150,00 +"
  const signMatch = s.match(/^([+-])\s*(.*)$/) ?? s.match(/^(.*?)\s*([+-])$/)
  if (signMatch) {
    const [, a, b] = signMatch
    const sign = a === '+' || a === '-' ? a : b
    s = (a === '+' || a === '-' ? b : a).trim()
    if (sign === '-') negative = !negative
  }
  // Alacak/borç son ekleri: "150,00 A" / "150,00 B" / "CR"
  const crMatch = s.match(/^(.*?)\s*(A|B|CR|DR)$/i)
  if (crMatch && /\d/.test(crMatch[1])) {
    s = crMatch[1].trim()
    if (/^(A|CR)$/i.test(crMatch[2])) negative = !negative
  }
  // Rakam grupları arasındaki boşluk ve kesme işaretleri: "1 234,56", "1'234.56"
  s = s.replace(/(\d)[ '](?=\d{3}\b)/g, '$1')

  if (!/^\d[\d.,]*$/.test(s)) return { ok: false, reason: 'invalid', message: `"${String(input).trim()}" tutar olarak okunamadı.` }

  const lastDot = s.lastIndexOf('.')
  const lastComma = s.lastIndexOf(',')
  const dots = (s.match(/\./g) ?? []).length
  const commas = (s.match(/,/g) ?? []).length
  let intPart: string
  let decPart: string
  let note: string | undefined

  const toResult = (ip: string, dp: string): AmountParseResult => {
    if (dp.length > 2) return { ok: false, reason: 'invalid', message: `"${String(input).trim()}" ikiden fazla ondalık basamak içeriyor.` }
    const kurus = Number(ip || '0') * 100 + Number((dp + '00').slice(0, 2))
    if (!Number.isSafeInteger(kurus)) return { ok: false, reason: 'invalid', message: 'Tutar çok büyük.' }
    return { ok: true, kurus: negative ? -kurus : kurus, negative, currency, note }
  }
  const validGroups = (ip: string, sep: string) => new RegExp(`^\\d{1,3}(\\${sep}\\d{3})+$`).test(ip)

  if (dots > 0 && commas > 0) {
    // İki ayırıcı da varsa sondaki ondalıktır; biçim belirsiz değildir.
    if (lastComma > lastDot) {
      intPart = s.slice(0, lastComma)
      decPart = s.slice(lastComma + 1)
      if (!validGroups(intPart, '.')) return { ok: false, reason: 'invalid', message: `"${s}" geçerli bir Türkçe tutar değil.` }
      intPart = intPart.replace(/\./g, '')
    } else {
      intPart = s.slice(0, lastDot)
      decPart = s.slice(lastDot + 1)
      if (!validGroups(intPart, ',')) return { ok: false, reason: 'invalid', message: `"${s}" geçerli bir tutar değil.` }
      intPart = intPart.replace(/,/g, '')
      if (hint !== 'en') note = 'İngilizce sayı biçimi (1,234.56) olarak yorumlandı.'
    }
    return toResult(intPart, decPart)
  }

  if (commas === 0 && dots === 0) return toResult(s, '')

  const sep = commas > 0 ? ',' : '.'
  const count = commas > 0 ? commas : dots
  const idx = sep === ',' ? lastComma : lastDot
  const after = s.slice(idx + 1)
  const before = s.slice(0, idx)
  const trDecimal = sep === ','
  const decimalMeaningHint = (hint === 'tr' && trDecimal) || (hint === 'en' && !trDecimal)
  const thousandsMeaningHint = (hint === 'tr' && !trDecimal) || (hint === 'en' && trDecimal)

  if (count > 1) {
    // "1.234.567" → yalnızca binlik ayırıcı olabilir.
    if (!validGroups(s, sep)) return { ok: false, reason: 'invalid', message: `"${s}" geçerli bir tutar değil.` }
    return toResult(s.split(sep).join(''), '')
  }
  if (after.length !== 3) {
    // "150,5" / "150,50" / "150.50": tek ayırıcı ve 1–2 hane → ondalık
    if (after.length > 3) return { ok: false, reason: 'invalid', message: `"${s}" geçerli bir tutar değil.` }
    if (!trDecimal && hint !== 'en') note = 'Nokta ondalık ayırıcı olarak yorumlandı.'
    return toResult(before, after)
  }
  // Tek ayırıcı ve ardından tam 3 hane: "1.234" veya "12,345" → binlik mi ondalık mı?
  if (thousandsMeaningHint) return toResult(before + after, '')
  if (decimalMeaningHint) return { ok: false, reason: 'invalid', message: `"${s}" üç ondalık basamak içeriyor.` }
  if (before === '0') return { ok: false, reason: 'invalid', message: `"${s}" üç ondalık basamak içeriyor.` }
  const asThousands = Number(before + after) * 100
  const asDecimal = Number(before) * 100 + Math.round(Number(after) / 10)
  return {
    ok: false,
    reason: 'ambiguous',
    candidates: [negative ? -asThousands : asThousands, negative ? -asDecimal : asDecimal],
    message: `"${s}" belirsiz: ${formatKurus(asThousands)} mi yoksa ${sep === '.' ? before + ',' + after : before + '.' + after} mi?`,
  }
}

/**
 * Bir sütundaki tutar örneklerinden sayı biçimini çıkarır.
 * Açık kanıt yoksa 'auto' döner ve belirsiz değerler kullanıcıya sorulur.
 */
export function inferNumberFormat(samples: string[]): NumberFormatHint {
  let tr = 0
  let en = 0
  for (const raw of samples) {
    const s = raw.replace(/[^\d.,]/g, '')
    if (!s) continue
    const lastDot = s.lastIndexOf('.')
    const lastComma = s.lastIndexOf(',')
    if (lastDot >= 0 && lastComma >= 0) {
      if (lastComma > lastDot) tr++
      else en++
      continue
    }
    const m = s.match(/[.,](\d+)$/)
    if (m && (m[1].length === 1 || m[1].length === 2)) {
      if (s.includes(',')) tr++
      else en++
    }
    if ((s.match(/\./g) ?? []).length > 1) tr++
    if ((s.match(/,/g) ?? []).length > 1) en++
  }
  if (tr > 0 && en === 0) return 'tr'
  if (en > 0 && tr === 0) return 'en'
  return 'auto'
}

const tryFormatter = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** 123456 → "1.234,56" */
export function formatKurusPlain(kurus: number): string {
  const sign = kurus < 0 ? '-' : ''
  const abs = Math.abs(kurus)
  const lira = Math.trunc(abs / 100)
  const k = abs % 100
  return sign + tryFormatter.format(lira).replace(/,00$/, '') + ',' + String(k).padStart(2, '0')
}

/** 123456 → "1.234,56 ₺" */
export function formatKurus(kurus: number): string {
  return `${formatKurusPlain(kurus)} ₺`
}

/** Kısa gösterim: 1.234 ₺ / 12,3 B ₺ */
export function formatKurusCompact(kurus: number): string {
  const lira = kurus / 100
  if (Math.abs(lira) >= 1_000_000) return `${(lira / 1_000_000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} Mn ₺`
  if (Math.abs(lira) >= 10_000) return `${(lira / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} B ₺`
  return `${Math.round(lira).toLocaleString('tr-TR')} ₺`
}

/** Form girişi için: kullanıcı "1.234,56" veya "1234,56" veya "1234.56" yazabilir. */
export function parseUserAmount(input: string): AmountParseResult {
  const r = parseAmount(input, 'tr')
  if (r.ok) return r
  return r
}

export function sumKurus(values: number[]): number {
  let total = 0
  for (const v of values) total += v
  return total
}
