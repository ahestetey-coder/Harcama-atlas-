import { ArrowLeft, ArrowRight, CalendarClock, MessageCircle, Plus, Sparkles, Trash2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, Card, Input, Segmented, Select, Spinner } from '../components/ui/primitives'
import { toUserMessage } from '../data/repository'
import { DEFAULT_LIFE_AGE } from '../domain/assumptions'
import { todayIso } from '../domain/dates'
import { monthlyEquivalent } from '../domain/income'
import { buildFreedomPlan, buildJourney, SPEND_GROUP_LABEL, SPEND_GROUPS, type BaseRates, type IncomeStability, type JourneyFacts, type JourneyProfile, type RiskStance, type SpendBreakdown, type SpendGroup } from '../domain/journey'
import { formatKurus, formatKurusCompact, formatKurusPlain, parseUserAmount } from '../domain/money'
import { estimate, estimateCapital, quickResult, reachRange, seedProfile, targetSplit, type WebTestLink } from '../domain/quickTest'
import { applySetup, clearRouteDraft, loadRouteDraft, saveRouteDraft, SETUP_DEBT_LABEL, type RouteSetupData, type SetupDebt, type SetupDebtType } from '../domain/routeSetup'
import { cn } from '../lib/cn'
import { useReducedMotion } from '../lib/hooks'
import { useAssets, useRepo, useSettings } from '../state/data'
import { usePlan } from '../state/plan'
import { useUi } from '../state/ui'
import { AssetEditor, type Editing } from './AssetsPage'
import { RecurringEditor, type Draft } from './PaymentsSection'
import { MoneyFlow } from './RouteSimulation'

/**
 * Rota kurulumu: Finansal Harita testinin tahmini rakamları 6 adımda gerçek rakamlarla değiştirilir.
 * Her alan testten ya da uygulamadaki kayıtlardan dolu gelir; üstteki özgürlük yılı her değişiklikte
 * yeniden hesaplanır. Bitince Finansal özgürlük sayfası bu rakamlarla kurulur.
 */

type Status = 'web' | 'test' | 'app' | 'ok'
type View = 'setup' | 'calc' | 'final'
const STEPS = [
  { key: 'gelir', title: 'Gelirin', lead: 'Testte gelir aralığı seçmiştin. Şimdi tam rakamı yaz.' },
  { key: 'gider', title: 'Giderlerin', lead: 'Ortalama bir ayı düşün. + ile gider türünü seç, tutarını yaz.' },
  { key: 'borc', title: 'Borçların', lead: 'Cevabına göre tahmini borç ekledik. Gerçek borçlarınla değiştir.' },
  { key: 'birikim', title: 'Birikimin', lead: 'Toplam birikimini varlık türlerine böldük. Bugünkü TL karşılıklarını düzelt.' },
  { key: 'hedef', title: 'Hedefin', lead: 'Hayalindeki pasif geliri testte seçtin. Yaşın ve süreyle tamamla.' },
  { key: 'son', title: 'Son birkaç soru', lead: 'Rotanın temposunu ve risk dengesini ayarlamak için.' },
  { key: 'ozgurluk', title: 'Özgürlük hedefin', lead: 'Hedefi verdiğin bilgilerden biz hesaplayalım ya da kendin yaz.' },
] as const

const K = 100
const year0 = new Date().getFullYear()
const yearAt = (m: number | null) => (m === null ? null : year0 + Math.ceil(m / 12))
const plainTl = (tl: number) => (tl ? formatKurusPlain(Math.round(tl) * K) : '')
const plainK = (k: number) => (k ? formatKurusPlain(k) : '')
/** Hoşgörülü okuma: boş ya da geçersizse 0. */
const soft = (s: string) => {
  if (!s.trim()) return 0
  const p = parseUserAmount(s)
  return p.ok && p.kurus >= 0 ? p.kurus : 0
}
const num = (s: string) => Number(s.replace(',', '.'))

interface ExpenseDraft {
  id: string
  group: SpendGroup
  amount: string
}
const newId = () => Math.random().toString(36).slice(2, 9)

/** Kayıtlı form değerini yalnızca türü varsayılanla aynıysa alır (eski ya da bozuk taslak formu bozmaz). */
function mergeForm<T extends Record<string, unknown>>(base: T, saved: Record<string, unknown> | undefined): T {
  if (!saved) return base
  const out = { ...base }
  for (const k of Object.keys(base) as Array<keyof T>) {
    const v = saved[k as string]
    if (v !== undefined && Array.isArray(v) === Array.isArray(base[k]) && typeof v === typeof base[k]) out[k] = v as T[keyof T]
  }
  return out
}

interface DebtDraft {
  type: SetupDebtType
  balance: string
  pay: string
  rate: string
}

/** Gider satırlarını kategorilere göre toplar. */
function spendOf(rows: ExpenseDraft[]): SpendBreakdown {
  const out = Object.fromEntries(SPEND_GROUPS.map((g) => [g, 0])) as SpendBreakdown
  for (const r of rows) out[r.group] += soft(r.amount)
  return out
}

/** facts: kurulum rakamları eklenmemiş uygulama verisi (useJourneyFacts({ withSetup: false })). */
export function RouteSetup({ link, facts, rates, onDone, onCancel }: { link: WebTestLink; facts: JourneyFacts; rates: BaseRates; onDone: () => void; onCancel: () => void }) {
  const repo = useRepo()
  const settings = useSettings()
  const { has } = usePlan()
  const { toast } = useUi()
  const reduced = useReducedMotion()
  const a = link.answers
  const web = useMemo(() => quickResult(a), [a])
  const seed = useMemo(() => seedProfile(a), [a])
  const est = useMemo(() => estimate(a), [a])
  const strategy = settings?.coach?.strategy ?? 'avalanche'

  const appSpend = facts.spendingByGroup && SPEND_GROUPS.some((g) => facts.spendingByGroup![g] > 0) ? facts.spendingByGroup : null
  const appDebts = facts.debtList ?? []
  const assets = useAssets()
  // Kredi/taksit/düzenli ödeme kurulumdan çıkmadan açılır pencerede eklenir; kayıt Borçlar ve ödemeler sayfasına düşer
  const [editing, setEditing] = useState<Editing>(null)
  const [payDraft, setPayDraft] = useState<Draft | null>(null)
  const addDebt = () => setEditing({ kind: 'debt', debtType: 'card' })
  const editDebt = (id: string) => {
    const asset = assets?.find((a) => a.id === id)
    if (asset) setEditing({ kind: 'debt', asset })
  }
  const appAssets = facts.hasAssets
  const recurringFixed = (facts.recurringList ?? []).filter((r) => !r.installment && r.remainingMonths === null).reduce((s, r) => s + r.monthlyKurus, 0)

  // Uygulamada tanımlı düzenli gelirler (maaş, kira, ek gelir) tahminin yerine geçer
  const appIncome = useMemo(() => {
    const out = { salary: 0, extra: 0, passive: 0 }
    for (const i of settings?.recurringIncomes ?? []) {
      if (!i.active) continue
      const m = monthlyEquivalent(i.amountKurus, i.cadence)
      if (i.kind === 'salary') out.salary += m
      else if (i.kind === 'rent') out.passive += m
      else out.extra += m
    }
    return out.salary + out.extra + out.passive > 0 ? out : null
  }, [settings?.recurringIncomes])

  // Yarıda kalan kurulum kaldığı yerden; "Testi yenile" son kurulumun rakamlarıyla açılır
  const [draft0] = useState(() => loadRouteDraft(link.code))
  const prevForm = settings?.journey?.setup?.form
  const [f, setF] = useState(() => {
    const cap = estimateCapital(a)
    const base = {
      income: appIncome ? plainK(appIncome.salary) : plainTl(est.incomeTl),
      extra: appIncome?.extra ? plainK(appIncome.extra) : '',
      passive: appIncome?.passive ? plainK(appIncome.passive) : '',
      stability: 'regular' as IncomeStability,
      dependents: '0',
      // Uygulamada harcama kaydı varsa gruplar ondan gelir; yoksa liste boş başlar, kişi + ile tür seçip tutar yazar
      expenses: appSpend
        ? SPEND_GROUPS.filter((g) => appSpend[g] > 0).map<ExpenseDraft>((g) => ({ id: newId(), group: g, amount: plainK(appSpend[g]) }))
        : [],
      // Testteki borç cevabı yalnızca tahmindir; kişi gerçek borcunu girmeden rotaya borç eklenmez
      debts: [] as DebtDraft[],
      emergency: plainTl(cap.mevduat),
      fx: plainTl(cap.doviz),
      gold: plainTl(cap.altin),
      funds: plainTl(cap.hisseFon),
      crypto: plainTl(cap.kripto),
      pension: plainTl(cap.bes),
      invest: plainTl(est.investTl),
      dream: plainTl(a.hayal),
      retire: '',
      goalMode: 'auto' as 'auto' | 'own',
      ownUsd: '',
      age: '',
      years: '15',
      drop: a.dusus,
      exp: (a.yatirim === 'her_ay' ? 'var' : a.yatirim === 'arasira' ? 'az' : 'yok') as 'yok' | 'az' | 'var',
    }
    return mergeForm(base, draft0?.form ?? prevForm)
  })
  type Key = keyof typeof f
  const [status, setStatus] = useState<Partial<Record<Key, Status>>>(() => draft0 ? (draft0.status as Partial<Record<Key, Status>>) : prevForm ? {} : ({
    income: appIncome ? 'app' : 'web',
    extra: appIncome ? 'app' : 'web',
    passive: appIncome ? 'app' : 'web',
    stability: 'web',
    dependents: 'web',
    expenses: appSpend ? 'app' : 'web',
    debts: appDebts.length ? 'app' : 'web',
    emergency: appAssets ? 'app' : 'web',
    invest: appAssets ? 'app' : 'web',
    dream: 'test',
    years: 'web',
    drop: 'test',
    exp: 'web',
  }))
  const set = <T extends Key>(k: T, v: (typeof f)[T]) => {
    setF((p) => ({ ...p, [k]: v }))
    setStatus((s) => (s[k] === 'ok' ? s : { ...s, [k]: 'ok' }))
  }
  const [step, setStep] = useState(() => Math.min(STEPS.length - 1, Math.max(0, draft0?.step ?? 0)))
  const [dir, setDir] = useState(1)
  const [view, setView] = useState<View>('setup')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<{ profile: JourneyProfile; facts: JourneyFacts } | null>(null)

  // Her değişiklik cihaza taslak olarak yazılır; başka sayfaya gidip dönünce kurulum buradan sürer
  useEffect(() => {
    if (view === 'setup') saveRouteDraft({ code: link.code, step, form: f, status: status as Record<string, string> })
  }, [f, status, step, view, link.code])

  const usdRate = rates.USD ?? null
  // ---- Taslak profil ve canlı hesap ----
  const draft = useMemo(() => {
    const spending = spendOf(f.expenses)
    const spendK = SPEND_GROUPS.reduce((s, g) => s + spending[g], 0)
    const split = targetSplit(soft(f.dream), spendK + recurringFixed)
    const ageN = Number(f.age) || undefined
    const years = Math.min(60, Math.max(1, Number(f.years) || 15))
    const dropScore = f.drop === 'sat' ? 1 : f.drop === 'al' ? 4 : 3
    const expScore = f.exp === 'var' ? 4 : f.exp === 'az' ? 2 : 1
    const mid = Math.round((dropScore + expScore) / 2)
    const riskAnswers = [dropScore, mid, expScore, mid, mid, mid]
    const risk: RiskStance = f.drop === 'sat' ? 'cautious' : f.drop === 'al' ? 'bold' : 'balanced'
    const setup: RouteSetupData = {
      debts: appDebts.length ? undefined : f.debts.map<SetupDebt>((d) => ({ type: d.type, balanceKurus: soft(d.balance), paymentKurus: soft(d.pay), monthlyRatePct: Math.min(20, Math.max(0, num(d.rate) || 0)) })).filter((d) => d.balanceKurus > 0),
      capital: appAssets
        ? undefined
        : { emergencyKurus: soft(f.emergency), fxKurus: soft(f.fx), goldKurus: soft(f.gold), fundsKurus: soft(f.funds), cryptoKurus: soft(f.crypto), pensionKurus: soft(f.pension), monthlyInvestKurus: soft(f.invest) },
      spendKurus: facts.averageExpenseKurus === null ? spendK + recurringFixed : undefined,
      form: f,
      at: todayIso(),
    }
    const profile: JourneyProfile = {
      goal: seed.goal,
      horizonYears: years,
      targetMonthlyExpenseKurus: soft(f.dream),
      monthlyIncomeKurus: soft(f.income) + soft(f.extra),
      essentialMonthlyKurus: spending.housing + spending.food + spending.transport + spending.bills + recurringFixed,
      incomeStability: f.stability,
      priorities: [],
      withdrawalRatePct: 3.5,
      celebrated: [],
      confirmedAt: '',
      age: ageN,
      dependents: Number(f.dependents) || 0,
      passiveIncomeKurus: soft(f.passive) || undefined,
      pensionIncomeKurus: soft(f.retire) || undefined,
      // Kendi hedefini dolarla yazan kişinin planı dolar bazında kurulur; bütün tutarlar $ ile gösterilir
      ...(f.goalMode === 'own' && usdRate && soft(f.ownUsd) > 0
        ? { base: 'USD' as const, baseRateTl: usdRate, customFiKurus: Math.round(soft(f.ownUsd) * usdRate) }
        : { base: 'TRY' as const }),
      targetAge: ageN ? ageN + years : undefined,
      lifeAge: DEFAULT_LIFE_AGE,
      spending,
      targetSpendPct: split.pct,
      annualBigSpendKurus: split.annualBigSpendKurus,
      riskAnswers,
      risk,
      setup,
    }
    return { profile, facts: applySetup(facts, setup) }
  }, [f, facts, recurringFixed, appDebts.length, appAssets, seed.goal, usdRate])
  const live = useMemo(() => buildJourney(draft.profile, draft.facts, rates, { strategy, runs: 0 }), [draft, rates, strategy])
  const liveYear = yearAt(live.indicators.route.mid)
  const webRange = reachRange(web)

  const check = (i: number): string | null => {
    if (i === 0 && soft(f.income) <= 0) return 'Aylık net gelirini yaz.'
    if (i === 0 && !(Number(f.dependents) >= 0 && Number(f.dependents) <= 20)) return 'Bakmakla yükümlü olduğun kişi sayısını 0–20 arası yaz.'
    if (i === 1 && f.expenses.reduce((s, r) => s + soft(r.amount), 0) <= 0) return 'En az bir gider ekle ve tutarını yaz.'
    if (i === 2) for (const d of f.debts) if (d.rate.trim() && !(num(d.rate) >= 0 && num(d.rate) <= 20)) return 'Aylık faiz %0 ile %20 arasında olmalı.'
    if (i === 4) {
      if (soft(f.dream) <= 0) return 'Aylık pasif gelir hedefini yaz.'
      const age = Number(f.age)
      if (!Number.isInteger(age) || age < 15 || age > 90) return 'Yaşını 15 ile 90 arasında yaz.'
      const y = Number(f.years)
      if (!Number.isInteger(y) || y < 1 || age + y > 100) return 'Süre en az 1 yıl olmalı ve hedef yaşın 100\'ü geçmemeli.'
    }
    if (i === 6 && f.goalMode === 'own') {
      if (!usdRate) return 'Dolar kuru henüz alınamadı; biraz sonra tekrar dene ya da otomatik hedefi seç.'
      if (soft(f.ownUsd) <= 0) return 'Hedef tutarını dolar olarak yaz.'
    }
    return null
  }
  const confirmStep = () => {
    const keys: Record<number, Key[]> = { 0: ['income', 'extra', 'passive', 'stability', 'dependents'], 1: ['expenses'], 2: ['debts'], 3: ['emergency', 'invest'], 4: ['years', 'retire'], 5: ['exp'] }
    setStatus((s) => {
      const n = { ...s }
      for (const k of keys[step] ?? []) if (n[k] === 'web') n[k] = 'ok'
      return n
    })
  }
  const next = () => {
    const e = check(step)
    if (e) return setError(e)
    setError(undefined)
    confirmStep()
    if (step < STEPS.length - 1) {
      setDir(1)
      setStep(step + 1)
    } else void save()
  }
  const back = () => {
    setError(undefined)
    if (step === 0) {
      clearRouteDraft()
      return onCancel()
    }
    setDir(-1)
    setStep(step - 1)
  }

  const save = async () => {
    for (let i = 0; i < STEPS.length; i++) {
      const e = check(i)
      if (e) {
        setStep(i)
        return setError(e)
      }
    }
    const full = buildFreedomPlan(draft.profile, draft.facts, { rates, strategy, runs: 0 })
    const profile: JourneyProfile = {
      ...draft.profile,
      targetMonthlyExpenseKurus: full.targetMonthlyKurus,
      withdrawalRatePct: full.withdrawal.recommendedPct,
      confirmedAt: new Date().toISOString(),
      tests: [...(settings?.journey?.setup ? (settings.journey.tests ?? []) : []), todayIso()],
    }
    setView('calc')
    setBusy(true)
    try {
      await repo.saveSettings({ journey: profile, webTest: { ...link, refinedAt: new Date().toISOString() } })
      clearRouteDraft()
      setSaved({ profile, facts: draft.facts })
      toast('Rotan kuruldu.')
      setTimeout(() => setView('final'), reduced ? 0 : 1200)
    } catch (e) {
      setView('setup')
      setError(toUserMessage(e))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' })
  }, [step, view, reduced])

  if (view === 'calc')
    return (
      <Card className="flex flex-col items-center gap-4 p-8 text-center" aria-live="polite">
        <Spinner />
        <h2 className="font-display text-xl font-bold text-ink">Rotan gerçek rakamlarınla yeniden çiziliyor</h2>
        <p className="text-[13.5px] text-muted">Borç sırası, acil fon hedefi ve yatırım temposu hesaplanıyor.</p>
      </Card>
    )
  if (view === 'final' && saved) return <Final saved={saved} rates={rates} webRange={webRange} webGoal={web.goalKurus} webLevel={web.level} name={link.name} onDone={onDone} onEdit={() => setView('setup')} canJourney={has('journey')} canCoach={has('aiCoach')} />

  const s = STEPS[step]
  const badge = (k: Key) => <StatusBadge s={status[k] ?? 'ok'} />
  const money = (k: Key, label: string, hint?: string) => (
    <MoneyField id={`rs-${k}`} label={label} hint={hint} badge={badge(k)} value={f[k] as string} onChange={(v) => set(k, v as never)} />
  )
  return (
    <Card className="overflow-hidden p-5" aria-label="Rota kurulumu">
      <ol className="grid grid-cols-7 gap-1" aria-label="Kurulum adımları">
        {STEPS.map((x, i) => (
          <li key={x.key} aria-current={i === step ? 'step' : undefined} aria-label={x.title}>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <motion.div className="h-full rounded-full bg-amber-500" initial={false} animate={{ width: i <= step ? '100%' : '0%' }} transition={{ duration: reduced ? 0 : 0.3 }} />
            </div>
          </li>
        ))}
      </ol>
      <div className="sticky top-0 z-10 mt-3 flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px]" aria-live="polite">
        <span className="flex items-center gap-2 text-muted">
          <span className="size-2 rounded-full bg-accent" aria-hidden /> Canlı özgürlük yılın
        </span>
        <span className="flex items-baseline gap-2">
          <span className="text-[12.5px] text-subtle">{webRange ?? '—'} →</span>
          <span className="num font-display text-lg font-bold text-amber-600 dark:text-amber-400">{liveYear ?? 'Görünmüyor'}</span>
        </span>
      </div>

      <AnimatePresence mode="wait" initial={false} custom={dir}>
        <motion.div key={step} custom={dir} initial={reduced ? false : { opacity: 0, x: 24 * dir }} animate={{ opacity: 1, x: 0 }} exit={reduced ? undefined : { opacity: 0, x: -24 * dir }} transition={{ duration: 0.22 }}>
          <div className="mt-5">
            <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-muted">
              Adım {step + 1} / {STEPS.length}
            </p>
            <h2 className="mt-1 font-display text-2xl font-bold text-ink">{s.title}</h2>
            <p className="mt-1 text-[13.5px] text-muted">{s.key === 'borc' && appDebts.length ? 'Borçların uygulamadaki Borçlar sayfasından geldi.' : s.key === 'birikim' && appAssets ? 'Birikimin Yatırımlarım sayfasından geldi.' : s.key === 'gider' && appSpend ? 'Giderin son aylardaki harcama kayıtlarından hesaplandı.' : s.lead}</p>
          </div>
          <div className="mt-4 flex flex-col gap-4">
            {s.key === 'gelir' && (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {money('income', 'Aylık net ana gelir')}
                  {money('extra', 'Aylık ek gelir', 'Serbest iş, prim, yan gelir')}
                </div>
                {money('passive', 'Çalışmadan gelen aylık gelir', 'Kira, faiz, temettü')}
                <ChipField label="Gelirin ne kadar düzenli?" badge={badge('stability')}>
                  <Segmented<IncomeStability>
                    label="Gelir düzeni"
                    value={f.stability}
                    onChange={(v) => set('stability', v)}
                    options={[
                      { value: 'regular', label: 'Sabit' },
                      { value: 'variable', label: 'Dalgalı' },
                      { value: 'irregular', label: 'Düzensiz' },
                    ]}
                  />
                </ChipField>
                <CountField id="rs-dep" label="Bakmakla yükümlü olduğun kişi" badge={badge('dependents')} value={f.dependents} onChange={(v) => set('dependents', v)} />
              </>
            )}
            {s.key === 'gider' && (
              <>
                <ExpensesEditor rows={f.expenses} badge={badge('expenses')} onChange={(r) => set('expenses', r)} extraKurus={appDebts.reduce((s, d) => s + d.minPaymentKurus, 0) + (facts.recurringList ?? []).reduce((s, r) => s + r.monthlyKurus, 0)} />
                <AppPayments debts={appDebts} recurring={facts.recurringList ?? []} onAddDebt={addDebt} onAddPayment={() => setPayDraft({ kind: 'installment' })} />
                <p className="flex items-center gap-2 text-[12.5px] text-muted">
                  <CalendarClock className="size-4 shrink-0 text-accent" /> Harcamalarını girdikçe bu rakamlar uygulamadaki kayıtlarından güncellenir.
                </p>
              </>
            )}
            {s.key === 'borc' &&
              (appDebts.length ? (
                <ul className="flex flex-col gap-2">
                  {appDebts.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-[13.5px]">
                      <button type="button" onClick={() => editDebt(d.id)} className="min-w-0 truncate text-left font-medium text-ink hover:text-accent hover:underline">
                        {d.name}
                      </button>
                      <span className="num shrink-0 text-muted">
                        {formatKurusCompact(d.balanceKurus)} · {formatKurusCompact(d.minPaymentKurus)}/ay
                      </span>
                    </li>
                  ))}
                  <li className="flex flex-wrap items-center gap-2">
                    <StatusBadge s="app" />
                    <button type="button" onClick={addDebt} className="inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline">
                      <Plus className="size-4" /> Borç ekle
                    </button>
                  </li>
                </ul>
              ) : (
                <>
                  <DebtsEditor debts={f.debts} badge={badge('debts')} onChange={(d) => set('debts', d)} hint={est.debts.length > 0 && !f.debts.length} />
                  <button type="button" onClick={addDebt} className="text-left text-[13px] font-medium text-accent hover:underline">
                    Kredini ya da kart borcunu kayıtlı borç olarak ekle; Borçlar ve ödemeler sayfasına da işlenir
                  </button>
                </>
              ))}
            {s.key === 'birikim' &&
              (appAssets ? (
                <div className="grid grid-cols-2 gap-3 rounded-xl border border-line bg-surface-2 p-4 text-[13px]">
                  <div>
                    <div className="text-muted">Toplam birikim</div>
                    <div className="num text-[16px] font-semibold text-ink">{formatKurusCompact(facts.assetsKurus)}</div>
                  </div>
                  <div>
                    <div className="text-muted">Hızlı kullanılabilir</div>
                    <div className="num text-[16px] font-semibold text-ink">{formatKurusCompact(facts.liquidKurus)}</div>
                  </div>
                  <div className="col-span-2 flex items-center gap-2">
                    <StatusBadge s="app" />
                    <Link to="/yatirimlar" className="font-medium text-accent hover:underline">
                      Yatırımlarım'da düzenle
                    </Link>
                  </div>
                </div>
              ) : (
                <>
                  {money('emergency', 'Acil durum fonu', 'Hemen ulaşabildiğin nakit ve mevduat')}
                  <div className="grid grid-cols-2 gap-3">
                    <MoneyField id="rs-fx" label="Döviz" value={f.fx} onChange={(v) => set('fx', v)} />
                    <MoneyField id="rs-gold" label="Altın" value={f.gold} onChange={(v) => set('gold', v)} />
                    <MoneyField id="rs-funds" label="Hisse ve fon" value={f.funds} onChange={(v) => set('funds', v)} />
                    <MoneyField id="rs-crypto" label="Kripto" value={f.crypto} onChange={(v) => set('crypto', v)} />
                    <MoneyField id="rs-bes" label="BES" value={f.pension} onChange={(v) => set('pension', v)} />
                  </div>
                  {money('invest', 'Her ay düzenli yatırıma ayırdığın')}
                </>
              ))}
            {s.key === 'hedef' && (
              <>
                {money('dream', 'Aylık pasif gelir hedefi', 'Bugünün parasıyla, çalışmadan karşılanacak aylık yaşam')}
                <div className="grid grid-cols-2 gap-3">
                  <CountField id="rs-age" label="Yaşın" badge={f.age ? undefined : <Badge tone="danger">Eksik</Badge>} value={f.age} onChange={(v) => set('age', v)} placeholder="Örn. 32" />
                  <CountField id="rs-years" label="Kaç yılda varmak istersin?" badge={badge('years')} value={f.years} onChange={(v) => set('years', v)} />
                </div>
                {money('retire', 'Beklenen aylık emekli maaşı', 'Hedefe vardığında alacağın SGK ya da BES, bugünün parasıyla. Bu tutar birikimden çekilmez, hedef küçülür. Bilmiyorsan boş bırak.')}
              </>
            )}
            {s.key === 'ozgurluk' && (
              <>
                <ChipField label="Hedefini nasıl belirleyelim?">
                  <Segmented
                    label="Hedef türü"
                    value={f.goalMode}
                    onChange={(v) => set('goalMode', v)}
                    options={[
                      { value: 'auto', label: 'Otomatik' },
                      { value: 'own', label: 'Kendim yazacağım' },
                    ]}
                  />
                </ChipField>
                {f.goalMode === 'auto' ? (
                  <p className="rounded-xl bg-surface-2 px-3.5 py-3 text-[13.5px] text-ink">
                    Verdiğin bilgilere göre bağımsızlık hedefin{' '}
                    <span className="num font-semibold">{usdRate ? `${Math.round(live.plan.suggestedFiKurus / 100 / usdRate).toLocaleString('tr-TR')} $` : formatKurusCompact(live.plan.suggestedFiKurus)}</span>.
                  </p>
                ) : (
                  <MoneyField id="rs-ownUsd" unit="$" label="Bağımsızlık hedefin" hint="Bu tutara göre ara adımlar, Lean FI (%70) ve Fat FI (%150) hesaplanır; sayfa dolar bazında hazırlanır." value={f.ownUsd} onChange={(v) => set('ownUsd', v)} autoFocus />
                )}
              </>
            )}
            {s.key === 'son' && (
              <>
                <ChipField label="Yatırımın bir ayda %20 düşse ne yaparsın?" badge={badge('drop')}>
                  <Segmented
                    label="Düşüşte tepkin"
                    value={f.drop}
                    onChange={(v) => set('drop', v)}
                    options={[
                      { value: 'sat', label: 'Satarım' },
                      { value: 'bekle', label: 'Beklerim' },
                      { value: 'al', label: 'Alırım' },
                    ]}
                  />
                </ChipField>
                <ChipField label="Yatırım tecrüben" badge={badge('exp')}>
                  <Segmented
                    label="Yatırım tecrüben"
                    value={f.exp}
                    onChange={(v) => set('exp', v)}
                    options={[
                      { value: 'yok', label: 'Yok' },
                      { value: 'az', label: 'Biraz' },
                      { value: 'var', label: 'Deneyimliyim' },
                    ]}
                  />
                </ChipField>
              </>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      {error && (
        <p className="mt-4 text-[13px] text-danger" role="alert">
          {error}
        </p>
      )}
      <div className="sticky bottom-0 mt-5 grid grid-cols-[auto_1fr] gap-2 bg-surface pt-3">
        <Button variant="secondary" size="lg" onClick={back} icon={<ArrowLeft className="size-4" />}>
          Geri
        </Button>
        <Button variant="primary" size="lg" onClick={next} loading={busy} icon={<ArrowRight className="size-4" />} className="flex-row-reverse">
          {step === STEPS.length - 1 ? 'Rotamı hesapla' : 'Onayla ve devam'}
        </Button>
      </div>
      <AssetEditor editing={editing} onClose={() => setEditing(null)} />
      <RecurringEditor draft={payDraft} onClose={() => setPayDraft(null)} />
    </Card>
  )
}

function StatusBadge({ s }: { s: Status }) {
  if (s === 'web') return <Badge tone="warning">Tahmini</Badge>
  if (s === 'test') return <Badge tone="neutral">Testten</Badge>
  if (s === 'app') return <Badge tone="info">Uygulamadan</Badge>
  return <Badge tone="accent">Onaylı</Badge>
}

function Label({ htmlFor, label, badge }: { htmlFor?: string; label: string; badge?: ReactNode }) {
  return (
    <span className="flex items-center justify-between gap-2 text-[13.5px] font-medium text-ink">
      {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span>{label}</span>}
      {badge}
    </span>
  )
}

function MoneyField({ id, label, hint, badge, value, onChange, autoFocus, unit = 'TL' }: { id: string; label: string; hint?: string; badge?: ReactNode; value: string; onChange: (v: string) => void; autoFocus?: boolean; unit?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id} label={label} badge={badge} />
      <span className="relative block">
        <Input id={id} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0" className="num pr-10" autoFocus={autoFocus} />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12.5px] text-subtle">{unit}</span>
      </span>
      {hint && <span className="text-[12px] text-muted">{hint}</span>}
    </div>
  )
}

function CountField({ id, label, badge, value, onChange, placeholder }: { id: string; label: string; badge?: ReactNode; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id} label={label} badge={badge} />
      <Input id={id} inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder={placeholder ?? '—'} className="num" />
    </div>
  )
}

function ChipField({ label, badge, children }: { label: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label label={label} badge={badge} />
      {children}
    </div>
  )
}

/** Giderler: "+" ile kategori seçilir, tutar yazılır; satırlar toplanır. Aynı kategori birden çok kez eklenebilir. */
function ExpensesEditor({ rows, badge, onChange, extraKurus }: { rows: ExpenseDraft[]; badge: ReactNode; onChange: (r: ExpenseDraft[]) => void; extraKurus: number }) {
  const [picking, setPicking] = useState(false)
  const [fresh, setFresh] = useState<string | null>(null)
  const total = rows.reduce((s, r) => s + soft(r.amount), 0) + extraKurus
  const add = (group: SpendGroup) => {
    const id = newId()
    setFresh(id)
    setPicking(false)
    onChange([...rows, { id, group, amount: '' }])
  }
  return (
    <div className="flex flex-col gap-3">
      <Label label="Aylık giderlerin" badge={badge} />
      <ul className="flex flex-col gap-2" aria-label="Giderler">
        {rows.map((r) => (
          <li key={r.id} className="grid grid-cols-[1fr_auto] items-end gap-2 rounded-xl border border-line bg-surface-2 p-3">
            <MoneyField id={`rs-e-${r.id}`} label={SPEND_GROUP_LABEL[r.group]} value={r.amount} autoFocus={r.id === fresh} onChange={(v) => onChange(rows.map((x) => (x.id === r.id ? { ...x, amount: v } : x)))} />
            <Button variant="ghost" size="sm" className="text-danger" aria-label={`${SPEND_GROUP_LABEL[r.group]} giderini sil`} icon={<Trash2 className="size-4" />} onClick={() => onChange(rows.filter((x) => x.id !== r.id))} />
          </li>
        ))}
      </ul>
      {picking ? (
        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-line-strong p-3">
          <span className="text-[12.5px] font-medium text-muted">Hangi gider?</span>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Gider kategorisi">
            {SPEND_GROUPS.map((g) => (
              <button key={g} type="button" onClick={() => add(g)} className="rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] font-medium text-ink hover:border-accent hover:text-accent">
                {SPEND_GROUP_LABEL[g]}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => setPicking(true)}>
          Gider ekle
        </Button>
      )}
      <div className="flex items-center justify-between rounded-xl bg-accent-soft px-3.5 py-2.5 text-[13.5px]" aria-live="polite">
        <span className="font-medium text-ink">Toplam aylık gider</span>
        <span className="num font-display text-lg font-bold text-ink">{formatKurus(total)}</span>
      </div>
    </div>
  )
}

/**
 * Krediler, kart taksitleri ve düzenli ödemeler uygulamadaki Borçlar ve ödemeler sayfasından gelir.
 * Kişi oraya gidip ekler; dönünce kurulum kaldığı yerden sürer ve eklenenler burada otomatik görünür.
 */
function AppPayments({ debts, recurring, onAddDebt, onAddPayment }: { debts: Array<{ id: string; name: string; minPaymentKurus: number }>; recurring: Array<{ name: string; monthlyKurus: number; installment: boolean }>; onAddDebt: () => void; onAddPayment: () => void }) {
  const lines = [...debts.map((d) => ({ key: d.id, name: d.name, kurus: d.minPaymentKurus, tag: 'Borç' })), ...recurring.map((r, i) => ({ key: `r${i}`, name: r.name, kurus: r.monthlyKurus, tag: r.installment ? 'Taksit' : 'Düzenli' }))]
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line p-3.5" aria-label="Kredi, taksit ve düzenli ödemeler" role="group">
      <span className="text-[13.5px] font-medium text-ink">Kredi, taksit ve düzenli ödemeler</span>
      {lines.length ? (
        <ul className="flex flex-col gap-1.5">
          {lines.map((l) => (
            <li key={l.key} className="flex items-center justify-between gap-3 text-[13px]">
              <span className="flex min-w-0 items-center gap-2">
                <Badge tone="info">{l.tag}</Badge>
                <span className="truncate text-ink">{l.name}</span>
              </span>
              <span className="num shrink-0 text-muted">{formatKurusCompact(l.kurus)}/ay</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12.5px] text-muted">Kredilerini, kart taksitlerini ve düzenli ödemelerini buradan ekle; Borçlar ve ödemeler sayfasına da işlenir.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onAddDebt} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-line-strong bg-surface px-3.5 text-[13px] font-semibold text-ink hover:bg-surface-2">
          <Plus className="size-4" /> Kredi / kart borcu ekle
        </button>
        <button type="button" onClick={onAddPayment} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-line-strong bg-surface px-3.5 text-[13px] font-semibold text-ink hover:bg-surface-2">
          <Plus className="size-4" /> Taksit / düzenli ödeme ekle
        </button>
      </div>
    </div>
  )
}

function DebtsEditor({ debts, badge, onChange, hint }: { debts: DebtDraft[]; badge: ReactNode; onChange: (d: DebtDraft[]) => void; hint?: boolean }) {
  const upd = (i: number, p: Partial<DebtDraft>) => onChange(debts.map((d, j) => (j === i ? { ...d, ...p } : d)))
  return (
    <div className="flex flex-col gap-3">
      <Label label={debts.length ? `${debts.length} borç` : 'Borç yok'} badge={badge} />
      {hint && <p className="rounded-xl bg-warning-soft px-3 py-2 text-[13px] text-ink">Testte taksitlerin olduğunu söyledin. Kalan borcunu ve taksitini eklersen kapatma sırası ve borçsuzluk tarihin çıkar; eklemezsen rota borçsuz hesaplanır.</p>}
      {debts.map((d, i) => (
        <div key={i} className="grid grid-cols-2 gap-2 rounded-xl border border-line bg-surface-2 p-3">
          <label className="col-span-2 flex flex-col gap-1 text-[12px] font-medium text-muted">
            Tür
            <Select value={d.type} onChange={(e) => upd(i, { type: e.target.value as SetupDebtType })}>
              {(Object.keys(SETUP_DEBT_LABEL) as SetupDebtType[]).map((t) => (
                <option key={t} value={t}>
                  {SETUP_DEBT_LABEL[t]}
                </option>
              ))}
            </Select>
          </label>
          <MoneyField id={`rs-d${i}-bal`} label="Kalan" value={d.balance} onChange={(v) => upd(i, { balance: v })} />
          <MoneyField id={`rs-d${i}-pay`} label="Aylık taksit" value={d.pay} onChange={(v) => upd(i, { pay: v })} />
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={`rs-d${i}-rate`} label="Aylık faiz %" />
            <Input id={`rs-d${i}-rate`} inputMode="decimal" value={d.rate} onChange={(e) => upd(i, { rate: e.target.value })} placeholder="0" className="num" />
          </div>
          <div className="flex items-end">
            <Button variant="ghost" size="sm" className="text-danger" icon={<Trash2 className="size-4" />} onClick={() => onChange(debts.filter((_, j) => j !== i))}>
              Sil
            </Button>
          </div>
        </div>
      ))}
      <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => onChange([...debts, { type: 'loan', balance: '', pay: '', rate: '' }])}>
        Borç ekle
      </Button>
    </div>
  )
}

function Final({
  saved,
  rates,
  webRange,
  webGoal,
  webLevel,
  name,
  onDone,
  onEdit,
  canJourney,
  canCoach,
}: {
  saved: { profile: JourneyProfile; facts: JourneyFacts }
  rates: BaseRates
  webRange: string | null
  webGoal: number
  webLevel: number
  name?: string
  onDone: () => void
  onEdit: () => void
  canJourney: boolean
  canCoach: boolean
}) {
  const strategy = useSettings()?.coach?.strategy ?? 'avalanche'
  const j = useMemo(() => buildJourney(saved.profile, saved.facts, rates, { strategy, runs: 0 }), [saved, rates, strategy])
  const year = yearAt(j.indicators.route.mid)
  const cur = j.current
  const total = j.stages.length
  const rows: Array<[string, string, string, boolean?]> = [
    ['Özgürlük yılı', webRange ?? '—', year ? String(year) : 'Görünmüyor', true],
    ['Gereken birikim', formatKurusCompact(webGoal), formatKurusCompact(j.indicators.goalKurus)],
    ['Seviye', `${webLevel}/${total}`, `${j.level}/${total}${cur ? ` · ${cur.title}` : ''}`],
  ]
  const first = name?.trim().split(' ')[0]
  const msg = `${first ? `Merhaba ${first}. ` : ''}Haritan artık gerçek rakamlarınla çizildi. ${year ? `Bu tempoyla özgürlük yılın ${year}. ` : ''}${cur ? `Şu an ${cur.title} durağındasın; ilk hedefimiz: ${cur.goal.charAt(0).toLocaleLowerCase('tr-TR')}${cur.goal.slice(1)}.` : 'Rotan tamam; birikimini koru ve güvenli çekim planı yap.'}`
  return (
    <Card className="flex flex-col gap-5 p-5 sm:p-6" aria-label="Netleşen haritan">
      <div>
        <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-muted">Rota kurulumu tamam</p>
        <h2 className="mt-1 font-display text-3xl font-extrabold text-ink">Haritan netleşti.</h2>
      </div>
      <div className="overflow-hidden rounded-2xl border border-line">
        {rows.map(([k, from, to, hl]) => (
          <div key={k} className={cn('grid grid-cols-[1fr_auto_auto_auto] items-baseline gap-2 border-t border-line px-3.5 py-2.5 text-[13.5px] first:border-t-0', hl && 'bg-amber-500/10')}>
            <span className="text-ink">{k}</span>
            <span className="num text-[12.5px] text-subtle line-through decoration-line">{from}</span>
            <span className="text-subtle">→</span>
            <span className={cn('num font-display font-bold', hl ? 'text-lg text-amber-600 dark:text-amber-400' : 'text-ink')}>{to}</span>
          </div>
        ))}
      </div>
      <p className="-mt-3 text-[12.5px] text-muted">Sol taraf testteki tahmin, sağ taraf gerçek rakamlarınla hesaplanan değer.</p>
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-cyan-500 to-emerald-500 text-white">
          <MessageCircle className="size-4" />
        </span>
        <div className="rounded-2xl rounded-tl-sm border border-line bg-surface-2 px-3.5 py-2.5 text-[13.5px] text-ink">
          <div className="font-semibold">Koçun</div>
          {msg}
        </div>
      </div>
      <MoneyFlow profile={saved.profile} facts={saved.facts} j={j} />
      <div className="flex flex-col gap-2">
        <Button variant="primary" size="lg" onClick={onDone} icon={<ArrowRight className="size-4" />} className="flex-row-reverse">
          {canJourney ? 'Finansal özgürlük sayfama git' : 'Rotamı gör'}
        </Button>
        {canCoach ? (
          <Link to="/koc" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface text-sm font-semibold text-ink hover:bg-surface-2">
            <MessageCircle className="size-4" /> Koçumla başla
          </Link>
        ) : (
          !canJourney && (
            <Link to="/paketler" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent-soft text-sm font-semibold text-accent-strong dark:text-accent">
              <Sparkles className="size-4" /> Tam rota ve koç Plus+'ta
            </Link>
          )
        )}
        <Button variant="ghost" onClick={onEdit}>
          Rakamlarımı tekrar düzenle
        </Button>
      </div>
    </Card>
  )
}
