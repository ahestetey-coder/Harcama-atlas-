import { ArrowRight, Flag, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Area, CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Slider } from '../components/Slider'
import { AnimatedNumber } from '../components/ui/AnimatedMoney'
import { Badge, Card, Segmented } from '../components/ui/primitives'
import { DEFAULT_INFLATION_PCT, nominalPct, SAVING_GROWTH_PCT } from '../domain/assumptions'
import { buildFreedomPlan, buildJourney, SCENARIOS, type BaseRates, type FreedomPlan, type JourneyFacts, type JourneyProfile, type JourneyResult, type ScenarioKey, type StageId } from '../domain/journey'
import { formatKurus, formatKurusCompact } from '../domain/money'
import { cn } from '../lib/cn'
import { FlowCells } from '../components/MoneyFlowCard'
import { useMoneyFlow } from '../state/budget'
import { useReducedMotion } from '../lib/hooks'

/**
 * Özgürlük simülasyonu: gerçek gelir, gider, borç ve yatırımlarla rota motorunun yıl yıl birikim yolu,
 * üç hedef eşiği (güvence, bağımsızlık, özgürlük), borçsuzluk ve aşama tarihleri. Ek birikim ve getiri
 * senaryosu canlı denenir; hiçbir şey kaydedilmez.
 */

/** Doğrulanmış kategorik renkler (açık ve koyu temada; dataviz doğrulayıcısı). */
const C = { lean: '#059669', fi: '#8b5cf6', fat: '#d97706', path: '#0284c7' }
const YEAR0 = new Date().getFullYear()
const yearOf = (months: number) => YEAR0 + Math.ceil(months / 12)

type Milestone = { id: StageId; label: string; color: string; month: number | null; done: boolean }

export function RouteSimulation({ profile, facts, rates, j, strategy }: { profile: JourneyProfile; facts: JourneyFacts; rates: BaseRates; j: JourneyResult; strategy: 'avalanche' | 'snowball' }) {
  const reduced = useReducedMotion()
  const [sc, setSc] = useState<ScenarioKey>('mid')
  const [extra, setExtra] = useState(0)
  const base = j.plan
  const plan: FreedomPlan = useMemo(() => (extra > 0 ? buildFreedomPlan(profile, facts, { rates, strategy, extraMonthlyKurus: extra * 100, runs: 0 }) : base), [extra, base, profile, facts, rates, strategy])
  const path = plan.paths[sc]
  const reach = plan.route[sc]
  const baseReach = base.route[sc]
  const age = plan.age

  // Eşiği ilk geçtiği yıl (yıl sonu değerlerinden)
  const cross = (goal: number) => {
    const y = path.findIndex((v) => v >= goal)
    return y < 0 ? null : y
  }
  const levels = [
    { id: 'security' as const, label: 'Güvence', color: C.lean, value: plan.leanKurus },
    { id: 'independence' as const, label: 'Bağımsızlık', color: C.fi, value: plan.fiKurus },
    { id: 'freedom' as const, label: 'Özgürlük', color: C.fat, value: plan.fatKurus },
  ].map((l) => ({ ...l, year: l.id === 'independence' && reach !== null ? Math.ceil(reach / 12) : cross(l.value) }))

  const fatYear = levels[2].year
  const horizon = Math.min(60, Math.max(10, (fatYear ?? (reach !== null ? Math.ceil(reach / 12) + 8 : 40)) + 2))
  const rows = useMemo(
    () =>
      Array.from({ length: horizon + 1 }, (_, y) => {
        return {
          year: YEAR0 + y,
          age: age + y,
          path: path[y] ?? null,
          cautious: sc === 'cautious' ? null : (plan.paths.cautious[y] ?? null),
          optimistic: sc === 'optimistic' ? null : (plan.paths.optimistic[y] ?? null),
        }
      }),
    [horizon, path, plan, sc, age],
  )
  const yMax = Math.max(plan.fatKurus * 1.08, ...rows.map((r) => r.path ?? 0))

  const stageById = new Map(j.stages.map((s) => [s.id, s]))
  const milestones: Milestone[] = [
    ...(['balance', 'starter', 'debt', 'emergency', 'saving'] as StageId[]).map((id) => {
      const s = stageById.get(id)!
      const month = s.done ? 0 : id === 'debt' && plan.debtFreeMonth !== null && plan.debtFreeMonth > 0 ? plan.debtFreeMonth : (s.etaMonths ?? null)
      return { id, label: s.short, color: 'var(--accent)', month, done: s.done }
    }),
    ...levels.map((l) => ({ id: l.id, label: l.label, color: l.color, month: l.year === null ? null : l.year * 12, done: plan.netKurus >= l.value })),
  ]

  const reachAge = reach === null ? null : age + Math.ceil(reach / 12)
  const vsTarget = reachAge === null ? null : reachAge - plan.targetAge
  const gained = extra > 0 && baseReach !== null && reach !== null ? Math.round(((baseReach - reach) / 12) * 10) / 10 : null
  const maxExtra = Math.max(5000, Math.ceil(Math.max(plan.levers.extraMonthlyKurus, profile.monthlyIncomeKurus * 0.3) / 100 / 1000) * 1000)

  return (
    <Card className="relative overflow-hidden p-4" aria-label="Özgürlük simülasyonu">
      <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-sky-500/10 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-28 -left-20 size-72 rounded-full bg-violet-500/10 blur-3xl" aria-hidden />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
            <Sparkles className="size-3.5 text-accent" /> Özgürlük simülasyonu
          </p>
          <div className="mt-1 flex items-baseline gap-3">
            {reach !== null ? (
              <AnimatedNumber value={yearOf(reach)} from={YEAR0} className="bg-gradient-to-r from-sky-500 via-violet-500 to-amber-500 bg-clip-text font-display text-5xl font-extrabold tracking-tight text-transparent" />
            ) : (
              <span className="font-display text-3xl font-bold text-ink">Henüz görünmüyor</span>
            )}
            {reachAge !== null && <span className="text-[15px] font-medium text-muted">{reachAge} yaşında</span>}
          </div>
          <p className="mt-1 text-[13px] text-muted">Finansal bağımsızlığa varış · {SCENARIOS[sc].label.toLowerCase()} senaryo</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {vsTarget !== null && (
            <Badge tone={vsTarget <= 0 ? 'accent' : 'warning'}>
              {vsTarget < 0 ? `Hedef yaşından ${-vsTarget} yıl önce` : vsTarget === 0 ? 'Tam hedef yaşında' : `Hedef yaşından ${vsTarget} yıl sonra`}
            </Badge>
          )}
          {gained !== null && gained > 0 && (
            <motion.span key={extra} initial={reduced ? false : { scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="num rounded-full bg-accent-soft px-2.5 py-1 text-[12.5px] font-semibold text-accent">
              {gained >= 1 ? `${gained.toLocaleString('tr-TR')} yıl` : `${Math.round(gained * 12)} ay`} erken
            </motion.span>
          )}
        </div>
      </div>

      <div className="relative mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[auto_1fr] sm:items-end">
        <Segmented
          label="Getiri senaryosu"
          value={sc}
          onChange={setSc}
          options={(Object.keys(SCENARIOS) as ScenarioKey[]).map((k) => ({ value: k, label: `${SCENARIOS[k].label} %${SCENARIOS[k].realReturnPct.toLocaleString('tr-TR')}` }))}
        />
        <Slider id="sim-route-extra" label="Her ay fazladan biriktirirsem" value={extra} min={0} max={maxExtra} step={500} onChange={setExtra} display={(v) => `+${formatKurus(v * 100)}`} />
      </div>

      <div className="relative mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-muted" aria-hidden>
        <Key color={C.path} label="Birikim yolun" />
        <Key color={C.path} label="Diğer senaryolar" dashed />
        {levels.map((l) => (
          <Key key={l.id} color={l.color} label={`${l.label} ${formatKurusCompact(l.value)}`} dotted />
        ))}
      </div>
      <div className="relative mt-2 h-72 sm:h-80" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart key={`${sc}-${extra}`} data={rows} margin={{ top: 22, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="sim-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={C.path} stopOpacity={0.22} />
                <stop offset="1" stopColor={C.path} stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="year" type="number" domain={[YEAR0, YEAR0 + horizon]} tickLine={false} axisLine={false} tick={{ fill: 'var(--subtle)', fontSize: 11 }} tickCount={6} allowDecimals={false} />
            <YAxis tickLine={false} axisLine={false} width={60} tick={{ fill: 'var(--subtle)', fontSize: 11 }} tickFormatter={(v: number) => formatKurusCompact(v)} domain={[0, yMax]} allowDataOverflow />
            <Tooltip
              cursor={{ stroke: 'var(--border-strong)' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const r = payload[0].payload as (typeof rows)[number]
                return (
                  <div className="rounded-xl border border-line bg-surface px-3 py-2 text-[12.5px] shadow-card">
                    <div className="font-semibold text-ink">
                      {r.year} · {r.age} yaş
                    </div>
                    {r.path !== null && <div className="num text-muted">Birikim: {formatKurus(r.path)}</div>}
                    {levels
                      .filter((l) => l.year !== null && YEAR0 + l.year === r.year)
                      .map((l) => (
                        <div key={l.id} className="font-medium text-ink">
                          {l.label} eşiği geçilir
                        </div>
                      ))}
                  </div>
                )
              }}
            />
            {levels.map((l) => (
              <ReferenceLine key={l.id} y={l.value} stroke={l.color} strokeWidth={1.5} strokeDasharray="3 4" label={{ value: l.label, position: 'insideTopLeft', fill: 'var(--muted)', fontSize: 11 }} />
            ))}
            {plan.debtFreeMonth !== null && plan.debtFreeMonth > 0 && plan.debtFreeMonth <= horizon * 12 && (
              <ReferenceLine x={YEAR0 + plan.debtFreeMonth / 12} stroke="var(--border-strong)" strokeDasharray="2 3" label={{ value: 'Borçsuz', position: 'top', fill: 'var(--muted)', fontSize: 11 }} />
            )}
            <Line type="monotone" dataKey="cautious" stroke={C.path} strokeOpacity={0.45} strokeWidth={1.5} strokeDasharray="5 5" dot={false} isAnimationActive={!reduced} />
            <Line type="monotone" dataKey="optimistic" stroke={C.path} strokeOpacity={0.45} strokeWidth={1.5} strokeDasharray="5 5" dot={false} isAnimationActive={!reduced} />
            <Area type="monotone" dataKey="path" stroke={C.path} strokeWidth={2.5} fill="url(#sim-fill)" isAnimationActive={!reduced} animationDuration={1400} activeDot={{ r: 5, stroke: 'var(--surface)', strokeWidth: 2 }} />
            <ReferenceDot x={YEAR0} y={Math.max(0, path[0] ?? 0)} r={6} fill={C.path} stroke="var(--surface)" strokeWidth={2} />
            {levels.map((l) =>
              l.year !== null && l.year <= horizon ? <ReferenceDot key={l.id} x={YEAR0 + l.year} y={l.value} r={6} fill={l.color} stroke="var(--surface)" strokeWidth={2} label={{ value: String(YEAR0 + l.year), position: 'top', fill: 'var(--text)', fontSize: 11, fontWeight: 600 }} /> : null,
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Yıllara göre tahmini net birikim, bugünün parasıyla</caption>
        <thead>
          <tr>
            <th>Yıl</th>
            <th>Yaş</th>
            <th>Birikim</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.year}>
              <td>{r.year}</td>
              <td>{r.age}</td>
              <td>{r.path === null ? '—' : formatKurus(r.path)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <ol className="relative -mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Rota takvimi">
        {milestones.map((m, i) => {
          const state = m.done ? 'done' : m.month === null ? 'far' : 'eta'
          return (
            <motion.li
              key={m.id}
              initial={reduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduced ? 0 : 0.05 * i }}
              className={cn('min-w-[92px] shrink-0 rounded-xl border px-3 py-2', state === 'done' ? 'border-accent/40 bg-accent-soft' : 'border-line bg-surface-2')}
            >
              <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-muted">
                <span className="size-2 rounded-full" style={{ background: state === 'done' ? 'var(--accent)' : m.color }} aria-hidden />
                {m.label}
              </div>
              <div className={cn('num mt-0.5 text-[15px] font-semibold', state === 'done' ? 'text-accent' : 'text-ink')}>{state === 'done' ? 'Tamam' : state === 'far' ? '—' : yearOf(m.month!)}</div>
            </motion.li>
          )
        })}
      </ol>
      <p className="relative mt-3 text-[12px] text-subtle">
        Bugünün parasıyla. Birikim her yıl enflasyon kadar, üstüne de %{SCENARIOS[sc].realReturnPct.toLocaleString('tr-TR')} bileşik büyür (enflasyon %{DEFAULT_INFLATION_PCT} ise yılda yaklaşık %{nominalPct(SCENARIOS[sc].realReturnPct).toLocaleString('tr-TR')}); aylık birikim yılda %{SAVING_GROWTH_PCT} artar; borç kapanınca taksiti birikime geçer. Tahmindir, garanti değildir.
      </p>
    </Card>
  )
}

function Key({ color, label, dashed, dotted }: { color: string; label: string; dashed?: boolean; dotted?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-0 w-4 border-t-2" style={{ borderColor: color, borderStyle: dashed ? 'dashed' : dotted ? 'dotted' : 'solid', opacity: dashed ? 0.6 : 1 }} />
      {label}
    </span>
  )
}

// ---------- Aylık paranın yolu ----------

/**
 * Gelirin dört kovaya dağılımı (gerçek rakamlar) ve bilimsel sınırlar: ihtiyaçlar %50, istekler en fazla
 * %30, birikim en az %20 (50/30/20), borç ödemesi en fazla %36. Altında rotanın sıradaki üç hamlesi.
 */
export function MoneyFlow({ j }: { profile?: JourneyProfile; facts?: JourneyFacts; j: JourneyResult }) {
  // Özet ile aynı gelir ve dönem: bütçe motorunun geliri (maaş ve düzenli gelirler)
  const flow = useMoneyFlow()
  if (!flow) return null
  const next = j.stages.filter((s) => !s.done).slice(0, 3)
  return (
    <Card className="p-4" aria-label="Aylık paranın yolu">
      <h3 className="flex items-center gap-2 font-display text-base font-semibold">
        <TrendingUp className="size-4 text-accent" /> Aylık paranın yolu
      </h3>
      <p className="mt-0.5 text-[12.5px] text-muted">
        {formatKurus(flow.incomeKurus)} gelir · 50/30/20 kuralı · Özet ile aynı
      </p>
      <FlowCells flow={flow} />
      {next.length > 0 && (
        <div className="mt-3 border-t border-line pt-2.5">
          <h4 className="text-[13px] font-semibold text-ink">Sıradaki hamlelerin</h4>
          <ol className="mt-2 flex flex-col gap-2">
            {next.map((s, i) => (
              <li key={s.id} className="grid grid-cols-[26px_1fr] gap-2.5 text-[13.5px]">
                <span className={cn('num grid size-6 place-items-center rounded-full text-[11.5px] font-bold', i === 0 ? 'bg-accent text-white' : 'border border-line bg-surface-2 text-muted')}>{i + 1}</span>
                <span>
                  <span className="font-semibold text-ink">{s.title}:</span> <span className="text-muted">{s.next}</span>
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-3 flex flex-wrap gap-3 text-[13px] font-semibold">
            {next.some((s) => s.id === 'debt') && (
              <Link to="/borclar" className="inline-flex items-center gap-1 text-accent">
                <Flag className="size-3.5" /> Borç planım <ArrowRight className="size-3.5" />
              </Link>
            )}
            {next.some((s) => s.id === 'starter' || s.id === 'emergency') && (
              <Link to="/yatirimlar" className="inline-flex items-center gap-1 text-accent">
                <ShieldCheck className="size-3.5" /> Acil fonumu ekle <ArrowRight className="size-3.5" />
              </Link>
            )}
            <Link to="/butce" className="inline-flex items-center gap-1 text-accent">
              Bütçemi aç <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      )}
    </Card>
  )
}

/** Rota sonucu elde yokken (ör. Plus özeti) aynı kartı kendi hesabıyla çizer. */
export function MoneyFlowFor({ profile, facts, rates }: { profile: JourneyProfile; facts: JourneyFacts; rates: BaseRates }) {
  const j = useMemo(() => buildJourney(profile, facts, rates, { runs: 0 }), [profile, facts, rates])
  return <MoneyFlow profile={profile} facts={facts} j={j} />
}
