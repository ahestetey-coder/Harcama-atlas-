import { formatWhole } from './money'
import { curCode, pick, usdText } from '../lib/currency'
import type { RouteSetupData } from './routeSetup'
import {
  DEFAULT_INFLATION_PCT,
  DEFAULT_LIFE_AGE,
  DEFAULT_TARGET_AGE,
  DTI_LIMIT,
  EMERGENCY_MONTHS,
  FAT_FACTOR,
  LEAN_FACTOR,
  MC_RUNS,
  MC_SEED,
  recommendedWithdrawalPct,
  RISK_PROFILES,
  SAVING_GROWTH_PCT,
  SAVING_RATE_TARGET,
  SCENARIO_RETURN_PCT,
  STARTER_MONTHS,
  type RiskLevel,
  type RiskProfile,
} from './assumptions'
import { simulateDebts, type CoachDebt, type DebtStrategy } from './coach'
import { addMonths, MONTH_NAMES, periodOf } from './dates'
import { isSpending, type IsoDate, type MonthKey, type Transaction } from './types'
import { tt, ttf, pctText } from '../lib/i18n'

export { DTI_LIMIT, SAVING_RATE_TARGET, STARTER_MONTHS }

/**
 * Plus+ "Finansal Özgürlük Yolculuğum" (Özgürlük Rotası v2): test, hedef motoru, rota aşamaları,
 * göstergeler ve senaryolar. Hedef üç girdiden üretilir: uygulamadaki veriler (işlemler, düzenli
 * ödemeler, borçlar, varlıklar), test yanıtları ve src/domain/assumptions.ts'teki kaynaklı
 * varsayımlar. Bütün hesaplar cihazda yapılır. Başarı olasılığı varsayıma dayalı bir benzetimdir,
 * gerçek bir olasılık ya da garanti değildir; sonuçlar eğitim amaçlıdır ve yatırım tavsiyesi içermez.
 */

export type JourneyGoal = 'independence' | 'security' | 'early-retire' | 'custom'
export type IncomeStability = 'regular' | 'variable' | 'irregular'

export const JOURNEY_GOAL_LABEL: Record<JourneyGoal, string> = {
  independence: tt('Finansal özgürlük'),
  security: tt('Güvenceli bir düzen'),
  'early-retire': tt('Erken emeklilik'),
  custom: tt('Kendi hedefim'),
}

export const STABILITY_LABEL: Record<IncomeStability, string> = {
  regular: tt('Düzenli (maaş gibi)'),
  variable: tt('Değişken'),
  irregular: tt('Düzensiz'),
}

export type Housing = 'rent' | 'mortgage' | 'owned' | 'family'
export type Pension = 'sgk-bes' | 'sgk' | 'bes' | 'none'
export type HealthCover = 'private' | 'public' | 'none'
export type RiskStance = 'cautious' | 'balanced' | 'bold'
/** Planın ölçü birimi: hedefler TL, dolar ya da gram altın cinsinden sabitlenir. */
export type PlanBase = 'TRY' | 'USD' | 'XAU'

export const HOUSING_LABEL: Record<Housing, string> = { rent: tt('Kirada'), mortgage: tt('Ev sahibi, kredisi sürüyor'), owned: tt('Ev sahibi, borçsuz'), family: tt('Aile yanında / lojman') }
export const PENSION_LABEL: Record<Pension, string> = { 'sgk-bes': tt('SGK ve BES'), sgk: tt('Yalnızca SGK'), bes: tt('Yalnızca BES'), none: tt('Yok') }
export const HEALTH_LABEL: Record<HealthCover, string> = { private: tt('SGK ve özel sağlık sigortası'), public: tt('Yalnızca SGK (genel sağlık sigortası)'), none: 'Yok' }
export const RISK_LABEL: Record<RiskStance, string> = { cautious: tt('Temkinli: dalgalanma beni çok rahatsız eder'), balanced: tt('Dengeli: kısa vadeli düşüşlere katlanırım'), bold: tt('Atak: uzun vadede dalgalanmayı kabul ederim') }
export const BASE_LABEL: Record<PlanBase, string> = { TRY: curCode(), USD: 'USD', XAU: tt('Gram altın') }

export interface JourneyProfile {
  goal: JourneyGoal
  goalName?: string
  /** Hedef süresi (yıl). */
  horizonYears: number
  /** Hedefte karşılanacak aylık yaşam gideri, test günündeki parayla (TL kuruş). */
  targetMonthlyExpenseKurus: number
  monthlyIncomeKurus: number
  /** Kira, fatura, gıda gibi zorunlu aylık giderler (test günündeki parayla). */
  essentialMonthlyKurus: number
  incomeStability: IncomeStability
  /** Korumak istenen harcama öncelikleri (kategori kimlikleri). */
  priorities: string[]
  /** Hedef sermayeden yılda çekilecek oran (%); hedef sermaye = yıllık gider ÷ oran. */
  withdrawalRatePct: number
  /** Kutlaması gösterilmiş aşamalar. */
  celebrated: string[]
  confirmedAt: string
  age?: number
  /** Bakmakla yükümlü olunan kişi sayısı. */
  dependents?: number
  housing?: Housing
  /** Kira, temettü, faiz gibi çalışmadan gelen aylık gelir (TL kuruş). */
  passiveIncomeKurus?: number
  pension?: Pension
  health?: HealthCover
  risk?: RiskStance
  base?: PlanBase
  /** Plan biriminin, hedeflerin sabitlendiği gündeki TL karşılığı (USD kuru ya da gram altın fiyatı). */
  baseRateTl?: number
  /** Testin yapıldığı günler (YYYY-AA-GG), en yeni sonda. */
  tests?: string[]
  // ---- Özgürlük Rotası v2 (eski profillerde yok) ----
  /** Çalışmayı bırakmak istenen yaş. Yoksa yaş + hedef süresi. */
  targetAge?: number
  /** Paranın yetmesi gereken yaş (varsayılan 90). */
  lifeAge?: number
  /** Testte doğrulanan aylık harcama (6 grup, test günündeki parayla; düzenli ödemeler hariç). */
  spending?: SpendBreakdown
  /** Hedef yaşam: bugünkü harcamanın yüzdesi (50–160). */
  targetSpendPct?: number
  /** Hedef yaşa kadar ev sahibi olma planı: konut gideri hedeften düşülür. */
  ownHomePlan?: boolean
  /** Yıllık seyahat / büyük harcama bütçesi. */
  annualBigSpendKurus?: number
  /** Risk toleransı soruları (her biri 1–4). */
  riskAnswers?: number[]
  /** Beklenen SGK/BES aylığı (bugünün parasıyla). */
  pensionIncomeKurus?: number
  /** Kişinin kendi yazdığı finansal bağımsızlık hedefi (TL kuruş, plan biriminin sabitlendiği günün kuruyla). Yoksa sistem hesaplar. */
  customFiKurus?: number
  /** Hedef yaştan sonra yarı zamanlı / serbest iş geliri. */
  partTimeIncomeKurus?: number
  /** Çekim oranını kullanıcı mı belirledi (yoksa süreye göre önerilen kullanılır). */
  withdrawalCustom?: boolean
  /** TL nominal hedef için yıllık enflasyon varsayımı (%). */
  inflationPct?: number
  /** Rota kurulumunda girilen ilk borç/birikim rakamları (uygulamada kayıt yokken kullanılır). */
  setup?: RouteSetupData
}

export type SpendGroup = 'housing' | 'food' | 'transport' | 'bills' | 'fun' | 'other'
export type SpendBreakdown = Record<SpendGroup, number>
export const SPEND_GROUPS: SpendGroup[] = ['housing', 'food', 'transport', 'bills', 'fun', 'other']
export const SPEND_GROUP_LABEL: Record<SpendGroup, string> = {
  housing: tt('Kira / konut'),
  food: tt('Gıda ve market'),
  transport: tt('Ulaşım'),
  bills: tt('Faturalar ve abonelikler'),
  fun: tt('Eğlence ve dışarıda yemek'),
  other: tt('Diğer (sağlık, giyim, eğitim…)'),
}
/** Zorunlu sayılan gruplar (acil durum fonu bunlarla ölçülür). */
const ESSENTIAL_GROUPS: SpendGroup[] = ['housing', 'food', 'transport', 'bills']

const GROUP_BY_ID: Record<string, SpendGroup> = {
  'cat-kira': 'housing',
  'cat-market': 'food',
  'cat-akaryakit': 'transport',
  'cat-ulasim': 'transport',
  'cat-faturalar': 'bills',
  'cat-abonelik': 'bills',
  'cat-restoran': 'fun',
  'cat-eglence': 'fun',
}

/** Uygulamadaki kategoriyi testteki 6 harcama grubuna eşler. */
export function spendGroupOf(categoryId: string | null, name = ''): SpendGroup {
  if (categoryId && GROUP_BY_ID[categoryId]) return GROUP_BY_ID[categoryId]
  const n = name.toLocaleLowerCase('tr')
  if (/kira|konut|aidat|\bev\b/.test(n)) return 'housing'
  if (/market|gıda|bakkal|manav|kasap/.test(n)) return 'food'
  if (/ulaşım|yakıt|akaryakıt|taksi|otopark/.test(n)) return 'transport'
  if (/fatura|abonelik|elektrik|doğalgaz|internet|telefon/.test(n)) return 'bills'
  if (/restoran|kafe|eğlence|yemek|sinema/.test(n)) return 'fun'
  return 'other'
}

export const sumSpend = (b: SpendBreakdown) => SPEND_GROUPS.reduce((s, g) => s + (b[g] ?? 0), 0)

/** Uygulamadaki düzenli ödeme ya da taksit (Özgürlük Rotası'nda bitiş tarihiyle birikime eklenir). */
export interface RecurringLoad {
  name: string
  monthlyKurus: number
  /** Taksit mi (bitince birikime eklenir, hedef yaşamda yer almaz). */
  installment: boolean
  /** Kalan ay; süresizse null. */
  remainingMonths: number | null
  /** Konut gideri mi (ev sahibi olma planında hedeften düşülür). */
  housing?: boolean
}

export const DEFAULT_WITHDRAWAL_PCT = 4

/** Hedef sermaye: pasif gelirle karşılanmayan yıllık yaşam gideri ÷ çekim oranı (bugünün parasıyla). */
export function targetCapital(p: Pick<JourneyProfile, 'targetMonthlyExpenseKurus' | 'withdrawalRatePct' | 'passiveIncomeKurus'>): number {
  const rate = Math.max(0.5, p.withdrawalRatePct) / 100
  return Math.round((Math.max(0, p.targetMonthlyExpenseKurus - (p.passiveIncomeKurus ?? 0)) * 12) / rate)
}

/** Son `count` tamamlanmış dönemin (kayıt olanların) ortalama net gideri; kayıt yoksa null. */
export function averageMonthlyExpense(txs: Transaction[], startDay: number, today: IsoDate, count = 3): { averageKurus: number; months: number } | null {
  const current = periodOf(today, startDay)
  const wanted = Array.from({ length: count }, (_, i) => addMonths(current, -(i + 1)))
  const totals = new Map<MonthKey, number>()
  for (const t of txs) {
    if (!isSpending(t)) continue
    const p = periodOf(t.date, startDay)
    if (!wanted.includes(p)) continue
    totals.set(p, (totals.get(p) ?? 0) + (t.type === 'expense' ? t.amountKurus : -t.amountKurus))
  }
  if (!totals.size) return null
  const sum = [...totals.values()].reduce((a, b) => a + b, 0)
  return { averageKurus: Math.round(sum / totals.size), months: totals.size }
}

/** Uygulamadaki verilerden çıkarılan durum (ankette doğrulanır, eksikler gösterilir). */
export interface JourneyFacts {
  /** Ortalama aylık net gider (son 3 dönem). */
  averageExpenseKurus: number | null
  expenseMonths: number
  /** Düzenli ödemelerin aylık karşılığı. */
  recurringMonthlyKurus: number
  /** Hızlı kullanılabilir birikim: mevduat, nakit, döviz, altın, fon. */
  liquidKurus: number
  /** Bütün yatırımlar (hisse dahil). */
  assetsKurus: number
  debtsKurus: number
  /** Yüksek faizli tüketici borcu: kredi kartı, KMH, ihtiyaç kredisi, kişisel borç (faizsiz taksitler hariç). */
  consumerDebtKurus?: number
  /** Borçlar için her ay yapılan ödemeler (taksitler dahil). */
  monthlyDebtPaymentKurus?: number
  /** Varlıklara net yatırılan para ve piyasa kaynaklı değişim. */
  contributedKurus: number
  marketGainKurus: number
  /** Son 3 ayda varlıklara net eklenen para (aylık ortalama). */
  recentMonthlyContributionKurus: number
  hasAssets: boolean
  // ---- Özgürlük Rotası v2: canlı veriler (değişince hedef ve rota yeniden hesaplanır) ----
  /** Borçlarım'daki borçlar (bakiye, aylık faiz, taksit). Ekstre taksitleri burada değil, recurringList'te. */
  debtList?: CoachDebt[]
  /** Düzenli ödemeler ve taksitler (borç taksitleri hariç). */
  recurringList?: RecurringLoad[]
  /** Son 3 dönemin 6 gruba göre ortalama harcaması (düzenli ödeme ve taksitler hariç). */
  spendingByGroup?: SpendBreakdown | null
}

export type StageId = 'balance' | 'starter' | 'debt' | 'emergency' | 'saving' | 'security' | 'independence' | 'freedom'
/** Rotada olmayan ama testte değerlendirilen ölçütler. */
export type CheckId = 'health' | 'pension'

/** Bir aşamanın tamamlanması için sağlanması gereken tek bir koşul. */
export interface Condition {
  label: string
  /** money: kuruş, pct: oran (0..1). */
  unit: 'money' | 'pct'
  now: number
  target: number
  /** atLeast: şu anki değer hedefe ulaşmalı; atMost: hedefin altında kalmalı. */
  dir: 'atLeast' | 'atMost'
  done: boolean
  progress: number
  /** Kalan tutar (kuruş) ya da oran farkı. */
  left: number
  /** Kalanın kısa açıklaması (ör. "20.000 ₺ daha biriktirin"). */
  leftText: string
  /** Bugünkü aylık birikim hızıyla tahmini süre (ay); null: bu hızla ulaşılamıyor; undefined: süreyle ölçülmez. */
  etaMonths?: number | null
  /** Tutar plan biriminde (USD/altın) gösterilsin mi. */
  inBase?: boolean
}

export interface Stage {
  id: StageId
  title: string
  /** Rota haritasındaki kısa ad. */
  short: string
  /** Tamamlanma ölçütü. */
  criterion: string
  /** Ölçütün dayandığı yaklaşım. */
  source: string
  /** Mevcut durum metni. */
  status: string
  /** Bir sonraki adım. */
  next: string
  progress: number
  done: boolean
  /** Bu aşama için veri eksik mi? */
  missing?: string
  /** Aşamanın hedefi, tek cümle. */
  goal: string
  /** Hedefe varmak için sağlanması gereken koşullar. */
  conditions: Condition[]
  /** Kalan koşulların en uzun tahmini süresi (ay); null: bu hızla ulaşılamıyor; undefined: süreyle ölçülmez ya da tamam. */
  etaMonths?: number | null
  /** Büyük sermaye aşamasında sıradaki küçük ara hedef (yalnızca Finansal güvence aşamasında). */
  step?: FreedomStep
}

/** Büyük sermaye hedefinden önceki küçük, ulaşılabilir özgürlük adımları (bugünün parasıyla). */
export interface FreedomStep {
  id: 'year1' | 'coast'
  title: string
  /** Rota takvimindeki kısa ad. */
  short: string
  /** Adımın ne sağladığı, tek cümle. */
  what: string
  targetKurus: number
  /** Birikimin güvenli çekimle her ay karşıladığı gider (kuruş). */
  coverMonthlyKurus: number
  done: boolean
  progress: number
  leftKurus: number
  /** Ör. "12.000 $ kaldı". */
  leftText: string
  /** Bugünkü birikim hızıyla tahmini süre (ay); null: ulaşılamıyor; undefined: tamam. */
  etaMonths?: number | null
}

/**
 * Finansal güvenceden (Lean FI) önceki ara adımlar: 1 yıllık gider ve Coast FI.
 * Tutarlar kullanıcının hedef giderinden ve çekim oranından gelir; büyük hedefi küçük basamaklara böler.
 */
export function freedomSteps(plan: Pick<FreedomPlan, 'fiKurus' | 'leanKurus' | 'coastKurus' | 'netKurus' | 'monthlySavingKurus' | 'realReturnPct' | 'targetMonthlyKurus' | 'withdrawal'>, fmt: (kurus: number) => string = tl): FreedomStep[] {
  const fi = plan.fiKurus
  if (!(fi > 0)) return []
  const swr = plan.withdrawal.usedPct / 100
  const cover = (k: number) => Math.round((k * swr) / 12)
  const raw: Array<Pick<FreedomStep, 'id' | 'title' | 'short' | 'what' | 'targetKurus'>> = [
    { id: 'year1', title: tt('Bir yıllık özgürlük'), short: tt('1 yıl'), what: tt('Bir yıl hiç çalışmasanız da hedeflediğiniz yaşamı sürdürebilirsiniz'), targetKurus: plan.targetMonthlyKurus * 12 },
    { id: 'coast', title: tt('Coast FI'), short: tt('Coast'), what: tt('Bundan sonra hiç eklemeseniz de birikim getirisiyle hedef yaşınızda tamamlanır'), targetKurus: plan.coastKurus },
  ]
  const net = Math.max(0, plan.netKurus)
  const steps: FreedomStep[] = []
  for (const r of raw.filter((x) => x.targetKurus > 0 && x.targetKurus < plan.leanKurus * 0.97).sort((a, b) => a.targetKurus - b.targetKurus)) {
    const prev = steps[steps.length - 1]
    if (prev && r.targetKurus < prev.targetKurus * 1.1) continue
    const c = cover(r.targetKurus)
    const done = net >= r.targetKurus
    steps.push({
      ...r,
      what: r.what || ttf('Birikiminiz her ay {0} giderinizi karşılar', tl(c)),
      coverMonthlyKurus: c,
      done,
      progress: clamp01(net / r.targetKurus),
      leftKurus: Math.max(0, r.targetKurus - net),
      leftText: done ? tt('Ulaşıldı') : ttf('{0} kaldı', fmt(r.targetKurus - net)),
      etaMonths: done ? undefined : monthsToTarget(net, plan.monthlySavingKurus, r.targetKurus, plan.realReturnPct),
    })
  }
  return steps
}

export interface Check {
  id: CheckId
  title: string
  criterion: string
  source: string
  status: string
  done: boolean | null
}

export interface JourneyIndicators {
  /** Birikimin kaç aylık zorunlu gideri karşıladığı. */
  securityMonths: number | null
  goalKurus: number
  /** Hedefe sayılan birikim (varlıklar − borçlar, eksiye düşmez). */
  progressKurus: number
  goalRatio: number
  monthlySavingKurus: number
  /** Senaryolara göre hedef tarih aralığı (olumlu → temkinli). */
  route: { optimistic: number | null; mid: number | null; cautious: number | null }
  /** Aşamaların hedef sermayeleri (bugünkü TL). */
  securityCapitalKurus: number
  independenceCapitalKurus: number
  emergencyMonths: number
  /** Planın TL karşılığının test gününe göre çarpanı (USD/altın bazında değişir). */
  indexFactor: number
}

export interface JourneyResult {
  stages: Stage[]
  checks: Check[]
  indicators: JourneyIndicators
  /** Rotadaki konum: tamamlanan aşamalar + sıradakinin ilerlemesi (0..aşama sayısı). */
  position: number
  /** Sıradaki (ilk tamamlanmamış) aşama; hepsi tamamsa null. */
  current: Stage | null
  /** Seviye: baştan itibaren arka arkaya tamamlanan aşama sayısı. */
  level: number
  /** Özgürlük Rotası v2 hedef motoru: hedef, gereken birikim, borç takvimi, benzetim. */
  plan: FreedomPlan
  /** Finansal güvenceden önceki küçük özgürlük adımları. */
  steps: FreedomStep[]
  /** Sıradaki (ulaşılmamış) küçük adım; hepsi geçildiyse null. */
  nextStep: FreedomStep | null
}

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0)
const tl = formatWhole

/** Acil durum fonu kaç aylık zorunlu gider olmalı: düzenli gelirde 3, bakmakla yükümlü kişi varsa ya da gelir değişkense 6, düzensizse 9. */
export function emergencyMonthsFor(p: Pick<JourneyProfile, 'incomeStability' | 'dependents'>): number {
  if (p.incomeStability === 'irregular') return EMERGENCY_MONTHS.irregular
  if (p.incomeStability === 'variable' || (p.dependents ?? 0) > 0) return EMERGENCY_MONTHS.variableOrDependents
  return EMERGENCY_MONTHS.regular
}

/** Aylık birikim: gelir − ortalama gider (bilinmiyorsa zorunlu gider). Pasif gelir de gelire katılır. */
export function monthlySaving(p: JourneyProfile, f: JourneyFacts): number {
  const spend = f.averageExpenseKurus ?? p.essentialMonthlyKurus
  return p.monthlyIncomeKurus + (p.passiveIncomeKurus ?? 0) - spend
}

// ---------- Plan birimi (TL / USD / gram altın) ----------

/** TL karşılıkları: USD kuru ve gram altın fiyatı (TL). */
export interface BaseRates {
  USD?: number | null
  XAU?: number | null
}

const rateOf = (base: PlanBase, rates: BaseRates) => (base === 'TRY' ? 1 : (rates[base] ?? null))

/**
 * Hedeflerin bugünkü TL karşılığı için çarpan. Plan USD ya da altın bazındaysa hedefler o birimde sabittir;
 * kur arttıkça TL karşılığı da artar. Güncel kur bilinmiyorsa 1.
 */
export function indexFactor(p: Pick<JourneyProfile, 'base' | 'baseRateTl'>, rates: BaseRates): number {
  const base = p.base ?? 'TRY'
  const now = rateOf(base, rates)
  if (base === 'TRY' || !now || !p.baseRateTl) return 1
  return now / p.baseRateTl
}

/** Plan biriminde yazılan tutarı (ör. 500.000 $) profilde saklanan TL kuruşa çevirir; kur yoksa null. */
export function planAmountToKurus(amount: number, p: Pick<JourneyProfile, 'base' | 'baseRateTl'>, rates: BaseRates): number | null {
  const base = p.base ?? 'TRY'
  const rate = base === 'TRY' ? 1 : (p.baseRateTl ?? rateOf(base, rates))
  if (!rate || !(amount > 0)) return null
  return Math.round(amount * rate * 100)
}

/** Plan birimini değiştirir: hedefler bugünkü TL karşılıklarıyla yeni birime sabitlenir. */
export function rebase(p: JourneyProfile, base: PlanBase, rates: BaseRates): JourneyProfile | null {
  const rate = rateOf(base, rates)
  if (!rate) return null
  const k = indexFactor(p, rates)
  return {
    ...p,
    targetMonthlyExpenseKurus: Math.round(p.targetMonthlyExpenseKurus * k),
    essentialMonthlyKurus: Math.round(p.essentialMonthlyKurus * k),
    customFiKurus: p.customFiKurus ? Math.round(p.customFiKurus * k) : undefined,
    base,
    baseRateTl: base === 'TRY' ? undefined : rate,
  }
}

/** TL tutarını plan biriminde yazar (ör. "12.500 $", "84,2 gr altın"). */
export function formatInBase(kurus: number, base: PlanBase, rates: BaseRates): string | null {
  const rate = rateOf(base, rates)
  if (!rate) return null
  const v = kurus / 100 / rate
  if (base === 'USD') return usdText(v)
  if (base === 'XAU') return ttf('{0} gr altın', v.toLocaleString('tr-TR', { maximumFractionDigits: v >= 100 ? 0 : 1 }))
  return tl(kurus)
}

// ---------- Test hakkı ----------

export const TESTS_PER_MONTH = 2

/** Bu takvim ayında kalan test hakkı. */
export function testsLeft(p: Pick<JourneyProfile, 'tests'> | null | undefined, today: IsoDate): number {
  const month = today.slice(0, 7)
  const used = (p?.tests ?? []).filter((d) => d.slice(0, 7) === month).length
  return Math.max(0, TESTS_PER_MONTH - used)
}

/** Koşul yardımcıları. */
function moneyCond(label: string, now: number, target: number, saving: number, verb: string, inBase = false, realPct = 0): Condition {
  const done = now >= target
  const left = Math.max(0, target - now)
  return {
    label,
    unit: 'money',
    now,
    target,
    dir: 'atLeast',
    done,
    progress: target > 0 ? clamp01(now / target) : 1,
    left,
    leftText: done ? tt('Sağlanıyor') : verb,
    etaMonths: done ? undefined : monthsToTarget(now, saving, target, realPct),
    inBase,
  }
}

export function buildJourney(p: JourneyProfile, f: JourneyFacts, rates: BaseRates = {}, opts: Omit<FreedomOptions, 'rates'> = {}): JourneyResult {
  const plan = buildFreedomPlan(p, f, { ...opts, rates })
  const base = p.base ?? 'TRY'
  /** Sermaye tutarları plan biriminde yazılır. */
  const big = (kurus: number) => (base === 'TRY' ? tl(kurus) : (formatInBase(kurus, base, rates) ?? tl(kurus)))
  const saving = plan.monthlySavingKurus
  const income = p.monthlyIncomeKurus + (p.passiveIncomeKurus ?? 0)
  // Aylık gider: tüketim + taksitler + borç ödemeleri (v2 verisi yoksa ortalama gider)
  const spend = income - plan.availableKurus + (f.debtList ?? []).reduce((s, d) => s + (d.balanceKurus > 0 ? Math.min(d.balanceKurus, d.minPaymentKurus) : 0), 0)
  const essential = Math.max(1, plan.essentialKurus)
  const net = Math.max(0, plan.netKurus)

  const balanceRatio = income > 0 ? spend / income : 1
  const balanceDone = income > 0 && spend <= income
  const balance: Stage = {
    id: 'balance',
    title: tt('Bütçe dengesi'),
    short: tt('Denge'),
    criterion: tt('Aylık gider, gelirin altında'),
    source: tt('Bütün finansal planların ilk koşulu: harcama gelirden azdır.'),
    status: income > 0 ? ttf('Gelirin %{0}\'i harcanıyor', Math.round(balanceRatio * 100)) : tt('Gelir bilgisi yok'),
    next: balanceDone ? tt('Dengeyi koruyun; fazlayı birikime yönlendirin') : ttf('Aylık giderleri {0} azaltmak dengeyi sağlar', tl(spend - income + 1)),
    progress: income > 0 ? clamp01(spend <= income ? 1 : income / spend) : 0,
    done: balanceDone,
    missing: f.averageExpenseKurus === null ? tt('Son dönemlerde gider kaydı yok; zorunlu gider kullanıldı') : undefined,
    goal: income > 0 ? ttf('Aylık gideriniz, {0} gelirinizin altında kalsın', tl(income)) : tt('Aylık gideriniz gelirinizin altında kalsın'),
    conditions: [
      {
        label: tt('Aylık gider'),
        unit: 'money',
        now: spend,
        target: income,
        dir: 'atMost',
        done: balanceDone,
        progress: income > 0 ? clamp01(spend <= income ? 1 : income / spend) : 0,
        left: Math.max(0, spend - income),
        leftText: balanceDone ? tt('Sağlanıyor') : income > 0 ? ttf('Ayda {0} azaltın', tl(spend - income + 1)) : tt('Testte gelirinizi girin'),
      },
    ],
  }

  const starterTarget = essential * STARTER_MONTHS
  const starterCond = moneyCond(tt('Hızlı kullanılabilir birikim'), f.liquidKurus, starterTarget, saving, ttf('{0} daha biriktirin', tl(starterTarget - f.liquidKurus)))
  const starter: Stage = {
    id: 'starter',
    title: tt('Başlangıç fonu'),
    short: tt('Başlangıç'),
    criterion: ttf('{0} aylık zorunlu gider kadar hızlı kullanılabilir birikim', STARTER_MONTHS),
    source: tt('Küçük bir acil durum fonu, beklenmedik bir giderin yeni borca dönmesini önler (Dave Ramsey\'nin "bebek adımları" yaklaşımı).'),
    status: `${tl(f.liquidKurus)} / ${tl(starterTarget)}`,
    next: f.liquidKurus >= starterTarget ? tt('Sırada yüksek faizli borçlar var') : ttf('{0} daha biriktirin', tl(starterTarget - f.liquidKurus)),
    progress: starterCond.progress,
    done: starterCond.done,
    missing: f.hasAssets ? undefined : tt('Yatırımlarım boş; birikiminizi oraya ekleyin'),
    goal: ttf('Kenarda {0} hızlı kullanılabilir para ({1} aylık zorunlu gider)', tl(starterTarget), STARTER_MONTHS),
    conditions: [starterCond],
  }

  const consumer = f.consumerDebtKurus ?? f.debtsKurus
  const pay = f.monthlyDebtPaymentKurus
  const dti = pay !== undefined && income > 0 ? pay / income : null
  const dtiOk = dti === null || dti <= DTI_LIMIT
  const debtConds: Condition[] = [
    {
      label: tt('Yüksek faizli borç (kart, KMH, ihtiyaç, kişisel)'),
      unit: 'money',
      now: consumer,
      target: 0,
      dir: 'atMost',
      done: consumer <= 0,
      progress: consumer > 0 ? clamp01(income > 0 ? 1 - consumer / (consumer + income * 3) : 0) : 1,
      left: Math.max(0, consumer),
      leftText: consumer > 0 ? ttf('{0} borcu kapatın', tl(consumer)) : tt('Sağlanıyor'),
      etaMonths: consumer > 0 ? (saving > 0 ? Math.ceil(consumer / saving) : null) : undefined,
    },
  ]
  if (dti !== null)
    debtConds.push({
      label: tt('Borç ödemesi / gelir'),
      unit: 'pct',
      now: dti,
      target: DTI_LIMIT,
      dir: 'atMost',
      done: dtiOk,
      progress: dtiOk ? 1 : clamp01(DTI_LIMIT / dti),
      left: Math.max(0, dti - DTI_LIMIT),
      leftText: dtiOk ? tt('Sağlanıyor') : ttf('Aylık borç ödemelerini {0} azaltın', tl(pay! - income * DTI_LIMIT)),
    })
  const debt: Stage = {
    id: 'debt',
    title: tt('Yüksek faizli borçsuz'),
    short: tt('Borçsuz'),
    criterion: ttf('Kredi kartı, KMH, ihtiyaç kredisi ve kişisel borç kalmadı; borç ödemeleri gelirin %{0}\'sının altında', DTI_LIMIT * 100),
    source: tt('Yüksek faizli borç, yatırımın getirisinden hızlı büyür; önce kapatılır (çığ yöntemi). %36 borç/gelir eşiği bankaların kredi değerlendirmesinde yaygın kullanılır.'),
    status: [consumer > 0 ? ttf('Tüketici borcu {0}', tl(consumer)) : tt('Tüketici borcu yok'), dti !== null ? ttf('borç ödemesi gelirin %{0}\'i', Math.round(dti * 100)) : null].filter(Boolean).join(' · '),
    next: consumer > 0 ? ttf('{0} borcu en yüksek faizliden başlayarak kapatın', tl(consumer)) : dtiOk ? tt('Yeni tüketici borcundan kaçının') : ttf('Aylık borç ödemelerini {0} azaltın', tl(pay! - income * DTI_LIMIT)),
    progress: consumer > 0 ? debtConds[0].progress : dtiOk ? 1 : clamp01(DTI_LIMIT / dti!),
    done: consumer <= 0 && dtiOk && income > 0,
    goal: ttf('Yüksek faizli borç kalmasın; borç ödemeleri gelirin en çok %{0}\'sı olsun', DTI_LIMIT * 100),
    conditions: debtConds,
  }

  const emMonths = emergencyMonthsFor(p)
  const emTarget = essential * emMonths
  const emCond = moneyCond(tt('Hızlı kullanılabilir birikim'), f.liquidKurus, emTarget, saving, ttf('{0} daha biriktirin', tl(emTarget - f.liquidKurus)))
  const emergency: Stage = {
    id: 'emergency',
    title: tt('Acil durum fonu'),
    short: tt('Acil fon'),
    criterion: ttf('{0} aylık zorunlu gider kadar hızlı kullanılabilir birikim', emMonths),
    source: tt('Finansal planlamacıların yaygın önerisi 3–6 aylık zorunlu giderdir; gelir düzensizse ya da bakmakla yükümlü olduğunuz kişiler varsa daha uzun.'),
    status: `${tl(f.liquidKurus)} / ${tl(emTarget)}`,
    next: f.liquidKurus >= emTarget ? tt('Fonu koruyun; fazlası uzun vadeli birikime gidebilir') : ttf('{0} daha biriktirin', tl(emTarget - f.liquidKurus)),
    progress: emCond.progress,
    done: emCond.done,
    goal: ttf('Kenarda {0} hızlı kullanılabilir para ({1} aylık zorunlu gider)', tl(emTarget), emMonths),
    conditions: [emCond],
  }

  const rate = income > 0 ? saving / income : 0
  const savingDone = rate >= SAVING_RATE_TARGET
  const savingStage: Stage = {
    id: 'saving',
    title: tt('Düzenli birikim'),
    short: tt('Birikim'),
    criterion: ttf('Gelirin en az %{0}\'si her ay birikime gidiyor', SAVING_RATE_TARGET * 100),
    source: tt('50/30/20 kuralı: gelirin yarısı ihtiyaçlara, %30\'u isteklere, en az %20\'si birikime (Elizabeth Warren).'),
    status: income > 0 ? ttf('Birikim oranı %{0}', Math.max(0, Math.round(rate * 100))) : tt('Gelir bilgisi yok'),
    next: savingDone
      ? f.recentMonthlyContributionKurus > 0
        ? tt('Birikimi Yatırımlarım’a eklemeye devam edin')
        : tt('Ayırdığınız tutarı Yatırımlarım’a ekleyerek takip edin')
      : ttf('Ayda {0} daha ayırmak aşamayı tamamlar', tl(Math.max(0, income * SAVING_RATE_TARGET - saving))),
    progress: clamp01(rate / SAVING_RATE_TARGET),
    done: savingDone,
    goal: income > 0 ? ttf('Her ay en az {0} birikim (gelirin %{1}\'si)', tl(income * SAVING_RATE_TARGET), SAVING_RATE_TARGET * 100) : ttf('Gelirin en az %{0}\'si her ay birikime gitsin', SAVING_RATE_TARGET * 100),
    conditions: [
      {
        label: tt('Aylık birikim oranı'),
        unit: 'pct',
        now: Math.max(0, rate),
        target: SAVING_RATE_TARGET,
        dir: 'atLeast',
        done: savingDone,
        progress: clamp01(rate / SAVING_RATE_TARGET),
        left: Math.max(0, SAVING_RATE_TARGET - rate),
        leftText: savingDone ? tt('Sağlanıyor') : income > 0 ? ttf('Ayda {0} daha ayırın', tl(Math.max(0, income * SAVING_RATE_TARGET - saving))) : tt('Testte gelirinizi girin'),
      },
    ],
  }

  const swrText = pctText(plan.withdrawal.usedPct)
  const capStage = (id: 'security' | 'independence' | 'freedom', title: string, short: string, goal: number, monthly: number, what: string, source: string): Stage => {
    const cond = moneyCond(tt('Net birikim (yatırımlar − borçlar)'), net, goal, saving, ttf('{0} kaldı', big(goal - net)), true, plan.realReturnPct)
    return {
      id,
      title,
      short,
      criterion: ttf('Birikimden yıllık {0} çekim, {1} (aylık {2}) karşılıyor: {3}', swrText, what, tl(monthly), big(goal)),
      source,
      status: `${big(net)} / ${big(goal)}`,
      next: net >= goal ? tt('Bu seviyeye ulaştınız') : ttf('{0} kaldı', big(goal - net)),
      progress: cond.progress,
      done: cond.done,
      goal: ttf('{0} birikim: yıllık {1} çekim {2} (aylık {3}) karşılar', big(goal), swrText, what, tl(monthly)),
      conditions: [cond],
    }
  }
  const tm = plan.targetMonthlyKurus
  const security = capStage('security', tt('Finansal güvence · Lean FI'), tt('Güvence'), plan.leanKurus, Math.round(tm * LEAN_FACTOR), ttf('hedef yaşamın %{0}\'ini, yani sade bir yaşamı', LEAN_FACTOR * 100), tt('Lean FI: hedef harcamanın %70\'i (topluluk kavramı). Çekim oranı emeklilik süresine göre (Bengen 1994; Pfau 2010).'))
  const independence = capStage('independence', tt('Finansal bağımsızlık · FI'), tt('Bağımsızlık'), plan.fiKurus, tm, tt('hedeflediğiniz yaşam giderini'), tt('Hedef sermaye = (hedef yıllık gider − garantili gelir) ÷ çekim oranı (Bengen 1994; Cooley, Hubbard ve Walz 1998; Pfau 2010).'))
  const freedom = capStage('freedom', tt('Finansal özgürlük · Fat FI'), tt('Özgürlük'), plan.fatKurus, Math.round(tm * FAT_FACTOR), ttf('hedef yaşamın %{0}\'ini, yani rahat bir yaşamı', FAT_FACTOR * 100), tt('Fat FI: hedef harcamanın %150\'si; beklenmedik giderlere ve daha rahat bir yaşama pay bırakır.'))

  const steps = freedomSteps(plan, big)
  const nextStep = security.done ? null : (steps.find((x) => !x.done) ?? null)
  if (nextStep) {
    security.step = nextStep
    security.goal = ttf('Sıradaki adım {0}: {1} birikim. {2}', nextStep.title, big(nextStep.targetKurus), nextStep.what)
    security.next = ttf('Önce {0}: {1}. Aşama hedefi {2}', nextStep.title, nextStep.leftText, big(plan.leanKurus))
  }

  const stages = [balance, starter, debt, emergency, savingStage, security, independence, freedom]
  for (const s of stages) {
    const open = s.conditions.filter((c) => !c.done && c.etaMonths !== undefined)
    if (s.done || !open.length) continue
    s.etaMonths = open.some((c) => c.etaMonths === null) ? null : Math.max(...open.map((c) => c.etaMonths!))
  }
  let position = 0
  for (const s of stages) {
    if (s.done) position++
    else {
      position += s.progress
      break
    }
  }
  const checks: Check[] = [
    {
      id: 'health',
      title: tt('Sağlık güvencesi'),
      criterion: tt('Genel sağlık sigortası (SGK) var; mümkünse tamamlayıcı ya da özel sağlık sigortası'),
      source: tt('Büyük bir sağlık gideri birikimi tek seferde eritebilir; acil durum fonu sigortanın yerini tutmaz.'),
      status: p.health ? HEALTH_LABEL[p.health] : tt('Testte yanıtlanmadı'),
      done: p.health ? p.health !== 'none' : null,
    },
    {
      id: 'pension',
      title: tt('Emeklilik güvencesi'),
      criterion: tt('SGK primleri ödeniyor; ek olarak BES ya da düzenli emeklilik birikimi var'),
      source: tt('Emeklilik birikimi ne kadar erken başlarsa bileşik getiriden o kadar çok yararlanır.'),
      status: p.pension ? PENSION_LABEL[p.pension] : tt('Testte yanıtlanmadı'),
      done: p.pension ? p.pension === 'sgk-bes' : null,
    },
  ]
  const goal = plan.fiKurus
  const route = plan.route
  return {
    stages,
    checks,
    position,
    current: stages.find((s) => !s.done) ?? null,
    level: Math.floor(position),
    indicators: {
      securityMonths: essential > 0 ? f.liquidKurus / essential : null,
      goalKurus: goal,
      progressKurus: net,
      goalRatio: clamp01(net / Math.max(1, goal)),
      monthlySavingKurus: saving,
      route,
      securityCapitalKurus: plan.leanKurus,
      independenceCapitalKurus: plan.fiKurus,
      emergencyMonths: emMonths,
      indexFactor: indexFactor(p, rates),
    },
    plan,
    steps,
    nextStep,
  }
}

// ---------- Senaryolar ----------

export type ScenarioKey = 'cautious' | 'mid' | 'optimistic'

/** Reel (enflasyondan arındırılmış) yıllık getiri varsayımları. */
export const SCENARIOS: Record<ScenarioKey, { label: string; realReturnPct: number }> = {
  cautious: { label: tt('Temkinli'), realReturnPct: SCENARIO_RETURN_PCT.cautious },
  mid: { label: tt('Orta'), realReturnPct: SCENARIO_RETURN_PCT.mid },
  optimistic: { label: tt('Olumlu'), realReturnPct: SCENARIO_RETURN_PCT.optimistic },
}

const monthlyRate = (annualPct: number) => Math.pow(1 + annualPct / 100, 1 / 12) - 1

/** Süreyi okunur yazar: "Şimdi", "7 ay", "3 yıl", "14 yıl 5 ay". */
export function durationLabel(months: number): string {
  if (months <= 0) return tt('Şimdi')
  const y = Math.floor(months / 12)
  const m = months % 12
  return [y ? ttf('{0} yıl', y) : '', m ? ttf('{0} ay', m) : ''].filter(Boolean).join(' ')
}

/** Bugünden `months` ay sonrası, "Mart 2041" biçiminde. */
export function reachDateLabel(months: number, today: IsoDate): string {
  const [y, m] = today.split('-').map(Number)
  const idx = y * 12 + (m - 1) + months
  return `${MONTH_NAMES[idx % 12]} ${Math.floor(idx / 12)}`
}

export interface ScenarioInput {
  startKurus: number
  monthlySavingKurus: number
  years: number
  /** Yıllık enflasyon varsayımı (%), yalnızca nominal gösterim için. */
  inflationPct: number
  /** Ek aylık birikim (bugünün parasıyla). */
  extraSavingKurus: number
  /** Gelir kaybı: bu kadar ay birikim yapılamaz ve gider birikimden karşılanır. */
  incomeLossMonths: number
  incomeLossMonthlySpendKurus: number
  /** Büyük harcama: tutar (bugünün parasıyla) ve kaçıncı yılın başında. */
  bigExpenseKurus: number
  bigExpenseYear: number
  /** Aylık birikimin yıllık reel artışı (%); verilmezse SAVING_GROWTH_PCT. */
  savingGrowthPct?: number
  /** Biten taksit ve borç ödemeleriyle aylık birikime eklenen (FreedomPlan.flowAdjustKurus). */
  flowAdjustKurus?: number[]
}

export interface ScenarioPoint {
  year: number
  /** Bugünün parasıyla. */
  realKurus: number
  /** Varsayılan enflasyonla o yılın parasıyla. */
  nominalKurus: number
}

export interface Simulation {
  /** Yıl sonu değerleri (0. yıl = bugün), `years` yılına kadar. */
  points: ScenarioPoint[]
  /** Hedefe ulaşılan ay (grafik süresinden bağımsız, en çok 100 yıl); ulaşılamıyorsa null. */
  reachMonths: number | null
}

const MAX_MONTHS = 1200

/**
 * Yolculuk ve Senaryolar'ın ortak hesabı (bugünün parasıyla; birikim enflasyon kadar artar varsayımı).
 * Her ay: büyük harcama (yılın ilk ayı) → getiri (birikim artıdaysa) → birikim ya da gelir kaybında gider.
 */
export function simulatePlan(input: ScenarioInput, realAnnualPct: number, goalKurus: number): Simulation {
  const r = monthlyRate(realAnnualPct)
  const inf = 1 + input.inflationPct / 100
  const points: ScenarioPoint[] = [{ year: 0, realKurus: input.startKurus, nominalKurus: input.startKurus }]
  const horizon = Math.max(1, Math.round(input.years)) * 12
  const bigMonth = input.bigExpenseKurus > 0 ? Math.max(1, Math.round(input.bigExpenseYear) * 12 - 11) : 0
  const steady = input.monthlySavingKurus + input.extraSavingKurus
  const growth = 1 + (input.savingGrowthPct ?? SAVING_GROWTH_PCT) / 100
  let reach: number | null = input.startKurus >= goalKurus ? 0 : null
  let v = input.startKurus
  for (let m = 1; m <= Math.max(horizon, MAX_MONTHS); m++) {
    if (m === bigMonth) v -= input.bigExpenseKurus
    v = v * (1 + (v > 0 ? r : 0))
    // Birikim her yıl reel olarak artar (artıdaysa); gelir kaybı aylarında gider birikimden çıkar
    const adj = input.flowAdjustKurus
    const flow = steady + (adj?.length ? adj[Math.min(m, adj.length) - 1] : 0)
    v += m <= input.incomeLossMonths ? -input.incomeLossMonthlySpendKurus : flow > 0 ? flow * Math.pow(growth, Math.floor((m - 1) / 12)) : flow
    if (reach === null && v >= goalKurus) reach = m
    if (m <= horizon && m % 12 === 0) {
      const y = m / 12
      points.push({ year: y, realKurus: Math.round(v), nominalKurus: Math.round(v * Math.pow(inf, y)) })
    }
    if (m >= horizon) {
      if (reach !== null) break
      // Şoklar geçti, birikim yok ve getiri büyütmüyorsa hedefe hiç ulaşılmaz
      if (m >= input.incomeLossMonths && m >= bigMonth && m >= (input.flowAdjustKurus?.length ?? 0) && steady + (input.flowAdjustKurus?.at(-1) ?? 0) <= 0 && (r <= 0 || v <= 0)) break
    }
  }
  return { points, reachMonths: reach }
}

/** Hedefe kaç ayda ulaşılır; ulaşılamıyorsa (ya da 100 yılı aşıyorsa) null. */
export function monthsToTarget(startKurus: number, monthlySavingKurus: number, targetKurus: number, realAnnualPct: number): number | null {
  return simulatePlan({ startKurus, monthlySavingKurus, years: 1, inflationPct: 0, extraSavingKurus: 0, incomeLossMonths: 0, incomeLossMonthlySpendKurus: 0, bigExpenseKurus: 0, bigExpenseYear: 1 }, realAnnualPct, targetKurus).reachMonths
}

/** Yıl sonu değerleri (0. yıl = bugün). Gelir kaybı ilk aylarda varsayılır. */
export function projectScenario(input: ScenarioInput, realAnnualPct: number): ScenarioPoint[] {
  return simulatePlan(input, realAnnualPct, Infinity).points
}

// ---------- Özgürlük Rotası v2: hedef motoru ----------

export interface RiskAssessment {
  /** Testteki sorulardan (yoksa eski risk tutumundan); test yanıtlanmadıysa null. */
  tolerance: RiskLevel | null
  /** Verilerden: yatırım süresi, gelir düzeni, acil fon, borç/gelir. */
  capacity: RiskLevel
  capacityFactors: { horizon: number; stability: number; emergency: number; debt: number }
  /** Nihai profil: toleransla kapasitenin düşük olanı. */
  final: RiskLevel
  profile: RiskProfile
}

export interface DebtEnd {
  id: string
  name: string
  /** Kapanma ayı (1 = bu ay); kapanmıyorsa null. */
  month: number | null
  /** Kapanınca serbest kalan aylık taksit. */
  freedKurus: number
}

export interface RecurringEnd {
  name: string
  month: number
  freedKurus: number
}

export interface BandPoint {
  age: number
  p10: number
  p50: number
  p90: number
}

export interface FutureTarget {
  years: number
  inflationPct: number
  tlNominalKurus: number
  /** Güncel kurla; kur bilinmiyorsa null. */
  usd: number | null
  goldGr: number | null
}

export interface FreedomPlan {
  age: number
  targetAge: number
  lifeAge: number
  yearsToTarget: number
  retirementYears: number
  withdrawal: { recommendedPct: number; usedPct: number; custom: boolean }
  /** Hedef kişinin kendi yazdığı tutar mı? */
  ownGoal: boolean
  /** Sistemin önerdiği bağımsızlık hedefi (kişi kendi hedefini yazsa da). */
  suggestedFiKurus: number
  risk: RiskAssessment
  /** Bugünkü aylık tüketim (düzenli ödemeler dahil, taksit ve borç ödemeleri hariç). */
  spendKurus: number
  /** Zorunlu aylık gider (acil fon için). */
  essentialKurus: number
  /** Hedef yaşamın aylık gideri (yıllık büyük harcama dahil). */
  targetMonthlyKurus: number
  /** Emeklilikte garantili/pasif aylık gelir. */
  guaranteedMonthlyKurus: number
  annualNeedKurus: number
  fiKurus: number
  leanKurus: number
  fatKurus: number
  /** Başlangıç birikimi: varlıklar (kredi ve taksitler aylık ödemeyle kapanır, düşülmez). */
  netKurus: number
  /** Aylık birikime bugüne göre eklenen (index m−1); son değer sonrası için de geçerli. */
  flowAdjustKurus: number[]
  /** Borç ve birikime ayrılabilen aylık tutar (gelir − tüketim − taksitler). */
  availableKurus: number
  /** Bugünkü aylık birikim: net varlığa eklenen (borç anaparası dahil, faiz hariç). */
  monthlySavingKurus: number
  savingRate: number
  /** Hedef yaşta hedefe ulaşmak için gereken aylık birikim ve bugünküyle farkı. */
  requiredMonthlyKurus: number
  gapKurus: number
  /** Bugünkü hızla (borç ve taksit bitişleri dahil) hedefe ulaşma ayı; 100 yılda ulaşılmıyorsa null. */
  reachMonths: number | null
  /** Üç getiri senaryosuyla varış ayı (aynı nakit akışı); ulaşılamıyorsa null. */
  route: { optimistic: number | null; mid: number | null; cautious: number | null }
  /** Üç senaryoda yıl sonu net birikim (0. yıl = bugün, PATH_YEARS yıla kadar). */
  paths: { cautious: number[]; mid: number[]; optimistic: number[] }
  reachAge: number | null
  coastKurus: number
  coastPassed: boolean
  /** Monte Carlo başarı oranı (0..1): varsayıma dayalı benzetim. */
  successRate: number
  bands: BandPoint[]
  debtEnds: DebtEnd[]
  /** Bütün borçların kapandığı ay; borç yoksa 0, kapanmıyorsa null. */
  debtFreeMonth: number | null
  recurringEnds: RecurringEnd[]
  levers: {
    /** Tek başına yeterli ek aylık birikim. */
    extraMonthlyKurus: number
    /** Bugünkü birikimle hedefe yetişilen en erken hedef yaş; yoksa null. */
    targetAge: number | null
    /** Bugünkü birikimle hedef yaşta karşılanabilen harcama düzeyi (bugünkü harcamanın %'si). */
    spendPct: number
  }
  future: FutureTarget
  /** Başlangıç noktası (bugünkü harcamanın %'si) ve kullanılan harcama tabanı. */
  spendPct: number
  /** Gerçek reel getiri (beklenen senaryo, %). */
  realReturnPct: number
}

/** Tohumlu rastgele sayı (mulberry32): aynı tohum, aynı senaryolar. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Standart normal (Box–Muller). */
function normal(rand: () => number): number {
  const u = Math.max(rand(), 1e-12)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand())
}

/** Testteki risk toleransı soruları (Grable ve Lytton 1999 ölçeğinden uyarlandı; birebir kopya değildir). */
export const RISK_QUESTIONS: Array<{ q: string; options: string[] }> = [
  { q: tt('Birikiminiz bir yılda %25 değer kaybetse ne yaparsınız?'), options: [tt('Hepsini satarım'), tt('Bir kısmını satarım'), tt('Dokunmam, beklerim'), tt('Fırsat bilip eklerim')] },
  { q: tt('Arkadaşlarınız sizi riske karşı nasıl tanımlar?'), options: [tt('Riskten kaçınan'), 'Temkinli', tt('Hesaplı risk alan'), tt('Risk sever')] },
  { q: tt('Yatırım deneyiminiz nedir?'), options: [tt('Hiç yok'), tt('Mevduat, altın, döviz'), tt('Fon ya da hisse, az deneyim'), tt('Birkaç yıldır düzenli yatırımcıyım')] },
  { q: tt('"Risk" kelimesi size önce ne düşündürür?'), options: [tt('Kayıp'), tt('Belirsizlik'), tt('Fırsat'), tt('Heyecan')] },
  { q: tt('Hangi seçeneği tercih edersiniz?'), options: pick([tt('Kesin 10.000 ₺'), tt('%50 ihtimalle 25.000 ₺, yoksa 0'), tt('%25 ihtimalle 60.000 ₺, yoksa 0'), tt('%5 ihtimalle 300.000 ₺, yoksa 0')], [tt('Kesin 1.000 $'), tt('%50 ihtimalle 2.500 $, yoksa 0'), tt('%25 ihtimalle 6.000 $, yoksa 0'), tt('%5 ihtimalle 30.000 $, yoksa 0')]) },
  { q: tt('Beklenmedik bir kazancı nasıl değerlendirirsiniz?'), options: [tt('Mevduatta tutarım'), tt('Çoğunu güvenli araçlarda tutarım'), tt('Yarısını dalgalı araçlara ayırırım'), tt('Çoğunu yüksek getiri beklediğim araçlara ayırırım')] },
]

/** Tolerans: 6 soru (6–24 puan) → 0..3. Eski profillerde risk tutumundan. */
export function riskToleranceOf(p: Pick<JourneyProfile, 'riskAnswers' | 'risk'>): RiskLevel | null {
  const a = p.riskAnswers
  if (a && a.length) {
    const score = a.reduce((s, x) => s + Math.min(4, Math.max(1, x)), 0)
    const ratio = (score - a.length) / (3 * a.length)
    return ratio < 0.3 ? 0 : ratio < 0.55 ? 1 : ratio < 0.8 ? 2 : 3
  }
  if (p.risk) return p.risk === 'cautious' ? 0 : p.risk === 'balanced' ? 1 : 2
  return null
}

/** Kapasite: yatırım süresi, gelir düzeni, acil fon (ay) ve borç/gelir oranından. */
export function riskCapacity(o: { yearsToTarget: number; stability: IncomeStability; emergencyMonths: number | null; dti: number | null }) {
  const horizon = o.yearsToTarget < 5 ? 0 : o.yearsToTarget < 10 ? 1 : o.yearsToTarget < 20 ? 2 : 3
  const stability = o.stability === 'irregular' ? 0 : o.stability === 'variable' ? 1.5 : 3
  const m = o.emergencyMonths ?? 0
  const emergency = m < 1 ? 0 : m < 3 ? 1 : m < 6 ? 2 : 3
  const d = o.dti ?? 0
  const debt = d > DTI_LIMIT ? 0 : d > 0.2 ? 1 : d > 0.1 ? 2 : 3
  const level = Math.floor((horizon + stability + emergency + debt) / 4) as RiskLevel
  return { level, factors: { horizon, stability, emergency, debt } }
}

export interface FreedomOptions {
  strategy?: DebtStrategy
  rates?: BaseRates
  /** Monte Carlo senaryo sayısı (test ve ekran için ayarlanabilir). */
  runs?: number
  /** Kaldıraç denemesi: bugünkü birikime eklenen aylık tutar. */
  extraMonthlyKurus?: number
}

/** Orta senaryo yolunun uzunluğu (yıl). */
export const PATH_YEARS = 60

const pctile = (sorted: Float64Array, q: number) => sorted[Math.floor(q * (sorted.length - 1))]

/**
 * Hedef motoru. Hedef sermaye = (hedef yıllık gider − garantili/pasif gelir) ÷ süreye göre çekim oranı.
 * Birikim takvimi: bugünkü birikim + kapanan borçların taksitleri + biten taksit ve düzenli ödemeler.
 * Tutarlar bugünün parasıyladır (reel).
 */
export function buildFreedomPlan(p: JourneyProfile, f: JourneyFacts, opts: FreedomOptions = {}): FreedomPlan {
  const rates = opts.rates ?? {}
  const k = indexFactor(p, rates)
  const age = p.age ?? 35
  const targetAge = Math.max(age, p.targetAge ?? (p.age ? p.age + p.horizonYears : Math.max(age + p.horizonYears, DEFAULT_TARGET_AGE)))
  const lifeAge = Math.max(targetAge + 1, p.lifeAge ?? DEFAULT_LIFE_AGE)
  const yearsToTarget = targetAge - age
  const retirementYears = lifeAge - targetAge
  const recommended = recommendedWithdrawalPct(retirementYears)
  const custom = p.withdrawalCustom ?? p.withdrawalRatePct !== 4
  const swrPct = custom ? p.withdrawalRatePct : recommended
  const swr = Math.max(0.5, swrPct) / 100

  const debts = (f.debtList ?? []).filter((d) => d.balanceKurus > 0)
  const recurring = f.recurringList ?? []
  const mins = debts.reduce((s, d) => s + Math.min(d.balanceKurus, d.minPaymentKurus), 0)
  const recurringBills = recurring.filter((r) => !r.installment).reduce((s, r) => s + r.monthlyKurus, 0)
  const installments = recurring.filter((r) => r.installment).reduce((s, r) => s + r.monthlyKurus, 0)
  const income = p.monthlyIncomeKurus + (p.passiveIncomeKurus ?? 0)

  // Bugünkü harcama: testte doğrulanan 6 grup (plan birimiyle güncel TL) + canlı düzenli ödemeler
  const groups = p.spending ? (Object.fromEntries(SPEND_GROUPS.map((g) => [g, Math.round((p.spending![g] ?? 0) * k)])) as SpendBreakdown) : null
  const spend = groups ? sumSpend(groups) + recurringBills : (f.averageExpenseKurus ?? Math.round(p.essentialMonthlyKurus * k))
  const essential = groups ? ESSENTIAL_GROUPS.reduce((s, g) => s + groups[g], 0) + recurringBills + installments + mins : Math.round(p.essentialMonthlyKurus * k)
  const available = groups ? income - spend - installments : income - spend

  // Hedef yaşam: bugünkü sürekli harcamanın yüzdesi (ev sahibi olunacaksa konut hariç) + yıllık büyük harcama
  const pct = p.targetSpendPct ?? 100
  const housing = groups ? groups.housing + recurring.filter((r) => r.housing && !r.installment).reduce((s, r) => s + r.monthlyKurus, 0) : 0
  const lifeBase = groups ? Math.max(0, sumSpend(groups) + recurring.filter((r) => !r.installment && r.remainingMonths === null).reduce((s, r) => s + r.monthlyKurus, 0) - (p.ownHomePlan ? housing : 0)) : Math.round(p.targetMonthlyExpenseKurus * k)
  const big = Math.round(((p.annualBigSpendKurus ?? 0) * k) / 12)
  const guaranteed = (p.pensionIncomeKurus ?? 0) + (p.passiveIncomeKurus ?? 0) + (p.partTimeIncomeKurus ?? 0)
  const autoMonthly = groups ? Math.round((lifeBase * pct) / 100) + big : lifeBase + big
  // Kendi hedefini yazan kişi: hedef yaşam o sermayenin güvenli çekimle karşıladığı aylık tutardır; bütün aşamalar buna göre ölçeklenir
  const ownFi = p.customFiKurus && p.customFiKurus > 0 ? Math.round(p.customFiKurus * k) : null
  const targetMonthly = ownFi !== null ? (ownFi * swr) / 12 + guaranteed : autoMonthly
  const capital = (monthly: number, rate = swr) => Math.round((Math.max(0, monthly - guaranteed) * 12) / rate)
  const fi = capital(targetMonthly)
  const lean = capital(targetMonthly * LEAN_FACTOR)
  const fat = capital(targetMonthly * FAT_FACTOR)

  // Risk: tolerans ve kapasitenin düşük olanı
  const tolerance = riskToleranceOf(p)
  const cap = riskCapacity({ yearsToTarget, stability: p.incomeStability, emergencyMonths: essential > 0 ? f.liquidKurus / essential : null, dti: income > 0 ? mins / income : null })
  const final = Math.min(tolerance ?? 1, cap.level) as RiskLevel
  const profile = RISK_PROFILES[final]
  const R = profile.realReturnPct / 100
  const rm = monthlyRate(profile.realReturnPct)

  // Borç takvimi: faizli borç varsa bütün aylık pay borçlara (seçilen sırayla), yoksa yalnızca taksitler
  const interestBearing = debts.some((d) => !d.fixed && d.monthlyRatePct > 0)
  const payoff = debts.length ? simulateDebts(debts, interestBearing ? Math.max(mins, available) : mins, opts.strategy ?? 'avalanche') : null
  const debtEnds: DebtEnd[] = debts.map((d) => ({ id: d.id, name: d.name, month: payoff?.debts.find((x) => x.id === d.id)?.paidOffMonth ?? null, freedKurus: Math.min(d.balanceKurus, d.minPaymentKurus) }))
  const debtFreeMonth = !debts.length ? 0 : (payoff?.months ?? null)
  const recurringEnds: RecurringEnd[] = recurring.filter((r) => r.remainingMonths !== null).map((r) => ({ name: r.name, month: r.remainingMonths!, freedKurus: r.monthlyKurus }))
  /**
   * Başlangıç birikimi yalnızca varlıklardır: kredi ve taksitler aylık ödemeyle kapandığı için
   * bakiyeleri birikimden düşülmez; ödemeleri aylık birikimden çıkar.
   */
  const netKurus = f.assetsKurus

  const debtPay = (m: number) => (payoff ? (payoff.payments[m - 1] ?? 0) : 0)
  // Bugünkü aylık birikim: borç ödemeleri ve taksitler çıktıktan sonra varlığa giden
  const saving = available - debtPay(1) + (opts.extraMonthlyKurus ?? 0)
  const finite = recurring.filter((r) => r.remainingMonths !== null)
  // m. ayda bugüne göre birikime eklenen: biten taksit ve düzenli ödemeler, kapanan borçların ödemeleri
  const adjust = (m: number) => finite.filter((r) => r.remainingMonths! < m).reduce((s, r) => s + r.monthlyKurus, 0) + debtPay(1) - debtPay(m)
  const lastChange = Math.min(1200, Math.max(payoff?.payments.length ?? 0, ...finite.map((r) => r.remainingMonths!)) + 1)
  const flowAdjust = Array.from({ length: lastChange }, (_, i) => adjust(i + 1))
  /** m. ayda varlığa eklenen (getiri hariç); birikim yıllar içinde reel olarak artar (SAVING_GROWTH_PCT). */
  const flow = (m: number) => {
    const inflow = saving + adjust(m)
    return inflow > 0 ? inflow * Math.pow(1 + SAVING_GROWTH_PCT / 100, Math.floor((m - 1) / 12)) : inflow
  }
  /** Getiri yalnızca artıdaki birikime işler. */
  const step = (v: number, m: number, extra = 0, r = rm) => v * (1 + (v > 0 ? r : 0)) + flow(m) + extra

  const n = yearsToTarget * 12
  const fvAt = (months: number, extra = 0) => {
    let v = netKurus
    for (let m = 1; m <= months; m++) v = step(v, m, extra)
    return v
  }
  let reach: number | null = netKurus >= fi ? 0 : null
  if (reach === null) {
    let v = netKurus
    for (let m = 1; m <= 1200; m++) {
      v = step(v, m)
      if (v >= fi) {
        reach = m
        break
      }
    }
  }
  /** Verilen reel getiriyle hedefe varış ayı (borç bitişleri ve birikim artışı dahil). */
  const reachAt = (pct: number, path?: number[]): number | null => {
    const r = monthlyRate(pct)
    let v = netKurus
    let hit: number | null = netKurus >= fi ? 0 : null
    path?.push(Math.round(v))
    for (let m = 1; m <= 1200; m++) {
      v = step(v, m, 0, r)
      if (path && m % 12 === 0 && m <= PATH_YEARS * 12) path.push(Math.round(v))
      if (hit === null && v >= fi) hit = m
      if (hit !== null && (!path || m >= PATH_YEARS * 12)) break
    }
    return hit
  }
  const scenarioPaths = { cautious: [] as number[], mid: [] as number[], optimistic: [] as number[] }
  const route = { optimistic: reachAt(SCENARIO_RETURN_PCT.optimistic, scenarioPaths.optimistic), mid: reachAt(SCENARIO_RETURN_PCT.mid, scenarioPaths.mid), cautious: reachAt(SCENARIO_RETURN_PCT.cautious, scenarioPaths.cautious) }
  const fvN = fvAt(n)
  const annuity = rm > 0 ? (Math.pow(1 + rm, n) - 1) / rm : n
  const extra = n > 0 ? Math.max(0, Math.ceil((fi - fvN) / annuity)) : Math.max(0, fi - netKurus)
  const required = Math.max(0, saving) + extra

  // Kaldıraç: bugünkü birikimle yetişilen en erken hedef yaş (çekim oranı süreyle değişir)
  let leverAge: number | null = null
  {
    let v = netKurus
    for (let a = age; a < lifeAge; a++) {
      if (a > age) for (let m = (a - age - 1) * 12 + 1; m <= (a - age) * 12; m++) v = step(v, m)
      const rate = custom ? swr : recommendedWithdrawalPct(lifeAge - a) / 100
      if (v >= capital(targetMonthly, rate)) {
        leverAge = a
        break
      }
    }
  }
  const base = groups ? lifeBase : Math.round(p.targetMonthlyExpenseKurus * k)
  const affordable = Math.max(0, fvN) * swr / 12 + guaranteed - big
  const leverPct = base > 0 ? Math.max(0, Math.floor((affordable / base) * 100)) : 0

  // Monte Carlo: yıllık adım, birikim ve çekim dönemi birlikte
  const runs = opts.runs ?? MC_RUNS
  const rand = seededRandom(MC_SEED)
  const years = lifeAge - age
  const yearFlow = Array.from({ length: years + 1 }, (_, y) => {
    let s = 0
    for (let m = (y - 1) * 12 + 1; m <= y * 12; m++) s += flow(m)
    return s
  })
  const need = Math.max(0, targetMonthly - guaranteed) * 12
  const paths = Array.from({ length: years + 1 }, () => new Float64Array(runs))
  let ok = 0
  for (let i = 0; i < runs; i++) {
    let w = netKurus
    let alive = true
    paths[0][i] = w
    for (let y = 1; y <= years; y++) {
      const ret = R + (profile.volatilityPct / 100) * normal(rand)
      const a = age + y
      if (a <= targetAge) w = w * (1 + (w > 0 ? ret : 0)) + yearFlow[y]
      else {
        w = w * (1 + (w > 0 ? ret : 0)) - need
        if (w < 0) alive = false
      }
      paths[y][i] = w
    }
    if (alive) ok++
  }
  const bands: BandPoint[] = runs === 0 ? [] : paths.map((col, y) => {
    const s = Float64Array.from(col).sort()
    return { age: age + y, p10: Math.round(pctile(s, 0.1)), p50: Math.round(pctile(s, 0.5)), p90: Math.round(pctile(s, 0.9)) }
  })

  const inflation = p.inflationPct ?? DEFAULT_INFLATION_PCT
  const usd = rates.USD ?? (p.base === 'USD' ? p.baseRateTl : null) ?? null
  const gold = rates.XAU ?? (p.base === 'XAU' ? p.baseRateTl : null) ?? null

  return {
    age,
    targetAge,
    lifeAge,
    yearsToTarget,
    retirementYears,
    withdrawal: { recommendedPct: recommended, usedPct: swrPct, custom },
    ownGoal: ownFi !== null,
    suggestedFiKurus: capital(autoMonthly),
    risk: { tolerance, capacity: cap.level, capacityFactors: cap.factors, final, profile },
    spendKurus: spend,
    essentialKurus: essential,
    targetMonthlyKurus: targetMonthly,
    guaranteedMonthlyKurus: guaranteed,
    annualNeedKurus: need,
    fiKurus: fi,
    leanKurus: lean,
    fatKurus: fat,
    netKurus,
    flowAdjustKurus: flowAdjust,
    availableKurus: available,
    monthlySavingKurus: saving,
    savingRate: income > 0 ? saving / income : 0,
    requiredMonthlyKurus: required,
    gapKurus: extra,
    reachMonths: reach,
    route,
    paths: scenarioPaths,
    reachAge: reach === null ? null : age + reach / 12,
    coastKurus: Math.round(fi / Math.pow(1 + R, yearsToTarget)),
    coastPassed: netKurus >= fi / Math.pow(1 + R, yearsToTarget),
    successRate: runs > 0 ? ok / runs : 0,
    bands,
    debtEnds,
    debtFreeMonth,
    recurringEnds,
    levers: { extraMonthlyKurus: extra, targetAge: leverAge, spendPct: Math.min(999, leverPct) },
    future: {
      years: yearsToTarget,
      inflationPct: inflation,
      tlNominalKurus: Math.round(fi * Math.pow(1 + inflation / 100, yearsToTarget)),
      usd: usd ? Math.round(fi / 100 / usd) : null,
      goldGr: gold ? Math.round((fi / 100 / gold) * 10) / 10 : null,
    },
    spendPct: pct,
    realReturnPct: profile.realReturnPct,
  }
}
