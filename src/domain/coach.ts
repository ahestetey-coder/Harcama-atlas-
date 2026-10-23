import type { BudgetStatus } from './budget'
import { monthsToTarget, SCENARIOS, targetCapital, type IncomeStability, type JourneyFacts, type JourneyProfile } from './journey'
import { monthLabel } from './dates'
import { addMonthsClamped, type DuePayment } from './recurring'
import type { IsoDate } from './types'
import { tt, ttf } from '../lib/i18n'

/**
 * Plus+ koç: borç kapatma, acil durum birikimi ve yatırıma ayrılacak tutar planı.
 * Bütün hesaplar burada, cihazda yapılır. Yapay zekâ (bağlanırsa) yalnızca bu sonuçları açıklar.
 * Belirli bir yatırım ürünü önerilmez; yalnızca tutar ve sıra belirlenir.
 */

export interface CoachDebt {
  id: string
  name: string
  balanceKurus: number
  /** Aylık faiz (%). */
  monthlyRatePct: number
  /** Aylık asgari ödeme/taksit; girilmemişse tahmin edilir. */
  minPaymentKurus: number
  /** Asgari ödeme kullanıcı tarafından girilmedi, tahmin kullanıldı. */
  estimatedMin?: boolean
  /** Taksit gibi sabit planlı, faizsiz borç: erken ödeme hedeflenmez. */
  fixed?: boolean
  /** Ödeme planından bilinen son ödeme tarihi (taksitli kredi, kart taksitleri). */
  endDate?: IsoDate
  /** Ödemesi ortalama gidere zaten giriyor (kart taksitleri, planlı kredi taksitleri); planda iki kez sayılmaz. */
  inSpending?: boolean
}

export type DebtStrategy = 'avalanche' | 'snowball'

export const STRATEGY_LABEL: Record<DebtStrategy, string> = {
  avalanche: tt('Önce en yüksek faiz'),
  snowball: tt('Önce en küçük borç'),
}

/** Asgari ödeme bilinmiyorsa: aylık faiz + bakiyenin %3'ü (borcun kapanabilmesi için). */
export function estimatedMinPayment(balanceKurus: number, monthlyRatePct: number): number {
  return Math.max(10000, Math.ceil((balanceKurus * (monthlyRatePct + 3)) / 100))
}

export interface DebtResult {
  id: string
  name: string
  /** Kaçıncı ayda kapandı (1 = bu ay); 50 yılda kapanmıyorsa null. */
  paidOffMonth: number | null
  interestKurus: number
}

export interface DebtPayoff {
  /** Bütün borçların kapandığı ay; kapanmıyorsa null. */
  months: number | null
  totalInterestKurus: number
  debts: DebtResult[]
  /** Ay sonu toplam borç (0. eleman = bugün). */
  balances: number[]
  /** Her ay yapılan toplam ödeme ve eklenen faiz (0. eleman = 1. ay). */
  payments: number[]
  interest: number[]
}

const MAX_MONTHS = 600

/** Ay ay borç ödeme benzetimi: önce faiz eklenir, asgariler ödenir, kalan tutar sıradaki borca gider. */
export function simulateDebts(debts: CoachDebt[], monthlyBudgetKurus: number, strategy: DebtStrategy): DebtPayoff {
  const list = debts.filter((d) => d.balanceKurus > 0).map((d) => ({ ...d, bal: d.balanceKurus, interest: 0, done: null as number | null }))
  const order = (a: (typeof list)[number], b: (typeof list)[number]) =>
    strategy === 'avalanche' ? b.monthlyRatePct - a.monthlyRatePct || a.bal - b.bal : a.bal - b.bal || b.monthlyRatePct - a.monthlyRatePct
  const balances = [list.reduce((s, d) => s + d.bal, 0)]
  const payments: number[] = []
  const interest: number[] = []
  let month = 0
  while (list.some((d) => d.bal > 0) && month < MAX_MONTHS) {
    month++
    let available = monthlyBudgetKurus
    let monthInterest = 0
    for (const d of list) {
      if (d.bal <= 0) continue
      const i = Math.round((d.bal * d.monthlyRatePct) / 100)
      d.bal += i
      d.interest += i
      monthInterest += i
    }
    for (const d of list) {
      if (d.bal <= 0) continue
      const pay = Math.min(d.bal, d.minPaymentKurus)
      d.bal -= pay
      available -= pay
    }
    if (available > 0) {
      for (const d of list.filter((x) => x.bal > 0 && !x.fixed).sort(order)) {
        const pay = Math.min(d.bal, available)
        d.bal -= pay
        available -= pay
        if (available <= 0) break
      }
    }
    for (const d of list) if (d.bal <= 0 && d.done === null) d.done = month
    balances.push(list.reduce((s, d) => s + Math.max(0, d.bal), 0))
    payments.push(monthlyBudgetKurus - available)
    interest.push(monthInterest)
  }
  const all = list.every((d) => d.done !== null)
  return {
    months: all ? month : null,
    totalInterestKurus: list.reduce((s, d) => s + d.interest, 0),
    debts: list.map((d) => ({ id: d.id, name: d.name, paidOffMonth: d.done, interestKurus: d.interest })),
    balances,
    payments,
    interest,
  }
}

export interface DebtEnd {
  id: string
  name: string
  /** Son ödeme tarihi; bu ödemeyle hiç kapanmıyorsa null. */
  date: IsoDate | null
  /** Tarih ödeme planından mı geldi, aylık ödemeyle benzetimden mi. */
  source: 'plan' | 'payment'
}

/**
 * Ek ödeme yapılmadan, yalnızca planlanan taksit ve aylık (asgari) ödemelerle her borcun biteceği tarih.
 * Planı olan borçta son taksit tarihi, diğerlerinde faizle ay ay benzetim kullanılır.
 */
export function scheduledDebtEnds(debts: CoachDebt[], today: IsoDate): DebtEnd[] {
  return debts
    .filter((d) => d.balanceKurus > 0)
    .map((d) => {
      if (d.endDate) return { id: d.id, name: d.name, date: d.endDate, source: 'plan' as const }
      const m = simulateDebts([{ ...d, fixed: true }], d.minPaymentKurus, 'avalanche').months
      return { id: d.id, name: d.name, date: m === null ? null : addMonthsClamped(today, m - 1), source: 'payment' as const }
    })
}

/** Bütün borçların bittiği tarih; biri kapanmıyorsa null. */
export function lastDebtEnd(ends: DebtEnd[]): IsoDate | null {
  if (!ends.length || ends.some((e) => !e.date)) return null
  return ends.reduce((a, e) => (e.date! > a ? e.date! : a), ends[0].date!)
}

/** Gelir düzenine göre fazlanın plana ayrılan kısmı; kalanı tampon olarak bırakılır. */
export const SAFETY_SHARE: Record<IncomeStability, number> = { regular: 0.9, variable: 0.75, irregular: 0.6 }

export type PhaseId = 'debt' | 'emergency' | 'invest'

export interface CoachPhase {
  id: PhaseId
  title: string
  /** Başlangıç ve bitiş ayı (0 = bu ay başı). Bitiş yoksa süresiz (yatırım). */
  startMonth: number
  endMonth: number | null
  monthlyKurus: number
  detail: string
}

export interface CoachPlan {
  incomeKurus: number
  spendKurus: number
  /** Gelir − gider. */
  surplusKurus: number
  /** Plana her ay ayrılan tutar (borç döneminde asgariler dahil). */
  monthlyPlanKurus: number
  /** Gelir düzeni nedeniyle tampon olarak bırakılan aylık tutar. */
  bufferKurus: number
  minimumsKurus: number
  /** Asgari ödemeler plana sığmıyor. */
  shortfallKurus: number
  debts: CoachDebt[]
  payoff: DebtPayoff | null
  /** Yalnızca asgari ödemeyle kıyas. */
  minOnly: DebtPayoff | null
  interestSavedKurus: number
  emergencyTargetKurus: number
  emergencyGapKurus: number
  phases: CoachPhase[]
  /** Borç ve acil durum bittikten sonra yatırıma ayrılacak aylık tutar. */
  investMonthlyKurus: number
  /** Bugünden hedef birikime tahmini ay (orta varsayım). */
  targetMonths: number | null
  goalKurus: number
}

export interface CoachInput {
  profile: JourneyProfile
  facts: JourneyFacts
  debts: CoachDebt[]
  /** Borç ödemeleri ortalama gidere zaten dahil mi (ör. kredi taksiti gider olarak kaydediliyor). */
  debtsInExpenses: boolean
  strategy: DebtStrategy
  emergencyMonths?: number
}

export function buildCoachPlan(input: CoachInput): CoachPlan {
  const { profile, facts } = input
  const income = profile.monthlyIncomeKurus
  const spend = facts.averageExpenseKurus ?? profile.essentialMonthlyKurus
  const surplus = income - spend
  const share = SAFETY_SHARE[profile.incomeStability]
  const usable = Math.max(0, Math.round(surplus * share))
  const buffer = Math.max(0, surplus - usable)
  const debts = input.debts.filter((d) => d.balanceKurus > 0)
  const minimums = debts.reduce((s, d) => s + Math.min(d.balanceKurus, d.minPaymentKurus), 0)
  // Ortalama gidere zaten giren ödemeler, gider düşülmüş fazladan ikinci kez düşülmez
  const counted = input.debtsInExpenses ? minimums : debts.filter((d) => d.inSpending).reduce((s, d) => s + Math.min(d.balanceKurus, d.minPaymentKurus), 0)
  const monthly = usable + counted
  const shortfall = Math.max(0, minimums - monthly)

  const payoff = debts.length ? simulateDebts(debts, Math.max(monthly, minimums), input.strategy) : null
  const minOnly = debts.length ? simulateDebts(debts, minimums, input.strategy) : null
  const saved = payoff && minOnly ? Math.max(0, minOnly.totalInterestKurus - payoff.totalInterestKurus) : 0

  const emMonths = input.emergencyMonths ?? 3
  const emTarget = profile.essentialMonthlyKurus * emMonths
  const emGap = Math.max(0, emTarget - facts.liquidKurus)

  const phases: CoachPhase[] = []
  let at = 0
  if (debts.length) {
    const end = payoff?.months ?? null
    phases.push({
      id: 'debt',
      title: tt('Borçları kapat'),
      startMonth: 0,
      endMonth: end,
      monthlyKurus: Math.max(monthly, minimums),
      detail: input.strategy === 'avalanche' ? tt('Asgariler ödenir, kalan tutar en yüksek faizli borca gider.') : tt('Asgariler ödenir, kalan tutar en küçük borca gider.'),
    })
    at = end ?? MAX_MONTHS
  }
  if (emGap > 0 && monthly > 0 && at < MAX_MONTHS) {
    const m = Math.ceil(emGap / monthly)
    phases.push({ id: 'emergency', title: tt('Acil durum birikimini tamamla'), startMonth: at, endMonth: at + m, monthlyKurus: monthly, detail: ttf('{0} aylık zorunlu gider kadar kolay ulaşılır birikim.', emMonths) })
    at += m
  }
  if (monthly > 0 && at < MAX_MONTHS) {
    phases.push({ id: 'invest', title: tt('Düzenli yatırım'), startMonth: at, endMonth: null, monthlyKurus: monthly, detail: tt('Her ay bu tutarı yatırıma ayırın; hangi araçlara dağıtacağınız size kalmış.') })
  }

  const goal = targetCapital(profile)
  const start = facts.assetsKurus - facts.debtsKurus - (payoff?.totalInterestKurus ?? 0)
  const targetMonths = monthly > 0 && (payoff === null || payoff.months !== null) ? monthsToTarget(Math.max(0, start), monthly, goal, SCENARIOS.mid.realReturnPct) : null

  return {
    incomeKurus: income,
    spendKurus: spend,
    surplusKurus: surplus,
    monthlyPlanKurus: monthly,
    bufferKurus: buffer,
    minimumsKurus: minimums,
    shortfallKurus: shortfall,
    debts,
    payoff,
    minOnly,
    interestSavedKurus: saved,
    emergencyTargetKurus: emTarget,
    emergencyGapKurus: emGap,
    phases,
    investMonthlyKurus: monthly > 0 ? monthly : 0,
    targetMonths,
    goalKurus: goal,
  }
}

/** Yapılandırma denemesi: seçilen borçlar tek bir yeni krediyle (aylık faiz, vade) kapatılırsa. */
export interface RestructureResult {
  balanceKurus: number
  newPaymentKurus: number
  newInterestKurus: number
  oldInterestKurus: number
  savedKurus: number
}

export function restructure(debts: CoachDebt[], ids: string[], newMonthlyRatePct: number, termMonths: number, monthlyBudgetKurus: number, strategy: DebtStrategy): RestructureResult | null {
  const picked = debts.filter((d) => ids.includes(d.id) && d.balanceKurus > 0)
  if (!picked.length || termMonths < 1) return null
  const bal = picked.reduce((s, d) => s + d.balanceKurus, 0)
  const r = newMonthlyRatePct / 100
  const payment = Math.ceil(r > 0 ? (bal * r) / (1 - Math.pow(1 + r, -termMonths)) : bal / termMonths)
  const newDebt: CoachDebt = { id: 'yeni', name: tt('Yapılandırılan kredi'), balanceKurus: bal, monthlyRatePct: newMonthlyRatePct, minPaymentKurus: payment }
  const rest = debts.filter((d) => !ids.includes(d.id))
  const budget = Math.max(monthlyBudgetKurus, payment + rest.reduce((s, d) => s + d.minPaymentKurus, 0))
  const before = simulateDebts(debts, Math.max(monthlyBudgetKurus, debts.reduce((s, d) => s + d.minPaymentKurus, 0)), strategy)
  const after = simulateDebts([...rest, newDebt], budget, strategy)
  return {
    balanceKurus: bal,
    newPaymentKurus: payment,
    newInterestKurus: after.totalInterestKurus,
    oldInterestKurus: before.totalInterestKurus,
    savedKurus: before.totalInterestKurus - after.totalInterestKurus,
  }
}

// ---------- Koç mesajları (kurallarla) ----------

export type CoachTone = 'info' | 'warn' | 'win' | 'plan'

export interface CoachMessage {
  /** Aynı durum için aynı kimlik: okundu/kapatıldı bilgisi buna bağlanır. */
  id: string
  tone: CoachTone
  title: string
  body: string
  link?: { to: string; label: string }
}

const tl = (k: number) => `${Math.round(k / 100).toLocaleString('tr-TR')} ₺`

export interface MessageInput {
  plan: CoachPlan | null
  hasProfile: boolean
  budget: BudgetStatus | null
  due: DuePayment[]
  month: string
  today: string
  /** Kapanan borçlar (önceden kayıtlıydı, bakiyesi sıfırlandı). */
  closedDebts: string[]
  /** Finansal özgürlük rotasındaki konum. */
  route?: { level: number; total: number; current: { id: string; title: string; next: string } | null }
  /** Web'deki Finansal Harita testinden bağlanan tahmini sonuç (test henüz netleştirilmediyse). */
  webTest?: { level: number; total: number; stage: string | null; years: string | null } | null
}

/** Belirli kurallarla kişiye gönderilen koç mesajları (önem sırasıyla). */
export function coachMessages(i: MessageInput): CoachMessage[] {
  const out: CoachMessage[] = []
  if (!i.hasProfile && i.webTest) {
    const w = i.webTest
    out.push({
      id: 'web-test',
      tone: 'plan',
      title: tt('Web testindeki haritan hazır'),
      body: ttf('Web testine göre {0} duraklı rotanın {1}. seviyesindesin{2}{3}. Bu aralıklarla yapılmış bir tahmin; gerçek rakamlarını 5 dakikada netleştir, planını rotana göre hazırlayayım.', w.total, w.level, w.stage ? ttf('; sıradaki durak: {0}', w.stage) : '', w.years ? ttf(' ve özgürlük yılın şimdilik {0} arası görünüyor', w.years) : ''),
      link: { to: '/yolculuk', label: tt('Rotamı netleştir') },
    })
    return out
  }
  if (!i.hasProfile) {
    out.push({ id: 'survey', tone: 'plan', title: tt('Sizi tanıyalım'), body: tt('Finansal Yolculuğum sayfasında rotanızı belirleyin; gelirinizi, giderlerinizi, borcunuzu ve hedefinizi öğrenip planınızı rotanıza göre hazırlayayım.'), link: { to: '/yolculuk', label: tt('Rotamı belirle') } })
    return out
  }
  const p = i.plan
  if (p && p.shortfallKurus > 0) {
    out.push({ id: `shortfall-${i.month}`, tone: 'warn', title: tt('Asgari ödemeler bütçeyi aşıyor'), body: ttf('Borçların aylık asgari ödemeleri, ayırabildiğiniz tutardan {0} fazla. Giderleri kısmak veya borcu daha uzun vadeyle yapılandırmak gerekiyor.', tl(p.shortfallKurus)) })
  } else if (p && p.surplusKurus <= 0) {
    out.push({ id: `deficit-${i.month}`, tone: 'warn', title: tt('Gider gelirin üstünde'), body: ttf('Ortalama gideriniz gelirinizden {0} fazla. Plan, önce bu açığı kapatmakla başlar.', tl(-p.surplusKurus + 1)), link: { to: '/butce', label: tt('Bütçe planı') } })
  }
  for (const w of i.budget?.warnings.slice(0, 2) ?? []) {
    const over = w.status.state === 'over'
    const what = w.kind === 'total' ? tt('Aylık bütçe') : w.kind === 'week' ? tt('Haftalık bütçe') : tt('Bir kategori limiti')
    out.push({
      id: `budget-${i.month}-${w.kind}-${w.categoryId ?? ''}-${w.status.state}`,
      tone: 'warn',
      title: over ? ttf('{0} aşıldı', what) : ttf('{0} dolmak üzere', what),
      body: over ? ttf('{0} aşım var. Bu ay plana ayrılan tutar bundan etkilenebilir.', tl(w.status.spentKurus - w.status.effectiveKurus)) : ttf('Limitin %{0}\'i kullanıldı; kalan {1}.', Math.round(w.status.ratio * 100), tl(w.status.effectiveKurus - w.status.spentKurus)),
      link: { to: '/butce', label: tt('Bütçeye bak') },
    })
  }
  for (const d of i.due.slice(0, 2)) {
    out.push({ id: `due-${d.id}-${d.date}`, tone: 'info', title: ttf('{0} ödemesi yaklaşıyor', d.name), body: ttf('{0}, son gün {1}.', tl(d.amountKurus), d.date.split('-').reverse().join('.')), link: { to: '/borclar?bolum=odemeler', label: tt('Ödemeler') } })
  }
  if (i.route?.current)
    out.push({
      id: `route-${i.route.current.id}-${i.month}`,
      tone: 'plan',
      title: ttf('Rotanızda sıradaki: {0}', i.route.current.title),
      body: ttf('Seviye {0}/{1}. {2}.', i.route.level, i.route.total, i.route.current.next),
      link: { to: '/yolculuk', label: tt('Rotama git') },
    })
  else if (i.route) out.push({ id: 'route-done', tone: 'win', title: tt('Rotanın sonuna ulaştınız'), body: tt('Finansal özgürlük rotasındaki bütün aşamaları tamamladınız. Hedefinizi testte güncelleyebilirsiniz.'), link: { to: '/yolculuk', label: tt('Rotama git') } })
  for (const name of i.closedDebts) out.push({ id: `closed-${name}`, tone: 'win', title: ttf('{0} kapandı!', name), body: tt('Bu borca giden tutar artık sıradaki hedefe akıyor.') })
  if (p) {
    const phase = p.phases[0]
    if (phase?.id === 'debt' && p.payoff) {
      const first = [...p.payoff.debts].sort((a, b) => (a.paidOffMonth ?? 1e9) - (b.paidOffMonth ?? 1e9))[0]
      out.push({
        id: `plan-debt-${i.month}`,
        tone: 'plan',
        title: tt('Bu ayın planı'),
        body: ttf('Borçlara toplam {0} ödeyin. {1}', tl(phase.monthlyKurus), first ? ttf('İlk kapanacak borç: {0}{1}.', first.name, first.paidOffMonth ? ` (${monthLabel(addMonthsClamped(i.today, first.paidOffMonth - 1).slice(0, 7))})` : '') : ''),
      })
    } else if (phase?.id === 'emergency') {
      out.push({ id: `plan-em-${i.month}`, tone: 'plan', title: tt('Bu ayın planı'), body: ttf('Acil durum birikimine {0} ekleyin; {1} kaldı.', tl(phase.monthlyKurus), tl(p.emergencyGapKurus)), link: { to: '/yatirimlar', label: tt('Yatırımlarım') } })
    } else if (phase?.id === 'invest') {
      out.push({ id: `plan-inv-${i.month}`, tone: 'plan', title: tt('Bu ayın planı'), body: ttf('Yatırıma {0} ayırın ve Yatırımlarım\'a ekleyin.', tl(phase.monthlyKurus)), link: { to: '/yatirimlar', label: tt('Yatırımlarım') } })
    }
  }
  return out
}

// ---------- Hazır sorular (kurallarla yanıt) ----------

export type QuestionId = 'debtFree' | 'invest' | 'emergency' | 'route' | 'budget'

export const QUESTIONS: Array<{ id: QuestionId; text: string }> = [
  { id: 'debtFree', text: tt('Borcum ne zaman biter?') },
  { id: 'invest', text: tt('Her ay ne kadar yatırıma ayırmalıyım?') },
  { id: 'emergency', text: tt('Acil durum birikimim yeterli mi?') },
  { id: 'route', text: tt('Hedefime ne zaman ulaşırım?') },
  { id: 'budget', text: tt('Bu ay bütçem nasıl gidiyor?') },
]

const monthsText = (m: number) => (m < 12 ? ttf('{0} ay', m) : m % 12 === 0 ? ttf('{0} yıl', m / 12) : ttf('{0} yıl {1} ay', Math.floor(m / 12), m % 12))

export function answer(q: QuestionId, p: CoachPlan, facts: JourneyFacts, budget: BudgetStatus | null, today: IsoDate): string {
  switch (q) {
    case 'debtFree': {
      if (!p.debts.length) return tt('Kayıtlı borcunuz yok. Borçlarım sayfasında borç eklerseniz kapatma planını hemen çıkarırım.')
      return debtFreeAnswer(p, today)
    }
    case 'invest': {
      if (p.monthlyPlanKurus <= 0) return tt('Şu an gider gelirin üstünde, yatırıma ayrılacak tutar yok. Önce bütçe dengesini kuralım.')
      const inv = p.phases.find((x) => x.id === 'invest')
      const when = inv && inv.startMonth > 0 ? ttf(' {0} sonra, borç{1} tamamlanınca başlar.', monthsText(inv.startMonth), p.emergencyGapKurus > 0 ? tt(' ve acil durum birikimi') : '') : tt(' Hemen başlayabilirsiniz.')
      const buf = p.bufferKurus > 0 ? ttf(' Gelir düzeniniz nedeniyle {0} tampon olarak bırakıldı.', tl(p.bufferKurus)) : ''
      return ttf('Ayda {0} ayırabilirsiniz.{1}{2} Hangi araca yatıracağınızı ben söylemem; risk ve likidite için Finansal Gündem sayfasına bakabilirsiniz.', tl(p.monthlyPlanKurus), when, buf)
    }
    case 'emergency': {
      if (p.emergencyGapKurus <= 0) return ttf('Evet. Hızlı kullanılabilir birikiminiz ({0}) {1} hedefini karşılıyor.', tl(facts.liquidKurus), tl(p.emergencyTargetKurus))
      return ttf('Henüz değil: {0} var, hedef {1}. {2} eksik.', tl(facts.liquidKurus), tl(p.emergencyTargetKurus), tl(p.emergencyGapKurus))
    }
    case 'route': {
      if (p.targetMonths === null) return tt('Bu tempoyla hedef birikime ulaşılmıyor. Planı değiştirmek için Senaryolar sayfasını deneyin.')
      if (p.targetMonths === 0) return tt('Hedef birikiminize şimdiden ulaşmışsınız.')
      return ttf('Orta varsayımla (yıllık %{0} reel getiri) hedef birikime ({1}) yaklaşık {2} içinde ulaşırsınız. Bu bir tahmindir, garanti değildir.', SCENARIOS.mid.realReturnPct, tl(p.goalKurus), monthsText(p.targetMonths))
    }
    case 'budget': {
      const t = budget?.total
      if (!t) return tt('Aylık bütçe belirlemediniz. Bütçe planı sayfasından bir tutar girerseniz gidişatı takip ederim.')
      const f = budget?.forecast
      return ttf('Bu dönem {0} harcandı, bütçenin %{1}\'i.{2}', tl(t.spentKurus), Math.round(t.ratio * 100), f ? ttf(' Bu hızla dönem sonu tahmini {0}.', tl(f.projectedKurus)) : '')
    }
  }
}

const endText = (e: DebtEnd) => (e.date ? monthLabel(e.date.slice(0, 7)) : tt('bu ödemeyle kapanmıyor'))

/** "Borcum ne zaman biter?": önce planlanan ödemelerle her borcun bitiş tarihi, sonra plana göre hızlandırma. */
export function debtFreeAnswer(p: CoachPlan, today: IsoDate): string {
  const ends = scheduledDebtEnds(p.debts, today)
  const last = lastDebtEnd(ends)
  const head =
    ends.length === 1
      ? ttf('Planlanan ödemelerle {0} için son ödeme: {1}.', ends[0].name, endText(ends[0]))
      : ttf('Planlanan ödemelerle son ödeme tarihleri: {0}.{1}', ends.map((e) => `${e.name}, ${endText(e)}`).join('; '), last ? ttf(' Hepsi bittiğinde: {0}.', monthLabel(last.slice(0, 7))) : '')
  if (!p.payoff?.months) return ttf('{0} Bu ödemelerle borçların hepsi kapanmıyor; faiz, ödemeden hızlı büyüyor. Aylık ödemeyi artırmak veya daha düşük faizle yapılandırmak gerekiyor.', head)
  const planEnd = addMonthsClamped(today, p.payoff.months - 1)
  if (!last || planEnd.slice(0, 7) >= last.slice(0, 7)) return head
  const s = p.interestSavedKurus > 0 ? ttf(', {0} daha az faiz ödersiniz', tl(p.interestSavedKurus)) : ''
  return ttf('{0} Plana göre ayda {1} ayırırsanız borçsuz olma tarihi {2} olur{3}.', head, tl(p.phases[0].monthlyKurus), monthLabel(planEnd.slice(0, 7)), s)
}
