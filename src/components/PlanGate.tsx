import { Lock, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { FEATURE_PLAN, PLAN_LABEL, type Feature, type Plan } from '../domain/plans'
import { cn } from '../lib/cn'
import { usePlan } from '../state/plan'
import { Card } from './ui/primitives'

/** Küçük "Plus" / "Plus+" etiketi. */
export function PlanBadge({ plan, className }: { plan: Plan; className?: string }) {
  if (plan === 'free') return null
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide text-white',
        plan === 'plus' ? 'bg-gradient-to-r from-emerald-500 to-teal-600' : 'bg-gradient-to-r from-violet-500 to-fuchsia-600',
        className,
      )}
    >
      <Sparkles className="size-3" />
      {PLAN_LABEL[plan]}
    </span>
  )
}

/** Özellik pakette yoksa içeriği kilitli bir tanıtım kartıyla değiştirir. */
export function PlanGate({ feature, title, children, points }: { feature: Feature; title: string; points: string[]; children: ReactNode }) {
  const { has } = usePlan()
  if (has(feature)) return <>{children}</>
  const need = FEATURE_PLAN[feature]
  return (
    <Card className="relative overflow-hidden p-6 sm:p-8">
      <div aria-hidden className="absolute -right-16 -top-16 size-48 rounded-full bg-gradient-to-br from-emerald-400/25 to-cyan-400/10 blur-2xl" />
      <div className="relative">
        <div className="flex items-center gap-2">
          <span className="grid size-10 place-items-center rounded-xl bg-surface-2 text-accent">
            <Lock className="size-5" />
          </span>
          <PlanBadge plan={need} />
        </div>
        <h2 className="mt-4 font-display text-xl font-bold text-ink">{title}</h2>
        <p className="mt-1 text-sm text-muted">Bu özellik {PLAN_LABEL[need]} paketinde yer alır.</p>
        <ul className="mt-4 space-y-2 text-sm text-ink">
          {points.map((p) => (
            <li key={p} className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
              {p}
            </li>
          ))}
        </ul>
        <Link
          to="/paketler"
          className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 px-5 text-sm font-semibold text-white shadow-[0_8px_20px_-10px_rgb(5_150_105/0.8)] hover:brightness-110"
        >
          <Sparkles className="size-4" /> Paketleri incele
        </Link>
      </div>
    </Card>
  )
}
