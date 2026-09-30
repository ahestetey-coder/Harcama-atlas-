/**
 * Metin dosyası kod çözme: UTF-8 (BOM'lu/BOM'suz), UTF-16, Windows-1254 (Türkçe) ve
 * yanlış çözülmüş UTF-8 ("Ã¼", "Ä±") onarımı.
 */

export interface DecodedText {
  text: string
  encoding: 'utf-8' | 'utf-8-bom' | 'utf-16le' | 'utf-16be' | 'windows-1254'
  repairedMojibake: boolean
  notes: string[]
}

const CP1252_HIGH: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88,
  0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93,
  0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
  0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
}

const MOJIBAKE_RE = /Ã[\u0080-¿]|Ä[±°ž\u009f\u009e]|Å[Ÿž\u009f\u009e]/

/** "MÄ°GROS" gibi iki kez kodlanmış metni onarmayı dener. */
export function repairMojibake(text: string): string | null {
  if (!MOJIBAKE_RE.test(text)) return null
  const bytes: number[] = []
  for (const ch of text) {
    const code = ch.codePointAt(0)!
    if (code < 0x100) bytes.push(code)
    else if (CP1252_HIGH[code] !== undefined) bytes.push(CP1252_HIGH[code])
    else return null
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes))
  } catch {
    return null
  }
}

export function decodeText(buffer: ArrayBuffer): DecodedText {
  const bytes = new Uint8Array(buffer)
  const notes: string[] = []
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return finish(new TextDecoder('utf-8').decode(bytes.subarray(3)), 'utf-8-bom', notes)
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return finish(new TextDecoder('utf-16le').decode(bytes.subarray(2)), 'utf-16le', notes)
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return finish(new TextDecoder('utf-16be').decode(bytes.subarray(2)), 'utf-16be', notes)
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return finish(text, 'utf-8', notes)
  } catch {
    notes.push('Dosya UTF-8 değil; Türkçe Windows (1254) kodlamasıyla okundu.')
    return finish(new TextDecoder('windows-1254').decode(bytes), 'windows-1254', notes)
  }
}

function finish(text: string, encoding: DecodedText['encoding'], notes: string[]): DecodedText {
  const repaired = repairMojibake(text)
  if (repaired !== null) {
    notes.push('Bozuk görünen Türkçe karakterler ("Ã¼", "Ä±" gibi) onarıldı; açıklamaları kontrol edin.')
    return { text: repaired, encoding, repairedMojibake: true, notes }
  }
  return { text, encoding, repairedMojibake: false, notes }
}
