/**
 * Paketler ve fiyatlar. Fiyatlar geçicidir: ödeme aşamasında yönetim panelinden okunacak.
 * Özellik metinleri uygulamadaki Paketler sayfasıyla (src/pages/PlansPage.tsx) aynıdır.
 */
import type { Lang } from '../lib/i18n'

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

type PlanText = Pick<PlanInfo, 'name' | 'tagline' | 'highlights' | 'trial'>
const PLANS_EN: Record<PlanId, PlanText> = {
  free: {
    name: 'Free',
    tagline: 'Record, organise and track your spending',
    highlights: ['Import from statements and screenshots', 'Monthly summary and total budget', 'Shared groups and equal splitting', 'Financial Map test'],
  },
  plus: {
    name: 'Plus',
    tagline: 'Plan your budget, see all your assets in one place',
    highlights: ['Sharpen my route: an exact freedom year from your real numbers', 'Coach-built automatic budget and category limits', 'Debts, instalments and recurring payments', 'My investments: gold, currency, funds, stocks, crypto'],
    trial: 'Try free for 7 days',
  },
  plus_plus: {
    name: 'Plus+',
    tagline: 'Build your freedom journey and track your progress',
    highlights: ['Everything in Plus', 'Personal finance coach', 'Cautious, moderate and optimistic future scenarios', 'Financial knowledge and economic news'],
    trial: 'Try free for 7 days',
  },
}

/** Paketler seçilen dilde */
export const plansFor = (lang: Lang): PlanInfo[] => (lang === 'en' ? PLANS.map((p) => ({ ...p, ...PLANS_EN[p.id] })) : PLANS)

/** Yıllık ödeme: aylık fiyatın 12 katından indirim düşülür, kuruşa yuvarlanır. */
export const yearlyKurus = (monthly: number) => Math.round(monthly * 12 * (1 - YEARLY_DISCOUNT))

const money = (lang: Lang, digits: number) =>
  new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'tr-TR', { style: 'currency', currency: 'TRY', currencyDisplay: 'narrowSymbol', minimumFractionDigits: digits, maximumFractionDigits: digits })
const FMT = { tr: [money('tr', 0), money('tr', 2)], en: [money('en', 0), money('en', 2)] }

/** ₺1.299,99 biçimi (İngilizcede ₺1,299.99); tam liralarda kuruş gösterilmez (₺0). */
export const formatTl = (kurus: number, lang: Lang = 'tr') => FMT[lang][kurus % 100 === 0 ? 0 : 1].format(kurus / 100)

export type Mark = boolean | string

/** Karşılaştırma tablosu: [ücretsiz, plus, plus+] */
export const COMPARISON: Array<{ group: string; en: string; rows: Array<{ label: string; en: string; values: [Mark, Mark, Mark]; key?: boolean }> }> = [
  {
    group: 'Harcama takibi',
    en: 'Spending tracking',
    rows: [
      { label: 'PDF, Excel, CSV ve ekran görüntüsünden içe aktarma', en: 'Import from PDF, Excel, CSV and screenshots', values: [true, true, true] },
      { label: 'Tekrar uyarısı ve kategori önerileri', en: 'Duplicate warnings and category suggestions', values: [true, true, true] },
      { label: 'Aylık özet, kategori dağılımı, toplam bütçe', en: 'Monthly summary, category breakdown, total budget', values: [true, true, true] },
      { label: 'Kart kesim gününe göre dönem', en: 'Periods that follow your card statement date', values: [true, true, true] },
      { label: 'Ortak gruplar ve eşit gider paylaşımı', en: 'Shared groups and equal expense splitting', values: [true, true, true] },
      { label: 'Yüzde, ağırlık veya tutarla paylaşım', en: 'Split by percentage, weight or amount', values: [false, true, true] },
    ],
  },
  {
    group: 'Bütçe ve ödemeler',
    en: 'Budget and payments',
    rows: [
      { label: 'Koçun otomatik bütçesi, kategori limitleri, ay sonu tahmini', en: 'Coach-built automatic budget, category limits, month-end forecast', values: [false, true, true] },
      { label: 'Taksitler ve gelecek ayların ödeme yükü', en: 'Instalments and upcoming months’ payments', values: [false, true, true] },
      { label: 'Abonelikler, düzenli ödemeler ve hatırlatmalar', en: 'Subscriptions, recurring payments and reminders', values: [false, true, true] },
      { label: 'Birikim hedefleri ve raporlar', en: 'Savings goals and reports', values: [false, true, true] },
    ],
  },
  {
    group: 'Varlıklar ve rota',
    en: 'Assets and route',
    rows: [
      { label: 'Finansal Harita testi', en: 'Financial Map test', values: [true, true, true] },
      { label: 'Rotamı netleştir: kesin özgürlük yılı ve sıradaki durak', en: 'Sharpen my route: exact freedom year and next stop', values: [false, true, true], key: true },
      { label: 'Yatırımlarım ve Borçlarım (canlı fiyatlarla)', en: 'My investments and My debts (with live prices)', values: [false, true, true] },
      { label: 'Finansal Özgürlük Yolculuğum: 8 duraklı rota', en: 'My Financial Freedom Journey: an 8-stop route', values: [false, true, true] },
      { label: 'Gelecek senaryoları', en: 'Future scenarios', values: [false, false, true] },
      { label: 'Kişisel finans koçu', en: 'Personal finance coach', values: [false, false, true] },
      { label: 'Finansal bilgi ve ekonomi gündemi', en: 'Financial knowledge and economic news', values: [false, false, true] },
    ],
  },
]
