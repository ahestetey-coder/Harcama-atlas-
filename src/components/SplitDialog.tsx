import { ArrowRight, Check, Copy, Scale, Share2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { formatKurus } from '../domain/money'
import { splitEqually, type SplitMember } from '../domain/split'
import type { Transaction } from '../domain/types'
import { cn } from '../lib/cn'
import { Modal } from './ui/Modal'
import { Button } from './ui/primitives'

/** Ortak grubun dönem giderini üyelere eşit böler; kimin kime ne ödeyeceğini gösterir. Kayıtları değiştirmez. */
export function SplitDialog({
  open,
  onOpenChange,
  groupName,
  periodText,
  members,
  transactions,
  selfId,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  groupName: string
  periodText: string
  members: SplitMember[]
  transactions: Transaction[]
  selfId: string | null
}) {
  const result = useMemo(() => splitEqually(members, transactions, selfId), [members, transactions, selfId])
  const nameOf = (id: string) => result.people.find((p) => p.id === id)?.name ?? 'Grup üyesi'
  const [copied, setCopied] = useState(false)

  const summary = [
    `${groupName} · ${periodText}`,
    `Toplam gider: ${formatKurus(result.totalKurus)} · ${result.people.length} kişi · kişi başı ${formatKurus(result.perPersonKurus)}`,
    '',
    ...result.people.map((p) => `${p.name}: ödedi ${formatKurus(p.paidKurus)}, payı ${formatKurus(p.shareKurus)}`),
    '',
    ...(result.transfers.length ? result.transfers.map((t) => `${nameOf(t.fromId)} → ${nameOf(t.toId)}: ${formatKurus(t.amountKurus)}`) : ['Herkes payını ödemiş; ödeme gerekmiyor.']),
  ].join('\n')

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: `${groupName} hesaplaşması`, text: summary })
        return
      }
      await navigator.clipboard.writeText(summary)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* paylaşım iptal edildi */
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Gideri paylaştır"
      description={`${groupName} · ${periodText}`}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Kapat
          </Button>
          <Button variant="primary" icon={copied ? <Check className="size-4" /> : typeof navigator !== 'undefined' && 'share' in navigator ? <Share2 className="size-4" /> : <Copy className="size-4" />} onClick={() => void share()}>
            {copied ? 'Kopyalandı' : 'Özeti paylaş'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-1">
        <div className="hero-gradient grid grid-cols-3 gap-3 rounded-2xl p-4 text-white">
          <Figure label="Toplam gider" value={formatKurus(result.totalKurus)} />
          <Figure label="Üye" value={String(result.people.length)} />
          <Figure label="Kişi başı" value={formatKurus(result.perPersonKurus)} />
        </div>

        <section aria-labelledby="split-people">
          <h3 id="split-people" className="mb-2 text-[13px] font-semibold text-muted">
            Kim ne ödedi
          </h3>
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {result.people.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{p.name}</span>
                  <span className="num block text-[12px] text-subtle">
                    Ödedi {formatKurus(p.paidKurus)}
                  </span>
                </span>
                <span
                  className={cn(
                    'num shrink-0 rounded-lg px-2 py-1 text-[12.5px] font-semibold',
                    p.balanceKurus > 0 ? 'bg-accent-soft text-accent-strong dark:text-accent' : p.balanceKurus < 0 ? 'bg-danger-soft text-danger' : 'bg-surface-2 text-muted',
                  )}
                >
                  {p.balanceKurus > 0 ? `+${formatKurus(p.balanceKurus)} alacak` : p.balanceKurus < 0 ? `${formatKurus(-p.balanceKurus)} borç` : 'Denk'}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="split-transfers">
          <h3 id="split-transfers" className="mb-2 text-[13px] font-semibold text-muted">
            Denkleşmek için
          </h3>
          {result.transfers.length === 0 ? (
            <p className="flex items-center gap-2 rounded-2xl border border-line bg-surface-2 px-3.5 py-3 text-sm text-muted">
              <Scale className="size-4 text-accent" /> Herkes payını ödemiş; ödeme gerekmiyor.
            </p>
          ) : (
            <ul className="flex flex-col gap-2" aria-label="Yapılacak ödemeler">
              {result.transfers.map((t) => (
                <li key={`${t.fromId}-${t.toId}`} className="flex items-center gap-2 rounded-2xl border border-line bg-surface-2 px-3.5 py-3 text-sm">
                  <span className="min-w-0 truncate font-medium text-ink">{nameOf(t.fromId)}</span>
                  <ArrowRight className="size-4 shrink-0 text-subtle" aria-label="ödeyecek" />
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">{nameOf(t.toId)}</span>
                  <span className="num shrink-0 font-display font-semibold text-ink">{formatKurus(t.amountKurus)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-[12.5px] leading-relaxed text-subtle">
          Gider, gruptaki {result.people.length} kişiye eşit bölündü. Kart ödemeleri sayılmaz, iadeler ödeyenin harcamasından düşer. Bu bir hesaplaşma özetidir; kayıtlarınız değişmez.
        </p>
      </div>
    </Modal>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium uppercase tracking-wider text-white/65">{label}</div>
      <div className="num mt-1 truncate font-display text-[17px] font-bold sm:text-[19px]">{value}</div>
    </div>
  )
}
