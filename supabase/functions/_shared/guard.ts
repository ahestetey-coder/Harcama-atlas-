// Kişisel yatırım yönlendirmesi denetimi. Koç yanıtları ve araştırma raporları yayından/gönderimden
// önce bu kurallardan geçer; sistem talimatına güvenilmez. Saf fonksiyonlar: Deno'ya da tarayıcıya da bağlı değil.

export type SteeringKind = 'al-sat' | 'hedef-fiyat' | 'portfoy-orani' | 'yon-tahmini' | 'kesin-dil'

export interface SteeringIssue {
  kind: SteeringKind
  /** Sorunlu cümle (en çok 160 karakter). */
  sentence: string
}

/**
 * JavaScript'te \\b ve \\w yalnızca İngilizce harfleri tanır ("altını" içindeki ı'yı görmez).
 * Bu yardımcı, kalıplardaki \\b ve \\w'yi Türkçe harfleri de kapsayan karşılıklarıyla değiştirir.
 * Kalıplar küçük harfe çevrilmiş (tr) metinde denenir.
 */
const WORD = '[\\p{L}\\p{N}_]'
const BOUNDARY = `(?:(?<!${WORD})(?=${WORD})|(?<=${WORD})(?!${WORD}))`
function tr(re: RegExp): RegExp {
  return new RegExp(re.source.replace(/\\b/g, BOUNDARY).replace(/\\w/g, WORD), 'u')
}

/** Belirli yatırım araçları ve piyasa adları. */
const INSTRUMENT = tr(
  /\b(hisse\w*|fon|fonu|fona|fonda|fonlar\w*|yatırım fon\w*|kripto\w*|bitcoin\w*|btc|eth|ethereum\w*|altın\w*|gümüş\w*|dolar\w*|euro\w*|avro\w*|döviz\w*|borsa\w*|bist\w*|endeks\w*|tahvil\w*|eurobond\w*|varant\w*|vadeli işlem\w*|coin\w*|token\w*|emtia\w*|petrol\w*)\b/,
)

/** İki ya da üç harfli kısaltmalar ve bu uygulamaya ait büyük harfli sözcükler hisse kodu sayılmaz. */
const NOT_TICKER = new Set(['TÜİK', 'TCMB', 'KAP', 'SPK', 'BDDK', 'TL', 'USD', 'EUR', 'ABD', 'IMF', 'ECB', 'FED', 'BIS', 'SEC', 'BLS', 'GSYH', 'TÜFE', 'ÜFE', 'KKM', 'BES', 'TEFAS', 'NOT', 'PLUS'])

/** Kişiyi bir işlem yapmaya iten fiil ve kalıplar. */
const ACTION =
  tr(
  /\b(al(?:ın|ınız|abilirsin(?:iz)?|man(?:ız)?ı|malısın(?:ız)?|mayı düşün\w*|maya başla\w*)|satın al\w*|sat(?:ın|ınız|abilirsin(?:iz)?|man(?:ız)?ı|malısın(?:ız)?|mayı düşün\w*)|bozdur\w*|tut(?:un|unuz|man(?:ız)?ı|malısın(?:ız)?)|elde tut\w*|ekle(?:yin|yiniz|men(?:iz)?i|melisin(?:iz)?)|yönel(?:in|iniz|men(?:iz)?i|melisin(?:iz)?)|geçi(?:n|niz|şin)|geç(?:men(?:iz)?i|melisin(?:iz)?)|pozisyon\w*|gir(?:in|iniz|men(?:iz)?i|melisin(?:iz)?)|çık(?:ın|ınız|man(?:ız)?ı|malısın(?:ız)?)|değerlendir(?:in|ebilirsin(?:iz)?)|tercih ed(?:in|ebilirsin(?:iz)?)|biriktir(?:in|ebilirsin(?:iz)?)|kaçır(?:may|mayın)\w*|öneri(?:r|rim|yorum)|tavsiye ed\w*|mantıklı (?:olur|olabilir|görünüyor)|iyi bir fırsat\w*|fırsat olabilir|fırsat(?:ı)? değerlendir\w*)\b/,
)

/** Fiyat yönü tahmini, "muhtemelen" gibi yumuşatılmış olsa da. */
const DIRECTION =
  tr(
  /\b(yüksel(?:ecek|ir|ebilir|mesi bekleniyor|eceğini)|düş(?:ecek|er|ebilir|mesi bekleniyor|eceğini)|artacak|değer kazan(?:acak|ır|abilir)|değer kaybed(?:ecek|er)|kazandır(?:ır|acak|abilir)|prim yap\w*|ralli\w*|dip(?:te|ten)? (?:yap|gör)\w*|zirve\w*)\b/,
)

const NEGATION =
  tr(
  /\b(öner(?:e)?mem|önermiyorum|önermem|tavsiye (?:veremem|edemem|etmiyorum|vermiyorum)|söyleyemem|veremem|yapamam|uygun değil|değildir|yatırım tavsiyesi değil|tavsiye değil|lisanslı (?:bir )?yatırım danışman\w*|kimse bilemez|bilinemez|öngörülemez|garanti (?:edilemez|yok|değil))\b/,
)

const TARGET_PRICE = tr(
  /\b(hedef fiyat\w*|fiyat hedef\w*|hedef seviye\w*|destek seviye\w*|direnç seviye\w*|\d[\d.,]*\s?(?:tl|₺|\$|dolar)\s?(?:seviyesine|seviyesinden|hedef\w*))\b/,
)

const PERCENT = /%\s?\d|\d\s?%|yüzde\s?\d/u
const PORTFOLIO = tr(
  /\b(portföy\w*|dağılım\w*|sepet\w*|birikiminiz(?:in)?|paranız(?:ın)?)\b/,
)

const CERTAIN = tr(
  /\b(kesin(?:likle)? (?:yüksel|düş|art|kazan)\w*|garanti(?:li)? (?:getiri|kazanç)\w*|kaçırılmayacak\w*|risksiz\w*|mutlaka (?:al|sat|yüksel|düş)\w*)\b/,
)

function hasTicker(sentence: string): boolean {
  for (const m of sentence.matchAll(/(?<![\p{L}\p{N}])[A-ZÇĞİÖŞÜ]{4,5}(?![\p{Ll}\p{N}])/gu)) if (!NOT_TICKER.has(m[0])) return true
  return false
}

function mentionsInstrument(sentence: string, lower: string): boolean {
  return INSTRUMENT.test(lower) || hasTicker(sentence)
}

export function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?…])\s+|\n+|(?<=:)\s+(?=[-•*])|\s+[-•*]\s+/u)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Metindeki kişisel yatırım yönlendirmesi işaretlerini döndürür. Belirli bir araç (hisse, fon, kripto,
 * altın, döviz…) ile birlikte al/sat/tut/yönel gibi bir eylem, hedef fiyat, portföy yüzdesi veya fiyat yönü
 * tahmini aynı cümlede geçerse işaretlenir. Bunu reddeden cümleler ("…öneremem") işaretlenmez.
 */
export function steeringIssues(text: string): SteeringIssue[] {
  const out: SteeringIssue[] = []
  for (const s of sentences(text)) {
    const cut = s.slice(0, 160)
    const l = s.toLocaleLowerCase('tr-TR')
    if (CERTAIN.test(l)) {
      out.push({ kind: 'kesin-dil', sentence: cut })
      continue
    }
    if (NEGATION.test(l)) continue
    if (TARGET_PRICE.test(l)) {
      out.push({ kind: 'hedef-fiyat', sentence: cut })
      continue
    }
    const inst = mentionsInstrument(s, l)
    if (!inst) continue
    if (PERCENT.test(l) && PORTFOLIO.test(l)) out.push({ kind: 'portfoy-orani', sentence: cut })
    else if (ACTION.test(l)) out.push({ kind: 'al-sat', sentence: cut })
    else if (DIRECTION.test(l)) out.push({ kind: 'yon-tahmini', sentence: cut })
  }
  return out
}

export const STEERING_FALLBACK =
  'Belirli bir hisse, fon, kripto para, altın veya döviz için alım-satım, hedef fiyat ya da portföy oranı söyleyemem; bu kişisel yatırım danışmanlığıdır ve lisanslı bir danışmanın işidir. İsterseniz bütçenize göre her ay ne kadar ayırabileceğinizi, acil durum birikiminizi veya risk, likidite ve masraf gibi kavramları birlikte inceleyebiliriz.'
