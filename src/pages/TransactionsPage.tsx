import { Download, FileUp, Filter, ListOrdered, Plus, Search, Tags, Trash2, Users, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/AppShell'
import { FilterStrip, GroupPicker, matchesGroup, matchesMember, MonthSwitcher } from '../components/common'
import { TransactionList } from '../components/TransactionList'
import { ConfirmDialog, Modal } from '../components/ui/Modal'
import { Button, Card, EmptyState, Field, Input, Select, Skeleton } from '../components/ui/primitives'
import { toUserMessage } from '../data/repository'
import { periodLabel, periodRange } from '../domain/dates'
import { formatKurus } from '../domain/money'
import { normalizeText } from '../domain/normalize'
import { PAYMENT_LABEL, SOURCE_LABEL, TX_TYPE_LABEL, type PaymentMethod, type Transaction, type TxSource, type TxType } from '../domain/types'
import { downloadBlob } from '../lib/download'
import { transactionsToCsv } from '../lib/csvExport'
import { APP_CONFIG } from '../config/app'
import { useMemberFilter } from '../state/cloud'
import { useCategories, useCategoryMap, useGroupFilter, useGroupMap, useGroups, useImports, useRepo, useTransactions } from '../state/data'
import { useCycle } from '../state/cycle'
import { useUi } from '../state/ui'

type Period = 'month' | 'all' | 'custom'

export default function TransactionsPage() {
  const txs = useTransactions()
  const categories = useCategories()
  const catMap = useCategoryMap()
  const imports = useImports()
  const repo = useRepo()
  const groups = useGroups()
  const groupMap = useGroupMap()
  const [groupFilter, setGroupFilter] = useGroupFilter()
  const person = useMemberFilter()
  const { month, setMonth, openTransactionForm, toast } = useUi()
  const { startDay } = useCycle()
  const navigate = useNavigate()
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
    return txs.filter((t) => {
      if (range && (t.date < range.start || t.date > range.end)) return false
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
  }, [txs, query, period, month, from, to, category, groupFilter, person.value, person.selfId, type, payment, source, importId, startDay])

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
    for (const t of filtered) {
      if (t.type === 'expense') e += t.amountKurus
      else if (t.type === 'refund') r += t.amountKurus
    }
    return { e, r }
  }, [filtered])

  const activeFilterCount = [category, groupFilter, person.value, type, payment, source, importId, period === 'custom' ? 'x' : ''].filter(Boolean).length

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
        toast('Seçilenler grup üyelerinin harcamaları; yalnızca ekleyen silebilir.', { kind: 'info' })
        return
      }
      toast((ids.length === 1 ? 'İşlem silindi.' : `${removed.length} işlem silindi.`) + (skipped ? ` Üyelerin eklediği ${skipped} işlem atlandı.` : ''), {
        action: {
          label: 'Geri al',
          onClick: async () => {
            try {
              await repo.restoreTransactions(removed)
              toast('Silme geri alındı.', { kind: 'info' })
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
    toast(`${filtered.length} işlem CSV olarak indirildi.`)
  }

  const importName = importId ? imports?.find((i) => i.id === importId)?.fileName : undefined
  const activeCats = (categories ?? []).filter((c) => !c.archived)

  const filterFields = (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Dönem" htmlFor="f-period">
        <Select id="f-period" value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
          <option value="month">Seçili ay ({periodLabel(month, startDay)})</option>
          <option value="all">Tüm tarihler</option>
          <option value="custom">Tarih aralığı</option>
        </Select>
      </Field>
      {period === 'custom' && (
        <>
          <Field label="Başlangıç" htmlFor="f-from">
            <Input id="f-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="Bitiş" htmlFor="f-to">
            <Input id="f-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </>
      )}
      <Field label="Kategori" htmlFor="f-cat">
        <Select id="f-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Tümü</option>
          <option value="none">Kategorisiz</option>
          {(categories ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.archived ? ' (arşivde)' : ''}
            </option>
          ))}
        </Select>
      </Field>
      {(groups ?? []).length > 0 && (
        <Field label="Harcama grubu" htmlFor="f-group">
          <Select id="f-group" value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
            <option value="">Tümü</option>
            <option value="none">Grupsuz</option>
            {(groups ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
                {g.archived ? ' (arşivde)' : ''}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {person.options.length > 0 && (
        <Field label="Ekleyen kişi" htmlFor="f-person">
          <Select id="f-person" value={person.value} onChange={(e) => person.set(e.target.value)}>
            <option value="">Herkes</option>
            {person.options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="İşlem türü" htmlFor="f-type">
        <Select id="f-type" value={type} onChange={(e) => setType(e.target.value as TxType | '')}>
          <option value="">Tümü</option>
          {(Object.keys(TX_TYPE_LABEL) as TxType[]).map((t) => (
            <option key={t} value={t}>
              {TX_TYPE_LABEL[t]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Ödeme aracı" htmlFor="f-pay">
        <Select id="f-pay" value={payment} onChange={(e) => setPayment(e.target.value as PaymentMethod | '')}>
          <option value="">Tümü</option>
          {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((p) => (
            <option key={p} value={p}>
              {PAYMENT_LABEL[p]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Kaynak" htmlFor="f-src">
        <Select id="f-src" value={source} onChange={(e) => setSource(e.target.value as TxSource | '')}>
          <option value="">Tümü</option>
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
        title="İşlemler"
        subtitle="Arayın, filtreleyin, düzenleyin. Silinen kayıtlar birkaç saniye içinde geri alınabilir."
        actions={
          <>
            {period === 'month' && <MonthSwitcher month={month} onChange={setMonth} className="max-sm:flex-1" />}
            <Button icon={<Download className="size-4" />} onClick={exportCsv} disabled={!filtered.length} className="max-sm:w-10 max-sm:px-0" title="CSV olarak indir">
              <span className="max-sm:sr-only">CSV</span>
            </Button>
            <Button variant="primary" className="max-lg:hidden" icon={<Plus className="size-4" />} onClick={() => openTransactionForm()}>
              Gider ekle
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

      <Card className="mb-4 p-3 sm:p-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
            <Input aria-label="Açıklama veya notta ara" placeholder="Ara: iş yeri, açıklama, not…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" type="search" />
          </div>
          <Button className="lg:hidden" icon={<Filter className="size-4" />} onClick={() => setFiltersOpen(true)} aria-label={`Filtreler${activeFilterCount ? `, ${activeFilterCount} etkin` : ''}`}>
            {activeFilterCount ? <span className="num rounded-full bg-accent px-1.5 text-[11px] text-white">{activeFilterCount}</span> : null}
          </Button>
        </div>
        <div className="mt-3 hidden lg:block">{filterFields}</div>
        {(activeFilterCount > 0 || query) && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
            {importName && <span className="rounded-full bg-info-soft px-2.5 py-1 text-info">Aktarım: {importName}</span>}
            <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 rounded-full px-2 py-1 font-medium text-accent hover:bg-accent-soft">
              <X className="size-3.5" /> Filtreleri temizle
            </button>
          </div>
        )}
      </Card>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1 text-[13px] text-muted">
        <span className="num">
          {filtered.length} işlem · Gider {formatKurus(totals.e)}
          {totals.r > 0 && <> · İade {formatKurus(totals.r)}</>} · Net {formatKurus(totals.e - totals.r)}
        </span>
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
            aria-label="Toplu işlemler"
          >
            <span className="num px-1 text-sm font-semibold">{selected.size} seçili</span>
            <div className="ml-auto flex gap-2">
              <Button size="sm" icon={<Tags className="size-4" />} onClick={() => setBulkCatOpen(true)}>
                Kategori değiştir
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
                  Grup ata
                </Button>
              )}
              <Button size="sm" variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setConfirmBulkDelete(true)}>
                Sil
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Vazgeç
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
            title="Henüz işlem yok"
            action={
              <>
                <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => openTransactionForm()}>
                  Gider ekle
                </Button>
                <Button icon={<FileUp className="size-4" />} onClick={() => navigate('/ice-aktar')}>
                  Dosya içe aktar
                </Button>
              </>
            }
          >
            İlk giderinizi ekleyin veya bir ekstre dosyası yükleyin.
          </EmptyState>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Search className="size-6" />} title="Bu filtrelerle işlem bulunamadı" action={<Button onClick={clearFilters}>Filtreleri temizle</Button>}>
            {period === 'month' ? `${periodLabel(month, startDay)} içinde eşleşen kayıt yok. Dönemi “Tüm tarihler” yapmayı deneyin.` : 'Arama veya filtreleri değiştirin.'}
          </EmptyState>
        ) : (
          <TransactionList
            transactions={filtered}
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

      <Modal open={filtersOpen} onOpenChange={setFiltersOpen} title="Filtreler" footer={<Button variant="primary" onClick={() => setFiltersOpen(false)}>Göster ({filtered.length})</Button>}>
        {filterFields}
        <button type="button" onClick={clearFilters} className="mt-4 text-sm font-medium text-accent">
          Filtreleri temizle
        </button>
      </Modal>

      <Modal
        open={bulkCatOpen}
        onOpenChange={setBulkCatOpen}
        title="Toplu kategori değiştir"
        description={`${selected.size} işlemin kategorisi değişecek. Bu seçim manuel sayılır; kurallar sonradan ezmez.`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setBulkCatOpen(false)}>
              Vazgeç
            </Button>
            <Button variant="primary" onClick={applyBulkCategory} loading={busy} disabled={!bulkCat}>
              Uygula
            </Button>
          </>
        }
      >
        <Field label="Yeni kategori" htmlFor="bulk-cat">
          <Select id="bulk-cat" value={bulkCat} onChange={(e) => setBulkCat(e.target.value)}>
            <option value="">Seçin…</option>
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
        title="Toplu grup ata"
        description={`${selected.size} işlemin grubu değişecek.`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setBulkGroupOpen(false)}>
              Vazgeç
            </Button>
            <Button variant="primary" onClick={applyBulkGroup} loading={busy}>
              Uygula
            </Button>
          </>
        }
      >
        <GroupPicker groups={(groups ?? []).filter((g) => !g.archived)} value={bulkGroup} onChange={setBulkGroup} label="Yeni grup" />
      </Modal>

      <ConfirmDialog
        open={confirmBulkDelete}
        onOpenChange={setConfirmBulkDelete}
        title={`${selected.size} işlem silinsin mi?`}
        confirmLabel="Sil"
        danger
        loading={busy}
        onConfirm={() => deleteWithUndo([...selected])}
      >
        Seçili işlemler silinecek. Hemen ardından çıkan bildirimdeki “Geri al” ile kurtarabilirsiniz.
      </ConfirmDialog>
    </div>
  )
}

function skippedNote(n: number): string {
  return n > 0 ? ` Üyelerin eklediği ${n} işlem değiştirilmedi.` : ''
}
