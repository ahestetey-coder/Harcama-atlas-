import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  ChartLine,
  Coins,
  Copy,
  CreditCard,
  DollarSign,
  Flag,
  Hexagon,
  Hourglass,
  Landmark,
  Lock,
  MapPin,
  Mountain,
  Pause,
  PiggyBank,
  Play,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Sprout,
  Sun,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Unlink,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import qrcode from 'qrcode-generator'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { ExtraSavingLines, type ExtraSavingRow } from '../components/charts/Charts'
import { Logo } from '../components/AppShell'
import { Slider } from '../components/Slider'
import { AnimatedKurus, AnimatedNumber } from '../components/ui/AnimatedMoney'
import { Badge, Button, Card, Checkbox, Field, Input, Spinner } from '../components/ui/primitives'
import { leadsAvailable, rememberLeadCode, rememberLocalLead, submitLead } from '../cloud/freedomLead'
import { APP_CONFIG } from '../config/app'
import { DEFAULT_INFLATION_PCT, nominalPct, SAVING_GROWTH_PCT } from '../domain/assumptions'
import { SCENARIOS } from '../domain/journey'
import { formatKurusCompact } from '../domain/money'
import { newLeadCode, QUICK_QUESTIONS, QUICK_TEST_VERSION, quickResult, quickScenario, reachRange, type QuickAnswers, type QuickQuestion, type QuickResult } from '../domain/quickTest'
import { cn } from '../lib/cn'
import { useReducedMotion } from '../lib/hooks'
import { AuroraBackground } from './AuthScreen'
import { LevelRing } from '../components/LevelRing'

/**
 * Girişsiz web testi (#/harita): 10 soru, iki ara durak, iletişim izni, sonuç ve uygulamaya geçiş.
 * Sonuç uygulamanın kendi Özgürlük Rotası motoruyla (8 aşama) hesaplanır; uygulamada aynı cevaplar
 * Finansal özgürlük testine ön doldurma olarak gelir.
 */

type Screen = 'intro' | 'quiz' | 'summit' | 'half' | 'calc' | 'gate' | 'result'
type Draft = Partial<Omit<QuickAnswers, 'v'>> & { hayal: number; nerede: QuickAnswers['nerede'] }

const ICONS: Record<string, ReactNode> = {
  sun: <Sun />,
  unlink: <Unlink />,
  hourglass: <Hourglass />,
  shield: <ShieldCheck />,
  check: <CheckCircle2 />,
  card: <CreditCard />,
  calendar: <CalendarClock />,
  alert: <TriangleAlert />,
  bank: <Landmark />,
  dollar: <DollarSign />,
  gold: <Coins />,
  chart: <ChartLine />,
  hex: <Hexagon />,
  piggy: <PiggyBank />,
  down: <TrendingDown />,
  pause: <Pause />,
  up: <TrendingUp />,
}
const EASE = [0.2, 0.8, 0.2, 1] as const
const year0 = new Date().getFullYear()
const yearAt = (months: number) => year0 + Math.ceil(months / 12)
const tl = (n: number) => `${Math.round(n).toLocaleString('tr-TR')} TL`

/** Uygulama içinde çözülen test: iletişim adımı yok, sonuç cihaza kaydedilir ve sonraki adım uygulamaya göre değişir. */
export interface InAppTest {
  name?: string
  onSave: (answers: QuickAnswers) => Promise<void>
  renderNext: (result: QuickResult) => ReactNode
  /** Sonucun üstünde, kaydırmadan görünen kısa yönlendirme (paket ya da rota kurulumu). */
  renderTeaser?: (result: QuickResult) => ReactNode
}

export default function FreedomMapPage({ inApp }: { inApp?: InAppTest } = {}) {
  const reduced = useReducedMotion()
  const [screen, setScreen] = useState<Screen>('intro')
  const [idx, setIdx] = useState(0)
  const [draft, setDraft] = useState<Draft>({ hayal: 60000, nerede: [] })
  const [seen, setSeen] = useState({ summit: false, half: false })
  const [lead, setLead] = useState<{ name: string; code: string; saved: 'ok' | 'fail' | 'local' } | null>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const web = !inApp

  useEffect(() => {
    if (web) document.title = `Finansal Harita Testi · ${APP_CONFIG.name}`
    topRef.current?.scrollIntoView({ block: 'start' })
    window.scrollTo(0, 0)
    // Yalnızca ekran ya da soru değişince başa döner; sayfa yeniden çizildiğinde (ör. eşitleme) kaydırma korunur
  }, [screen, idx, web])

  const answers = useMemo<QuickAnswers | null>(() => (draft.dusus ? ({ v: QUICK_TEST_VERSION, ...draft } as QuickAnswers) : null), [draft])
  const result = useMemo(() => (answers && (screen === 'gate' || screen === 'result') ? quickResult(answers) : null), [answers, screen])

  const skip = (i: number) => QUICK_QUESTIONS[i]?.id === 'nerede' && draft.birikim === 'b0'
  const next = () => {
    let j = idx + 1
    if (skip(j)) {
      setDraft((d) => ({ ...d, nerede: [] }))
      j++
    }
    const id = QUICK_QUESTIONS[idx].id
    if (id === 'hayal' && !seen.summit) {
      setSeen((s) => ({ ...s, summit: true }))
      setIdx(j)
      return setScreen('summit')
    }
    if (id === 'acil' && !seen.half) {
      setSeen((s) => ({ ...s, half: true }))
      setIdx(j)
      return setScreen('half')
    }
    if (j >= QUICK_QUESTIONS.length) return setScreen('calc')
    setIdx(j)
  }
  const back = () => {
    if (idx === 0) return setScreen('intro')
    let j = idx - 1
    if (skip(j)) j--
    setIdx(j)
  }
  const restart = () => {
    setDraft({ hayal: 60000, nerede: [] })
    setSeen({ summit: false, half: false })
    setIdx(0)
    setScreen('quiz')
  }

  return (
    <div className={cn('relative', !inApp && 'min-h-dvh')} ref={topRef}>
      {!inApp && <AuroraBackground />}
      <div className={cn('relative mx-auto flex max-w-2xl flex-col gap-6', !inApp && 'px-4 pb-16 pt-[calc(1.25rem+env(safe-area-inset-top))] sm:pt-8')}>
        {inApp ? (
          screen === 'quiz' && <span className="num -mb-3 text-[12.5px] font-medium text-muted">Adım {idx + 1}/{QUICK_QUESTIONS.length}</span>
        ) : (
          <header className="flex items-center justify-between gap-3">
            <a href="#/" aria-label={`${APP_CONFIG.name} ana sayfa`}>
              <Logo />
            </a>
            {screen === 'quiz' && <span className="num text-[12.5px] font-medium text-muted">Adım {idx + 1}/{QUICK_QUESTIONS.length}</span>}
          </header>
        )}
        <AnimatePresence mode="wait" initial={false}>
          <motion.main
            key={screen === 'quiz' ? `q${idx}` : screen}
            initial={reduced ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, y: -10 }}
            transition={{ duration: 0.28, ease: EASE }}
            className="flex flex-col gap-6"
          >
            {screen === 'intro' && <Intro onStart={() => setScreen('quiz')} />}
            {screen === 'quiz' && <Question q={QUICK_QUESTIONS[idx]} idx={idx} draft={draft} setDraft={setDraft} onNext={next} onBack={back} />}
            {screen === 'summit' && <SummitBreak hayal={draft.hayal} onNext={() => setScreen('quiz')} />}
            {screen === 'half' && <HalfBreak draft={draft} onNext={() => setScreen('quiz')} />}
            {screen === 'calc' && (
              <Calculating
                onDone={() => {
                  if (!inApp || !answers) return setScreen('gate')
                  // Uygulamada iletişim adımı yok: cevaplar cihazdaki ayarlara yazılır, sonuç hemen açılır
                  inApp
                    .onSave(answers)
                    .then(() => setLead({ name: inApp.name ?? '', code: '', saved: 'local' }))
                    .catch(() => setLead({ name: inApp.name ?? '', code: '', saved: 'fail' }))
                    .finally(() => setScreen('result'))
                }}
              />
            )}
            {screen === 'gate' && result && answers && (
              <Gate
                result={result}
                onSubmit={async (name, email, marketing) => {
                  let code = newLeadCode()
                  let saved: 'ok' | 'fail' | 'local' = 'local'
                  if (leadsAvailable()) {
                    try {
                      code = await submitLead({
                        name,
                        email,
                        answers,
                        marketing,
                        summary: { level: result.level, archetype: result.archetype.name, place: result.place.name, reachYear: result.reach.midMonths === null ? null : yearAt(result.reach.midMonths), goalTl: Math.round(result.goalKurus / 100) },
                      })
                      saved = 'ok'
                    } catch {
                      saved = 'fail'
                    }
                  }
                  rememberLeadCode(code)
                  rememberLocalLead({ code, name, answers, createdAt: new Date().toISOString() })
                  setLead({ name, code, saved })
                  setScreen('result')
                }}
              />
            )}
            {screen === 'result' && result && answers && lead && <Result result={result} name={lead.name} code={lead.code} saved={lead.saved} onRestart={restart} next={inApp?.renderNext(result)} teaser={inApp?.renderTeaser?.(result)} />}
          </motion.main>
        </AnimatePresence>
      </div>
    </div>
  )
}

// ---------- Rota çizimi (koyu kahraman kartında) ----------

const ROUTE_D = 'M24 262 C 110 230, 150 268, 228 236 S 330 190, 372 196 S 452 150, 492 112 S 540 78, 556 64'

/** Dağ silueti, dolan rota, yürüyen işaret ve isteğe bağlı sisli zirve. */
function RouteArt({ progress, fog, label, className }: { progress: number; fog?: ReactNode; label?: string; className?: string }) {
  const reduced = useReducedMotion()
  const gid = useId().replace(/:/g, '')
  const pathRef = useRef<SVGPathElement>(null)
  const [pin, setPin] = useState<{ x: number; y: number } | null>(null)
  useEffect(() => {
    const p = pathRef.current
    if (!p) return
    const L = p.getTotalLength()
    const to = Math.max(0, Math.min(1, progress))
    if (reduced) {
      const pt = p.getPointAtLength(to * L)
      setPin({ x: pt.x, y: pt.y })
      return
    }
    let raf = 0
    const t0 = performance.now()
    const from = 0.02
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 1600)
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
      const pt = p.getPointAtLength((from + (to - from) * e) * L)
      setPin({ x: pt.x, y: pt.y })
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [progress, reduced])
  return (
    <div className={cn('hero-gradient relative overflow-hidden rounded-[1.25rem] text-white shadow-card', className)}>
      <svg viewBox="0 0 600 300" className="block h-auto w-full" role="img" aria-label={label ?? 'Zirveye çıkan finansal özgürlük rotası'}>
        <defs>
          <linearGradient id={`${gid}r`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#10b981" />
            <stop offset="1" stopColor="#22d3ee" />
          </linearGradient>
          <filter id={`${gid}b`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="18" />
          </filter>
        </defs>
        <path d="M0 300 L120 170 L190 220 L290 120 L360 175 L420 120 L556 40 L600 70 L600 300 Z" fill="rgb(255 255 255 / 0.05)" />
        <path d="M0 300 L80 230 L170 260 L260 200 L340 245 L420 205 L520 240 L600 210 L600 300 Z" fill="rgb(255 255 255 / 0.06)" />
        <path d={ROUTE_D} fill="none" stroke="rgb(255 255 255 / 0.12)" strokeWidth={8} strokeLinecap="round" />
        <path ref={pathRef} d={ROUTE_D} fill="none" stroke={`url(#${gid}r)`} strokeWidth={3} strokeDasharray="8 7" strokeLinecap="round" />
        {[0.03, 0.17, 0.31, 0.45, 0.58, 0.72, 0.86].map((f, i) => (
          <StopDot key={i} pathRef={pathRef} at={f} done={f <= progress} />
        ))}
        <g transform="translate(556 64)">
          <line x1={0} y1={0} x2={0} y2={-34} stroke="white" strokeWidth={2.5} strokeLinecap="round" />
          <path d="M0 -34h22l-6 7 6 7H0z" fill="#34d399" />
        </g>
        {fog && (
          <g aria-hidden>
            <ellipse cx={540} cy={70} rx={150} ry={92} fill="#0f1b30" opacity={0.95} filter={`url(#${gid}b)`} />
            <ellipse cx={470} cy={120} rx={110} ry={60} fill="#0f1b30" opacity={0.8} filter={`url(#${gid}b)`} />
          </g>
        )}
        {pin && (
          <g transform={`translate(${pin.x.toFixed(1)} ${pin.y.toFixed(1)})`}>
            {!reduced && <circle r={10} fill="#34d399" opacity={0.35} className="origin-center animate-ping [transform-box:fill-box]" />}
            <path d="M0 0C-8-11-12-15-12-23a12 12 0 1 1 24 0C12-15 8-11 0 0Z" fill="white" />
            <circle cy={-23} r={4.5} fill="#10b981" />
          </g>
        )}
      </svg>
      {fog && <div className="pointer-events-none absolute right-[4%] top-[8%] text-right">{fog}</div>}
    </div>
  )
}

function StopDot({ pathRef, at, done }: { pathRef: React.RefObject<SVGPathElement | null>; at: number; done: boolean }) {
  const [p, setP] = useState<{ x: number; y: number } | null>(null)
  useEffect(() => {
    const el = pathRef.current
    if (!el) return
    const pt = el.getPointAtLength(at * el.getTotalLength())
    setP({ x: pt.x, y: pt.y })
  }, [pathRef, at])
  if (!p) return null
  return <circle cx={p.x} cy={p.y} r={6} fill={done ? '#34d399' : '#0f1b30'} stroke="#34d399" strokeWidth={2.5} />
}

function FogYear({ small }: { small?: boolean }) {
  return (
    <div className="leading-none">
      <div className={cn('font-medium uppercase tracking-[0.16em] text-white/80', small ? 'text-[9px]' : 'text-[10px] sm:text-[11px]')}>Özgürlük yılın</div>
      <div className={cn('num mt-1 bg-gradient-to-r from-emerald-300 to-cyan-300 bg-clip-text font-display font-extrabold text-transparent', small ? 'text-3xl' : 'text-4xl sm:text-5xl')}>20??</div>
    </div>
  )
}

// ---------- Açılış ----------

function Intro({ onStart }: { onStart: () => void }) {
  return (
    <>
      <div className="flex flex-col gap-3">
        <Badge tone="accent" className="self-start">
          Finansal Özgürlük Testi · ücretsiz
        </Badge>
        <h1 className="font-display text-[2.15rem] font-extrabold leading-[1.05] tracking-tight text-ink sm:text-5xl">Finansal özgürlüğüne ne kadar uzaksın?</h1>
        <p className="max-w-xl text-[15px] leading-relaxed text-muted sm:text-base">
          Çalışmak zorunda olmadığın gün bir hayal değil, bir hesap. <span className="font-semibold text-ink">O günün hangi yıla düştüğünü</span> ve oraya giden rotanı 10 soruda çıkaralım.
        </p>
      </div>
      <RouteArt progress={0.42} fog={<FogYear />} label="Zirvesinde gizli bir özgürlük yılı olan rota" />
      <ul className="flex flex-wrap gap-x-6 gap-y-2.5 text-[14px] font-medium text-ink">
        {[
          [<MapPin key="m" />, 'Bugünkü konumun'],
          [<Mountain key="t" />, 'Gereken birikim'],
          [<Flag key="f" />, 'Özgürlük yılın'],
        ].map(([icon, label]) => (
          <li key={label as string} className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-accent-soft text-accent [&>svg]:size-4">{icon}</span>
            {label}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <Button variant="primary" size="lg" onClick={onStart} icon={<ArrowRight className="size-4" />} className="flex-row-reverse">
          Özgürlük rotamı çıkar
        </Button>
        <span className="text-[13px] text-subtle">2 dakika · Tam rakam gerekmez</span>
      </div>
    </>
  )
}

// ---------- Sorular ----------

function Question({ q, idx, draft, setDraft, onNext, onBack }: { q: QuickQuestion; idx: number; draft: Draft; setDraft: (f: (d: Draft) => Draft) => void; onNext: () => void; onBack: () => void }) {
  const reduced = useReducedMotion()
  const pick = (v: string) => {
    setDraft((d) => ({ ...d, [q.id]: v }))
    setTimeout(onNext, reduced ? 0 : 220)
  }
  const value = (draft as Record<string, unknown>)[q.id]
  const tile = 'rounded-2xl border bg-surface text-left font-medium text-ink shadow-card transition-[border-color,background-color,transform] duration-150 hover:border-accent active:scale-[0.99]'
  return (
    <>
      <ol className="grid gap-1" style={{ gridTemplateColumns: `repeat(${QUICK_QUESTIONS.length}, minmax(0, 1fr))` }} aria-label="İlerleme">
        {QUICK_QUESTIONS.map((x, i) => (
          <li key={x.id} className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <motion.div className="h-full rounded-full bg-accent" initial={false} animate={{ width: i <= idx ? '100%' : '0%' }} transition={{ duration: reduced ? 0 : 0.35 }} />
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-[1.6rem] font-bold leading-tight text-ink sm:text-3xl">{q.title}</h2>
        <p className="text-[14px] text-muted">{q.hint}</p>
      </div>

      {q.kind === 'cards' && (
        <div className="grid grid-cols-2 gap-3">
          {q.options.map((o) => (
            <button key={o.id} type="button" onClick={() => pick(o.id)} aria-pressed={value === o.id} className={cn(tile, 'flex min-h-32 flex-col gap-4 p-4', value === o.id ? 'border-accent bg-accent-soft' : 'border-line')}>
              <span className={cn('grid size-11 place-items-center rounded-xl [&>svg]:size-6', value === o.id ? 'bg-accent text-white' : 'bg-surface-2 text-accent')}>{ICONS[o.icon ?? '']}</span>
              <span className="text-[15px] leading-snug">{o.label}</span>
            </button>
          ))}
        </div>
      )}

      {q.kind === 'list' && (
        <div className="flex flex-col gap-2.5">
          {q.options.map((o, i) => (
            <button key={o.id} type="button" onClick={() => pick(o.id)} aria-pressed={value === o.id} className={cn(tile, 'flex items-center gap-3.5 px-4 py-3.5', value === o.id ? 'border-accent bg-accent-soft' : 'border-line')}>
              <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl [&>svg]:size-5', value === o.id ? 'bg-accent text-white' : 'bg-surface-2 text-accent')}>
                {o.icon ? ICONS[o.icon] : <Bars n={q.options.length} i={i} on={value === o.id} />}
              </span>
              <span className="min-w-0 flex-1 text-[15px]">{o.label}</span>
              <ArrowRight className="size-4 shrink-0 text-subtle" aria-hidden />
            </button>
          ))}
        </div>
      )}

      {q.kind === 'multi' && (
        <div className="flex flex-wrap gap-2.5">
          {q.options.map((o) => {
            const on = draft.nerede.includes(o.id)
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={on}
                onClick={() => setDraft((d) => ({ ...d, nerede: on ? d.nerede.filter((x) => x !== o.id) : [...d.nerede, o.id] }))}
                className={cn(tile, 'inline-flex items-center gap-2 rounded-full px-4 py-2.5 [&>svg]:size-4', on ? 'border-accent bg-accent-soft text-accent-strong dark:text-accent' : 'border-line')}
              >
                {ICONS[o.icon ?? '']}
                {o.label}
              </button>
            )
          })}
        </div>
      )}

      {q.kind === 'slider' && (
        <Card className="flex flex-col gap-4 p-5">
          <div className="num font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
            {tl(draft.hayal)} <span className="text-base font-semibold text-muted">/ ay</span>
          </div>
          <Slider id="q-hayal" label="Aylık pasif gelir hedefi" value={draft.hayal} min={q.min} max={q.max} step={q.step} onChange={(v) => setDraft((d) => ({ ...d, hayal: v }))} display={(v) => tl(v)} />
          <div className="flex items-start gap-3 rounded-xl bg-accent-soft px-3.5 py-3 text-[13.5px] text-ink">
            <Mountain className="mt-0.5 size-4 shrink-0 text-accent" />
            <span>
              Kabaca <span className="num font-semibold">{tl(draft.hayal * 300)}</span> birikim demek: yıllık ihtiyacının 25 katı. Kesin hedefini sonuçta, senin bilgilerinle hesaplayacağız.
            </span>
          </div>
        </Card>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={onBack} icon={<ArrowLeft className="size-4" />}>
          Geri
        </Button>
        {(q.kind === 'slider' || q.kind === 'multi') && (
          <Button variant="primary" onClick={onNext} icon={<ArrowRight className="size-4" />} className="flex-row-reverse">
            Devam
          </Button>
        )}
      </div>
    </>
  )
}

/** Sıralı seçeneklerde küçük basamak göstergesi. */
function Bars({ n, i, on }: { n: number; i: number; on: boolean }) {
  return (
    <span className="flex h-5 items-end gap-0.5" aria-hidden>
      {Array.from({ length: n }, (_, k) => (
        <span key={k} className={cn('w-1 rounded-sm', k <= i ? (on ? 'bg-white' : 'bg-accent') : on ? 'bg-white/35' : 'bg-line-strong')} style={{ height: `${6 + (k * 14) / Math.max(1, n - 1)}px` }} />
      ))}
    </span>
  )
}

// ---------- Ara duraklar ----------

function useAutoNext(onNext: () => void, ms: number) {
  const reduced = useReducedMotion()
  useEffect(() => {
    if (reduced) return
    const t = setTimeout(onNext, ms)
    return () => clearTimeout(t)
  }, [onNext, ms, reduced])
  return reduced
}

function BreakNav({ label, onNext, ms, reduced }: { label: string; onNext: () => void; ms: number; reduced: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="h-1 min-w-32 flex-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <motion.div className="h-full rounded-full bg-accent" initial={{ width: reduced ? '100%' : '0%' }} animate={{ width: '100%' }} transition={{ duration: reduced ? 0 : ms / 1000, ease: 'linear' }} />
      </div>
      <Button variant="primary" onClick={onNext} icon={<ArrowRight className="size-4" />} className="flex-row-reverse">
        {label}
      </Button>
    </div>
  )
}

function SummitBreak({ hayal, onNext }: { hayal: number; onNext: () => void }) {
  const reduced = useAutoNext(onNext, 9000)
  return (
    <>
      <Badge tone="accent" className="self-start">
        Ara durak · Zirven belirdi
      </Badge>
      <div className="hero-gradient relative overflow-hidden rounded-[1.25rem] shadow-card">
        <svg viewBox="0 0 600 260" className="block h-auto w-full" role="img" aria-label="Sisin açıldığı ve zirveye bayrak dikilen dağ">
          <path d="M-20 260 L150 140 L220 185 L300 120 L390 260 Z" fill="rgb(255 255 255 / 0.06)" />
          <path d="M110 260 L300 62 L360 120 L420 82 L620 260 Z" fill="rgb(255 255 255 / 0.1)" stroke="rgb(52 211 153 / 0.5)" strokeWidth={1.5} />
          <path d="M272 92 L300 62 L322 88 L310 100 L296 90 L284 104 Z" fill="white" opacity={0.9} />
          <motion.line x1={300} y1={64} x2={300} y2={22} stroke="white" strokeWidth={3} strokeLinecap="round" initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 1.6, duration: 0.5 }} />
          <motion.path d="M300 22h34l-8 9 8 9h-34z" fill="#34d399" initial={reduced ? false : { opacity: 0, scaleX: 0.2 }} animate={{ opacity: 1, scaleX: 1 }} style={{ transformOrigin: '300px 31px' }} transition={{ delay: 2.1, duration: 0.4 }} />
          <motion.g initial={reduced ? false : { opacity: 1, y: 0 }} animate={{ opacity: 0, y: -30 }} transition={{ delay: 0.3, duration: 1.8, ease: 'easeOut' }}>
            <ellipse cx={300} cy={90} rx={220} ry={72} fill="#0f1b30" />
            <ellipse cx={200} cy={150} rx={170} ry={55} fill="#0f1b30" />
            <ellipse cx={430} cy={140} rx={170} ry={60} fill="#0f1b30" />
          </motion.g>
        </svg>
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-3xl font-bold text-ink">Zirven belirdi.</h2>
        <AnimatedKurus value={hayal * 300 * 100} className="num font-display text-4xl font-extrabold tracking-tight text-accent sm:text-5xl" />
        <p className="text-[15px] leading-relaxed text-muted">
          Ayda <span className="font-semibold text-ink">{tl(hayal)}</span> pasif gelir için gereken birikim kabaca bu. Büyük görünüyor; ama bu dağa tek hamlede değil, duraklarla çıkılır. Şimdi neredesin, bakalım.
        </p>
      </div>
      <BreakNav label="Konumumu bul" onNext={onNext} ms={9000} reduced={reduced} />
    </>
  )
}

function halfTip(d: Draft): { title: string; text: string; icon: ReactNode } {
  const income = { g1: 20000, g2: 37500, g3: 75000, g4: 150000, g5: 260000 }[d.gelir ?? 'g2']
  const rate = { eksi: -0.05, az: 0.05, orta: 0.15, iyi: 0.3 }[d.kalan ?? 'az']
  const surplus = income * rate > 0 ? ` Tahmini aylık fazlan ~${tl(Math.round((income * rate) / 250) * 250)}.` : ''
  if (d.kalan === 'eksi') return { title: 'Ay sonunda açık veriyorsun.', text: 'İyi haber: Rotanın ilk durağı tam olarak bunu çözmek için var.', icon: <TriangleAlert /> }
  if (d.borc === 'zor') return { title: 'Taksitler seni zorluyor.', text: 'Pahalı borcu doğru sırayla kapatmak, zirveye giden en hızlı kestirme olabilir.', icon: <Unlink /> }
  if (d.acil === 'a0') return { title: 'Acil fonun 1 aydan az.', text: 'İlk kalkanını kurmak rotanın ilk hedeflerinden biri olacak; sonraki her adımı güvenceye alır.', icon: <ShieldCheck /> }
  if (d.kalan === 'iyi') return { title: 'Rotanın motoru güçlü.', text: `Gelirinin %20'sinden fazlasını biriktiriyorsun.${surplus}`, icon: <TrendingUp /> }
  if (d.kalan === 'orta') return { title: 'İyi bir tempon var.', text: `Gelirinin yaklaşık %10–20'sini biriktiriyorsun.${surplus} Doğru yöne akarsa bu ciddi bir hız.`, icon: <TrendingUp /> }
  return { title: 'Birikim payın şimdilik küçük.', text: 'Harcamalarında bulacağın küçük bir pay bile varış yılını öne çeker.', icon: <Sprout /> }
}

function HalfBreak({ draft, onNext }: { draft: Draft; onNext: () => void }) {
  const reduced = useAutoNext(onNext, 9000)
  const tip = halfTip(draft)
  return (
    <>
      <Badge tone="accent" className="self-start">
        Ara durak · Yarıyı geçtin
      </Badge>
      <RouteArt progress={0.55} fog={<FogYear small />} label="Rotanın yarısına yürüyen işaret" />
      <h2 className="font-display text-3xl font-bold text-ink">Yarıyı geçtin.</h2>
      <Card className="flex items-start gap-3.5 border-accent/40 bg-accent-soft p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-white [&>svg]:size-5">{tip.icon}</span>
        <div className="text-[14.5px] leading-relaxed text-ink">
          <div className="font-semibold">İlk ipucun: {tip.title}</div>
          {tip.text}
        </div>
      </Card>
      <p className="text-[14.5px] text-muted">Son 4 soru birikimin ve yatırım karakterin hakkında. Sonra haritan çizilecek.</p>
      <BreakNav label="Son 4 soru" onNext={onNext} ms={9000} reduced={reduced} />
    </>
  )
}

function Calculating({ onDone }: { onDone: () => void }) {
  const reduced = useReducedMotion()
  const lines = ['Gelir ve gider dengesi ölçülüyor', 'Borç yükü ve acil fon hesaplanıyor', 'Hedef birikimin belirleniyor', 'Rotadaki konumun işaretleniyor']
  useEffect(() => {
    const t = setTimeout(onDone, reduced ? 300 : 2600)
    return () => clearTimeout(t)
  }, [onDone, reduced])
  return (
    <Card className="flex flex-col items-center gap-5 p-8 text-center">
      <Spinner className="size-8" />
      <h2 className="font-display text-2xl font-bold text-ink">Haritan çiziliyor…</h2>
      <ul className="flex flex-col gap-2 text-left text-[14px] text-muted">
        {lines.map((l, i) => (
          <motion.li key={l} className="flex items-center gap-2" initial={reduced ? false : { opacity: 0.2 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 + i * 0.5 }}>
            <Check className="size-4 text-accent" /> {l}
          </motion.li>
        ))}
      </ul>
    </Card>
  )
}

// ---------- İletişim izni ----------

function Gate({ result, onSubmit }: { result: QuickResult; onSubmit: (name: string, email: string, marketing: boolean) => Promise<void> }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [kvkk, setKvkk] = useState(false)
  const [marketing, setMarketing] = useState(false)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim().length < 2) return setError('Adını yaz.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('Geçerli bir e-posta adresi yaz.')
    if (!kvkk) return setError('Haritanı açmak için KVKK onayını işaretle.')
    setError(undefined)
    setBusy(true)
    try {
      await onSubmit(name.trim(), email.trim(), marketing)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <div className="flex flex-col gap-2">
        <Badge tone="accent" className="self-start">
          Konumun bulundu
        </Badge>
        <h2 className="font-display text-3xl font-bold text-ink">Haritan hazır, ama henüz sisli.</h2>
        <p className="text-[15px] text-muted">
          Arketipin <span className="font-semibold text-ink">{result.archetype.name}</span>. Seviyeni, özgürlük yılını ve hedef birikimini görmek için adını ve e-postanı yaz.
        </p>
      </div>
      <RouteArt progress={(result.journey.position / result.journey.stages.length) * 0.9 + 0.03} fog={<FogYear small />} label="Sisle kaplı rota; yalnızca konumun görünüyor" />
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {[
          ['Seviye', `• / ${result.journey.stages.length}`],
          ['Özgürlük yılı', '20••'],
          ['Hedef birikim', '•• TL'],
        ].map(([k, v]) => (
          <Card key={k} className="flex items-center justify-between gap-2 px-4 py-3">
            <div>
              <div className="text-[12px] text-muted">{k}</div>
              <div className="num text-lg font-semibold tracking-widest text-subtle">{v}</div>
            </div>
            <Lock className="size-4 text-subtle" />
          </Card>
        ))}
      </div>
      <Card as="div" className="p-5 sm:p-6">
        <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
          <h3 className="font-display text-lg font-semibold text-ink">Sisi kaldır, rotanı gör</h3>
          <Field label="Adın" htmlFor="g-name">
            <Input id="g-name" autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="E-posta adresin" htmlFor="g-email" hint="Uygulamaya bu e-postayla girersen haritan seni orada bekler.">
            <Input id="g-email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Checkbox
            checked={kvkk}
            onChange={setKvkk}
            label={
              <span>
                Bilgilerimin finansal durum analizi ve sonucumun bana iletilmesi amacıyla KVKK kapsamında işlenmesini kabul ediyorum.{' '}
                <a href={APP_CONFIG.privacyUrl} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
                  Aydınlatma metni
                </a>
              </span>
            }
          />
          <Checkbox checked={marketing} onChange={setMarketing} label={`${APP_CONFIG.name}'ndan haber ve kampanyaları e-postayla almak istiyorum. (İsteğe bağlı)`} />
          {error && (
            <p className="text-[13px] font-medium text-danger" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" size="lg" loading={busy} icon={<ArrowRight className="size-4" />} className="flex-row-reverse self-start">
            Haritamı aç
          </Button>
        </form>
      </Card>
    </>
  )
}

// ---------- Sonuç ----------

function Result({ result: r, name, code, saved, onRestart, next, teaser }: { result: QuickResult; name: string; code: string; saved: 'ok' | 'fail' | 'local'; onRestart: () => void; next?: ReactNode; teaser?: ReactNode }) {
  const j = r.journey
  const first = name.trim().split(' ')[0]
  const range = reachRange(r)
  const mid = r.reach.midMonths
  const continueUrl = `${APP_CONFIG.webUrl}#/yolculuk?kod=${code}`
  return (
    <>
      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-medium uppercase tracking-[0.12em] text-muted">{first ? `${first}, haritan` : 'Haritan'} açıldı · finansal arketipin</p>
        <h1 className="font-display text-[2.4rem] font-extrabold leading-none tracking-tight text-ink sm:text-5xl">{r.archetype.name}</h1>
        <p className="text-[15px] text-muted">{r.archetype.text}</p>
        <Badge tone="accent" className="self-start">
          <MapPin className="size-3.5" /> Konumun: {r.place.name}
        </Badge>
      </div>

      <Card className="relative overflow-hidden p-5">
        <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-accent/10 blur-3xl" aria-hidden />
        <div className="relative flex flex-wrap items-center gap-5">
          <LevelRing position={j.position} total={j.stages.length} level={j.level} />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] text-muted">Özgürlük yılın</div>
            <div className="num bg-gradient-to-r from-emerald-500 to-cyan-500 bg-clip-text font-display text-4xl font-extrabold tracking-tight text-transparent">{mid !== null ? <AnimatedNumber value={yearAt(mid)} from={year0} /> : (range ?? 'Henüz görünmüyor')}</div>
            <p className="mt-1 text-[13px] text-muted">
              {range
                ? `Bugünkü tempoyla, orta senaryoda. Olası aralık ${range}.`
                : 'Önce aylık dengenin kurulması gerekiyor.'}
            </p>
          </div>
        </div>
        {r.growth && r.growth.returnShare >= 0.05 && (
          <p className="relative mt-4 rounded-xl bg-accent-soft px-3.5 py-2.5 text-[13.5px] text-ink">
            <span className="font-semibold">Paran da senin için çalışıyor:</span> zirvedeki birikiminin yaklaşık %{Math.round(r.growth.returnShare * 100)}'i yatırdığın paradan değil, {r.growth.years} yıl boyunca biriken getiriden gelir.
          </p>
        )}
        <div className="relative mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-[13px]">
          <div>
            <div className="text-muted">Hedef birikim</div>
            <div className="num text-[17px] font-semibold text-ink">{formatKurusCompact(r.goalKurus)}</div>
          </div>
          <div>
            <div className="text-muted">Sıradaki durak</div>
            <div className="text-[17px] font-semibold text-ink">{j.current?.title ?? 'Rota tamam'}</div>
          </div>
        </div>
      </Card>

      {teaser ?? (
        <UnlockStrip
          title="Bu yıl bir tahmin. Gerçeğini gör."
          text="Uygulamada gerçek rakamlarınla kesin özgürlük yılın, borçsuzluk tarihin ve aylık planın çıkar."
          cta="Uygulamada netleştir"
          onClick={() => document.getElementById('devam')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />
      )}

      <RouteArt progress={(j.position / j.stages.length) * 0.9 + 0.03} label={`Rotada ${j.level}. seviyedesin`} />
      <p className="-mt-3 text-[13px] text-muted">{r.place.text}</p>

      <Simulator result={r} />

      <RoutePreview result={r} />

      <Card className="p-5">
        <h3 className="font-display text-base font-semibold text-ink">İlk 3 hamlen</h3>
        <ol className="mt-3 flex flex-col gap-3">
          <li className="grid grid-cols-[28px_1fr] gap-3 text-[14px] text-ink">
            <span className="num grid size-7 place-items-center rounded-full bg-accent text-[12px] font-bold text-white">1</span>
            {r.firstMove}
          </li>
          {[2, 3].map((n) => (
            <li key={n} className="grid grid-cols-[28px_1fr] gap-3">
              <span className="num grid size-7 place-items-center rounded-full border border-line bg-surface-2 text-[12px] font-bold text-muted">{n}</span>
              <div className="flex flex-col gap-1.5 pt-1">
                <span className="skeleton block h-2.5" style={{ width: n === 2 ? '82%' : '64%' }} aria-hidden />
                <span className="flex items-center gap-1.5 text-[11.5px] font-medium uppercase tracking-wide text-subtle">
                  <Lock className="size-3" /> {next ? 'Rota kurulumunda gerçek rakamlarınla açılır' : 'Gerçek rakamlarınla uygulamada açılır'}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      {r.insights.length > 0 && (
        <Card className="p-5">
          <h3 className="font-display text-base font-semibold text-ink">Haritanda öne çıkanlar</h3>
          <ul className="mt-3 flex flex-col gap-2.5 text-[14px] text-ink">
            {r.insights.map((i) => (
              <li key={i.text} className="flex items-start gap-2.5">
                <span className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', i.tone === 'danger' ? 'bg-danger' : i.tone === 'warning' ? 'bg-warning' : 'bg-accent')} />
                {i.text}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {next ?? <ContinueCard code={code} url={continueUrl} stage={j.current?.title ?? null} />}

      {saved === 'fail' && <p className="text-[13px] text-warning">{next ? 'Sonucun kaydedilemedi; testi yeniden çözmeyi dene.' : 'Sonucun sunucuya kaydedilemedi. Uygulamada devam kodunla bağlayabilirsin.'}</p>}
      <p className="text-[12px] leading-relaxed text-subtle">
        Sonuç verdiğin aralıklara ve {APP_CONFIG.name}'nın Özgürlük Rotası ölçütlerine dayanan bir tahmindir; tutarlar bugünün parasıyladır. Yatırım tavsiyesi değildir.
      </p>
      <Button variant="ghost" onClick={onRestart} icon={<RotateCcw className="size-4" />} className="self-start">
        Testi yeniden çöz
      </Button>
    </>
  )
}

function Simulator({ result }: { result: QuickResult }) {
  const income = Math.round(result.journey.plan.spendKurus / 100) + Math.max(0, Math.round(result.journey.plan.availableKurus / 100))
  const max = Math.max(5000, Math.round((income * 0.25) / 500) * 500)
  const [extra, setExtra] = useState(() => Math.min(max, Math.max(1000, Math.round((income * 0.05) / 500) * 500)))
  const s = useMemo(() => quickScenario(result, extra), [result, extra])
  const b = s.base.reachMonths
  const p = s.plus.reachMonths
  const horizon = Math.min(40, Math.max(10, Math.ceil(((b ?? p ?? 360) + 24) / 12)))
  const rows: ExtraSavingRow[] = useMemo(() => {
    const goal = result.goalKurus
    const at = (pts: typeof s.base.points, reach: number | null, y: number) => (reach !== null && y * 12 > reach + 11 ? null : (pts[y]?.realKurus ?? null))
    const sim = quickScenario(result, extra, horizon)
    return Array.from({ length: horizon + 1 }, (_, y) => ({ year: y, base: at(sim.base.points, sim.base.reachMonths, y), plus: at(sim.plus.points, sim.plus.reachMonths, y), target: goal }))
  }, [result, extra, horizon, s])
  let gain: ReactNode
  if (extra === 0) gain = <span>Kaydırıcıyı sağa çek; ayda biraz daha ayırırsan zirveye ne kadar erken varacağını gör.</span>
  else if (b !== null && p !== null) {
    const d = (b - p) / 12
    gain =
      d >= 0.1 ? (
        <span>
          <span className="font-display text-2xl font-extrabold text-ink">{d >= 1 ? `${(Math.round(d * 10) / 10).toLocaleString('tr-TR')} yıl` : `${Math.max(1, Math.round(d * 12))} ay`} erken.</span> Zirveye {yearAt(b)} yerine yaklaşık {yearAt(p)} yılında varırsın.
        </span>
      ) : (
        <span>Bu tutar varış yılını belirgin değiştirmiyor; biraz artırmayı dene.</span>
      )
  } else if (b === null && p !== null)
    gain = (
      <span>
        <span className="font-display text-2xl font-extrabold text-ink">Zirve görünür oldu.</span> Bu tutarla yaklaşık {yearAt(p)} yılında varırsın.
      </span>
    )
  else gain = <span>Bu tutarla da zirve görünmüyor. Önce aylık dengenin kurulması gerekiyor.</span>
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <h3 className="font-display text-xl font-bold text-ink">Geleceğini şimdi değiştir</h3>
        <p className="mt-1 text-[13.5px] text-muted">Harcamalarından her ay küçük bir tutar bulup birikime yönlendirdiğini düşün.</p>
      </div>
      <Slider id="sim-extra" label="Her ay fazladan ayıracağın" value={extra} min={0} max={max} step={500} onChange={setExtra} display={(v) => `+${tl(v)}`} />
      <div className="rounded-xl bg-accent-soft px-4 py-3 text-[14px] text-ink" aria-live="polite">
        {gain}
      </div>
      <ExtraSavingLines rows={rows} plusLabel={`Ayda +${tl(extra)} ile`} caption="Birikimin yıllara göre tahmini seyri, bugünün parasıyla" />
      <p className="text-[12px] text-subtle">
        Bileşik büyümeyle hesaplanır: birikim her yıl enflasyon kadar, üstüne de %{SCENARIOS.mid.realReturnPct.toLocaleString('tr-TR')} büyür (enflasyon %{DEFAULT_INFLATION_PCT} ise yılda yaklaşık %{nominalPct(SCENARIOS.mid.realReturnPct).toLocaleString('tr-TR')}). Aylık birikimin de yılda %{SAVING_GROWTH_PCT} artar. Tutarlar bugünün parasıyladır.
      </p>
    </Card>
  )
}

/** Uygulamadaki dikey rotanın sade önizlemesi: geçilen, şimdiki ve sıradaki açık; gerisi uygulamada. */
function RoutePreview({ result }: { result: QuickResult }) {
  const reduced = useReducedMotion()
  const j = result.journey
  const cur = j.stages.findIndex((s) => !s.done)
  return (
    <Card className="p-5">
      <h3 className="font-display text-base font-semibold text-ink">
        Rotanın {j.stages.length} durağı · seviye {j.level}/{j.stages.length}
      </h3>
      <ol className="mt-4">
        {j.stages.map((s, i) => {
          const state = s.done ? 'done' : i === cur ? 'now' : i === cur + 1 ? 'next' : 'lock'
          const last = i === j.stages.length - 1
          return (
            <motion.li key={s.id} className="relative grid grid-cols-[36px_1fr] gap-3 pb-4 last:pb-0" initial={reduced ? false : { opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: reduced ? 0 : 0.1 + i * 0.08 }}>
              {!last && <span className={cn('absolute bottom-0 left-[16px] top-9 w-1 rounded-full', s.done ? 'bg-accent' : 'bg-surface-2')} aria-hidden />}
              <span
                className={cn(
                  'num relative grid size-9 place-items-center rounded-full border-[3px] text-[13px] font-bold',
                  state === 'done' ? 'border-accent bg-accent text-white' : state === 'now' ? 'border-accent bg-surface text-accent' : 'border-line bg-surface text-muted',
                )}
                aria-hidden
              >
                {state === 'done' ? <Check className="size-4" strokeWidth={3} /> : i + 1}
              </span>
              <div className="min-w-0 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('font-semibold', state === 'lock' ? 'text-muted' : 'text-ink')}>{s.title}</span>
                  {state === 'done' && <Badge tone="accent">Geçildi</Badge>}
                  {state === 'now' && <Badge tone="info">Buradasın</Badge>}
                  {state === 'next' && <Badge tone="neutral">Sıradaki</Badge>}
                  {state === 'lock' && (
                    <span className="inline-flex items-center gap-1 text-[11.5px] text-subtle">
                      <Lock className="size-3" /> Uygulamada
                    </span>
                  )}
                </div>
                {state !== 'lock' && <p className="mt-0.5 text-[13px] text-muted">{s.criterion}</p>}
              </div>
            </motion.li>
          )
        })}
      </ol>
    </Card>
  )
}

function ContinueCard({ code, url, stage }: { code: string; url: string; stage: string | null }) {
  const [copied, setCopied] = useState(false)
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  const ios = /iPhone|iPad|iPod/.test(ua)
  const android = /Android/.test(ua)
  const mobile = ios || android
  const qr = useMemo(() => {
    try {
      const q = qrcode(0, 'M')
      q.addData(url)
      q.make()
      const n = q.getModuleCount()
      let d = ''
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`
      return { n, d }
    } catch {
      return null
    }
  }, [url])
  const stores = [
    { id: 'ios', label: 'App Store', sub: 'iPhone için', href: APP_CONFIG.storeLinks.ios, soon: "Yakında App Store'da", dl: "App Store'dan indir" },
    { id: 'android', label: 'Google Play', sub: 'Android için', href: APP_CONFIG.storeLinks.android, soon: "Yakında Google Play'de", dl: "Google Play'den indir" },
  ]
  if (android) stores.reverse()
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div id="devam" className="hero-gradient relative scroll-mt-4 overflow-hidden rounded-[1.25rem] p-5 text-white shadow-card sm:p-6">
      <div className="text-[12px] font-medium uppercase tracking-[0.14em] text-white/70">Sıradaki adım</div>
      <h2 className="mt-1 font-display text-2xl font-bold sm:text-3xl">Geleceğini uygulamada hazırla</h2>
      <p className="mt-2 text-[14px] leading-relaxed text-white/80">
        Rotan hazır ama şimdilik tahmini aralıklarla çizildi. Uygulamada gerçek rakamlarınla netleşir{stage ? `; ${stage} durağından itibaren` : ';'} her adımda yanında koçun olur.
      </p>
      <ol className="mt-4 flex flex-col gap-3 text-[14px]">
        {[
          ['Kodunla gir', 'Haritan uygulamada seni bekler; testi baştan çözmezsin.'],
          ['5 dakikada gerçek rakamlarını gir', 'Tahminler, Finansal özgürlük testinde gerçek rakamlarınla yer değiştirir.'],
          ['Koçun ilk planını çıkarsın', 'Harcamalarını izler, rotadan sapınca haber verir.'],
        ].map(([t, s], i) => (
          <li key={t} className="grid grid-cols-[28px_1fr] gap-3">
            <span className="num grid size-7 place-items-center rounded-full border border-white/60 text-[12px] font-bold">{i + 1}</span>
            <div>
              <div className="font-semibold">{t}</div>
              <div className="text-[13px] text-white/70">{s}</div>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-5 flex flex-wrap gap-2.5">
        <a href={`#/yolculuk?kod=${code}`} className="inline-flex h-12 items-center gap-2 rounded-xl bg-white px-5 text-[15px] font-semibold text-[#0b1323] hover:brightness-95">
          Web'de devam et <ArrowRight className="size-4" />
        </a>
        {stores.map((s) =>
          s.href ? (
            <a key={s.id} href={s.href} target="_blank" rel="noreferrer" className={cn('inline-flex h-12 items-center gap-2.5 rounded-xl px-4 leading-tight', mobile && s.id === (ios ? 'ios' : 'android') ? 'bg-emerald-400 text-[#0b1323]' : 'border border-white/50')}>
              {s.id === 'ios' ? <Smartphone className="size-5" /> : <Play className="size-5" />}
              <span>
                <span className="block text-[11px] opacity-75">{s.sub}</span>
                <span className="block text-[14px] font-semibold">{s.dl}</span>
              </span>
            </a>
          ) : (
            <span key={s.id} className="inline-flex h-12 items-center gap-2.5 rounded-xl border border-white/30 bg-white/10 px-4 leading-tight text-white" aria-disabled>
              {s.id === 'ios' ? <Smartphone className="size-5" /> : <Play className="size-5" />}
              <span>
                <span className="block text-[11px] text-white/75">{s.sub}</span>
                <span className="block text-[14px] font-semibold">{s.soon}</span>
              </span>
            </span>
          ),
        )}
      </div>
      {!mobile && qr && (
        <div className="mt-5 flex items-center gap-4">
          <svg viewBox={`-2 -2 ${qr.n + 4} ${qr.n + 4}`} className="size-28 shrink-0 rounded-xl bg-white" role="img" aria-label="Telefonda devam etmek için QR kod">
            <path d={qr.d} fill="#0b1323" />
          </svg>
          <div className="text-[13px] text-white/80">
            <div className="text-[14px] font-semibold text-white">Telefonunla tara</div>
            Kamerayı kodun üzerine tut; haritan telefonunda açılır ve seninle gelir.
          </div>
        </div>
      )}
      <details className="mt-5 text-[13px] text-white/80">
        <summary className="cursor-pointer underline underline-offset-2">Farklı bir e-postayla mı kaydolacaksın?</summary>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-white/50 px-4 py-3">
          <div>
            <div className="text-[12px] text-white/70">Devam kodun</div>
            <div className="num font-mono text-xl font-semibold tracking-[0.12em] text-white">{code}</div>
          </div>
          <button type="button" onClick={copy} className="inline-flex h-10 items-center gap-2 rounded-xl bg-white/15 px-4 font-semibold text-white hover:bg-white/25">
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? 'Kopyalandı' : 'Kodu kopyala'}
          </button>
        </div>
        <p className="mt-2">Uygulamada Yolculuk sayfasındaki "Web testimi bağla" alanına yaz.</p>
      </details>
    </div>
  )
}

/** Sonucun hemen altında, kaydırmadan görünen yönlendirme şeridi. */
export function UnlockStrip({ title, text, cta, onClick, badge }: { title: string; text: string; cta: string; onClick: () => void; badge?: ReactNode }) {
  const reduced = useReducedMotion()
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduced ? 0 : 0.6, duration: 0.4, ease: EASE }}
      className="relative overflow-hidden rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent p-4"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-[0_8px_18px_-10px_rgb(234_88_12/0.9)]">
          <Lock className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 font-semibold text-ink">
            {title} {badge}
          </div>
          <p className="text-[13px] text-muted">{text}</p>
        </div>
        <button
          type="button"
          onClick={onClick}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 px-4 text-[14.5px] font-semibold text-white shadow-[0_10px_22px_-12px_rgb(234_88_12/0.9)] hover:brightness-110 sm:w-auto"
        >
          {cta} <ArrowRight className="size-4" />
        </button>
      </div>
    </motion.div>
  )
}
