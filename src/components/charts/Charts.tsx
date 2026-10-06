import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatDate } from '../../domain/dates'
import { formatKurus, formatKurusCompact } from '../../domain/money'
import { useReducedMotion } from '../../lib/hooks'

export interface DonutSlice {
  id: string
  name: string
  color: string
  kurus: number
  /** Birden çok kategoriyi toplayan dilim (tıklanınca kategori açılmaz). */
  grouped?: boolean
}

function TooltipBox({ title, lines }: { title: string; lines: Array<[string, string]> }) {
  return (
    <div className="rounded-xl border border-line-strong bg-surface px-3 py-2 text-[12.5px] shadow-float">
      <div className="mb-1 font-semibold text-ink">{title}</div>
      {lines.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 text-muted">
          <span>{k}</span>
          <span className="num font-medium text-ink">{v}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * Kategori dağılımı: yalnızca brüt giderler (negatif net tutarlar pastaya zorlanmaz).
 * Kimlik yalnızca renge bırakılmaz; yanındaki liste her dilimi adıyla ve tutarıyla gösterir.
 */
export function CategoryDonut({ slices, total, onSelect, centerLabel }: { slices: DonutSlice[]; total: number; onSelect?: (s: DonutSlice) => void; centerLabel: string }) {
  const reduced = useReducedMotion()
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={slices}
            dataKey="kurus"
            nameKey="name"
            innerRadius="68%"
            outerRadius="100%"
            paddingAngle={slices.length > 1 ? 1.5 : 0}
            cornerRadius={4}
            stroke="var(--surface)"
            strokeWidth={2}
            startAngle={90}
            endAngle={-270}
            isAnimationActive={!reduced}
            animationDuration={550}
            animationEasing="ease-out"
            onClick={(d: unknown) => {
              const s = (d as { payload?: DonutSlice })?.payload
              if (s) onSelect?.(s)
            }}
            className="cursor-pointer outline-none"
          >
            {slices.map((s) => (
              <Cell key={s.id} fill={s.color} aria-label={`${s.name}: ${formatKurus(s.kurus)}`} />
            ))}
          </Pie>
          <Tooltip
            cursor={false}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const s = payload[0].payload as DonutSlice
              return <TooltipBox title={s.name} lines={[['Gider', formatKurus(s.kurus)], ['Pay', `%${((s.kurus / Math.max(1, total)) * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`]]} />
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[11.5px] font-medium uppercase tracking-wide text-subtle">{centerLabel}</span>
        <span className="num mt-0.5 font-display text-lg font-bold text-ink">{formatKurusCompact(total)}</span>
      </div>
    </div>
  )
}

export interface DailyPoint {
  day: number
  expenseKurus: number
  refundKurus: number
  label: string
}

/** Günlük gider çubukları (tek seri, tek eksen). İadeler ipucunda ayrıca gösterilir. */
export function DailyBars({ data, onSelect, highlightDay }: { data: DailyPoint[]; onSelect?: (day: number) => void; highlightDay?: number }) {
  const reduced = useReducedMotion()
  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="18%">
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--subtle)', fontSize: 11 }}
            interval="preserveStartEnd"
            minTickGap={12}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={52}
            tick={{ fill: 'var(--subtle)', fontSize: 11 }}
            tickFormatter={(v: number) => (Math.abs(v) >= 100000 ? `${(v / 100000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} B ₺` : formatKurusCompact(v))}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: 'var(--surface-2)', radius: 6 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const p = payload[0].payload as DailyPoint
              const lines: Array<[string, string]> = [['Gider', formatKurus(p.expenseKurus)]]
              if (p.refundKurus) lines.push(['İade', formatKurus(p.refundKurus)])
              return <TooltipBox title={p.label} lines={lines} />
            }}
          />
          <Bar
            dataKey="expenseKurus"
            name="Gider"
            radius={[4, 4, 0, 0]}
            maxBarSize={18}
            isAnimationActive={!reduced}
            animationDuration={500}
            onClick={(d: unknown) => {
              const p = (d as { payload?: DailyPoint })?.payload
              if (p && onSelect) onSelect(p.day)
            }}
            className="cursor-pointer"
          >
            {data.map((d) => (
              <Cell key={d.day} fill={highlightDay === d.day ? 'var(--teal)' : 'var(--accent)'} fillOpacity={highlightDay && highlightDay !== d.day ? 0.45 : 0.9} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export interface WealthPoint {
  date: string
  valueKurus: number
  contributedKurus: number
}

/**
 * Varlık değeri ve yatırılan tutar (aynı birim, tek eksen). Yalnızca kullanıcının veri girdiği
 * günler noktalanır; ekran okuyucu için tablo eşlik eder.
 */
export function WealthLine({ points }: { points: WealthPoint[] }) {
  const reduced = useReducedMotion()
  const data = points.map((p) => ({ ...p, label: formatDate(p.date), ts: Date.parse(`${p.date}T00:00:00Z`) }))
  return (
    <div>
      <div className="mt-2 flex flex-wrap gap-4 text-[12px] text-muted" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full" style={{ background: 'var(--asset-1)' }} /> Değer
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: 'var(--subtle)' }} /> Yatırılan
        </span>
      </div>
      <div className="mt-2 h-48" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="ts"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--subtle)', fontSize: 11 }}
              tickFormatter={(v: number) => formatDate(new Date(v).toISOString().slice(0, 10))}
              ticks={data.length <= 4 ? data.map((d) => d.ts) : [data[0].ts, data[Math.floor(data.length / 2)].ts, data[data.length - 1].ts]}
              padding={{ left: 8, right: 8 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={56}
              tick={{ fill: 'var(--subtle)', fontSize: 11 }}
              tickFormatter={(v: number) => formatKurusCompact(v)}
              domain={['auto', 'auto']}
            />
            <Tooltip
              cursor={{ stroke: 'var(--border-strong)' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const p = payload[0].payload as WealthPoint & { label: string }
                return (
                  <TooltipBox
                    title={p.label}
                    lines={[
                      ['Değer', formatKurus(p.valueKurus)],
                      ['Yatırılan', formatKurus(p.contributedKurus)],
                      ['Fark', formatKurus(p.valueKurus - p.contributedKurus)],
                    ]}
                  />
                )
              }}
            />
            <Line type="linear" dataKey="contributedKurus" stroke="var(--subtle)" strokeWidth={2} strokeDasharray="4 4" dot={false} isAnimationActive={!reduced} />
            <Line type="linear" dataKey="valueKurus" stroke="var(--asset-1)" strokeWidth={2} dot={{ r: 4, fill: 'var(--asset-1)', stroke: 'var(--surface)', strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={!reduced} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Varlık değeri ve yatırılan tutar</caption>
        <thead>
          <tr>
            <th>Tarih</th>
            <th>Değer</th>
            <th>Yatırılan</th>
          </tr>
        </thead>
        <tbody>
          {data.map((p) => (
            <tr key={p.date}>
              <td>{p.label}</td>
              <td>{formatKurus(p.valueKurus)}</td>
              <td>{formatKurus(p.contributedKurus)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export interface ScenarioRow {
  year: number
  cautious: number
  mid: number
  optimistic: number
  target: number
}

const SCENARIO_SERIES: Array<{ key: 'optimistic' | 'mid' | 'cautious'; label: string; color: string }> = [
  { key: 'optimistic', label: 'Olumlu', color: 'var(--asset-1)' },
  { key: 'mid', label: 'Orta', color: 'var(--asset-2)' },
  { key: 'cautious', label: 'Temkinli', color: 'var(--asset-3)' },
]

/** Üç senaryo ve hedef çizgisi (yıl ekseni). */
export function ScenarioLines({ rows, caption }: { rows: ScenarioRow[]; caption: string }) {
  const reduced = useReducedMotion()
  const last = rows[rows.length - 1]?.year ?? 0
  const step = last <= 10 ? 1 : last <= 20 ? 2 : 5
  const ticks = rows.filter((r) => r.year % step === 0 || r.year === last).map((r) => r.year)
  return (
    <div>
      <div className="mt-2 flex flex-wrap gap-4 text-[12px] text-muted" aria-hidden>
        {SCENARIO_SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} /> {s.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: 'var(--subtle)' }} /> Hedef
        </span>
      </div>
      <div className="mt-2 h-60" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="year" type="number" domain={[0, last]} ticks={ticks} tickLine={false} axisLine={false} tick={{ fill: 'var(--subtle)', fontSize: 11 }} tickFormatter={(v: number) => (v === 0 ? 'Bugün' : `${v}. yıl`)} />
            <YAxis tickLine={false} axisLine={false} width={68} tick={{ fill: 'var(--subtle)', fontSize: 11 }} tickFormatter={(v: number) => formatKurusCompact(v)} domain={['auto', 'auto']} />
            <Tooltip
              cursor={{ stroke: 'var(--border-strong)' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const p = payload[0].payload as ScenarioRow
                return (
                  <TooltipBox
                    title={p.year === 0 ? 'Bugün' : `${p.year}. yıl sonu`}
                    lines={[...SCENARIO_SERIES.map((s) => [s.label, formatKurus(p[s.key])] as [string, string]), ['Hedef', formatKurus(p.target)]]}
                  />
                )
              }}
            />
            <Line type="linear" dataKey="target" stroke="var(--subtle)" strokeWidth={2} strokeDasharray="4 4" dot={false} isAnimationActive={!reduced} />
            {SCENARIO_SERIES.map((s) => (
              <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: 'var(--surface)', strokeWidth: 2 }} isAnimationActive={!reduced} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th>Yıl</th>
            {SCENARIO_SERIES.map((s) => (
              <th key={s.key}>{s.label}</th>
            ))}
            <th>Hedef</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.year}>
              <td>{r.year}</td>
              {SCENARIO_SERIES.map((s) => (
                <td key={s.key}>{formatKurus(r[s.key])}</td>
              ))}
              <td>{formatKurus(r.target)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Borç bakiyesi: plan ile yalnızca asgari ödeme karşılaştırması (ay ekseni). */
export function DebtPayoffChart({ plan, minOnly }: { plan: number[]; minOnly: number[] | null }) {
  const reduced = useReducedMotion()
  const span = Math.min(Math.max(plan.length, Math.min(minOnly?.length ?? 0, plan.length * 2)), 120)
  const rows = Array.from({ length: span }, (_, m) => ({ m, plan: plan[m] ?? 0, minOnly: minOnly ? (minOnly[m] ?? 0) : undefined }))
  return (
    <div>
      <div className="mt-2 flex flex-wrap gap-4 text-[12px] text-muted" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full" style={{ background: 'var(--asset-1)' }} /> Bu planla
        </span>
        {minOnly && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: 'var(--subtle)' }} /> Yalnızca asgari ödeme
          </span>
        )}
      </div>
      <div className="mt-2 h-40" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="debt-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--asset-1)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--asset-1)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="m" type="number" domain={[0, span - 1]} tickLine={false} axisLine={false} tick={{ fill: 'var(--subtle)', fontSize: 11 }} tickFormatter={(v: number) => (v === 0 ? 'Bugün' : `${v}. ay`)} />
            <YAxis tickLine={false} axisLine={false} width={64} tick={{ fill: 'var(--subtle)', fontSize: 11 }} tickFormatter={(v: number) => formatKurusCompact(v)} />
            <Tooltip
              cursor={{ stroke: 'var(--border-strong)' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const p = payload[0].payload as (typeof rows)[number]
                const lines: Array<[string, string]> = [['Bu planla', formatKurus(p.plan)]]
                if (p.minOnly !== undefined) lines.push(['Yalnızca asgari', formatKurus(p.minOnly)])
                return <TooltipBox title={p.m === 0 ? 'Bugün' : `${p.m}. ay sonu`} lines={lines} />
              }}
            />
            {minOnly && <Area type="monotone" dataKey="minOnly" stroke="var(--subtle)" strokeWidth={2} strokeDasharray="4 4" fill="none" isAnimationActive={!reduced} />}
            <Area type="monotone" dataKey="plan" stroke="var(--asset-1)" strokeWidth={2} fill="url(#debt-fill)" isAnimationActive={!reduced} animationDuration={1400} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
