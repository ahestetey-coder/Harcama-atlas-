import { ArrowRight, Check, CheckCircle2, ChevronDown, CircleDashed, CircleX, ClipboardCheck, CreditCard, Flag, Info, RotateCcw, Sparkles, Wallet } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/AppShell'
import { PlanBadge, PlanGate } from '../components/PlanGate'
import { Alert, Badge, Button, Card, Segmented } from '../components/ui/primitives'
import { toUserMessage } from '../data/repository'
import { holdingSummary, portfolio } from '../domain/assets'
import { currentPeriod, periodLabel, todayIso } from '../domain/dates'
import type { IsoDate } from '../domain/types'
import {
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
import { summarizeMonth } from '../domain/summary'
import { cn } from '../lib/cn'
import { useReducedMotion } from '../lib/hooks'
import { useInstallmentDebt, useJourneyFacts } from '../state/budget'
import { usePersonalCycle } from '../state/cycle'
import { useAssets, useRepo, useSettings } from '../state/data'
import { FreedomResult } from './FreedomResult'
import { FreedomTest } from './FreedomTest'
import { useBaseRates } from '../state/livePrices'
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

// ---------- Yolculuk paneli ----------

type Tab = 'route' | 'investments' | 'debts' | 'month' | 'criteria'
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'route', label: 'Rota' },
  { id: 'investments', label: 'Yatırımlarım' },
  { id: 'debts', label: 'Borçlarım' },
  { id: 'month', label: 'Bu ay' },
  { id: 'criteria', label: 'Kriterler' },
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
    toast(`Kilometre taşı: ${titles.join(', ')} tamamlandı!`)
    void repo.saveSettings({ journey: { ...profile, celebrated: [...profile.celebrated, ...fresh] } }).catch(() => {})
  }, [j, profile, repo, toast])

  const changeBase = async (b: PlanBase) => {
    const next = rebase(profile, b, rates)
    if (!next) return toast(`${BASE_LABEL[b]} fiyatı henüz alınamadı.`, { kind: 'error' })
    await repo.saveSettings({ journey: next }).catch((e: unknown) => toast(toUserMessage(e), { kind: 'error' }))
  }

  const ind = j.indicators

  return (
    <div className="flex flex-col gap-4">
      {!tested && (
        <Card className="border-accent/50 p-4" aria-label="Test çağrısı">
          <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold">
            <ClipboardCheck className="size-5 shrink-0 text-accent" /> Finansal özgürlük testini henüz yapmadınız
          </h2>
          <p className="mt-1 text-[13px] text-muted">5 kısa adım; rotanızdaki hedefler bu yanıtlarla kişiselleşir.</p>
          <Button className="mt-3 w-full sm:w-auto" variant="primary" icon={<ClipboardCheck className="size-4" />} onClick={onRetake}>
            Testi başlat
          </Button>
        </Card>
      )}

      <Hero j={j} profile={profile} fmt={fmt} base={base} left={left} tested={tested} onBase={(b) => void changeBase(b)} onRetake={onRetake} saving={ind.monthlySavingKurus} />

      {(!profile.targetAge || !profile.spending) && tested && (
        <Alert tone="info" icon={<Info className="size-4" />}>
          Rotanız yeni hesaba geçti. Hedef yaşınızı, harcama gruplarınızı ve risk sorularını eklemek için testi yenileyin; o zamana kadar eski yanıtlarınız kullanılır.
        </Alert>
      )}

      <FreedomResult profile={profile} facts={facts} rates={rates} plan={j.plan} strategy={strategy} today={today} />

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
        {tab === 'route' && <StageRoute j={j} fmt={fmt} celebrate={celebrate} />}
        {tab === 'investments' && <InvestmentsTab facts={facts} inBase={fmt.both} />}
        {tab === 'debts' && <DebtsTab facts={facts} profile={profile} />}
        {tab === 'month' && <MonthTab profile={profile} />}
        {tab === 'criteria' && <CriteriaTab j={j} profile={profile} left={left} onRetake={onRetake} />}
      </div>

      <Alert tone="info" icon={<Info className="size-4" />}>
        Bu rota uygulamadaki verileriniz, test yanıtlarınız ve kaynaklı varsayımlarla hesaplanan bir benzetimdir: tutarlar bugünün parasıyladır; beklenen yıllık reel getiri {j.plan.risk.profile.label} profiline göre %{j.plan.realReturnPct.toLocaleString('tr-TR')}; gereken birikim, garantili gelirle karşılanmayan yıllık giderin %{j.plan.withdrawal.usedPct.toLocaleString('tr-TR')} çekim oranına bölünmesiyle bulunur. Borç, düzenli ödeme ya da varlık değiştiğinde rota kendiliğinden yeniden hesaplanır. Aşama süreleri, aylık birikiminizin tamamının o aşamaya ayrıldığı varsayımıyla hesaplanır.
        {base !== 'TRY' && ` Hedefler ${BASE_LABEL[base]} bazında sabittir; TL karşılıkları güncel fiyatla hesaplanır.`} Getiri veya tarih garantisi değildir; eğitim amaçlıdır ve kişiye özel yatırım tavsiyesi içermez.{' '}
        <Link to="/ogren#varsayimlar" className="font-medium text-accent">
          Varsayımlar ve kaynaklar
        </Link>
        . Farklı varsayımları{' '}
        <Link to="/senaryolar" className="font-medium text-accent">
          Senaryolar
        </Link>{' '}
        sayfasında deneyebilirsiniz.
      </Alert>
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

/** Seviye halkası: tamamlanan aşamalar + sıradakinin ilerlemesi. */
function LevelRing({ position, total, level }: { position: number; total: number; level: number }) {
  const reduced = useReducedMotion()
  const r = 40
  const frac = Math.max(0, Math.min(1, position / total))
  return (
    <div className="relative size-[104px] shrink-0">
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
        <circle cx={50} cy={50} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={9} />
        <motion.circle cx={50} cy={50} r={r} fill="none" stroke="var(--accent)" strokeWidth={9} strokeLinecap="round" initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: frac }} transition={{ duration: 1.4, ease: 'easeInOut' }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center leading-none">
        <div>
          <div className="num font-display text-[26px] font-bold text-ink">
            {level}
            <span className="text-[15px] font-semibold text-muted">/{total}</span>
          </div>
          <div className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted">seviye</div>
        </div>
      </div>
    </div>
  )
}

function Hero({ j, profile, fmt, base, left, tested, saving, onBase, onRetake }: { j: JourneyResult; profile: JourneyProfile; fmt: Fmt; base: PlanBase; left: number; tested: boolean; saving: number; onBase: (b: PlanBase) => void; onRetake: () => void }) {
  const goalLabel = profile.goal === 'custom' && profile.goalName ? profile.goalName : JOURNEY_GOAL_LABEL[profile.goal]
  const cur = j.current
  const today = todayIso()
  const open = cur?.conditions.filter((c) => !c.done) ?? []
  return (
    <Card className="relative overflow-hidden p-5" aria-label="Rota">
      <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-accent/10 blur-3xl" aria-hidden />
      <div className="relative flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <Flag className="size-5 text-accent" /> {goalLabel} rotası
        </h2>
        <Segmented label="Plan birimi" value={base} onChange={onBase} options={(Object.keys(BASE_LABEL) as PlanBase[]).map((b) => ({ value: b, label: BASE_LABEL[b] }))} />
      </div>
      <div className="relative mt-4 flex items-center gap-4">
        <LevelRing position={j.position} total={j.stages.length} level={j.level} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-muted">
            <span className="font-semibold text-ink">
              Seviye {j.level}/{j.stages.length}
            </span>
            {cur ? (
              <>
                {' '}
                · sıradaki aşama <span className="font-semibold text-ink">{cur.title}</span>
              </>
            ) : (
              ' · bütün aşamaları tamamladınız'
            )}
          </p>
          {cur ? (
            <>
              <p className="mt-1 font-display text-[17px] font-semibold leading-snug text-ink">
                <span className="text-accent">Hedef:</span> {cur.goal}
              </p>
              <p className="mt-1 text-[13px] text-muted">
                {open.length > 1 ? `${open.length} koşul kaldı: ` : 'Kalan: '}
                <span className="font-medium text-ink">{open.map((c) => c.leftText).join(' · ')}</span>
                {cur.etaMonths !== undefined && (
                  <span className="text-muted"> · {cur.etaMonths === null ? 'bugünkü birikim hızıyla ulaşılamıyor' : `bu hızla ~${durationLabel(cur.etaMonths)} (${reachDateLabel(cur.etaMonths, today)})`}</span>
                )}
              </p>
            </>
          ) : (
            <p className="mt-1 font-display text-[17px] font-semibold text-ink">Finansal özgürlüğe ulaştınız. Hedefinizi koruyun.</p>
          )}
        </div>
      </div>
      <div className="relative mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <Button size="sm" variant={tested ? 'soft' : 'primary'} icon={<ClipboardCheck className="size-4" />} onClick={onRetake} disabled={left === 0}>
          {left === 0 ? 'Bu ayın test hakları bitti' : tested ? `Testi yenile · bu ay ${left} hak` : 'Testi yap'}
        </Button>
        <Link to="/senaryolar" className="inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-[13px] font-semibold text-accent hover:bg-accent-soft">
          Senaryoları dene <ArrowRight className="size-3.5" />
        </Link>
        <span className="ml-auto text-[12px] text-subtle">{saving > 0 ? `Aylık birikim ${fmt.tl(saving)}` : 'Şu an aylık birikim yok'}</span>
      </div>
    </Card>
  )
}

/** Dikey rota: her aşamada hedef ve kalan koşullar; çizgi tamamlanan aşamalarla dolar. */
function StageRoute({ j, fmt, celebrate }: { j: JourneyResult; fmt: Fmt; celebrate: StageId[] }) {
  const reduced = useReducedMotion()
  const [opened, setOpened] = useState<StageId | null>(null)
  const today = todayIso()
  return (
    <Card className="p-4 sm:p-5">
      <h3 className="font-display text-base font-semibold">Rotanız</h3>
      <p className="mt-0.5 text-[12.5px] text-muted">Aşamalar sırayla tamamlanır. Sıradaki aşamanın koşulları açık; diğerlerine dokunarak bakabilirsiniz.</p>
      <ol className="mt-4" aria-label="Aşamalar">
        {j.stages.map((s, i) => {
          const isCur = j.current?.id === s.id
          const last = i === j.stages.length - 1
          const expanded = isCur || opened === s.id
          // Çizgi rotadaki konuma göre dolar: bu aşamadan sonrakine doğru ilerleme
          const fill = Math.max(0, Math.min(1, j.position - (i + 1)))
          const openConds = s.conditions.filter((c) => !c.done).length
          const delay = reduced ? 0 : 0.15 + i * 0.12
          return (
            <li key={s.id} className="relative grid grid-cols-[40px_1fr] gap-3 pb-4 last:pb-0">
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
                className={cn('min-w-0 rounded-2xl border p-3.5', isCur ? 'border-accent bg-accent-soft/40 shadow-card' : s.done ? 'border-line bg-surface' : 'border-line bg-surface')}
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
                      {s.done ? <Badge tone="accent">Tamamlandı</Badge> : isCur ? <Badge tone="info">Sıradaki</Badge> : <Badge tone="neutral">%{Math.round(s.progress * 100)}</Badge>}
                    </div>
                    <p className="mt-0.5 text-[13px] text-muted">
                      <span className="font-medium text-ink">Hedef:</span> {s.goal}
                    </p>
                    {!expanded && !s.done && (
                      <p className="mt-0.5 text-[12px] text-subtle">
                        {openConds} koşul kaldı
                        {s.etaMonths != null ? ` · bu hızla ~${durationLabel(s.etaMonths)}` : ''}
                      </p>
                    )}
                  </div>
                  {!isCur && <ChevronDown className={cn('mt-0.5 size-4 shrink-0 text-muted transition-transform', expanded && 'rotate-180')} aria-hidden />}
                </button>
                <AnimatePresence initial={false}>
                  {expanded && (
                    <motion.div initial={reduced ? false : { height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={reduced ? undefined : { height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
                      <div className="mt-3 text-[12px] font-semibold uppercase tracking-wide text-muted">{s.done ? 'Koşullar' : 'Kalan koşullar'}</div>
                      <ul className="mt-1.5 flex flex-col gap-2.5" aria-label={`${s.title} koşulları`}>
                        {s.conditions.map((c, ci) => (
                          <ConditionRow key={ci} c={c} fmt={fmt} today={today} />
                        ))}
                      </ul>
                      {!s.done && (
                        <p className="mt-3 flex items-start gap-1.5 text-[12.5px] text-ink">
                          <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-accent" /> <span>
                            <span className="font-medium">Sonraki adım:</span> {s.next}
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
  const target = c.dir === 'atMost' ? (c.target === 0 ? fmt.cond(c, 0) : `en çok ${fmt.cond(c, c.target)}`) : c.unit === 'pct' ? `en az ${fmt.cond(c, c.target)}` : fmt.cond(c, c.target)
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
          {c.done ? '✓ Sağlanıyor' : c.leftText}
          {!c.done && c.etaMonths !== undefined && <span className="text-subtle"> · {c.etaMonths === null ? 'bu birikim hızıyla ulaşılamıyor' : `bu hızla ~${durationLabel(c.etaMonths)} (${reachDateLabel(c.etaMonths, today)})`}</span>}
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
