import { AlertTriangle, CalendarRange, Pencil, Plus, Repeat, Sparkles, Target, Trash2, TrendingUp } from 'lucide-react'
import { motion } from 'motion/react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/AppShell'
import { BucketCard } from '../components/BucketCard'
import { CategoryIcon, MonthSwitcher } from '../components/common'
import { PlanBadge, PlanGate } from '../components/PlanGate'
import { Modal } from '../components/ui/Modal'
import { Alert, Button, Card, EmptyState, Field, IconButton, Input, More, Segmented, Select, Switch } from '../components/ui/primitives'
import { toUserMessage } from '../data/repository'
import type { BudgetMode } from '../domain/autoBudget'
import type { IncomeSource } from '../domain/income'
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
import { tt, ttf } from '../lib/i18n'

/** Koçun kullandığı gelirin kaynağı. */
const INCOME_ROW_LABEL: Record<IncomeSource, string> = {
  plan: tt('Gelir (maaş ve düzenli gelirler)'),
  records: tt('Gelir (kaydettiğiniz gelirler)'),
  journey: tt('Gelir (Yolculuk testinden)'),
}

const EMPTY_STATUS: BudgetStatus = { total: null, categories: [], week: null, forecast: null, warnings: [] }

type Editing = { kind: 'total' } | { kind: 'week' } | { kind: 'category'; categoryId: string | null } | null

export default function BudgetPage() {
  return (
    <div>
      <BudgetHeader />
      <BucketCard />
      <CoachBudgetCard />
      <PlanGate
        feature="advancedBudget"
        title={tt('Gelişmiş bütçe')}
        points={[
          tt('Her kategori için ayrı limit belirleyin'),
          tt('Haftalık bütçe oluşturun'),
          tt('Kullanılmayan bütçeyi sonraki döneme taşıyın'),
          tt('Limite yaklaşınca uyarı alın'),
          tt('Harcama temponuza göre ay sonu tahminini görün'),
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
      title={tt('Bütçe planı')}
      subtitle={tt('Kişisel harcamalar')}
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
        <Card className="border-warning/40 p-5 lg:col-span-2" aria-label={tt('Bütçe uyarıları')}>
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <AlertTriangle className="size-5 text-warning" /> {tt('Uyarılar')}
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {s.warnings.map((w) => {
              const name = w.kind === 'total' ? tt('Toplam bütçe') : w.kind === 'week' ? tt('Bu haftanın bütçesi') : (catMap.get(w.categoryId!)?.name ?? tt('Kategori'))
              const over = w.status.state === 'over'
              return (
                <li key={`${w.kind}:${w.categoryId ?? ''}`} className="flex items-start gap-2">
                  <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', over ? 'bg-danger' : 'bg-warning')} />
                  <span>
                    <strong className="text-ink">{name}</strong>{' '}
                    {over
                      ? ttf('{0} aşıldı.', formatKurus(w.status.spentKurus - w.status.effectiveKurus))
                      : ttf('%{0} kullanıldı; {1} kaldı.', Math.round(w.status.ratio * 100), formatKurus(w.status.effectiveKurus - w.status.spentKurus))}
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
            <Target className="size-4 text-accent" /> {tt('Toplam bütçe ·')} {label}
            {byCoach && <CoachTag />}
          </h2>
          <Button size="sm" variant="ghost" onClick={() => setEditing({ kind: 'total' })}>
            {monthly ? tt('Düzenle') : 'Belirle'}
          </Button>
        </div>
        {s.total ? <LimitBar status={s.total} label={tt('Toplam bütçe kullanımı')} /> : <p className="mt-2 text-sm text-muted">{tt('Dönemlik toplam bütçe belirlemediniz.')}</p>}
      </Card>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <TrendingUp className="size-4 text-accent" /> {tt('Ay sonu tahmini')}
        </h2>
        {s.forecast ? (
          <>
            <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="num whitespace-nowrap font-display text-2xl font-bold text-ink">{formatKurus(s.forecast.projectedKurus)}</span>
              {s.forecast.vsBudgetKurus !== null && (
                <span className={cn('text-[13px] font-medium', s.forecast.vsBudgetKurus > 0 ? 'text-danger' : 'text-accent')}>
                  {s.forecast.vsBudgetKurus > 0 ? ttf('bütçeyi {0} aşabilir', formatKurus(s.forecast.vsBudgetKurus)) : ttf('bütçenin {0} altında', formatKurus(-s.forecast.vsBudgetKurus))}
                </span>
              )}
            </div>
            <p className="mt-2 text-[12.5px] text-subtle">
              {ttf('Dönemin {0} gününün {1}. günündesiniz.', s.forecast.totalDays, s.forecast.elapsedDays)}</p>
            <More>
              {tt('Şimdiye kadar')} {formatKurus(s.forecast.spentKurus)} {tt('harcadınız. Tahmin günlük ortalamanıza dayanır, kesin değildir.')}
              {s.forecast.remainingFixedKurus > 0 && ttf(' Kalan {0} düzenli ödeme ve taksit de eklendi.', formatKurus(s.forecast.remainingFixedKurus))}
            </More>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">{tt('Tahmin yalnızca bu dönem için gösterilir.')}</p>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <CalendarRange className="size-4 text-accent" /> {tt('Haftalık bütçe')}
            {byCoach && plan.weeklyKurus ? <CoachTag /> : null}
          </h2>
          <Button size="sm" variant="ghost" onClick={() => setEditing({ kind: 'week' })}>
            {plan.weeklyKurus ? tt('Düzenle') : 'Belirle'}
          </Button>
        </div>
        {!plan.weeklyKurus ? (
          <p className="mt-2 text-sm text-muted">{tt('Haftalık harcama sınırı belirleyin.')}</p>
        ) : s.week ? (
          <>
            <p className="mt-1 text-[12.5px] text-subtle">
              {formatDate(s.week.start)} – {formatDate(s.week.end)}
            </p>
            <LimitBar status={s.week} label={tt('Haftalık bütçe kullanımı')} />
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">{ttf('Haftalık bütçe {0}.', formatKurus(plan.weeklyKurus))}</p>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Repeat className="size-4 text-accent" /> {tt('Ayarlar')}
        </h2>
        <div className="mt-3 flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-ink">{tt('Kullanılmayan bütçeyi devret')}</div>
            <p className="text-[12.5px] text-muted">{tt('Artan tutar sonraki döneme eklenir.')}</p>
          </div>
          <Switch label={tt('Kullanılmayan bütçeyi devret')} checked={plan.carryover} onChange={(v) => void savePlan({ carryover: v }, v ? tt('Devir açıldı.') : tt('Devir kapatıldı.'))} />
        </div>
        <div className="mt-4">
          <div className="text-sm font-medium text-ink">{tt('Uyarı eşiği')}</div>
          <Segmented<string>
            label={tt('Uyarı eşiği')}
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
            {tt('Kategori limitleri')} {byCoach && s.categories.length > 0 && <CoachTag />}
          </h2>
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing({ kind: 'category', categoryId: null })}>
            {tt('Limit ekle')}
          </Button>
        </div>
        {s.categories.length === 0 ? (
          <EmptyState icon={<Target className="size-6" />} title={tt('Henüz kategori limiti yok')} className="py-6">
            {tt('Market gibi kategorilere üst sınır koyun.')}
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
                      <span className="truncate font-medium text-ink">{cat?.name ?? tt('Silinmiş kategori')}</span>
                      <span className="num shrink-0 text-[12.5px] text-muted">
                        {formatKurus(c.spentKurus)} / {formatKurus(c.effectiveKurus)}
                      </span>
                    </div>
                    <Bar status={c} label={ttf('{0} limit kullanımı', cat?.name ?? 'Kategori')} />
                    {c.carryKurus > 0 && <p className="mt-1 text-[11.5px] text-subtle">{ttf('{0} önceki dönemden devretti.', formatKurus(c.carryKurus))}</p>}
                  </div>
                  <IconButton label={ttf('{0} limitini düzenle', cat?.name ?? 'Kategori')} size="sm" onClick={() => setEditing({ kind: 'category', categoryId: c.categoryId })}>
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
            toast(byCoach ? tt('Kaydedildi. Bütçeyi artık elle yönetiyorsunuz.') : kurus ? 'Kaydedildi.' : tt('Kaldırıldı.'))
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
          {over ? ttf('{0} aşıldı', formatKurus(status.spentKurus - status.effectiveKurus)) : ttf('{0} kaldı', formatKurus(status.effectiveKurus - status.spentKurus))}
        </span>
        <span className="num text-[12.5px] text-muted">/ {formatKurus(status.effectiveKurus)}</span>
      </div>
      <Bar status={status} label={label} />
      {status.carryKurus > 0 && <p className="mt-1.5 text-[12px] text-subtle">{ttf('{0} önceki dönemden devretti.', formatKurus(status.carryKurus))}</p>}
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
  const title = editing?.kind === 'total' ? tt('Toplam bütçe') : editing?.kind === 'week' ? tt('Haftalık bütçe') : editing?.categoryId ? tt('Kategori limitini düzenle') : tt('Kategori limiti ekle')
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
    if (editing.kind === 'category' && !categoryId) return setError(tt('Bir kategori seçin.'))
    let kurus: number | null = null
    if (!clear) {
      const p = parseUserAmount(value)
      if (!p.ok || p.kurus <= 0) return setError(tt('Geçerli bir tutar girin, örn. 5.000'))
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
          ? tt('Kaydederseniz bütçe elle moda geçer.')
          : editing?.kind === 'total'
            ? tt('Her dönem aynı bütçe uygulanır.')
            : undefined
      }
      size="sm"
      footer={
        <>
          {current && (
            <Button variant="ghost" className="mr-auto text-danger" icon={<Trash2 className="size-4" />} onClick={() => void submit(true)}>
              {tt('Kaldır')}
            </Button>
          )}
          <Button variant="primary" onClick={() => void submit()}>
            {tt('Kaydet')}
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
        <Field label={tt('Kategori')} htmlFor="limit-cat">
          <Select id="limit-cat" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">{tt('Seçin…')}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label={tt('Tutar (TL)')} htmlFor="limit-amount" error={error}>
        <Input id="limit-amount" inputMode="decimal" className="num" placeholder={tt('Örn. 5.000')} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onEnter()} />
      </Field>
    </div>
  )
}

function CoachTag() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">
      <Sparkles className="size-3" /> {tt('Koç')}
    </span>
  )
}

/** Bütçeyi kimin belirlediği (koç ya da kullanıcı) ve koçun hesabının dökümü; her pakette görünür. Koç modu Plus ve Plus+'ta. */
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
      toast(m === 'auto' ? tt('Bütçenizi artık koç belirliyor.') : auto ? tt('Bütçeyi elle yönetiyorsunuz; koçun son değerleri başlangıç olarak kaldı.') : tt('Bütçeyi elle yönetiyorsunuz.'))
    } catch (e) {
      toast(toUserMessage(e), { kind: 'error' })
    }
  }

  return (
    <Card className="mb-4 p-5" aria-label={tt('Bütçe belirleme')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <Sparkles className="size-5 text-accent" /> {tt('Aylık bütçe')}
        </h2>
        {advanced && (
          <Segmented<BudgetMode>
            label={tt('Bütçeyi kim belirlesin')}
            value={setup.mode}
            onChange={(v) => void setMode(v)}
            className="w-full sm:w-auto"
            options={[
              { value: 'auto', label: tt('Koç (otomatik)') },
              { value: 'manual', label: tt('Elle') },
            ]}
          />
        )}
      </div>

      {setup.mode === 'manual' ? (
        <>
          <ManualBudgetForm key={settings.monthlyBudgetKurus ?? 'yok'} current={settings.monthlyBudgetKurus} />
          {!advanced ? (
            <p className="mt-3 flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted">
              <PlanBadge plan="plus" /> {tt('Koç (otomatik) bütçe Plus ve Plus+\'ta.')}{' '}
              <Link to="/paketler" className="font-medium text-accent hover:underline">
                {tt('Paketleri gör')}
              </Link>
            </p>
          ) : auto ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
              <p className="text-muted">
                {tt('Koçun önerisi:')} <span className="num font-semibold text-ink">{formatKurus(auto.totalKurus)}</span> {tt('bütçe,')} <span className="num font-semibold text-ink">{formatKurus(auto.savingKurus)}</span> {tt('birikim.')}
              </p>
              <Button size="sm" onClick={() => void setMode('auto')}>
                {tt('Koçun bütçesini kullan')}
              </Button>
            </div>
          ) : null}
        </>
      ) : !auto ? (
        <div className="mt-3 text-sm text-muted">
          <p>{tt('Koçun bütçe kurması için gelirinizi ekleyin.')}</p>
          <Button size="sm" className="mt-3" icon={<Plus className="size-4" />} onClick={() => openTransactionForm(undefined, { type: 'income' })}>
            {tt('Gelir ekle')}
          </Button>
          <More>{tt('Koç önce maaşınızı ve düzenli gelirlerinizi, yoksa son dönemlerdeki gelirinizin en düşüğünü kullanır.')}</More>
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-2">
            <span className="num font-display text-2xl font-bold text-ink">{formatKurus(auto.totalKurus)}</span>
            <span className="text-[13px] text-muted">{ttf('{0} için harcama bütçesi', periodLabel(currentPeriodFor(startDay), startDay))}</span>
          </div>
          <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-2">
            <Row label={INCOME_ROW_LABEL[auto.incomeSource]} value={formatKurus(auto.incomeKurus)} />
            {auto.goalsKurus > 0 && <Row label={tt('Birikim hedefleri')} value={`−${formatKurus(auto.goalsKurus)}`} />}
            {auto.extraSavingKurus > 0 && <Row label={tt('Birikim ve borç kapatma')} value={`−${formatKurus(auto.extraSavingKurus)}`} />}
            {(auto.buckets?.outsideKurus ?? 0) > 0 && <Row label={tt('Bütçe dışında: kart/KMH ödemesi')} value={`−${formatKurus(auto.buckets!.outsideKurus)}`} />}
            {auto.recurringKurus > 0 && <Row label={tt('Bütçe içinde: düzenli ödemeler')} value={formatKurus(auto.recurringKurus)} />}
            {auto.debtKurus > 0 && <Row label={tt('Bütçe içinde: borç ve taksitler')} value={formatKurus(auto.debtKurus)} />}
            <Row label={tt('Serbest harcama')} value={auto.weeklyKurus ? ttf('{0} · haftada {1}', formatKurus(auto.flexibleKurus), formatKurus(auto.weeklyKurus)) : formatKurus(auto.flexibleKurus)} strong />
          </dl>
          {auto.shortfallKurus > 0 ? (
            <Alert tone="danger" className="mt-3">
              {ttf('Giderleriniz gelirinizi {0} aşıyor; bu dönem birikim ayrılamadı.', formatKurus(auto.shortfallKurus))}</Alert>
          ) : auto.savingCutKurus > 0 ? (
            <Alert tone="warning" className="mt-3">
              {ttf('Birikim, hedefin {0} altında.', formatKurus(auto.savingCutKurus))}</Alert>
          ) : null}
          {auto.historyKurus !== null && auto.historyKurus < auto.flexibleKurus * 0.8 && (
            <p className="mt-2 text-[12.5px] text-muted">
              {ttf('{0} daha birikime ayırabilirsiniz.', formatKurus(auto.flexibleKurus - auto.historyKurus))}</p>
          )}
          {auto.cutPct > 0 && (
            <p className="mt-2 text-[12.5px] text-muted">{ttf('Kategori limitleri ortalamanızın %{0} altında.', auto.cutPct)}</p>
          )}
          <More>
            {tt('Koç bütçeyi gelirinize, ödemelerinize ve birikim hedeflerinize göre her dönem yeniden hesaplar; hesap cihazınızda yapılır. Bir değeri elle değiştirirseniz bütçe elle moda geçer.')}
            {auto.historyKurus !== null && auto.historyKurus < auto.flexibleKurus * 0.8 && ttf(' Son dönemlerde serbest harcamanız ayda ortalama {0} oldu.', formatKurus(auto.historyKurus))}
          </More>
        </>
      )}
    </Card>
  )
}

/** Elle modda aylık toplam bütçe: doğrudan kartın içinde yazılır. */
function ManualBudgetForm({ current }: { current: number | null }) {
  const repo = useRepo()
  const { toast } = useUi()
  const [value, setValue] = useState(current ? formatKurusPlain(current) : '')
  const [error, setError] = useState<string>()
  const save = async (e: FormEvent) => {
    e.preventDefault()
    const v = value.trim()
    if (!v) {
      if (!current) return setError(tt('Bir tutar girin, örn. 30.000'))
      await repo.saveSettings({ monthlyBudgetKurus: null })
      setError(undefined)
      return toast(tt('Aylık bütçe kaldırıldı.'))
    }
    const p = parseUserAmount(v)
    if (!p.ok || p.kurus <= 0) return setError(tt('Geçerli bir tutar girin, örn. 30.000'))
    setError(undefined)
    try {
      await repo.saveSettings({ monthlyBudgetKurus: p.kurus })
      toast(tt('Aylık bütçe kaydedildi.'))
    } catch (err) {
      toast(toUserMessage(err), { kind: 'error' })
    }
  }
  return (
    <form onSubmit={save} noValidate className="mt-3 flex items-end gap-2">
      <Field label={tt('Dönemlik harcama bütçesi (TL)')} htmlFor="manual-budget" error={error} className="min-w-0 flex-1">
        <Input id="manual-budget" inputMode="decimal" className="num" placeholder={tt('Örn. 30.000')} value={value} onChange={(e) => setValue(e.target.value)} aria-invalid={!!error} />
      </Field>
      <Button type="submit" variant="primary" className={error ? 'mb-6' : undefined}>
        {tt('Kaydet')}
      </Button>
    </form>
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
