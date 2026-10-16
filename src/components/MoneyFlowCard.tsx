import { ChevronRight, TrendingUp } from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'
import type { FlowKey, FlowRow, MoneyFlowResult } from '../domain/moneyFlow'
import { cn } from '../lib/cn'
import { useReducedMotion } from '../lib/hooks'
import { Card } from './ui/primitives'

/** Doğrulanmış kategorik renkler (Özgürlük simülasyonuyla aynı). */
export const FLOW_META: Record<FlowKey, { label: string; color: string }> = {
  needs: { label: 'İhtiyaçlar', color: '#0284c7' },
  wants: { label: 'İstekler', color: '#8b5cf6' },
  debt: { label: 'Borç ve taksit', color: '#d97706' },
  saving: { label: 'Birikim', color: '#059669' },
}

/** Tam lira: 1765000 → "17.650 ₺" */
export const tl = (k: number) => `${Math.round(k / 100).toLocaleString('tr-TR')} ₺`
const pct = (x: number) => `%${Math.round(x * 100)}`

/** Hücrenin durum satırı: hedefin içinde mi, ne kadar aşıldı ya da birikim ne kadar eksik. */
export function flowNote(r: FlowRow): string {
  if (r.key === 'saving') return r.ok ? '✓ hedefte' : r.spentKurus < 0 ? `! ${tl(-r.spentKurus)} açık` : `! ${tl(r.targetKurus - r.spentKurus)} eksik`
  if (r.targetKurus === 0) return r.spentKurus > 0 ? `! ${tl(r.spentKurus)}` : '✓ yok'
  return r.ok ? `✓ ${tl(r.targetKurus - r.spentKurus)} kaldı` : `! ${tl(r.spentKurus - r.targetKurus)} aştı`
}

function Bar({ r, delay, thin }: { r: FlowRow; delay: number; thin?: boolean }) {
  const reduced = useReducedMotion()
  const over = !r.ok && r.key !== 'saving'
  const ratio = r.targetKurus > 0 ? Math.max(0, r.spentKurus) / r.targetKurus : r.spentKurus > 0 ? 1 : 0
  return (
    <div className={cn('overflow-hidden rounded-full bg-surface-2', thin ? 'h-1.5' : 'h-2')}>
      <motion.div
        className={cn('h-full rounded-full', over && 'bg-danger')}
        style={over ? undefined : { background: FLOW_META[r.key].color }}
        initial={reduced ? false : { width: 0 }}
        animate={{ width: `${Math.min(1, ratio) * 100}%` }}
        transition={{ duration: 0.7, delay: reduced ? 0 : delay, ease: [0.2, 0.8, 0.2, 1] }}
      />
    </div>
  )
}

/** Hedef dağılım çubuğu ve dört hücre: bilimsel pay, hedef tutar, harcanan / hedef. */
export function FlowCells({ flow }: { flow: MoneyFlowResult }) {
  const reduced = useReducedMotion()
  return (
    <>
      <div className="mt-3 flex h-4 gap-0.5 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={flow.rows.map((r) => `${FLOW_META[r.key].label} ${pct(r.share)}`).join(', ')}>
        {flow.rows.map((r, i) =>
          r.share > 0 ? (
            <motion.span
              key={r.key}
              className="h-full first:rounded-l-full last:rounded-r-full"
              style={{ background: FLOW_META[r.key].color }}
              initial={reduced ? false : { width: 0 }}
              animate={{ width: `${r.share * 100}%` }}
              transition={{ duration: 0.8, delay: reduced ? 0 : 0.1 * i, ease: [0.2, 0.8, 0.2, 1] }}
            />
          ) : null,
        )}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {flow.rows.map((r, i) => (
          <li key={r.key} className="rounded-xl border border-line p-2.5">
            <div className="flex items-center justify-between gap-1 text-[12px] text-muted">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="size-2 shrink-0 rounded-full" style={{ background: FLOW_META[r.key].color }} aria-hidden /> <span className="truncate">{FLOW_META[r.key].label}</span>
              </span>
              <span className="num font-semibold text-ink">{pct(r.share)}</span>
            </div>
            <div className="num mt-1 text-[15px] font-semibold leading-tight text-ink">{tl(r.targetKurus)}</div>
            <div className="num mt-1 text-[11.5px] text-muted">
              {r.key === 'saving' ? 'Kalan' : 'Harcanan'} {tl(r.spentKurus)} / {tl(r.targetKurus)}
            </div>
            <div className="mt-1.5">
              <Bar r={r} delay={0.1 * i} />
            </div>
            <div className={cn('mt-1 text-[11.5px] font-medium', r.ok ? 'text-accent' : 'text-warning')}>{flowNote(r)}</div>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11.5px] text-subtle">
        {flow.personal
          ? 'Hedefler gelirine, sabit giderlerine ve borçlarına göre kişisel; birikim, gelirden bu ay kalan.'
          : 'Sabit oranlar: 50/30/20 (borç ödemen varsa ihtiyaçların %15’i borca). Kişisel oranlar Plus’ta.'}
      </p>
    </>
  )
}

/** Özet sayfası için sade kart: dört satır, harcanan / hedef ve ince çubuk. */
export function MoneyFlowSummary({ flow, className }: { flow: MoneyFlowResult; className?: string }) {
  return (
    <Card className={cn('p-5', className)} aria-label="Aylık paranın yolu">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <TrendingUp className="size-4 text-accent" /> Aylık paranın yolu
        </h2>
        <Link to="/butce" className="inline-flex items-center text-[13px] font-medium text-accent hover:underline">
          Bütçe <ChevronRight className="size-4" />
        </Link>
      </div>
      <p className="num mt-0.5 text-[12.5px] text-muted">
        {tl(flow.incomeKurus)} gelir · {flow.personal ? 'kişisel oranlar' : 'sabit oranlar (50/30/20)'}
      </p>
      <ul className="mt-3 flex flex-col gap-2.5">
        {flow.rows.map((r, i) => (
          <li key={r.key}>
            <div className="flex items-baseline justify-between gap-2 text-[13px]">
              <span className="flex min-w-0 items-center gap-1.5 text-muted">
                <span className="size-2 shrink-0 rounded-full" style={{ background: FLOW_META[r.key].color }} aria-hidden />
                {FLOW_META[r.key].label} <span className="text-subtle">{pct(r.share)}</span>
              </span>
              <span className={cn('num font-medium', r.ok ? 'text-ink' : 'text-warning')}>
                {tl(r.spentKurus)} <span className="text-subtle">/ {tl(r.targetKurus)}</span>
              </span>
            </div>
            <div className="mt-1">
              <Bar r={r} delay={0.08 * i} thin />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}
