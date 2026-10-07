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

export interface JourneyProfile {
  goal: JourneyGoal
  goalName?: string
  /** Hedef süresi (yıl). */
  horizonYears: number
  /** Hedefte karşılanacak aylık yaşam gideri, bugünün parasıyla. */
  targetMonthlyExpenseKurus: number
  monthlyIncomeKurus: number
  /** Kira, fatura, gıda gibi zorunlu aylık giderler. */
  essentialMonthlyKurus: number
  incomeStability: IncomeStability
  /** Korumak istenen harcama öncelikleri (kategori kimlikleri). */
  priorities: string[]
  /** Hedef sermayeden yılda çekilecek oran (%); hedef sermaye = yıllık gider ÷ oran. */
  withdrawalRatePct: number
  /** Kutlaması gösterilmiş aşamalar. */
  celebrated: StageId[]
  confirmedAt: string
}

export const DEFAULT_WITHDRAWAL_PCT = 4

/** Hedef sermaye: yıllık yaşam gideri ÷ çekim oranı (bugünün parasıyla). */
export function targetCapital(p: Pick<JourneyProfile, 'targetMonthlyExpenseKurus' | 'withdrawalRatePct'>): number {
  const rate = Math.max(0.5, p.withdrawalRatePct) / 100
  return Math.round((p.targetMonthlyExpenseKurus * 12) / rate)
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
  /** Bütün varlıklar (hisse dahil). */
  assetsKurus: number
  debtsKurus: number
  /** Varlıklara net yatırılan para ve piyasa kaynaklı değişim (Varlıklarım). */
  contributedKurus: number
  marketGainKurus: number
  /** Son 3 ayda varlıklara net eklenen para (aylık ortalama). */
  recentMonthlyContributionKurus: number
  hasAssets: boolean
}

export type StageId = 'balance' | 'emergency' | 'debt' | 'saving' | 'target'

export interface Stage {
  id: StageId
  title: string
  /** Tamamlanma ölçütü. */
  criterion: string
  /** Mevcut durum metni. */
  status: string
  /** Bir sonraki adım. */
  next: string
  progress: number
  done: boolean
  /** Bu aşama için veri eksik mi? */
  missing?: string
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
}

export interface JourneyResult {
  stages: Stage[]
  indicators: JourneyIndicators
  /** Rotadaki konum: tamamlanan aşamalar + sıradakinin ilerlemesi (0..aşama sayısı). */
  position: number
}

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0)
const tl = (k: number) => `${Math.round(k / 100).toLocaleString('tr-TR')} ₺`

export const EMERGENCY_MONTHS = 3
export const SAVING_RATE_TARGET = 0.1

/** Aylık birikim: gelir − ortalama gider (bilinmiyorsa zorunlu gider). */
export function monthlySaving(p: JourneyProfile, f: JourneyFacts): number {
  const spend = f.averageExpenseKurus ?? p.essentialMonthlyKurus
  return p.monthlyIncomeKurus - spend
}

export function buildJourney(p: JourneyProfile, f: JourneyFacts): JourneyResult {
  const saving = monthlySaving(p, f)
  const income = p.monthlyIncomeKurus
  const spend = f.averageExpenseKurus ?? p.essentialMonthlyKurus
  const essential = Math.max(1, p.essentialMonthlyKurus)
  const goal = targetCapital(p)
  const net = Math.max(0, f.assetsKurus - f.debtsKurus)

  const balanceRatio = income > 0 ? spend / income : 1
  const balance: Stage = {
    id: 'balance',
    title: 'Bütçe dengesi',
    criterion: 'Aylık gider, gelirin altında',
    status: income > 0 ? `Gelirin %${Math.round(balanceRatio * 100)}'i harcanıyor` : 'Gelir bilgisi yok',
    next: saving > 0 ? 'Dengeyi koruyun; fazlayı birikime yönlendirin' : `Aylık giderleri ${tl(-saving + 1)} azaltmak dengeyi sağlar`,
    progress: income > 0 ? clamp01(saving >= 0 ? 1 : income / spend) : 0,
    done: income > 0 && saving >= 0,
    missing: f.averageExpenseKurus === null ? 'Son dönemlerde gider kaydı yok; zorunlu gider kullanıldı' : undefined,
  }

  const emTarget = essential * EMERGENCY_MONTHS
  const emergency: Stage = {
    id: 'emergency',
    title: 'Acil durum birikimi',
    criterion: `${EMERGENCY_MONTHS} aylık zorunlu gider kadar hızlı kullanılabilir birikim`,
    status: `${tl(f.liquidKurus)} / ${tl(emTarget)}`,
    next: f.liquidKurus >= emTarget ? '6 aylık güvenceye doğru ilerleyebilirsiniz' : `${tl(emTarget - f.liquidKurus)} daha biriktirin`,
    progress: clamp01(f.liquidKurus / emTarget),
    done: f.liquidKurus >= emTarget,
    missing: f.hasAssets ? undefined : 'Varlıklarım boş; birikiminizi oraya ekleyin',
  }

  const debtLimit = Math.max(1, income)
  const debt: Stage = {
    id: 'debt',
    title: 'Borç yükünün azalması',
    criterion: 'Toplam borç bir aylık gelirin altında',
    status: f.debtsKurus > 0 ? `Borç ${tl(f.debtsKurus)}` : 'Kayıtlı borç yok',
    next: f.debtsKurus <= debtLimit ? 'Yeni borçtan kaçınarak bu seviyeyi koruyun' : `Borcu ${tl(f.debtsKurus - debtLimit)} azaltmak aşamayı tamamlar`,
    progress: f.debtsKurus <= debtLimit ? 1 : clamp01(debtLimit / f.debtsKurus),
    done: f.debtsKurus <= debtLimit && income > 0,
  }

  const rate = income > 0 ? saving / income : 0
  const savingStage: Stage = {
    id: 'saving',
    title: 'Düzenli birikim',
    criterion: `Gelirin en az %${SAVING_RATE_TARGET * 100}'u her ay birikime gidiyor`,
    status: income > 0 ? `Birikim oranı %${Math.max(0, Math.round(rate * 100))}` : 'Gelir bilgisi yok',
    next:
      rate >= SAVING_RATE_TARGET
        ? f.recentMonthlyContributionKurus > 0
          ? 'Birikimi Varlıklarım’a eklemeye devam edin'
          : 'Ayırdığınız tutarı Varlıklarım’a ekleyerek takip edin'
        : `Ayda ${tl(Math.max(0, income * SAVING_RATE_TARGET - saving))} daha ayırmak aşamayı tamamlar`,
    progress: clamp01(rate / SAVING_RATE_TARGET),
    done: rate >= SAVING_RATE_TARGET,
  }

  const target: Stage = {
    id: 'target',
    title: 'Hedef yaşam gideri',
    criterion: `Birikim, aylık ${tl(p.targetMonthlyExpenseKurus)} gideri karşılayacak ${tl(goal)} seviyesinde`,
    status: `${tl(net)} / ${tl(goal)}`,
    next: net >= goal ? 'Hedefe ulaştınız' : `${tl(goal - net)} kaldı`,
    progress: clamp01(net / goal),
    done: net >= goal,
  }

  const stages = [balance, emergency, debt, savingStage, target]
  let position = 0
  for (const s of stages) {
    if (s.done) position++
    else {
      position += s.progress
      break
    }
  }
  const route = {
    optimistic: monthsToTarget(net, saving, goal, SCENARIOS.optimistic.realReturnPct),
    mid: monthsToTarget(net, saving, goal, SCENARIOS.mid.realReturnPct),
    cautious: monthsToTarget(net, saving, goal, SCENARIOS.cautious.realReturnPct),
  }
  return {
    stages,
    position,
    indicators: {
      securityMonths: p.essentialMonthlyKurus > 0 ? f.liquidKurus / p.essentialMonthlyKurus : null,
      goalKurus: goal,
      progressKurus: net,
      goalRatio: clamp01(net / goal),
      monthlySavingKurus: saving,
      route,
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
