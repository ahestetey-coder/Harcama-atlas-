/**
 * Uygulamanın dili. Türkçe varsayılandır; metinler kodda Türkçe yazılır ve tt('Türkçe') ile sarılır.
 * İngilizcede karşılıklar src/i18n/en.json sözlüğünden okunur; sözlükte olmayan metin Türkçe kalır.
 * Dil değişince sayfa yeniden yüklenir; böylece modül düzeyindeki metinler de yeni dille hesaplanır.
 */
export type Lang = 'tr' | 'en'

const KEY = 'ha:dil'
let lang: Lang = 'tr'
let dict: Record<string, string> = {}

export const getLang = (): Lang => lang

/** Tarih ve ay adlarının yerel ayarı. Tutarlar her iki dilde de Türk biçimindedir (₺1.234,56). */
export const dateLocale = (): string => (lang === 'en' ? 'en-GB' : 'tr-TR')

function readStored(): Lang | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'en' || v === 'tr' ? v : null
  } catch {
    return null
  }
}

/** Sıra: adresteki ?dil=, kayıtlı seçim, yeni kurulumda cihaz dili. Mevcut kullanıcılar Türkçede kalır. */
export function detectLang(): Lang {
  try {
    const q = new URLSearchParams(location.search).get('dil')
    if (q === 'en' || q === 'tr') {
      localStorage.setItem(KEY, q)
      return q
    }
  } catch {
    /* adres ya da depolama okunamadı */
  }
  const stored = readStored()
  if (stored) return stored
  let existing = false
  try {
    existing = Object.keys(localStorage).some((k) => k.startsWith('ha:') || k.startsWith('sb-'))
  } catch {
    /* depolama kapalı */
  }
  if (existing) return 'tr'
  const nav = (navigator.languages?.[0] ?? navigator.language ?? 'tr').toLowerCase()
  return nav.startsWith('tr') ? 'tr' : 'en'
}

/** Uygulama açılmadan önce çağrılır: dili belirler, İngilizcede sözlüğü yükler. */
export async function initLang(): Promise<void> {
  lang = detectLang()
  document.documentElement.lang = lang
  if (lang === 'en') {
    try {
      dict = (await import('../i18n/en.json')).default as Record<string, string>
    } catch {
      lang = 'tr'
      document.documentElement.lang = 'tr'
    }
  }
}

export function setLang(next: Lang): void {
  try {
    localStorage.setItem(KEY, next)
  } catch {
    /* kaydedilemedi; yine de yeniden yüklenir */
  }
  const url = new URL(location.href)
  url.searchParams.delete('dil')
  history.replaceState(history.state, '', url.href)
  location.reload()
}

/** Metni seçili dile çevirir. */
export function tt(tr: string): string {
  return lang === 'en' ? (dict[tr] ?? tr) : tr
}

/** Yer tutuculu metin: ttf('{0} gün kaldı', n) */
export function ttf(tr: string, ...args: unknown[]): string {
  return tt(tr).replace(/\{(\d+)\}/g, (_, i: string) => String(args[Number(i)] ?? ''))
}
