import { BellRing, CalendarClock, CreditCard, Lightbulb, Pencil, Plus, Repeat, Trash2, X } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { PageHeader } from '../components/AppShell'
import { CategoryIcon, GroupBadge } from '../components/common'
import { PlanBadge, PlanGate } from '../components/PlanGate'
import { ConfirmDialog, Modal } from '../components/ui/Modal'
import { Badge, Button, Card, EmptyState, Field, IconButton, Input, Select, Switch } from '../components/ui/primitives'
import { toUserMessage } from '../data/repository'
import { addDays, currentPeriod, formatDate, MONTH_SHORT, todayIso } from '../domain/dates'
import { formatKurus, formatKurusPlain, parseUserAmount } from '../domain/money'
import { detectRecurring, futureLoad, groupDueToRecord, installmentPlans, progressOf, upcomingPayments, type RecurringSuggestion } from '../domain/recurring'
import { CADENCE_LABEL, RECURRING_KIND_LABEL, type RecurringCadence, type RecurringKind, type RecurringPayment } from '../domain/types'
import { cn } from '../lib/cn'
import { usePersonalCycle } from '../state/cycle'
import { useCategories, useCategoryMap, useGroupMap, useGroups, useRecurring, useRepo } from '../state/data'
import { usePersonalTransactions } from '../state/personal'
import { useUi } from '../state/ui'

/** Gelecek yük grafiği renkleri (açık ve koyu yüzeyde doğrulandı). */
const COLOR_RECURRING = '#059669'
const COLOR_INSTALLMENT = '#6366f1'

type Draft = Partial<RecurringPayment> & { kind: RecurringKind }

export default function PaymentsPage() {
  const [editing, setEditing] = useState<Draft | null>(null)
  return (
    <div>
      <PageHeader
        title="Düzenli ödemeler"
        subtitle={
          <span className="inline-flex items-center gap-2">
            <PlanBadge plan="plus" /> Abonelikler, faturalar ve taksitler
          </span>
        }
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing({ kind: 'subscription' })}>
            Ekle
          </Button>
        }
      />
      <PlanGate
        feature="subscriptions"
        title="Düzenli ödemeler ve taksitler"
        points={[
          'Abonelik, kira ve faturaları kaydedin; ödeme gününden önce hatırlatılın',
          'Ekstredeki taksitlerden kalan taksitleri ve gelecek ayların yükünü görün',
          'Her ay tekrarlanan harcamalar sizin onayınızla düzenli ödeme olarak eklenir',
          'Kalan düzenli ödemeler ay sonu tahminine katılır',
        ]}
      >
        <PaymentsContent onEdit={setEditing} />
        <RecurringEditor draft={editing} onClose={() => setEditing(null)} />
      </PlanGate>
    </div>
  )
}

function PaymentsContent({ onEdit }: { onEdit: (d: Draft) => void }) {
  const items = useRecurring()
  const personal = usePersonalTransactions()
  const catMap = useCategoryMap()
  const startDay = usePersonalCycle()
  const repo = useRepo()
  const { toast } = useUi()
  const dismissed = useLiveQuery(() => repo.dismissedRecurring(), [repo])
  const [del, setDel] = useState<RecurringPayment | null>(null)
  const groupMap = useGroupMap()
  const today = todayIso()
  const toRecord = useMemo(() => groupDueToRecord(items ?? [], today), [items, today])

  const txs = useMemo(() => personal?.counted ?? [], [personal])
  const manualKeys = useMemo(() => new Set((items ?? []).filter((i) => i.kind === 'installment' && i.matchKey).map((i) => i.matchKey!)), [items])
  const plans = useMemo(() => installmentPlans(txs, manualKeys), [txs, manualKeys])
  const upcoming = useMemo(() => upcomingPayments(items ?? [], plans, today, 30), [items, plans, today])
  const load = useMemo(() => futureLoad(items ?? [], plans, currentPeriod(startDay), 6, startDay), [items, plans, startDay])
  const suggestions = useMemo(
    () => (items && dismissed ? detectRecurring(txs, new Set(items.map((i) => i.matchKey ?? '')), new Set(dismissed), today) : []),
    [txs, items, dismissed, today],
  )

  if (!items || !personal) return null

  const accept = async (s: RecurringSuggestion) => {
    try {
      await repo.saveRecurring({ name: s.name, kind: 'subscription', amountKurus: s.amountKurus, categoryId: s.categoryId, cadence: 'monthly', startDate: s.startDate, reminderDays: 3, matchKey: s.key, active: true })
      toast(`${s.name} düzenli ödemelere eklendi.`)
    } catch (e) {
      toast(toUserMessage(e), { kind: 'error' })
    }
  }

  const record = async (id: string, date: string, name: string) => {
    try {
      await repo.recordRecurring(id, date)
      toast(`${name} gider olarak eklendi.`)
    } catch (e) {
      toast(toUserMessage(e), { kind: 'error' })
    }
  }

  const monthlyTotal = items.filter((i) => i.active).reduce((s, i) => s + (i.cadence === 'monthly' ? i.amountKurus : i.cadence === 'weekly' ? Math.round((i.amountKurus * 52) / 12) : Math.round(i.amountKurus / 12)), 0)

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {toRecord.length > 0 && (
        <Card className="p-5 lg:col-span-2" aria-label="Eklenmeyi bekleyen grup giderleri">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <BellRing className="size-5 text-warning" /> Ödeme günü gelen grup giderleri
          </h2>
          <p className="mt-1 text-[13px] text-muted">Eklediğinizde grubun gideri olur; paylaşılan grupta üyeler de görür.</p>
          <ul className="mt-3 divide-y divide-line">
            {toRecord.map(({ item, date }) => (
              <li key={`${item.id}:${date}`} className="flex flex-wrap items-center gap-3 py-2.5">
                <CategoryIcon category={item.categoryId ? catMap.get(item.categoryId) : undefined} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-ink">{item.name}</span>
                    <GroupBadge group={item.groupId ? groupMap.get(item.groupId) : undefined} />
                  </div>
                  <div className="num text-[12px] text-muted">
                    {formatDate(date)} · {formatKurus(item.amountKurus)}
                  </div>
                </div>
                <Button size="sm" variant="soft" onClick={() => void record(item.id, date, item.name)}>
                  Gider olarak ekle
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {suggestions.length > 0 && (
        <Card className="p-5 lg:col-span-2" aria-label="Önerilen düzenli ödemeler">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <Lightbulb className="size-5 text-warning" /> Her ay tekrarlanan harcamalar
          </h2>
          <p className="mt-1 text-[13px] text-muted">Bunları düzenli ödeme olarak eklerseniz ödeme gününden önce hatırlatılır ve ay sonu tahminine katılır.</p>
          <ul className="mt-3 divide-y divide-line">
            {suggestions.slice(0, 6).map((s) => (
              <li key={s.key} className="flex flex-wrap items-center gap-3 py-2.5">
                <CategoryIcon category={s.categoryId ? catMap.get(s.categoryId) : undefined} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink">{s.name}</div>
                  <div className="text-[12px] text-muted">
                    Son {s.months} ayda her ay · {formatKurus(s.amountKurus)} · sıradaki {formatDate(s.startDate)}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="soft" onClick={() => void accept(s)}>
                    Ekle
                  </Button>
                  <IconButton label={`${s.name} önerisini gizle`} size="sm" onClick={() => void repo.dismissRecurring(s.key)}>
                    <X className="size-4" />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-5">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <CalendarClock className="size-5 text-accent" /> Önümüzdeki 30 gün
        </h2>
        {upcoming.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Yaklaşan ödeme yok.</p>
        ) : (
          <ul className="mt-3 space-y-2" aria-label="Yaklaşan ödemeler">
            {upcoming.slice(0, 10).map((u) => (
              <li key={`${u.id}:${u.date}`} className="flex items-center gap-3 text-sm">
                <span className="num w-[72px] shrink-0 text-[12.5px] text-muted">{u.date === today ? 'Bugün' : u.date === addDays(today, 1) ? 'Yarın' : formatDate(u.date).slice(0, 5)}</span>
                <span className="min-w-0 flex-1 truncate text-ink">{u.name}</span>
                {u.remind && (
                  <Badge tone="warning" className="shrink-0">
                    <BellRing className="mr-1 inline size-3" />
                    Yaklaştı
                  </Badge>
                )}
                <span className="num shrink-0 font-medium">{formatKurus(u.amountKurus)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="font-display text-base font-semibold">Gelecek dönemlerin ödeme yükü</h2>
        <div className="mt-2 flex flex-wrap gap-4 text-[12px] text-muted" aria-hidden>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: COLOR_RECURRING }} /> Düzenli ödemeler
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: COLOR_INSTALLMENT }} /> Taksitler
          </span>
        </div>
        <LoadBars rows={load} />
      </Card>

      <Card className="p-5 lg:col-span-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <Repeat className="size-5 text-accent" /> Abonelikler ve düzenli ödemeler
          </h2>
          {monthlyTotal > 0 && <span className="num text-[12.5px] text-muted">aylık ≈ {formatKurus(monthlyTotal)}</span>}
        </div>
        {items.length === 0 ? (
          <EmptyState
            icon={<Repeat className="size-6" />}
            title="Henüz düzenli ödeme yok"
            className="py-6"
            action={
              <Button size="sm" icon={<Plus className="size-4" />} onClick={() => onEdit({ kind: 'subscription' })}>
                Düzenli ödeme ekle
              </Button>
            }
          >
            Kira, fatura, abonelik veya elle takip etmek istediğiniz bir taksit ekleyin.
          </EmptyState>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {items
              .slice()
              .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'tr'))
              .map((it) => {
                const prog = progressOf(it, today)
                const next = upcomingPayments([{ ...it, active: true }], [], today, 400)[0]
                return (
                  <li key={it.id} className={cn('flex items-center gap-3 py-3', !it.active && 'opacity-60')}>
                    <CategoryIcon category={it.categoryId ? catMap.get(it.categoryId) : undefined} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-ink">{it.name}</span>
                        <Badge tone={it.kind === 'installment' ? 'info' : 'neutral'}>{RECURRING_KIND_LABEL[it.kind]}</Badge>
                        {it.groupId && <GroupBadge group={groupMap.get(it.groupId)} />}
                      </div>
                      <div className="text-[12px] text-muted">
                        {CADENCE_LABEL[it.cadence]} · {it.active ? (next ? `sıradaki ${formatDate(next.date)}` : 'bitti') : 'durduruldu'}
                        {prog.remaining !== null && ` · ${prog.paid}/${it.occurrences} ödendi`}
                      </div>
                    </div>
                    <span className="num shrink-0 font-semibold">{formatKurus(it.amountKurus)}</span>
                    <IconButton label={`${it.name} düzenle`} size="sm" onClick={() => onEdit(it)}>
                      <Pencil className="size-4" />
                    </IconButton>
                    <IconButton label={`${it.name} sil`} size="sm" onClick={() => setDel(it)}>
                      <Trash2 className="size-4" />
                    </IconButton>
                  </li>
                )
              })}
          </ul>
        )}
      </Card>

      <Card className="p-5 lg:col-span-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <CreditCard className="size-5 text-accent" /> Taksitler
          </h2>
          <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => onEdit({ kind: 'installment', cadence: 'monthly', occurrences: 6 })}>
            Taksit ekle
          </Button>
        </div>
        <p className="mt-1 text-[12.5px] text-subtle">Ekstrelerinizdeki “3/12 taksit” bilgilerinden otomatik bulunur. Ekstrede görünmeyenleri elle ekleyebilirsiniz.</p>
        {plans.length === 0 ? (
          <p className="mt-3 text-sm text-muted">İçe aktarılan ekstrelerde devam eden taksit bulunamadı.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line" aria-label="Devam eden taksitler">
            {plans.map((p) => (
              <li key={p.key} className="flex items-center gap-3 py-3">
                <CategoryIcon category={p.categoryId ? catMap.get(p.categoryId) : undefined} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-ink">{p.name}</div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label={`${p.name} taksit ilerlemesi`} aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={p.current}>
                      <div className="h-full rounded-full" style={{ width: `${(p.current / p.total) * 100}%`, background: COLOR_INSTALLMENT }} />
                    </div>
                    <span className="num shrink-0 text-[12px] text-muted">
                      {p.current}/{p.total}
                    </span>
                  </div>
                  <div className="mt-1 text-[12px] text-muted">
                    {p.remaining} taksit kaldı · son taksit ≈ {formatDate(p.nextDates[p.nextDates.length - 1])}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="num font-semibold">{formatKurus(p.monthlyKurus)}</div>
                  <div className="num text-[12px] text-muted">kalan {formatKurus(p.remainingKurus)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title="Düzenli ödeme silinsin mi?"
        confirmLabel="Sil"
        danger
        onConfirm={async () => {
          if (!del) return
          await repo.deleteRecurring(del.id)
          toast(`${del.name} silindi.`)
          setDel(null)
        }}
      >
        <p>{del?.name} listeden kaldırılır. Geçmiş işlemleriniz etkilenmez.</p>
      </ConfirmDialog>
    </div>
  )
}

function LoadBars({ rows }: { rows: ReturnType<typeof futureLoad> }) {
  const max = Math.max(1, ...rows.map((r) => r.totalKurus))
  if (rows.every((r) => r.totalKurus === 0)) return <p className="mt-3 text-sm text-muted">Önümüzdeki dönemlerde kayıtlı ödeme yok.</p>
  return (
    <table className="mt-3 w-full text-[13px]">
      <caption className="sr-only">Önümüzdeki altı dönemin düzenli ödeme ve taksit toplamları</caption>
      <thead className="sr-only">
        <tr>
          <th>Dönem</th>
          <th>Dağılım</th>
          <th>Toplam</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const [, m] = r.month.split('-').map(Number)
          return (
            <tr key={r.month} className="group">
              <th scope="row" className="w-10 py-1.5 pr-2 text-left font-medium text-muted">
                {MONTH_SHORT[m - 1]}
              </th>
              <td className="py-1.5">
                <div className="flex h-3 w-full gap-0.5" style={{ width: `${Math.max(2, (r.totalKurus / max) * 100)}%` }}>
                  {r.recurringKurus > 0 && (
                    <div
                      className="h-full rounded-[4px] transition-opacity group-hover:opacity-90"
                      style={{ flexGrow: r.recurringKurus, background: COLOR_RECURRING }}
                      title={`Düzenli ödemeler: ${formatKurus(r.recurringKurus)}`}
                    />
                  )}
                  {r.installmentKurus > 0 && (
                    <div
                      className="h-full rounded-[4px] transition-opacity group-hover:opacity-90"
                      style={{ flexGrow: r.installmentKurus, background: COLOR_INSTALLMENT }}
                      title={`Taksitler: ${formatKurus(r.installmentKurus)}`}
                    />
                  )}
                </div>
                <span className="sr-only">
                  Düzenli ödemeler {formatKurus(r.recurringKurus)}, taksitler {formatKurus(r.installmentKurus)}
                </span>
              </td>
              <td className="num w-28 py-1.5 pl-2 text-right font-medium text-ink">{formatKurus(r.totalKurus)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function RecurringEditor({ draft, onClose }: { draft: Draft | null; onClose: () => void }) {
  const repo = useRepo()
  const categories = useCategories()
  const groups = useGroups()
  const { toast } = useUi()
  const [f, setF] = useState({ groupId: '', name: '', amount: '', kind: 'subscription' as RecurringKind, cadence: 'monthly' as RecurringCadence, startDate: todayIso(), count: '', categoryId: '', reminderDays: '3', active: true })
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  // Her açılışta formu doldur
  const [shown, setShown] = useState<Draft | null>(null)
  if (draft !== shown) {
    setShown(draft)
    if (draft) {
      setF({
        groupId: draft.groupId ?? '',
        name: draft.name ?? '',
        amount: draft.amountKurus ? formatKurusPlain(draft.amountKurus) : '',
        kind: draft.kind,
        cadence: draft.cadence ?? 'monthly',
        startDate: draft.startDate ?? todayIso(),
        count: draft.occurrences ? String(draft.occurrences) : draft.kind === 'installment' ? '6' : '',
        categoryId: draft.categoryId ?? '',
        reminderDays: String(draft.reminderDays ?? 3),
        active: draft.active ?? true,
      })
      setError(undefined)
    }
  }
  const isNew = !draft?.id
  const installment = f.kind === 'installment'
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }))

  const save = async () => {
    setError(undefined)
    const amt = parseUserAmount(f.amount)
    if (!f.name.trim()) return setError('Bir ad girin.')
    if (!amt.ok || amt.kurus <= 0) return setError('Geçerli bir tutar girin.')
    const count = installment ? Number(f.count) : null
    if (installment && (!Number.isInteger(count) || count! < 1 || count! > 120)) return setError('Taksit sayısı 1 ile 120 arasında olmalı.')
    setBusy(true)
    try {
      await repo.saveRecurring({
        id: draft?.id,
        name: f.name,
        kind: f.kind,
        amountKurus: amt.kurus,
        categoryId: f.categoryId || null,
        cadence: installment ? 'monthly' : f.cadence,
        startDate: f.startDate,
        occurrences: count,
        reminderDays: Number(f.reminderDays),
        matchKey: draft?.matchKey,
        groupId: f.groupId || null,
        recordedThrough: draft?.recordedThrough,
        active: f.active,
      })
      toast(isNew ? 'Eklendi.' : 'Kaydedildi.')
      onClose()
    } catch (e) {
      setError(toUserMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={!!draft}
      onOpenChange={(o) => !o && onClose()}
      title={isNew ? (installment ? 'Taksit ekle' : 'Düzenli ödeme ekle') : 'Düzenli ödemeyi düzenle'}
      size="sm"
      footer={
        <Button variant="primary" loading={busy} onClick={() => void save()}>
          Kaydet
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Tür" htmlFor="rec-kind">
          <Select id="rec-kind" value={f.kind} onChange={(e) => set('kind', e.target.value as RecurringKind)}>
            {(Object.keys(RECURRING_KIND_LABEL) as RecurringKind[]).map((k) => (
              <option key={k} value={k}>
                {RECURRING_KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Ad" htmlFor="rec-name">
          <Input id="rec-name" value={f.name} placeholder={installment ? 'Örn. Telefon' : 'Örn. Kira, internet, dijital yayın'} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label={installment ? 'Aylık taksit tutarı (TL)' : 'Tutar (TL)'} htmlFor="rec-amount">
          <Input id="rec-amount" inputMode="decimal" className="num" value={f.amount} placeholder="Örn. 229,99" onChange={(e) => set('amount', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          {installment ? (
            <Field label="Taksit sayısı" htmlFor="rec-count">
              <Input id="rec-count" inputMode="numeric" value={f.count} onChange={(e) => set('count', e.target.value.replace(/\D/g, ''))} />
            </Field>
          ) : (
            <Field label="Sıklık" htmlFor="rec-cadence">
              <Select id="rec-cadence" value={f.cadence} onChange={(e) => set('cadence', e.target.value as RecurringCadence)}>
                {(Object.keys(CADENCE_LABEL) as RecurringCadence[]).map((c) => (
                  <option key={c} value={c}>
                    {CADENCE_LABEL[c]}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label={installment ? 'İlk taksit tarihi' : 'İlk ödeme tarihi'} htmlFor="rec-start">
            <Input id="rec-start" type="date" value={f.startDate} onChange={(e) => set('startDate', e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kategori" htmlFor="rec-cat">
            <Select id="rec-cat" value={f.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              <option value="">Kategorisiz</option>
              {(categories ?? [])
                .filter((c) => !c.archived)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Hatırlatma" htmlFor="rec-remind">
            <Select id="rec-remind" value={f.reminderDays} onChange={(e) => set('reminderDays', e.target.value)}>
              <option value="0">Ödeme günü</option>
              <option value="1">1 gün önce</option>
              <option value="3">3 gün önce</option>
              <option value="7">1 hafta önce</option>
            </Select>
          </Field>
        </div>
        <Field label="Grup" htmlFor="rec-group" hint={f.groupId ? 'Ödeme günü gelince tek dokunuşla bu grubun gideri olarak eklenir.' : 'Bir gruba bağlarsanız ödeme günü gelince grubun gideri olarak ekleyebilirsiniz.'}>
          <Select id="rec-group" value={f.groupId} onChange={(e) => set('groupId', e.target.value)}>
            <option value="">Grup yok (yalnızca hatırlatma)</option>
            {(groups ?? [])
              .filter((g) => !g.archived)
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
          </Select>
        </Field>
        {!isNew && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-ink">Etkin</span>
            <Switch label="Etkin" checked={f.active} onChange={(v) => set('active', v)} />
          </div>
        )}
        {error && (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
