import { motion } from 'motion/react'
import { useReducedMotion } from '../lib/hooks'

/** Seviye halkası: tamamlanan aşamalar + sıradakinin ilerlemesi. */
export function LevelRing({ position, total, level }: { position: number; total: number; level: number }) {
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
