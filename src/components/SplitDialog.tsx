import { AlertTriangle, ArrowRight, Check, CheckCircle2, Circle, Copy, Scale, Share2, Undo2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { markSettlementPayment, settleGroupPeriod, unsettleGroupPeriod } from '../cloud/sync'
import { cloudErrorMessage } from '../cloud/errors'
import { UserFacingError } from '../data/repository'
import { formatDate } from '../domain/dates'
import { formatKurus, formatKurusPlain, parseUserAmount } from '../domain/money'
import { findSettlement, settlementRangeText } from '../domain/personal'
import { EQUAL_RULE, isEqualShares, SPLIT_METHOD_LABEL, splitBy, splitWithShares, type SplitMember, type SplitMethod, type SplitResult, type SplitRule } from '../domain/split'
import type { GroupSettlement, SpendGroup, Transaction } from '../domain/types'
import { cn } from '../lib/cn'
import { useCloud } from '../state/cloud'
import { useRepo } from '../state/data'
import { useUi } from '../state/ui'
import { PlanBadge } from './PlanGate'
import { Modal } from './ui/Modal'
import { Button, Input, Segmented } from './ui/primitives'
import { usePlan } from '../state/plan'
import { Link } from 'react-router-dom'

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
  const { has } = usePlan()
  const advanced = has('advancedSplit')
  const isOwner = !!selfId && group.cloudOwnerId === selfId
  const settlement = findSettlement(group, period)
  const sameRange = !!settlement && settlement.start === period.start && settlement.end === period.end
  // Yöneticinin kuralı bu cihazda saklanır; yoksa kayıtlı paylar eşit değilse tutar olarak açılır
  const initialRule: SplitRule = (advanced && group.splitRule) || (advanced && settlement && sameRange && !isEqualShares(settlement.shares) ? { method: 'amounts', participants: null, values: { ...settlement.shares } } : EQUAL_RULE)
  const [rule, setRuleState] = useState<SplitRule>(initialRule)
  const repo = useRepo()
  const setRule = (r: SplitRule) => {
    setRuleState(r)
    void repo.updateGroup(group.id, { splitRule: r }).catch(() => {})
  }
  const effectiveRule = advanced ? rule : EQUAL_RULE
  // Üye, yöneticinin kaydettiği payları görür; yönetici kendi kuralıyla hesaplar
  const useStored = !isOwner && !!settlement && sameRange
  const result = useMemo(
    () => (useStored ? splitWithShares(members, transactions, selfId, settlement!.shares) : splitBy(members, transactions, selfId, effectiveRule)),
    [useStored, members, transactions, selfId, settlement, effectiveRule],
  )
  const nameOf = (id: string) => result.people.find((p) => p.id === id)?.name ?? 'Grup üyesi'
  const [copied, setCopied] = useState(false)

  const summary = [
    `${groupName} · ${periodText}`,
    `Toplam gider: ${formatKurus(result.totalKurus)} · ${result.people.filter((p) => p.included).length} kişi`,
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
        <SettleStatus group={group} period={period} result={result} selfId={selfId} owner={isOwner} />

        <div className="hero-gradient grid grid-cols-3 gap-3 rounded-2xl p-4 text-white">
          <Figure label="Toplam gider" value={formatKurus(result.totalKurus)} />
          <Figure label="Katılan" value={String(result.people.filter((p) => p.included).length)} />
          {effectiveRule.method === 'equal' && !useStored ? <Figure label="Kişi başı" value={formatKurus(result.perPersonKurus)} /> : <Figure label="Yöntem" value={useStored ? 'Yönetici' : SPLIT_METHOD_LABEL[effectiveRule.method]} />}
        </div>

        {isOwner && (advanced ? <RuleEditor rule={rule} onChange={setRule} people={result.people} total={result.totalKurus} /> : <AdvancedTeaser />)}
        {result.error && (
          <p className="flex items-start gap-2 rounded-2xl border border-warning/40 bg-warning-soft px-3.5 py-2.5 text-[13px] text-ink" role="alert">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" /> {result.error} Düzeltene kadar eşit bölünmüş gösteriliyor.
          </p>
        )}

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
                    Ödedi {formatKurus(p.paidKurus)} · {p.included ? `payı ${formatKurus(p.shareKurus)}` : 'paylaşıma katılmıyor'}
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
                <TransferRow key={`${t.fromId}-${t.toId}`} t={t} nameOf={nameOf} group={group} settlement={settlement && sameRange ? settlement : undefined} selfId={selfId} owner={isOwner} advanced={advanced} />
              ))}
            </ul>
          )}
        </section>

        <p className="text-[12.5px] leading-relaxed text-subtle">
          {useStored ? 'Paylar grup yöneticisinin paylaştırmasına göredir.' : effectiveRule.method === 'equal' && !effectiveRule.participants ? `Gider, gruptaki ${result.people.length} kişiye eşit bölündü.` : `Gider ${SPLIT_METHOD_LABEL[effectiveRule.method].toLocaleLowerCase('tr')} yöntemiyle, seçili kişiler arasında bölündü.`} Kart ödemeleri sayılmaz, iadeler ödeyenin harcamasından düşer. Paylaştırma kayıtları silmez veya değiştirmez; herkesin “Tümü” görünümüne ödediğiyle payı arasındaki fark alacak veya borç olarak eklenir.
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
function SettleStatus({ group, period, result, selfId, owner }: { group: SpendGroup; period: { start: string; end: string }; result: SplitResult; selfId: string | null; owner: boolean }) {
  const repo = useRepo()
  const { backend } = useCloud()
  const { toast } = useUi()
  const [busy, setBusy] = useState(false)
  const [confirmUndo, setConfirmUndo] = useState(false)
  const settlement = findSettlement(group, period)
  // Yönetici paylaştırdıktan sonra dönem ayarı değiştiyse paylaşım bu dönemle tam örtüşmeyebilir
  const sameRange = !!settlement && settlement.start === period.start && settlement.end === period.end
  const isOwner = owner
  // Üye kayıtlı payları görür; yalnızca toplam değiştiyse güncel değildir
  const matches = settlement && sameRange ? (isOwner ? settlementMatches(settlement, result) : settlement.totalKurus === result.totalKurus) : false
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
          <Button variant="primary" size="sm" className="mt-3" icon={<Scale className="size-4" />} loading={busy} disabled={result.totalKurus <= 0 || !!result.error} onClick={() => void settle()}>
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
            <Button variant="primary" size="sm" icon={<Scale className="size-4" />} loading={busy} disabled={result.totalKurus <= 0 || !!result.error} onClick={() => void settle()}>
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

function AdvancedTeaser() {
  return (
    <p className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface-2 px-3.5 py-2.5 text-[13px] text-muted">
      <PlanBadge plan="plus" /> Yüzde, ağırlık veya tutarla bölmek, yalnızca seçili üyeleri katmak ve ödemeleri işaretlemek Plus pakette.
      <Link to="/paketler" className="font-medium text-accent">
        Paketleri incele
      </Link>
    </p>
  )
}

/** Plus: yöntem, katılımcılar ve kişi başı değerler. Değerler yazılırken kaydedilir. */
function RuleEditor({ rule, onChange, people, total }: { rule: SplitRule; onChange: (r: SplitRule) => void; people: SplitResult['people']; total: number }) {
  const ids = people.map((p) => p.id)
  const included = (id: string) => !rule.participants || rule.participants.includes(id)
  const toggle = (id: string) => {
    const cur = rule.participants ?? ids
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    onChange({ ...rule, participants: next.length === ids.length && ids.every((x) => next.includes(x)) ? null : next })
  }
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const shown = (id: string) => {
    if (drafts[id] !== undefined) return drafts[id]
    const v = rule.values[id]
    if (v == null) return ''
    return rule.method === 'amounts' ? formatKurusPlain(v) : String(v).replace('.', ',')
  }
  const setValue = (id: string, text: string) => {
    setDrafts((d) => ({ ...d, [id]: text }))
    const values = { ...rule.values }
    if (!text.trim()) delete values[id]
    else if (rule.method === 'amounts') {
      const p = parseUserAmount(text)
      if (!p.ok) return
      values[id] = p.kurus
    } else {
      const n = Number(text.replace(/\./g, '').replace(',', '.'))
      if (!Number.isFinite(n) || n < 0) return
      values[id] = n
    }
    onChange({ ...rule, values })
  }
  const switchMethod = (m: SplitMethod) => {
    setDrafts({})
    const inc = ids.filter(included)
    const values: Record<string, number> =
      m === 'percent' ? Object.fromEntries(inc.map((id, i) => [id, i === 0 ? 100 - Math.floor(100 / inc.length) * (inc.length - 1) : Math.floor(100 / inc.length)])) : m === 'weights' ? Object.fromEntries(inc.map((id) => [id, 1])) : {}
    onChange({ ...rule, method: m, values })
  }
  const unit = rule.method === 'percent' ? '%' : rule.method === 'amounts' ? '₺' : '×'
  return (
    <section aria-labelledby="split-rule" className="rounded-2xl border border-line p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="split-rule" className="flex items-center gap-2 text-[13px] font-semibold text-muted">
          Nasıl bölünsün? <PlanBadge plan="plus" />
        </h3>
        <Segmented label="Paylaşım yöntemi" value={rule.method} onChange={switchMethod} options={(Object.keys(SPLIT_METHOD_LABEL) as SplitMethod[]).map((m) => ({ value: m, label: SPLIT_METHOD_LABEL[m] }))} />
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {/* Sabit sıra: yazarken paylar değişse de satırlar yer değiştirmez */}
        {[...people].sort((a, b) => a.name.localeCompare(b.name, 'tr')).map((p) => (
          <li key={p.id} className="flex items-center gap-2.5">
            <label className="flex min-w-[5.5rem] flex-1 items-center gap-2 text-sm text-ink">
              <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={included(p.id)} onChange={() => toggle(p.id)} aria-label={`${p.name} paylaşıma katılsın`} />
              <span className="truncate">{p.name}</span>
            </label>
            {rule.method !== 'equal' && included(p.id) && (
              <span className="flex w-24 shrink-0 items-center gap-1">
                <Input
                  className="num h-8 min-w-0 flex-1 px-2 text-right"
                  inputMode="decimal"
                  aria-label={`${p.name} ${SPLIT_METHOD_LABEL[rule.method].toLocaleLowerCase('tr')}`}
                  placeholder={rule.method === 'amounts' ? 'kalan' : '0'}
                  value={shown(p.id)}
                  onChange={(e) => setValue(p.id, e.target.value)}
                />
                <span className="w-3 text-[12px] text-muted">{unit}</span>
              </span>
            )}
            <span className="num w-[5.5rem] shrink-0 text-right text-[12.5px] text-muted">{included(p.id) ? formatKurus(p.shareKurus) : '—'}</span>
          </li>
        ))}
      </ul>
      {rule.method === 'amounts' && <p className="mt-2 text-[12px] text-subtle">Tutar yazılmayan katılımcılar kalanı ({formatKurus(total)} toplamdan) eşit böler.</p>}
    </section>
  )
}

function TransferRow({
  t,
  nameOf,
  group,
  settlement,
  selfId,
  owner,
  advanced,
}: {
  t: SplitResult['transfers'][number]
  nameOf: (id: string) => string
  group: SpendGroup
  settlement?: GroupSettlement
  selfId: string | null
  owner: boolean
  advanced: boolean
}) {
  const repo = useRepo()
  const { backend } = useCloud()
  const { toast } = useUi()
  const [busy, setBusy] = useState(false)
  const paid = settlement?.payments?.find((p) => p.from === t.fromId && p.to === t.toId)
  const canMark = !!settlement && advanced && !!selfId && (owner || selfId === t.fromId || selfId === t.toId)
  const mark = async (value: boolean) => {
    if (!settlement) return
    setBusy(true)
    try {
      await markSettlementPayment(repo, backend, group.id, settlement.start, { from: t.fromId, to: t.toId, amountKurus: t.amountKurus }, value)
      toast(value ? 'Ödendi olarak işaretlendi.' : 'İşaret kaldırıldı.')
    } catch (e) {
      toast(e instanceof UserFacingError ? e.message : cloudErrorMessage(e), { kind: 'error' })
    } finally {
      setBusy(false)
    }
  }
  return (
    <li className={cn('rounded-2xl border border-line bg-surface-2 px-3.5 py-3 text-sm', paid && 'border-accent/30 bg-accent-soft')}>
      <div className="flex items-center gap-2">
        <span className="min-w-0 truncate font-medium text-ink">{nameOf(t.fromId)}</span>
        <ArrowRight className="size-4 shrink-0 text-subtle" aria-label="ödeyecek" />
        <span className="min-w-0 flex-1 truncate font-medium text-ink">{nameOf(t.toId)}</span>
        <span className="num shrink-0 font-display font-semibold text-ink">{formatKurus(t.amountKurus)}</span>
      </div>
      {settlement && (paid || canMark) && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px]">
          {paid ? (
            <span className="inline-flex items-center gap-1 font-medium text-accent-strong dark:text-accent">
              <CheckCircle2 className="size-4" /> Ödendi · {formatDate(paid.markedAt.slice(0, 10))} · {nameOf(paid.markedBy)}
              {paid.amountKurus !== t.amountKurus && <span className="text-warning"> (o zaman {formatKurus(paid.amountKurus)})</span>}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-muted">
              <Circle className="size-4" /> Ödenmedi
            </span>
          )}
          {canMark && (
            <Button size="sm" variant={paid ? 'ghost' : 'soft'} className="ml-auto" loading={busy} onClick={() => void mark(!paid)}>
              {paid ? 'İşareti kaldır' : 'Ödendi işaretle'}
            </Button>
          )}
        </div>
      )}
    </li>
  )
}
