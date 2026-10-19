/**
 * Açıklama normalizasyonu: Türkçe harfler, büyük/küçük harf ve gereksiz boşluklar.
 * "Migros Ticaret A.Ş.  İstanbul" → "MIGROS TICARET A S ISTANBUL"
 */
const FOLD: Record<string, string> = {
  Ç: 'C',
  Ğ: 'G',
  İ: 'I',
  I: 'I',
  Ö: 'O',
  Ş: 'S',
  Ü: 'U',
  Â: 'A',
  Î: 'I',
  Û: 'U',
}

/** Büyük harfe çevirip Türkçe harfleri ASCII karşılığına indirger; noktalama korunur. */
export function foldTr(input: string): string {
  if (!input) return ''
  const upper = input.normalize('NFC').toLocaleUpperCase('tr-TR')
  let out = ''
  for (const ch of upper) {
    out += FOLD[ch] ?? ch
  }
  // Birleşik aksanları at
  return out.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export function normalizeText(input: string): string {
  if (!input) return ''
  // Harf/rakam dışındakileri boşluk yap
  const out = foldTr(input).replace(/[^A-Z0-9]+/g, ' ')
  return out.replace(/\s+/g, ' ').trim()
}

export function tokenize(normalized: string): string[] {
  return normalized ? normalized.split(' ') : []
}

/** Görüntüleme için açıklamayı temizler (boşlukları toparlar), anlamını değiştirmez. */
export function cleanDescription(input: string): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
}

const NOISE_TOKENS = new Set(['TR', 'TUR', 'IST', 'ISTANBUL', 'ANKARA', 'IZMIR', 'AS', 'A', 'S', 'LTD', 'STI', 'TIC', 'SAN', 'VE', 'POS', 'SANAL', 'WWW', 'COM', 'KART', 'ILE', 'NO'])

/**
 * İş yeri anahtarı: öğrenilen kurallar ve tekrar kontrolü için açıklamanın
 * ayırt edici ilk kelimeleri (rakamlar ve şehir/şirket ekleri atılır).
 */
export function merchantKey(description: string, maxTokens = 2): string {
  const tokens = tokenize(normalizeText(description)).filter((t) => !/\d/.test(t) && t.length > 1 && !NOISE_TOKENS.has(t))
  return tokens.slice(0, maxTokens).join(' ')
}
