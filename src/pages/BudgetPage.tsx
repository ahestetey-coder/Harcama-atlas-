import { AlertTriangle, CalendarRange, Pencil, Plus, Repeat, Target, Trash2, TrendingUp } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { PageHeader } from '../components/AppShell'
import { CategoryIcon, MonthSwitcher } from '../components/common'
import { PlanBadge, PlanGate } from '../components/PlanGate'
import { Modal } from '../components/ui/Modal'
import { Button, Card, EmptyState, Field, IconButton, Input, Segmented, Select, Switch } from '../components/ui/primitives'
import { toUserMessage } from '../data/repository'
import { budgetStatus, DEFAULT_BUDGET_PLAN, type BudgetPlan, type LimitStatus } from '../domain/budget'
import { formatDate, periodLabel, todayIso } from '../domain/dates'
import { formatKurus, formatKurusPlain, parseUserAmount } from '../domain/money'
import { cn } from '../lib/cn'
import { usePersonalCycle } from '../state/cycle'
import { useCategories, useCategoryMap, useRepo, useSettings } from '../state/data'
import { usePersonalTransactions } from '../state/personal'
import { useUi } from '../state/ui'

type Editing = { kind: 'total' } | { kind: 'week' } | { kind: 'category'; categoryId: string | null } | null

export default function BudgetPage() {
  return (
    <div>
      <BudgetHeader />
      <PlanGate
        feature="advancedBudget"
        title="Gelişmiş bütçe"
        points={[
          'Her kategori için ayrı limit belirleyin',
          'Haftalık bütçe oluşturun',
          'Kullanılmayan bütçeyi sonraki döneme taşıyın',
          'Limite yaklaşınca uyarı alın',
          'Harcama temponuza göre ay sonu tahminini görün',
        ]}
      >
        <BudgetContent />
      </PlanGate>
    </div>
  )
}

function BudgetHeader() {
  const { month, setMonth } = useUi()
  return (
    <PageHeader
      title="Bütçe planı"
      subtitle={
        <span className="inline-flex items-center gap-2">
          <PlanBadge plan="plus" /> Kişisel harcamalarınıza göre (Tümü)
        </span>
      }
      actions={<MonthSwitcher month={month} onChange={setMonth} />}
    />
  )
}

function BudgetContent() {
  const personal = usePersonalTransactions()
  const startDay = usePersonalCycle()
  const settings = useSettings()
  const categories = useCategories()
  const catMap = useCategoryMap()
  const repo = useRepo()
  const { month, toast } = useUi()
  const [editing, setEditing] = useState<Editing>(null)
  const today = todayIso()
  const plan: BudgetPlan = settings?.budgetPlan ?? DEFAULT_BUDGET_PLAN
  const monthly = settings?.monthlyBudgetKurus ?? null

  const s = useMemo(() => budgetStatus(personal?.counted ?? [], month, startDay, today, monthly, plan), [personal, month, startDay, today, monthly, plan])

  const savePlan = async (patch: Partial<BudgetPlan>, msg?: string) => {
    try {
      await repo.saveSettings({ budgetPlan: { ...plan, ...patch } })
      if (msg) toast(msg)
    } catch (e) {
      toast(toUserMessage(e), { kind: 'error' })
    }
  }

  if (!personal || !settings || !categories) return null

  const label = periodLabel(month, startDay)
  const activeCats = categories.filter((c) => !c.archived)

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {s.warnings.length > 0 && (
        <Card className="border-warning/40 p-5 lg:col-span-2" aria-label="Bütçe uyarıları">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <AlertTriangle className="size-5 text-warning" /> Uyarılar
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {s.warnings.map((w) => {
              const name = w.kind === 'total' ? 'Toplam bütçe' : w.kind === 'week' ? 'Bu haftanın bütçesi' : (catMap.get(w.categoryId!)?.name ?? 'Kategori')
              const over = w.status.state === 'over'
              return (
                <li key={`${w.kind}:${w.categoryId ?? ''}`} className="flex items-start gap-2">
                  <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', over ? 'bg-danger' : 'bg-warning')} />
                  <span>
                    <strong className="text-ink">{name}</strong>{' '}
                    {over
                      ? `${formatKurus(w.status.spentKurus - w.status.effectiveKurus)} aşıldı.`
                      : `%${Math.round(w.status.ratio * 100)} kullanıldı; ${formatKurus(w.status.effectiveKurus - w.status.spentKurus)} kaldı.`}
                  </span>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      <Card className="p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Target className="size-4 text-accent" /> Toplam bütçe · {label}
          </h2>
          <Button size="sm" variant="ghost" onClick={() => setEditing({ kind: 'total' })}>
            {monthly ? 'Düzenle' : 'Belirle'}
          </Button>
        </div>
        {s.total ? <LimitBar status={s.total} label="Toplam bütçe kullanımı" /> : <p className="mt-2 text-sm text-muted">Dönemlik toplam bütçe belirlemediniz.</p>}
      </Card>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <TrendingUp className="size-4 text-accent" /> Ay sonu tahmini
        </h2>
        {s.forecast ? (
          <>
            <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="num whitespace-nowrap font-display text-2xl font-bold text-ink">{formatKurus(s.forecast.projectedKurus)}</span>
              {s.forecast.vsBudgetKurus !== null && (
                <span className={cn('text-[13px] font-medium', s.forecast.vsBudgetKurus > 0 ? 'text-danger' : 'text-accent')}>
                  {s.forecast.vsBudgetKurus > 0 ? `bütçeyi ${formatKurus(s.forecast.vsBudgetKurus)} aşabilir` : `bütçenin ${formatKurus(-s.forecast.vsBudgetKurus)} altında`}
                </span>
              )}
            </div>
            <p className="mt-2 text-[12.5px] text-subtle">
              Dönemin {s.forecast.totalDays} gününün {s.forecast.elapsedDays}. günündesiniz; şimdiye kadar {formatKurus(s.forecast.spentKurus)} harcadınız. Tahmin bugüne kadarki günlük
              ortalamanıza dayanır, kesin değildir.
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">Tahmin yalnızca içinde bulunulan dönem için gösterilir.</p>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <CalendarRange className="size-4 text-accent" /> Haftalık bütçe
          </h2>
          <Button size="sm" variant="ghost" onClick={() => setEditing({ kind: 'week' })}>
            {plan.weeklyKurus ? 'Düzenle' : 'Belirle'}
          </Button>
        </div>
        {!plan.weeklyKurus ? (
          <p className="mt-2 text-sm text-muted">Pazartesi–Pazar haftası için bir harcama sınırı belirleyin.</p>
        ) : s.week ? (
          <>
            <p className="mt-1 text-[12.5px] text-subtle">
              {formatDate(s.week.start)} – {formatDate(s.week.end)}
            </p>
            <LimitBar status={s.week} label="Haftalık bütçe kullanımı" />
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">Haftalık bütçe {formatKurus(plan.weeklyKurus)}. İçinde bulunulan dönemi seçince bu haftanın durumu görünür.</p>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Repeat className="size-4 text-accent" /> Ayarlar
        </h2>
        <div className="mt-3 flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-ink">Kullanılmayan bütçeyi devret</div>
            <p className="text-[12.5px] text-muted">Önceki dönemde harcanmayan tutar bu döneme eklenir (yalnızca bir dönem; birikmez).</p>
          </div>
          <Switch label="Kullanılmayan bütçeyi devret" checked={plan.carryover} onChange={(v) => void savePlan({ carryover: v }, v ? 'Devir açıldı.' : 'Devir kapatıldı.')} />
        </div>
        <div className="mt-4">
          <div className="text-sm font-medium text-ink">Uyarı eşiği</div>
          <Segmented<string>
            label="Uyarı eşiği"
            value={String(plan.warnPct)}
            onChange={(v) => void savePlan({ warnPct: Number(v) })}
            className="mt-2 w-full max-w-xs"
            options={[
              { value: '70', label: '%70' },
              { value: '80', label: '%80' },
              { value: '90', label: '%90' },
            ]}
          />
        </div>
      </Card>

      <Card className="p-5 lg:col-span-2">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-display text-base font-semibold">Kategori limitleri</h2>
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing({ kind: 'category', categoryId: null })}>
            Limit ekle
          </Button>
        </div>
        {s.categories.length === 0 ? (
          <EmptyState icon={<Target className="size-6" />} title="Henüz kategori limiti yok" className="py-6">
            Market, restoran gibi kategoriler için dönemlik üst sınır belirleyin; yaklaşınca uyarılırsınız.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {s.categories.map((c) => {
              const cat = catMap.get(c.categoryId)
              return (
                <li key={c.categoryId} className="flex items-center gap-3 py-3">
                  <CategoryIcon category={cat} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-medium text-ink">{cat?.name ?? 'Silinmiş kategori'}</span>
                      <span className="num shrink-0 text-[12.5px] text-muted">
                        {formatKurus(c.spentKurus)} / {formatKurus(c.effectiveKurus)}
                      </span>
                    </div>
                    <Bar status={c} label={`${cat?.name ?? 'Kategori'} limit kullanımı`} />
                    {c.carryKurus > 0 && <p className="mt-1 text-[11.5px] text-subtle">{formatKurus(c.carryKurus)} önceki dönemden devretti.</p>}
                  </div>
                  <IconButton label={`${cat?.name ?? 'Kategori'} limitini düzenle`} size="sm" onClick={() => setEditing({ kind: 'category', categoryId: c.categoryId })}>
                    <Pencil className="size-4" />
                  </IconButton>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <AmountEditor
        editing={editing}
        onClose={() => setEditing(null)}
        monthly={monthly}
        plan={plan}
        categories={activeCats}
        onSave={async (e, kurus, catId) => {
          try {
            if (e.kind === 'total') await repo.saveSettings({ monthlyBudgetKurus: kurus })
            else if (e.kind === 'week') await repo.saveSettings({ budgetPlan: { ...plan, weeklyKurus: kurus } })
            else if (catId) {
              const limits = { ...plan.categoryLimits }
              if (kurus) limits[catId] = kurus
              else delete limits[catId]
              await repo.saveSettings({ budgetPlan: { ...plan, categoryLimits: limits } })
            }
            toast(kurus ? 'Kaydedildi.' : 'Kaldırıldı.')
            setEditing(null)
          } catch (err) {
            toast(toUserMessage(err), { kind: 'error' })
          }
        }}
      />
    </div>
  )
}

function Bar({ status, label }: { status: LimitStatus; label: string }) {
  const pct = Math.min(100, Math.max(0, status.ratio * 100))
  return (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={label}>
      <motion.div
        className={cn('h-full rounded-full', status.state === 'over' ? 'bg-danger' : status.state === 'near' ? 'bg-amber-500' : 'bg-gradient-to-r from-emerald-500 to-teal-500')}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
      />
    </div>
  )
}

function LimitBar({ status, label }: { status: LimitStatus; label: string }) {
  const over = status.state === 'over'
  return (
    <div className="mt-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className={cn('num font-display text-xl font-bold', over ? 'text-danger' : 'text-ink')}>
          {over ? `${formatKurus(status.spentKurus - status.effectiveKurus)} aşıldı` : `${formatKurus(status.effectiveKurus - status.spentKurus)} kaldı`}
        </span>
        <span className="num text-[12.5px] text-muted">/ {formatKurus(status.effectiveKurus)}</span>
      </div>
      <Bar status={status} label={label} />
      {status.carryKurus > 0 && <p className="mt-1.5 text-[12px] text-subtle">{formatKurus(status.carryKurus)} önceki dönemden devretti.</p>}
    </div>
  )
}

function AmountEditor({
  editing,
  onClose,
  monthly,
  plan,
  categories,
  onSave,
}: {
  editing: Editing
  onClose: () => void
  monthly: number | null
  plan: BudgetPlan
  categories: Array<{ id: string; name: string }>
  onSave: (e: NonNullable<Editing>, kurus: number | null, categoryId?: string) => Promise<void>
}) {
  const [value, setValue] = useState('')
  const [cat, setCat] = useState('')
  const [error, setError] = useState<string>()
  const current =
    editing?.kind === 'total' ? monthly : editing?.kind === 'week' ? plan.weeklyKurus : editing?.kind === 'category' && editing.categoryId ? (plan.categoryLimits[editing.categoryId] ?? null) : null
  const title = editing?.kind === 'total' ? 'Toplam bütçe' : editing?.kind === 'week' ? 'Haftalık bütçe' : editing?.categoryId ? 'Kategori limitini düzenle' : 'Kategori limiti ekle'
  const pickCategory = editing?.kind === 'category' && !editing.categoryId
  // Her açılışta alanları mevcut değerle doldur (render sırasında, React'in önerdiği biçimde)
  const [shown, setShown] = useState<Editing>(null)
  if (editing !== shown) {
    setShown(editing)
    setValue(current ? formatKurusPlain(current) : '')
    setCat('')
    setError(undefined)
  }

  const submit = async (clear = false) => {
    if (!editing) return
    setError(undefined)
    const categoryId = editing.kind === 'category' ? (editing.categoryId ?? cat) : undefined
    if (editing.kind === 'category' && !categoryId) return setError('Bir kategori seçin.')
    let kurus: number | null = null
    if (!clear) {
      const p = parseUserAmount(value)
      if (!p.ok || p.kurus <= 0) return setError('Geçerli bir tutar girin, örn. 5.000')
      kurus = p.kurus
    }
    await onSave(editing, kurus, categoryId)
  }

  return (
    <Modal
      open={!!editing}
      onOpenChange={(o) => {
        if (o) return
        onClose()
      }}
      title={title}
      description={editing?.kind === 'total' ? 'Her dönem için aynı bütçe uygulanır; net gidere göre hesaplanır.' : undefined}
      size="sm"
      footer={
        <>
          {current && (
            <Button variant="ghost" className="mr-auto text-danger" icon={<Trash2 className="size-4" />} onClick={() => void submit(true)}>
              Kaldır
            </Button>
          )}
          <Button variant="primary" onClick={() => void submit()}>
            Kaydet
          </Button>
        </>
      }
    >
      <EditorFields
        pickCategory={pickCategory}
        categories={categories.filter((c) => !(c.id in plan.categoryLimits))}
        value={value}
        setValue={setValue}
        cat={cat}
        setCat={setCat}
        error={error}
        onEnter={() => void submit()}
      />
    </Modal>
  )
}

function EditorFields({
  pickCategory,
  categories,
  value,
  setValue,
  cat,
  setCat,
  error,
  onEnter,
}: {
  pickCategory: boolean
  categories: Array<{ id: string; name: string }>
  value: string
  setValue: (v: string) => void
  cat: string
  setCat: (v: string) => void
  error?: string
  onEnter: () => void
}) {
  return (
    <div className="flex flex-col gap-3">
      {pickCategory && (
        <Field label="Kategori" htmlFor="limit-cat">
          <Select id="limit-cat" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">Seçin…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Tutar (TL)" htmlFor="limit-amount" error={error}>
        <Input id="limit-amount" inputMode="decimal" className="num" placeholder="Örn. 5.000" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onEnter()} />
      </Field>
    </div>
  )
}
