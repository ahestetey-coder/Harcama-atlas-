import { Archive, ArchiveRestore, Minus, Pencil, PiggyBank, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PageHeader } from '../components/AppShell'
import { CATEGORY_COLORS, CategoryIcon } from '../components/common'
import { PlanBadge, PlanGate } from '../components/PlanGate'
import { ConfirmDialog, Modal } from '../components/ui/Modal'
import { Badge, Button, Card, EmptyState, Field, IconButton, Input } from '../components/ui/primitives'
import { toUserMessage } from '../data/repository'
import { formatDate, monthLabel, todayIso } from '../domain/dates'
import { goalProgress, type GoalProgress, type SavingsGoal } from '../domain/goals'
import { formatKurus, formatKurusPlain, parseUserAmount } from '../domain/money'
import { cn } from '../lib/cn'
import { useGoals, useRepo } from '../state/data'
import { useUi } from '../state/ui'

/** Hazır hedefler: ad, simge ve renk önerir; tutar ve tarihi kullanıcı girer. */
const PRESETS = [
  { name: 'Tatil', icon: 'plane', color: '#0ea5e9' },
  { name: 'Araç', icon: 'car', color: '#6366f1' },
  { name: 'Acil durum fonu', icon: 'heart-pulse', color: '#ef4444' },
  { name: 'Ev', icon: 'home', color: '#f59e0b' },
  { name: 'Eğitim', icon: 'graduation-cap', color: '#8b5cf6' },
  { name: 'Diğer', icon: 'piggy-bank', color: '#10b981' },
] as const

const ICONS = ['piggy-bank', 'plane', 'car', 'home', 'heart-pulse', 'graduation-cap', 'gift', 'smartphone', 'baby', 'briefcase', 'sparkles']

const STATUS: Record<GoalProgress['status'], { label: string; tone: 'accent' | 'warning' | 'danger' | 'neutral' | 'info' }> = {
  done: { label: 'Tamamlandı', tone: 'accent' },
  'on-track': { label: 'Yolunda', tone: 'accent' },
  behind: { label: 'Geride', tone: 'warning' },
  overdue: { label: 'Tarihi geçti', tone: 'danger' },
  'no-date': { label: 'Tarihsiz', tone: 'neutral' },
}

type Draft = Partial<SavingsGoal>
type Moving = { goal: SavingsGoal; dir: 1 | -1 } | null

export default function GoalsPage() {
  const [editing, setEditing] = useState<Draft | null>(null)
  return (
    <div>
      <PageHeader
        title="Birikim hedefleri"
        subtitle={
          <span className="inline-flex items-center gap-2">
            <PlanBadge plan="plus" /> Ne kadar, ne zamana kadar
          </span>
        }
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing({})}>
            Hedef ekle
          </Button>
        }
      />
      <PlanGate
        feature="goals"
        title="Birikim hedefleri"
        points={['Tatil, araç, acil durum fonu gibi hedefler oluşturun', 'Hedef tutarı ve tarihi belirleyin, ilerlemeyi görün', 'Hedefe yetişmek için ayda ne kadar ayırmanız gerektiğini öğrenin']}
      >
        <GoalsContent onEdit={setEditing} />
        <GoalEditor draft={editing} onClose={() => setEditing(null)} />
      </PlanGate>
    </div>
  )
}

function GoalsContent({ onEdit }: { onEdit: (d: Draft) => void }) {
  const goals = useGoals()
  const repo = useRepo()
  const { toast } = useUi()
  const [moving, setMoving] = useState<Moving>(null)
  const [del, setDel] = useState<SavingsGoal | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const today = todayIso()
  const rows = useMemo(
    () => (goals ?? []).map((g) => ({ goal: g, p: goalProgress(g, today) })).sort((a, b) => a.goal.createdAt.localeCompare(b.goal.createdAt)),
    [goals, today],
  )
  if (!goals) return null
  const active = rows.filter((r) => !r.goal.archived)
  const archived = rows.filter((r) => r.goal.archived)
  const saved = active.reduce((s, r) => s + r.p.savedKurus, 0)
  const needed = active.reduce((s, r) => s + (r.p.status === 'done' ? 0 : (r.p.monthlyNeededKurus ?? 0)), 0)

  const archive = async (g: SavingsGoal, archived: boolean) => {
    try {
      await repo.saveGoal({ ...g, archived })
      toast(archived ? `${g.name} arşivlendi.` : `${g.name} geri alındı.`)
    } catch (e) {
      toast(toUserMessage(e), { kind: 'error' })
    }
  }

  if (rows.length === 0)
    return (
      <Card className="p-5">
        <EmptyState icon={<PiggyBank className="size-6" />} title="Henüz birikim hedefi yok" className="py-6">
          Bir hedef seçin; tutarı ve tarihi siz belirleyin.
        </EmptyState>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {PRESETS.map((p) => (
            <Button key={p.name} size="sm" variant="soft" onClick={() => onEdit({ name: p.name === 'Diğer' ? '' : p.name, icon: p.icon, color: p.color })}>
              {p.name}
            </Button>
          ))}
        </div>
      </Card>
    )

  return (
    <div className="flex flex-col gap-4">
      {active.length > 0 && (
        <Card className="flex flex-wrap gap-x-8 gap-y-2 p-5" aria-label="Hedeflerin özeti">
          <div>
            <div className="text-[12.5px] text-muted">Toplam biriken</div>
            <div className="num font-display text-xl font-semibold">{formatKurus(saved)}</div>
          </div>
          {needed > 0 && (
            <div>
              <div className="text-[12.5px] text-muted">Hedeflere yetişmek için aylık</div>
              <div className="num font-display text-xl font-semibold">{formatKurus(needed)}</div>
            </div>
          )}
        </Card>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {active.map(({ goal, p }) => (
          <GoalCard key={goal.id} goal={goal} p={p} onEdit={() => onEdit(goal)} onMove={(dir) => setMoving({ goal, dir })} onArchive={() => void archive(goal, true)} onDelete={() => setDel(goal)} />
        ))}
      </div>
      {archived.length > 0 && (
        <div>
          <Button size="sm" variant="ghost" icon={<Archive className="size-4" />} onClick={() => setShowArchived((v) => !v)}>
            Arşivdeki hedefler ({archived.length})
          </Button>
          {showArchived && (
            <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-surface">
              {archived.map(({ goal, p }) => (
                <li key={goal.id} className="flex items-center gap-3 px-4 py-3">
                  <CategoryIcon category={goal} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{goal.name}</span>
                  <span className="num text-[12.5px] text-muted">{formatKurus(p.savedKurus)}</span>
                  <IconButton label={`${goal.name} arşivden çıkar`} size="sm" onClick={() => void archive(goal, false)}>
                    <ArchiveRestore className="size-4" />
                  </IconButton>
                  <IconButton label={`${goal.name} sil`} size="sm" onClick={() => setDel(goal)}>
                    <Trash2 className="size-4" />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <p className="text-[12.5px] text-subtle">Hedefler yalnızca bu cihazda tutulur. Para ekleme kaydı bir hatırlatmadır; bankanızda para taşımaz.</p>

      <MoveDialog moving={moving} onClose={() => setMoving(null)} />
      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title="Hedef silinsin mi?"
        confirmLabel="Sil"
        danger
        onConfirm={async () => {
          if (!del) return
          await repo.deleteGoal(del.id)
          toast(`${del.name} silindi.`)
          setDel(null)
        }}
      >
        <p>{del?.name} ve kayıtlı bütün para hareketleri silinir.</p>
      </ConfirmDialog>
    </div>
  )
}

function GoalCard({ goal, p, onEdit, onMove, onArchive, onDelete }: { goal: SavingsGoal; p: GoalProgress; onEdit: () => void; onMove: (dir: 1 | -1) => void; onArchive: () => void; onDelete: () => void }) {
  const st = STATUS[p.status]
  const pct = Math.min(100, Math.round(p.ratio * 100))
  return (
    <Card as="article" className="p-5" aria-label={goal.name}>
      <div className="flex items-start gap-3">
        <CategoryIcon category={goal} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate font-display text-base font-semibold">{goal.name}</h2>
            <Badge tone={st.tone}>{st.label}</Badge>
          </div>
          <div className="text-[12.5px] text-muted">{goal.targetDate ? `${formatDate(goal.targetDate)} hedefi` : 'Tarih belirlenmedi'}</div>
        </div>
        <IconButton label={`${goal.name} düzenle`} size="sm" onClick={onEdit}>
          <Pencil className="size-4" />
        </IconButton>
      </div>
      <div className="mt-4 flex items-baseline justify-between gap-2">
        <span className="num font-display text-xl font-semibold">{formatKurus(p.savedKurus)}</span>
        <span className="num text-[13px] text-muted">/ {formatKurus(goal.targetKurus)}</span>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-label={`${goal.name} ilerlemesi`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className="h-full rounded-full transition-[width]" style={{ width: `${pct}%`, background: goal.color }} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px]">
        <dt className="text-muted">Kalan</dt>
        <dd className="num text-right font-medium text-ink">{formatKurus(p.remainingKurus)}</dd>
        {p.monthlyNeededKurus !== null && p.status !== 'done' && (
          <>
            <dt className="text-muted">{p.status === 'overdue' ? 'Eksik kalan' : `Aylık gereken (${p.monthsLeft} ay)`}</dt>
            <dd className="num text-right font-medium text-ink">{formatKurus(p.monthlyNeededKurus)}</dd>
          </>
        )}
        <dt className="text-muted">Son 3 ay ortalaması</dt>
        <dd className="num text-right font-medium text-ink">{formatKurus(p.monthlyAverageKurus)}</dd>
        {p.projectedMonth && p.status !== 'done' && (
          <>
            <dt className="text-muted">Bu tempoyla</dt>
            <dd className="text-right font-medium text-ink">{monthLabel(p.projectedMonth)}</dd>
          </>
        )}
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="soft" icon={<Plus className="size-4" />} onClick={() => onMove(1)}>
          Para ekle
        </Button>
        <Button size="sm" variant="ghost" icon={<Minus className="size-4" />} onClick={() => onMove(-1)} disabled={p.savedKurus === 0}>
          Çek
        </Button>
        <span className="flex-1" />
        <IconButton label={`${goal.name} arşivle`} size="sm" onClick={onArchive}>
          <Archive className="size-4" />
        </IconButton>
        <IconButton label={`${goal.name} sil`} size="sm" onClick={onDelete}>
          <Trash2 className="size-4" />
        </IconButton>
      </div>
      {goal.contributions.length > 0 && <History goal={goal} />}
    </Card>
  )
}

function History({ goal }: { goal: SavingsGoal }) {
  const repo = useRepo()
  const [open, setOpen] = useState(false)
  const list = goal.contributions.slice().sort((a, b) => b.date.localeCompare(a.date))
  return (
    <div className="mt-3 border-t border-line pt-2">
      <button type="button" className="text-[12.5px] font-medium text-accent" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? 'Hareketleri gizle' : `Hareketler (${list.length})`}
      </button>
      {open && (
        <ul className="mt-1 divide-y divide-line">
          {list.map((c) => (
            <li key={c.id} className="flex items-center gap-2 py-1.5 text-[13px]">
              <span className="num w-20 text-muted">{formatDate(c.date)}</span>
              <span className={cn('num flex-1 text-right font-medium', c.amountKurus < 0 ? 'text-danger' : 'text-ink')}>
                {c.amountKurus > 0 ? '+' : '−'}
                {formatKurus(Math.abs(c.amountKurus))}
              </span>
              <IconButton label="Hareketi sil" size="sm" onClick={() => void repo.removeGoalContribution(goal.id, c.id)}>
                <Trash2 className="size-3.5" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function MoveDialog({ moving, onClose }: { moving: Moving; onClose: () => void }) {
  const repo = useRepo()
  const { toast } = useUi()
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayIso())
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [shown, setShown] = useState<Moving>(null)
  if (moving !== shown) {
    setShown(moving)
    if (moving) {
      setAmount('')
      setDate(todayIso())
      setError(undefined)
    }
  }
  const save = async () => {
    if (!moving) return
    const amt = parseUserAmount(amount)
    if (!amt.ok || amt.kurus <= 0) return setError('Geçerli bir tutar girin.')
    setBusy(true)
    try {
      await repo.addGoalContribution(moving.goal.id, { date, amountKurus: amt.kurus * moving.dir })
      toast(moving.dir > 0 ? `${moving.goal.name} hedefine ${formatKurus(amt.kurus)} eklendi.` : `${moving.goal.name} hedefinden ${formatKurus(amt.kurus)} çekildi.`)
      onClose()
    } catch (e) {
      setError(toUserMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open={!!moving}
      onOpenChange={(o) => !o && onClose()}
      title={moving?.dir === -1 ? 'Hedeften para çek' : 'Hedefe para ekle'}
      size="sm"
      footer={
        <Button variant="primary" loading={busy} onClick={() => void save()}>
          Kaydet
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Tutar (TL)" htmlFor="goal-move-amount" error={error}>
          <Input id="goal-move-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" autoFocus />
        </Field>
        <Field label="Tarih" htmlFor="goal-move-date">
          <Input id="goal-move-date" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

function GoalEditor({ draft, onClose }: { draft: Draft | null; onClose: () => void }) {
  const repo = useRepo()
  const { toast } = useUi()
  const [f, setF] = useState({ name: '', target: '', date: '', icon: 'piggy-bank', color: '#10b981' })
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [shown, setShown] = useState<Draft | null>(null)
  if (draft !== shown) {
    setShown(draft)
    if (draft) {
      setF({
        name: draft.name ?? '',
        target: draft.targetKurus ? formatKurusPlain(draft.targetKurus) : '',
        date: draft.targetDate ?? '',
        icon: draft.icon ?? 'piggy-bank',
        color: draft.color ?? '#10b981',
      })
      setError(undefined)
    }
  }
  const isNew = !draft?.id
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }))
  const save = async () => {
    setError(undefined)
    const amt = parseUserAmount(f.target)
    if (!f.name.trim()) return setError('Hedefe bir ad verin.')
    if (!amt.ok || amt.kurus <= 0) return setError('Geçerli bir hedef tutarı girin.')
    setBusy(true)
    try {
      await repo.saveGoal({ id: draft?.id, name: f.name, icon: f.icon, color: f.color, targetKurus: amt.kurus, targetDate: f.date || null })
      toast(isNew ? 'Hedef eklendi.' : 'Kaydedildi.')
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
      title={isNew ? 'Birikim hedefi ekle' : 'Hedefi düzenle'}
      size="sm"
      footer={
        <Button variant="primary" loading={busy} onClick={() => void save()}>
          Kaydet
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        {isNew && (
          <div className="flex flex-wrap gap-1.5" aria-label="Hazır hedefler">
            {PRESETS.filter((p) => p.name !== 'Diğer').map((p) => (
              <Button key={p.name} size="sm" variant={f.name === p.name ? 'soft' : 'ghost'} onClick={() => setF((x) => ({ ...x, name: p.name, icon: p.icon, color: p.color }))}>
                {p.name}
              </Button>
            ))}
          </div>
        )}
        <Field label="Hedefin adı" htmlFor="goal-name">
          <Input id="goal-name" value={f.name} maxLength={60} onChange={(e) => set('name', e.target.value)} placeholder="Örn. Yaz tatili" />
        </Field>
        <Field label="Hedef tutar (TL)" htmlFor="goal-target" error={error}>
          <Input id="goal-target" inputMode="decimal" value={f.target} onChange={(e) => set('target', e.target.value)} placeholder="0,00" />
        </Field>
        <Field label="Hedef tarihi" htmlFor="goal-date" optional>
          <Input id="goal-date" type="date" value={f.date} min={todayIso()} onChange={(e) => set('date', e.target.value)} />
        </Field>
        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium text-ink">Simge ve renk</legend>
          <div className="flex flex-wrap gap-1.5">
            {ICONS.map((ic) => (
              <button
                key={ic}
                type="button"
                aria-label={`Simge ${ic}`}
                aria-pressed={f.icon === ic}
                onClick={() => set('icon', ic)}
                className={cn('rounded-xl p-0.5 ring-2 ring-transparent', f.icon === ic && 'ring-accent')}
              >
                <CategoryIcon category={{ icon: ic, color: f.color }} size="sm" />
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {CATEGORY_COLORS.slice(0, 14).map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Renk ${c}`}
                aria-pressed={f.color === c}
                onClick={() => set('color', c)}
                className={cn('size-6 rounded-full ring-2 ring-offset-2 ring-offset-surface', f.color === c ? 'ring-ink' : 'ring-transparent')}
                style={{ background: c }}
              />
            ))}
          </div>
        </fieldset>
      </div>
    </Modal>
  )
}
