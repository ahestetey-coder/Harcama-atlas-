import { addMonths, periodOf } from './dates'
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

export function buildJourney(p: JourneyProfile, f: JourneyFacts, rates: BaseRates = {}): JourneyResult {
  const k = indexFactor(p, rates)
  const essentialNow = Math.round(p.essentialMonthlyKurus * k)
  const targetNow = Math.round(p.targetMonthlyExpenseKurus * k)
  const saving = monthlySaving(p, f)
  const income = p.monthlyIncomeKurus + (p.passiveIncomeKurus ?? 0)
  const spend = f.averageExpenseKurus ?? p.essentialMonthlyKurus
  const essential = Math.max(1, essentialNow)
  const net = Math.max(0, f.assetsKurus - f.debtsKurus)

  const balanceRatio = income > 0 ? spend / income : 1
  const balance: Stage = {
    id: 'balance',
    title: 'Bütçe dengesi',
    short: 'Denge',
    criterion: 'Aylık gider, gelirin altında',
    source: 'Bütün finansal planların ilk koşulu: harcama gelirden azdır.',
    status: income > 0 ? `Gelirin %${Math.round(balanceRatio * 100)}'i harcanıyor` : 'Gelir bilgisi yok',
    next: saving > 0 ? 'Dengeyi koruyun; fazlayı birikime yönlendirin' : `Aylık giderleri ${tl(-saving + 1)} azaltmak dengeyi sağlar`,
    progress: income > 0 ? clamp01(saving >= 0 ? 1 : income / spend) : 0,
    done: income > 0 && saving >= 0,
    missing: f.averageExpenseKurus === null ? 'Son dönemlerde gider kaydı yok; zorunlu gider kullanıldı' : undefined,
  }

  const starterTarget = essential * STARTER_MONTHS
  const starter: Stage = {
    id: 'starter',
    title: 'Başlangıç fonu',
    short: 'Başlangıç',
    criterion: `${STARTER_MONTHS} aylık zorunlu gider kadar hızlı kullanılabilir birikim`,
    source: 'Küçük bir acil durum fonu, beklenmedik bir giderin yeni borca dönmesini önler (Dave Ramsey\'nin "bebek adımları" yaklaşımı).',
    status: `${tl(f.liquidKurus)} / ${tl(starterTarget)}`,
    next: f.liquidKurus >= starterTarget ? 'Sırada yüksek faizli borçlar var' : `${tl(starterTarget - f.liquidKurus)} daha biriktirin`,
    progress: clamp01(f.liquidKurus / starterTarget),
    done: f.liquidKurus >= starterTarget,
    missing: f.hasAssets ? undefined : 'Yatırımlarım boş; birikiminizi oraya ekleyin',
  }

  const consumer = f.consumerDebtKurus ?? f.debtsKurus
  const pay = f.monthlyDebtPaymentKurus
  const dti = pay !== undefined && income > 0 ? pay / income : null
  const dtiOk = dti === null || dti <= DTI_LIMIT
  const debt: Stage = {
    id: 'debt',
    title: 'Yüksek faizli borçsuz',
    short: 'Borçsuz',
    criterion: `Kredi kartı, KMH, ihtiyaç kredisi ve kişisel borç kalmadı; borç ödemeleri gelirin %${DTI_LIMIT * 100}'sının altında`,
    source: 'Yüksek faizli borç, yatırımın getirisinden hızlı büyür; önce kapatılır (çığ yöntemi). %36 borç/gelir eşiği bankaların kredi değerlendirmesinde yaygın kullanılır.',
    status: [consumer > 0 ? `Tüketici borcu ${tl(consumer)}` : 'Tüketici borcu yok', dti !== null ? `borç ödemesi gelirin %${Math.round(dti * 100)}'i` : null].filter(Boolean).join(' · '),
    next: consumer > 0 ? `${tl(consumer)} borcu en yüksek faizliden başlayarak kapatın` : dtiOk ? 'Yeni tüketici borcundan kaçının' : `Aylık borç ödemelerini ${tl(pay! - income * DTI_LIMIT)} azaltın`,
    progress: consumer > 0 ? clamp01(income > 0 ? 1 - consumer / (consumer + income * 3) : 0) : dtiOk ? 1 : clamp01(DTI_LIMIT / dti!),
    done: consumer <= 0 && dtiOk && income > 0,
  }

  const emMonths = emergencyMonthsFor(p)
  const emTarget = essential * emMonths
  const emergency: Stage = {
    id: 'emergency',
    title: 'Acil durum fonu',
    short: 'Acil fon',
    criterion: `${emMonths} aylık zorunlu gider kadar hızlı kullanılabilir birikim`,
    source: 'Finansal planlamacıların yaygın önerisi 3–6 aylık zorunlu giderdir; gelir düzensizse ya da bakmakla yükümlü olduğunuz kişiler varsa daha uzun.',
    status: `${tl(f.liquidKurus)} / ${tl(emTarget)}`,
    next: f.liquidKurus >= emTarget ? 'Fonu koruyun; fazlası uzun vadeli birikime gidebilir' : `${tl(emTarget - f.liquidKurus)} daha biriktirin`,
    progress: clamp01(f.liquidKurus / emTarget),
    done: f.liquidKurus >= emTarget,
  }

  const rate = income > 0 ? saving / income : 0
  const savingStage: Stage = {
    id: 'saving',
    title: 'Düzenli birikim',
    short: 'Birikim',
    criterion: `Gelirin en az %${SAVING_RATE_TARGET * 100}'si her ay birikime gidiyor`,
    source: '50/30/20 kuralı: gelirin yarısı ihtiyaçlara, %30\'u isteklere, en az %20\'si birikime (Elizabeth Warren).',
    status: income > 0 ? `Birikim oranı %${Math.max(0, Math.round(rate * 100))}` : 'Gelir bilgisi yok',
    next:
      rate >= SAVING_RATE_TARGET
        ? f.recentMonthlyContributionKurus > 0
          ? 'Birikimi Yatırımlarım’a eklemeye devam edin'
          : 'Ayırdığınız tutarı Yatırımlarım’a ekleyerek takip edin'
        : `Ayda ${tl(Math.max(0, income * SAVING_RATE_TARGET - saving))} daha ayırmak aşamayı tamamlar`,
    progress: clamp01(rate / SAVING_RATE_TARGET),
    done: rate >= SAVING_RATE_TARGET,
  }

  const capStage = (id: 'security' | 'independence' | 'freedom', title: string, short: string, monthly: number, what: string, source: string): Stage => {
    const goal = capitalFor(monthly, p)
    return {
      id,
      title,
      short,
      criterion: `Birikimin yıllık %${p.withdrawalRatePct.toLocaleString('tr-TR')}'ü, ${what} (aylık ${tl(monthly)}) karşılıyor: ${tl(goal)}`,
      source,
      status: `${tl(net)} / ${tl(goal)}`,
      next: net >= goal ? 'Bu seviyeye ulaştınız' : `${tl(goal - net)} kaldı`,
      progress: goal > 0 ? clamp01(net / goal) : 1,
      done: net >= goal,
    }
  }
  const currentSpend = Math.max(essentialNow, f.averageExpenseKurus ?? essentialNow)
  const security = capStage('security', 'Finansal güvence', 'Güvence', essentialNow, 'zorunlu giderleri', 'Tony Robbins\'in "finansal güvence" seviyesi: birikimin getirisi kira, fatura, gıda gibi temel giderleri karşılar.')
  const independence = capStage('independence', 'Finansal bağımsızlık', 'Bağımsızlık', currentSpend, 'bugünkü yaşam giderini', '%4 kuralı (Bengen 1994, Trinity çalışması 1998): yıllık giderin yaklaşık 25 katı birikim, çalışmadan bugünkü yaşamı sürdürür.')
  const freedom = capStage('freedom', 'Finansal özgürlük', 'Özgürlük', targetNow, 'hedeflediğiniz yaşam giderini', 'Aynı kural, hayal ettiğiniz yaşam tarzı için: çalışmak bir zorunluluk değil, tercih olur.')

  const stages = [balance, starter, debt, emergency, savingStage, security, independence, freedom]
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

/**
 * Hedefe kaç ayda ulaşılır (bugünün parasıyla; birikim enflasyon kadar artar varsayımı).
 * Ulaşılamıyorsa (birikim yok ve getiri yetmiyor) veya 100 yılı aşıyorsa null.
 */
export function monthsToTarget(startKurus: number, monthlySavingKurus: number, targetKurus: number, realAnnualPct: number): number | null {
  if (startKurus >= targetKurus) return 0
  const r = monthlyRate(realAnnualPct)
  let v = startKurus
  for (let m = 1; m <= 1200; m++) {
    v = v * (1 + r) + monthlySavingKurus
    if (v >= targetKurus) return m
    if (monthlySavingKurus <= 0 && r <= 0) return null
  }
  return null
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

/** Yıl sonu değerleri (0. yıl = bugün). Gelir kaybı ilk aylarda varsayılır. */
export function projectScenario(input: ScenarioInput, realAnnualPct: number): ScenarioPoint[] {
  const r = monthlyRate(realAnnualPct)
  const inf = 1 + input.inflationPct / 100
  const out: ScenarioPoint[] = [{ year: 0, realKurus: input.startKurus, nominalKurus: input.startKurus }]
  let v = input.startKurus
  const months = Math.max(1, Math.round(input.years)) * 12
  for (let m = 1; m <= months; m++) {
    if (input.bigExpenseKurus > 0 && m === Math.max(1, Math.round(input.bigExpenseYear) * 12 - 11)) v -= input.bigExpenseKurus
    v = v * (1 + (v > 0 ? r : 0))
    v += m <= input.incomeLossMonths ? -input.incomeLossMonthlySpendKurus : input.monthlySavingKurus + input.extraSavingKurus
    if (m % 12 === 0) {
      const y = m / 12
      out.push({ year: y, realKurus: Math.round(v), nominalKurus: Math.round(v * Math.pow(inf, y)) })
    }
  }
  return out
}
