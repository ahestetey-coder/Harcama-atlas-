import { ArrowRight, Check, CheckCircle2, ChevronDown, CircleDashed, CircleX, ClipboardCheck, CreditCard, Flag, Info, RotateCcw, Sparkles, Wallet } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/AppShell'
import { PlanBadge, PlanGate } from '../components/PlanGate'
import { Alert, Badge, Button, Card, More, Segmented } from '../components/ui/primitives'
import { toUserMessage } from '../data/repository'
import { holdingSummary, portfolio } from '../domain/assets'
import { currentPeriod, periodLabel, todayIso } from '../domain/dates'
import type { IsoDate } from '../domain/types'
import {
  type FreedomStep,
  BASE_LABEL,
  buildJourney,
  DTI_LIMIT,
  durationLabel,
  formatInBase,
  HOUSING_LABEL,
  JOURNEY_GOAL_LABEL,
  reachDateLabel,
  rebase,
  RISK_LABEL,
  STABILITY_LABEL,
  testsLeft,
  type BaseRates,
  type Condition,
  type JourneyFacts,
  type JourneyProfile,
  type JourneyResult,
  type PlanBase,
  type StageId,
} from '../domain/journey'
import { formatKurus } from '../domain/money'
import { loadRouteDraft, routeProfile } from '../domain/routeSetup'
import { summarizeMonth } from '../domain/summary'
import { cn } from '../lib/cn'
import { useReducedMotion } from '../lib/hooks'
import { useInstallmentDebt, useJourneyFacts } from '../state/budget'
import { usePersonalCycle } from '../state/cycle'
import { useAssets, useRepo, useSettings } from '../state/data'
import { FreedomResult } from './FreedomResult'
import { RouteSetup } from './RouteSetup'
import { MoneyFlow, RouteSimulation } from './RouteSimulation'
import { LinkWebTestCard, WebResultCard } from './WebTestCard'
import { LevelRing } from '../components/LevelRing'
import { usePlan } from '../state/plan'
import { useBaseRates } from '../state/livePrices'
import { usePersonalTransactions } from '../state/personal'
import { useUi } from '../state/ui'
import { tt, ttf } from '../lib/i18n'

export default function JourneyPage() {
  return (
    <div>
      <PageHeader
        title={tt('Finansal Özgürlük Yolculuğum')}
        subtitle={
          <span className="inline-flex items-center gap-2">
            <PlanBadge plan="plus" /> {tt('Kişisel rotanız')}
          </span>
        }
      />
      <JourneyBody />
    </div>
  )
}

/**
 * Yolculuk erişimi: Plus ve Plus+ tam paneli görür; Özgürlük Rotası testi burada çözülür ve sonucu
 * paneldeki rota, simülasyon ve adımları kurar (koç Plus+'ta). Paketi olmayan Finansal Harita sonucunu görür.
 */
function JourneyBody() {
  const { has } = usePlan()
  const web = useSettings()?.webTest
  return (
    <>
      <WebTestTeaser />
      {!web && !has('journey') && <MapTestCta />}
      <PlanGate
        feature="journey"
        title={tt('Finansal Özgürlük Yolculuğum')}
        points={[
          tt('Finansal Harita testi ve rota kurulumuyla kişisel hedefiniz'),
          tt('Uzman ölçütlerine dayanan 8 seviyeli rota'),
          tt('Planınızı TL, USD ya da gram altın bazında izleyin'),
          tt('Yatırımlarım, Borçlarım ve bu ayın gelir-giderini tek yerden görün'),
        ]}
      >
        <JourneyContent />
      </PlanGate>
    </>
  )
}

/** Rotası olmayan kişiye: önce 10 soruluk Finansal Harita testi (her pakette açık), sonra rota kurulumu. */
function MapTestCta() {
  return (
    <Card className="relative mb-4 overflow-hidden p-5 sm:p-6" aria-label={tt('Finansal Harita testi')}>
      <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-amber-500/10 blur-3xl" aria-hidden />
      <p className="relative text-[12px] font-medium uppercase tracking-[0.12em] text-muted">{tt('Finansal Harita testi · Ücretsiz')}</p>
      <h2 className="relative mt-1 font-display text-2xl font-bold text-ink">{tt('Önce rotanı belirle')}</h2>
      <p className="relative mt-1 text-[14px] text-muted">{tt('Finansal Yolculuğun bu testle başlar. 10 soruda konumunu ve özgürlük yılının aralığını gör; ardından 6 adımda gerçek rakamlarınla rotanı kur.')}</p>
      <div className="relative mt-4 flex flex-wrap items-center gap-3">
        <Link to="/finansal-harita" className="inline-flex h-12 items-center gap-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 px-5 text-[15px] font-semibold text-white shadow-[0_8px_20px_-10px_rgb(5_150_105/0.8)] hover:brightness-110">
          {tt('Özgürlük rotamı çıkar')} <ArrowRight className="size-4" />
        </Link>
      </div>
    </Card>
  )
}

/** Paketi olmayan kişi de web testindeki haritasını görür; netleştirme Plus ister. */
function WebTestTeaser() {
  const { has } = usePlan()
  const settings = useSettings()
  const web = settings?.webTest
  if (has('webRefine') || !web || routeProfile(settings?.journey)) return null
  return (
    <div className="mb-4">
      <WebResultCard link={web} locked />
    </div>
  )
}

function JourneyContent() {
  const settings = useSettings()
  const facts = useJourneyFacts()
  const rawFacts = useJourneyFacts({ withSetup: false })
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  // Finansal Harita sonucundaki "Rotamı kur" ya da yarıda kalmış kurulum doğrudan kuruluma getirir
  const [refining, setRefining] = useState(() => {
    const code = settings?.webTest?.code
    return params.get('kur') === '1' || (!!code && !!loadRouteDraft(code))
  })
  useEffect(() => {
    if (params.has('kur')) setParams({}, { replace: true })
  }, [params, setParams])
  const rates = useBaseRates(settings?.journey)
  if (!settings || !facts || !rawFacts) return null
  // Rota yalnızca yeni rota kurulumundan beslenir; eski testten kalan profil yok sayılır
  const profile = routeProfile(settings.journey)
  const web = settings.webTest
  // Rota kurulumu: test sonucundaki tahminler 6 adımda gerçek rakamlarla değiştirilir; bitince sayfa bu rakamlarla kurulur
  if (refining && web) return <RouteSetup link={web} facts={rawFacts} rates={rates} onDone={() => setRefining(false)} onCancel={() => setRefining(false)} />
  // Testten gelen kişi önce kendi sonucunu görür, sonra rotasını kurar
  if (!profile && web) return <WebResultCard link={web} onRefine={() => setRefining(true)} />
  if (!profile)
    return (
      <>
        <MapTestCta />
        <LinkWebTestCard />
      </>
    )
  return <Dashboard profile={profile} facts={facts} rates={rates} onRetake={() => (web ? setRefining(true) : navigate('/finansal-harita'))} />
}

// ---------- Yolculuk paneli ----------

type Tab = 'route' | 'investments' | 'debts' | 'month' | 'criteria'
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'route', label: tt('Rota') },
  { id: 'investments', label: tt('Yatırımlarım') },
  { id: 'debts', label: tt('Borçlarım') },
  { id: 'month', label: tt('Bu ay') },
  { id: 'criteria', label: tt('Kriterler') },
]

/** Tutar biçimleyiciler: kısa TL ve plan birimi. */
interface Fmt {
  tl: (k: number) => string
  base: (k: number) => string
  both: (k: number) => string
  cond: (c: Condition, v: number) => string
}

function useFmt(base: PlanBase, rates: BaseRates): Fmt {
  return useMemo(() => {
    const tl = (k: number) => `${Math.round(k / 100).toLocaleString('tr-TR')} ₺`
    const inBase = (k: number) => (base === 'TRY' ? tl(k) : (formatInBase(k, base, rates) ?? tl(k)))
    return {
      tl,
      base: inBase,
      both: (k) => (base === 'TRY' ? formatKurus(k) : `${inBase(k)} (${formatKurus(k)})`),
      cond: (c, v) => (c.unit === 'pct' ? `%${Math.round(v * 100)}` : c.inBase ? inBase(v) : tl(v)),
    }
  }, [base, rates])
}

function Dashboard({ profile, facts, rates, onRetake }: { profile: JourneyProfile; facts: JourneyFacts; rates: BaseRates; onRetake: () => void }) {
  const repo = useRepo()
  const { toast } = useUi()
  const strategy = useSettings()?.coach?.strategy ?? 'avalanche'
  const j = useMemo(() => buildJourney(profile, facts, rates, { strategy }), [profile, facts, rates, strategy])
  const [celebrate, setCelebrate] = useState<StageId[]>([])
  const [tab, setTab] = useState<Tab>('route')
  const base = profile.base ?? 'TRY'
  const fmt = useFmt(base, rates)
  const today = todayIso()
  const left = testsLeft(profile, today)
  const tested = !!profile.tests?.length

  // Yeni tamamlanan aşamalar bir kez kutlanır
  useEffect(() => {
    const fresh = j.stages.filter((s) => s.done && !profile.celebrated.includes(s.id)).map((s) => s.id)
    if (!fresh.length) return
    setCelebrate(fresh)
    const titles = j.stages.filter((s) => fresh.includes(s.id)).map((s) => s.title)
    toast(ttf('Kilometre taşı: {0} tamamlandı!', titles.join(', ')))
    void repo.saveSettings({ journey: { ...profile, celebrated: [...profile.celebrated, ...fresh] } }).catch(() => {})
  }, [j, profile, repo, toast])

  const changeBase = async (b: PlanBase) => {
    const next = rebase(profile, b, rates)
    if (!next) return toast(ttf('{0} fiyatı henüz alınamadı.', BASE_LABEL[b]), { kind: 'error' })
    await repo.saveSettings({ journey: next }).catch((e: unknown) => toast(toUserMessage(e), { kind: 'error' }))
  }

  const ind = j.indicators

  return (
    <div className="flex flex-col gap-3">
      <Hero j={j} profile={profile} fmt={fmt} base={base} left={left} tested={tested} onBase={(b) => void changeBase(b)} onRetake={onRetake} saving={ind.monthlySavingKurus} />

      {(!profile.targetAge || !profile.spending) && tested && (
        <Alert tone="info" icon={<Info className="size-4" />}>
          {tt('Yeni sorular eklendi; testi yenileyebilirsiniz.')}
        </Alert>
      )}

      <RouteSimulation profile={profile} facts={facts} rates={rates} j={j} strategy={strategy} />
      <MoneyFlow profile={profile} facts={facts} j={j} />

      <FreedomResult profile={profile} facts={facts} rates={rates} plan={j.plan} strategy={strategy} today={today} />

      <div role="tablist" aria-label={tt('Yolculuk bölümleri')} className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
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
        {tab === 'route' && <StageRoute j={j} fmt={fmt} celebrate={celebrate} />}
        {tab === 'investments' && <InvestmentsTab facts={facts} inBase={fmt.both} />}
        {tab === 'debts' && <DebtsTab facts={facts} profile={profile} />}
        {tab === 'month' && <MonthTab profile={profile} />}
        {tab === 'criteria' && <CriteriaTab j={j} profile={profile} left={left} onRetake={onRetake} />}
      </div>

      <div className="text-[12.5px] text-subtle">
        <p>{tt('Tahmindir, garanti değildir. Yatırım tavsiyesi değildir.')}</p>
        <More>
          {tt('Tutarlar bugünün parasıyladır. Beklenen yıllık reel getiri')} {j.plan.risk.profile.label} {tt('profiline göre %')}{j.plan.realReturnPct.toLocaleString('tr-TR')}{tt('. Gereken birikim, garantili gelirle karşılanmayan yıllık giderin %')}{j.plan.withdrawal.usedPct.toLocaleString('tr-TR')} {tt('çekim oranına bölünmesiyle bulunur. Aşama süreleri, aylık birikimin tamamının o aşamaya ayrıldığı varsayımıyla hesaplanır.')}
          {base !== 'TRY' && ttf(' Hedefler {0} bazında sabittir.', BASE_LABEL[base])}{' '}
          <Link to="/ogren#varsayimlar" className="font-medium text-accent">
            {tt('Varsayımlar ve kaynaklar')}
          </Link>
          {' · '}
          <Link to="/senaryolar" className="font-medium text-accent">
            {tt('Senaryolar')}
          </Link>
        </More>
      </div>
    </div>
  )
}

function Bar({ value, label, className, delay = 0 }: { value: number; label: string; className?: string; delay?: number }) {
  const reduced = useReducedMotion()
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div className={cn('h-1.5 overflow-hidden rounded-full bg-surface-2', className)} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <motion.div className="h-full rounded-full bg-accent" initial={reduced ? false : { width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.9, delay, ease: 'easeOut' }} />
    </div>
  )
}


function Hero({ j, profile, fmt, base, left, tested, saving, onBase, onRetake }: { j: JourneyResult; profile: JourneyProfile; fmt: Fmt; base: PlanBase; left: number; tested: boolean; saving: number; onBase: (b: PlanBase) => void; onRetake: () => void }) {
  const goalLabel = profile.goal === 'custom' && profile.goalName ? profile.goalName : JOURNEY_GOAL_LABEL[profile.goal]
  const cur = j.current
  const today = todayIso()
  const open = cur?.conditions.filter((c) => !c.done) ?? []
  return (
    <Card className="relative overflow-hidden p-4" aria-label={tt('Rota')}>
      <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-accent/10 blur-3xl" aria-hidden />
      <div className="relative flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <Flag className="size-5 text-accent" /> {goalLabel} {tt('rotası')}
        </h2>
        <Segmented label={tt('Plan birimi')} value={base} onChange={onBase} options={(Object.keys(BASE_LABEL) as PlanBase[]).map((b) => ({ value: b, label: BASE_LABEL[b] }))} />
      </div>
      <div className="relative mt-3 flex items-center gap-3">
        <LevelRing position={j.position} total={j.stages.length} level={j.level} small />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-muted">
            <span className="font-semibold text-ink">
              {ttf('Seviye {0}/{1}', j.level, j.stages.length)}
            </span>
            {cur ? (
              <>
                {' '}
                {tt('· sıradaki aşama')} <span className="font-semibold text-ink">{cur.title}</span>
              </>
            ) : (
              tt(' · bütün aşamaları tamamladınız')
            )}
          </p>
          {cur?.step ? (
            <>
              <p className="mt-0.5 font-display text-[15px] font-semibold leading-snug text-ink">
                <span className="text-accent">{tt('Sıradaki adım:')}</span> {cur.step.title} · {fmt.base(cur.step.targetKurus)}
              </p>
              <p className="mt-0.5 text-[12.5px] text-muted">
                {cur.step.what}. <span className="font-medium text-ink">{cur.step.leftText}</span>
                {cur.step.etaMonths !== undefined && (
                  <span> · {cur.step.etaMonths === null ? tt('bugünkü birikim hızıyla ulaşılamıyor') : ttf('bu hızla ~{0} ({1})', durationLabel(cur.step.etaMonths), reachDateLabel(cur.step.etaMonths, today))}</span>
                )}
              </p>
              <StepLadder steps={j.steps} fmt={fmt} />
            </>
          ) : cur ? (
            <>
              <p className="mt-0.5 font-display text-[15px] font-semibold leading-snug text-ink">
                <span className="text-accent">{tt('Hedef:')}</span> {cur.goal}
              </p>
              <p className="mt-0.5 text-[12.5px] text-muted">
                {open.length > 1 ? ttf('{0} koşul kaldı: ', open.length) : tt('Kalan: ')}
                <span className="font-medium text-ink">{open.map((c) => c.leftText).join(' · ')}</span>
                {cur.etaMonths !== undefined && (
                  <span className="text-muted"> · {cur.etaMonths === null ? tt('bugünkü birikim hızıyla ulaşılamıyor') : ttf('bu hızla ~{0} ({1})', durationLabel(cur.etaMonths), reachDateLabel(cur.etaMonths, today))}</span>
                )}
              </p>
            </>
          ) : (
            <p className="mt-0.5 font-display text-[15px] font-semibold text-ink">{tt('Finansal özgürlüğe ulaştınız. Hedefinizi koruyun.')}</p>
          )}
        </div>
      </div>
      <div className="relative mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-2.5">
        <Button size="sm" variant={tested ? 'soft' : 'primary'} icon={<ClipboardCheck className="size-4" />} onClick={onRetake} disabled={left === 0}>
          {left === 0 ? tt('Bu ayın test hakları bitti') : tested ? ttf('Testi yenile · bu ay {0} hak', left) : tt('Testi yap')}
        </Button>
        <Link to="/senaryolar" className="inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-[13px] font-semibold text-accent hover:bg-accent-soft">
          {tt('Senaryoları dene')} <ArrowRight className="size-3.5" />
        </Link>
        <span className="ml-auto text-[12px] text-subtle">{saving > 0 ? ttf('Aylık birikim {0}', fmt.tl(saving)) : tt('Şu an aylık birikim yok')}</span>
      </div>
    </Card>
  )
}

/** Küçük özgürlük adımları: geçilenler işaretli, sıradaki vurgulu; büyük hedefe giden basamaklar. */
function StepLadder({ steps, fmt }: { steps: FreedomStep[]; fmt: Fmt }) {
  const next = steps.find((s) => !s.done)
  return (
    <ol className="mt-2 flex flex-wrap gap-1.5" aria-label={tt('Özgürlük adımları')}>
      {steps.map((s) => (
        <li
          key={s.id}
          className={cn(
            'num inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px]',
            s.done ? 'border-accent/40 bg-accent-soft text-accent' : s === next ? 'border-accent font-semibold text-ink' : 'border-line text-muted',
          )}
          title={s.what}
        >
          {s.done && <Check className="size-3" strokeWidth={3} aria-hidden />}
          {s.short} · {fmt.base(s.targetKurus)}
        </li>
      ))}
    </ol>
  )
}

/** Dikey rota: her aşamada hedef ve kalan koşullar; çizgi tamamlanan aşamalarla dolar. */
function StageRoute({ j, fmt, celebrate }: { j: JourneyResult; fmt: Fmt; celebrate: StageId[] }) {
  const reduced = useReducedMotion()
  const [opened, setOpened] = useState<StageId | null>(null)
  const today = todayIso()
  return (
    <Card className="p-4">
      <h3 className="font-display text-base font-semibold">{tt('Rotanız')}</h3>
      <ol className="mt-3" aria-label={tt('Aşamalar')}>
        {j.stages.map((s, i) => {
          const isCur = j.current?.id === s.id
          const last = i === j.stages.length - 1
          const expanded = isCur || opened === s.id
          // Çizgi rotadaki konuma göre dolar: bu aşamadan sonrakine doğru ilerleme
          const fill = Math.max(0, Math.min(1, j.position - (i + 1)))
          const openConds = s.conditions.filter((c) => !c.done).length
          const delay = reduced ? 0 : 0.15 + i * 0.12
          return (
            <li key={s.id} className="relative grid grid-cols-[40px_1fr] gap-3 pb-3 last:pb-0">
              {!last && (
                <div className="absolute bottom-0 left-[18px] top-10 w-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                  <motion.div className="w-full origin-top rounded-full bg-accent" style={{ height: '100%' }} initial={reduced ? false : { scaleY: 0 }} animate={{ scaleY: fill }} transition={{ duration: 0.6, delay: delay + 0.2, ease: 'easeOut' }} />
                </div>
              )}
              <div className="relative flex justify-center">
                {isCur && !reduced && <motion.span className="absolute top-0 size-10 rounded-full bg-accent/30" animate={{ scale: [1, 1.55], opacity: [0.7, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }} aria-hidden />}
                {celebrate.includes(s.id) && !reduced && <Burst />}
                <motion.span
                  className={cn(
                    'relative grid size-10 place-items-center rounded-full border-[3px] text-[14px] font-bold',
                    s.done ? 'border-accent bg-accent text-white' : isCur ? 'border-accent bg-surface text-accent' : 'border-line bg-surface text-muted',
                  )}
                  initial={reduced ? false : { scale: 0.3, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 16, delay }}
                  aria-hidden
                >
                  {s.done ? <Check className="size-5" strokeWidth={3} /> : i + 1}
                </motion.span>
              </div>
              <motion.div
                className={cn('min-w-0 rounded-2xl border p-3', isCur ? 'border-accent bg-accent-soft/40 shadow-card' : s.done ? 'border-line bg-surface' : 'border-line bg-surface')}
                initial={reduced ? false : { opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, delay }}
              >
                <button
                  type="button"
                  className="flex w-full items-start gap-2 text-left disabled:cursor-default"
                  onClick={() => setOpened(opened === s.id ? null : s.id)}
                  disabled={isCur}
                  aria-expanded={expanded}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold text-ink">{s.title}</h4>
                      {s.done ? <Badge tone="accent">{tt('Tamamlandı')}</Badge> : isCur ? <Badge tone="info">{tt('Sıradaki')}</Badge> : <Badge tone="neutral">%{Math.round(s.progress * 100)}</Badge>}
                    </div>
                    <p className="mt-0.5 text-[13px] text-muted">
                      <span className="font-medium text-ink">{tt('Hedef:')}</span> {s.goal}
                    </p>
                    {!expanded && !s.done && (
                      <p className="mt-0.5 text-[12px] text-subtle">
                        {ttf('{0} koşul kaldı {1}', openConds, s.etaMonths != null ? ttf(' · bu hızla ~{0}', durationLabel(s.etaMonths)) : '')}
                      </p>
                    )}
                  </div>
                  {!isCur && <ChevronDown className={cn('mt-0.5 size-4 shrink-0 text-muted transition-transform', expanded && 'rotate-180')} aria-hidden />}
                </button>
                <AnimatePresence initial={false}>
                  {expanded && (
                    <motion.div initial={reduced ? false : { height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={reduced ? undefined : { height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
                      <div className="mt-3 text-[12px] font-semibold uppercase tracking-wide text-muted">{s.done ? tt('Koşullar') : tt('Kalan koşullar')}</div>
                      <ul className="mt-1.5 flex flex-col gap-2.5" aria-label={ttf('{0} koşulları', s.title)}>
                        {s.conditions.map((c, ci) => (
                          <ConditionRow key={ci} c={c} fmt={fmt} today={today} />
                        ))}
                      </ul>
                      {s.step && <StepLadder steps={j.steps} fmt={fmt} />}
                      {!s.done && (
                        <p className="mt-3 flex items-start gap-1.5 text-[12.5px] text-ink">
                          <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-accent" /> <span>
                            <span className="font-medium">{tt('Sonraki adım:')}</span> {s.next}
                          </span>
                        </p>
                      )}
                      {s.missing && <p className="mt-1 text-[12px] text-warning">{s.missing}</p>}
                      <p className="mt-2 text-[11.5px] text-subtle">{s.source}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

function ConditionRow({ c, fmt, today }: { c: Condition; fmt: Fmt; today: IsoDate }) {
  const target = c.dir === 'atMost' ? (c.target === 0 ? fmt.cond(c, 0) : ttf('en çok {0}', fmt.cond(c, c.target))) : c.unit === 'pct' ? ttf('en az {0}', fmt.cond(c, c.target)) : fmt.cond(c, c.target)
  return (
    <li className="flex gap-2.5">
      <span className="mt-0.5 shrink-0" aria-hidden>
        {c.done ? <CheckCircle2 className="size-[18px] text-accent" /> : <CircleDashed className="size-[18px] text-warning" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="text-[13px] font-medium text-ink">{c.label}</span>
          <span className="num text-[12.5px] text-muted">
            <span className={cn('font-semibold', c.done ? 'text-accent' : 'text-ink')}>{fmt.cond(c, c.now)}</span> / {target}
          </span>
        </div>
        <Bar value={c.progress} label={`${c.label} ilerlemesi`} className="mt-1" />
        <p className={cn('mt-1 text-[12px]', c.done ? 'text-accent' : 'text-muted')}>
          {c.done ? tt('✓ Sağlanıyor') : c.leftText}
          {!c.done && c.etaMonths !== undefined && <span className="text-subtle"> · {c.etaMonths === null ? tt('bu birikim hızıyla ulaşılamıyor') : ttf('bu hızla ~{0} ({1})', durationLabel(c.etaMonths), reachDateLabel(c.etaMonths, today))}</span>}
        </p>
      </div>
    </li>
  )
}

function Burst() {
  const colors = ['var(--asset-1)', 'var(--asset-2)', 'var(--asset-3)', 'var(--asset-4)', 'var(--asset-5)']
  return (
    <span className="pointer-events-none absolute left-1/2 top-5" aria-hidden>
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2
        return (
          <motion.span
            key={i}
            className="absolute -ml-1 -mt-1 size-2 rounded-full"
            style={{ background: colors[i % colors.length] }}
            initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
            animate={{ opacity: 0, x: Math.cos(a) * 38, y: Math.sin(a) * 38, scale: 0.4 }}
            transition={{ duration: 1.1, delay: 1, ease: 'easeOut' }}
          />
        )
      })}
    </span>
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
    <TabCard icon={<Wallet className="size-5 text-accent" />} title={tt('Yatırımlarım')} to="/yatirimlar" linkLabel={tt('Tümünü aç')}>
      {count === 0 ? (
        <p className="text-sm text-muted">{tt('Henüz yatırım eklenmedi.')}</p>
      ) : (
        <>
          <Stat label={tt('Toplam yatırım')} value={inBase(p.assetsKurus)} sub={`${count} kalem`} />
          <Stat label={tt('Hızlı kullanılabilir')} value={formatKurus(facts.liquidKurus)} sub={tt('Mevduat, nakit, döviz, altın, fon')} />
          <Stat label={tt('Yatırdığınız (net)')} value={formatKurus(facts.contributedKurus)} />
          <Stat label={tt('Piyasa kazancı / kaybı')} value={`${facts.marketGainKurus >= 0 ? '+' : '−'}${formatKurus(Math.abs(facts.marketGainKurus))}`} tone={facts.marketGainKurus > 0 ? 'up' : facts.marketGainKurus < 0 ? 'down' : undefined} />
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
    <TabCard icon={<CreditCard className="size-5 text-accent" />} title={tt('Borçlarım')} to="/borclar" linkLabel={tt('Tümünü aç')}>
      {facts.debtsKurus === 0 ? (
        <p className="text-sm text-muted">{tt('Kayıtlı borç ya da kalan taksit yok.')}</p>
      ) : (
        <>
          <Stat label={tt('Toplam borç')} value={formatKurus(facts.debtsKurus)} sub={installments > 0 ? ttf('{0} kalan taksit dahil', formatKurus(installments)) : undefined} tone="down" />
          <Stat label={tt('Yüksek faizli borç')} value={formatKurus(facts.consumerDebtKurus ?? 0)} sub={tt('Kart, KMH, ihtiyaç, kişisel')} />
          <Stat label={tt('Aylık borç ödemesi')} value={formatKurus(pay)} />
          <Stat label={tt('Borç ödemesi / gelir')} value={dti === null ? '—' : `%${Math.round(dti * 100)}`} sub={ttf('Sınır %{0}', DTI_LIMIT * 100)} tone={dti !== null && dti > DTI_LIMIT ? 'down' : undefined} />
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
    <TabCard icon={<Sparkles className="size-5 text-accent" />} title={ttf('Bu ay · {0}', periodLabel(month, startDay))} to="/" linkLabel={tt('Özete git')}>
      <Stat label={tt('Gelir')} value={formatKurus(income)} sub={s.incomeKurus > 0 ? tt('Kaydettiğiniz gelirler') : tt('Testteki aylık gelir')} />
      <Stat label={tt('Harcama')} value={formatKurus(s.netKurus)} sub={tt('İadeler düşülmüş')} />
      <Stat label={tt('Kalan')} value={`${left < 0 ? '−' : ''}${formatKurus(Math.abs(left))}`} tone={left < 0 ? 'down' : 'up'} />
      <Stat label={tt('Birikim oranı')} value={income > 0 ? `%${Math.max(0, Math.round((left / income) * 100))}` : '—'} sub={tt('Rota ölçütü en az %20')} />
    </TabCard>
  )
}

function CriteriaTab({ j, profile, left, onRetake }: { j: JourneyResult; profile: JourneyProfile; left: number; onRetake: () => void }) {
  const answers: Array<[string, string]> = [
    [tt('Yaş'), profile.age ? String(profile.age) : '—'],
    [tt('Bakmakla yükümlü'), profile.dependents !== undefined ? ttf('{0} kişi', profile.dependents) : '—'],
    ['Konut', profile.housing ? HOUSING_LABEL[profile.housing] : '—'],
    [tt('Aylık gelir'), formatKurus(profile.monthlyIncomeKurus)],
    [tt('Gelir düzeni'), STABILITY_LABEL[profile.incomeStability]],
    [tt('Pasif gelir'), profile.passiveIncomeKurus ? formatKurus(profile.passiveIncomeKurus) : 'Yok'],
    [tt('Zorunlu gider'), formatKurus(profile.essentialMonthlyKurus)],
    [tt('Hedef yaşam gideri'), formatKurus(profile.targetMonthlyExpenseKurus)],
    [tt('Risk tutumu'), profile.risk ? RISK_LABEL[profile.risk].split(':')[0] : '—'],
    [tt('Plan birimi'), BASE_LABEL[profile.base ?? 'TRY']],
  ]
  const lastTest = profile.tests?.at(-1)
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <h3 className="font-display text-base font-semibold">{tt('Finansal özgürlük ölçütleri')}</h3>
        <ul className="mt-3 divide-y divide-line" aria-label={tt('Ölçütler')}>
          {[...j.stages.map((s) => ({ key: s.id, title: s.title, criterion: s.criterion, source: s.source, status: s.status, done: s.done as boolean | null })), ...j.checks.map((c) => ({ key: c.id, ...c }))].map((c) => (
            <li key={c.key} className="flex gap-3 py-3">
              <span className="mt-0.5 shrink-0" aria-hidden>
                {c.done === true ? <CheckCircle2 className="size-5 text-accent" /> : c.done === false ? <CircleX className="size-5 text-danger" /> : <CircleDashed className="size-5 text-subtle" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">{c.title}</span>
                  <Badge tone={c.done === true ? 'accent' : c.done === false ? 'warning' : 'neutral'}>{c.done === true ? tt('Sağlanıyor') : c.done === false ? tt('Henüz değil') : 'Bilinmiyor'}</Badge>
                </div>
                <p className="text-[12.5px] text-muted">{c.criterion}</p>
                <p className="num text-[12.5px] text-ink">{c.status}</p>
                <p className="mt-0.5 text-[12px] text-subtle">{c.source}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="p-5" aria-label={tt('Test yanıtlarınız')}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-base font-semibold">{tt('Test yanıtlarınız')}</h3>
          <Button size="sm" variant="soft" icon={<RotateCcw className="size-4" />} onClick={onRetake} disabled={left === 0}>
            {tt('Testi yeniden yap')}
          </Button>
        </div>
        <p className="mt-0.5 text-[12.5px] text-muted">
          {lastTest ? ttf('Son test {0}. ', lastTest.split('-').reverse().join('.')) : ''}
          {left > 0 ? ttf('Bu ay {0} test hakkınız kaldı.', left) : tt('Bu ayın test hakları bitti.')}
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
