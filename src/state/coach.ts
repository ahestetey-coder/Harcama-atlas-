import { useEffect, useMemo, useState } from 'react'
import { listPublishedReports, type Report } from '../cloud/research'
import { holdingSummary } from '../domain/assets'
import { buildCoachPlan, coachMessages, estimatedMinPayment, type CoachDebt, type CoachMessage, type CoachPlan } from '../domain/coach'
import { currentPeriod, todayIso } from '../domain/dates'
import { RISK_PROFILES } from '../domain/assumptions'
import { MONTH_NAMES } from '../domain/dates'
import { buildJourney, emergencyMonthsFor, reachDateLabel, type FreedomPlan, type JourneyFacts, type JourneyProfile, type JourneyResult } from '../domain/journey'
import { futureLoad, installmentPlans } from '../domain/recurring'
import type { CoachSettings, CoachShare } from '../domain/types'
import { useAuth } from './auth'
import { useBudgetStatus, useDuePayments, useInstallmentDebt, useJourneyFacts } from './budget'
import { usePersonalCycle } from './cycle'
import { useLiveState } from './livePrices'
import { useAssets, useRecurring, useSettings } from './data'
import { usePersonalTransactions } from './personal'

export const DEFAULT_COACH: CoachSettings = { strategy: 'avalanche', debtsInExpenses: false, dismissed: [], aiConsent: false }
export const DEFAULT_SHARE: CoachShare = { income: true, expenses: true, debts: true, goals: true, budget: true }
export const MEMORY_MAX = 50

export interface CoachDebtInfo extends CoachDebt {
  /** Faiz oranı girilmemiş (0 sayıldı). */
  missingRate: boolean
}

/** Koçun borç listesi: Borçlarım'daki borçlar ve düzenli ödemelerdeki kalan taksitler. */
export function useCoachDebts(): CoachDebtInfo[] | null {
  const assets = useAssets()
  const installmentDebt = useInstallmentDebt()
  const recurring = useRecurring()
  const personal = usePersonalTransactions()
  const startDay = usePersonalCycle()
  return useMemo(() => {
    if (!assets || !recurring || !personal) return null
    const today = todayIso()
    const out: CoachDebtInfo[] = []
    for (const a of assets) {
      if (a.archived || a.kind !== 'debt') continue
      const bal = holdingSummary(a, today).valueKurus
      if (bal <= 0) continue
      const rate = a.debtTerms?.monthlyRatePct ?? 0
      const min = a.debtTerms?.minPaymentKurus
      out.push({ id: a.id, name: a.name, balanceKurus: bal, monthlyRatePct: rate, minPaymentKurus: min ?? estimatedMinPayment(bal, rate), estimatedMin: !min, missingRate: !a.debtTerms })
    }
    if (installmentDebt > 0) {
      const manual = new Set(recurring.filter((i) => i.kind === 'installment' && i.matchKey).map((i) => i.matchKey!))
      const load = futureLoad(recurring, installmentPlans(personal.counted, manual), currentPeriod(startDay), 1, startDay)[0]
      const pay = Math.max(1, Math.min(installmentDebt, load?.installmentKurus || installmentDebt))
      out.push({ id: 'taksitler', name: 'Kalan taksitler', balanceKurus: installmentDebt, monthlyRatePct: 0, minPaymentKurus: pay, fixed: true, missingRate: false })
    }
    return out
  }, [assets, installmentDebt, recurring, personal, startDay])
}

/** Kapanan borçlar: kaydı duran ama bakiyesi sıfırlanmış borçlar. */
function useClosedDebts(): string[] {
  const assets = useAssets()
  return useMemo(() => {
    const today = todayIso()
    return (assets ?? []).filter((a) => !a.archived && a.kind === 'debt' && a.trades.length > 1 && holdingSummary(a, today).valueKurus <= 0).map((a) => a.name)
  }, [assets])
}

export interface CoachState {
  profile: JourneyProfile | null
  facts: JourneyFacts
  settings: CoachSettings
  debts: CoachDebtInfo[]
  plan: CoachPlan | null
  /** Finansal özgürlük rotası (test yapılmışsa). */
  journey: JourneyResult | null
  /** Okunmamış mesajlar önce. */
  messages: Array<CoachMessage & { read: boolean }>
  budget: ReturnType<typeof useBudgetStatus>
}

export function useCoach(): CoachState | null {
  const settings = useSettings()
  const facts = useJourneyFacts()
  const debts = useCoachDebts()
  const startDay = usePersonalCycle()
  const month = currentPeriod(startDay)
  const budget = useBudgetStatus(month)
  const due = useDuePayments()
  const closed = useClosedDebts()
  const live = useLiveState()
  const usd = live.usd?.valueTl ?? null
  const gold = live.goldGram?.valueTl ?? null
  return useMemo(() => {
    if (!settings || !facts || !debts) return null
    const cs = settings.coach ?? DEFAULT_COACH
    const profile = settings.journey ?? null
    const plan = profile ? buildCoachPlan({ profile, facts, debts, debtsInExpenses: cs.debtsInExpenses, strategy: cs.strategy, emergencyMonths: emergencyMonthsFor(profile) }) : null
    const journey = profile ? buildJourney(profile, facts, { USD: usd ?? (profile.base === 'USD' ? profile.baseRateTl : null), XAU: gold ?? (profile.base === 'XAU' ? profile.baseRateTl : null) }, { strategy: cs.strategy }) : null
    const route = journey ? { level: journey.level, total: journey.stages.length, current: journey.current } : undefined
    const read = new Set(cs.dismissed)
    const messages = coachMessages({ plan, hasProfile: !!profile, budget, due, month, today: todayIso(), closedDebts: closed, route }).map((m) => ({ ...m, read: read.has(m.id) }))
    messages.sort((a, b) => Number(a.read) - Number(b.read))
    return { profile, facts, settings: cs, debts, plan, journey, messages, budget }
  }, [settings, facts, debts, budget, due, month, closed, usd, gold])
}

/** Editör onaylı, yayınlanmış ortak ekonomi raporları (hesapla giriş yapılmışsa). */
export function useReports(limit = 10): Report[] | null {
  const { backend, user } = useAuth()
  const [state, setState] = useState<{ uid: string; list: Report[] } | null>(null)
  useEffect(() => {
    if (!backend || !user) return
    let alive = true
    listPublishedReports(backend.client, limit).then((list) => alive && setState({ uid: user.id, list }))
    return () => {
      alive = false
    }
  }, [backend, user, limit])
  if (!backend || !user) return []
  return state?.uid === user.id ? state.list : null
}

/**
 * Yapay zekâya gönderilen özet: yalnızca toplamlar ve kullanıcının açık bıraktığı bilgi grupları;
 * borç adları, işlemler ve açıklamalar gönderilmez.
 */
export function coachSummary(s: CoachState) {
  const share = { ...DEFAULT_SHARE, ...s.settings.share }
  const tl = (k: number | null | undefined) => (k == null ? null : Math.round(k / 100))
  const p = s.plan
  return {
    ...(share.income ? { aylikGelir: tl(s.profile?.monthlyIncomeKurus), gelirDuzeni: s.profile?.incomeStability ?? null } : {}),
    ...(share.expenses ? { ortalamaAylikGider: tl(s.facts.averageExpenseKurus), zorunluGider: tl(s.profile?.essentialMonthlyKurus) } : {}),
    ...(share.goals ? { hizliKullanilabilirBirikim: tl(s.facts.liquidKurus), toplamVarlik: tl(s.facts.assetsKurus) } : {}),
    ...(share.debts ? { borclar: s.debts.map((d, i) => ({ borc: d.fixed ? 'Taksitler' : `Borç ${i + 1}`, bakiye: tl(d.balanceKurus), aylikFaizYuzde: d.monthlyRatePct, aylikOdeme: tl(d.minPaymentKurus) })) } : {}),
    ...(p && share.debts && share.goals && share.income
      ? {
          plan: {
            aylikPlanaAyrilan: tl(p.monthlyPlanKurus),
            tampon: tl(p.bufferKurus),
            borcsuzOlmaAy: p.payoff?.months ?? null,
            toplamFaiz: tl(p.payoff?.totalInterestKurus),
            acilDurumHedefi: tl(p.emergencyTargetKurus),
            acilDurumEksik: tl(p.emergencyGapKurus),
            asamalar: p.phases.map((x) => ({ asama: x.title, baslangicAyi: x.startMonth, bitisAyi: x.endMonth, aylik: tl(x.monthlyKurus) })),
            hedefBirikim: tl(p.goalKurus),
            hedefeKalanAyOrtaVarsayim: p.targetMonths,
          },
        }
      : {}),
    ...(share.goals && s.journey && s.profile
      ? {
          ozgurlukRotasi: {
            seviye: `${s.journey.level}/${s.journey.stages.length}`,
            tamamlananlar: s.journey.stages.filter((x) => x.done).map((x) => x.title),
            siradakiAsama: s.journey.current ? { ad: s.journey.current.title, olcut: s.journey.current.criterion, durum: s.journey.current.status, sonrakiAdim: s.journey.current.next } : null,
            ekOlcutler: s.journey.checks.map((c) => ({ ad: c.title, durum: c.done === null ? 'bilinmiyor' : c.done ? 'sağlanıyor' : 'sağlanmıyor' })),
            hedef: s.profile.goal === 'custom' && s.profile.goalName ? s.profile.goalName : s.profile.goal,
            hedefSuresiYil: s.profile.horizonYears,
            planBirimi: s.profile.base ?? 'TRY',
            gerekenBirikimTl: tl(s.journey.indicators.goalKurus),
            ilerlemeYuzde: Math.round(s.journey.indicators.goalRatio * 100),
            riskTutumu: s.profile.risk ?? null,
            acilFonHedefAy: s.journey.indicators.emergencyMonths,
            ...freedomSummary(s.journey.plan, s.settings.strategy, todayIso()),
          },
        }
      : {}),
    ...(share.budget && s.budget?.total ? { buDonemButce: { harcanan: tl(s.budget.total.spentKurus), limit: tl(s.budget.total.effectiveKurus) } } : {}),
  }
}

/** Koça gönderilen hafıza notları. */
export function coachMemoryText(s: CoachState): string[] {
  const label = { hedef: 'Hedef', tercih: 'Tercih', not: 'Not', sohbet: 'Önceki sohbetten' } as const
  return (s.settings.memory ?? []).map((m) => `${label[m.kind]}: ${m.text}`)
}

/** Özgürlük Rotası v2 alanları (koç özeti): yalnızca toplamlar ve tarihler; borç adları gönderilmez. */
export function freedomSummary(p: FreedomPlan, strategy: CoachSettings['strategy'], today: string) {
  const tl = (k: number | null | undefined) => (k == null ? null : Math.round(k / 100))
  const when = (m: number | null) => (m === null ? null : reachDateLabel(m, today))
  const [y, mo] = today.split('-').map(Number)
  return {
    hedefYas: p.targetAge,
    paraninYetmesiGerekenYas: p.lifeAge,
    hedefTarihi: `${MONTH_NAMES[mo - 1]} ${y + p.yearsToTarget}`,
    gerekenAylikBirikim: tl(p.requiredMonthlyKurus),
    mevcutAylikBirikim: tl(p.monthlySavingKurus),
    aylikFark: tl(p.gapKurus),
    tasarrufOraniYuzde: Math.round(p.savingRate * 100),
    hedefSermaye: { lean: tl(p.leanKurus), fi: tl(p.fiKurus), fat: tl(p.fatKurus) },
    bugunkuHizlaUlasmaYasi: p.reachAge === null ? null : Math.ceil(p.reachAge),
    beklenenSenaryo: { profil: p.risk.profile.label, hisseYuzde: Math.round(p.risk.profile.equity * 100), reelGetiriYuzde: p.risk.profile.realReturnPct, oynaklikYuzde: p.risk.profile.volatilityPct },
    riskToleransi: p.risk.tolerance === null ? null : RISK_PROFILES[p.risk.tolerance].label,
    riskKapasitesi: RISK_PROFILES[p.risk.capacity].label,
    cekimOraniOnerisi: p.withdrawal.recommendedPct,
    kullanilanCekimOrani: p.withdrawal.usedPct,
    coastFiTl: tl(p.coastKurus),
    coastGecildi: p.coastPassed,
    basariOlasiligiYuzde: Math.round(p.successRate * 100),
    basariNotu: 'Varsayıma dayalı benzetim; gerçek olasılık değildir.',
    borcStratejisi: strategy === 'avalanche' ? 'önce en yüksek faiz' : 'önce en küçük borç',
    borcsuzOlmaTarihi: p.debtFreeMonth === 0 ? 'borç yok' : when(p.debtFreeMonth),
    borcBitisTakvimi: p.debtEnds.map((d, i) => ({ borc: `Borç ${i + 1}`, bitis: when(d.month), serbestKalanTaksit: tl(d.freedKurus) })),
    duzenliOdemeBitisleri: p.recurringEnds.map((r) => ({ bitis: when(r.month), serbestKalan: tl(r.freedKurus) })),
    kaldiraclar: { tekBasinaYeterliEkBirikim: tl(p.levers.extraMonthlyKurus), tekBasinaYeterliHedefYas: p.levers.targetAge, tekBasinaYeterliHarcamaYuzde: p.levers.spendPct },
    gelecekHedef: { tlNominal: tl(p.future.tlNominalKurus), usd: p.future.usd, altinGr: p.future.goldGr, enflasyonVarsayimiYuzde: p.future.inflationPct },
  }
}
