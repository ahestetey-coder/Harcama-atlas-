import { Download, FileUp, ListOrdered, Plus, Search, SlidersHorizontal, Tags, Trash2, Users, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/AppShell'
import { FilterStrip, GroupPicker, matchesGroup, matchesMember, MonthSwitcher } from '../components/common'
import { TransactionList } from '../components/TransactionList'
import { ConfirmDialog, Modal } from '../components/ui/Modal'
import { Button, Card, EmptyState, Field, Input, Segmented, Select, Skeleton } from '../components/ui/primitives'
import { cn } from '../lib/cn'
import { toUserMessage } from '../data/repository'
import { periodLabel, periodRange } from '../domain/dates'
import { formatKurus } from '../domain/money'
import { normalizeText } from '../domain/normalize'
import { PAYMENT_LABEL, SOURCE_LABEL, type PaymentMethod, type Transaction, type TxSource, type TxType } from '../domain/types'
import { downloadBlob } from '../lib/download'
import { transactionsToCsv } from '../lib/csvExport'
import { APP_CONFIG } from '../config/app'
import { useMemberFilter } from '../state/cloud'
import { useCategories, useCategoryMap, useGroupFilter, useGroupMap, useGroups, useImports, useRepo } from '../state/data'
import { useCycle } from '../state/cycle'
import { usePersonalTransactions } from '../state/personal'
import { isCounted } from '../domain/personal'
import { useUi } from '../state/ui'
import { tt, ttf } from '../lib/i18n'

type Period = 'month' | 'all' | 'custom'

const TYPE_TABS: Array<{ value: TxType | 'all'; label: string }> = [
  { value: 'all', label: tt('Tümü') },
  { value: 'expense', label: tt('Gider') },
  { value: 'income', label: tt('Gelir') },
  { value: 'refund', label: tt('İade') },
  { value: 'transfer', label: tt('Transfer') },
]

export default function TransactionsPage() {
  // "Tümü" kişiseldir (src/domain/personal.ts); bir grup seçilince grubun bütün işlemleri görünür
  const personal = usePersonalTransactions()
  const categories = useCategories()
  const catMap = useCategoryMap()
  const imports = useImports()
  const repo = useRepo()
  const groups = useGroups()
  const groupMap = useGroupMap()
  const [groupFilter, setGroupFilter] = useGroupFilter()
  const memberFilter = useMemberFilter()
  const person = groupFilter ? memberFilter : { ...memberFilter, value: '', options: [] }
  const txs = groupFilter ? personal?.all : personal?.list
  const { month, setMonth, openTransactionForm, openImport, toast } = useUi()
  const { startDay } = useCycle()
  const [params, setParams] = useSearchParams()

  const [query, setQuery] = useState('')
  const [period, setPeriod] = useState<Period>('month')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [category, setCategory] = useState(params.get('kategori') ?? '')
  const [type, setType] = useState<TxType | ''>('')
  const [payment, setPayment] = useState<PaymentMethod | ''>('')
  const [source, setSource] = useState<TxSource | ''>('')
  const [importId, setImportId] = useState(params.get('aktarim') ?? '')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkCatOpen, setBulkCatOpen] = useState(false)
  const [bulkCat, setBulkCat] = useState('')
  const [bulkGroupOpen, setBulkGroupOpen] = useState(false)
  const [bulkGroup, setBulkGroup] = useState('')
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  // URL'den gelen filtreler (panelden kategoriye tıklama, aktarım geçmişi)
  useEffect(() => {
    const ay = params.get('ay')
    if (ay && /^\d{4}-\d{2}$/.test(ay)) {
      setMonth(ay)
      setPeriod('month')
    }
    if (params.get('aktarim')) setPeriod('all')
  }, [params, setMonth])

  const filtered = useMemo(() => {
    if (!txs) return []
    const q = normalizeText(query)
    const range = period === 'month' ? periodRange(month, startDay) : period === 'custom' ? { start: from || '0000-01-01', end: to || '9999-12-31' } : null
    // Hafta sonu erken yatan maaş, sayıldığı dönemde (maaş gününün dönemi) listelenir
    const moved = period === 'month' && !groupFilter ? personal?.moved : undefined
    return txs.filter((t) => {
      const d = moved?.get(t.id) ?? t.date
      if (range && (d < range.start || d > range.end)) return false
      if (category === 'none' ? t.categoryId !== null : category && t.categoryId !== category) return false
      if (!matchesGroup(t, groupFilter)) return false
      if (!matchesMember(t, person.value, person.selfId)) return false
      if (type && t.type !== type) return false
      if (payment && t.paymentMethod !== payment) return false
      if (source && t.source !== source) return false
      if (importId && t.importId !== importId) return false
      if (q && !t.normalizedDescription.includes(q) && !normalizeText(t.note ?? '').includes(q)) return false
      return true
    })
  }, [txs, query, period, month, from, to, category, groupFilter, person.value, person.selfId, type, payment, source, importId, startDay, personal])

  // Görünmeyen seçimleri temizle
  useEffect(() => {
    setSelected((s) => {
      const ids = new Set(filtered.map((t) => t.id))
      const next = new Set([...s].filter((id) => ids.has(id)))
      return next.size === s.size ? s : next
    })
  }, [filtered])

  const totals = useMemo(() => {
    let e = 0
    let r = 0
    let inc = 0
    for (const t of filtered) {
      // Tümü'de üyelerin ortak giderleri listede görünür ama toplama girmez
      if (!groupFilter && !isCounted(t)) continue
      if (t.type === 'expense') e += t.amountKurus
      else if (t.type === 'refund') r += t.amountKurus
      else if (t.type === 'income') inc += t.amountKurus
    }
    return { e, r, inc }
  }, [filtered, groupFilter])

  // Tür, sayfadaki sekmelerle seçilir; filtre sayısına yalnızca penceredeki seçimler girer
  const activeFilterCount = [category, groupFilter, person.value, payment, source, importId, period !== 'month' ? 'x' : ''].filter(Boolean).length

  const clearFilters = () => {
    setCategory('')
    setGroupFilter('')
    person.set('')
    setType('')
    setPayment('')
    setSource('')
    setImportId('')
    setQuery('')
    setPeriod('month')
    setParams({})
  }

  const deleteWithUndo = async (ids: string[]) => {
    setBusy(true)
    try {
      const removed = await repo.deleteTransactions(ids)
      setSelected(new Set())
      const skipped = ids.length - removed.length
      if (!removed.length) {
        toast(tt('Seçilenler grup üyelerinin harcamaları; yalnızca ekleyen silebilir.'), { kind: 'info' })
        return
      }
      toast((ids.length === 1 ? 'İşlem silindi.' : `${removed.length} işlem silindi.`) + (skipped ? ` Üyelerin eklediği ${skipped} işlem atlandı.` : ''), {
        action: {
          label: tt('Geri al'),
          onClick: async () => {
            try {
              await repo.restoreTransactions(removed)
              toast(tt('Silme geri alındı.'), { kind: 'info' })
            } catch (e) {
              toast(toUserMessage(e), { kind: 'error' })
            }
          },
        },
      })
    } catch (e) {
      toast(toUserMessage(e), { kind: 'error' })
    } finally {
      setBusy(false)
      setConfirmBulkDelete(false)
    }
  }

  const applyBulkCategory = async () => {
    if (!bulkCat) return
    setBusy(true)
    try {
      const n = await repo.bulkSetCategory([...selected], bulkCat)
      toast(`${n} işlemin kategorisi “${catMap.get(bulkCat)?.name}” yapıldı.` + skippedNote(selected.size - n))
      setSelected(new Set())
      setBulkCatOpen(false)
    } catch (e) {
      toast(toUserMessage(e), { kind: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const applyBulkGroup = async () => {
    setBusy(true)
    try {
      const n = await repo.bulkSetGroup([...selected], bulkGroup || null)
      toast((bulkGroup ? `${n} işlem “${groupMap.get(bulkGroup)?.name}” grubuna alındı.` : `${n} işlemin grubu kaldırıldı.`) + skippedNote(selected.size - n))
      setSelected(new Set())
      setBulkGroupOpen(false)
    } catch (e) {
      toast(toUserMessage(e), { kind: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const exportCsv = () => {
    const csv = transactionsToCsv(filtered, catMap, groupMap)
    const name = period === 'month' ? month : period === 'all' ? 'tum-kayitlar' : `${from || 'bas'}_${to || 'son'}`
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${APP_CONFIG.slug}-islemler-${name}.csv`)
    toast(ttf('{0} işlem CSV olarak indirildi.', filtered.length))
  }

  const importName = importId ? imports?.find((i) => i.id === importId)?.fileName : undefined
  const activeCats = (categories ?? []).filter((c) => !c.archived)

  const filterFields = (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Field label={tt('Dönem')} htmlFor="f-period">
        <Select id="f-period" value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
          <option value="month">{ttf('Seçili ay ({0})', periodLabel(month, startDay))}</option>
          <option value="all">{tt('Tüm tarihler')}</option>
          <option value="custom">{tt('Tarih aralığı')}</option>
        </Select>
      </Field>
      {period === 'custom' && (
        <>
          <Field label={tt('Başlangıç')} htmlFor="f-from">
            <Input id="f-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label={tt('Bitiş')} htmlFor="f-to">
            <Input id="f-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </>
      )}
      <Field label={tt('Kategori')} htmlFor="f-cat">
        <Select id="f-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">{tt('Tümü')}</option>
          <option value="none">{tt('Kategorisiz')}</option>
          {(categories ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.archived ? tt(' (arşivde)') : ''}
            </option>
          ))}
        </Select>
      </Field>
      {(groups ?? []).length > 0 && (
        <Field label={tt('Harcama grubu')} htmlFor="f-group">
          <Select id="f-group" value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
            <option value="">{tt('Tümü')}</option>
            <option value="none">{tt('Grupsuz')}</option>
            {(groups ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
                {g.archived ? tt(' (arşivde)') : ''}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {person.options.length > 0 && (
        <Field label={tt('Ekleyen kişi')} htmlFor="f-person">
          <Select id="f-person" value={person.value} onChange={(e) => person.set(e.target.value)}>
            <option value="">{tt('Herkes')}</option>
            {person.options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label={tt('Ödeme aracı')} htmlFor="f-pay">
        <Select id="f-pay" value={payment} onChange={(e) => setPayment(e.target.value as PaymentMethod | '')}>
          <option value="">{tt('Tümü')}</option>
          {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((p) => (
            <option key={p} value={p}>
              {PAYMENT_LABEL[p]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={tt('Kaynak')} htmlFor="f-src">
        <Select id="f-src" value={source} onChange={(e) => setSource(e.target.value as TxSource | '')}>
          <option value="">{tt('Tümü')}</option>
          {(Object.keys(SOURCE_LABEL) as TxSource[]).map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABEL[s]}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  )

  return (
    <div>
      <PageHeader
        title={tt('İşlemler')}
        actions={
          <>
            {period === 'month' && <MonthSwitcher month={month} onChange={setMonth} className="max-sm:flex-1" />}
            <Button variant="primary" className="max-lg:hidden" icon={<Plus className="size-4" />} onClick={() => openTransactionForm()}>
              {tt('Gider ekle')}
            </Button>
          </>
        }
      />

      <FilterStrip
        groups={(groups ?? []).filter((g) => !g.archived || g.id === groupFilter)}
        group={groupFilter}
        onGroup={setGroupFilter}
        persons={person.options}
        person={person.value}
        onPerson={person.set}
        className="mb-3"
      />

      <div className="mb-3 flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
          <Input aria-label={tt('Açıklama veya notta ara')} placeholder={tt('Ara: iş yeri, açıklama, not…')} value={query} onChange={(e) => setQuery(e.target.value)} className="rounded-2xl pl-10" type="search" />
        </div>
        <Button className="shrink-0 rounded-2xl" icon={<SlidersHorizontal className="size-4" />} onClick={() => setFiltersOpen(true)} aria-label={`Filtreler${activeFilterCount ? ttf(', {0} etkin', activeFilterCount) : ''}`}>
          <span className="max-sm:sr-only">{tt('Filtreler')}</span>
          {activeFilterCount ? <span className="num rounded-full bg-accent px-1.5 text-[11px] text-white">{activeFilterCount}</span> : null}
        </Button>
      </div>

      <Segmented
        label={tt('İşlem türü')}
        value={type || 'all'}
        onChange={(v) => setType(v === 'all' ? '' : v)}
        options={TYPE_TABS}
        className="no-scrollbar mb-3 flex w-full overflow-x-auto [&>button]:min-w-fit [&>button]:px-3"
      />

      {(activeFilterCount > 0 || query) && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
          {importName && <span className="rounded-full bg-info-soft px-2.5 py-1 text-info">{ttf('Aktarım: {0}', importName)}</span>}
          {period !== 'month' && <span className="rounded-full bg-surface-2 px-2.5 py-1 text-muted">{period === 'all' ? tt('Tüm tarihler') : tt('Tarih aralığı')}</span>}
          <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 rounded-full px-2 py-1 font-medium text-accent hover:bg-accent-soft">
            <X className="size-3.5" /> {tt('Filtreleri temizle')}
          </button>
        </div>
      )}

      <div className="mb-3 grid grid-cols-3 gap-2">
        <Stat label={tt('Gider')} value={formatKurus(totals.e - totals.r)} sub={totals.r > 0 ? ttf('iade −{0}', formatKurus(totals.r)) : undefined} />
        <Stat label={tt('Gelir')} value={formatKurus(totals.inc)} tone="up" />
        <Stat label={tt('İşlem')} value={String(filtered.length)} />
      </div>
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18 }}
            className="glass sticky top-16 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-line-strong px-3 py-2 shadow-float lg:top-4"
            role="region"
            aria-label={tt('Toplu işlemler')}
          >
            <span className="num px-1 text-sm font-semibold">{ttf('{0} seçili', selected.size)}</span>
            <div className="ml-auto flex gap-2">
              <Button size="sm" icon={<Tags className="size-4" />} onClick={() => setBulkCatOpen(true)}>
                {tt('Kategori değiştir')}
              </Button>
              {(groups ?? []).length > 0 && (
                <Button
                  size="sm"
                  icon={<Users className="size-4" />}
                  onClick={() => {
                    setBulkGroup('')
                    setBulkGroupOpen(true)
                  }}
                >
                  {tt('Grup ata')}
                </Button>
              )}
              <Button size="sm" variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setConfirmBulkDelete(true)}>
                {tt('Sil')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                {tt('Vazgeç')}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Card className="overflow-hidden">
        {!txs ? (
          <div className="space-y-3 p-4" aria-busy="true">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : txs.length === 0 ? (
          <EmptyState
            icon={<ListOrdered className="size-6" />}
            title={tt('Henüz işlem yok')}
            action={
              <>
                <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => openTransactionForm()}>
                  {tt('Gider ekle')}
                </Button>
                <Button icon={<FileUp className="size-4" />} onClick={() => openImport()}>
                  {tt('Dosya içe aktar')}
                </Button>
              </>
            }
          >
            {tt('İlk giderinizi ekleyin veya ekstre yükleyin.')}
          </EmptyState>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Search className="size-6" />} title={tt('Bu filtrelerle işlem bulunamadı')} action={<Button onClick={clearFilters}>{tt('Filtreleri temizle')}</Button>}>
            {period === 'month' ? tt('Dönemi “Tüm tarihler” yapmayı deneyin.') : tt('Arama veya filtreleri değiştirin.')}
          </EmptyState>
        ) : (
          <TransactionList
            transactions={filtered}
            markUncounted={!groupFilter}
            moved={groupFilter ? undefined : personal?.moved}
            categories={catMap}
            selectable
            selected={selected}
            onToggle={(id) =>
              setSelected((s) => {
                const n = new Set(s)
                if (n.has(id)) n.delete(id)
                else n.add(id)
                return n
              })
            }
            onToggleAll={(on) => setSelected(on ? new Set(filtered.slice(0, 500).map((t) => t.id)) : new Set())}
            onEdit={(t: Transaction) => openTransactionForm(t)}
            onDelete={(t) => deleteWithUndo([t.id])}
          />
        )}
      </Card>

      <Modal
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        title={tt('Filtreler')}
        size="lg"
        footer={
          <>
            <Button variant="ghost" className="mr-auto" icon={<Download className="size-4" />} onClick={exportCsv} disabled={!filtered.length}>
              {tt('CSV indir')}
            </Button>
            <Button variant="primary" onClick={() => setFiltersOpen(false)}>
              {ttf('Göster ({0})', filtered.length)}</Button>
          </>
        }
      >
        {filterFields}
        <button type="button" onClick={clearFilters} className="mt-4 text-sm font-medium text-accent">
          {tt('Filtreleri temizle')}
        </button>
      </Modal>

      <Modal
        open={bulkCatOpen}
        onOpenChange={setBulkCatOpen}
        title={tt('Toplu kategori değiştir')}
        description={ttf('{0} işlemin kategorisi değişecek.', selected.size)}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setBulkCatOpen(false)}>
              {tt('Vazgeç')}
            </Button>
            <Button variant="primary" onClick={applyBulkCategory} loading={busy} disabled={!bulkCat}>
              {tt('Uygula')}
            </Button>
          </>
        }
      >
        <Field label={tt('Yeni kategori')} htmlFor="bulk-cat">
          <Select id="bulk-cat" value={bulkCat} onChange={(e) => setBulkCat(e.target.value)}>
            <option value="">{tt('Seçin…')}</option>
            {activeCats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </Modal>

      <Modal
        open={bulkGroupOpen}
        onOpenChange={setBulkGroupOpen}
        title={tt('Toplu grup ata')}
        description={ttf('{0} işlemin grubu değişecek.', selected.size)}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setBulkGroupOpen(false)}>
              {tt('Vazgeç')}
            </Button>
            <Button variant="primary" onClick={applyBulkGroup} loading={busy}>
              {tt('Uygula')}
            </Button>
          </>
        }
      >
        <GroupPicker groups={(groups ?? []).filter((g) => !g.archived)} value={bulkGroup} onChange={setBulkGroup} label={tt('Yeni grup')} />
      </Modal>

      <ConfirmDialog
        open={confirmBulkDelete}
        onOpenChange={setConfirmBulkDelete}
        title={ttf('{0} işlem silinsin mi?', selected.size)}
        confirmLabel={tt('Sil')}
        danger
        loading={busy}
        onConfirm={() => deleteWithUndo([...selected])}
      >
        {tt('Seçili işlemler silinecek. Hemen ardından çıkan bildirimdeki “Geri al” ile kurtarabilirsiniz.')}
      </ConfirmDialog>
    </div>
  )
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'up' }) {
  return (
    <div role="group" aria-label={label} className="min-w-0 rounded-2xl border border-line bg-surface px-3 py-2.5 shadow-card">
      <div className="text-[11.5px] font-medium text-subtle">{label}</div>
      <div className={cn('num truncate text-[15px] font-semibold', tone === 'up' ? 'text-accent' : 'text-ink')}>{value}</div>
      {sub && <div className="num truncate text-[11px] text-subtle">{sub}</div>}
    </div>
  )
}

function skippedNote(n: number): string {
  return n > 0 ? ttf(' Üyelerin eklediği {0} işlem değiştirilmedi.', n) : ''
}
