/**
 * Paketler ve fiyatlar. Fiyatlar geçicidir: ödeme aşamasında yönetim panelinden okunacak.
 * Özellik metinleri uygulamadaki Paketler sayfasıyla (src/pages/PlansPage.tsx) aynıdır.
 */
export type PlanId = 'free' | 'plus' | 'plus_plus'

export const YEARLY_DISCOUNT = 0.2

export interface PlanInfo {
  id: PlanId
  name: string
  tagline: string
  monthlyKurus: number
  highlights: string[]
  trial?: string
}

export const PLANS: PlanInfo[] = [
  {
    id: 'free',
    name: 'Ücretsiz',
    tagline: 'Harcamalarını kaydet, düzenle ve takip et',
    monthlyKurus: 0,
    highlights: ['Ekstre ve ekran görüntüsünden içe aktarma', 'Aylık özet ve toplam bütçe', 'Ortak gruplar ve eşit paylaşım', 'Finansal Harita testi'],
  },
  {
    id: 'plus',
    name: 'Plus',
    tagline: 'Bütçeni planla, varlıklarını tek yerde gör',
    monthlyKurus: 9999,
    highlights: ['Rotamı netleştir: gerçek rakamlarla kesin özgürlük yılı', 'Koçun otomatik bütçesi ve kategori limitleri', 'Borçlar, taksitler ve düzenli ödemeler', 'Yatırımlarım: altın, döviz, fon, hisse, kripto'],
    trial: '7 gün ücretsiz dene',
  },
  {
    id: 'plus_plus',
    name: 'Plus+',
    tagline: 'Özgürlük yolculuğunu oluştur ve ilerlemeni izle',
    monthlyKurus: 19999,
    highlights: ['Plus’ın bütün özellikleri', 'Kişisel finans koçu', 'Temkinli, orta ve olumlu gelecek senaryoları', 'Finansal bilgi ve ekonomi gündemi'],
    trial: '7 gün ücretsiz dene',
  },
]

/** Yıllık ödeme: aylık fiyatın 12 katından indirim düşülür, kuruşa yuvarlanır. */
export const yearlyKurus = (monthly: number) => Math.round(monthly * 12 * (1 - YEARLY_DISCOUNT))

const tl = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const tl0 = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 })

/** ₺1.299,99 biçimi; tam liralarda kuruş gösterilmez (₺0). */
export const formatTl = (kurus: number) => (kurus % 100 === 0 ? tl0 : tl).format(kurus / 100)

export type Mark = boolean | string

/** Karşılaştırma tablosu: [ücretsiz, plus, plus+] */
export const COMPARISON: Array<{ group: string; rows: Array<{ label: string; values: [Mark, Mark, Mark]; key?: boolean }> }> = [
  {
    group: 'Harcama takibi',
    rows: [
      { label: 'PDF, Excel, CSV ve ekran görüntüsünden içe aktarma', values: [true, true, true] },
      { label: 'Tekrar uyarısı ve kategori önerileri', values: [true, true, true] },
      { label: 'Aylık özet, kategori dağılımı, toplam bütçe', values: [true, true, true] },
      { label: 'Kart kesim gününe göre dönem', values: [true, true, true] },
      { label: 'Ortak gruplar ve eşit gider paylaşımı', values: [true, true, true] },
      { label: 'Yüzde, ağırlık veya tutarla paylaşım', values: [false, true, true] },
    ],
  },
  {
    group: 'Bütçe ve ödemeler',
    rows: [
      { label: 'Koçun otomatik bütçesi, kategori limitleri, ay sonu tahmini', values: [false, true, true] },
      { label: 'Taksitler ve gelecek ayların ödeme yükü', values: [false, true, true] },
      { label: 'Abonelikler, düzenli ödemeler ve hatırlatmalar', values: [false, true, true] },
      { label: 'Birikim hedefleri ve raporlar', values: [false, true, true] },
    ],
  },
  {
    group: 'Varlıklar ve rota',
    rows: [
      { label: 'Finansal Harita testi', values: [true, true, true] },
      { label: 'Rotamı netleştir: kesin özgürlük yılı ve sıradaki durak', values: [false, true, true], key: true },
      { label: 'Yatırımlarım ve Borçlarım (canlı fiyatlarla)', values: [false, true, true] },
      { label: 'Finansal Özgürlük Yolculuğum: 8 duraklı rota', values: [false, true, true] },
      { label: 'Gelecek senaryoları', values: [false, false, true] },
      { label: 'Kişisel finans koçu', values: [false, false, true] },
      { label: 'Finansal bilgi ve ekonomi gündemi', values: [false, false, true] },
    ],
  },
]
