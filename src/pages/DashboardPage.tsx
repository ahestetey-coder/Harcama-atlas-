import { AlertTriangle, ArrowDownRight, ArrowUpRight, Bot, CalendarClock, ChevronDown, ChevronRight, Users, FileUp, FlaskConical, Minus, PiggyBank, Plus, Scale, Target, Wallet } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/AppShell'
import { CategoryDonut, DailyBars, type DonutSlice } from '../components/charts/Charts'
import { CategoryIcon, FilterStrip, matchesGroup, matchesMember, Money, MonthSwitcher } from '../components/common'
import { SplitDialog } from '../components/SplitDialog'
import { TransactionList } from '../components/TransactionList'
import { Modal } from '../components/ui/Modal'
import { Button, Card, EmptyState, Field, Input, Skeleton } from '../components/ui/primitives'
import { toUserMessage, UserFacingError } from '../data/repository'
import { addMonths, currentPeriod, cycleDescription, dayOf, diffDays, formatDate, periodLabel, periodLength, periodOf, periodRange, todayIso } from '../domain/dates'
import { formatKurus, formatKurusPlain, parseUserAmount } from '../domain/money'
import { compareWithPrevious, summarizeMonth, type CategoryTotal } from '../domain/summary'
import { findSettlement, settlementRangeText } from '../domain/personal'
import { isSpending, type Member, type SpendGroup, type Transaction } from '../domain/types'
import { AnimatedKurus } from '../components/ui/AnimatedMoney'
import { cn } from '../lib/cn'
import { useCategoryMap, useData, useGroupFilter, useGroupMap, useGroups, useRepo, useTransactions } from '../state/data'
import { useCloud, useMemberFilter, useMembers } from '../state/cloud'
import { setGroupBudget } from '../cloud/sync'
import { cloudErrorMessage } from '../cloud/errors'
import { usePersonalCycle, useCycle } from '../state/cycle'
import { usePersonalTransactions } from '../state/personal'
import { useUi } from '../state/ui'
import { usePlan } from '../state/plan'
import { useBudgetSetup, useBudgetStatus, useDuePayments, useMoneyFlow } from '../state/budget'
import { MoneyFlowSummary } from '../components/MoneyFlowCard'
import { useCoach } from '../state/coach'
import { tt, ttf, pctText } from '../lib/i18n'

const MAX_SLICES = 7

export default function DashboardPage() {
  const allTxs = useTransactions()
  const groups = useGroups()
  const groupMap = useGroupMap()
  const [groupFilter, setGroupFilter] = useGroupFilter()
  const { startDay, groupName: cycleGroup } = useCycle()
  const memberFilter = useMemberFilter()
  // "Tümü" kişiseldir: toplamlara yalnızca kendi giderleriniz ve paylaşım fark satırları girer; üyelerin
  // ortak giderleri yalnızca listede görünür. Kişi filtresi bu yüzden yalnızca bir grup seçiliyken vardır.
  const personal = usePersonalTransactions()
  const person = groupFilter ? memberFilter : { ...memberFilter, value: '', options: [] }
  // Bütün panel seçili gruba ve kişiye göre hesaplanır (Tümü / Bireysel / Ortak / Grupsuz…)
  const groupTxs = useMemo(() => (groupFilter ? personal?.all.filter((t) => matchesGroup(t, groupFilter)) : personal?.counted), [personal, groupFilter])
  const txs = useMemo(() => groupTxs?.filter((t) => matchesMember(t, person.value, person.selfId)), [groupTxs, person.value, person.selfId])
  const personTxs = useMemo(
    () => (groupFilter ? personal?.all.filter((t) => matchesMember(t, person.value, person.selfId)) : personal?.counted),
    [groupFilter, personal, person.value, person.selfId],
  )
  const categories = useCategoryMap()
  const budgetSetup = useBudgetSetup()
  const { month, setMonth, openTransactionForm, openImport } = useUi()
  const moneyFlow = useMoneyFlow({ month })
  const { isDemo, setDemo } = useData()
  const navigate = useNavigate()
  const [drawer, setDrawer] = useState<{ title: string; filter: (t: Transaction) => boolean; categoryId?: string | null; day?: number } | null>(null)
  const [budgetOpen, setBudgetOpen] = useState(false)
  const [allCats, setAllCats] = useState(false)
  const [dailyOpen, setDailyOpen] = useState(false)
  const today = todayIso()
  // Seçili ay boşsa kayıtlı en yakın ay (ör. geçen ayın ekstresi yüklendiyse)
  const otherMonth = useMemo(() => {
    const months = [...new Set((txs ?? []).map((t) => periodOf(t.date, startDay)))].filter((m) => m !== month).sort()
    return months.filter((m) => m < month).pop() ?? months[0] ?? null
  }, [txs, month, startDay])

  const summary = useMemo(() => (txs ? summarizeMonth(txs, month, undefined, startDay) : null), [txs, month, startDay])
  const comparison = useMemo(() => (txs ? compareWithPrevious(txs, month, addMonths(month, -1), today, startDay) : null), [txs, month, today, startDay])
  const monthTxs = useMemo(() => (txs ?? []).filter((t) => periodOf(t.date, startDay) === month), [txs, month, startDay])
  // Listede görünenler: Tümü'de üyelerin ortak giderleri de (toplamlara girmeden)
  const listMonthTxs = useMemo(
    () => (groupFilter ? monthTxs : (personal?.list ?? []).filter((t) => periodOf(t.date, startDay) === month)),
    [groupFilter, monthTxs, personal, month, startDay],
  )
  const groupRows = useMemo(() => groupBreakdown(personTxs ?? [], month, groups ?? [], startDay), [personTxs, month, groups, startDay])
  const filterName = groupFilter === 'none' ? 'Grupsuz' : groupFilter ? groupMap.get(groupFilter)?.name : undefined
  const { members, map: memberMap, selfId } = useMembers()
  // Paylaşılan grupta birden fazla üye varsa gider eşit paylaştırılabilir
  const sharedGroup = groupFilter && groupFilter !== 'none' && groupMap.get(groupFilter)?.cloudId ? groupMap.get(groupFilter) : undefined
  const splitMembers = useMemo(
    () => (sharedGroup ? members.filter((m) => m.groupIds.includes(sharedGroup.id)).map((m) => ({ id: m.id, name: m.id === selfId ? tt('Siz') : m.name, color: m.color })) : []),
    [sharedGroup, members, selfId],
  )
  const canSplit = splitMembers.length > 1
  const groupPeriod = sharedGroup ? periodRange(month, startDay) : null
  const groupSettlement = sharedGroup && groupPeriod ? findSettlement(sharedGroup, groupPeriod) : undefined
  const isGroupOwner = !!sharedGroup && !!selfId && sharedGroup.cloudOwnerId === selfId
  const [splitOpen, setSplitOpen] = useState(false)
  // Plus: seçili grubun bütçesi (paylaşılan grupta yönetici belirler)
  const { has: hasFeature } = usePlan()
  const budgetGroup = hasFeature('advancedSplit') && groupFilter && groupFilter !== 'none' ? groupMap.get(groupFilter) : undefined
  const canEditGroupBudget = !!budgetGroup && (!budgetGroup.cloudId || (!!selfId && budgetGroup.cloudOwnerId === selfId))
  const [groupBudgetOpen, setGroupBudgetOpen] = useState(false)
  // Kişi kartı, kişi filtresinden bağımsız olarak seçili gruptaki herkesi gösterir
  const groupMonthTxs = useMemo(() => (groupTxs ?? []).filter((t) => periodOf(t.date, startDay) === month), [groupTxs, month, startDay])
  const groupNet = useMemo(() => groupMonthTxs.reduce((s, t) => s + (t.type === 'expense' ? t.amountKurus : t.type === 'refund' ? -t.amountKurus : 0), 0), [groupMonthTxs])
  const personRows = useMemo(() => personBreakdown(groupMonthTxs, memberMap, selfId), [groupMonthTxs, memberMap, selfId])
  const personName = person.value ? person.options.find((o) => o.id === person.value)?.name : undefined
  const allMonthCount = useMemo(() => (allTxs ?? []).filter((t) => periodOf(t.date, startDay) === month).length, [allTxs, month, startDay])

  const slices: DonutSlice[] = useMemo(() => {
    if (!summary) return []
    const withExpense = summary.byCategory.filter((c) => c.expenseKurus > 0)
    const top = withExpense.slice(0, MAX_SLICES)
    const rest = withExpense.slice(MAX_SLICES)
    const out: DonutSlice[] = top.map((c) => {
      const cat = c.categoryId ? categories.get(c.categoryId) : undefined
      return { id: c.categoryId ?? 'none', name: cat?.name ?? tt('Kategorisiz'), color: cat?.color ?? '#94a3b8', kurus: c.expenseKurus }
    })
    if (rest.length)
      out.push({ id: 'rest', name: ttf('Diğer {0} kategori', rest.length), color: '#64748b', kurus: rest.reduce((s, c) => s + c.expenseKurus, 0), grouped: true })
    return out
  }, [summary, categories])

  if (!txs || !summary || !comparison) return <DashboardSkeleton />

  const isCurrent = month === currentPeriod(startDay)
  const isFuture = month > currentPeriod(startDay)
  const label = periodLabel(month, startDay)
  const budget = budgetSetup?.monthlyKurus ?? null
  const coachBudget = budgetSetup?.mode === 'auto' && !!budgetSetup.auto
  const openCategory = (c: CategoryTotal) => {
    const cat = c.categoryId ? categories.get(c.categoryId) : undefined
    setDrawer({ title: cat?.name ?? tt('Kategorisiz'), categoryId: c.categoryId, filter: (t) => isSpending(t) && (t.categoryId ?? null) === c.categoryId })
  }

  const daily = summary.daily.map((d) => ({ ...d, label: formatDate(d.date, 'long') }))
  const hasData = listMonthTxs.length > 0

  const hello = greeting()
  const remaining = summary.incomeKurus - summary.netKurus

  // Net gider kartının ayrıntısı: kartı sade tutmak için "Gruplara göre" kartının altında
  const details = (
    <div className="num space-y-1 text-[12.5px] leading-snug text-muted">
      {comparison.kind !== 'none' && <p>{comparison.label}</p>}
      <p>
        {tt('Gider')} {formatKurus(summary.expenseKurus)}
        {summary.refundKurus > 0 && ttf(' · iade −{0}', formatKurus(summary.refundKurus))} · {summary.count} {tt('işlem')}
        {summary.transferCount > 0 && ttf(' · {0} kart ödemesi dahil değil', summary.transferCount)}
      </p>
    </div>
  )

  // Ortak grup paylaşımı: net gider kartının hemen altında
  const shared = (
    <div className="flex flex-col gap-2 empty:hidden lg:col-span-12">
      {!groupFilter && (
        <SharedPeriodNotes
          groups={groups ?? []}
          members={members}
          selfId={selfId}
          view={periodRange(month, startDay)}
          onOpen={(g, key) => {
            setGroupFilter(g.id)
            setMonth(key)
          }}
        />
      )}

      {canSplit && sharedGroup && (
        <div className="flex items-center gap-3 rounded-2xl border border-accent/25 bg-accent-soft px-4 py-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface text-accent shadow-card">
            <Scale className="size-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-semibold text-ink">
              {sharedGroup.name} · {splitMembers.length} {tt('üye')}
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                  groupSettlement ? 'bg-surface text-accent-strong dark:text-accent' : 'bg-surface/70 text-muted',
                )}
              >
                {groupSettlement ? tt('Paylaştırıldı') : tt('Paylaştırılmadı')}
              </span>
            </p>
            <p className="num text-[12.5px] leading-snug text-muted">
              {ttf('{0} · {1} · kişi başı {2}', settlementRangeText(groupPeriod!), formatKurus(groupNet), formatKurus(Math.floor(groupNet / splitMembers.length)))}
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => setSplitOpen(true)} className="shrink-0">
            {isGroupOwner ? (groupSettlement ? tt('Paylaşımı yönet') : tt('Gideri paylaştır')) : tt('Paylaşımı gör')}
          </Button>
        </div>
      )}
    </div>
  )

  return (
    <div>
      <PageHeader
        title={tt('Özet')}
        hideTitle
        subtitle={isCurrent ? `${hello} · ${formatDate(today, 'weekday')}` : isFuture ? tt('Gelecek bir ay seçili') : ttf('{0} özeti', label)}
      />

      {hasFeature('aiCoach') && <CoachBanner />}
      <DueBanner />

      <MonthSwitcher month={month} onChange={setMonth} className="mb-3 w-full" />

      <FilterStrip
        groups={(groups ?? []).filter((g) => !g.archived || g.id === groupFilter)}
        group={groupFilter}
        onGroup={setGroupFilter}
        persons={person.options}
        person={person.value}
        onPerson={person.set}
        className="mb-4"
      />

      {!hasData ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
          {shared}
          <Card className="lg:col-span-7">
            <EmptyState
              icon={<Wallet className="size-6" />}
              title={
                personName
                  ? ttf('{0} içinde {1} kaydı yok', label, personName === 'Siz' ? 'sizin' : ttf('{0} adlı üyenin', personName))
                  : filterName
                    ? ttf('{0} içinde “{1}” kaydı yok', label, filterName)
                    : ttf('{0} için kayıt yok', label)
              }
              action={
                <>
                  {personName && (
                    <Button variant="primary" onClick={() => person.set('')}>
                      {tt('Herkesi göster')}
                    </Button>
                  )}
                  {filterName && allMonthCount > 0 && (
                    <Button variant="primary" onClick={() => setGroupFilter('')}>
                      {ttf('Tüm grupları göster ({0} işlem)', allMonthCount)}</Button>
                  )}
                  {otherMonth && (
                    <Button variant="primary" onClick={() => setMonth(otherMonth)}>
                      {ttf('{0} kayıtlarını göster', periodLabel(otherMonth, startDay))}</Button>
                  )}
                  <Button variant={otherMonth ? 'secondary' : 'primary'} icon={<Plus className="size-4" />} onClick={() => openTransactionForm()}>
                    {tt('Gider ekle')}
                  </Button>
                  <Button icon={<FileUp className="size-4" />} onClick={() => openImport()}>
                    {tt('Ekstre içe aktar')}
                  </Button>
                  {!isDemo && (
                    <Button variant="ghost" icon={<FlaskConical className="size-4" />} onClick={() => setDemo(true)}>
                      {tt('Demo verisiyle dene')}
                    </Button>
                  )}
                </>
              }
            >
              {tt('Gider ekleyin veya ekstrenizi içe aktarın.')}
            </EmptyState>
          </Card>
          {!groupFilter && moneyFlow && <MoneyFlowSummary flow={moneyFlow} className="lg:col-span-12" />}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
          {/* Özet kartı: bu ay ne kadar harcandı, gelir varsa ne kaldı, bütçe */}
          <motion.section
            initial={{ opacity: 0, y: 12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            className="hero-gradient shine relative overflow-hidden rounded-[1.75rem] p-5 text-white shadow-float sm:p-6 lg:order-first lg:col-span-7"
            aria-labelledby="net-title"
          >
            <span className="aurora -right-10 -top-12 size-52 bg-emerald-400/40" aria-hidden />
            <span className="aurora -bottom-16 left-6 size-44 bg-cyan-400/30 [animation-delay:-6s]" aria-hidden />
            <div className="relative">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="net-title" className="text-[12.5px] font-medium uppercase tracking-wider text-white/70">
                  {tt('Net gider ·')} {label}
                  {filterName && ` · ${filterName}`}
                  {personName && ` · ${personName}`}
                </h2>
                {isCurrent && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11.5px] text-white/80" title={startDay > 1 ? cycleDescription(startDay) : undefined}>
                    <CalendarClock className="size-3.5" /> {diffDays(today, periodRange(month, startDay).start) + 1}/{periodLength(month, startDay)}{tt('. gün')}
                    {startDay > 1 && ttf(' · {0}. gün döngüsü{1}', startDay, cycleGroup ? ` · ${cycleGroup}` : '')}
                  </span>
                )}
              </div>
              <AnimatedKurus value={summary.netKurus} className="mt-2 block font-display text-[42px] font-bold leading-none tracking-tight sm:text-[50px]" />
              <ComparisonChip comparison={comparison} />
              {summary.incomeKurus > 0 && (
                <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
                  <HeroStat label={tt('Gelir')} value={formatKurus(summary.incomeKurus)} />
                  <HeroStat label={remaining >= 0 ? 'Kalan' : tt('Gelirden fazla')} value={formatKurus(Math.abs(remaining))} tone={remaining >= 0 ? 'up' : 'down'} />
                </dl>
              )}
              <div className="mt-4 border-t border-white/10 pt-4">
                {budgetGroup ? (
                  <section aria-label={tt('Grup bütçesi')}>
                    <div className="flex items-center justify-between gap-2 text-[13px]">
                      <span className="flex min-w-0 items-center gap-1.5 font-semibold text-white/85">
                        <Target className="size-4 shrink-0" /> <span className="truncate">{ttf('{0} bütçesi', budgetGroup.name)}</span>
                      </span>
                      {canEditGroupBudget && (
                        <button type="button" onClick={() => setGroupBudgetOpen(true)} className="rounded-lg px-2 py-0.5 font-semibold text-emerald-200 hover:bg-white/10">
                          {budgetGroup.budgetKurus ? tt('Düzenle') : tt('Belirle')}
                        </button>
                      )}
                    </div>
                    {budgetGroup.budgetKurus ? (
                      <BudgetBar budget={budgetGroup.budgetKurus} net={groupNet} />
                    ) : (
                      <p className="mt-1 text-[12.5px] text-white/60">{canEditGroupBudget ? tt('Grubun aylık bütçesini belirleyin.') : tt('Grup bütçesini grup yöneticisi belirler.')}</p>
                    )}
                  </section>
                ) : budget ? (
                  <section aria-label={tt('Aylık bütçe')}>
                    <div className="flex items-center justify-between gap-2 text-[13px]">
                      <span className="flex items-center gap-1.5 font-semibold text-white/85">
                        <Target className="size-4" /> {tt('Aylık bütçe')}
                        {coachBudget && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-100">{tt('Koç belirledi')}</span>}
                      </span>
                      {coachBudget ? (
                        <Link to="/butce" className="rounded-lg px-2 py-0.5 font-semibold text-emerald-200 hover:bg-white/10">
                          {tt('Ayrıntı')}
                        </Link>
                      ) : (
                        <button type="button" onClick={() => setBudgetOpen(true)} className="rounded-lg px-2 py-0.5 font-semibold text-emerald-200 hover:bg-white/10">
                          {tt('Düzenle')}
                        </button>
                      )}
                    </div>
                    <BudgetBar budget={budget} net={summary.netKurus} />
                    <BudgetPlanLink />
                  </section>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => setBudgetOpen(true)} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-white/15">
                      <Target className="size-3.5" /> {tt('Aylık bütçe belirle')}
                    </button>
                    <BudgetPlanLink />
                  </div>
                )}
              </div>
            </div>
          </motion.section>

          {shared}
          {!groupFilter && moneyFlow && <MoneyFlowSummary flow={moneyFlow} className="lg:col-span-12" />}

          {/* Kategori dağılımı */}
          <Card className="p-5 lg:col-span-7">
            <h2 className="mb-4 font-display text-base font-semibold">{tt('Kategoriler')}</h2>
            {summary.expenseKurus > 0 ? (
              <div className="grid grid-cols-1 items-start gap-6 sm:grid-cols-[200px_1fr]">
                <CategoryDonut
                  slices={slices}
                  total={summary.expenseKurus}
                  centerLabel={tt('Gider')}
                  onSelect={(s) => {
                    if (s.grouped) return navigate(`/islemler?ay=${month}`)
                    const c = summary.byCategory.find((x) => (x.categoryId ?? 'none') === s.id)
                    if (c) openCategory(c)
                  }}
                />
                <div>
                  <CategoryTable rows={allCats ? summary.byCategory : summary.byCategory.slice(0, 5)} total={summary.expenseKurus} categories={categories} onSelect={openCategory} />
                  {summary.byCategory.length > 5 && (
                    <button type="button" onClick={() => setAllCats((v) => !v)} className="mt-1 w-full rounded-xl py-2 text-[13px] font-medium text-accent hover:bg-accent-soft">
                      {allCats ? tt('Daha az göster') : ttf('Tüm kategoriler ({0})', summary.byCategory.length)}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <EmptyState icon={<PiggyBank className="size-6" />} title={tt('Bu ay gider yok')} className="py-6">
                {tt('Yalnızca gelir, iade veya transfer kayıtları var.')}
              </EmptyState>
            )}
          </Card>

          {/* Son işlemler */}
          <Card className="p-5 lg:col-span-5">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-display text-base font-semibold">{tt('Son işlemler')}</h2>
              <Link to={`/islemler?ay=${month}`} className="text-[13px] font-medium text-accent hover:underline">
                {ttf('Tümü ({0})', listMonthTxs.length)}</Link>
            </div>
            <TransactionList transactions={listMonthTxs.slice(0, 6)} categories={categories} compact onEdit={openTransactionForm} markUncounted={!groupFilter} moved={groupFilter ? undefined : personal?.moved} />
          </Card>

          {/* Gruplara göre (Bireysel / Ortak / …) */}
          {groupRows.length > 1 && (
            <Card className="p-5 lg:col-span-7">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="font-display text-base font-semibold">{tt('Gruplara göre')}</h2>
                <Link to="/kategoriler?bolum=groups" className="text-[13px] font-medium text-accent hover:underline">
                  {tt('Grupları düzenle')}
                </Link>
              </div>
              <GroupTable rows={groupRows} selected={groupFilter} onSelect={(id) => setGroupFilter(groupFilter === id ? '' : id)} />
              <div className="mt-4 border-t border-line pt-3" aria-label={tt('Net gider ayrıntısı')}>
                {details}
              </div>
            </Card>
          )}
          {groupRows.length <= 1 && (
            <div className="px-1 lg:col-span-7" aria-label={tt('Net gider ayrıntısı')}>
              {details}
            </div>
          )}

          {/* Kişilere göre: paylaşılan gruplarda kim ne harcadı */}
          {personRows.length > 1 && (
            <Card className="p-5 lg:col-span-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="font-display text-base font-semibold">{ttf('Kişilere göre{0}', filterName ? ` · ${filterName}` : '')}</h2>
                {canSplit ? (
                  <button type="button" onClick={() => setSplitOpen(true)} className="text-[13px] font-medium text-accent hover:underline">
                    {tt('Paylaştır')}
                  </button>
                ) : (
                  <Link to="/uyeler" className="text-[13px] font-medium text-accent hover:underline">
                    {tt('Üyeler')}
                  </Link>
                )}
              </div>
              <GroupTable
                rows={personRows}
                selected={person.value}
                actionLabel={tt('Yalnızca bu kişiyi göster')}
                onSelect={(id) => person.set(person.value === id ? '' : id)}
              />
            </Card>
          )}

          {/* Günlük gider: ayrıntı, istenince açılır */}
          <Card className="p-5 lg:col-span-12">
            <button type="button" onClick={() => setDailyOpen((v) => !v)} aria-expanded={dailyOpen} className="flex w-full items-center justify-between gap-2 text-left">
              <h2 className="font-display text-base font-semibold">{tt('Günlük gider')}</h2>
              <span className="flex items-center gap-1 text-[13px] font-medium text-accent">
                {dailyOpen ? tt('Gizle') : tt('Göster')}
                <ChevronDown className={cn('size-4 transition-transform', dailyOpen && 'rotate-180')} />
              </span>
            </button>
            <AnimatePresence initial={false}>
              {dailyOpen && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
                  <DailyBars
                    data={daily}
                    onSelect={(day) =>
                      setDrawer({
                        title: formatDate(daily.find((d) => d.day === day)?.date ?? today, 'long'),
                        day,
                        filter: (t) => dayOf(t.date) === day,
                      })
                    }
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        </div>
      )}

      <Modal open={!!drawer} onOpenChange={(o) => !o && setDrawer(null)} title={drawer?.title ?? ''} description={periodLabel(month, startDay)} side size="lg">
        {drawer && (
          <DrawerBody
            txs={monthTxs.filter(drawer.filter)}
            categories={categories}
            link={drawer.categoryId !== undefined ? `/islemler?ay=${month}&kategori=${drawer.categoryId ?? 'none'}` : `/islemler?ay=${month}`}
            onEdit={(t) => {
              setDrawer(null)
              // Maaş gününe taşınan satır sayım kopyasıdır; tarihi değişmesin diye kaydın kendisi açılır
              openTransactionForm(personal?.moved.has(t.id) ? (allTxs?.find((x) => x.id === t.id) ?? t) : t)
            }}
          />
        )}
      </Modal>
      {sharedGroup && (
        <SplitDialog
          open={splitOpen && canSplit}
          onOpenChange={setSplitOpen}
          group={sharedGroup}
          period={periodRange(month, startDay)}
          periodText={periodLabel(month, startDay)}
          members={splitMembers}
          transactions={groupMonthTxs}
          selfId={selfId}
        />
      )}
      <BudgetModal open={budgetOpen} onOpenChange={setBudgetOpen} current={budget} />
      {budgetGroup && <GroupBudgetModal open={groupBudgetOpen} onOpenChange={setGroupBudgetOpen} group={budgetGroup} />}
    </div>
  )
}

function HeroStat({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[11.5px] uppercase tracking-wide text-white/55">{label}</dt>
      <dd className={cn('num mt-0.5 truncate text-[17px] font-semibold', tone === 'up' && 'text-emerald-200', tone === 'down' && 'text-rose-200')}>{value}</dd>
    </div>
  )
}

/** Günün saatine göre selam. */
function greeting(): string {
  const h = new Date().getHours()
  return h < 6 ? tt('İyi geceler') : h < 12 ? tt('Günaydın') : h < 18 ? tt('İyi günler') : tt('İyi akşamlar')
}

function ComparisonChip({ comparison }: { comparison: ReturnType<typeof compareWithPrevious> }) {
  if (comparison.kind === 'none') return null
  const up = comparison.diffKurus > 0
  const flat = comparison.diffKurus === 0
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
      <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold', flat ? 'bg-white/10' : up ? 'bg-rose-400/15 text-rose-200' : 'bg-emerald-400/15 text-emerald-200')}>
        <Icon className="size-3.5" />
        {comparison.percent !== null ? pctText(Math.abs(comparison.percent), 1) : ''}
        <span className="num">
          {comparison.percent !== null ? ' · ' : ''}
          {up ? '+' : flat ? '' : '−'}
          {formatKurus(Math.abs(comparison.diffKurus))}
        </span>
      </span>
    </div>
  )
}

/** Panelde Plus bütçe planına geçiş: Plus'ta uyarı sayısı, Ücretsiz pakette tanıtım. */
/** Plus+: koçtan okunmamış mesaj varsa panelin üstünde kısa bir haber. */
function CoachBanner() {
  const coach = useCoach()
  const unread = coach?.messages.filter((m) => !m.read) ?? []
  if (!unread.length) return null
  const first = unread[0]
  // Bütçe aşımı gibi uyarılar kırmızı tonda öne çıkar
  const warn = first.tone === 'warn'
  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
      <Link
        to="/koc"
        aria-label={tt('Koç mesajları')}
        className={cn(
          'mb-3 flex items-center gap-3 overflow-hidden rounded-2xl px-4 py-3 text-[13px] shadow-card hover:brightness-105',
          warn ? 'border border-danger/35 bg-danger-soft text-ink' : 'bg-slate-950 text-white hover:brightness-110',
        )}
      >
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-full text-white', warn ? 'bg-danger' : 'bg-gradient-to-br from-emerald-400 to-cyan-500')}>
          {warn ? <AlertTriangle className="size-5" /> : <Bot className="size-5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate font-semibold', warn && 'text-danger')}>{first.title}</span>
          <span className={cn(tt('block truncate'), warn ? 'text-muted' : 'text-slate-300')}>{first.body}</span>
        </span>
        {unread.length > 1 && <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[12px]', warn ? 'bg-danger/15 text-danger' : 'bg-white/15')}>+{unread.length - 1}</span>}
        <ChevronRight className={cn('size-4 shrink-0', warn ? 'text-danger' : 'text-slate-400')} />
      </Link>
    </motion.div>
  )
}

/** Plus: hatırlatma zamanı gelen düzenli ödemeler (panelin üstünde). */
function DueBanner() {
  const { has } = usePlan()
  const due = useDuePayments(has('subscriptions'))
  if (!due.length) return null
  return (
    <Link to="/borclar?bolum=odemeler" className="mb-3 block rounded-2xl border border-warning/30 bg-warning-soft px-4 py-3 text-[13px] text-ink hover:brightness-105" aria-label={tt('Yaklaşan ödemeler')}>
      {due.slice(0, 3).map((d) => (
        <div key={`${d.id}:${d.date}`} className="flex items-center gap-2 py-0.5">
          <CalendarClock className="size-4 shrink-0 text-warning" />
          <span className="min-w-0 flex-1 truncate">
            <strong className="font-semibold">{d.name}</strong> · {d.date === todayIso() ? tt('bugün') : formatDate(d.date, 'long')}
          </span>
          <span className="num shrink-0 font-medium">{formatKurus(d.amountKurus)}</span>
        </div>
      ))}
      {due.length > 3 && <div className="mt-0.5 text-subtle">{ttf('+{0} ödeme daha', due.length - 3)}</div>}
    </Link>
  )
}

function BudgetPlanLink() {
  const { has } = usePlan()
  const { month } = useUi()
  const enabled = has('advancedBudget')
  const warnings = useBudgetStatus(month, enabled)?.warnings ?? []
  const over = warnings.some((w) => w.status.state === 'over')
  return (
    <Link to="/butce" className="mt-2 inline-flex items-center gap-2 rounded-full px-1 py-1 text-[12.5px] font-semibold text-emerald-200 hover:text-white">
      {tt('Bütçe planı')}
      {warnings.length > 0 ? (
        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', over ? 'bg-rose-400/20 text-rose-100' : 'bg-amber-400/20 text-amber-100')}>{ttf('{0} uyarı', warnings.length)}</span>
      ) : (
        <ChevronRight className="size-4" />
      )}
    </Link>
  )
}

/** Bütçe çubuğu (koyu özet kartının içinde). */
function BudgetBar({ budget, net }: { budget: number; net: number }) {
  const ratio = net / budget
  const over = net > budget
  return (
    <div className="mt-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className={cn('num font-display text-lg font-bold', over ? 'text-rose-200' : 'text-white')}>
          {over ? ttf('{0} aşıldı', formatKurus(net - budget)) : ttf('{0} kaldı', formatKurus(budget - net))}
        </span>
        <span className="num text-[12.5px] text-white/60">/ {formatKurus(budget)}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/12" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(1, Math.max(0, ratio)) * 100)} aria-label={tt('Bütçe kullanımı')}>
        <motion.div
          className={cn('h-full rounded-full', over ? 'bg-rose-400' : ratio > 0.85 ? 'bg-amber-400' : 'bg-gradient-to-r from-emerald-300 to-cyan-300')}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }}
          transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
        />
      </div>
      <p className="mt-1.5 text-[12px] text-white/55">{ttf('%{0} kullanıldı', Math.max(0, Math.round(ratio * 100)))}</p>
    </div>
  )
}

function CategoryTable({ rows, total, categories, onSelect }: { rows: CategoryTotal[]; total: number; categories: ReturnType<typeof useCategoryMap>; onSelect: (c: CategoryTotal) => void }) {
  return (
    <ul className="flex flex-col gap-1" aria-label={tt('Kategori listesi')}>
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
                    {tt('İade −')}{formatKurus(c.refundKurus)} {tt('· Net')} <span className={cn(c.netKurus < 0 && 'text-accent')}>{c.netKurus < 0 ? '−' : ''}{formatKurus(Math.abs(c.netKurus))}</span>
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
          <div className="text-[11.5px] text-subtle">{tt('Gider')}</div>
          <div className="num text-sm font-semibold">{formatKurus(exp)}</div>
        </div>
        <div>
          <div className="text-[11.5px] text-subtle">{tt('İade')}</div>
          <div className="num text-sm font-semibold text-accent">{formatKurus(ref)}</div>
        </div>
        <div>
          <div className="text-[11.5px] text-subtle">{tt('Net')}</div>
          <div className="num text-sm font-semibold">
            <Money kurus={exp - ref} plain />
          </div>
        </div>
      </div>
      {txs.length ? <TransactionList transactions={txs} categories={categories} compact onEdit={onEdit} /> : <p className="py-6 text-center text-sm text-muted">{tt('Bu seçimde işlem yok.')}</p>}
      <Link to={link} className="mt-4 block rounded-xl border border-line py-2.5 text-center text-sm font-medium text-accent hover:bg-accent-soft">
        {tt('İşlemler sayfasında filtreli aç')}
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
      if (!p.ok || p.kurus <= 0) return setError(tt('Geçerli bir tutar girin, örn. 25.000'))
      kurus = p.kurus
    }
    try {
      await repo.saveSettings({ monthlyBudgetKurus: kurus, budgetMode: 'manual' })
      toast(kurus ? tt('Bütçe kaydedildi.') : tt('Bütçe kaldırıldı.'))
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
      title={tt('Aylık bütçe')}
      description={tt('Her ay aynı tutar uygulanır.')}
      size="sm"
      footer={
        <>
          {current && (
            <Button variant="ghost" className="mr-auto text-danger" onClick={() => save(true)}>
              {tt('Bütçeyi kaldır')}
            </Button>
          )}
          <Button variant="primary" onClick={() => save()}>
            {tt('Kaydet')}
          </Button>
        </>
      }
    >
      <Field label={tt('Tutar (TL)')} htmlFor="budget" error={error}>
        <Input id="budget" inputMode="decimal" className="num" placeholder={tt('Örn. 30.000')} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
      </Field>
    </Modal>
  )
}

function GroupBudgetModal({ open, onOpenChange, group }: { open: boolean; onOpenChange: (o: boolean) => void; group: SpendGroup }) {
  const repo = useRepo()
  const { backend } = useCloud()
  const { toast } = useUi()
  const current = group.budgetKurus ?? null
  const [value, setValue] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const save = async (clear = false) => {
    let kurus: number | null = null
    if (!clear && value.trim()) {
      const p = parseUserAmount(value)
      if (!p.ok || p.kurus <= 0) return setError(tt('Geçerli bir tutar girin, örn. 25.000'))
      kurus = p.kurus
    }
    setBusy(true)
    try {
      await setGroupBudget(repo, backend, group.id, kurus)
      toast(kurus ? tt('Grup bütçesi kaydedildi.') : tt('Grup bütçesi kaldırıldı.'))
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof UserFacingError ? e.message : group.cloudId ? cloudErrorMessage(e) : toUserMessage(e))
    } finally {
      setBusy(false)
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
      title={ttf('{0} bütçesi', group.name)}
      description={group.cloudId ? tt('Bütün üyeler görür.') : undefined}
      size="sm"
      footer={
        <>
          {current && (
            <Button variant="ghost" className="mr-auto text-danger" disabled={busy} onClick={() => save(true)}>
              {tt('Bütçeyi kaldır')}
            </Button>
          )}
          <Button variant="primary" loading={busy} onClick={() => save()}>
            {tt('Kaydet')}
          </Button>
        </>
      }
    >
      <Field label={tt('Tutar (TL)')} htmlFor="group-budget" error={error}>
        <Input id="group-budget" inputMode="decimal" className="num" placeholder={tt('Örn. 20.000')} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
      </Field>
    </Modal>
  )
}

function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label={tt('Panel yükleniyor')}>
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
function groupBreakdown(txs: Transaction[], month: string, groups: SpendGroup[], startDay: number): GroupRow[] {
  const rows = new Map<string, GroupRow>()
  for (const g of groups) rows.set(g.id, { id: g.id, name: g.name, color: g.color, expenseKurus: 0, refundKurus: 0, count: 0 })
  rows.set('none', { id: 'none', name: tt('Grupsuz'), color: '#94a3b8', expenseKurus: 0, refundKurus: 0, count: 0 })
  for (const t of txs) {
    if (periodOf(t.date, startDay) !== month || !isSpending(t)) continue
    const r = rows.get(t.groupId && rows.has(t.groupId) ? t.groupId : 'none')!
    r.count++
    if (t.type === 'expense') r.expenseKurus += t.amountKurus
    else r.refundKurus += t.amountKurus
  }
  const archived = new Set(groups.filter((g) => g.archived).map((g) => g.id))
  // Arşivdeki ve boş "Grupsuz" satırları yalnızca kaydı varsa gösterilir
  return [...rows.values()].filter((r) => r.count > 0 || (r.id !== 'none' && !archived.has(r.id)))
}

/** Seçili ay ve gruptaki işlemlerin kişilere dağılımı. Üye bilgisi olmayan kayıtlar cihaz sahibinindir. */
function personBreakdown(txs: Transaction[], members: Map<string, Member>, selfId: string | null): GroupRow[] {
  const rows = new Map<string, GroupRow>()
  for (const t of txs) {
    if (!isSpending(t)) continue
    const id = t.memberId ?? selfId ?? 'self'
    let r = rows.get(id)
    if (!r) {
      const m = members.get(id)
      r = { id, name: m?.name ?? tt('Grup üyesi'), color: m?.color ?? '#94a3b8', expenseKurus: 0, refundKurus: 0, count: 0 }
      if (id === selfId && (!m || m.name === 'Ben')) r.name = tt('Siz')
      rows.set(id, r)
    }
    r.count++
    if (t.type === 'expense') r.expenseKurus += t.amountKurus
    else r.refundKurus += t.amountKurus
  }
  return [...rows.values()].sort((a, b) => b.expenseKurus - b.refundKurus - (a.expenseKurus - a.refundKurus))
}

function GroupTable({
  rows,
  selected,
  onSelect,
  actionLabel = tt('Paneli bu gruba göre filtrele'),
}: {
  rows: GroupRow[]
  selected: string
  onSelect: (id: string) => void
  actionLabel?: string
}) {
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
              aria-label={ttf('{0}: net {1}, {2} işlem. {3}', r.name, formatKurus(net), r.count, actionLabel)}
              className={cn('w-full rounded-xl px-2 py-2 text-left transition-colors hover:bg-surface-2', selected === r.id && 'bg-surface-2 ring-1 ring-line-strong')}
            >
              <div className="flex items-center gap-2 text-[13.5px]">
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} aria-hidden />
                <span className="min-w-0 flex-1 truncate font-medium text-ink">{r.name}</span>
                <span className="num text-[12px] text-subtle">{ttf('{0} işlem', r.count)}</span>
                <span className="num w-28 text-right font-semibold">{formatKurus(net)}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: r.color }} />
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * "Tümü" görünümünde ortak grupların hatırlatması: görüntülenen döneme denk gelen paylaşım (yöneticinin
 * dönemiyle) veya henüz paylaştırılmadığı; grubun yöneticinin belirlediği bir dönemi varsa o dönem.
 */
function SharedPeriodNotes({
  groups,
  members,
  selfId,
  view,
  onOpen,
}: {
  groups: SpendGroup[]
  members: Member[]
  selfId: string | null
  /** Görüntülenen kişisel dönem. */
  view: { start: string; end: string }
  onOpen: (g: SpendGroup, periodKey: string) => void
}) {
  const personalDay = usePersonalCycle()
  const today = todayIso()
  const ref = view.end < today ? view.end : today
  const rows = groups
    .filter((g) => g.cloudId && !g.archived && members.filter((m) => m.groupIds.includes(g.id)).length > 1)
    .map((g) => {
      const settlement = findSettlement(g, view)
      // Grubun dönemi: paylaşımın dönemi, yoksa yöneticinin grup için belirlediği dönem
      const day = g.cycleStartDay || personalDay
      const range = settlement ?? (g.cycleStartDay ? periodRange(periodOf(ref, day), day) : null)
      const key = periodOf(settlement ? settlement.start : ref, day)
      const owner = !!selfId && g.cloudOwnerId === selfId
      const share = settlement && selfId ? (settlement.shares[selfId] ?? 0) : 0
      return { g, key, range, settlement, owner, share }
    })
  if (!rows.length) return null
  return (
    <section aria-label={tt('Ortak grupların dönemi')} className="flex flex-col gap-2">
      {rows.map(({ g, key, range, settlement, owner, share }) => (
        <button
          key={g.id}
          type="button"
          onClick={() => onOpen(g, key)}
          className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-left shadow-card transition-colors hover:bg-surface-2"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-xl text-white" style={{ backgroundColor: g.color }}>
            <Users className="size-[18px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">
              {settlement
                ? owner
                  ? ttf('{0} giderini paylaştırdınız', g.name)
                  : ttf('Yönetici {0} giderini sizinle paylaştı', g.name)
                : ttf('{0} · bu dönem henüz paylaştırılmadı', g.name)}
            </span>
            <span className="num block text-[12.5px] leading-snug text-muted">
              {range && `${owner || settlement ? '' : tt('Yöneticinin dönemi: ')}${settlementRangeText(range)} · `}
              {settlement ? ttf('payınız {0}', formatKurus(share)) : tt('toplamınıza girmez')}
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden />
        </button>
      ))}
    </section>
  )
}
