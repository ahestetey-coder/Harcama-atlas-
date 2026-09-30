/**
 * Uygulamanın adı ve temel ayarları. Adı değiştirmek için yalnızca bu dosyayı düzenleyin;
 * başlık, menü, PWA manifesti ve yedek dosya adları buradan beslenir.
 */
export const APP_CONFIG = {
  name: 'Harcama Atlası',
  shortName: 'Harcama Atlası',
  description: 'Aylık giderlerinizi yerelde, gizlilikle takip edin.',
  /** Dosya adlarında kullanılan kısa ad (Türkçe karakter içermemeli). */
  slug: 'harcama-atlasi',
  currency: 'TRY',
  locale: 'tr-TR',
} as const

/** İçe aktarma sınırları. */
export const IMPORT_LIMITS = {
  maxPdfBytes: 20 * 1024 * 1024,
  maxPdfPages: 40,
  maxOcrPdfPages: 10,
  maxSheetBytes: 10 * 1024 * 1024,
  maxImageBytes: 12 * 1024 * 1024,
  maxImagePixels: 40_000_000,
  maxRows: 5000,
} as const
