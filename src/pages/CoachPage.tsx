import { AlertTriangle, ArrowRight, Bot, Calculator, CheckCheck, ChevronDown, Eraser, Flag, Landmark, Lock, Newspaper, PartyPopper, PiggyBank, Send, ShieldCheck, Sparkles, Target, TrendingUp } from 'lucide-react'
import { animate, AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/AppShell'
import { BroadcastBody } from '../components/Broadcast'
import { DebtPayoffChart } from '../components/charts/Charts'
import { PlanBadge, PlanGate } from '../components/PlanGate'
import { Alert, Badge, Button, Card, Field, Input, Segmented, Switch } from '../components/ui/primitives'
import { answer, QUESTIONS, restructure, STRATEGY_LABEL, type CoachMessage, type CoachPhase, type CoachPlan, type DebtStrategy, type QuestionId } from '../domain/coach'
import { todayIso } from '../domain/dates'
import { formatKurus } from '../domain/money'
import { addMonthsClamped } from '../domain/recurring'
import type { CoachSettings } from '../domain/types'
import { cn } from '../lib/cn'
import { useReducedMotion } from '../lib/hooks'
import { coachChat, type Broadcast, type ChatTurn } from '../cloud/coach'
import { useAuth } from '../state/auth'
import { coachSummary, useBroadcasts, useCoach, type CoachDebtInfo, type CoachState } from '../state/coach'
import { useRepo } from '../state/data'
import { useUi } from '../state/ui'

export default function CoachPage() {
  return (
    <div>
      <PageHeader
        title="Koçum"
        subtitle={
          <span className="inline-flex items-center gap-2">
            <PlanBadge plan="plusplus" /> Borçtan yatırıma kişisel planınız
          </span>
        }
      />
      <PlanGate
        feature="aiCoach"
        title="Finans koçu"
        points={[
          'Borçlarınızı en az faizle kapatma sırası ve yapılandırma hesabı',
          'Gelir ve giderinize göre her ay yatırıma ayrılacak tutar',
          'Bütçe, ödeme günü ve kilometre taşlarında size özel mesajlar',
        ]}
      >
        <CoachContent />
      </PlanGate>
    </div>
  )
}

function CoachContent() {
  const state = useCoach()
  const repo = useRepo()
  if (!state) return null
  const save = (patch: Partial<CoachSettings>) => void repo.saveSettings({ coach: { ...state.settings, ...patch } }).catch(() => {})
  return (
    <div className="flex flex-col gap-4">
      <Hero state={state} />
      {state.plan && <Timeline plan={state.plan} />}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-5">
        <div className="flex flex-col gap-4 lg:col-span-3">
          <Chat state={state} onDismiss={(id) => save({ dismissed: [...state.settings.dismissed, id].slice(-200) })} />
          <AiCard consent={state.settings.aiConsent} onChange={(v) => save({ aiConsent: v })} />
        </div>
        <div className="flex flex-col gap-4 lg:col-span-2">{state.plan && <DebtPanel state={state} plan={state.plan} onChange={save} />}</div>
      </div>
      <p className="text-[12.5px] text-subtle">
        Koç hesaplarını cihazınızda, girdiğiniz bilgilerle yapar. Yatırım tavsiyesi vermez, belirli bir ürün önermez; tahminler garanti değildir. Yapılandırma için gerçek faiz ve vadeyi bankanızdan öğrenin.
      </p>
    </div>
  )
}

// ---------- Ortak parçalar ----------

const monthName = (offset: number) => {
  const d = addMonthsClamped(todayIso(), offset)
  return new Date(`${d}T00:00:00`).toLocaleDateString('tr-TR', { month: 'short', year: 'numeric' })
}
const monthsText = (m: number) => (m < 12 ? `${m} ay` : m % 12 === 0 ? `${m / 12} yıl` : `${Math.floor(m / 12)} yıl ${m % 12} ay`)

function useCountUp(value: number, duration = 1.2): number {
  const reduced = useReducedMotion()
  const [v, setV] = useState(reduced ? value : 0)
  const from = useRef(0)
  useEffect(() => {
    if (reduced) {
      setV(value)
      return
    }
    const c = animate(from.current, value, { duration, ease: [0.16, 1, 0.3, 1], onUpdate: (x) => setV(Math.round(x)) })
    from.current = value
    return () => c.stop()
  }, [value, duration, reduced])
  return v
}

function CountUp({ kurus, className }: { kurus: number; className?: string }) {
  const v = useCountUp(kurus)
  return <span className={cn('num', className)}>{formatKurus(v)}</span>
}

/** Koçun simgesi: dönen ışık halkası ve nefes alan küre. */
function CoachOrb({ size = 84, talking = false }: { size?: number; talking?: boolean }) {
  const reduced = useReducedMotion()
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-hidden>
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{ background: 'conic-gradient(from 0deg, #34d399, #22d3ee, #a78bfa, #f472b6, #34d399)', filter: 'blur(1px)' }}
        animate={reduced ? undefined : { rotate: 360 }}
        transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
      />
      <div className="absolute inset-[3px] rounded-full bg-slate-950" />
      <motion.div
        className="absolute inset-[10%] rounded-full"
        style={{ background: 'radial-gradient(circle at 35% 30%, #a7f3d0, #10b981 45%, #0e7490 80%)', boxShadow: '0 0 40px rgba(16,185,129,.55)' }}
        animate={reduced ? undefined : { scale: talking ? [1, 1.08, 0.98, 1.06, 1] : [1, 1.04, 1] }}
        transition={{ duration: talking ? 0.9 : 3.2, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div className="absolute inset-0 grid place-items-center text-white">
        <Bot className="size-[38%] drop-shadow" />
      </div>
      {!reduced &&
        [0, 1].map((i) => (
          <motion.span
            key={i}
            className="absolute left-1/2 top-1/2 size-1.5 rounded-full bg-white"
            style={{ boxShadow: '0 0 8px #fff' }}
            animate={{ rotate: 360 }}
            transition={{ duration: 5 + i * 2, repeat: Infinity, ease: 'linear', delay: i }}
            transformTemplate={({ rotate }) => `translate(-50%, -50%) rotate(${rotate}) translateX(${size / 2 + 4}px)`}
          />
        ))}
    </div>
  )
}

function LabeledSwitch({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0 text-[13px]">
        <div className="font-medium text-ink">{label}</div>
        {hint && <div className="text-[12px] text-subtle">{hint}</div>}
      </div>
      <Switch label={label} checked={checked} onChange={onChange} />
    </div>
  )
}

// ---------- Üst bölüm ----------

function Hero({ state }: { state: CoachState }) {
  const reduced = useReducedMotion()
  const p = state.plan
  const phase = p?.phases[0]
  const debtFree = p?.payoff?.months ?? null
  const invest = p?.phases.find((x) => x.id === 'invest')
  const line = !p
    ? 'Sizi tanıyınca borçtan yatırıma uzanan planınızı çıkaracağım.'
    : p.surplusKurus <= 0
      ? 'Önce gelir ve gider dengesini kuralım; sonra her şey daha kolay.'
      : phase?.id === 'debt'
        ? 'İlk hedefimiz borçları en az faizle kapatmak. Sonra para sizin için çalışmaya başlayacak.'
        : phase?.id === 'emergency'
          ? 'Borcunuz yok. Önce güvence birikimini tamamlayıp ardından yatırıma geçiyoruz.'
          : 'Borcunuz yok ve güvenceniz hazır. Her ay düzenli yatırım zamanı.'
  return (
    <section aria-label="Koç özeti" className="relative overflow-hidden rounded-3xl bg-slate-950 p-5 text-white shadow-float sm:p-7">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {[
          ['#10b981', '-10%', '-30%', 0],
          ['#06b6d4', '60%', '-40%', 2],
          ['#8b5cf6', '30%', '50%', 4],
        ].map(([c, x, y, d]) => (
          <motion.div
            key={c as string}
            className="absolute size-[340px] rounded-full opacity-40 blur-3xl"
            style={{ background: c as string, left: x as string, top: y as string }}
            animate={reduced ? undefined : { x: [0, 40, -20, 0], y: [0, -30, 20, 0], scale: [1, 1.15, 0.95, 1] }}
            transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut', delay: d as number }}
          />
        ))}
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '18px 18px' }} />
      </div>
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
        <CoachOrb />
        <div className="min-w-0 flex-1">
          <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="text-[13px] font-medium uppercase tracking-[0.14em] text-emerald-300">
            Finans koçun
          </motion.p>
          <motion.h2 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }} className="mt-1 font-display text-xl font-semibold leading-snug sm:text-2xl">
            {line}
          </motion.h2>
          {!p && (
            <Link to="/yolculuk" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-emerald-50">
              Kısa ankete başla <ArrowRight className="size-4" />
            </Link>
          )}
        </div>
      </div>
      {p && (
        <div className="relative mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <HeroStat label="Bu ay plana" delay={0.15}>
            <CountUp kurus={Math.max(0, p.monthlyPlanKurus)} />
          </HeroStat>
          <HeroStat label="Borçsuz olma" delay={0.25}>
            {p.debts.length === 0 ? 'Borç yok' : debtFree ? monthName(debtFree - 1) : 'Kapanmıyor'}
          </HeroStat>
          <HeroStat label="Yatırım başlangıcı" delay={0.35}>
            {invest ? (invest.startMonth === 0 ? 'Bu ay' : monthName(invest.startMonth)) : '—'}
          </HeroStat>
          <HeroStat label="Hedef birikim" delay={0.45}>
            {p.targetMonths === null ? 'Ulaşılamıyor' : p.targetMonths === 0 ? 'Ulaşıldı' : `~${monthName(p.targetMonths).split(' ')[1]}`}
          </HeroStat>
        </div>
      )}
    </section>
  )
}

function HeroStat({ label, children, delay }: { label: string; children: ReactNode; delay: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay }} className="rounded-2xl border border-white/10 bg-white/[0.06] p-3.5 backdrop-blur">
      <div className="text-[12px] text-slate-300">{label}</div>
      <div className="mt-1 font-display text-lg font-semibold sm:text-xl">{children}</div>
    </motion.div>
  )
}

// ---------- Plan zaman çizelgesi ----------

const PHASE_ICON = { debt: Landmark, emergency: ShieldCheck, invest: TrendingUp } as const
const PHASE_COLOR = { debt: '#f43f5e', emergency: '#f59e0b', invest: '#10b981' } as const

function Timeline({ plan }: { plan: CoachPlan }) {
  const reduced = useReducedMotion()
  if (plan.surplusKurus <= 0 && plan.debts.length === 0) {
    return (
      <Alert tone="warning" icon={<AlertTriangle className="size-4" />} title="Önce bütçe dengesi">
        Ortalama gideriniz gelirinizin üstünde olduğu için plana ayrılacak tutar yok. Bütçe planından giderleri sınırlayabilir veya yolculuk bilgilerinizi güncelleyebilirsiniz.
      </Alert>
    )
  }
  const goal: CoachPhase = { id: 'invest', title: 'Hedef birikim', startMonth: plan.targetMonths ?? 0, endMonth: null, monthlyKurus: 0, detail: formatKurus(plan.goalKurus) }
  return (
    <Card className="p-5" aria-label="Planın">
      <h2 className="flex items-center gap-2 font-display text-base font-semibold">
        <Flag className="size-5 text-accent" /> Planın
      </h2>
      <ol className="relative mt-5 grid grid-cols-1 gap-5 md:grid-cols-[repeat(auto-fit,minmax(0,1fr))] md:gap-3">
        {plan.phases.map((ph, i) => (
          <PhaseNode key={ph.id} ph={ph} i={i} current={i === 0} reduced={reduced} />
        ))}
        <motion.li
          initial={reduced ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 + plan.phases.length * 0.25 }}
          className="relative flex gap-3 md:flex-col"
        >
          <span className="relative z-10 grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-lg shadow-fuchsia-500/30">
            <Target className="size-5" />
          </span>
          <div>
            <div className="font-semibold text-ink">{goal.title}</div>
            <div className="num text-[12.5px] text-muted">{goal.detail}</div>
            <div className="text-[12.5px] text-muted">{plan.targetMonths === null ? 'Bu tempoyla ulaşılmıyor' : plan.targetMonths === 0 ? 'Ulaşıldı' : `Tahmini ${monthName(plan.targetMonths)} (orta varsayım)`}</div>
          </div>
        </motion.li>
      </ol>
    </Card>
  )
}

function PhaseNode({ ph, i, current, reduced }: { ph: CoachPhase; i: number; current: boolean; reduced: boolean }) {
  const Icon = PHASE_ICON[ph.id]
  const color = PHASE_COLOR[ph.id]
  const range = ph.endMonth === null ? `${ph.startMonth === 0 ? 'Bu ay' : monthName(ph.startMonth)} ve sonrası` : `${ph.startMonth === 0 ? 'Bu ay' : monthName(ph.startMonth)} – ${monthName(Math.max(ph.endMonth - 1, ph.startMonth))}`
  return (
    <motion.li initial={reduced ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.25, type: 'spring', stiffness: 200, damping: 20 }} className="relative flex gap-3 md:flex-col">
      {/* bağlantı çizgisi */}
      <span aria-hidden className="absolute left-[21px] top-12 h-[calc(100%-1rem)] w-0.5 bg-line md:left-12 md:top-[21px] md:h-0.5 md:w-[calc(100%-2rem)]">
        <motion.span
          className="absolute inset-0 origin-top md:origin-left"
          style={{ background: color }}
          initial={reduced ? false : { scaleX: 0, scaleY: 0 }}
          animate={{ scaleX: 1, scaleY: 1 }}
          transition={{ delay: 0.4 + i * 0.25, duration: 0.6 }}
        />
      </span>
      <span className="relative z-10 grid size-11 shrink-0 place-items-center rounded-2xl text-white shadow-lg" style={{ background: color, boxShadow: `0 8px 24px ${color}55` }}>
        <Icon className="size-5" />
        {current && !reduced && <motion.span className="absolute inset-0 rounded-2xl" style={{ border: `2px solid ${color}` }} animate={{ scale: [1, 1.35], opacity: [0.8, 0] }} transition={{ duration: 1.6, repeat: Infinity }} />}
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-ink">{ph.title}</span>
          {current && <Badge tone="accent">Şimdi</Badge>}
        </div>
        <div className="text-[12.5px] text-muted">{range}</div>
        <div className="num mt-0.5 text-[13px] font-medium text-ink">Ayda {formatKurus(ph.monthlyKurus)}</div>
        <div className="text-[12px] text-subtle">{ph.detail}</div>
      </div>
    </motion.li>
  )
}

// ---------- Sohbet ----------

interface Bubble {
  key: string
  from: 'coach' | 'me'
  text?: string
  error?: boolean
}

const TONE: Record<CoachMessage['tone'], { icon: typeof Sparkles; cls: string }> = {
  warn: { icon: AlertTriangle, cls: 'text-warning' },
  info: { icon: Sparkles, cls: 'text-info' },
  win: { icon: PartyPopper, cls: 'text-accent' },
  plan: { icon: Target, cls: 'text-accent' },
}

function Chat({ state, onDismiss }: { state: CoachState; onDismiss: (id: string) => void }) {
  const reduced = useReducedMotion()
  const { backend, user } = useAuth()
  const latest = useBroadcasts(1)?.[0]
  const news = latest && !state.settings.dismissed.includes(`news-${latest.day}`) ? latest : null
  const unread = state.messages.filter((m) => !m.read)
  const read = state.messages.filter((m) => m.read)
  const [draft, setDraft] = useState('')
  const aiReady = !!backend && !!user && state.settings.aiConsent
  const aiHint = !backend || !user ? 'Serbest soru için hesabınızla giriş yapın' : !state.settings.aiConsent ? 'Serbest soru için aşağıdan yapay zekâ iznini açın' : 'Koça bir şey sorun…'
  const [shown, setShown] = useState(reduced ? unread.length : 0)
  const [thread, setThread] = useState<Bubble[]>([])
  const [typing, setTyping] = useState(false)
  const [showOld, setShowOld] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  // Mesajlar teker teker "yazılıyor" animasyonuyla gelir
  useEffect(() => {
    if (shown >= unread.length) return
    const t = setTimeout(() => setShown((s) => s + 1), reduced ? 0 : shown === 0 ? 500 : 900)
    return () => clearTimeout(t)
  }, [shown, unread.length, reduced])

  const ask = (q: QuestionId, text: string) => {
    if (!state.plan || typing) return
    const plan = state.plan
    setThread((t) => [...t, { key: `me-${t.length}`, from: 'me', text }])
    setTyping(true)
    setTimeout(
      () => {
        setThread((t) => [...t, { key: `c-${t.length}`, from: 'coach', text: answer(q, plan, state.facts, state.budget) }])
        setTyping(false)
      },
      reduced ? 0 : 750,
    )
  }
  const send = async () => {
    const text = draft.trim().slice(0, 1000)
    if (!text || typing || !aiReady || !backend) return
    const turns: ChatTurn[] = [...thread.filter((b) => b.text).map((b) => ({ role: b.from === 'me' ? ('user' as const) : ('assistant' as const), content: b.text! })), { role: 'user', content: text }]
    setDraft('')
    setThread((t) => [...t, { key: `me-${t.length}`, from: 'me', text }])
    setTyping(true)
    try {
      const reply = await coachChat(backend.client, coachSummary(state), turns.slice(-12))
      setThread((t) => [...t, { key: `c-${t.length}`, from: 'coach', text: reply }])
    } catch (e) {
      setThread((t) => [...t, { key: `c-${t.length}`, from: 'coach', text: e instanceof Error ? e.message : 'Koç şu an yanıt veremiyor.', error: true }])
    } finally {
      setTyping(false)
    }
  }
  useEffect(() => {
    if (thread.length) endRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' })
  }, [thread.length, typing, reduced])

  const pending = shown < unread.length || typing
  return (
    <Card className="flex flex-col p-0" aria-label="Koç mesajları">
      <div className="flex items-center gap-3 border-b border-line px-5 py-3.5">
        <CoachOrb size={36} talking={pending} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-ink">Koç</div>
          <div className="text-[12px] text-muted">{pending ? 'yazıyor…' : unread.length ? `${unread.length} yeni mesaj` : aiReady ? 'Çevrimiçi' : 'Çevrimiçi · cihazınızda çalışıyor'}</div>
        </div>
        {thread.length > 0 && (
          <Button size="sm" variant="ghost" icon={<Eraser className="size-4" />} onClick={() => setThread([])}>
            Sohbeti sil
          </Button>
        )}
      </div>
      <div className="flex max-h-[560px] min-h-[340px] flex-1 flex-col gap-3 overflow-y-auto px-4 py-4 sm:px-5" role="log" aria-live="polite">
        {read.length > 0 && (
          <button type="button" onClick={() => setShowOld((v) => !v)} className="mx-auto inline-flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1 text-[12px] text-muted hover:text-ink">
            Önceki mesajlar ({read.length}) <ChevronDown className={cn('size-3.5 transition-transform', showOld && 'rotate-180')} />
          </button>
        )}
        {showOld && read.map((m) => <CoachBubble key={m.id} msg={m} dim />)}
        {news && <NewsBubble b={news} onDismiss={() => onDismiss(`news-${news.day}`)} />}
        <AnimatePresence initial={false}>
          {unread.slice(0, shown).map((m) => (
            <CoachBubble key={m.id} msg={m} onDismiss={() => onDismiss(m.id)} />
          ))}
          {thread.map((b) => (b.from === 'me' ? <MyBubble key={b.key} text={b.text!} /> : <CoachBubble key={b.key} text={b.text} error={b.error} />))}
          {pending && <TypingBubble key="typing" />}
        </AnimatePresence>
        <div ref={endRef} />
      </div>
      <div className="border-t border-line px-4 py-3 sm:px-5">
        {state.plan && (
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2" aria-label="Hazır sorular">
            {QUESTIONS.map((q) => (
              <button
                key={q.id}
                type="button"
                disabled={typing}
                onClick={() => ask(q.id, q.text)}
                className="shrink-0 rounded-full border border-accent/30 bg-accent-soft px-3 py-1.5 text-[12.5px] font-medium text-accent-strong transition hover:-translate-y-0.5 hover:shadow-card disabled:opacity-50 dark:text-accent"
              >
                {q.text}
              </button>
            ))}
          </div>
        )}
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
        >
          <Input aria-label="Koça yazın" disabled={!aiReady} value={draft} maxLength={1000} onChange={(e) => setDraft(e.target.value)} placeholder={aiHint} className="flex-1" />
          <Button type="submit" variant="primary" disabled={!aiReady || !draft.trim() || typing} icon={<Send className="size-4" />} aria-label="Gönder" />
        </form>
      </div>
    </Card>
  )
}

const bubbleMotion = {
  initial: { opacity: 0, y: 12, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, scale: 0.96 },
  transition: { type: 'spring' as const, stiffness: 320, damping: 26 },
}

function CoachBubble({ msg, text, dim, error, onDismiss }: { msg?: CoachMessage; text?: string; dim?: boolean; error?: boolean; onDismiss?: () => void }) {
  const tone = msg ? TONE[msg.tone] : null
  const Icon = tone?.icon
  return (
    <motion.div {...bubbleMotion} layout className={cn('flex max-w-[92%] gap-2', dim && 'opacity-60')}>
      <div className="mt-1 grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 text-white">
        <Bot className="size-4" />
      </div>
      <div className="rounded-2xl rounded-tl-md border border-line bg-surface-2 px-3.5 py-2.5 text-[13.5px] text-ink shadow-card">
        {msg ? (
          <>
            <div className="flex items-center gap-1.5 font-semibold">
              {Icon && <Icon className={cn('size-4', tone!.cls)} />}
              {msg.title}
            </div>
            <p className="mt-0.5 text-muted">{msg.body}</p>
            {(msg.link || onDismiss) && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {msg.link && (
                  <Link to={msg.link.to} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-accent hover:underline">
                    {msg.link.label} <ArrowRight className="size-3.5" />
                  </Link>
                )}
                {onDismiss && (
                  <button type="button" onClick={onDismiss} className="inline-flex items-center gap-1 text-[12.5px] text-subtle hover:text-ink">
                    <CheckCheck className="size-3.5" /> Okudum
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          <p className={cn('whitespace-pre-line', error && 'text-danger')}>{text}</p>
        )}
      </div>
    </motion.div>
  )
}

function NewsBubble({ b, onDismiss }: { b: Broadcast; onDismiss: () => void }) {
  return (
    <motion.div {...bubbleMotion} className="flex max-w-[96%] gap-2">
      <div className="mt-1 grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white">
        <Newspaper className="size-4" />
      </div>
      <div className="rounded-2xl rounded-tl-md border border-violet-500/25 bg-surface-2 px-3.5 py-2.5 text-[13.5px] shadow-card">
        <div className="font-semibold text-ink">{b.title}</div>
        <div className="text-[11.5px] text-subtle">{new Date(`${b.day}T00:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} · yapay zekâ ile özetlendi</div>
        <BroadcastBody b={b} />
        <button type="button" onClick={onDismiss} className="mt-2 inline-flex items-center gap-1 text-[12.5px] text-subtle hover:text-ink">
          <CheckCheck className="size-3.5" /> Okudum
        </button>
      </div>
    </motion.div>
  )
}

function MyBubble({ text }: { text: string }) {
  return (
    <motion.div {...bubbleMotion} layout className="ml-auto max-w-[85%] rounded-2xl rounded-tr-md bg-gradient-to-br from-emerald-500 to-teal-600 px-3.5 py-2 text-[13.5px] font-medium text-white shadow-card">
      {text}
    </motion.div>
  )
}

function TypingBubble() {
  return (
    <motion.div {...bubbleMotion} className="flex items-center gap-2" aria-label="Koç yazıyor">
      <div className="grid size-7 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 text-white">
        <Bot className="size-4" />
      </div>
      <div className="flex gap-1 rounded-2xl rounded-tl-md border border-line bg-surface-2 px-3.5 py-3">
        {[0, 1, 2].map((i) => (
          <motion.span key={i} className="size-1.5 rounded-full bg-subtle" animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }} transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }} />
        ))}
      </div>
    </motion.div>
  )
}

// ---------- Borç planı ----------

function DebtPanel({ state, plan, onChange }: { state: CoachState; plan: CoachPlan; onChange: (p: Partial<CoachSettings>) => void }) {
  const reduced = useReducedMotion()
  const debts = state.debts
  if (!debts.length) {
    return (
      <Card className="p-5" aria-label="Borç planı">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <PiggyBank className="size-5 text-accent" /> Borç yok, yatırıma hazır
        </h2>
        <p className="mt-1 text-[13px] text-muted">
          Kayıtlı borcunuz bulunmuyor. Plan doğrudan {plan.emergencyGapKurus > 0 ? 'acil durum birikimi ve ardından ' : ''}yatırımla başlıyor: ayda <span className="num font-semibold text-ink">{formatKurus(plan.monthlyPlanKurus)}</span>.
        </p>
        {plan.bufferKurus > 0 && <p className="mt-1 text-[12.5px] text-subtle">Gelir düzeniniz nedeniyle ayda {formatKurus(plan.bufferKurus)} tampon olarak bırakıldı.</p>}
        <Link to="/varliklar" className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-accent">
          Borç eklemek için Varlıklarım <ArrowRight className="size-3.5" />
        </Link>
      </Card>
    )
  }
  const months = plan.payoff?.months ?? null
  const missing = debts.filter((d) => d.missingRate || d.estimatedMin)
  return (
    <Card className="p-5" aria-label="Borç planı">
      <h2 className="flex items-center gap-2 font-display text-base font-semibold">
        <Landmark className="size-5 text-accent" /> Borç kapatma planı
      </h2>
      <div className="mt-3 flex flex-col gap-3">
        <Segmented<DebtStrategy>
          label="Ödeme sırası"
          value={state.settings.strategy}
          onChange={(v) => onChange({ strategy: v })}
          options={(Object.keys(STRATEGY_LABEL) as DebtStrategy[]).map((k) => ({ value: k, label: STRATEGY_LABEL[k] }))}
        />
        <LabeledSwitch label="Borç ödemelerim aylık giderlerime dahil" hint="Kredi taksitlerini gider olarak kaydediyorsanız açın." checked={state.settings.debtsInExpenses} onChange={(v) => onChange({ debtsInExpenses: v })} />
      </div>
      {plan.shortfallKurus > 0 && (
        <Alert tone="danger" className="mt-3" icon={<AlertTriangle className="size-4" />}>
          Asgari ödemeler ayırabildiğiniz tutardan {formatKurus(plan.shortfallKurus)} fazla. Aşağıdaki yapılandırma hesabını deneyin.
        </Alert>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-2xl bg-surface-2 p-3">
          <div className="text-[12px] text-muted">Borçsuz olma</div>
          <div className="font-display text-lg font-semibold">{months ? monthsText(months) : 'Kapanmıyor'}</div>
        </div>
        <div className="rounded-2xl bg-surface-2 p-3">
          <div className="text-[12px] text-muted">Toplam faiz</div>
          <CountUp kurus={plan.payoff?.totalInterestKurus ?? 0} className="font-display text-lg font-semibold" />
        </div>
      </div>
      {plan.interestSavedKurus > 0 && (
        <motion.p initial={reduced ? false : { opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.6 }} className="mt-2 rounded-xl bg-accent-soft px-3 py-2 text-[12.5px] font-medium text-accent-strong dark:text-accent">
          Yalnızca asgari ödemeye göre <CountUp kurus={plan.interestSavedKurus} /> daha az faiz.
        </motion.p>
      )}
      <ul className="mt-4 flex flex-col gap-3" aria-label="Borçlar ve kapanma sırası">
        {[...debts]
          .map((d) => ({ d, r: plan.payoff?.debts.find((x) => x.id === d.id) }))
          .sort((a, b) => (a.r?.paidOffMonth ?? 1e9) - (b.r?.paidOffMonth ?? 1e9))
          .map(({ d, r }, i) => (
            <DebtRow key={d.id} d={d} month={r?.paidOffMonth ?? null} total={months ?? 0} i={i} reduced={reduced} />
          ))}
      </ul>
      {plan.payoff && <DebtPayoffChart plan={plan.payoff.balances} minOnly={plan.minOnly?.balances ?? null} />}
      {missing.length > 0 && (
        <p className="mt-2 text-[12px] text-warning">
          {missing.map((d) => d.name).join(', ')} için faiz veya aylık ödeme girilmedi; tahmin kullanıldı.{' '}
          <Link to="/varliklar" className="font-semibold underline">
            Düzenle
          </Link>
        </p>
      )}
      <Restructure state={state} plan={plan} />
    </Card>
  )
}

function DebtRow({ d, month, total, i, reduced }: { d: CoachDebtInfo; month: number | null; total: number; i: number; reduced: boolean }) {
  const share = month && total ? month / total : 1
  return (
    <li>
      <div className="flex items-baseline justify-between gap-2 text-[13px]">
        <span className="min-w-0 truncate font-medium text-ink">
          {i + 1}. {d.name}
        </span>
        <span className="num shrink-0 text-muted">{formatKurus(d.balanceKurus)}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-500"
          initial={reduced ? false : { width: 0 }}
          animate={{ width: `${Math.max(6, share * 100)}%` }}
          transition={{ duration: 1, delay: 0.2 + i * 0.12, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      <div className="mt-0.5 text-[12px] text-subtle">
        {d.fixed ? 'Taksit planına göre' : `Aylık %${d.monthlyRatePct.toLocaleString('tr-TR')} faiz`} · {month ? `${monthName(month - 1)} kapanır` : 'bu tempoyla kapanmıyor'}
      </div>
    </li>
  )
}

function Restructure({ state, plan }: { state: CoachState; plan: CoachPlan }) {
  const candidates = state.debts.filter((d) => !d.fixed)
  const [open, setOpen] = useState(false)
  const [ids, setIds] = useState<string[]>(() => candidates.filter((d) => d.monthlyRatePct > 0).map((d) => d.id))
  const [rate, setRate] = useState('2,5')
  const [term, setTerm] = useState('24')
  if (!candidates.length) return null
  const r = Number(rate.replace(',', '.'))
  const t = Math.round(Number(term))
  const res = open && Number.isFinite(r) && r >= 0 && t >= 1 && t <= 120 ? restructure(state.debts, ids, r, t, plan.monthlyPlanKurus, state.settings.strategy) : null
  return (
    <div className="mt-4 rounded-2xl border border-line">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-4 py-3 text-left text-[13.5px] font-semibold text-ink">
        <Calculator className="size-4 text-accent" /> Yapılandırma hesabı
        <ChevronDown className={cn('ml-auto size-4 text-subtle transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="flex flex-col gap-3 px-4 pb-4">
              <p className="text-[12.5px] text-muted">Seçtiğiniz borçlar tek bir krediyle kapatılırsa ne olur? Bankanızın teklif ettiği faizi ve vadeyi girin; bu bir hesaplamadır, teklif değildir.</p>
              <fieldset className="flex flex-wrap gap-1.5">
                <legend className="sr-only">Yapılandırılacak borçlar</legend>
                {candidates.map((d) => {
                  const on = ids.includes(d.id)
                  return (
                    <button key={d.id} type="button" aria-pressed={on} onClick={() => setIds(on ? ids.filter((x) => x !== d.id) : [...ids, d.id])} className={cn('rounded-full border px-3 py-1 text-[12.5px]', on ? 'border-accent bg-accent-soft text-accent-strong dark:text-accent' : 'border-line text-muted')}>
                      {d.name}
                    </button>
                  )
                })}
              </fieldset>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Yeni aylık faiz (%)" htmlFor="rs-rate">
                  <Input id="rs-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
                </Field>
                <Field label="Vade (ay)" htmlFor="rs-term">
                  <Input id="rs-term" inputMode="numeric" value={term} onChange={(e) => setTerm(e.target.value.replace(/\D/g, ''))} />
                </Field>
              </div>
              {res && (
                <div className="grid grid-cols-2 gap-2 text-[12.5px]" aria-label="Yapılandırma sonucu">
                  <div className="rounded-xl bg-surface-2 p-2.5">
                    <div className="text-muted">Yeni aylık taksit</div>
                    <div className="num font-semibold text-ink">{formatKurus(res.newPaymentKurus)}</div>
                  </div>
                  <div className={cn('rounded-xl p-2.5', res.savedKurus > 0 ? 'bg-accent-soft' : 'bg-danger-soft')}>
                    <div className="text-muted">{res.savedKurus > 0 ? 'Faiz tasarrufu' : 'Ek faiz'}</div>
                    <CountUp kurus={Math.abs(res.savedKurus)} className={cn('font-semibold', res.savedKurus > 0 ? 'text-accent-strong dark:text-accent' : 'text-danger')} />
                  </div>
                  <p className="col-span-2 text-subtle">
                    Şu anki planla toplam faiz {formatKurus(res.oldInterestKurus)}, yapılandırmayla {formatKurus(res.newInterestKurus)}. Masraf ve vergiler dahil değildir.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ---------- Yapay zekâ ----------

function AiCard({ consent, onChange }: { consent: boolean; onChange: (v: boolean) => void }) {
  const { toast } = useUi()
  return (
    <Card className="relative overflow-hidden p-5" aria-label="Yapay zekâ sohbeti">
      <div aria-hidden className="absolute -right-10 -top-10 size-32 rounded-full bg-gradient-to-br from-violet-500/25 to-fuchsia-500/10 blur-2xl" />
      <h2 className="relative flex items-center gap-2 font-display text-base font-semibold">
        <Sparkles className="size-5 text-violet-500" /> Yapay zekâ sohbeti
        <Badge tone={consent ? 'accent' : 'neutral'}>{consent ? 'Açık' : 'Kapalı'}</Badge>
      </h2>
      <p className="relative mt-1 text-[13px] text-muted">İzin verirseniz koç, serbest sorularınızı yapay zekâ (OpenAI) ile yanıtlar. Hesapları yine uygulama yapar; yapay zekâ yalnızca açıklar ve ürün önermez.</p>
      <div className="relative mt-3 rounded-xl bg-surface-2 p-3 text-[12.5px]">
        <div className="font-medium text-ink">Gönderilecek özet bilgiler</div>
        <p className="text-muted">Aylık gelir ve gider, borç bakiyeleri ve faizleri (adları olmadan), birikim, plan ve hedef tutarları, bu dönemin bütçe durumu.</p>
        <div className="mt-1.5 flex items-center gap-1 font-medium text-ink">
          <Lock className="size-3.5" /> Hiç gönderilmeyenler
        </div>
        <p className="text-muted">Ekstre ve belgeler, tek tek işlemler ve açıklamaları, iş yeri adları, kart numarası, hesap bilgileri. Sohbet sunucuda saklanmaz; "Sohbeti sil" ile ekrandan da silinir.</p>
      </div>
      <div className="relative mt-3">
        <LabeledSwitch
          label="Özet bilgilerimin yapay zekâ sohbeti için kullanılmasına izin veriyorum"
          checked={consent}
          onChange={(v) => {
            onChange(v)
            toast(v ? 'İzin verildi. Koça serbest soru sorabilirsiniz.' : 'İzin geri alındı.')
          }}
        />
      </div>
    </Card>
  )
}
