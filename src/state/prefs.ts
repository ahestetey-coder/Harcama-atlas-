/**
 * Arayüz tercihleri (tema, demo modu). Finansal veri içermez; yalnızca bu tercihler
 * localStorage'da tutulur. Tüm erişimler hataya karşı korunur (gizli mod vb.).
 */
const KEYS = {
  theme: 'ha:theme',
  demo: 'ha:demo',
  /** Bu cihazdaki ana veritabanını ilk kullanan hesabın kimliği (finansal veri değildir). */
  dbOwner: 'ha:db-owner',
  /** Ödeme altyapısı hazır olana kadar Plus/Plus+ özelliklerini denemek için önizleme paketi. */
  planPreview: 'ha:plan-preview',
} as const

export function readPref(key: keyof typeof KEYS): string | null {
  try {
    return localStorage.getItem(KEYS[key])
  } catch {
    return null
  }
}

export function writePref(key: keyof typeof KEYS, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(KEYS[key])
    else localStorage.setItem(KEYS[key], value)
  } catch {
    /* tercih kaydedilemedi; uygulama çalışmaya devam eder */
  }
}
