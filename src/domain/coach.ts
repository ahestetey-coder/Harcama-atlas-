import type { BudgetStatus } from './budget'
import { monthsToTarget, SCENARIOS, targetCapital, type IncomeStability, type JourneyFacts, type JourneyProfile } from './journey'
import type { DuePayment } from './recurring'

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
}

export type DebtStrategy = 'avalanche' | 'snowball'

export const STRATEGY_LABEL: Record<DebtStrategy, string> = {
  avalanche: 'Önce en yüksek faiz',
  snowball: 'Önce en küçük borç',
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
}

const MAX_MONTHS = 600

/** Ay ay borç ödeme benzetimi: önce faiz eklenir, asgariler ödenir, kalan tutar sıradaki borca gider. */
export function simulateDebts(debts: CoachDebt[], monthlyBudgetKurus: number, strategy: DebtStrategy): DebtPayoff {
  const list = debts.filter((d) => d.balanceKurus > 0).map((d) => ({ ...d, bal: d.balanceKurus, interest: 0, done: null as number | null }))
  const order = (a: (typeof list)[number], b: (typeof list)[number]) =>
    strategy === 'avalanche' ? b.monthlyRatePct - a.monthlyRatePct || a.bal - b.bal : a.bal - b.bal || b.monthlyRatePct - a.monthlyRatePct
  const balances = [list.reduce((s, d) => s + d.bal, 0)]
  let month = 0
  while (list.some((d) => d.bal > 0) && month < MAX_MONTHS) {
    month++
    let available = monthlyBudgetKurus
    for (const d of list) {
      if (d.bal <= 0) continue
      const i = Math.round((d.bal * d.monthlyRatePct) / 100)
      d.bal += i
      d.interest += i
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
  }
  const all = list.every((d) => d.done !== null)
  return {
    months: all ? month : null,
    totalInterestKurus: list.reduce((s, d) => s + d.interest, 0),
    debts: list.map((d) => ({ id: d.id, name: d.name, paidOffMonth: d.done, interestKurus: d.interest })),
    balances,
  }
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
  const monthly = input.debtsInExpenses ? usable + minimums : usable
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
      title: 'Borçları kapat',
      startMonth: 0,
      endMonth: end,
      monthlyKurus: Math.max(monthly, minimums),
      detail: input.strategy === 'avalanche' ? 'Asgariler ödenir, kalan tutar en yüksek faizli borca gider.' : 'Asgariler ödenir, kalan tutar en küçük borca gider.',
    })
    at = end ?? MAX_MONTHS
  }
  if (emGap > 0 && monthly > 0 && at < MAX_MONTHS) {
    const m = Math.ceil(emGap / monthly)
    phases.push({ id: 'emergency', title: 'Acil durum birikimini tamamla', startMonth: at, endMonth: at + m, monthlyKurus: monthly, detail: `${emMonths} aylık zorunlu gider kadar kolay ulaşılır birikim.` })
    at += m
  }
  if (monthly > 0 && at < MAX_MONTHS) {
    phases.push({ id: 'invest', title: 'Düzenli yatırım', startMonth: at, endMonth: null, monthlyKurus: monthly, detail: 'Her ay bu tutarı yatırıma ayırın; hangi araçlara dağıtacağınız size kalmış.' })
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
  const newDebt: CoachDebt = { id: 'yeni', name: 'Yapılandırılan kredi', balanceKurus: bal, monthlyRatePct: newMonthlyRatePct, minPaymentKurus: payment }
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
}

/** Belirli kurallarla kişiye gönderilen koç mesajları (önem sırasıyla). */
export function coachMessages(i: MessageInput): CoachMessage[] {
  const out: CoachMessage[] = []
  if (!i.hasProfile) {
    out.push({ id: 'survey', tone: 'plan', title: 'Sizi tanıyalım', body: 'Finansal özgürlük testini yapın; gelirinizi, giderlerinizi, güvencelerinizi ve hedefinizi öğrenip planınızı rotanıza göre hazırlayayım.', link: { to: '/yolculuk', label: 'Teste git' } })
    return out
  }
  const p = i.plan
  if (p && p.shortfallKurus > 0) {
    out.push({ id: `shortfall-${i.month}`, tone: 'warn', title: 'Asgari ödemeler bütçeyi aşıyor', body: `Borçların aylık asgari ödemeleri, ayırabildiğiniz tutardan ${tl(p.shortfallKurus)} fazla. Giderleri kısmak veya borcu daha uzun vadeyle yapılandırmak gerekiyor.` })
  } else if (p && p.surplusKurus <= 0) {
    out.push({ id: `deficit-${i.month}`, tone: 'warn', title: 'Gider gelirin üstünde', body: `Ortalama gideriniz gelirinizden ${tl(-p.surplusKurus + 1)} fazla. Plan, önce bu açığı kapatmakla başlar.`, link: { to: '/butce', label: 'Bütçe planı' } })
  }
  for (const w of i.budget?.warnings.slice(0, 2) ?? []) {
    const over = w.status.state === 'over'
    const what = w.kind === 'total' ? 'Aylık bütçe' : w.kind === 'week' ? 'Haftalık bütçe' : 'Bir kategori limiti'
    out.push({
      id: `budget-${i.month}-${w.kind}-${w.categoryId ?? ''}-${w.status.state}`,
      tone: 'warn',
      title: over ? `${what} aşıldı` : `${what} dolmak üzere`,
      body: over ? `${tl(w.status.spentKurus - w.status.effectiveKurus)} aşım var. Bu ay plana ayrılan tutar bundan etkilenebilir.` : `Limitin %${Math.round(w.status.ratio * 100)}'i kullanıldı; kalan ${tl(w.status.effectiveKurus - w.status.spentKurus)}.`,
      link: { to: '/butce', label: 'Bütçeye bak' },
    })
  }
  for (const d of i.due.slice(0, 2)) {
    out.push({ id: `due-${d.id}-${d.date}`, tone: 'info', title: `${d.name} ödemesi yaklaşıyor`, body: `${tl(d.amountKurus)}, son gün ${d.date.split('-').reverse().join('.')}.`, link: { to: '/odemeler', label: 'Ödemeler' } })
  }
  if (i.route?.current)
    out.push({
      id: `route-${i.route.current.id}-${i.month}`,
      tone: 'plan',
      title: `Rotanızda sıradaki: ${i.route.current.title}`,
      body: `Seviye ${i.route.level}/${i.route.total}. ${i.route.current.next}.`,
      link: { to: '/yolculuk', label: 'Rotama git' },
    })
  else if (i.route) out.push({ id: 'route-done', tone: 'win', title: 'Rotanın sonuna ulaştınız', body: 'Finansal özgürlük rotasındaki bütün aşamaları tamamladınız. Hedefinizi testte güncelleyebilirsiniz.', link: { to: '/yolculuk', label: 'Rotama git' } })
  for (const name of i.closedDebts) out.push({ id: `closed-${name}`, tone: 'win', title: `${name} kapandı!`, body: 'Bu borca giden tutar artık sıradaki hedefe akıyor.' })
  if (p) {
    const phase = p.phases[0]
    if (phase?.id === 'debt' && p.payoff) {
      const first = [...p.payoff.debts].sort((a, b) => (a.paidOffMonth ?? 1e9) - (b.paidOffMonth ?? 1e9))[0]
      out.push({
        id: `plan-debt-${i.month}`,
        tone: 'plan',
        title: 'Bu ayın planı',
        body: `Borçlara toplam ${tl(phase.monthlyKurus)} ödeyin. ${first ? `İlk kapanacak borç: ${first.name}${first.paidOffMonth ? ` (${first.paidOffMonth}. ay)` : ''}.` : ''}`,
      })
    } else if (phase?.id === 'emergency') {
      out.push({ id: `plan-em-${i.month}`, tone: 'plan', title: 'Bu ayın planı', body: `Acil durum birikimine ${tl(phase.monthlyKurus)} ekleyin; ${tl(p.emergencyGapKurus)} kaldı.`, link: { to: '/yatirimlar', label: 'Yatırımlarım' } })
    } else if (phase?.id === 'invest') {
      out.push({ id: `plan-inv-${i.month}`, tone: 'plan', title: 'Bu ayın planı', body: `Yatırıma ${tl(phase.monthlyKurus)} ayırın ve Yatırımlarım'a ekleyin.`, link: { to: '/yatirimlar', label: 'Yatırımlarım' } })
    }
  }
  return out
}

// ---------- Hazır sorular (kurallarla yanıt) ----------

export type QuestionId = 'debtFree' | 'invest' | 'emergency' | 'route' | 'budget'

export const QUESTIONS: Array<{ id: QuestionId; text: string }> = [
  { id: 'debtFree', text: 'Borcum ne zaman biter?' },
  { id: 'invest', text: 'Her ay ne kadar yatırıma ayırmalıyım?' },
  { id: 'emergency', text: 'Acil durum birikimim yeterli mi?' },
  { id: 'route', text: 'Hedefime ne zaman ulaşırım?' },
  { id: 'budget', text: 'Bu ay bütçem nasıl gidiyor?' },
]

const monthsText = (m: number) => (m < 12 ? `${m} ay` : m % 12 === 0 ? `${m / 12} yıl` : `${Math.floor(m / 12)} yıl ${m % 12} ay`)

export function answer(q: QuestionId, p: CoachPlan, facts: JourneyFacts, budget: BudgetStatus | null): string {
  switch (q) {
    case 'debtFree': {
      if (!p.debts.length) return 'Kayıtlı borcunuz yok. Borçlarım sayfasında borç eklerseniz kapatma planını hemen çıkarırım.'
      if (!p.payoff?.months) return `Bu ödeme tutarıyla borçlar kapanmıyor: faiz, ödemeden hızlı büyüyor. Aylık ödemeyi artırmak veya daha düşük faizle yapılandırmak gerekiyor.`
      const s = p.interestSavedKurus > 0 ? ` Sadece asgari ödeseydiniz ${tl(p.interestSavedKurus)} daha fazla faiz öderdiniz.` : ''
      return `Ayda ${tl(p.phases[0].monthlyKurus)} ödemeyle bütün borçlar ${monthsText(p.payoff.months)} içinde kapanır; toplam faiz ${tl(p.payoff.totalInterestKurus)}.${s}`
    }
    case 'invest': {
      if (p.monthlyPlanKurus <= 0) return 'Şu an gider gelirin üstünde, yatırıma ayrılacak tutar yok. Önce bütçe dengesini kuralım.'
      const inv = p.phases.find((x) => x.id === 'invest')
      const when = inv && inv.startMonth > 0 ? ` ${monthsText(inv.startMonth)} sonra, borç${p.emergencyGapKurus > 0 ? ' ve acil durum birikimi' : ''} tamamlanınca başlar.` : ' Hemen başlayabilirsiniz.'
      const buf = p.bufferKurus > 0 ? ` Gelir düzeniniz nedeniyle ${tl(p.bufferKurus)} tampon olarak bırakıldı.` : ''
      return `Ayda ${tl(p.monthlyPlanKurus)} ayırabilirsiniz.${when}${buf} Hangi araca yatıracağınızı ben söylemem; risk ve likidite için Finansal bilgi sayfasına bakabilirsiniz.`
    }
    case 'emergency': {
      if (p.emergencyGapKurus <= 0) return `Evet. Hızlı kullanılabilir birikiminiz (${tl(facts.liquidKurus)}) ${tl(p.emergencyTargetKurus)} hedefini karşılıyor.`
      return `Henüz değil: ${tl(facts.liquidKurus)} var, hedef ${tl(p.emergencyTargetKurus)}. ${tl(p.emergencyGapKurus)} eksik.`
    }
    case 'route': {
      if (p.targetMonths === null) return 'Bu tempoyla hedef birikime ulaşılmıyor. Planı değiştirmek için Senaryolar sayfasını deneyin.'
      if (p.targetMonths === 0) return 'Hedef birikiminize şimdiden ulaşmışsınız.'
      return `Orta varsayımla (yıllık %${SCENARIOS.mid.realReturnPct} reel getiri) hedef birikime (${tl(p.goalKurus)}) yaklaşık ${monthsText(p.targetMonths)} içinde ulaşırsınız. Bu bir tahmindir, garanti değildir.`
    }
    case 'budget': {
      const t = budget?.total
      if (!t) return 'Aylık bütçe belirlemediniz. Bütçe planı sayfasından bir tutar girerseniz gidişatı takip ederim.'
      const f = budget?.forecast
      return `Bu dönem ${tl(t.spentKurus)} harcandı, bütçenin %${Math.round(t.ratio * 100)}'i.${f ? ` Bu hızla dönem sonu tahmini ${tl(f.projectedKurus)}.` : ''}`
    }
  }
}
