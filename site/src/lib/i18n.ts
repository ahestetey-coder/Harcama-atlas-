/**
 * Sitenin dilleri. Türkçe varsayılandır ve önek almaz; İngilizce sayfalar /en altındadır.
 * İngilizce sayfalar Türkçe sayfa dosyasını içe aktarır; metinler sayfada t('Türkçe', 'English') ile yan yana durur.
 */
export type Lang = 'tr' | 'en'

/** Türkçe yol → İngilizce yol. Listede olmayan sayfalar (blog) yalnızca Türkçedir. */
const EN_PATHS: Record<string, string> = {
  '/': '/en/',
  '/fiyatlar': '/en/pricing',
  '/nasil-kullanilir': '/en/how-it-works',
  '/test': '/en/test',
  '/giris': '/en/login',
  '/odeme': '/en/checkout',
  '/hesap/abonelik': '/en/account/subscription',
  '/yasal/kvkk': '/en/legal/kvkk',
  '/yasal/acik-riza': '/en/legal/explicit-consent',
  '/yasal/gizlilik': '/en/legal/privacy',
  '/yasal/cerez': '/en/legal/cookies',
  '/yasal/kullanim-kosullari': '/en/legal/terms',
  '/yasal/on-bilgilendirme': '/en/legal/pre-information',
  '/yasal/mesafeli-satis': '/en/legal/distance-sales',
  '/yasal/iptal-iade': '/en/legal/cancellation-refund',
}
const TR_PATHS = Object.fromEntries(Object.entries(EN_PATHS).map(([tr, en]) => [en.replace(/\/$/, '') || '/en', tr]))

const trim = (p: string) => p.replace(/\/$/, '') || '/'

export const langOf = (pathname: string): Lang => (pathname === '/en' || pathname.startsWith('/en/') ? 'en' : 'tr')

/** Türkçe yolu (ör. '/fiyatlar', '/#sss', '/odeme?plan=plus') seçilen dile çevirir. */
export function localize(path: string, lang: Lang): string {
  if (lang === 'tr') return path
  const m = path.match(/^([^?#]*)(.*)$/)!
  const en = EN_PATHS[trim(m[1] || '/')]
  return en ? en + m[2] : path
}

/** Aynı sayfanın diğer dildeki karşılığı; karşılığı yoksa o dilin ana sayfası. */
export function counterpart(pathname: string): { lang: Lang; href: string; exists: boolean } {
  const p = trim(pathname)
  if (langOf(p) === 'en') {
    const tr = TR_PATHS[p]
    return { lang: 'tr', href: tr ?? '/', exists: !!tr }
  }
  const en = EN_PATHS[p]
  return { lang: 'en', href: en ?? '/en/', exists: !!en }
}

/** Sayfadaki metin seçici: t('Türkçe', 'English') */
export const translator = (lang: Lang) => (tr: string, en: string) => (lang === 'en' ? en : tr)

/** Tarayıcı tarafı: sayfanın dili <html lang> değerinden okunur. */
export const pageLang = (): Lang => (document.documentElement.lang === 'en' ? 'en' : 'tr')
