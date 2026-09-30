/**
 * Arayüz tercihleri (tema, demo modu). Finansal veri içermez; yalnızca bu tercihler
 * localStorage'da tutulur. Tüm erişimler hataya karşı korunur (gizli mod vb.).
 */
const KEYS = {
  theme: 'ha:theme',
  demo: 'ha:demo',
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
