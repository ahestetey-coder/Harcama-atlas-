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

/** İngilizce yanıtlar için aynı kurallar (koç İngilizce konuşan kullanıcıya İngilizce yanıt verir). */
const INSTRUMENT_EN = /\b(stocks?|shares?|equit(?:y|ies)|funds?|etfs?|index funds?|crypto\w*|bitcoin|btc|eth|ethereum|gold|silver|dollars?|euros?|forex|currenc(?:y|ies)|stock market|bist|index(?:es)?|bonds?|eurobonds?|warrants?|futures|coins?|tokens?|commodit(?:y|ies)|oil)\b/
const ACTION_EN =
  /\b(buy(?:ing)?|sell(?:ing)?|hold(?:ing)? (?:on to|onto)?|you should (?:buy|sell|hold|add|move|switch|invest|consider)|consider (?:buying|selling|adding|holding|switching|investing)|add (?:some|more)|move (?:into|to)|switch (?:into|to)|go long|go short|take a position|open a position|exit|get (?:in|out)|invest in|put (?:your|some) (?:money|savings) (?:in|into)|i (?:recommend|suggest|would)|i'd (?:buy|sell|go)|makes? sense to (?:buy|sell|hold)|good (?:opportunity|time to buy)|don't miss)\b/
const DIRECTION_EN =
  /\b(will (?:rise|fall|go up|go down|increase|drop|climb|rally|gain|lose)|(?:is|are) (?:likely|expected) to (?:rise|fall|go up|go down|increase|drop|gain)|could (?:rise|fall|go up|go down|rally|drop)|set to (?:rise|fall)|rally|bottom(?:ed)? out|hit (?:a|its) (?:peak|bottom)|all-time high)\b/
const NEGATION_EN =
  /\b(i (?:can't|cannot|won't|don't) (?:recommend|advise|tell|say|give|predict)|not (?:investment|financial) advice|isn't advice|licensed (?:investment |financial )?advis[eo]r|no one (?:can|knows)|nobody (?:can|knows)|can't be predicted|cannot be predicted|unpredictable|no guarantee|not guaranteed)\b/
const TARGET_PRICE_EN = /\b(target price|price target|target level|support level|resistance level|\d[\d.,]*\s?(?:tl|₺|\$|dollars?)\s?(?:level|target))\b/
const PERCENT_EN = /%\s?\d|\d\s?%|\d+\s?percent/
const PORTFOLIO_EN = /\b(portfolio|allocation|allocate|your savings|your money|basket)\b/
const CERTAIN_EN = /\b((?:definitely|certainly|guaranteed to) (?:rise|fall|go up|go down|gain)|guaranteed (?:returns?|profits?|gains?)|risk-free|can't-miss|sure thing|must (?:buy|sell))\b/

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
    const e = s.toLowerCase()
    if (CERTAIN.test(l) || CERTAIN_EN.test(e)) {
      out.push({ kind: 'kesin-dil', sentence: cut })
      continue
    }
    if (NEGATION.test(l) || NEGATION_EN.test(e)) continue
    if (TARGET_PRICE.test(l) || TARGET_PRICE_EN.test(e)) {
      out.push({ kind: 'hedef-fiyat', sentence: cut })
      continue
    }
    const inst = mentionsInstrument(s, l) || INSTRUMENT_EN.test(e)
    if (!inst) continue
    if ((PERCENT.test(l) && PORTFOLIO.test(l)) || (PERCENT_EN.test(e) && PORTFOLIO_EN.test(e))) out.push({ kind: 'portfoy-orani', sentence: cut })
    else if (ACTION.test(l) || ACTION_EN.test(e)) out.push({ kind: 'al-sat', sentence: cut })
    else if (DIRECTION.test(l) || DIRECTION_EN.test(e)) out.push({ kind: 'yon-tahmini', sentence: cut })
  }
  return out
}

export const STEERING_FALLBACK =
  'Belirli bir hisse, fon, kripto para, altın veya döviz için alım-satım, hedef fiyat ya da portföy oranı söyleyemem; bu kişisel yatırım danışmanlığıdır ve lisanslı bir danışmanın işidir. İsterseniz bütçenize göre her ay ne kadar ayırabileceğinizi, acil durum birikiminizi veya risk, likidite ve masraf gibi kavramları birlikte inceleyebiliriz.'

export const STEERING_FALLBACK_EN =
  "I can't give buy or sell calls, target prices or portfolio percentages for a specific stock, fund, cryptocurrency, gold or currency; that is personal investment advice and a job for a licensed adviser. If you like, we can look at how much you can set aside each month, your emergency fund, or ideas like risk, liquidity and fees together."
