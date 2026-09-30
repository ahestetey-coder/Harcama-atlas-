import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
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
