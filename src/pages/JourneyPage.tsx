import { CheckCircle2, Flag, Info, Mountain, Pencil, ShieldCheck, Sparkles, Target, TrendingUp } from 'lucide-react'
import { animate, motion } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/AppShell'
import { PlanBadge, PlanGate } from '../components/PlanGate'
import { Alert, Badge, Button, Card, Field, Input, Select } from '../components/ui/primitives'
import { toUserMessage } from '../data/repository'
import { todayIso } from '../domain/dates'
import {
  buildJourney,
  DEFAULT_WITHDRAWAL_PCT,
  JOURNEY_GOAL_LABEL,
  SCENARIOS,
  STABILITY_LABEL,
  type IncomeStability,
  type JourneyFacts,
  type JourneyGoal,
  type JourneyProfile,
  type JourneyResult,
  type Stage,
  type StageId,
} from '../domain/journey'
import { formatKurus, formatKurusPlain, parseUserAmount } from '../domain/money'
import { addMonthsClamped } from '../domain/recurring'
import { cn } from '../lib/cn'
import { useReducedMotion } from '../lib/hooks'
import { useJourneyFacts } from '../state/budget'
import { useCategories, useRepo, useSettings } from '../state/data'
import { useUi } from '../state/ui'

export default function JourneyPage() {
  return (
    <div>
      <PageHeader
        title="Finansal Özgürlük Yolculuğum"
        subtitle={
          <span className="inline-flex items-center gap-2">
            <PlanBadge plan="plusplus" /> Gerçek verilerinize dayanan kişisel rota
          </span>
        }
      />
      <PlanGate
        feature="journey"
        title="Finansal Özgürlük Yolculuğum"
        points={[
          'Kısa bir anketle hedefinizi ve sürenizi belirleyin; uygulamadaki bilgiler ankete kendiliğinden gelir',
          'Bütçe dengesi, acil durum birikimi, borç, düzenli birikim ve hedef aşamalarından oluşan rotanızı görün',
          'Finansal güvence, hedef ilerlemesi ve tahmini rota göstergelerini izleyin',
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
  const [editing, setEditing] = useState(false)
  if (!settings || !facts) return null
  const profile = settings.journey
  if (!profile || editing) return <Survey facts={facts} initial={profile} onDone={() => setEditing(false)} onCancel={profile ? () => setEditing(false) : undefined} />
  return <Route profile={profile} facts={facts} onEdit={() => setEditing(true)} />
}

// ---------- Anket ----------

function Survey({ facts, initial, onDone, onCancel }: { facts: JourneyFacts; initial?: JourneyProfile; onDone: () => void; onCancel?: () => void }) {
  const repo = useRepo()
  const settings = useSettings()
  const categories = useCategories()
  const { toast } = useUi()
  const plain = (k: number | null | undefined) => (k ? formatKurusPlain(k) : '')
  const [f, setF] = useState(() => ({
    goal: initial?.goal ?? ('independence' as JourneyGoal),
    goalName: initial?.goalName ?? '',
    horizon: String(initial?.horizonYears ?? 15),
    target: plain(initial?.targetMonthlyExpenseKurus ?? facts.averageExpenseKurus),
    income: plain(initial?.monthlyIncomeKurus),
    essential: plain(initial?.essentialMonthlyKurus ?? (facts.recurringMonthlyKurus || null)),
    stability: initial?.incomeStability ?? ('regular' as IncomeStability),
    priorities: initial?.priorities ?? [],
    withdrawal: String(initial?.withdrawalRatePct ?? DEFAULT_WITHDRAWAL_PCT).replace('.', ','),
  }))
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }))
  const fromApp = (has: boolean) => (has ? <Badge tone="accent">Uygulamadan</Badge> : <Badge tone="warning">Eksik</Badge>)

  const save = async () => {
    setError(undefined)
    const money = (s: string, label: string) => {
      const p = parseUserAmount(s)
      if (!p.ok || p.kurus <= 0) throw new Error(`${label} için geçerli bir tutar girin.`)
      return p.kurus
    }
    try {
      const horizon = Number(f.horizon)
      if (!Number.isInteger(horizon) || horizon < 1 || horizon > 60) throw new Error('Hedef süresi 1 ile 60 yıl arasında olmalı.')
      const w = Number(f.withdrawal.replace(',', '.'))
      if (!Number.isFinite(w) || w < 0.5 || w > 10) throw new Error('Çekim oranı %0,5 ile %10 arasında olmalı.')
      const profile: JourneyProfile = {
        goal: f.goal,
        goalName: f.goal === 'custom' ? f.goalName.trim().slice(0, 60) || undefined : undefined,
        horizonYears: horizon,
        targetMonthlyExpenseKurus: money(f.target, 'Hedefte aylık yaşam gideri'),
        monthlyIncomeKurus: money(f.income, 'Aylık gelir'),
        essentialMonthlyKurus: money(f.essential, 'Zorunlu giderler'),
        incomeStability: f.stability,
        priorities: f.priorities,
        withdrawalRatePct: w,
        celebrated: initial?.celebrated ?? [],
        confirmedAt: new Date().toISOString(),
      }
      setBusy(true)
      await repo.saveSettings({ journey: profile })
      toast(initial ? 'Yolculuk bilgileri güncellendi.' : 'Rotanız hazır.')
      onDone()
    } catch (e) {
      setError(e instanceof Error && !('code' in e) ? e.message : toUserMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const topCats = (categories ?? []).filter((c) => !c.archived).slice(0, 14)
  return (
    <Card className="p-5" aria-label="Yolculuk anketi">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
        <Mountain className="size-5 text-accent" /> {initial ? 'Bilgilerinizi güncelleyin' : 'Yolculuğunuza başlayalım'}
      </h2>
      <p className="mt-1 text-[13.5px] text-muted">
        Uygulamada bulunan bilgiler aşağıya getirildi; lütfen doğrulayın veya düzeltin. Eksik bilgiler sarı işaretli. Tutarları bugünün parasıyla yazın.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Hedefiniz" htmlFor="j-goal">
          <Select id="j-goal" value={f.goal} onChange={(e) => set('goal', e.target.value as JourneyGoal)}>
            {(Object.keys(JOURNEY_GOAL_LABEL) as JourneyGoal[]).map((g) => (
              <option key={g} value={g}>
                {JOURNEY_GOAL_LABEL[g]}
              </option>
            ))}
          </Select>
        </Field>
        {f.goal === 'custom' ? (
          <Field label="Hedefin adı" htmlFor="j-goal-name">
            <Input id="j-goal-name" value={f.goalName} maxLength={60} onChange={(e) => set('goalName', e.target.value)} placeholder="Örn. Kendi işimi kurmak" />
          </Field>
        ) : (
          <div className="hidden md:block" />
        )}
        <Field label="Hedef süresi (yıl)" htmlFor="j-horizon">
          <Input id="j-horizon" inputMode="numeric" value={f.horizon} onChange={(e) => set('horizon', e.target.value.replace(/\D/g, ''))} />
        </Field>
        <Field
          label={<span className="inline-flex items-center gap-2">Hedefte aylık yaşam gideri (TL) {fromApp(facts.averageExpenseKurus !== null)}</span>}
          htmlFor="j-target"
          hint={facts.averageExpenseKurus !== null ? `Son ${facts.expenseMonths} dönemin ortalama gideri: ${formatKurus(facts.averageExpenseKurus)}` : 'Son dönemlerde gider kaydı bulunamadı.'}
        >
          <Input id="j-target" inputMode="decimal" value={f.target} onChange={(e) => set('target', e.target.value)} placeholder="0,00" />
        </Field>
        <Field label={<span className="inline-flex items-center gap-2">Aylık net gelir (TL) {fromApp(!!initial)}</span>} htmlFor="j-income" hint="Uygulama gelir kaydı tutmaz; bu bilgiyi siz girersiniz.">
          <Input id="j-income" inputMode="decimal" value={f.income} onChange={(e) => set('income', e.target.value)} placeholder="0,00" />
        </Field>
        <Field
          label={<span className="inline-flex items-center gap-2">Zorunlu aylık giderler (TL) {fromApp(facts.recurringMonthlyKurus > 0 || !!initial)}</span>}
          htmlFor="j-essential"
          hint={facts.recurringMonthlyKurus > 0 ? `Düzenli ödemelerin aylık toplamı: ${formatKurus(facts.recurringMonthlyKurus)}. Kira, fatura, gıda gibi vazgeçilemeyen giderleri ekleyin.` : 'Kira, fatura, gıda, ulaşım gibi vazgeçilemeyen giderler.'}
        >
          <Input id="j-essential" inputMode="decimal" value={f.essential} onChange={(e) => set('essential', e.target.value)} placeholder="0,00" />
        </Field>
        <Field label="Gelir düzeni" htmlFor="j-stability">
          <Select id="j-stability" value={f.stability} onChange={(e) => set('stability', e.target.value as IncomeStability)}>
            {(Object.keys(STABILITY_LABEL) as IncomeStability[]).map((k) => (
              <option key={k} value={k}>
                {STABILITY_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Hedef sermayeden yıllık çekim oranı (%)" htmlFor="j-withdrawal" hint="Hedef birikim = yıllık yaşam gideri ÷ bu oran. Oran düştükçe gereken birikim artar.">
          <Input id="j-withdrawal" inputMode="decimal" value={f.withdrawal} onChange={(e) => set('withdrawal', e.target.value)} />
        </Field>
      </div>
      <fieldset className="mt-4">
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
      <div className="mt-4 rounded-2xl bg-surface-2 p-3.5 text-[13px] text-muted">
        <p className="font-medium text-ink">Uygulamadaki diğer bilgiler</p>
        <p className="mt-1">
          Hızlı kullanılabilir birikim {formatKurus(facts.liquidKurus)} · toplam varlık {formatKurus(facts.assetsKurus)} · borç {formatKurus(facts.debtsKurus)}
          {!facts.hasAssets && (
            <>
              {' '}
              · <Link to="/varliklar" className="font-medium text-accent">Varlıklarım boş, eklemek için tıklayın</Link>
            </>
          )}
        </p>
      </div>
      {error && (
        <p className="mt-3 text-[13px] font-medium text-danger" role="alert">
          {error}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" loading={busy} onClick={() => void save()} disabled={!settings}>
          {initial ? 'Kaydet' : 'Doğruladım, rotamı oluştur'}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Vazgeç
          </Button>
        )}
      </div>
    </Card>
  )
}

// ---------- Rota ----------

const yearOf = (months: number | null) => (months === null ? null : Number(addMonthsClamped(todayIso(), months).slice(0, 4)))

function Route({ profile, facts, onEdit }: { profile: JourneyProfile; facts: JourneyFacts; onEdit: () => void }) {
  const repo = useRepo()
  const { toast } = useUi()
  const j = useMemo(() => buildJourney(profile, facts), [profile, facts])
  const [celebrate, setCelebrate] = useState<StageId[]>([])

  // Yeni tamamlanan aşamalar bir kez kutlanır
  useEffect(() => {
    const fresh = j.stages.filter((s) => s.done && !profile.celebrated.includes(s.id)).map((s) => s.id)
    if (!fresh.length) return
    setCelebrate(fresh)
    const titles = j.stages.filter((s) => fresh.includes(s.id)).map((s) => s.title)
    toast(`Kilometre taşı: ${titles.join(', ')} tamamlandı!`)
    void repo.saveSettings({ journey: { ...profile, celebrated: [...profile.celebrated, ...fresh] } }).catch(() => {})
  }, [j, profile, repo, toast])

  const ind = j.indicators
  const goalLabel = profile.goal === 'custom' && profile.goalName ? profile.goalName : JOURNEY_GOAL_LABEL[profile.goal]
  const years = [yearOf(ind.route.optimistic), yearOf(ind.route.mid), yearOf(ind.route.cautious)]
  const deadline = Number(todayIso().slice(0, 4)) + profile.horizonYears

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="p-5" aria-label="Finansal güvence">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-muted">
            <ShieldCheck className="size-4 text-accent" /> Finansal güvence
          </div>
          <div className="num mt-2 font-display text-2xl font-semibold">{ind.securityMonths === null ? '—' : `${ind.securityMonths.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} ay`}</div>
          <p className="mt-1 text-[12.5px] text-muted">Hızlı kullanılabilir birikiminiz ({formatKurus(facts.liquidKurus)}) zorunlu giderlerinizi bu kadar süre karşılar.</p>
        </Card>
        <Card className="p-5" aria-label="Hedef ilerlemesi">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-muted">
            <Target className="size-4 text-accent" /> Hedef ilerlemesi
          </div>
          <div className="num mt-2 font-display text-2xl font-semibold">%{(ind.goalRatio * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}</div>
          <p className="mt-1 text-[12.5px] text-muted">
            {formatKurus(ind.progressKurus)} / {formatKurus(ind.goalKurus)}
          </p>
          {facts.hasAssets && (
            <p className="num mt-1 text-[12px] text-subtle">
              Kendi birikiminiz {formatKurus(facts.contributedKurus)} · piyasa değişimi {facts.marketGainKurus >= 0 ? '+' : '−'}
              {formatKurus(Math.abs(facts.marketGainKurus))}
            </p>
          )}
        </Card>
        <Card className="p-5" aria-label="Tahmini rota">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-muted">
            <TrendingUp className="size-4 text-accent" /> Tahmini rota
          </div>
          <div className="num mt-2 font-display text-2xl font-semibold">
            {years[0] === null ? 'Ulaşılamıyor' : years[0] === years[2] ? years[0] : `${years[0]} – ${years[2] ?? '…'}`}
          </div>
          <p className="mt-1 text-[12.5px] text-muted">
            {ind.monthlySavingKurus > 0 ? `Ayda ${formatKurus(ind.monthlySavingKurus)} birikimle, olumlu ve temkinli varsayımlar arasında.` : 'Şu an aylık birikim yok; gelir ve gider dengesi kurulunca tarih aralığı oluşur.'}
          </p>
          {years[1] !== null && <p className="mt-1 text-[12px] text-subtle">Orta varsayım: {years[1]} · hedef süreniz: {deadline}</p>}
        </Card>
      </div>

      <Card className="p-5" aria-label="Rota">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <Flag className="size-5 text-accent" /> {goalLabel} rotası
          </h2>
          <Button size="sm" variant="ghost" icon={<Pencil className="size-4" />} onClick={onEdit}>
            Bilgilerimi düzenle
          </Button>
        </div>
        <RouteMap j={j} celebrate={celebrate} />
      </Card>

      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2" aria-label="Aşamalar">
        {j.stages.map((s, i) => (
          <StageCard key={s.id} s={s} n={i + 1} />
        ))}
      </ul>

      <Alert tone="info" icon={<Info className="size-4" />}>
        Bu rota, girdiğiniz bilgiler ve şu varsayımlarla hesaplanan bir tahmindir: birikiminiz enflasyon kadar artar; yıllık reel getiri temkinli %{SCENARIOS.cautious.realReturnPct}, orta %{SCENARIOS.mid.realReturnPct}, olumlu %{SCENARIOS.optimistic.realReturnPct}; hedef birikim, yıllık giderin %{profile.withdrawalRatePct.toLocaleString('tr-TR')} çekim oranına bölünmesiyle bulunur. Getiri veya tarih garantisi değildir ve yatırım tavsiyesi içermez. Farklı varsayımları{' '}
        <Link to="/senaryolar" className="font-medium text-accent">
          Senaryolar
        </Link>{' '}
        sayfasında deneyebilirsiniz.
      </Alert>
    </div>
  )
}

function StageCard({ s, n }: { s: Stage; n: number }) {
  return (
    <li className={cn('rounded-2xl border bg-surface p-4', s.done ? 'border-accent/40' : 'border-line')}>
      <div className="flex items-start gap-3">
        <span className={cn('grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-semibold', s.done ? 'bg-accent text-white' : 'bg-surface-2 text-muted')} aria-hidden>
          {s.done ? <CheckCircle2 className="size-4" /> : n}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-ink">{s.title}</h3>
            {s.done ? <Badge tone="accent">Tamamlandı</Badge> : <Badge tone="neutral">%{Math.round(s.progress * 100)}</Badge>}
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
                r={20}
                fill={s.done ? 'var(--accent)' : 'var(--surface)'}
                stroke={s.done ? 'var(--accent)' : 'var(--border-strong)'}
                strokeWidth={3}
                initial={party && !reduced ? { scale: 0.4 } : false}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 12, delay: 1.2 }}
                style={{ transformOrigin: `${pt.x}px ${pt.y}px` }}
              />
              <text x={pt.x} y={pt.y + 6} textAnchor="middle" fontSize={17} fontWeight={700} fill={s.done ? '#fff' : 'var(--muted)'}>
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
      <ol className="relative mt-1 h-12 text-center text-[11px] leading-tight text-muted sm:h-8 sm:text-[13px]" aria-hidden>
        {j.stages.map((s, i) => (
          <li
            key={s.id}
            className={cn('absolute top-0 w-[17%] -translate-x-1/2', s.done && 'font-semibold text-ink')}
            style={{ left: `${Math.min(90, Math.max(10, (stops[i + 1]?.x ?? PATH_X0 + ((PATH_X1 - PATH_X0) * (i + 1)) / n) / 10))}%` }}
          >
            {s.title}
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

