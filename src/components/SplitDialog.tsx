import { AlertTriangle, ArrowRight, Check, CheckCircle2, Copy, Scale, Share2, Undo2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { settleGroupPeriod, unsettleGroupPeriod } from '../cloud/sync'
import { cloudErrorMessage } from '../cloud/errors'
import { UserFacingError } from '../data/repository'
import { formatDate } from '../domain/dates'
import { formatKurus } from '../domain/money'
import { findSettlement, settlementRangeText } from '../domain/personal'
import { splitEqually, type SplitMember, type SplitResult } from '../domain/split'
import type { GroupSettlement, SpendGroup, Transaction } from '../domain/types'
import { cn } from '../lib/cn'
import { useCloud } from '../state/cloud'
import { useRepo } from '../state/data'
import { useUi } from '../state/ui'
import { Modal } from './ui/Modal'
import { Button } from './ui/primitives'

/** Paylaşımdaki pay listesi (üye → kuruş). */
export function sharesOf(result: SplitResult): Record<string, number> {
  return Object.fromEntries(result.people.map((p) => [p.id, p.shareKurus]))
}

/** Kayıtlı paylaşım, grubun şimdiki giderleriyle aynı mı? */
export function settlementMatches(s: GroupSettlement, result: SplitResult): boolean {
  const now = sharesOf(result)
  const keys = new Set([...Object.keys(now), ...Object.keys(s.shares)])
  return s.totalKurus === result.totalKurus && [...keys].every((k) => (now[k] ?? 0) === (s.shares[k] ?? 0))
}

/**
 * Ortak grubun dönem giderini üyelere eşit böler; kimin kime ne ödeyeceğini gösterir. Grup yöneticisi
 * dönemi "paylaştırır": her üyenin "Tümü" görünümüne yalnızca kendi payı yansır. Yönetici geri alabilir.
 */
export function SplitDialog({
  open,
  onOpenChange,
  group,
  period,
  periodText,
  members,
  transactions,
  selfId,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  group: SpendGroup
  /** Grubun dönemi (yöneticinin ay döngüsüne göre). */
  period: { start: string; end: string }
  periodText: string
  members: SplitMember[]
  transactions: Transaction[]
  selfId: string | null
}) {
  const groupName = group.name
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
        <SettleStatus group={group} period={period} result={result} selfId={selfId} />

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
          Gider, gruptaki {result.people.length} kişiye eşit bölündü. Kart ödemeleri sayılmaz, iadeler ödeyenin harcamasından düşer. Paylaştırma kayıtları silmez veya değiştirmez; herkesin “Tümü” görünümüne ödediğiyle payı arasındaki fark alacak veya borç olarak eklenir.
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

/** Dönemin paylaşım durumu; yönetici paylaştırır, günceller veya geri alır. */
function SettleStatus({ group, period, result, selfId }: { group: SpendGroup; period: { start: string; end: string }; result: SplitResult; selfId: string | null }) {
  const repo = useRepo()
  const { backend } = useCloud()
  const { toast } = useUi()
  const [busy, setBusy] = useState(false)
  const [confirmUndo, setConfirmUndo] = useState(false)
  const settlement = findSettlement(group, period)
  // Yönetici paylaştırdıktan sonra dönem ayarı değiştiyse paylaşım bu dönemle tam örtüşmeyebilir
  const sameRange = !!settlement && settlement.start === period.start && settlement.end === period.end
  const isOwner = !!selfId && group.cloudOwnerId === selfId
  const matches = settlement && sameRange ? settlementMatches(settlement, result) : false
  const myShare = settlement && selfId ? (settlement.shares[selfId] ?? 0) : 0

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true)
    try {
      await fn()
      toast(ok)
      setConfirmUndo(false)
    } catch (e) {
      toast(e instanceof UserFacingError ? e.message : cloudErrorMessage(e), { kind: 'error' })
    } finally {
      setBusy(false)
    }
  }
  const settle = () =>
    run(
      () => settleGroupPeriod(repo, backend, group.id, { start: period.start, end: period.end, totalKurus: result.totalKurus, shares: sharesOf(result) }),
      settlement ? 'Paylaşım güncellendi.' : 'Gider paylaştırıldı. Üyeler eşitlemeden sonra kendi paylarını görür.',
    )
  const undo = () => run(() => unsettleGroupPeriod(repo, backend, group.id, settlement!.start), 'Paylaşım geri alındı.')

  if (!settlement) {
    return (
      <div className="rounded-2xl border border-line bg-surface-2 p-3.5 text-sm" role="status">
        <p className="font-semibold text-ink">Bu dönem henüz paylaştırılmadı</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
          {isOwner
            ? 'Paylaştırdığınızda payından fazla ödeyenin “Tümü” görünümüne alacak, az ödeyenin borç satırı eklenir; ortak gider herkese payı kadar yansır. İstediğiniz zaman geri alabilirsiniz.'
            : 'Paylaşımı grup yöneticisi yapar. Paylaştırılana kadar “Tümü” toplamınıza yalnızca kendi eklediğiniz giderler girer.'}
        </p>
        {isOwner && (
          <Button variant="primary" size="sm" className="mt-3" icon={<Scale className="size-4" />} loading={busy} disabled={result.totalKurus <= 0} onClick={() => void settle()}>
            Gideri paylaştır
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className={cn('rounded-2xl border p-3.5 text-sm', matches ? 'border-accent/30 bg-accent-soft' : 'border-warning/40 bg-warning-soft')} role="status">
      <p className="flex items-center gap-2 font-semibold text-ink">
        {matches ? <CheckCircle2 className="size-4 shrink-0 text-accent" /> : <AlertTriangle className="size-4 shrink-0 text-warning" />}
        {isOwner ? 'Bu dönem paylaştırıldı' : 'Yönetici bu dönemin giderini sizinle paylaştı'}
      </p>
      <p className="num mt-0.5 text-[13px] leading-relaxed text-muted">
        {formatDate(settlement.createdAt.slice(0, 10), 'long')} · toplam {formatKurus(settlement.totalKurus)}
        {myShare > 0 && <> · payınız <span className="font-semibold text-ink">{formatKurus(myShare)}</span></>}
      </p>
      {!sameRange && (
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink">
          Paylaşım {settlementRangeText(settlement)} dönemi için yapıldı; bu ekrandaki dönemden farklı.
        </p>
      )}
      {sameRange && !matches && (
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink">
          Paylaştırıldıktan sonra grubun giderleri değişti. {isOwner ? 'Paylaşımı güncelleyerek yeni tutarları yansıtabilirsiniz.' : 'Yönetici paylaşımı güncelleyene kadar kayıtlı paylar geçerlidir.'}
        </p>
      )}
      {isOwner && (
        <div className="mt-3 flex flex-wrap gap-2">
          {sameRange && !matches && (
            <Button variant="primary" size="sm" icon={<Scale className="size-4" />} loading={busy} disabled={result.totalKurus <= 0} onClick={() => void settle()}>
              Paylaşımı güncelle
            </Button>
          )}
          {confirmUndo ? (
            <>
              <Button variant="danger" size="sm" loading={busy} onClick={() => void undo()}>
                Evet, geri al
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmUndo(false)}>
                Vazgeç
              </Button>
            </>
          ) : (
            <Button size="sm" icon={<Undo2 className="size-4" />} onClick={() => setConfirmUndo(true)}>
              Paylaşımı geri al
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
