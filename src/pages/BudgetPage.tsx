import { AlertTriangle, CalendarRange, Pencil, Plus, Repeat, Sparkles, Target, Trash2, TrendingUp } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { PageHeader } from '../components/AppShell'
import { CategoryIcon, MonthSwitcher } from '../components/common'
import { PlanBadge, PlanGate } from '../components/PlanGate'
import { Modal } from '../components/ui/Modal'
import { Alert, Button, Card, EmptyState, Field, IconButton, Input, Segmented, Select, Switch } from '../components/ui/primitives'
import { toUserMessage } from '../data/repository'
import type { BudgetMode } from '../domain/autoBudget'
import { DEFAULT_BUDGET_PLAN, type BudgetPlan, type BudgetStatus, type LimitStatus } from '../domain/budget'
import { currentPeriod as currentPeriodFor, formatDate, periodLabel } from '../domain/dates'
import { formatKurus, formatKurusPlain, parseUserAmount } from '../domain/money'
import { cn } from '../lib/cn'
import { usePersonalCycle } from '../state/cycle'
import { useCategories, useCategoryMap, useRepo, useSettings } from '../state/data'
import { usePersonalTransactions } from '../state/personal'
import { useUi } from '../state/ui'
import { useBudgetSetup, useBudgetStatus } from '../state/budget'
import { usePlan } from '../state/plan'

const EMPTY_STATUS: BudgetStatus = { total: null, categories: [], week: null, forecast: null, warnings: [] }

type Editing = { kind: 'total' } | { kind: 'week' } | { kind: 'category'; categoryId: string | null } | null

export default function BudgetPage() {
  return (
    <div>
      <BudgetHeader />
      <CoachBudgetCard />
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
  const setup = useBudgetSetup()
  const [editing, setEditing] = useState<Editing>(null)
  // Kayıtlı ayarlar (devir, uyarı eşiği bunlardan okunur); ekranda koçun değerleri dahil geçerli plan gösterilir
  const stored: BudgetPlan = settings?.budgetPlan ?? DEFAULT_BUDGET_PLAN
  const plan: BudgetPlan = setup?.plan ?? stored
  const monthly = setup?.monthlyKurus ?? null
  const byCoach = setup?.mode === 'auto' && !!setup.auto

  const s = useBudgetStatus(month) ?? EMPTY_STATUS

  const savePlan = async (patch: Partial<BudgetPlan>, msg?: string) => {
    try {
      await repo.saveSettings({ budgetPlan: { ...stored, ...patch } })
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
            {byCoach && <CoachTag />}
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
              {s.forecast.remainingFixedKurus > 0 && ` Dönem sonuna kadar kalan ${formatKurus(s.forecast.remainingFixedKurus)} düzenli ödeme ve taksit tahmine eklendi.`}
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
            {byCoach && plan.weeklyKurus ? <CoachTag /> : null}
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
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            Kategori limitleri {byCoach && s.categories.length > 0 && <CoachTag />}
          </h2>
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
        byCoach={byCoach}
        categories={activeCats}
        onSave={async (e, kurus, catId) => {
          try {
            // Koçun bütçesinde bir değer değiştirilirse bütçe elle moda geçer; koçun öteki değerleri başlangıç olarak kalır
            const base = byCoach ? { budgetMode: 'manual' as const, monthlyBudgetKurus: monthly, budgetPlan: { ...stored, categoryLimits: plan.categoryLimits, weeklyKurus: plan.weeklyKurus } } : { budgetPlan: plan }
            if (e.kind === 'total') await repo.saveSettings({ ...base, monthlyBudgetKurus: kurus })
            else if (e.kind === 'week') await repo.saveSettings({ ...base, budgetPlan: { ...base.budgetPlan, weeklyKurus: kurus } })
            else if (catId) {
              const limits = { ...plan.categoryLimits }
              if (kurus) limits[catId] = kurus
              else delete limits[catId]
              await repo.saveSettings({ ...base, budgetPlan: { ...base.budgetPlan, categoryLimits: limits } })
            }
            toast(byCoach ? 'Kaydedildi. Bütçeyi artık elle yönetiyorsunuz.' : kurus ? 'Kaydedildi.' : 'Kaldırıldı.')
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
  byCoach,
  categories,
  onSave,
}: {
  editing: Editing
  onClose: () => void
  monthly: number | null
  plan: BudgetPlan
  byCoach: boolean
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
      description={
        byCoach
          ? 'Bu değeri koç belirledi. Kaydederseniz bütçeyi elle yönetmeye geçersiniz; koçun öteki değerleri olduğu gibi kalır.'
          : editing?.kind === 'total'
            ? 'Her dönem için aynı bütçe uygulanır; net gidere göre hesaplanır.'
            : undefined
      }
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

function CoachTag() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">
      <Sparkles className="size-3" /> Koç
    </span>
  )
}

/** Bütçeyi kimin belirlediği (koç ya da kullanıcı) ve koçun hesabının dökümü; her pakette görünür. */
function CoachBudgetCard() {
  const setup = useBudgetSetup()
  const settings = useSettings()
  const repo = useRepo()
  const { has } = usePlan()
  const { toast, openTransactionForm } = useUi()
  const startDay = usePersonalCycle()
  if (!setup || !settings) return null
  const auto = setup.auto
  const advanced = has('advancedBudget')

  const setMode = async (m: BudgetMode) => {
    if (m === setup.mode) return
    try {
      if (m === 'manual' && auto)
        await repo.saveSettings({ budgetMode: 'manual', monthlyBudgetKurus: auto.totalKurus, ...(advanced ? { budgetPlan: setup.plan } : {}) })
      else await repo.saveSettings({ budgetMode: m })
      toast(m === 'auto' ? 'Bütçenizi artık koç belirliyor.' : auto ? 'Bütçeyi elle yönetiyorsunuz; koçun son değerleri başlangıç olarak kaldı.' : 'Bütçeyi elle yönetiyorsunuz.')
    } catch (e) {
      toast(toUserMessage(e), { kind: 'error' })
    }
  }

  return (
    <Card className="mb-4 p-5" aria-label="Koçun bütçesi">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <Sparkles className="size-5 text-accent" /> Koçun bütçesi
        </h2>
        <Segmented<BudgetMode>
          label="Bütçeyi kim belirlesin"
          value={setup.mode}
          onChange={(v) => void setMode(v)}
          className="w-full sm:w-auto"
          options={[
            { value: 'auto', label: 'Koç (otomatik)' },
            { value: 'manual', label: 'Elle' },
          ]}
        />
      </div>

      {!auto ? (
        <div className="mt-3 text-sm text-muted">
          <p>
            Koçun bütçe kurabilmesi için aylık gelirinizi bilmesi gerekiyor. Maaş gibi gelirlerinizi kaydedin; koç son üç dönemin ortalamasını kullanır
            {has('journey') && !settings.journey ? ' (ya da Yolculuk testindeki gelirinizi)' : ''}.
            {setup.mode === 'auto' && ' O zamana kadar elle girdiğiniz bütçe geçerli.'}
          </p>
          <Button size="sm" className="mt-3" icon={<Plus className="size-4" />} onClick={() => openTransactionForm(undefined, { type: 'income' })}>
            Gelir ekle
          </Button>
        </div>
      ) : setup.mode === 'manual' ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-muted">
            Koçun önerisi: <span className="num font-semibold text-ink">{formatKurus(auto.totalKurus)}</span> bütçe, <span className="num font-semibold text-ink">{formatKurus(auto.savingKurus)}</span> birikim.
            {!advanced && ' Elle girdiğiniz aylık bütçeyi Özet sayfasından değiştirebilirsiniz.'}
          </p>
          <Button size="sm" variant="primary" onClick={() => void setMode('auto')}>
            Koçun bütçesini kullan
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-2">
            <span className="num font-display text-2xl font-bold text-ink">{formatKurus(auto.totalKurus)}</span>
            <span className="text-[13px] text-muted">{periodLabel(currentPeriodFor(startDay), startDay)} için harcama bütçesi</span>
          </div>
          <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-2">
            <Row label={auto.incomeSource === 'records' ? 'Gelir (kaydettiğiniz gelirler)' : 'Gelir (Yolculuk testinden)'} value={formatKurus(auto.incomeKurus)} />
            {auto.goalsKurus > 0 && <Row label="Birikim hedefleri" value={`−${formatKurus(auto.goalsKurus)}`} />}
            {auto.extraSavingKurus > 0 && <Row label="Genel birikim payı" value={`−${formatKurus(auto.extraSavingKurus)}`} />}
            {auto.recurringKurus > 0 && <Row label="Bütçe içinde: düzenli ödemeler" value={formatKurus(auto.recurringKurus)} />}
            {auto.debtKurus > 0 && <Row label="Bütçe içinde: borç ve taksitler" value={formatKurus(auto.debtKurus)} />}
            <Row label="Serbest harcama" value={auto.weeklyKurus ? `${formatKurus(auto.flexibleKurus)} · haftada ${formatKurus(auto.weeklyKurus)}` : formatKurus(auto.flexibleKurus)} strong />
          </dl>
          {auto.shortfallKurus > 0 ? (
            <Alert tone="danger" className="mt-3">
              Düzenli ödemeler ve borç taksitleri gelirinizi {formatKurus(auto.shortfallKurus)} aşıyor; bu dönem birikim ayrılamadı.
            </Alert>
          ) : auto.savingCutKurus > 0 ? (
            <Alert tone="warning" className="mt-3">
              Ödemeler yüksek olduğu için birikimden {formatKurus(auto.savingCutKurus)} kısıldı.
            </Alert>
          ) : null}
          {auto.historyKurus !== null && auto.historyKurus < auto.flexibleKurus * 0.8 && (
            <p className="mt-2 text-[12.5px] text-muted">
              Son dönemlerde serbest harcamanız ayda ortalama {formatKurus(auto.historyKurus)} oldu; aradaki {formatKurus(auto.flexibleKurus - auto.historyKurus)} tutarı da birikime ayırabilirsiniz.
            </p>
          )}
          {auto.cutPct > 0 && (
            <p className="mt-2 text-[12.5px] text-muted">Kategori limitleri, bütçeye sığması için son dönemlerdeki ortalamanızın %{auto.cutPct} altında.</p>
          )}
          <p className="mt-2 text-[12px] text-subtle">
            Koç bütçeyi gelirinize, ödemelerinize{advanced ? ' ve birikim hedeflerinize' : ''} göre her dönem yeniden hesaplar; hesap cihazınızda yapılır. Bir değeri elle değiştirirseniz bütçe elle moda geçer.
          </p>
          {!has('goals') ? (
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
              <PlanBadge plan="plus" /> Plus'ta koç birikim hedeflerini, taksitleri ve borç ödemelerini de hesaba katar; kategori limitleri ve haftalık bütçe kurar.
            </p>
          ) : !has('journey') ? (
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
              <PlanBadge plan="plusplus" /> Plus+'ta koç Yolculuk testindeki gelirinizi ve gelirin %20'si birikim hedefini de kullanır.
            </p>
          ) : null}
        </>
      )}
    </Card>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/60 py-1">
      <dt className="text-muted">{label}</dt>
      <dd className={cn('num shrink-0', strong ? 'font-semibold text-ink' : 'text-ink')}>{value}</dd>
    </div>
  )
}
