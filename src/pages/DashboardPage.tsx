import { ArrowDownRight, ArrowUpRight, CalendarClock, FileUp, FlaskConical, Minus, PiggyBank, Plus, Receipt, Target, Wallet } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/AppShell'
import { CategoryDonut, DailyBars, type DonutSlice } from '../components/charts/Charts'
import { CategoryIcon, GroupFilterBar, matchesGroup, Money, MonthSwitcher } from '../components/common'
import { TransactionList } from '../components/TransactionList'
import { Modal } from '../components/ui/Modal'
import { Button, Card, EmptyState, Field, Input, Skeleton } from '../components/ui/primitives'
import { toUserMessage } from '../data/repository'
import { addMonths, currentMonth, dayOf, daysInMonth, formatDate, MONTH_NAMES, monthLabel, monthOf, parseMonthKey, todayIso } from '../domain/dates'
import { formatKurus, formatKurusPlain, parseUserAmount } from '../domain/money'
import { compareWithPrevious, summarizeMonth, type CategoryTotal } from '../domain/summary'
import type { SpendGroup, Transaction } from '../domain/types'
import { cn } from '../lib/cn'
import { useCategoryMap, useData, useGroupFilter, useGroupMap, useGroups, useRepo, useSettings, useTransactions } from '../state/data'
import { useUi } from '../state/ui'

const MAX_SLICES = 7

export default function DashboardPage() {
  const allTxs = useTransactions()
  const groups = useGroups()
  const groupMap = useGroupMap()
  const [groupFilter, setGroupFilter] = useGroupFilter()
  // Bütün panel seçili gruba göre hesaplanır (Tüm gruplar / Bireysel / Ortak / Grupsuz…)
  const txs = useMemo(() => allTxs?.filter((t) => matchesGroup(t, groupFilter)), [allTxs, groupFilter])
  const categories = useCategoryMap()
  const settings = useSettings()
  const { month, setMonth, openTransactionForm } = useUi()
  const { isDemo, setDemo } = useData()
  const navigate = useNavigate()
  const [drawer, setDrawer] = useState<{ title: string; filter: (t: Transaction) => boolean; categoryId?: string | null; day?: number } | null>(null)
  const [budgetOpen, setBudgetOpen] = useState(false)
  const today = todayIso()
  // Seçili ay boşsa kayıtlı en yakın ay (ör. geçen ayın ekstresi yüklendiyse)
  const otherMonth = useMemo(() => {
    const months = [...new Set((txs ?? []).map((t) => monthOf(t.date)))].filter((m) => m !== month).sort()
    return months.filter((m) => m < month).pop() ?? months[0] ?? null
  }, [txs, month])

  const summary = useMemo(() => (txs ? summarizeMonth(txs, month) : null), [txs, month])
  const comparison = useMemo(() => (txs ? compareWithPrevious(txs, month, addMonths(month, -1), today) : null), [txs, month, today])
  const monthTxs = useMemo(() => (txs ?? []).filter((t) => monthOf(t.date) === month), [txs, month])
  const groupRows = useMemo(() => groupBreakdown(allTxs ?? [], month, groups ?? []), [allTxs, month, groups])
  const filterName = groupFilter === 'none' ? 'Grupsuz' : groupFilter ? groupMap.get(groupFilter)?.name : undefined
  const allMonthCount = useMemo(() => (allTxs ?? []).filter((t) => monthOf(t.date) === month).length, [allTxs, month])

  const slices: DonutSlice[] = useMemo(() => {
    if (!summary) return []
    const withExpense = summary.byCategory.filter((c) => c.expenseKurus > 0)
    const top = withExpense.slice(0, MAX_SLICES)
    const rest = withExpense.slice(MAX_SLICES)
    const out: DonutSlice[] = top.map((c) => {
      const cat = c.categoryId ? categories.get(c.categoryId) : undefined
      return { id: c.categoryId ?? 'none', name: cat?.name ?? 'Kategorisiz', color: cat?.color ?? '#94a3b8', kurus: c.expenseKurus }
    })
    if (rest.length)
      out.push({ id: 'rest', name: `Diğer ${rest.length} kategori`, color: '#64748b', kurus: rest.reduce((s, c) => s + c.expenseKurus, 0), grouped: true })
    return out
  }, [summary, categories])

  if (!txs || !summary || !comparison) return <DashboardSkeleton />

  const isCurrent = month === currentMonth()
  const isFuture = month > currentMonth()
  const { year, month: m } = parseMonthKey(month)
  const topCat = summary.topCategory?.categoryId ? categories.get(summary.topCategory.categoryId) : undefined
  const budget = settings?.monthlyBudgetKurus ?? null
  const openCategory = (c: CategoryTotal) => {
    const cat = c.categoryId ? categories.get(c.categoryId) : undefined
    setDrawer({ title: cat?.name ?? 'Kategorisiz', categoryId: c.categoryId, filter: (t) => t.type !== 'transfer' && (t.categoryId ?? null) === c.categoryId })
  }

  const daily = summary.daily.map((d) => ({ ...d, label: `${d.day} ${MONTH_NAMES[m - 1]} ${year}` }))
  const hasData = monthTxs.length > 0

  return (
    <div>
      <PageHeader
        title="Panel"
        subtitle={isCurrent ? `Bugün ${formatDate(today, 'weekday')}` : isFuture ? 'Gelecek bir ay seçili' : `${monthLabel(month)} özeti`}
        actions={
          <>
            <MonthSwitcher month={month} onChange={setMonth} />
            <Button className="hidden sm:inline-flex" icon={<FileUp className="size-4" />} onClick={() => navigate('/ice-aktar')}>
              İçe aktar
            </Button>
          </>
        }
      />

      <GroupFilterBar groups={(groups ?? []).filter((g) => !g.archived || g.id === groupFilter)} value={groupFilter} onChange={setGroupFilter} className="mb-4" />

      {!hasData ? (
        <Card>
          <EmptyState
            icon={<Wallet className="size-6" />}
            title={filterName ? `${monthLabel(month)} içinde “${filterName}” kaydı yok` : `${monthLabel(month)} için kayıt yok`}
            action={
              <>
                {filterName && allMonthCount > 0 && (
                  <Button variant="primary" onClick={() => setGroupFilter('')}>
                    Tüm grupları göster ({allMonthCount} işlem)
                  </Button>
                )}
                {otherMonth && (
                  <Button variant="primary" onClick={() => setMonth(otherMonth)}>
                    {monthLabel(otherMonth)} kayıtlarını göster
                  </Button>
                )}
                <Button variant={otherMonth ? 'secondary' : 'primary'} icon={<Plus className="size-4" />} onClick={() => openTransactionForm()}>
                  Gider ekle
                </Button>
                <Button icon={<FileUp className="size-4" />} onClick={() => navigate('/ice-aktar')}>
                  Ekstre içe aktar
                </Button>
                {!isDemo && (
                  <Button variant="ghost" icon={<FlaskConical className="size-4" />} onClick={() => setDemo(true)}>
                    Demo verisiyle dene
                  </Button>
                )}
              </>
            }
          >
            Manuel gider ekleyin veya kredi kartı ekstrenizi (PDF, CSV, Excel, ekran görüntüsü) içe aktarın. Özetler yalnızca onayladığınız kayıtlardan hesaplanır.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
          {/* Özet kartı */}
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="hero-gradient relative overflow-hidden rounded-[1.5rem] p-5 text-white shadow-float sm:p-6 lg:col-span-7"
            aria-labelledby="net-title"
          >
            <div className="absolute -right-16 -top-16 size-56 rounded-full bg-emerald-400/10 blur-3xl" aria-hidden />
            <div className="relative">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="net-title" className="text-[13px] font-medium uppercase tracking-wider text-white/70">
                  Net gider · {monthLabel(month)}
                  {filterName && ` · ${filterName}`}
                </h2>
                {isCurrent && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11.5px] text-white/80">
                    <CalendarClock className="size-3.5" /> Ay devam ediyor ({dayOf(today)}/{daysInMonth(year, m)} gün)
                  </span>
                )}
              </div>
              <div className="num mt-2 font-display text-[40px] font-bold leading-none tracking-tight sm:text-[48px]">{formatKurus(summary.netKurus)}</div>
              <p className="mt-1.5 text-[13px] text-white/60">Net = giderler − iadeler. Kart ödemeleri ve transferler dahil değildir.</p>
              <ComparisonChip comparison={comparison} />
              <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-white/10 pt-4">
                <HeroStat label="Brüt gider" value={formatKurus(summary.expenseKurus)} />
                <HeroStat label="İadeler" value={summary.refundKurus ? `−${formatKurus(summary.refundKurus)}` : formatKurus(0)} />
                <HeroStat label="İşlem sayısı" value={String(summary.count)} />
              </dl>
            </div>
          </motion.section>

          {/* Bütçe ve en yüksek kategori */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-5 lg:grid-cols-1 lg:gap-5">
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <Target className="size-4 text-accent" /> Aylık bütçe
                </h2>
                <Button size="sm" variant="ghost" onClick={() => setBudgetOpen(true)}>
                  {budget ? 'Düzenle' : 'Belirle'}
                </Button>
              </div>
              {budget ? <BudgetBar budget={budget} net={summary.netKurus} /> : <p className="mt-2 text-sm text-muted">İsteğe bağlı: bir bütçe belirlerseniz kalan veya aşılan tutar burada görünür.</p>}
            </Card>
            <Card className="p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Receipt className="size-4 text-accent" /> En yüksek harcama kategorisi
              </h2>
              {summary.topCategory ? (
                <button type="button" onClick={() => openCategory(summary.topCategory!)} className="mt-3 flex w-full items-center gap-3 rounded-xl text-left transition-colors hover:bg-surface-2">
                  <CategoryIcon category={topCat} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-ink">{topCat?.name ?? 'Kategorisiz'}</div>
                    <div className="text-[12.5px] text-muted">
                      Brüt giderin %{((summary.topCategory.expenseKurus / Math.max(1, summary.expenseKurus)) * 100).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}’i
                    </div>
                  </div>
                  <span className="num font-semibold">{formatKurus(summary.topCategory.expenseKurus)}</span>
                </button>
              ) : (
                <p className="mt-2 text-sm text-muted">Bu ay gider yok.</p>
              )}
              {summary.transferCount > 0 && (
                <p className="mt-3 border-t border-line pt-3 text-[12.5px] text-subtle">
                  {summary.transferCount} kart ödemesi/transfer ({formatKurus(summary.transferKurus)}) gider toplamına dahil edilmedi.
                </p>
              )}
            </Card>
          </div>

          {/* Kategori dağılımı */}
          <Card className="p-5 lg:col-span-7">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-base font-semibold">Kategori dağılımı</h2>
              <span className="text-[12px] text-subtle">Brüt gider · dilime dokunun</span>
            </div>
            {summary.expenseKurus > 0 ? (
              <div className="grid grid-cols-1 items-start gap-6 sm:grid-cols-[220px_1fr]">
                <CategoryDonut
                  slices={slices}
                  total={summary.expenseKurus}
                  centerLabel="Brüt gider"
                  onSelect={(s) => {
                    if (s.grouped) return navigate(`/islemler?ay=${month}`)
                    const c = summary.byCategory.find((x) => (x.categoryId ?? 'none') === s.id)
                    if (c) openCategory(c)
                  }}
                />
                <CategoryTable rows={summary.byCategory} total={summary.expenseKurus} categories={categories} onSelect={openCategory} />
              </div>
            ) : (
              <EmptyState icon={<PiggyBank className="size-6" />} title="Bu ay gider yok" className="py-6">
                Yalnızca iade veya transfer kayıtları var.
              </EmptyState>
            )}
          </Card>

          {/* Son işlemler */}
          <Card className="p-5 lg:col-span-5 lg:row-span-2">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-display text-base font-semibold">Son işlemler</h2>
              <Link to={`/islemler?ay=${month}`} className="text-[13px] font-medium text-accent hover:underline">
                Tümü ({monthTxs.length})
              </Link>
            </div>
            <TransactionList transactions={monthTxs.slice(0, 10)} categories={categories} compact onEdit={openTransactionForm} />
          </Card>

          {/* Günlük gider */}
          <Card className="p-5 lg:col-span-7">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-base font-semibold">Günlük gider</h2>
              <span className="text-[12px] text-subtle">Çubuğa dokunarak o günün işlemlerini açın</span>
            </div>
            <DailyBars
              data={daily}
              onSelect={(day) =>
                setDrawer({
                  title: `${day} ${MONTH_NAMES[m - 1]} ${year}`,
                  day,
                  filter: (t) => dayOf(t.date) === day,
                })
              }
            />
          </Card>

          {/* Gruplara göre (Bireysel / Ortak / …) */}
          {groupRows.length > 1 && (
            <Card className="p-5 lg:col-span-7">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="font-display text-base font-semibold">Gruplara göre</h2>
                <Link to="/kategoriler?bolum=groups" className="text-[13px] font-medium text-accent hover:underline">
                  Grupları düzenle
                </Link>
              </div>
              <GroupTable rows={groupRows} selected={groupFilter} onSelect={(id) => setGroupFilter(groupFilter === id ? '' : id)} />
            </Card>
          )}
        </div>
      )}

      <Modal open={!!drawer} onOpenChange={(o) => !o && setDrawer(null)} title={drawer?.title ?? ''} description={monthLabel(month)} side size="lg">
        {drawer && (
          <DrawerBody
            txs={monthTxs.filter(drawer.filter)}
            categories={categories}
            link={drawer.categoryId !== undefined ? `/islemler?ay=${month}&kategori=${drawer.categoryId ?? 'none'}` : `/islemler?ay=${month}`}
            onEdit={(t) => {
              setDrawer(null)
              openTransactionForm(t)
            }}
          />
        )}
      </Modal>
      <BudgetModal open={budgetOpen} onOpenChange={setBudgetOpen} current={budget} />
    </div>
  )
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[11.5px] uppercase tracking-wide text-white/55">{label}</dt>
      <dd className="num mt-0.5 truncate text-[15px] font-semibold sm:text-base">{value}</dd>
    </div>
  )
}

function ComparisonChip({ comparison }: { comparison: ReturnType<typeof compareWithPrevious> }) {
  if (comparison.kind === 'none')
    return <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[12.5px] text-white/75">Önceki ayla karşılaştırma yok: {comparison.reason.toLocaleLowerCase('tr')}</p>
  const up = comparison.diffKurus > 0
  const flat = comparison.diffKurus === 0
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
      <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold', flat ? 'bg-white/10' : up ? 'bg-rose-400/15 text-rose-200' : 'bg-emerald-400/15 text-emerald-200')}>
        <Icon className="size-3.5" />
        {comparison.percent !== null ? `%${Math.abs(comparison.percent).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}` : ''}
        <span className="num">
          {comparison.percent !== null ? ' · ' : ''}
          {up ? '+' : flat ? '' : '−'}
          {formatKurus(Math.abs(comparison.diffKurus))}
        </span>
      </span>
      <span className="text-white/65">
        {comparison.label}
        {comparison.percent === null && ' (önceki net gider sıfır veya eksi; yüzde hesaplanmadı)'}
      </span>
    </div>
  )
}

function BudgetBar({ budget, net }: { budget: number; net: number }) {
  const ratio = net / budget
  const over = net > budget
  return (
    <div className="mt-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className={cn('num font-display text-xl font-bold', over ? 'text-danger' : 'text-ink')}>
          {over ? `${formatKurus(net - budget)} aşıldı` : `${formatKurus(budget - net)} kaldı`}
        </span>
        <span className="num text-[12.5px] text-muted">/ {formatKurus(budget)}</span>
      </div>
      <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(1, Math.max(0, ratio)) * 100)} aria-label="Bütçe kullanımı">
        <motion.div
          className={cn('h-full rounded-full', over ? 'bg-danger' : ratio > 0.85 ? 'bg-amber-500' : 'bg-gradient-to-r from-emerald-500 to-teal-500')}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }}
          transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
        />
      </div>
      <p className="mt-1.5 text-[12px] text-subtle">Net gidere göre %{Math.max(0, Math.round(ratio * 100))} kullanıldı.</p>
    </div>
  )
}

function CategoryTable({ rows, total, categories, onSelect }: { rows: CategoryTotal[]; total: number; categories: ReturnType<typeof useCategoryMap>; onSelect: (c: CategoryTotal) => void }) {
  return (
    <ul className="flex flex-col gap-1" aria-label="Kategori listesi">
      {rows.map((c) => {
        const cat = c.categoryId ? categories.get(c.categoryId) : undefined
        const share = total ? c.expenseKurus / total : 0
        return (
          <li key={c.categoryId ?? 'none'}>
            <button type="button" onClick={() => onSelect(c)} className="group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-surface-2">
              <CategoryIcon category={cat} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={cn('truncate text-[13.5px] font-medium', !cat && 'text-warning')}>{cat?.name ?? 'Kategorisiz'}</span>
                  <span className="num shrink-0 text-[13.5px] font-semibold">{formatKurus(c.expenseKurus)}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <motion.div className="h-full rounded-full" style={{ backgroundColor: cat?.color ?? '#94a3b8' }} initial={{ width: 0 }} animate={{ width: `${share * 100}%` }} transition={{ duration: 0.45 }} />
                  </div>
                  <span className="num w-10 shrink-0 text-right text-[11.5px] text-subtle">%{Math.round(share * 100)}</span>
                </div>
                {c.refundKurus > 0 && (
                  <div className="num mt-1 text-[11.5px] text-muted">
                    İade −{formatKurus(c.refundKurus)} · Net <span className={cn(c.netKurus < 0 && 'text-accent')}>{c.netKurus < 0 ? '−' : ''}{formatKurus(Math.abs(c.netKurus))}</span>
                  </div>
                )}
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function DrawerBody({ txs, categories, link, onEdit }: { txs: Transaction[]; categories: ReturnType<typeof useCategoryMap>; link: string; onEdit: (t: Transaction) => void }) {
  const exp = txs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amountKurus, 0)
  const ref = txs.filter((t) => t.type === 'refund').reduce((s, t) => s + t.amountKurus, 0)
  return (
    <div>
      <div className="mb-3 grid grid-cols-3 gap-2 rounded-2xl bg-surface-2 p-3 text-center">
        <div>
          <div className="text-[11.5px] text-subtle">Gider</div>
          <div className="num text-sm font-semibold">{formatKurus(exp)}</div>
        </div>
        <div>
          <div className="text-[11.5px] text-subtle">İade</div>
          <div className="num text-sm font-semibold text-accent">{formatKurus(ref)}</div>
        </div>
        <div>
          <div className="text-[11.5px] text-subtle">Net</div>
          <div className="num text-sm font-semibold">
            <Money kurus={exp - ref} plain />
          </div>
        </div>
      </div>
      {txs.length ? <TransactionList transactions={txs} categories={categories} compact onEdit={onEdit} /> : <p className="py-6 text-center text-sm text-muted">Bu seçimde işlem yok.</p>}
      <Link to={link} className="mt-4 block rounded-xl border border-line py-2.5 text-center text-sm font-medium text-accent hover:bg-accent-soft">
        İşlemler sayfasında filtreli aç
      </Link>
    </div>
  )
}

function BudgetModal({ open, onOpenChange, current }: { open: boolean; onOpenChange: (o: boolean) => void; current: number | null }) {
  const repo = useRepo()
  const { toast } = useUi()
  const [value, setValue] = useState(current ? formatKurusPlain(current) : '')
  const [error, setError] = useState<string>()
  const save = async (clear = false) => {
    let kurus: number | null = null
    if (!clear && value.trim()) {
      const p = parseUserAmount(value)
      if (!p.ok || p.kurus <= 0) return setError('Geçerli bir tutar girin, örn. 25.000')
      kurus = p.kurus
    }
    try {
      await repo.saveSettings({ monthlyBudgetKurus: kurus })
      toast(kurus ? 'Bütçe kaydedildi.' : 'Bütçe kaldırıldı.')
      onOpenChange(false)
    } catch (e) {
      toast(toUserMessage(e), { kind: 'error' })
    }
  }
  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (o) setValue(current ? formatKurusPlain(current) : '')
        setError(undefined)
        onOpenChange(o)
      }}
      title="Aylık bütçe"
      description="Her ay için aynı bütçe uygulanır; net gidere göre hesaplanır."
      size="sm"
      footer={
        <>
          {current && (
            <Button variant="ghost" className="mr-auto text-danger" onClick={() => save(true)}>
              Bütçeyi kaldır
            </Button>
          )}
          <Button variant="primary" onClick={() => save()}>
            Kaydet
          </Button>
        </>
      }
    >
      <Field label="Tutar (TL)" htmlFor="budget" error={error}>
        <Input id="budget" inputMode="decimal" className="num" placeholder="Örn. 30.000" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
      </Field>
    </Modal>
  )
}

function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Panel yükleniyor">
      <Skeleton className="mb-6 h-9 w-40" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Skeleton className="h-60 rounded-3xl lg:col-span-7" />
        <Skeleton className="h-60 rounded-3xl lg:col-span-5" />
        <Skeleton className="h-72 rounded-3xl lg:col-span-7" />
        <Skeleton className="h-72 rounded-3xl lg:col-span-5" />
      </div>
    </div>
  )
}


interface GroupRow {
  id: string
  name: string
  color: string
  expenseKurus: number
  refundKurus: number
  count: number
}

/** Seçili aydaki giderlerin gruplara dağılımı (grup filtresinden bağımsız, her zaman tüm işlemler). */
function groupBreakdown(txs: Transaction[], month: string, groups: SpendGroup[]): GroupRow[] {
  const rows = new Map<string, GroupRow>()
  for (const g of groups) rows.set(g.id, { id: g.id, name: g.name, color: g.color, expenseKurus: 0, refundKurus: 0, count: 0 })
  rows.set('none', { id: 'none', name: 'Grupsuz', color: '#94a3b8', expenseKurus: 0, refundKurus: 0, count: 0 })
  for (const t of txs) {
    if (monthOf(t.date) !== month || t.type === 'transfer') continue
    const r = rows.get(t.groupId && rows.has(t.groupId) ? t.groupId : 'none')!
    r.count++
    if (t.type === 'expense') r.expenseKurus += t.amountKurus
    else r.refundKurus += t.amountKurus
  }
  const archived = new Set(groups.filter((g) => g.archived).map((g) => g.id))
  // Arşivdeki ve boş "Grupsuz" satırları yalnızca kaydı varsa gösterilir
  return [...rows.values()].filter((r) => r.count > 0 || (r.id !== 'none' && !archived.has(r.id)))
}

function GroupTable({ rows, selected, onSelect }: { rows: GroupRow[]; selected: string; onSelect: (id: string) => void }) {
  const total = rows.reduce((s, r) => s + r.expenseKurus - r.refundKurus, 0)
  return (
    <ul className="flex flex-col gap-1">
      {rows.map((r) => {
        const net = r.expenseKurus - r.refundKurus
        const pct = total > 0 ? Math.max(0, (net / total) * 100) : 0
        return (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onSelect(r.id)}
              aria-pressed={selected === r.id}
              aria-label={`${r.name}: net ${formatKurus(net)}, ${r.count} işlem. Paneli bu gruba göre filtrele`}
              className={cn('w-full rounded-xl px-2 py-2 text-left transition-colors hover:bg-surface-2', selected === r.id && 'bg-surface-2 ring-1 ring-line-strong')}
            >
              <div className="flex items-center gap-2 text-[13.5px]">
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} aria-hidden />
                <span className="min-w-0 flex-1 truncate font-medium text-ink">{r.name}</span>
                <span className="num text-[12px] text-subtle">{r.count} işlem</span>
                <span className="num w-28 text-right font-semibold">{formatKurus(net)}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: r.color }} />
              </div>
            </button>
          </li>
        )
      })}
      <li className="px-2 pt-1 text-[12px] text-subtle">Net = gider − iade. Bir gruba dokunursanız bütün panel o gruba göre gösterilir.</li>
    </ul>
  )
}
