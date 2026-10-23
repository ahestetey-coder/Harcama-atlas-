/**
 * Ana para birimi. Tutarlar her yerde bu birimin kuruşu/senti olarak tutulur; birim değişince kayıtlı tutarlar çevrilmez.
 * Yeni kurulumda dilden gelir: Türkçede TL, İngilizcede USD. Ayarlar'dan değiştirilebilir (sayfa yeniden yüklenir).
 * initLang() içinde, uygulama yüklenmeden önce belirlenir; böylece modül düzeyindeki değerler de doğru birimle hesaplanır.
 */
export type Currency = 'TRY' | 'USD'

const KEY = 'ha:para'
let currency: Currency = 'TRY'

export const getCurrency = (): Currency => currency
export const isUsd = (): boolean => currency === 'USD'

/** Kayıtlı seçim; yoksa dile göre (İngilizce → USD) ve kaydedilir. ?para=USD|TRY adresten de seçilebilir. */
export function initCurrency(lang: 'tr' | 'en'): Currency {
  let stored: string | null = null
  try {
    const q = new URLSearchParams(location.search).get('para')
    if (q === 'USD' || q === 'TRY') localStorage.setItem(KEY, q)
  } catch {
    /* adres okunamadı */
  }
  try {
    stored = localStorage.getItem(KEY)
  } catch {
    /* depolama kapalı */
  }
  currency = stored === 'USD' || stored === 'TRY' ? stored : lang === 'en' ? 'USD' : 'TRY'
  try {
    if (!stored) localStorage.setItem(KEY, currency)
  } catch {
    /* kaydedilemedi */
  }
  return currency
}

export function setCurrency(next: Currency): void {
  try {
    localStorage.setItem(KEY, next)
  } catch {
    /* kaydedilemedi; yine de yeniden yüklenir */
  }
  const url = new URL(location.href)
  url.searchParams.delete('para')
  history.replaceState(history.state, '', url.href)
  location.reload()
}

/** Para biriminin simgesi ve kısa adı (etiketlerde: "Tutar (TL)" / "Amount ($)"). */
export const curSymbol = (): string => (currency === 'USD' ? '$' : '₺')
export const curCode = (): string => (currency === 'USD' ? 'USD' : 'TL')
/** Tutarların sayı biçimi: TL için 1.234,56; USD için 1,234.56. */
export const moneyLocale = (): string => (currency === 'USD' ? 'en-US' : 'tr-TR')

/** Tutarı simgesiyle yazar: "1.234 ₺" ya da "$1,234". Sayı zaten biçimlenmiş metin olarak verilir. */
export function withSymbol(num: string): string {
  if (currency === 'USD') return num.startsWith('-') ? `-$${num.slice(1)}` : `$${num}`
  return `${num} ₺`
}

/** Dolar tutarı (birim, kuruşsuz): USD'de "$1,234", TL kullanıcısında "1.234 $". */
export const usdText = (n: number): string => (currency === 'USD' ? `$${Math.round(n).toLocaleString('en-US')}` : `${Math.round(n).toLocaleString('tr-TR')} $`)

/** Bir tutar seçeneği para birimine göre: pick(60000, 1500) */
export const pick = <T>(tryValue: T, usdValue: T): T => (currency === 'USD' ? usdValue : tryValue)

/**
 * USD kullanılırken metinlerdeki TL kalıplarını çevirir: "(TL)" → "($)", "TL karşılığı" → "USD karşılığı" vb.
 * Tutarı sabit yazılmış metinler (test aralıkları gibi) bu yolla değil, pick() ile ayrı yazılır.
 */
export function curText(s: string): string {
  if (currency !== 'USD' || (!s.includes('TL') && !s.includes('₺'))) return s
  return s
    .replace(/\(TL\)/g, '($)')
    .replace(/\(TL \/ /g, '($ / ')
    .replace(/\bTL equivalent\b/g, 'USD equivalent')
    .replace(/\bTL karşılığı/g, 'USD karşılığı')
    .replace(/converted to TL\b/g, 'converted to USD')
    .replace(/TL'ye çevrilir/g, "USD'ye çevrilir")
    .replace(/₺\{(\d)\}/g, '${$1}')
    .replace(/\{(\d)\} ₺/g, '${$1}')
}
