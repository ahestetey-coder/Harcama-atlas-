import { CalendarClock, CreditCard, Landmark, Plus, Repeat } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/AppShell'
import { PlanBadge, PlanGate } from '../components/PlanGate'
import { ConfirmDialog } from '../components/ui/Modal'
import { Badge, Button, Card, EmptyState, Segmented } from '../components/ui/primitives'
import { toUserMessage } from '../data/repository'
import { CONSUMER_DEBT, DEBT_TYPE_LABEL, DEBT_TYPES, debtMonthlyPayment, debtTypeOf, holdingSummary, type Asset, type DebtType } from '../domain/assets'
import { estimatedMinPayment } from '../domain/coach'
import { currentPeriod, formatDate, MONTH_SHORT, todayIso } from '../domain/dates'
import { DTI_LIMIT } from '../domain/journey'
import { formatKurus } from '../domain/money'
import { futureLoad, installmentPlans, progressOf } from '../domain/recurring'
import { cn } from '../lib/cn'
import { useStartNew } from '../lib/useStartNew'
import { usePersonalCycle } from '../state/cycle'
import { useAssets, useRecurring, useRepo, useSettings } from '../state/data'
import { usePersonalTransactions } from '../state/personal'
import { useUi } from '../state/ui'
import { ActionDialog, AssetEditor, HoldingRow, type Acting, type Editing } from './AssetsPage'
import { PaymentsContent, RecurringEditor, type Draft } from './PaymentsSection'

type Section = 'borclar' | 'odemeler'

export default function DebtsPage() {
  const [params, setParams] = useSearchParams()
  const section: Section = params.get('bolum') === 'odemeler' ? 'odemeler' : 'borclar'
  const assets = useAssets()
  const [editing, setEditing] = useState<Editing>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  useStartNew(() => (section === 'odemeler' ? setDraft({ kind: 'subscription' }) : setEditing({ kind: 'debt', debtType: 'card' })))
  const go = (s: Section) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        if (s === 'odemeler') next.set('bolum', 'odemeler')
        else next.delete('bolum')
        return next
      },
      { replace: true },
    )
  const editDebt = (id: string) => {
    const asset = assets?.find((a) => a.id === id)
    if (asset) setEditing({ kind: 'debt', asset })
  }
  return (
    <div>
      <PageHeader
        title="Borçlar ve ödemeler"
        subtitle={
          <span className="inline-flex items-center gap-2">
            <PlanBadge plan="plus" /> Borçlar, taksitler ve düzenli ödemeler tek yerde
          </span>
        }
        actions={
          section === 'odemeler' ? (
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setDraft({ kind: 'subscription' })}>
              Ödeme ekle
            </Button>
          ) : (
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing({ kind: 'debt', debtType: 'card' })}>
              Borç ekle
            </Button>
          )
        }
      />
      <Segmented
        label="Bölüm"
        className="mb-4 w-full sm:w-auto"
        value={section}
        onChange={go}
        options={[
          { value: 'borclar', label: 'Borçlarım', icon: <Landmark className="size-4" /> },
          { value: 'odemeler', label: 'Düzenli ödemeler', icon: <Repeat className="size-4" /> },
        ]}
      />
      {section === 'borclar' ? (
        <PlanGate
          feature="assets"
          title="Borçlarım"
          points={['Borçlarınızı türüne göre (kart, kredi, KMH, kişisel…) kaydedin', 'Aylık taksitli borçlar düzenli ödemelere eklenir, kalan borç kendiliğinden azalır', 'Aylık borç ödemenizi ve borç/gelir oranınızı izleyin']}
        >
          <DebtsContent onEdit={setEditing} />
        </PlanGate>
      ) : (
        <PlanGate
          feature="subscriptions"
          title="Düzenli ödemeler ve taksitler"
          points={['Abonelik, kira ve faturaları kaydedin; ödeme gününden önce hatırlatılın', 'Ekstredeki ve borçlarınızdaki taksitleri ve gelecek ayların yükünü görün', 'Ödeme günü gelen taksitler aylık özete gider olarak yansır']}
        >
          <PaymentsContent onEdit={setDraft} onEditDebt={editDebt} />
        </PlanGate>
      )}
      <AssetEditor editing={editing} onClose={() => setEditing(null)} />
      <RecurringEditor draft={draft} onClose={() => setDraft(null)} />
    </div>
  )
}

const PERIODS_AHEAD = 12

function DebtsContent({ onEdit }: { onEdit: (e: Editing) => void }) {
  const assets = useAssets()
  const recurring = useRecurring()
  const personal = usePersonalTransactions()
  const startDay = usePersonalCycle()
  const settings = useSettings()
  const repo = useRepo()
  const { toast } = useUi()
  const [acting, setActing] = useState<Acting>(null)
  const [del, setDel] = useState<Asset | null>(null)
  const today = todayIso()

  const manualKeys = useMemo(() => new Set((recurring ?? []).filter((i) => i.kind === 'installment' && i.matchKey).map((i) => i.matchKey!)), [recurring])
  const plans = useMemo(() => installmentPlans(personal?.counted ?? [], manualKeys), [personal, manualKeys])
  const manual = useMemo(() => (recurring ?? []).filter((r) => r.kind === 'installment' && r.active && (progressOf(r, today).remaining ?? 0) > 0), [recurring, today])
  const load = useMemo(() => futureLoad(manual, plans, currentPeriod(startDay), PERIODS_AHEAD, startDay), [manual, plans, startDay])
  if (!assets || !recurring || !personal) return null

  const debts = assets.filter((a) => a.kind === 'debt' && !a.archived)
  const rows = debts.map((a) => ({ asset: a, s: holdingSummary(a, today), type: debtTypeOf(a) }))
  const open = rows.filter((r) => r.s.valueKurus > 0)
  const statementKurus = plans.reduce((s, p) => s + p.remainingKurus, 0)
  const manualKurus = manual.reduce((s, r) => s + (progressOf(r, today).remaining ?? 0) * r.amountKurus, 0)
  const installmentsKurus = statementKurus + manualKurus
  const total = open.reduce((s, r) => s + r.s.valueKurus, 0) + installmentsKurus
  const consumer = open.filter((r) => CONSUMER_DEBT.includes(r.type)).reduce((s, r) => s + r.s.valueKurus, 0)
  const monthly =
    open.reduce((s, r) => s + debtMonthlyPayment(r.asset, r.s.valueKurus, today, estimatedMinPayment), 0) + (load[0]?.totalKurus ?? 0)
  const income = settings?.journey ? settings.journey.monthlyIncomeKurus + (settings.journey.passiveIncomeKurus ?? 0) : null
  const dti = income ? monthly / income : null
  const types = DEBT_TYPES.filter((t) => rows.some((r) => r.type === t))
  const maxLoad = Math.max(1, ...load.map((l) => l.totalKurus))

  if (debts.length === 0 && installmentsKurus === 0)
    return (
      <Card className="p-5">
        <EmptyState icon={<Landmark className="size-6" />} title="Kayıtlı borç yok" className="py-6">
          Borcunuz varsa türünü seçerek ekleyin. Kredi kartı ekstresi içe aktardığınızda taksitli alışverişler burada kendiliğinden listelenir.
        </EmptyState>
        <AddChips onEdit={onEdit} />
      </Card>
    )

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="p-5 lg:col-span-2" aria-label="Borç özeti">
        <h2 className="mb-3 font-display text-base font-semibold">Özet</h2>
        <div className="flex flex-wrap gap-x-10 gap-y-4">
          <div>
            <div className="text-[12.5px] text-muted">Toplam borç</div>
            <div className="num font-display text-2xl font-semibold text-danger">{formatKurus(total)}</div>
            <div className="mt-0.5 text-[12px] text-subtle">Kalan taksitler dahil</div>
          </div>
          <Figure label="Aylık borç ödemesi" value={formatKurus(monthly)} sub="Asgari ödemeler ve bu dönemin taksitleri" />
          <Figure label="Yüksek faizli borç" value={formatKurus(consumer)} sub="Kart, KMH, ihtiyaç, kişisel" />
          <Figure
            label="Borç ödemesi / gelir"
            value={dti === null ? '—' : `%${Math.round(dti * 100)}`}
            sub={dti === null ? 'Gelir, yolculuk testinde girilir' : dti <= DTI_LIMIT ? `%${DTI_LIMIT * 100} sınırının altında` : `%${DTI_LIMIT * 100} sınırının üstünde`}
            tone={dti !== null && dti > DTI_LIMIT ? 'down' : undefined}
          />
        </div>
      </Card>

      {types.map((t) => (
        <Card key={t} className="p-5 lg:col-span-2" aria-label={DEBT_TYPE_LABEL[t]}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold">
              {t === 'card' ? <CreditCard className="size-5 text-accent" /> : <Landmark className="size-5 text-accent" />} {DEBT_TYPE_LABEL[t]}
              {CONSUMER_DEBT.includes(t) && <Badge tone="warning">Yüksek faiz</Badge>}
            </h2>
            <span className="num text-[13px] font-semibold text-ink">{formatKurus(rows.filter((r) => r.type === t).reduce((s, r) => s + r.s.valueKurus, 0))}</span>
          </div>
          <ul className="mt-2 divide-y divide-line" aria-label={`${DEBT_TYPE_LABEL[t]} borçları`}>
            {rows
              .filter((r) => r.type === t)
              .map((r) => (
                <HoldingRow key={r.asset.id} asset={r.asset} s={r.s} onAct={(mode) => setActing({ asset: r.asset, mode })} onEdit={() => onEdit({ kind: 'debt', asset: r.asset })} onDelete={() => setDel(r.asset)} />
              ))}
          </ul>
        </Card>
      ))}

      <Card className="p-5 lg:col-span-2" aria-label="Kart taksitleri">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <CalendarClock className="size-5 text-accent" /> Kart ve elle eklenen taksitler
        </h2>
        {installmentsKurus === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Kalan taksit yok. Kredi kartı ekstresi içe aktardığınızda "3/12 taksit" gibi satırlar burada kendiliğinden görünür; elle eklemek için{' '}
            <Link to="/borclar?bolum=odemeler" className="font-medium text-accent">
              Düzenli ödemeler
            </Link>
            .
          </p>
        ) : (
          <>
            <p className="mt-0.5 text-[12.5px] text-muted">Toplam kalan {formatKurus(installmentsKurus)}. Ekstreden bulunan taksitler son görülen taksitten birer ay sonrasına yerleştirilir.</p>
            <ul className="mt-3 grid grid-cols-6 items-end gap-1.5 sm:grid-cols-12" aria-label="Dönemlere göre taksit yükü">
              {load.map((l) => {
                const [, m] = l.month.split('-').map(Number)
                return (
                  <li key={l.month} className="flex flex-col items-center gap-1" title={`${l.month}: ${formatKurus(l.totalKurus)}`}>
                    <span className="num text-[10.5px] text-muted">{l.totalKurus ? Math.round(l.totalKurus / 100).toLocaleString('tr-TR') : '–'}</span>
                    <div className="flex h-20 w-full items-end rounded-md bg-surface-2">
                      <div className="w-full rounded-md bg-[var(--asset-2)]" style={{ height: `${Math.round((l.totalKurus / maxLoad) * 100)}%` }} />
                    </div>
                    <span className="text-[11px] text-muted">{MONTH_SHORT[m - 1]}</span>
                  </li>
                )
              })}
            </ul>
            <ul className="mt-3 divide-y divide-line" aria-label="Taksitli alışverişler">
              {plans.map((p) => (
                <li key={p.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-ink">{p.name}</div>
                    <div className="text-[12px] text-muted">
                      Kredi kartı ekstresinden · {p.current}/{p.total} taksit · son taksit {formatDate(p.nextDates.at(-1) ?? p.lastDate)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="num font-semibold">{formatKurus(p.remainingKurus)}</div>
                    <div className="num text-[12px] text-muted">
                      {p.remaining} × {formatKurus(p.monthlyKurus)}
                    </div>
                  </div>
                </li>
              ))}
              {manual.map((r) => {
                const left = progressOf(r, today).remaining ?? 0
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-ink">{r.name}</div>
                      <div className="text-[12px] text-muted">Elle eklenen taksit</div>
                    </div>
                    <div className="text-right">
                      <div className="num font-semibold">{formatKurus(left * r.amountKurus)}</div>
                      <div className="num text-[12px] text-muted">
                        {left} × {formatKurus(r.amountKurus)}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </Card>

      <Card className="p-5 lg:col-span-2">
        <h2 className="font-display text-base font-semibold">Türe göre borç ekle</h2>
        <AddChips onEdit={onEdit} />
      </Card>

      <ActionDialog acting={acting} onClose={() => setActing(null)} />
      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title="Borç silinsin mi?"
        confirmLabel="Sil"
        danger
        onConfirm={async () => {
          if (!del) return
          try {
            await repo.deleteAsset(del.id)
            toast(`${del.name} silindi.`)
          } catch (e) {
            toast(toUserMessage(e), { kind: 'error' })
          }
          setDel(null)
        }}
      >
        {del?.name} ve bütün hareketleri kalıcı olarak silinir.
      </ConfirmDialog>
    </div>
  )
}

function AddChips({ onEdit }: { onEdit: (e: Editing) => void }) {
  return (
    <div className="mt-2 flex flex-wrap justify-center gap-2 lg:justify-start">
      {DEBT_TYPES.map((t: DebtType) => (
        <Button key={t} size="sm" variant="soft" icon={<Plus className="size-3.5" />} onClick={() => onEdit({ kind: 'debt', debtType: t })}>
          {DEBT_TYPE_LABEL[t]}
        </Button>
      ))}
    </div>
  )
}

function Figure({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'down' }) {
  return (
    <div>
      <div className="text-[12.5px] text-muted">{label}</div>
      <div className={cn('num font-display text-lg font-semibold', tone === 'down' && 'text-danger')}>{value}</div>
      {sub && <div className="mt-0.5 text-[12px] text-subtle">{sub}</div>}
    </div>
  )
}
