import { addMonths, MONTH_NAMES, periodOf } from './dates'
import { isSpending, type IsoDate, type MonthKey, type Transaction } from './types'

/**
 * Plus+ "Finansal Özgürlük Yolculuğum": anket, rota aşamaları, göstergeler ve senaryolar.
 * Bütün hesaplar bu dosyada, cihazda yapılır. Sonuçlar varsayıma dayalı tahmindir; olasılık veya
 * garanti değildir ve yatırım tavsiyesi içermez.
 */

export type JourneyGoal = 'independence' | 'security' | 'early-retire' | 'custom'
export type IncomeStability = 'regular' | 'variable' | 'irregular'

export const JOURNEY_GOAL_LABEL: Record<JourneyGoal, string> = {
  independence: 'Finansal özgürlük',
  security: 'Güvenceli bir düzen',
  'early-retire': 'Erken emeklilik',
  custom: 'Kendi hedefim',
}

export const STABILITY_LABEL: Record<IncomeStability, string> = {
  regular: 'Düzenli (maaş gibi)',
  variable: 'Değişken',
  irregular: 'Düzensiz',
}

export type Housing = 'rent' | 'mortgage' | 'owned' | 'family'
export type Pension = 'sgk-bes' | 'sgk' | 'bes' | 'none'
export type HealthCover = 'private' | 'public' | 'none'
export type RiskStance = 'cautious' | 'balanced' | 'bold'
/** Planın ölçü birimi: hedefler TL, dolar ya da gram altın cinsinden sabitlenir. */
export type PlanBase = 'TRY' | 'USD' | 'XAU'

export const HOUSING_LABEL: Record<Housing, string> = { rent: 'Kirada', mortgage: 'Ev sahibi, kredisi sürüyor', owned: 'Ev sahibi, borçsuz', family: 'Aile yanında / lojman' }
export const PENSION_LABEL: Record<Pension, string> = { 'sgk-bes': 'SGK ve BES', sgk: 'Yalnızca SGK', bes: 'Yalnızca BES', none: 'Yok' }
export const HEALTH_LABEL: Record<HealthCover, string> = { private: 'SGK ve özel sağlık sigortası', public: 'Yalnızca SGK (genel sağlık sigortası)', none: 'Yok' }
export const RISK_LABEL: Record<RiskStance, string> = { cautious: 'Temkinli: dalgalanma beni çok rahatsız eder', balanced: 'Dengeli: kısa vadeli düşüşlere katlanırım', bold: 'Atak: uzun vadede dalgalanmayı kabul ederim' }
export const BASE_LABEL: Record<PlanBase, string> = { TRY: 'TL', USD: 'USD', XAU: 'Gram altın' }

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
}

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0)
const tl = (k: number) => `${Math.round(k / 100).toLocaleString('tr-TR')} ₺`

export const STARTER_MONTHS = 1
export const SAVING_RATE_TARGET = 0.2
export const DTI_LIMIT = 0.36

/** Acil durum fonu kaç aylık zorunlu gider olmalı: düzenli gelirde 3, bakmakla yükümlü kişi varsa ya da gelir değişkense 6, düzensizse 9. */
export function emergencyMonthsFor(p: Pick<JourneyProfile, 'incomeStability' | 'dependents'>): number {
  if (p.incomeStability === 'irregular') return 9
  if (p.incomeStability === 'variable' || (p.dependents ?? 0) > 0) return 6
  return 3
}

/** Aylık birikim: gelir − ortalama gider (bilinmiyorsa zorunlu gider). Pasif gelir de gelire katılır. */
export function monthlySaving(p: JourneyProfile, f: JourneyFacts): number {
  const spend = f.averageExpenseKurus ?? p.essentialMonthlyKurus
  return p.monthlyIncomeKurus + (p.passiveIncomeKurus ?? 0) - spend
}

/** Gereken sermaye: pasif gelirle karşılanmayan yıllık gider ÷ çekim oranı. */
function capitalFor(monthlyKurus: number, p: JourneyProfile): number {
  const rate = Math.max(0.5, p.withdrawalRatePct) / 100
  return Math.round((Math.max(0, monthlyKurus - (p.passiveIncomeKurus ?? 0)) * 12) / rate)
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

/** Plan birimini değiştirir: hedefler bugünkü TL karşılıklarıyla yeni birime sabitlenir. */
export function rebase(p: JourneyProfile, base: PlanBase, rates: BaseRates): JourneyProfile | null {
  const rate = rateOf(base, rates)
  if (!rate) return null
  const k = indexFactor(p, rates)
  return {
    ...p,
    targetMonthlyExpenseKurus: Math.round(p.targetMonthlyExpenseKurus * k),
    essentialMonthlyKurus: Math.round(p.essentialMonthlyKurus * k),
    base,
    baseRateTl: base === 'TRY' ? undefined : rate,
  }
}

/** TL tutarını plan biriminde yazar (ör. "12.500 $", "84,2 gr altın"). */
export function formatInBase(kurus: number, base: PlanBase, rates: BaseRates): string | null {
  const rate = rateOf(base, rates)
  if (!rate) return null
  const v = kurus / 100 / rate
  if (base === 'USD') return `${Math.round(v).toLocaleString('tr-TR')} $`
  if (base === 'XAU') return `${v.toLocaleString('tr-TR', { maximumFractionDigits: v >= 100 ? 0 : 1 })} gr altın`
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
    leftText: done ? 'Sağlanıyor' : verb,
    etaMonths: done ? undefined : monthsToTarget(now, saving, target, realPct),
    inBase,
  }
}

export function buildJourney(p: JourneyProfile, f: JourneyFacts, rates: BaseRates = {}): JourneyResult {
  const k = indexFactor(p, rates)
  const base = p.base ?? 'TRY'
  /** Sermaye tutarları plan biriminde yazılır. */
  const big = (kurus: number) => (base === 'TRY' ? tl(kurus) : (formatInBase(kurus, base, rates) ?? tl(kurus)))
  const essentialNow = Math.round(p.essentialMonthlyKurus * k)
  const targetNow = Math.round(p.targetMonthlyExpenseKurus * k)
  const saving = monthlySaving(p, f)
  const income = p.monthlyIncomeKurus + (p.passiveIncomeKurus ?? 0)
  const spend = f.averageExpenseKurus ?? p.essentialMonthlyKurus
  const essential = Math.max(1, essentialNow)
  const net = Math.max(0, f.assetsKurus - f.debtsKurus)

  const balanceRatio = income > 0 ? spend / income : 1
  const balanceDone = income > 0 && saving >= 0
  const balance: Stage = {
    id: 'balance',
    title: 'Bütçe dengesi',
    short: 'Denge',
    criterion: 'Aylık gider, gelirin altında',
    source: 'Bütün finansal planların ilk koşulu: harcama gelirden azdır.',
    status: income > 0 ? `Gelirin %${Math.round(balanceRatio * 100)}'i harcanıyor` : 'Gelir bilgisi yok',
    next: saving > 0 ? 'Dengeyi koruyun; fazlayı birikime yönlendirin' : `Aylık giderleri ${tl(-saving + 1)} azaltmak dengeyi sağlar`,
    progress: income > 0 ? clamp01(saving >= 0 ? 1 : income / spend) : 0,
    done: balanceDone,
    missing: f.averageExpenseKurus === null ? 'Son dönemlerde gider kaydı yok; zorunlu gider kullanıldı' : undefined,
    goal: income > 0 ? `Aylık gideriniz, ${tl(income)} gelirinizin altında kalsın` : 'Aylık gideriniz gelirinizin altında kalsın',
    conditions: [
      {
        label: 'Aylık gider',
        unit: 'money',
        now: spend,
        target: income,
        dir: 'atMost',
        done: balanceDone,
        progress: income > 0 ? clamp01(spend <= income ? 1 : income / spend) : 0,
        left: Math.max(0, spend - income),
        leftText: balanceDone ? 'Sağlanıyor' : income > 0 ? `Ayda ${tl(spend - income + 1)} azaltın` : 'Testte gelirinizi girin',
      },
    ],
  }

  const starterTarget = essential * STARTER_MONTHS
  const starterCond = moneyCond('Hızlı kullanılabilir birikim', f.liquidKurus, starterTarget, saving, `${tl(starterTarget - f.liquidKurus)} daha biriktirin`)
  const starter: Stage = {
    id: 'starter',
    title: 'Başlangıç fonu',
    short: 'Başlangıç',
    criterion: `${STARTER_MONTHS} aylık zorunlu gider kadar hızlı kullanılabilir birikim`,
    source: 'Küçük bir acil durum fonu, beklenmedik bir giderin yeni borca dönmesini önler (Dave Ramsey\'nin "bebek adımları" yaklaşımı).',
    status: `${tl(f.liquidKurus)} / ${tl(starterTarget)}`,
    next: f.liquidKurus >= starterTarget ? 'Sırada yüksek faizli borçlar var' : `${tl(starterTarget - f.liquidKurus)} daha biriktirin`,
    progress: starterCond.progress,
    done: starterCond.done,
    missing: f.hasAssets ? undefined : 'Yatırımlarım boş; birikiminizi oraya ekleyin',
    goal: `Kenarda ${tl(starterTarget)} hızlı kullanılabilir para (${STARTER_MONTHS} aylık zorunlu gider)`,
    conditions: [starterCond],
  }

  const consumer = f.consumerDebtKurus ?? f.debtsKurus
  const pay = f.monthlyDebtPaymentKurus
  const dti = pay !== undefined && income > 0 ? pay / income : null
  const dtiOk = dti === null || dti <= DTI_LIMIT
  const debtConds: Condition[] = [
    {
      label: 'Yüksek faizli borç (kart, KMH, ihtiyaç, kişisel)',
      unit: 'money',
      now: consumer,
      target: 0,
      dir: 'atMost',
      done: consumer <= 0,
      progress: consumer > 0 ? clamp01(income > 0 ? 1 - consumer / (consumer + income * 3) : 0) : 1,
      left: Math.max(0, consumer),
      leftText: consumer > 0 ? `${tl(consumer)} borcu kapatın` : 'Sağlanıyor',
      etaMonths: consumer > 0 ? (saving > 0 ? Math.ceil(consumer / saving) : null) : undefined,
    },
  ]
  if (dti !== null)
    debtConds.push({
      label: 'Borç ödemesi / gelir',
      unit: 'pct',
      now: dti,
      target: DTI_LIMIT,
      dir: 'atMost',
      done: dtiOk,
      progress: dtiOk ? 1 : clamp01(DTI_LIMIT / dti),
      left: Math.max(0, dti - DTI_LIMIT),
      leftText: dtiOk ? 'Sağlanıyor' : `Aylık borç ödemelerini ${tl(pay! - income * DTI_LIMIT)} azaltın`,
    })
  const debt: Stage = {
    id: 'debt',
    title: 'Yüksek faizli borçsuz',
    short: 'Borçsuz',
    criterion: `Kredi kartı, KMH, ihtiyaç kredisi ve kişisel borç kalmadı; borç ödemeleri gelirin %${DTI_LIMIT * 100}'sının altında`,
    source: 'Yüksek faizli borç, yatırımın getirisinden hızlı büyür; önce kapatılır (çığ yöntemi). %36 borç/gelir eşiği bankaların kredi değerlendirmesinde yaygın kullanılır.',
    status: [consumer > 0 ? `Tüketici borcu ${tl(consumer)}` : 'Tüketici borcu yok', dti !== null ? `borç ödemesi gelirin %${Math.round(dti * 100)}'i` : null].filter(Boolean).join(' · '),
    next: consumer > 0 ? `${tl(consumer)} borcu en yüksek faizliden başlayarak kapatın` : dtiOk ? 'Yeni tüketici borcundan kaçının' : `Aylık borç ödemelerini ${tl(pay! - income * DTI_LIMIT)} azaltın`,
    progress: consumer > 0 ? debtConds[0].progress : dtiOk ? 1 : clamp01(DTI_LIMIT / dti!),
    done: consumer <= 0 && dtiOk && income > 0,
    goal: `Yüksek faizli borç kalmasın; borç ödemeleri gelirin en çok %${DTI_LIMIT * 100}'sı olsun`,
    conditions: debtConds,
  }

  const emMonths = emergencyMonthsFor(p)
  const emTarget = essential * emMonths
  const emCond = moneyCond('Hızlı kullanılabilir birikim', f.liquidKurus, emTarget, saving, `${tl(emTarget - f.liquidKurus)} daha biriktirin`)
  const emergency: Stage = {
    id: 'emergency',
    title: 'Acil durum fonu',
    short: 'Acil fon',
    criterion: `${emMonths} aylık zorunlu gider kadar hızlı kullanılabilir birikim`,
    source: 'Finansal planlamacıların yaygın önerisi 3–6 aylık zorunlu giderdir; gelir düzensizse ya da bakmakla yükümlü olduğunuz kişiler varsa daha uzun.',
    status: `${tl(f.liquidKurus)} / ${tl(emTarget)}`,
    next: f.liquidKurus >= emTarget ? 'Fonu koruyun; fazlası uzun vadeli birikime gidebilir' : `${tl(emTarget - f.liquidKurus)} daha biriktirin`,
    progress: emCond.progress,
    done: emCond.done,
    goal: `Kenarda ${tl(emTarget)} hızlı kullanılabilir para (${emMonths} aylık zorunlu gider)`,
    conditions: [emCond],
  }

  const rate = income > 0 ? saving / income : 0
  const savingDone = rate >= SAVING_RATE_TARGET
  const savingStage: Stage = {
    id: 'saving',
    title: 'Düzenli birikim',
    short: 'Birikim',
    criterion: `Gelirin en az %${SAVING_RATE_TARGET * 100}'si her ay birikime gidiyor`,
    source: '50/30/20 kuralı: gelirin yarısı ihtiyaçlara, %30\'u isteklere, en az %20\'si birikime (Elizabeth Warren).',
    status: income > 0 ? `Birikim oranı %${Math.max(0, Math.round(rate * 100))}` : 'Gelir bilgisi yok',
    next: savingDone
      ? f.recentMonthlyContributionKurus > 0
        ? 'Birikimi Yatırımlarım’a eklemeye devam edin'
        : 'Ayırdığınız tutarı Yatırımlarım’a ekleyerek takip edin'
      : `Ayda ${tl(Math.max(0, income * SAVING_RATE_TARGET - saving))} daha ayırmak aşamayı tamamlar`,
    progress: clamp01(rate / SAVING_RATE_TARGET),
    done: savingDone,
    goal: income > 0 ? `Her ay en az ${tl(income * SAVING_RATE_TARGET)} birikim (gelirin %${SAVING_RATE_TARGET * 100}'si)` : `Gelirin en az %${SAVING_RATE_TARGET * 100}'si her ay birikime gitsin`,
    conditions: [
      {
        label: 'Aylık birikim oranı',
        unit: 'pct',
        now: Math.max(0, rate),
        target: SAVING_RATE_TARGET,
        dir: 'atLeast',
        done: savingDone,
        progress: clamp01(rate / SAVING_RATE_TARGET),
        left: Math.max(0, SAVING_RATE_TARGET - rate),
        leftText: savingDone ? 'Sağlanıyor' : income > 0 ? `Ayda ${tl(Math.max(0, income * SAVING_RATE_TARGET - saving))} daha ayırın` : 'Testte gelirinizi girin',
      },
    ],
  }

  const capStage = (id: 'security' | 'independence' | 'freedom', title: string, short: string, monthly: number, what: string, source: string): Stage => {
    const goal = capitalFor(monthly, p)
    const cond = moneyCond('Net birikim (yatırımlar − borçlar)', net, goal, saving, `${big(goal - net)} kaldı`, true, SCENARIOS.mid.realReturnPct)
    return {
      id,
      title,
      short,
      criterion: `Birikimin yıllık %${p.withdrawalRatePct.toLocaleString('tr-TR')}'ü, ${what} (aylık ${tl(monthly)}) karşılıyor: ${big(goal)}`,
      source,
      status: `${big(net)} / ${big(goal)}`,
      next: net >= goal ? 'Bu seviyeye ulaştınız' : `${big(goal - net)} kaldı`,
      progress: cond.progress,
      done: cond.done,
      goal: `${big(goal)} birikim: yıllık %${p.withdrawalRatePct.toLocaleString('tr-TR')}'ü ${what} (aylık ${tl(monthly)}) karşılar`,
      conditions: [cond],
    }
  }
  const currentSpend = Math.max(essentialNow, f.averageExpenseKurus ?? essentialNow)
  const security = capStage('security', 'Finansal güvence', 'Güvence', essentialNow, 'zorunlu giderleri', 'Tony Robbins\'in "finansal güvence" seviyesi: birikimin getirisi kira, fatura, gıda gibi temel giderleri karşılar.')
  const independence = capStage('independence', 'Finansal bağımsızlık', 'Bağımsızlık', currentSpend, 'bugünkü yaşam giderini', '%4 kuralı (Bengen 1994, Trinity çalışması 1998): yıllık giderin yaklaşık 25 katı birikim, çalışmadan bugünkü yaşamı sürdürür.')
  const freedom = capStage('freedom', 'Finansal özgürlük', 'Özgürlük', targetNow, 'hedeflediğiniz yaşam giderini', 'Aynı kural, hayal ettiğiniz yaşam tarzı için: çalışmak bir zorunluluk değil, tercih olur.')

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
      title: 'Sağlık güvencesi',
      criterion: 'Genel sağlık sigortası (SGK) var; mümkünse tamamlayıcı ya da özel sağlık sigortası',
      source: 'Büyük bir sağlık gideri birikimi tek seferde eritebilir; acil durum fonu sigortanın yerini tutmaz.',
      status: p.health ? HEALTH_LABEL[p.health] : 'Testte yanıtlanmadı',
      done: p.health ? p.health !== 'none' : null,
    },
    {
      id: 'pension',
      title: 'Emeklilik güvencesi',
      criterion: 'SGK primleri ödeniyor; ek olarak BES ya da düzenli emeklilik birikimi var',
      source: 'Emeklilik birikimi ne kadar erken başlarsa bileşik getiriden o kadar çok yararlanır.',
      status: p.pension ? PENSION_LABEL[p.pension] : 'Testte yanıtlanmadı',
      done: p.pension ? p.pension === 'sgk-bes' : null,
    },
  ]
  const goal = capitalFor(targetNow, p)
  const route = {
    optimistic: monthsToTarget(net, saving, goal, SCENARIOS.optimistic.realReturnPct),
    mid: monthsToTarget(net, saving, goal, SCENARIOS.mid.realReturnPct),
    cautious: monthsToTarget(net, saving, goal, SCENARIOS.cautious.realReturnPct),
  }
  return {
    stages,
    checks,
    position,
    current: stages.find((s) => !s.done) ?? null,
    level: Math.floor(position),
    indicators: {
      securityMonths: essentialNow > 0 ? f.liquidKurus / essentialNow : null,
      goalKurus: goal,
      progressKurus: net,
      goalRatio: clamp01(net / Math.max(1, goal)),
      monthlySavingKurus: saving,
      route,
      securityCapitalKurus: capitalFor(essentialNow, p),
      independenceCapitalKurus: capitalFor(currentSpend, p),
      emergencyMonths: emMonths,
      indexFactor: k,
    },
  }
}

// ---------- Senaryolar ----------

export type ScenarioKey = 'cautious' | 'mid' | 'optimistic'

/** Reel (enflasyondan arındırılmış) yıllık getiri varsayımları. */
export const SCENARIOS: Record<ScenarioKey, { label: string; realReturnPct: number }> = {
  cautious: { label: 'Temkinli', realReturnPct: 0 },
  mid: { label: 'Orta', realReturnPct: 2 },
  optimistic: { label: 'Olumlu', realReturnPct: 4 },
}

const monthlyRate = (annualPct: number) => Math.pow(1 + annualPct / 100, 1 / 12) - 1

/** Süreyi okunur yazar: "Şimdi", "7 ay", "3 yıl", "14 yıl 5 ay". */
export function durationLabel(months: number): string {
  if (months <= 0) return 'Şimdi'
  const y = Math.floor(months / 12)
  const m = months % 12
  return [y ? `${y} yıl` : '', m ? `${m} ay` : ''].filter(Boolean).join(' ')
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
  let reach: number | null = input.startKurus >= goalKurus ? 0 : null
  let v = input.startKurus
  for (let m = 1; m <= Math.max(horizon, MAX_MONTHS); m++) {
    if (m === bigMonth) v -= input.bigExpenseKurus
    v = v * (1 + (v > 0 ? r : 0))
    v += m <= input.incomeLossMonths ? -input.incomeLossMonthlySpendKurus : steady
    if (reach === null && v >= goalKurus) reach = m
    if (m <= horizon && m % 12 === 0) {
      const y = m / 12
      points.push({ year: y, realKurus: Math.round(v), nominalKurus: Math.round(v * Math.pow(inf, y)) })
    }
    if (m >= horizon) {
      if (reach !== null) break
      // Şoklar geçti, birikim yok ve getiri büyütmüyorsa hedefe hiç ulaşılmaz
      if (m >= input.incomeLossMonths && m >= bigMonth && steady <= 0 && (r <= 0 || v <= 0)) break
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
