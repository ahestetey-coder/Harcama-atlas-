import { AlertTriangle, CircleCheck, Copy, FileText, Info, Plus, SkipForward, Split, Trash2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { CategoryIcon } from '../../components/common'
import { ConfirmDialog, Modal } from '../../components/ui/Modal'
import { Alert, Badge, Button, Card, Checkbox, Input, Select } from '../../components/ui/primitives'
import { OTHER_CATEGORY_ID } from '../../data/seed'
import { formatDate, todayIso } from '../../domain/dates'
import { formatKurus, formatKurusPlain, parseAmount } from '../../domain/money'
import { SOURCE_LABEL, TX_TYPE_LABEL, type Category, type Transaction, type TxType } from '../../domain/types'
import { applyRules, confirmOther, markDuplicates, reviewCounts, rowProblems, rowStatus, suggestLearnPattern } from '../../import/enrich'
import { newDraftId } from '../../import/mapping'
import type { DocLine, DraftRow, RowStatus } from '../../import/types'
import { cn } from '../../lib/cn'
import { useCategories, useRules, useTransactions } from '../../state/data'
import { useUi } from '../../state/ui'
import type { ReviewData } from './useImportFlow'

const PAGE = 40
type Tab = 'all' | RowStatus

const STATUS_META: Record<RowStatus, { label: string; tone: 'accent' | 'danger' | 'warning' | 'neutral' }> = {
  valid: { label: 'Geçerli', tone: 'accent' },
  problem: { label: 'Sorunlu', tone: 'danger' },
  duplicate: { label: 'Tekrar şüphesi', tone: 'warning' },
  excluded: { label: 'Hariç', tone: 'neutral' },
}

export function ReviewStep({
  review,
  onRowsChange,
  onSave,
  onCancel,
  saving,
  accountAlias,
}: {
  review: ReviewData
  onRowsChange: (rows: DraftRow[]) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
  accountAlias: string
}) {
  const cats = useCategories()
  const rls = useRules()
  const txs = useTransactions()
  const categories = useMemo(() => cats ?? [], [cats])
  const rules = useMemo(() => rls ?? [], [rls])
  const existing = useMemo(() => txs ?? [], [txs])
  const [tab, setTab] = useState<Tab>('all')
  const [page, setPage] = useState(0)
  const [focusLine, setFocusLine] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [sourceOpen, setSourceOpen] = useState(false)
  const [flashId, setFlashId] = useState<string | null>(null)
  const rows = review.rows

  const activeIds = useMemo(() => new Set(categories.filter((c) => !c.archived).map((c) => c.id)), [categories])
  const counts = useMemo(() => reviewCounts(rows, activeIds), [rows, activeIds])
  const existingById = useMemo(() => new Map(existing.map((t) => [t.id, t])), [existing])
  const visible = useMemo(() => (tab === 'all' ? rows : rows.filter((r) => rowStatus(r, activeIds) === tab)), [rows, tab, activeIds])
  const pages = Math.max(1, Math.ceil(visible.length / PAGE))
  const shown = visible.slice(page * PAGE, page * PAGE + PAGE)
  const missingCat = rows.filter((r) => r.include && r.type === 'expense' && !r.categoryId && r.duplicateDecision !== 'skip').length
  const undecided = rows.filter((r) => rowStatus(r, activeIds) === 'duplicate').length

  useEffect(() => {
    if (page >= pages) setPage(pages - 1)
  }, [page, pages])

  // Silinen satırı geri almak için güncel satırlar ve geri çağrı
  const { toast } = useUi()
  const latest = useRef({ rows, onRowsChange })
  useEffect(() => {
    latest.current = { rows, onRowsChange }
  })
  const removeRow = (r: DraftRow) => {
    const index = rows.findIndex((x) => x.id === r.id)
    onRowsChange(rows.filter((x) => x.id !== r.id))
    toast('Satır silindi; kaydedilmeyecek.', {
      kind: 'info',
      action: {
        label: 'Geri al',
        onClick: () => {
          const cur = latest.current.rows
          if (cur.some((x) => x.id === r.id)) return
          const next = [...cur]
          next.splice(Math.min(index, next.length), 0, r)
          latest.current.onRowsChange(next)
        },
      },
    })
  }

  const updateRow = (id: string, patch: Partial<DraftRow>) => {
    const next = rows.map((r) => {
      if (r.id !== id) return r
      let n: DraftRow = { ...r, ...patch }
      if ('description' in patch && n.categorySource !== 'manual' && n.categorySource !== 'confirmed-other') n = applyRules([n], rules, categories)[0]
      if ('date' in patch || 'amountKurus' in patch || 'type' in patch || 'description' in patch)
        n = { ...markDuplicates([n], existing, accountAlias || undefined)[0], duplicateDecision: patch.duplicateDecision ?? (n.duplicateOf ? r.duplicateDecision ?? null : undefined) }
      return n
    })
    onRowsChange(next)
    setFlashId(id)
  }

  const addRow = (fromLine?: DocLine) => {
    const row: DraftRow = {
      id: newDraftId(),
      include: true,
      date: fromLine ? null : todayIso(),
      dateRaw: '',
      description: fromLine ? fromLine.text.slice(0, 120) : '',
      amountKurus: null,
      amountRaw: '',
      type: 'expense',
      categoryId: null,
      currency: 'TRY',
      source: fromLine ? { kind: fromLine.origin === 'ocr' ? 'ocr-line' : 'pdf-line', page: fromLine.page, line: fromLine.index + 1, text: fromLine.text } : { kind: 'manual-row', text: 'Elle eklenen satır' },
      notes: fromLine ? ['Tanınmayan satırdan oluşturuldu; alanları kontrol edin.'] : [],
    }
    onRowsChange([...rows, row])
    setTab('all')
    setPage(Math.floor(rows.length / PAGE))
    setFlashId(row.id)
    setSourceOpen(false)
  }

  const confirmAllOther = () => onRowsChange(rows.map((r) => (r.include && r.type === 'expense' && !r.categoryId ? confirmOther(r) : r)))
  const skipAllDuplicates = () => onRowsChange(rows.map((r) => (r.duplicateOf?.length && !r.duplicateDecision ? { ...r, duplicateDecision: 'skip' } : r)))

  const extractedNet = counts.expenseKurus - counts.refundKurus
  const sourceKey = (r: DraftRow) => (r.source.page !== undefined || r.source.line !== undefined ? `${r.source.page ?? 0}:${r.source.line ?? 0}` : null)

  return (
    <div className="flex flex-col gap-4">
      {/* Durum sekmeleri */}
      <Card className="p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Satır durumu">
          {(['all', 'valid', 'problem', 'duplicate', 'excluded'] as Tab[]).map((t) => {
            const n = t === 'all' ? counts.total : counts[t]
            const meta = t === 'all' ? { label: 'Tümü', tone: 'neutral' as const } : STATUS_META[t]
            return (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => {
                  setTab(t)
                  setPage(0)
                }}
                className={cn(
                  'inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-[13px] font-medium transition-colors',
                  tab === t ? 'border-line-strong bg-surface text-ink shadow-card' : 'border-transparent text-muted hover:bg-surface-2',
                )}
              >
                {meta.label}
                <span
                  className={cn(
                    'num rounded-full px-1.5 text-[11.5px] leading-5',
                    t === 'valid' && 'bg-accent-soft text-accent-strong dark:text-accent',
                    t === 'problem' && 'bg-danger-soft text-danger',
                    t === 'duplicate' && 'bg-warning-soft text-warning',
                    (t === 'all' || t === 'excluded') && 'bg-surface-2 text-muted',
                  )}
                >
                  {n}
                </span>
              </button>
            )
          })}
          <div className="ml-auto flex flex-wrap gap-2">
            {(review.lines.length > 0 || review.sheet) && (
              <Button size="sm" icon={<FileText className="size-4" />} onClick={() => setSourceOpen(true)} className="xl:hidden">
                Kaynak metin
              </Button>
            )}
            <Button size="sm" icon={<Plus className="size-4" />} onClick={() => addRow()}>
              Satır ekle
            </Button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3 text-[13px] sm:grid-cols-4">
          <Stat label="Kaydedilecek gider" value={formatKurus(counts.expenseKurus)} />
          <Stat label="Kaydedilecek iade" value={formatKurus(counts.refundKurus)} />
          <Stat label="Net etki" value={formatKurus(extractedNet)} />
          <Stat label="Transfer (gidere dahil değil)" value={formatKurus(counts.transferKurus)} />
        </div>
      </Card>

      {/* Bilgi ve uyarılar */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Alert tone={review.parserVerified ? 'info' : 'warning'} icon={<Info />} title={review.parserLabel}>
          {review.parserVerified
            ? 'Satırlar seçtiğiniz sütun eşleştirmesine göre oluşturuldu.'
            : 'Bu okuyucu belirli bir bankanın gerçek ekstresiyle doğrulanmadı. Her satırı kaynak metinle karşılaştırarak onaylayın.'}
          {review.periodText && <span className="mt-1 block">Ekstre bilgisi: {review.periodText}. Rapor, işlem tarihlerine göre aylara dağılır.</span>}
        </Alert>
        {review.usedOcr && (
          <Alert tone="info" icon={<Info />} title="OCR okuma kalitesi">
            Ortalama kelime güveni: %{review.ocrConfidence ?? '—'} (Tesseract’ın kendi ölçüsü). Bu, satırların doğru ayrıştırıldığı anlamına gelmez; ayrıştırma sonucu yukarıdaki sayılardır.
          </Alert>
        )}
        {review.totals.map((t, i) => {
          const diff = extractedNet - t.amountKurus
          return (
            <Alert key={i} tone={diff === 0 ? 'accent' : 'warning'} icon={diff === 0 ? <CircleCheck /> : <AlertTriangle />} title="Kaynak toplamıyla kontrol">
              Belgedeki “{t.label || 'işlem toplamı'}”: {formatKurus(t.amountKurus)}. Kaydedilecek gider − iade: {formatKurus(extractedNet)}.{' '}
              {diff === 0 ? 'Tutarlar eşleşiyor.' : `Fark ${formatKurus(Math.abs(diff))}: sorunlu, hariç veya taksit/döviz satırlarını kontrol edin. Dönem borcu işlem toplamı değildir.`}
            </Alert>
          )
        })}
        {review.notes.map((n) => (
          <Alert key={n} tone="info" icon={<Info />}>
            {n}
          </Alert>
        ))}
      </div>

      {(missingCat > 0 || undecided > 0) && (
        <div className="flex flex-wrap gap-2">
          {missingCat > 0 && (
            <Button size="sm" variant="soft" onClick={confirmAllOther}>
              Kategorisi eksik {missingCat} satırı “Diğer” olarak onayla
            </Button>
          )}
          {undecided > 0 && (
            <Button size="sm" variant="soft" icon={<SkipForward className="size-4" />} onClick={skipAllDuplicates}>
              Kararsız {undecided} tekrar şüphesini atla
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-2.5">
          {shown.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted">
              {rows.length === 0 ? 'Dosyadan işlem çıkarılamadı. Kaynak metne bakıp satırları elle ekleyebilirsiniz.' : 'Bu sekmede satır yok.'}
            </Card>
          ) : (
            <AnimatePresence initial={false}>
              {shown.map((r) => (
                <RowCard
                  key={r.id}
                  row={r}
                  status={rowStatus(r, activeIds)}
                  categories={categories}
                  activeIds={activeIds}
                  existing={existingById}
                  onChange={updateRow}
                  onRemove={() => removeRow(r)}
                  onShowSource={() => {
                    const k = sourceKey(r)
                    if (k) {
                      setFocusLine(k)
                      if (!window.matchMedia('(min-width: 1280px)').matches) setSourceOpen(true)
                    }
                  }}
                  flash={flashId === r.id}
                />
              ))}
            </AnimatePresence>
          )}
          {pages > 1 && (
            <div className="flex items-center justify-center gap-2 py-2">
              <Button size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Önceki
              </Button>
              <span className="num text-sm text-muted">
                {page + 1} / {pages}
              </span>
              <Button size="sm" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
                Sonraki
              </Button>
            </div>
          )}
        </div>
        <div className="hidden xl:block">
          <div className="sticky top-4">
            <SourcePanel review={review} focus={focusLine} onCreate={addRow} />
          </div>
        </div>
      </div>

      {/* Kaydet çubuğu */}
      <div className="glass sticky bottom-20 z-20 flex flex-wrap items-center gap-3 rounded-2xl border border-line-strong px-4 py-3 shadow-float lg:bottom-4">
        <p className="min-w-0 flex-1 text-[13px] text-muted">
          <span className="font-semibold text-ink">{counts.valid} işlem</span> kaydedilecek.
          {counts.problem + counts.duplicate > 0 && <> {counts.problem + counts.duplicate} satır düzeltilmeden kaydedilmez.</>}
        </p>
        <Button variant="ghost" onClick={onCancel}>
          İptal
        </Button>
        <Button variant="primary" disabled={counts.valid === 0 || saving} loading={saving} onClick={() => setConfirmOpen(true)}>
          Onayla ve kaydet
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`${counts.valid} işlem kaydedilsin mi?`}
        confirmLabel="Kaydet"
        loading={saving}
        onConfirm={() => {
          setConfirmOpen(false)
          onSave()
        }}
      >
        <ul className="num space-y-1">
          <li>Gider: {formatKurus(counts.expenseKurus)}</li>
          <li>İade: {formatKurus(counts.refundKurus)}</li>
          <li>Kart ödemesi/transfer: {formatKurus(counts.transferKurus)} (gidere dahil edilmez)</li>
        </ul>
        {counts.problem + counts.duplicate + counts.excluded > 0 && (
          <p className="mt-3">
            Kaydedilmeyecek: {counts.problem} sorunlu, {counts.duplicate} kararsız tekrar şüphesi, {counts.excluded} hariç satır.
          </p>
        )}
        <p className="mt-3">Kayıt tek adımda yapılır; aktarım geçmişinden tümüyle geri alınabilir.</p>
      </ConfirmDialog>

      <Modal open={sourceOpen} onOpenChange={setSourceOpen} title="Kaynak metin" side size="lg">
        <SourcePanel review={review} focus={focusLine} onCreate={addRow} embedded />
      </Modal>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[11.5px] text-subtle">{label}</div>
      <div className="num truncate font-semibold text-ink">{value}</div>
    </div>
  )
}

const RowCard = memo(function RowCard({
  row: r,
  status,
  categories,
  activeIds,
  existing,
  onChange,
  onRemove,
  onShowSource,
  flash,
}: {
  row: DraftRow
  status: RowStatus
  categories: Category[]
  activeIds: Set<string>
  existing: Map<string, Transaction>
  onChange: (id: string, patch: Partial<DraftRow>) => void
  onRemove?: () => void
  onShowSource: () => void
  flash: boolean
}) {
  const [amountText, setAmountText] = useState(r.amountKurus !== null ? formatKurusPlain(r.amountKurus) : r.amountCandidates ? '' : r.amountRaw)
  const lastAmount = useRef(r.amountKurus)
  useEffect(() => {
    if (r.amountKurus !== lastAmount.current) {
      lastAmount.current = r.amountKurus
      if (r.amountKurus !== null) setAmountText(formatKurusPlain(r.amountKurus))
    }
  }, [r.amountKurus])
  const problems = rowProblems(r, activeIds)
  const has = (f: string) => problems.some((p) => p.field === f)
  const meta = STATUS_META[status]
  const cat = r.categoryId ? categories.find((c) => c.id === r.categoryId) : undefined
  const idp = `row-${r.id.slice(0, 8)}`

  const commitAmount = () => {
    if (!amountText.trim()) return onChange(r.id, { amountKurus: null })
    const p = parseAmount(amountText, 'tr')
    if (p.ok && p.kurus !== 0) {
      lastAmount.current = Math.abs(p.kurus)
      onChange(r.id, { amountKurus: Math.abs(p.kurus), amountCandidates: undefined })
      setAmountText(formatKurusPlain(Math.abs(p.kurus)))
    } else onChange(r.id, { amountKurus: null })
  }

  return (
    <motion.article
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.18 }}
      className={cn(
        'card overflow-hidden p-3.5 transition-[border-color,opacity] duration-200 sm:p-4',
        status === 'problem' && 'border-danger/35',
        status === 'duplicate' && 'border-warning/40',
        status === 'excluded' && 'opacity-60',
        flash && 'row-flash',
      )}
      aria-label={`${r.description || 'Açıklamasız satır'}, ${meta.label}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Checkbox label={<span className="text-[13px] font-medium">İçe aktar</span>} checked={r.include} onChange={(v) => onChange(r.id, { include: v })} />
        <Badge tone={meta.tone}>{meta.label}</Badge>
        {r.installment && (
          <Badge tone="info" className="num">
            Taksit {r.installment.current}/{r.installment.total || '?'}
            {r.installment.purchaseTotalKurus ? ` · toplam ${formatKurus(r.installment.purchaseTotalKurus)} (gidere eklenmez)` : ''}
          </Badge>
        )}
        {r.inFileDuplicate && <Badge tone="neutral">Dosyada aynı satır tekrar ediyor</Badge>}
        <button type="button" onClick={onShowSource} className="ml-auto inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[12px] text-subtle hover:bg-surface-2 hover:text-ink" title={r.source.text}>
          <FileText className="size-3.5" />
          {r.source.kind === 'manual-row' ? 'Elle eklendi' : r.source.kind === 'sheet-row' ? `Satır ${r.source.line}` : `s.${r.source.page} · satır ${r.source.line}`}
        </button>
        {onRemove && (
          <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={onRemove} aria-label="Satırı sil" className="hover:text-danger">
            Sil
          </Button>
        )}
      </div>
      <p className="num mt-1.5 truncate rounded-lg bg-surface-2 px-2 py-1 font-mono text-[11.5px] text-subtle" title={r.source.text}>
        {r.source.text}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-[140px_minmax(0,1fr)_140px] lg:grid-cols-[140px_minmax(0,1fr)_130px_150px_minmax(0,190px)]">
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-medium text-subtle">Tarih</span>
          <Input type="date" value={r.date ?? ''} onChange={(e) => onChange(r.id, { date: e.target.value || null })} aria-invalid={has('date')} className="h-9 px-2 text-[13px]" id={`${idp}-date`} />
        </label>
        <label className="col-span-2 flex flex-col gap-1 sm:col-span-1">
          <span className="text-[11.5px] font-medium text-subtle">Açıklama</span>
          <Input value={r.description} onChange={(e) => onChange(r.id, { description: e.target.value })} aria-invalid={has('description')} className="h-9 text-[13px]" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-medium text-subtle">Tutar (TL)</span>
          <Input
            inputMode="decimal"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            onBlur={commitAmount}
            onKeyDown={(e) => e.key === 'Enter' && commitAmount()}
            aria-invalid={has('amount') || has('currency')}
            placeholder={r.foreign ? 'TL karşılığı' : '0,00'}
            className="num h-9 text-right text-[13px] font-semibold"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-medium text-subtle">Tür</span>
          <Select value={r.type} onChange={(e) => onChange(r.id, { type: e.target.value as TxType })} className="h-9 text-[13px]">
            {(Object.keys(TX_TYPE_LABEL) as TxType[]).map((t) => (
              <option key={t} value={t}>
                {TX_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </label>
        <label className="col-span-2 flex flex-col gap-1 sm:col-span-3 lg:col-span-1">
          <span className="text-[11.5px] font-medium text-subtle">Kategori</span>
          <div className="flex items-center gap-1.5">
            <CategoryIcon category={cat} size="sm" />
            <Select
              value={r.categoryId ?? ''}
              onChange={(e) => {
                const v = e.target.value || null
                onChange(r.id, { categoryId: v, categorySource: v ? 'manual' : undefined, learnPattern: r.learnPattern ?? suggestLearnPattern(r.description) })
              }}
              aria-invalid={has('category')}
              className="h-9 text-[13px]"
            >
              <option value="">{r.type === 'expense' ? 'Kategori seçilmeli' : 'Kategori yok'}</option>
              {categories
                .filter((c) => !c.archived)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </div>
        </label>
      </div>

      {r.amountCandidates && r.amountKurus === null && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="text-warning">“{r.amountRaw}” hangisi?</span>
          {r.amountCandidates.map((c) => (
            <Button key={c} size="sm" variant="soft" onClick={() => onChange(r.id, { amountKurus: c, amountCandidates: undefined })}>
              {formatKurus(c)}
            </Button>
          ))}
        </div>
      )}

      {r.type === 'expense' && !r.categoryId && r.include && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="text-danger">Bu iş yeri tanınmadı; kategori tahmin edilmedi.</span>
          <Button size="sm" variant="soft" onClick={() => onChange(r.id, { categoryId: OTHER_CATEGORY_ID, categorySource: 'confirmed-other' })}>
            “Diğer” olarak onayla
          </Button>
        </div>
      )}

      {r.categorySource === 'manual' && r.categoryId && r.description.trim() && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <Checkbox label={<span className="text-[13px]">Bu iş yeri için sonraki işlemlerde de kullan</span>} checked={!!r.learn} onChange={(v) => onChange(r.id, { learn: v, learnPattern: r.learnPattern ?? suggestLearnPattern(r.description) })} />
          {r.learn && (
            <Input aria-label="Kural ifadesi" value={r.learnPattern ?? ''} onChange={(e) => onChange(r.id, { learnPattern: e.target.value })} className="h-8 w-48 text-[12.5px]" />
          )}
        </div>
      )}

      {(problems.length > 0 || r.notes.length > 0 || r.ruleNote || r.ruleConflict || r.excludedReason || r.foreign) && (
        <ul className="mt-2.5 space-y-1 text-[12.5px]">
          {problems.map((p) => (
            <li key={p.message} className="flex gap-1.5 text-danger">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {p.message}
            </li>
          ))}
          {r.excludedReason && !r.include && <li className="text-muted">Hariç: {r.excludedReason}</li>}
          {r.foreign && (
            <li className="num text-muted">
              Döviz: {(r.foreign.amountMinor / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {r.foreign.currency} — döviz tutarları TL ile toplanmaz; yalnızca TL karşılığı kaydedilir.
            </li>
          )}
          {r.ruleConflict ? <li className="text-warning">{r.ruleConflict}</li> : r.ruleNote && r.categorySource === 'rule' && <li className="text-subtle">{r.ruleNote}</li>}
          {r.notes.map((n) => (
            <li key={n} className="text-muted">
              {n}
            </li>
          ))}
        </ul>
      )}

      {r.duplicateOf?.length ? (
        <div className="mt-3 rounded-xl border border-warning/35 bg-warning-soft p-3">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-warning">
            <Copy className="size-4" /> Mevcut kayıtla benziyor
          </p>
          <div className="mt-2 grid grid-cols-1 gap-2 text-[12.5px] sm:grid-cols-2">
            <div className="rounded-lg bg-surface p-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Bu dosyadaki satır</div>
              <div className="mt-0.5 font-medium">{r.description}</div>
              <div className="num text-muted">
                {r.date ? formatDate(r.date) : '—'} · {r.amountKurus !== null ? formatKurus(r.amountKurus) : '—'}
              </div>
            </div>
            {r.duplicateOf.map((id) => {
              const e = existing.get(id)
              return (
                <div key={id} className="rounded-lg bg-surface p-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Kayıtlı işlem ({e ? SOURCE_LABEL[e.source] : '?'})</div>
                  <div className="mt-0.5 font-medium">{e?.description ?? 'Silinmiş kayıt'}</div>
                  <div className="num text-muted">{e ? `${formatDate(e.date)} · ${formatKurus(e.amountKurus)}` : ''}</div>
                </div>
              )
            })}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button size="sm" variant={r.duplicateDecision === 'skip' ? 'primary' : 'secondary'} icon={<SkipForward className="size-4" />} onClick={() => onChange(r.id, { duplicateDecision: 'skip' })} aria-pressed={r.duplicateDecision === 'skip'}>
              Atla
            </Button>
            <Button size="sm" variant={r.duplicateDecision === 'keep' ? 'primary' : 'secondary'} icon={<Split className="size-4" />} onClick={() => onChange(r.id, { duplicateDecision: 'keep' })} aria-pressed={r.duplicateDecision === 'keep'}>
              Ayrı işlem olarak ekle
            </Button>
          </div>
        </div>
      ) : null}
    </motion.article>
  )
})

function SourcePanel({ review, focus, onCreate, embedded }: { review: ReviewData; focus: string | null; onCreate: (l: DocLine) => void; embedded?: boolean }) {
  const [view, setView] = useState<'lines' | 'unparsed' | 'ignored'>('lines')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!focus) return
    setView('lines')
    const t = window.setTimeout(() => ref.current?.querySelector(`[data-key="${focus}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60)
    return () => window.clearTimeout(t)
  }, [focus])
  const unparsedKeys = new Set(review.unparsed.map((l) => `${l.page}:${l.index + 1}`))
  const ignoredMap = new Map(review.ignored.map((i) => [`${i.line.page}:${i.line.index + 1}`, i.reason]))

  if (review.sheet) {
    return (
      <Card className={cn('overflow-hidden', embedded && 'border-0 shadow-none')}>
        {!embedded && <div className="border-b border-line px-4 py-3 text-sm font-semibold">Kaynak tablo</div>}
        <div ref={ref} className="scrollbar-thin max-h-[70vh] overflow-auto p-2 font-mono text-[11.5px]">
          {review.sheet.rows.slice(0, 400).map((r, i) => (
            <div key={i} data-key={`0:${i + 1}`} className={cn('flex gap-2 rounded px-2 py-0.5', focus === `0:${i + 1}` && 'bg-accent-soft')}>
              <span className="num w-8 shrink-0 text-right text-subtle">{i + 1}</span>
              <span className="truncate text-muted">{r.map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : String(c ?? ''))).join(' | ')}</span>
            </div>
          ))}
        </div>
      </Card>
    )
  }

  return (
    <Card className={cn('overflow-hidden', embedded && 'border-0 shadow-none')}>
      <div className="flex gap-1 border-b border-line p-2">
        {(
          [
            ['lines', `Tüm satırlar (${review.lines.length})`],
            ['unparsed', `Tanınmayan (${review.unparsed.length})`],
            ['ignored', `Özet (${review.ignored.length})`],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setView(k)} className={cn('rounded-lg px-2 py-1 text-[12px] font-medium', view === k ? 'bg-surface-2 text-ink' : 'text-muted hover:text-ink')}>
            {l}
          </button>
        ))}
      </div>
      <div ref={ref} className="scrollbar-thin max-h-[70vh] overflow-auto p-2 font-mono text-[11.5px] leading-relaxed">
        {view === 'lines' &&
          review.lines.map((l) => {
            const key = `${l.page}:${l.index + 1}`
            return (
              <div key={key} data-key={key} className={cn('flex gap-2 rounded px-2 py-0.5', focus === key && 'bg-accent-soft ring-1 ring-accent/40', ignoredMap.has(key) && 'text-subtle line-through decoration-subtle/50', unparsedKeys.has(key) && 'bg-warning-soft/60')}>
                <span className="num w-10 shrink-0 text-right text-subtle">
                  {l.page}:{l.index + 1}
                </span>
                <span className="whitespace-pre-wrap break-words text-muted">{l.text}</span>
              </div>
            )
          })}
        {view === 'unparsed' &&
          (review.unparsed.length ? (
            review.unparsed.map((l) => (
              <div key={`${l.page}:${l.index}`} className="mb-1.5 rounded-lg border border-line p-2">
                <div className="text-muted">{l.text}</div>
                <button type="button" onClick={() => onCreate(l)} className="mt-1 font-sans text-[12px] font-semibold text-accent hover:underline">
                  Bu satırdan işlem oluştur
                </button>
              </div>
            ))
          ) : (
            <p className="p-3 font-sans text-sm text-muted">Tutar içerip işlem olarak tanınmayan satır yok.</p>
          ))}
        {view === 'ignored' &&
          review.ignored.map((i) => (
            <div key={`${i.line.page}:${i.line.index}`} className="mb-1.5 rounded-lg border border-line p-2">
              <div className="text-muted">{i.line.text}</div>
              <div className="mt-0.5 font-sans text-[12px] text-subtle">{i.reason}</div>
              <button type="button" onClick={() => onCreate(i.line)} className="mt-1 font-sans text-[12px] font-semibold text-accent hover:underline">
                Yine de işlem olarak ekle
              </button>
            </div>
          ))}
      </div>
    </Card>
  )
}
