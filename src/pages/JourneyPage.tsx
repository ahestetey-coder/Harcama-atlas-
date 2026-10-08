import { ArrowLeft, ArrowRight, CheckCircle2, CircleDashed, CircleX, ClipboardCheck, CreditCard, Flag, Info, RotateCcw, ShieldCheck, Sparkles, Target, TrendingUp, Wallet } from 'lucide-react'
import { animate, AnimatePresence, motion } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/AppShell'
import { PlanBadge, PlanGate } from '../components/PlanGate'
import { Alert, Badge, Button, Card, Field, Input, Segmented, Select } from '../components/ui/primitives'
import { toUserMessage } from '../data/repository'
import { holdingSummary, portfolio } from '../domain/assets'
import { currentPeriod, periodLabel, todayIso } from '../domain/dates'
import {
  BASE_LABEL,
  buildJourney,
  DEFAULT_WITHDRAWAL_PCT,
  DTI_LIMIT,
  formatInBase,
  HEALTH_LABEL,
  HOUSING_LABEL,
  JOURNEY_GOAL_LABEL,
  PENSION_LABEL,
  rebase,
  RISK_LABEL,
  SCENARIOS,
  STABILITY_LABEL,
  TESTS_PER_MONTH,
  testsLeft,
  type BaseRates,
  type HealthCover,
  type Housing,
  type IncomeStability,
  type JourneyFacts,
  type JourneyGoal,
  type JourneyProfile,
  type JourneyResult,
  type Pension,
  type PlanBase,
  type RiskStance,
  type Stage,
  type StageId,
} from '../domain/journey'
import { formatKurus, formatKurusPlain, parseUserAmount } from '../domain/money'
import { addMonthsClamped } from '../domain/recurring'
import { summarizeMonth } from '../domain/summary'
import { cn } from '../lib/cn'
import { useReducedMotion } from '../lib/hooks'
import { useInstallmentDebt, useJourneyFacts } from '../state/budget'
import { usePersonalCycle } from '../state/cycle'
import { useAssets, useCategories, useRepo, useSettings } from '../state/data'
import { useLiveState } from '../state/livePrices'
import { usePersonalTransactions } from '../state/personal'
import { useUi } from '../state/ui'

export default function JourneyPage() {
  return (
    <div>
      <PageHeader
        title="Finansal Özgürlük Yolculuğum"
        subtitle={
          <span className="inline-flex items-center gap-2">
            <PlanBadge plan="plusplus" /> Yatırımlarınız, borçlarınız ve bu ayki bütçenizle kişisel rota
          </span>
        }
      />
      <PlanGate
        feature="journey"
        title="Finansal Özgürlük Yolculuğum"
        points={[
          'Finansal özgürlük testiyle hedefinizi, güvencelerinizi ve risk tutumunuzu belirleyin; ayda iki kez yenileyebilirsiniz',
          'Uzman ölçütlerine dayanan 8 seviyeli rota: denge, başlangıç fonu, borçsuzluk, acil fon, düzenli birikim, güvence, bağımsızlık, özgürlük',
          'Planınızı TL, USD ya da gram altın bazında izleyin',
          'Yatırımlarım, Borçlarım ve bu ayın gelir-giderini tek yerden görün',
        ]}
      >
        <JourneyContent />
      </PlanGate>
    </div>
  )
}

/** Plan birimi için güncel kurlar: canlı fiyat, yoksa planın sabitlendiği kur. */
function useBaseRates(profile: JourneyProfile | undefined): BaseRates {
  const live = useLiveState()
  const usd = live.usd?.valueTl ?? (profile?.base === 'USD' ? profile.baseRateTl : null)
  const gold = live.goldGram?.valueTl ?? (profile?.base === 'XAU' ? profile.baseRateTl : null)
  return useMemo(() => ({ USD: usd ?? null, XAU: gold ?? null }), [usd, gold])
}

function JourneyContent() {
  const settings = useSettings()
  const facts = useJourneyFacts()
  const [testing, setTesting] = useState(false)
  const rates = useBaseRates(settings?.journey)
  if (!settings || !facts) return null
  const profile = settings.journey
  if (!profile || testing) return <FreedomTest facts={facts} rates={rates} initial={profile} onDone={() => setTesting(false)} onCancel={profile ? () => setTesting(false) : undefined} />
  return <Dashboard profile={profile} facts={facts} rates={rates} onRetake={() => setTesting(true)} />
}

// ---------- Finansal özgürlük testi ----------

const STEPS = ['Siz ve haneniz', 'Gelir', 'Giderler', 'Güvenceler', 'Hedef ve plan birimi'] as const

function FreedomTest({ facts, rates, initial, onDone, onCancel }: { facts: JourneyFacts; rates: BaseRates; initial?: JourneyProfile; onDone: () => void; onCancel?: () => void }) {
  const repo = useRepo()
  const settings = useSettings()
  const categories = useCategories()
  const { toast } = useUi()
  const reduced = useReducedMotion()
  const today = todayIso()
  const left = testsLeft(initial, today)
  const plain = (k: number | null | undefined) => (k ? formatKurusPlain(k) : '')
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)
  const [f, setF] = useState(() => ({
    age: initial?.age ? String(initial.age) : '',
    dependents: String(initial?.dependents ?? 0),
    housing: initial?.housing ?? ('rent' as Housing),
    income: plain(initial?.monthlyIncomeKurus),
    stability: initial?.incomeStability ?? ('regular' as IncomeStability),
    passive: plain(initial?.passiveIncomeKurus),
    essential: plain(initial?.essentialMonthlyKurus ?? (facts.recurringMonthlyKurus || null)),
    target: plain(initial?.targetMonthlyExpenseKurus ?? facts.averageExpenseKurus),
    priorities: initial?.priorities ?? [],
    health: initial?.health ?? ('public' as HealthCover),
    pension: initial?.pension ?? ('sgk' as Pension),
    risk: initial?.risk ?? ('balanced' as RiskStance),
    goal: initial?.goal ?? ('independence' as JourneyGoal),
    goalName: initial?.goalName ?? '',
    horizon: String(initial?.horizonYears ?? 15),
    base: initial?.base ?? ('TRY' as PlanBase),
    withdrawal: String(initial?.withdrawalRatePct ?? DEFAULT_WITHDRAWAL_PCT).replace('.', ','),
  }))
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }))
  const fromApp = (has: boolean) => (has ? <Badge tone="accent">Uygulamadan</Badge> : <Badge tone="warning">Eksik</Badge>)

  const money = (s: string, label: string, optional = false) => {
    if (optional && !s.trim()) return 0
    const p = parseUserAmount(s)
    if (!p.ok || p.kurus < 0 || (!optional && p.kurus === 0)) throw new Error(`${label} için geçerli bir tutar girin.`)
    return p.kurus
  }
  /** Adımı doğrular; hata varsa mesajı döner. */
  const check = (i: number): string | null => {
    try {
      if (i === 0) {
        const age = Number(f.age)
        if (!Number.isInteger(age) || age < 15 || age > 100) return 'Yaşınızı 15 ile 100 arasında girin.'
        const d = Number(f.dependents)
        if (!Number.isInteger(d) || d < 0 || d > 20) return 'Bakmakla yükümlü olduğunuz kişi sayısını girin (0 olabilir).'
      }
      if (i === 1) {
        money(f.income, 'Aylık net gelir')
        money(f.passive, 'Pasif gelir', true)
      }
      if (i === 2) {
        money(f.essential, 'Zorunlu giderler')
        money(f.target, 'Hedefteki aylık yaşam gideri')
      }
      if (i === 4) {
        const h = Number(f.horizon)
        if (!Number.isInteger(h) || h < 1 || h > 60) return 'Hedef süresi 1 ile 60 yıl arasında olmalı.'
        const w = Number(f.withdrawal.replace(',', '.'))
        if (!Number.isFinite(w) || w < 0.5 || w > 10) return 'Çekim oranı %0,5 ile %10 arasında olmalı.'
        if (f.base !== 'TRY' && !rates[f.base]) return `${BASE_LABEL[f.base]} fiyatı henüz alınamadı; giriş yaptığınızdan emin olun ya da TL seçin.`
      }
    } catch (e) {
      return e instanceof Error ? e.message : 'Geçersiz bilgi.'
    }
    return null
  }
  const go = (to: number) => {
    if (to > step) {
      const e = check(step)
      if (e) return setError(e)
    }
    setError(undefined)
    setDir(to > step ? 1 : -1)
    setStep(to)
  }

  const save = async () => {
    for (let i = 0; i < STEPS.length; i++) {
      const e = check(i)
      if (e) {
        setStep(i)
        return setError(e)
      }
    }
    setError(undefined)
    const base: JourneyProfile = {
      goal: f.goal,
      goalName: f.goal === 'custom' ? f.goalName.trim().slice(0, 60) || undefined : undefined,
      horizonYears: Number(f.horizon),
      targetMonthlyExpenseKurus: money(f.target, ''),
      monthlyIncomeKurus: money(f.income, ''),
      essentialMonthlyKurus: money(f.essential, ''),
      incomeStability: f.stability,
      priorities: f.priorities,
      withdrawalRatePct: Number(f.withdrawal.replace(',', '.')),
      celebrated: initial?.celebrated ?? [],
      confirmedAt: new Date().toISOString(),
      age: Number(f.age),
      dependents: Number(f.dependents),
      housing: f.housing,
      passiveIncomeKurus: money(f.passive, '', true) || undefined,
      pension: f.pension,
      health: f.health,
      risk: f.risk,
      base: f.base,
      baseRateTl: f.base === 'TRY' ? undefined : (rates[f.base] ?? undefined),
      tests: [...(initial?.tests ?? []), today].slice(-24),
    }
    try {
      setBusy(true)
      await repo.saveSettings({ journey: base })
      toast(initial ? 'Test yenilendi; rotanız güncellendi.' : 'Rotanız hazır.')
      onDone()
    } catch (e) {
      setError(toUserMessage(e))
    } finally {
      setBusy(false)
    }
  }

  if (initial && left === 0)
    return (
      <Card className="p-5">
        <p className="text-[13.5px] text-muted">Bu ayki {TESTS_PER_MONTH} test hakkınızı kullandınız. Gelecek ay yeniden yapabilirsiniz.</p>
        {onCancel && (
          <Button className="mt-3" variant="ghost" onClick={onCancel}>
            Rotama dön
          </Button>
        )}
      </Card>
    )

  const topCats = (categories ?? []).filter((c) => !c.archived).slice(0, 14)
  const last = step === STEPS.length - 1
  return (
    <Card className="overflow-hidden p-5" aria-label="Finansal özgürlük testi">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
        <ClipboardCheck className="size-5 text-accent" /> Finansal özgürlük testi
      </h2>
      <p className="mt-1 text-[13.5px] text-muted">
        Rotanızdaki bütün ölçütler bu yanıtlarla hesaplanır. Uygulamada bulunan bilgiler getirildi; doğrulayın veya düzeltin. Tutarları bugünün parasıyla yazın.
        {initial ? ` Bu ay ${left} test hakkınız var.` : ` Testi ayda ${TESTS_PER_MONTH} kez yenileyebilirsiniz.`}
      </p>
      <ol className="mt-4 grid grid-cols-5 gap-1.5" aria-label="Test adımları">
        {STEPS.map((t, i) => (
          <li key={t}>
            <button type="button" className="w-full text-left" onClick={() => i < step && go(i)} aria-current={i === step ? 'step' : undefined} disabled={i > step}>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <motion.div className="h-full rounded-full bg-accent" initial={false} animate={{ width: i <= step ? '100%' : '0%' }} transition={{ duration: reduced ? 0 : 0.35 }} />
              </div>
              <div className={cn('mt-1 hidden text-[11.5px] sm:block', i === step ? 'font-semibold text-ink' : 'text-muted')}>{t}</div>
            </button>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[12.5px] font-medium text-muted sm:hidden">
        Adım {step + 1}/{STEPS.length}: {STEPS[step]}
      </p>
      <AnimatePresence mode="wait" initial={false} custom={dir}>
        <motion.div
          key={step}
          custom={dir}
          initial={reduced ? false : { opacity: 0, x: 24 * dir }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduced ? undefined : { opacity: 0, x: -24 * dir }}
          transition={{ duration: 0.22 }}
          className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2"
        >
          {step === 0 && (
            <>
              <Field label="Yaşınız" htmlFor="t-age">
                <Input id="t-age" inputMode="numeric" value={f.age} onChange={(e) => set('age', e.target.value.replace(/\D/g, ''))} placeholder="Örn. 32" />
              </Field>
              <Field label="Bakmakla yükümlü olduğunuz kişi sayısı" htmlFor="t-dependents" hint="Çocuk, eş, ebeveyn… Yoksa 0.">
                <Input id="t-dependents" inputMode="numeric" value={f.dependents} onChange={(e) => set('dependents', e.target.value.replace(/\D/g, ''))} />
              </Field>
              <Field label="Konut durumunuz" htmlFor="t-housing">
                <Select id="t-housing" value={f.housing} onChange={(e) => set('housing', e.target.value as Housing)}>
                  {(Object.keys(HOUSING_LABEL) as Housing[]).map((k) => (
                    <option key={k} value={k}>
                      {HOUSING_LABEL[k]}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}
          {step === 1 && (
            <>
              <Field label={<span className="inline-flex items-center gap-2">Aylık net gelir (TL) {fromApp(!!initial)}</span>} htmlFor="t-income" hint="Maaş ve düzenli iş geliri.">
                <Input id="t-income" inputMode="decimal" value={f.income} onChange={(e) => set('income', e.target.value)} placeholder="0,00" />
              </Field>
              <Field label="Gelir düzeni" htmlFor="t-stability">
                <Select id="t-stability" value={f.stability} onChange={(e) => set('stability', e.target.value as IncomeStability)}>
                  {(Object.keys(STABILITY_LABEL) as IncomeStability[]).map((k) => (
                    <option key={k} value={k}>
                      {STABILITY_LABEL[k]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Aylık pasif gelir (TL)" htmlFor="t-passive" hint="Kira, temettü, faiz gibi çalışmadan gelen gelir. Yoksa boş bırakın.">
                <Input id="t-passive" inputMode="decimal" value={f.passive} onChange={(e) => set('passive', e.target.value)} placeholder="0,00" />
              </Field>
            </>
          )}
          {step === 2 && (
            <>
              <Field
                label={<span className="inline-flex items-center gap-2">Zorunlu aylık giderler (TL) {fromApp(facts.recurringMonthlyKurus > 0 || !!initial)}</span>}
                htmlFor="t-essential"
                hint={facts.recurringMonthlyKurus > 0 ? `Düzenli ödemelerin aylık toplamı ${formatKurus(facts.recurringMonthlyKurus)}. Kira, fatura, gıda, ulaşım gibi vazgeçilemeyenleri ekleyin.` : 'Kira, fatura, gıda, ulaşım gibi vazgeçilemeyen giderler.'}
              >
                <Input id="t-essential" inputMode="decimal" value={f.essential} onChange={(e) => set('essential', e.target.value)} placeholder="0,00" />
              </Field>
              <Field
                label={<span className="inline-flex items-center gap-2">Hedefteki aylık yaşam gideri (TL) {fromApp(facts.averageExpenseKurus !== null)}</span>}
                htmlFor="t-target"
                hint={facts.averageExpenseKurus !== null ? `Son ${facts.expenseMonths} dönemin ortalama gideri ${formatKurus(facts.averageExpenseKurus)}. Özgür olduğunuzda nasıl yaşamak istediğinizi düşünün.` : 'Özgür olduğunuzda nasıl yaşamak istediğinizi düşünün.'}
              >
                <Input id="t-target" inputMode="decimal" value={f.target} onChange={(e) => set('target', e.target.value)} placeholder="0,00" />
              </Field>
              <fieldset className="md:col-span-2">
                <legend className="text-[13px] font-medium text-muted">Korumak istediğiniz harcama öncelikleri</legend>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {topCats.map((c) => {
                    const on = f.priorities.includes(c.id)
                    return (
                      <button
                        key={c.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => set('priorities', on ? f.priorities.filter((x) => x !== c.id) : [...f.priorities, c.id])}
                        className={cn('rounded-full border px-3 py-1 text-[13px]', on ? 'border-accent bg-accent-soft text-accent-strong dark:text-accent' : 'border-line text-muted hover:text-ink')}
                      >
                        {c.name}
                      </button>
                    )
                  })}
                </div>
              </fieldset>
            </>
          )}
          {step === 3 && (
            <>
              <Field label="Sağlık güvenceniz" htmlFor="t-health">
                <Select id="t-health" value={f.health} onChange={(e) => set('health', e.target.value as HealthCover)}>
                  {(Object.keys(HEALTH_LABEL) as HealthCover[]).map((k) => (
                    <option key={k} value={k}>
                      {HEALTH_LABEL[k]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Emeklilik güvenceniz" htmlFor="t-pension">
                <Select id="t-pension" value={f.pension} onChange={(e) => set('pension', e.target.value as Pension)}>
                  {(Object.keys(PENSION_LABEL) as Pension[]).map((k) => (
                    <option key={k} value={k}>
                      {PENSION_LABEL[k]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Birikiminizin değeri düşerse ne hissedersiniz?" htmlFor="t-risk" hint="Yalnızca senaryo varsayımını ve koçun dilini belirler; ürün önerisi yapılmaz.">
                <Select id="t-risk" value={f.risk} onChange={(e) => set('risk', e.target.value as RiskStance)}>
                  {(Object.keys(RISK_LABEL) as RiskStance[]).map((k) => (
                    <option key={k} value={k}>
                      {RISK_LABEL[k]}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}
          {step === 4 && (
            <>
              <Field label="Hedefiniz" htmlFor="t-goal">
                <Select id="t-goal" value={f.goal} onChange={(e) => set('goal', e.target.value as JourneyGoal)}>
                  {(Object.keys(JOURNEY_GOAL_LABEL) as JourneyGoal[]).map((g) => (
                    <option key={g} value={g}>
                      {JOURNEY_GOAL_LABEL[g]}
                    </option>
                  ))}
                </Select>
              </Field>
              {f.goal === 'custom' && (
                <Field label="Hedefin adı" htmlFor="t-goal-name">
                  <Input id="t-goal-name" value={f.goalName} maxLength={60} onChange={(e) => set('goalName', e.target.value)} placeholder="Örn. Kendi işimi kurmak" />
                </Field>
              )}
              <Field label="Hedef süresi (yıl)" htmlFor="t-horizon">
                <Input id="t-horizon" inputMode="numeric" value={f.horizon} onChange={(e) => set('horizon', e.target.value.replace(/\D/g, ''))} />
              </Field>
              <Field label="Plan birimi" htmlFor="t-base" hint="USD ya da gram altın seçerseniz hedefleriniz o birimde sabitlenir; TL karşılığı kurla birlikte değişir.">
                <Select id="t-base" value={f.base} onChange={(e) => set('base', e.target.value as PlanBase)}>
                  {(Object.keys(BASE_LABEL) as PlanBase[]).map((k) => (
                    <option key={k} value={k}>
                      {BASE_LABEL[k]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Birikimden yıllık çekim oranı (%)" htmlFor="t-withdrawal" hint="Gereken birikim = yıllık gider ÷ bu oran. Yaygın kabul %4; düştükçe gereken birikim artar.">
                <Input id="t-withdrawal" inputMode="decimal" value={f.withdrawal} onChange={(e) => set('withdrawal', e.target.value)} />
              </Field>
            </>
          )}
        </motion.div>
      </AnimatePresence>
      {error && (
        <p className="mt-3 text-[13px] font-medium text-danger" role="alert">
          {error}
        </p>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {step > 0 && (
          <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={() => go(step - 1)}>
            Geri
          </Button>
        )}
        {last ? (
          <Button variant="primary" loading={busy} onClick={() => void save()} disabled={!settings}>
            {initial ? 'Testi tamamla, rotamı güncelle' : 'Testi tamamla, rotamı oluştur'}
          </Button>
        ) : (
          <Button variant="primary" onClick={() => go(step + 1)}>
            İleri <ArrowRight className="size-4" />
          </Button>
        )}
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Vazgeç
          </Button>
        )}
      </div>
    </Card>
  )
}

// ---------- Yolculuk paneli ----------

const yearOf = (months: number | null) => (months === null ? null : Number(addMonthsClamped(todayIso(), months).slice(0, 4)))

type Tab = 'route' | 'investments' | 'debts' | 'month' | 'criteria'
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'route', label: 'Rota' },
  { id: 'investments', label: 'Yatırımlarım' },
  { id: 'debts', label: 'Borçlarım' },
  { id: 'month', label: 'Bu ay' },
  { id: 'criteria', label: 'Kriterler' },
]

function Dashboard({ profile, facts, rates, onRetake }: { profile: JourneyProfile; facts: JourneyFacts; rates: BaseRates; onRetake: () => void }) {
  const repo = useRepo()
  const { toast } = useUi()
  const j = useMemo(() => buildJourney(profile, facts, rates), [profile, facts, rates])
  const [celebrate, setCelebrate] = useState<StageId[]>([])
  const [tab, setTab] = useState<Tab>('route')
  const base = profile.base ?? 'TRY'
  const inBase = (k: number) => (base === 'TRY' ? formatKurus(k) : (formatInBase(k, base, rates) ?? formatKurus(k)))
  const both = (k: number) => (base === 'TRY' ? formatKurus(k) : `${inBase(k)} (${formatKurus(k)})`)
  const left = testsLeft(profile, todayIso())

  // Yeni tamamlanan aşamalar bir kez kutlanır
  useEffect(() => {
    const fresh = j.stages.filter((s) => s.done && !profile.celebrated.includes(s.id)).map((s) => s.id)
    if (!fresh.length) return
    setCelebrate(fresh)
    const titles = j.stages.filter((s) => fresh.includes(s.id)).map((s) => s.title)
    toast(`Kilometre taşı: ${titles.join(', ')} tamamlandı!`)
    void repo.saveSettings({ journey: { ...profile, celebrated: [...profile.celebrated, ...fresh] } }).catch(() => {})
  }, [j, profile, repo, toast])

  const changeBase = async (b: PlanBase) => {
    const next = rebase(profile, b, rates)
    if (!next) return toast(`${BASE_LABEL[b]} fiyatı henüz alınamadı.`, { kind: 'error' })
    await repo.saveSettings({ journey: next }).catch((e: unknown) => toast(toUserMessage(e), { kind: 'error' }))
  }

  const ind = j.indicators
  const goalLabel = profile.goal === 'custom' && profile.goalName ? profile.goalName : JOURNEY_GOAL_LABEL[profile.goal]
  const years = [yearOf(ind.route.optimistic), yearOf(ind.route.mid), yearOf(ind.route.cautious)]
  const deadline = Number(todayIso().slice(0, 4)) + profile.horizonYears
  const level = j.level

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5" aria-label="Rota">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <Flag className="size-5 text-accent" /> {goalLabel} rotası
          </h2>
          <Segmented label="Plan birimi" value={base} onChange={(b) => void changeBase(b)} options={(Object.keys(BASE_LABEL) as PlanBase[]).map((b) => ({ value: b, label: BASE_LABEL[b] }))} />
        </div>
        <p className="mt-1 text-[13px] text-muted">
          <span className="font-semibold text-ink">
            Seviye {level}/{j.stages.length}
          </span>
          {j.current ? (
            <>
              {' '}
              · sıradaki aşama <span className="font-medium text-ink">{j.current.title}</span>: {j.current.next}
            </>
          ) : (
            ' · bütün aşamaları tamamladınız'
          )}
        </p>
        <RouteMap j={j} celebrate={celebrate} />
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="p-5" aria-label="Finansal güvence">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-muted">
            <ShieldCheck className="size-4 text-accent" /> Acil durum güvencesi
          </div>
          <div className="num mt-2 font-display text-2xl font-semibold">{ind.securityMonths === null ? '—' : `${ind.securityMonths.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} ay`}</div>
          <p className="mt-1 text-[12.5px] text-muted">
            Hızlı kullanılabilir birikiminiz ({formatKurus(facts.liquidKurus)}) zorunlu giderlerinizi bu kadar süre karşılar. Hedef {ind.emergencyMonths} ay.
          </p>
        </Card>
        <Card className="p-5" aria-label="Hedef ilerlemesi">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-muted">
            <Target className="size-4 text-accent" /> Özgürlük hedefi
          </div>
          <div className="num mt-2 font-display text-2xl font-semibold">%{(ind.goalRatio * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}</div>
          <p className="num mt-1 text-[12.5px] text-muted">
            {inBase(ind.progressKurus)} / {inBase(ind.goalKurus)}
          </p>
          {base !== 'TRY' && <p className="num mt-1 text-[12px] text-subtle">Bugünkü TL karşılığı {formatKurus(ind.goalKurus)}</p>}
        </Card>
        <Card className="p-5" aria-label="Tahmini rota">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-muted">
            <TrendingUp className="size-4 text-accent" /> Tahmini varış
          </div>
          <div className="num mt-2 font-display text-2xl font-semibold">{years[0] === null ? 'Ulaşılamıyor' : years[0] === years[2] ? years[0] : `${years[0]} – ${years[2] ?? '…'}`}</div>
          <p className="mt-1 text-[12.5px] text-muted">
            {ind.monthlySavingKurus > 0 ? `Ayda ${formatKurus(ind.monthlySavingKurus)} birikimle, olumlu ve temkinli varsayımlar arasında.` : 'Şu an aylık birikim yok; gelir ve gider dengesi kurulunca tarih aralığı oluşur.'}
          </p>
          {years[1] !== null && <p className="mt-1 text-[12px] text-subtle">Orta varsayım: {years[1]} · hedef süreniz: {deadline}</p>}
        </Card>
      </div>

      <div role="tablist" aria-label="Yolculuk bölümleri" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn('relative shrink-0 rounded-xl px-3.5 py-2 text-[13.5px] font-medium', tab === t.id ? 'text-ink' : 'text-muted hover:text-ink')}
          >
            {tab === t.id && <motion.span layoutId="journey-tab" className="absolute inset-0 rounded-xl bg-surface-2" transition={{ type: 'spring', stiffness: 400, damping: 34 }} />}
            <span className="relative">{t.label}</span>
          </button>
        ))}
      </div>

      <div role="tabpanel" aria-label={TABS.find((t) => t.id === tab)!.label}>
        {tab === 'route' && (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2" aria-label="Aşamalar">
            {j.stages.map((s, i) => (
              <StageCard key={s.id} s={s} n={i + 1} current={j.current?.id === s.id} />
            ))}
          </ul>
        )}
        {tab === 'investments' && <InvestmentsTab facts={facts} inBase={both} />}
        {tab === 'debts' && <DebtsTab facts={facts} profile={profile} />}
        {tab === 'month' && <MonthTab profile={profile} />}
        {tab === 'criteria' && <CriteriaTab j={j} profile={profile} left={left} onRetake={onRetake} />}
      </div>

      <Alert tone="info" icon={<Info className="size-4" />}>
        Bu rota girdiğiniz bilgilerle hesaplanan bir tahmindir: birikiminiz enflasyon kadar artar; yıllık reel getiri temkinli %{SCENARIOS.cautious.realReturnPct}, orta %{SCENARIOS.mid.realReturnPct}, olumlu %{SCENARIOS.optimistic.realReturnPct}; gereken birikim, pasif gelirle karşılanmayan yıllık giderin %{profile.withdrawalRatePct.toLocaleString('tr-TR')} çekim oranına bölünmesiyle bulunur.
        {base !== 'TRY' && ` Hedefler ${BASE_LABEL[base]} bazında sabittir; TL karşılıkları güncel fiyatla hesaplanır.`} Getiri veya tarih garantisi değildir ve yatırım tavsiyesi içermez. Farklı varsayımları{' '}
        <Link to="/senaryolar" className="font-medium text-accent">
          Senaryolar
        </Link>{' '}
        sayfasında deneyebilirsiniz.
      </Alert>
    </div>
  )
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'up' | 'down' }) {
  return (
    <div>
      <div className="text-[12.5px] text-muted">{label}</div>
      <div className={cn('num font-display text-lg font-semibold', tone === 'up' && 'text-accent', tone === 'down' && 'text-danger')}>{value}</div>
      {sub && <div className="mt-0.5 text-[12px] text-subtle">{sub}</div>}
    </div>
  )
}

function TabCard({ icon, title, to, linkLabel, children }: { icon: ReactNode; title: string; to: string; linkLabel: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-display text-base font-semibold">
          {icon} {title}
        </h3>
        <Link to={to} className="inline-flex items-center gap-1 text-[13px] font-semibold text-accent">
          {linkLabel} <ArrowRight className="size-3.5" />
        </Link>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-10 gap-y-4">{children}</div>
    </Card>
  )
}

function InvestmentsTab({ facts, inBase }: { facts: JourneyFacts; inBase: (k: number) => string }) {
  const assets = useAssets()
  const today = todayIso()
  const p = useMemo(() => portfolio((assets ?? []).filter((a) => a.kind !== 'debt'), today), [assets, today])
  const count = (assets ?? []).filter((a) => a.kind !== 'debt' && !a.archived && holdingSummary(a, today).valueKurus > 0).length
  return (
    <TabCard icon={<Wallet className="size-5 text-accent" />} title="Yatırımlarım" to="/yatirimlar" linkLabel="Tümünü aç">
      {count === 0 ? (
        <p className="text-sm text-muted">Henüz yatırım eklenmedi. Birikiminizi Yatırımlarım'a eklediğinizde rota kendiliğinden ilerler.</p>
      ) : (
        <>
          <Stat label="Toplam yatırım" value={inBase(p.assetsKurus)} sub={`${count} kalem`} />
          <Stat label="Hızlı kullanılabilir" value={formatKurus(facts.liquidKurus)} sub="Mevduat, nakit, döviz, altın, fon" />
          <Stat label="Yatırdığınız (net)" value={formatKurus(facts.contributedKurus)} />
          <Stat label="Piyasa kazancı / kaybı" value={`${facts.marketGainKurus >= 0 ? '+' : '−'}${formatKurus(Math.abs(facts.marketGainKurus))}`} tone={facts.marketGainKurus > 0 ? 'up' : facts.marketGainKurus < 0 ? 'down' : undefined} />
        </>
      )}
    </TabCard>
  )
}

function DebtsTab({ facts, profile }: { facts: JourneyFacts; profile: JourneyProfile }) {
  const installments = useInstallmentDebt()
  const income = profile.monthlyIncomeKurus + (profile.passiveIncomeKurus ?? 0)
  const pay = facts.monthlyDebtPaymentKurus ?? 0
  const dti = income > 0 ? pay / income : null
  return (
    <TabCard icon={<CreditCard className="size-5 text-accent" />} title="Borçlarım" to="/borclar" linkLabel="Tümünü aç">
      {facts.debtsKurus === 0 ? (
        <p className="text-sm text-muted">Kayıtlı borç ya da kalan taksit yok.</p>
      ) : (
        <>
          <Stat label="Toplam borç" value={formatKurus(facts.debtsKurus)} sub={installments > 0 ? `${formatKurus(installments)} kalan taksit dahil` : undefined} tone="down" />
          <Stat label="Yüksek faizli borç" value={formatKurus(facts.consumerDebtKurus ?? 0)} sub="Kart, KMH, ihtiyaç, kişisel" />
          <Stat label="Aylık borç ödemesi" value={formatKurus(pay)} />
          <Stat label="Borç ödemesi / gelir" value={dti === null ? '—' : `%${Math.round(dti * 100)}`} sub={`Sınır %${DTI_LIMIT * 100}`} tone={dti !== null && dti > DTI_LIMIT ? 'down' : undefined} />
        </>
      )}
    </TabCard>
  )
}

function MonthTab({ profile }: { profile: JourneyProfile }) {
  const personal = usePersonalTransactions()
  const startDay = usePersonalCycle()
  const month = currentPeriod(startDay)
  const s = useMemo(() => (personal ? summarizeMonth(personal.counted, month, undefined, startDay) : null), [personal, month, startDay])
  if (!s) return null
  const income = s.incomeKurus > 0 ? s.incomeKurus : profile.monthlyIncomeKurus
  const left = income - s.netKurus
  return (
    <TabCard icon={<Sparkles className="size-5 text-accent" />} title={`Bu ay · ${periodLabel(month, startDay)}`} to="/" linkLabel="Özete git">
      <Stat label="Gelir" value={formatKurus(income)} sub={s.incomeKurus > 0 ? 'Kaydettiğiniz gelirler' : 'Testteki aylık gelir'} />
      <Stat label="Harcama" value={formatKurus(s.netKurus)} sub="İadeler düşülmüş" />
      <Stat label="Kalan" value={`${left < 0 ? '−' : ''}${formatKurus(Math.abs(left))}`} tone={left < 0 ? 'down' : 'up'} />
      <Stat label="Birikim oranı" value={income > 0 ? `%${Math.max(0, Math.round((left / income) * 100))}` : '—'} sub="Rota ölçütü en az %20" />
    </TabCard>
  )
}

function CriteriaTab({ j, profile, left, onRetake }: { j: JourneyResult; profile: JourneyProfile; left: number; onRetake: () => void }) {
  const answers: Array<[string, string]> = [
    ['Yaş', profile.age ? String(profile.age) : '—'],
    ['Bakmakla yükümlü', profile.dependents !== undefined ? `${profile.dependents} kişi` : '—'],
    ['Konut', profile.housing ? HOUSING_LABEL[profile.housing] : '—'],
    ['Aylık gelir', formatKurus(profile.monthlyIncomeKurus)],
    ['Gelir düzeni', STABILITY_LABEL[profile.incomeStability]],
    ['Pasif gelir', profile.passiveIncomeKurus ? formatKurus(profile.passiveIncomeKurus) : 'Yok'],
    ['Zorunlu gider', formatKurus(profile.essentialMonthlyKurus)],
    ['Hedef yaşam gideri', formatKurus(profile.targetMonthlyExpenseKurus)],
    ['Risk tutumu', profile.risk ? RISK_LABEL[profile.risk].split(':')[0] : '—'],
    ['Plan birimi', BASE_LABEL[profile.base ?? 'TRY']],
  ]
  const lastTest = profile.tests?.at(-1)
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <h3 className="font-display text-base font-semibold">Finansal özgürlük ölçütleri</h3>
        <p className="mt-0.5 text-[12.5px] text-muted">Rotadaki her aşama ve ek güvence ölçütleri, dayandıkları yaklaşımla birlikte.</p>
        <ul className="mt-3 divide-y divide-line" aria-label="Ölçütler">
          {[...j.stages.map((s) => ({ key: s.id, title: s.title, criterion: s.criterion, source: s.source, status: s.status, done: s.done as boolean | null })), ...j.checks.map((c) => ({ key: c.id, ...c }))].map((c) => (
            <li key={c.key} className="flex gap-3 py-3">
              <span className="mt-0.5 shrink-0" aria-hidden>
                {c.done === true ? <CheckCircle2 className="size-5 text-accent" /> : c.done === false ? <CircleX className="size-5 text-danger" /> : <CircleDashed className="size-5 text-subtle" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">{c.title}</span>
                  <Badge tone={c.done === true ? 'accent' : c.done === false ? 'warning' : 'neutral'}>{c.done === true ? 'Sağlanıyor' : c.done === false ? 'Henüz değil' : 'Bilinmiyor'}</Badge>
                </div>
                <p className="text-[12.5px] text-muted">{c.criterion}</p>
                <p className="num text-[12.5px] text-ink">{c.status}</p>
                <p className="mt-0.5 text-[12px] text-subtle">{c.source}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="p-5" aria-label="Test yanıtlarınız">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-base font-semibold">Test yanıtlarınız</h3>
          <Button size="sm" variant="soft" icon={<RotateCcw className="size-4" />} onClick={onRetake} disabled={left === 0}>
            Testi yeniden yap
          </Button>
        </div>
        <p className="mt-0.5 text-[12.5px] text-muted">
          {lastTest ? `Son test ${lastTest.split('-').reverse().join('.')}. ` : ''}
          {left > 0 ? `Bu ay ${left} test hakkınız kaldı.` : 'Bu ayki test haklarınız bitti; gelecek ay yenileyebilirsiniz.'}
        </p>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-2">
          {answers.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-line py-1">
              <dt className="text-muted">{k}</dt>
              <dd className="num text-right font-medium text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  )
}

function StageCard({ s, n, current }: { s: Stage; n: number; current: boolean }) {
  return (
    <li className={cn('rounded-2xl border bg-surface p-4', s.done ? 'border-accent/40' : current ? 'border-accent' : 'border-line')}>
      <div className="flex items-start gap-3">
        <span className={cn('grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-semibold', s.done ? 'bg-accent text-white' : 'bg-surface-2 text-muted')} aria-hidden>
          {s.done ? <CheckCircle2 className="size-4" /> : n}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-ink">{s.title}</h3>
            {s.done ? <Badge tone="accent">Tamamlandı</Badge> : current ? <Badge tone="info">Sıradaki</Badge> : <Badge tone="neutral">%{Math.round(s.progress * 100)}</Badge>}
          </div>
          <p className="mt-1 text-[12.5px] text-muted">
            <span className="font-medium text-ink">Ölçüt:</span> {s.criterion}
          </p>
          <p className="num text-[12.5px] text-muted">
            <span className="font-medium text-ink">Durum:</span> {s.status}
          </p>
          <p className="text-[12.5px] text-muted">
            <span className="font-medium text-ink">Sonraki adım:</span> {s.next}
          </p>
          {s.missing && <p className="mt-1 text-[12px] text-warning">{s.missing}</p>}
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label={`${s.title} ilerlemesi`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(s.progress * 100)}>
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(s.progress * 100)}%` }} />
          </div>
        </div>
      </div>
    </li>
  )
}

// x yönünde tekdüze: duraklar yatayda eşit aralıklı yerleşir, etiketler çakışmaz
const PATH = 'M 30 150 C 110 150, 130 60, 210 60 S 330 160, 400 150 S 520 50, 590 60 S 700 150, 760 130 S 860 60, 900 55'
const PATH_X0 = 30
const PATH_X1 = 900

/** Yol üzerinde x değerine denk gelen uzunluk (ikili arama). */
function lengthAtX(p: SVGPathElement, total: number, x: number): number {
  let lo = 0
  let hi = total
  for (let k = 0; k < 30; k++) {
    const mid = (lo + hi) / 2
    if (p.getPointAtLength(mid).x < x) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/** Aşama ilerlemesine (0…n) karşılık gelen yol uzunluğu: duraklar arasında doğrusal. */
function lenAt(stopLens: number[], v: number): number {
  const n = stopLens.length - 1
  const c = Math.max(0, Math.min(v, n))
  const i = Math.min(Math.floor(c), n - 1)
  return stopLens[i] + (stopLens[i + 1] - stopLens[i]) * (c - i)
}

/** Rota haritası: işaret gerçek ilerlemeye göre yürür; tamamlanan duraklar açılır. */
function RouteMap({ j, celebrate }: { j: JourneyResult; celebrate: StageId[] }) {
  const reduced = useReducedMotion()
  const pathRef = useRef<SVGPathElement>(null)
  const [stops, setStops] = useState<{ x: number; y: number }[]>([])
  const [len, setLen] = useState(0)
  const [stopLens, setStopLens] = useState<number[]>([])
  const [at, setAt] = useState(0)
  const [marker, setMarker] = useState({ x: 30, y: 150 })
  const n = j.stages.length

  useLayoutEffect(() => {
    const p = pathRef.current
    if (!p || typeof p.getTotalLength !== 'function') return
    const L = p.getTotalLength()
    const lens = Array.from({ length: n + 1 }, (_, i) => (i === 0 ? 0 : i === n ? L : lengthAtX(p, L, PATH_X0 + ((PATH_X1 - PATH_X0) * i) / n)))
    setLen(L)
    setStopLens(lens)
    setStops(lens.map((l) => p.getPointAtLength(l)))
  }, [n])

  useEffect(() => {
    const p = pathRef.current
    if (!len || !p || stopLens.length !== n + 1) return
    const step = (v: number) => {
      setAt(v)
      const pt = p.getPointAtLength(lenAt(stopLens, v))
      setMarker({ x: pt.x, y: pt.y })
    }
    if (reduced) {
      step(j.position)
      return
    }
    const c = animate(0, j.position, { duration: 1.6, ease: 'easeInOut', onUpdate: step })
    return () => c.stop()
  }, [j.position, len, n, reduced, stopLens])

  return (
    <div className="mt-3">
      <svg viewBox="0 0 1000 200" className="h-auto w-full" role="img" aria-label={`Rota: ${n} aşamanın ${j.stages.filter((s) => s.done).length} tanesi tamamlandı`}>
        <path d={PATH} fill="none" stroke="var(--border-strong)" strokeWidth={10} strokeLinecap="round" />
        <path ref={pathRef} d={PATH} fill="none" stroke="var(--accent)" strokeWidth={10} strokeLinecap="round" strokeDasharray={`${stopLens.length ? lenAt(stopLens, at) : 0} ${len}`} />
        {stops.slice(1).map((pt, i) => {
          const s = j.stages[i]
          const party = celebrate.includes(s.id)
          return (
            <g key={s.id}>
              {party && !reduced && <Burst x={pt.x} y={pt.y} />}
              <motion.circle
                cx={pt.x}
                cy={pt.y}
                r={17}
                fill={s.done ? 'var(--accent)' : 'var(--surface)'}
                stroke={s.done ? 'var(--accent)' : 'var(--border-strong)'}
                strokeWidth={3}
                initial={party && !reduced ? { scale: 0.4 } : false}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 12, delay: 1.2 }}
                style={{ transformOrigin: `${pt.x}px ${pt.y}px` }}
              />
              <text x={pt.x} y={pt.y + 6} textAnchor="middle" fontSize={15} fontWeight={700} fill={s.done ? '#fff' : 'var(--muted)'}>
                {s.done ? '✓' : i + 1}
              </text>
            </g>
          )
        })}
        <circle cx={stops[0]?.x ?? 30} cy={stops[0]?.y ?? 150} r={7} fill="var(--border-strong)" />
        <g transform={`translate(${marker.x} ${marker.y})`}>
          <circle r={13} fill="var(--accent-strong, #047857)" stroke="var(--surface)" strokeWidth={4} />
          <Sparkles x={-7} y={-7} width={14} height={14} color="#fff" />
        </g>
      </svg>
      <ol className="relative mt-1 h-10 text-center text-[11px] leading-tight text-muted sm:h-11 sm:text-[12.5px]" aria-hidden>
        {j.stages.map((s, i) => (
          <li
            key={s.id}
            className={cn('absolute w-[20%] -translate-x-1/2 whitespace-nowrap', i % 2 ? 'top-5 sm:top-5' : 'top-0', s.done && 'font-semibold text-ink')}
            style={{ left: `${Math.min(94, Math.max(6, (stops[i + 1]?.x ?? PATH_X0 + ((PATH_X1 - PATH_X0) * (i + 1)) / n) / 10))}%` }}
          >
            {s.short}
          </li>
        ))}
      </ol>
    </div>
  )
}

function Burst({ x, y }: { x: number; y: number }) {
  const colors = ['var(--asset-1)', 'var(--asset-2)', 'var(--asset-3)', 'var(--asset-4)', 'var(--asset-5)']
  return (
    <g aria-hidden>
      {Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2
        return (
          <motion.circle
            key={i}
            cx={x}
            cy={y}
            r={4}
            fill={colors[i % colors.length]}
            initial={{ opacity: 1, x: 0, y: 0 }}
            animate={{ opacity: 0, x: Math.cos(a) * 46, y: Math.sin(a) * 46 }}
            transition={{ duration: 1.1, delay: 1.3, ease: 'easeOut' }}
          />
        )
      })}
    </g>
  )
}

