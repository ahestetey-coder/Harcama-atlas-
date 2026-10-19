import { ChevronRight, CreditCard, PiggyBank, Plus, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'
import type { FlowKey, FlowRow, MoneyFlowResult } from '../domain/moneyFlow'
import { cn } from '../lib/cn'
import { useReducedMotion } from '../lib/hooks'
import { Card } from './ui/primitives'

/** 50/30/20 kovaları; renkler açık ve koyu temada doğrulanmış paletten. */
export const FLOW_META: Record<FlowKey, { label: string; color: string }> = {
  needs: { label: 'Zorunlu gider ve ihtiyaçlar', color: '#0284c7' },
  wants: { label: 'İstekler', color: '#d97706' },
  saving: { label: 'Borç kapama ve birikim', color: '#059669' },
}

/** Tam lira: 1765000 → "17.650 ₺" */
export const tl = (k: number) => `${Math.round(k / 100).toLocaleString('tr-TR')} ₺`
const pct = (x: number) => `%${Math.round(x * 100)}`

/** Hücrenin durum satırı: hedefin içinde mi, ne kadar aşıldı ya da birikim ne kadar eksik. */
export function flowNote(r: FlowRow): string {
  if (r.key === 'saving') return r.spentKurus >= r.targetKurus ? '✓ hedefte' : `${tl(r.targetKurus - r.spentKurus)} kaldı`
  return r.ok ? `✓ ${tl(r.targetKurus - r.spentKurus)} kaldı` : `! ${tl(r.spentKurus - r.targetKurus)} aştı`
}

function Bar({ r, delay }: { r: FlowRow; delay: number }) {
  const reduced = useReducedMotion()
  const over = !r.ok
  const ratio = r.targetKurus > 0 ? Math.max(0, r.spentKurus) / r.targetKurus : r.spentKurus > 0 ? 1 : 0
  return (
    <div className={'h-2 overflow-hidden rounded-full bg-surface-2'}>
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

/** Hedef dağılım çubuğu ve üç hücre: pay, hedef tutar, harcanan (ya da ayrılan) / hedef; boş başlar, kayıt eklendikçe dolar. */
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
      <ul className="mt-2.5 grid grid-cols-1 gap-1.5 sm:grid-cols-3 sm:gap-2">
        {flow.rows.map((r, i) => (
          <li key={r.key} className="rounded-xl border border-line p-2">
            <div className="flex items-center justify-between gap-1 text-[12px] text-muted">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="size-2 shrink-0 rounded-full" style={{ background: FLOW_META[r.key].color }} aria-hidden /> <span className="truncate">{FLOW_META[r.key].label}</span>
              </span>
              <span className="num font-semibold text-ink">{pct(r.share)}</span>
            </div>
            <div className="num mt-1 text-[15px] font-semibold leading-tight text-ink">{tl(r.targetKurus)}</div>
            <div className="num mt-1 text-[11.5px] text-muted">
              {r.key === 'saving' ? 'Ayrılan' : 'Harcanan'} {tl(r.spentKurus)} / {tl(r.targetKurus)}
            </div>
            <div className="mt-1.5">
              <Bar r={r} delay={0.1 * i} />
            </div>
            <div className={cn('mt-1 text-[11.5px] font-medium', !r.ok ? 'text-danger' : r.key === 'saving' && r.spentKurus < r.targetKurus ? 'text-muted' : 'text-accent')}>{flowNote(r)}</div>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11.5px] text-subtle">
        Zorunlu: kira, fatura, market, ulaşım, sağlık, eğitim, kredi ve taksit ödemeleri. İstekler: restoran ve kafe, giyim, eğlence, abonelikler ve diğer. Borç kapama ve birikim: Yatırımlarım'a eklenenler ve borçlarından düşülen ödemeler.
      </p>
    </>
  )
}

/** Özet sayfası kartı: Finansal Yolculuğum'daki hücrelerle aynı tasarım. */
export function MoneyFlowSummary({ flow, className }: { flow: MoneyFlowResult; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Card className={cn('p-4', className)} aria-label="Aylık paranın yolu">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <TrendingUp className="size-4 text-accent" /> Aylık paranın yolu
        </h2>
        <div className="relative flex items-center gap-1">
          <Link to="/butce" className="inline-flex items-center text-[13px] font-medium text-accent hover:underline">
            Bütçe <ChevronRight className="size-4" />
          </Link>
          <button
            type="button"
            aria-label="Borç kapama ve birikim ekle"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="pressable grid size-8 place-items-center rounded-full bg-accent text-white shadow-card"
          >
            <Plus className="size-4" />
          </button>
          {open && (
            <div role="menu" className="absolute right-0 top-10 z-10 w-48 overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-float">
              <Link role="menuitem" to="/yatirimlar?yeni=1" className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13.5px] text-ink hover:bg-surface-2">
                <PiggyBank className="size-4 text-accent" /> Birikim ekle
              </Link>
              <Link role="menuitem" to="/borclar" className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13.5px] text-ink hover:bg-surface-2">
                <CreditCard className="size-4 text-accent" /> Borç ödemesi ekle
              </Link>
            </div>
          )}
        </div>
      </div>
      <p className="num mt-0.5 text-[12.5px] text-muted">
        {tl(flow.incomeKurus)} gelir · 50/30/20 kuralı
      </p>
      <FlowCells flow={flow} />
    </Card>
  )
}
