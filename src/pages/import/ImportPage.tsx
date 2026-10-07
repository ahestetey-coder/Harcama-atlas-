import { CircleCheck, FileSpreadsheet, FileText, FileUp, Image as ImageIcon, KeyRound, Loader2, RotateCw, ShieldCheck, TriangleAlert, Undo2, X } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useRef, useState, type DragEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PageHeader } from '../../components/AppShell'
import { Alert, Button, Card, Field, Input, Select } from '../../components/ui/primitives'
import { IMPORT_LIMITS } from '../../config/app'
import { toUserMessage } from '../../data/repository'
import { formatDate, periodLabel, periodOf } from '../../domain/dates'
import { formatKurus } from '../../domain/money'
import { PAYMENT_LABEL, type PaymentMethod } from '../../domain/types'
import { buildCommit } from '../../import/enrich'
import { cn } from '../../lib/cn'
import { useCategories, useData } from '../../state/data'
import { useUi } from '../../state/ui'
import { useCycle } from '../../state/cycle'
import { ImageStep } from './ImageStep'
import { MappingStep } from './MappingStep'
import { ReviewStep } from './ReviewStep'
import { ACCEPT, useImportFlow } from './useImportFlow'

const STEPS = ['Dosya seç', 'Oku', 'İncele ve düzelt', 'Kaydet']

export default function ImportPage() {
  return <ImportFlow />
}

/**
 * İçe aktarma akışı. Sayfa olarak (/ice-aktar) veya "+" menüsünden bulunulan sayfanın üstünde açılan
 * pencerede (embedded) çalışır; pencerede başka sayfaya geçmeden önce `onLeave` ile pencere kapanır.
 */
export function ImportFlow({ embedded, onLeave, onDirtyChange }: { embedded?: boolean; onLeave?: () => void; onDirtyChange?: (dirty: boolean) => void } = {}) {
  const flow = useImportFlow()
  const { stage, info, review } = flow
  const { repo, isDemo } = useData()
  const categories = useCategories()
  const { toast, setMonth, pendingImport, setPendingImport } = useUi()
  // "+" menüsünden seçilen dosya: sayfa açılınca doğrudan okunur
  const { selectFile } = flow
  useEffect(() => {
    if (!pendingImport || stage.k !== 'select') return
    setPendingImport(null)
    void selectFile(pendingImport).then((err) => {
      if (err) toast(err, { kind: 'error' })
    })
  }, [pendingImport, stage.k, selectFile, setPendingImport, toast])
  const cycle = useCycle().startDay
  const nav = useNavigate()
  const navigate = (to: string) => {
    onLeave?.()
    nav(to)
  }
  // Okunan veya incelenen bir dosya varken pencere kapatılmadan önce sorulur
  const dirty = stage.k !== 'select' && stage.k !== 'done' && stage.k !== 'error'
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange])
  const [payment, setPayment] = useState<PaymentMethod | ''>('credit')
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)

  const stepIndex = stage.k === 'select' || stage.k === 'duplicate-file' ? 0 : stage.k === 'review' ? 2 : stage.k === 'done' ? 3 : 1

  const save = async () => {
    if (!review || !info || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    try {
      const active = new Set((categories ?? []).filter((c) => !c.archived).map((c) => c.id))
      const commit = buildCommit({
        importId: flow.importId,
        rows: review.rows,
        activeCategoryIds: active,
        file: { name: info.name, kind: info.kind, size: info.size, hash: info.hash },
        parserId: review.parserLabel,
        accountAlias: flow.accountAlias,
        paymentMethod: payment || undefined,
        isDemo,
      })
      const res = await repo.commitImport(commit)
      if (!res.saved) toast('Bu aktarım zaten kaydedilmişti; tekrar eklenmedi.', { kind: 'info' })
      // İşlemler hangi aylara düştü? Panel, en çok işlemin olduğu aya geçer
      // (ekstre geçen aya aitse panel bu ayı boş gösterirdi).
      const byMonth = new Map<string, number>()
      for (const t of commit.transactions) byMonth.set(periodOf(t.date, cycle), (byMonth.get(periodOf(t.date, cycle)) ?? 0) + 1)
      const months = [...byMonth].map(([month, count]) => ({ month, count })).sort((a, b) => b.count - a.count || b.month.localeCompare(a.month))
      if (months[0]) setMonth(months[0].month)
      // Geçici veriler (dosya, satırlar) bellekten bırakılır
      flow.setReview(null)
      flow.setStage({
        k: 'done',
        importId: commit.record.id,
        count: commit.transactions.length,
        skipped: commit.record.skippedCount,
        expenseKurus: commit.record.totalExpenseKurus,
        refundKurus: commit.record.totalRefundKurus,
        months,
      })
    } catch (e) {
      toast(toUserMessage(e), { kind: 'error' })
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <div>
      {!embedded && <PageHeader title="İçe aktar" subtitle="Dosya seç → Oku → İncele/düzelt → Onayla. Onaylamadan hiçbir satır toplamlara eklenmez." />}
      <ol className="mb-5 flex items-center gap-1.5 overflow-x-auto pb-1 text-[12.5px] sm:gap-3" aria-label="Adımlar">
        {STEPS.map((s, i) => (
          <li key={s} className="flex shrink-0 items-center gap-1.5 sm:gap-3" aria-current={i === stepIndex ? 'step' : undefined}>
            <span
              className={cn(
                'num grid size-6 place-items-center rounded-full text-[11.5px] font-semibold transition-colors',
                i < stepIndex ? 'bg-accent text-white' : i === stepIndex ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white' : 'bg-surface-2 text-subtle',
              )}
            >
              {i < stepIndex ? '✓' : i + 1}
            </span>
            <span className={cn('font-medium', i === stepIndex ? 'text-ink' : 'text-subtle')}>{s}</span>
            {i < STEPS.length - 1 && <span className="h-px w-4 bg-line-strong sm:w-8" aria-hidden />}
          </li>
        ))}
      </ol>

      {stage.k === 'select' && <SelectStep onFile={flow.selectFile} alias={flow.accountAlias} setAlias={flow.setAccountAlias} payment={payment} setPayment={setPayment} />}

      {stage.k === 'duplicate-file' && info && (
        <Card className="mx-auto max-w-xl p-6">
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 size-6 shrink-0 text-warning" />
            <div>
              <h2 className="font-display text-lg font-semibold">Bu dosya daha önce içe aktarılmış</h2>
              <p className="mt-1 text-sm text-muted">
                “{stage.existing.fileName}” {formatDate(stage.existing.importedAt.slice(0, 10), 'long')} tarihinde aktarıldı ({stage.existing.transactionCount} işlem). Aynı içerik (dosya özeti eşleşti).
              </p>
              <p className="mt-2 text-sm text-muted">Devam ederseniz satırlar mevcut kayıtlarla karşılaştırılır ve tekrar şüphesi olarak gösterilir; hiçbiri otomatik silinmez.</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button variant="primary" onClick={() => flow.start(info)}>
                  Yine de devam et
                </Button>
                <Button onClick={() => navigate('/aktarimlar')}>Aktarım geçmişini aç</Button>
                <Button variant="ghost" onClick={flow.reset}>
                  Vazgeç
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {stage.k === 'password' && <PasswordStep incorrect={stage.incorrect} fileName={info?.name ?? ''} onSubmit={flow.submitPassword} onCancel={flow.reset} />}

      {stage.k === 'reading' && (
        <Card className="mx-auto max-w-xl p-8 text-center" aria-live="polite">
          <div className="relative mx-auto mb-5 grid size-16 place-items-center">
            <div className="absolute inset-0 animate-ping rounded-full bg-accent/15 motion-reduce:animate-none" />
            <Loader2 className="size-8 animate-spin text-accent" aria-hidden />
          </div>
          <h2 className="font-display text-lg font-semibold">{stage.label}</h2>
          {stage.detail && <p className="mt-1 text-sm text-muted">{stage.detail}</p>}
          <div className="mx-auto mt-5 h-2 max-w-sm overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={stage.progress !== null ? Math.round(stage.progress * 100) : undefined} aria-label="İlerleme">
            {stage.progress !== null ? (
              <motion.div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500" animate={{ width: `${Math.round(stage.progress * 100)}%` }} transition={{ duration: 0.2 }} />
            ) : (
              <div className="h-full w-1/3 animate-[shimmer_1.2s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-emerald-500 to-teal-500" />
            )}
          </div>
          {stage.progress !== null && <p className="num mt-2 text-[12.5px] text-subtle">%{Math.round(stage.progress * 100)}</p>}
          <p className="mt-4 text-[12.5px] text-subtle">Dosya bu cihazda işleniyor; hiçbir yere gönderilmiyor.</p>
          {stage.cancellable && (
            <Button variant="ghost" className="mt-4" icon={<X className="size-4" />} onClick={flow.cancelReading}>
              İptal et
            </Button>
          )}
        </Card>
      )}

      {stage.k === 'error' && (
        <Card className="mx-auto max-w-xl p-6">
          <Alert tone="danger" icon={<TriangleAlert />} title="Dosya okunamadı">
            {stage.message}
          </Alert>
          <div className="mt-4 flex flex-wrap gap-2">
            {stage.canRetry && (
              <Button variant="primary" icon={<RotateCw className="size-4" />} onClick={flow.retry}>
                Yeniden dene
              </Button>
            )}
            <Button onClick={flow.reset}>Başka dosya seç</Button>
          </div>
        </Card>
      )}

      {stage.k === 'mapping' && info && (
        <MappingStep
          tables={stage.tables}
          sheetIndex={stage.sheetIndex}
          initial={stage.mapping}
          notes={stage.notes}
          fileKind={info.kind === 'xlsx' ? 'xlsx' : 'csv'}
          onConfirm={(t, m) => flow.confirmMapping(t, m, stage.notes)}
          onCancel={flow.reset}
        />
      )}

      {stage.k === 'image' && <ImageStep bitmap={stage.bitmap} onRun={(adj) => flow.runImageOcr(stage.bitmap, adj)} onCancel={flow.reset} />}

      {stage.k === 'review' && review && info && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px] text-muted">
            <FileIcon kind={info.kind} />
            <span className="font-medium text-ink">{info.name}</span>
            <span>· {(info.size / 1024).toFixed(0)} KB</span>
            {flow.accountAlias && <span>· {flow.accountAlias}</span>}
          </div>
          <ReviewStep review={review} onRowsChange={(rows) => flow.setReview({ ...review, rows })} onSave={save} onCancel={flow.reset} saving={saving} accountAlias={flow.accountAlias} />
        </>
      )}

      {stage.k === 'done' && (
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.22 }}>
          <Card className="mx-auto max-w-xl p-8 text-center">
            <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }} className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-accent-soft text-accent">
              <CircleCheck className="size-9" />
            </motion.div>
            <h2 className="font-display text-xl font-semibold">{stage.count} işlem kaydedildi</h2>
            <p className="num mt-1 text-sm text-muted">
              Gider {formatKurus(stage.expenseKurus)} · İade {formatKurus(stage.refundKurus)}
              {stage.skipped > 0 && ` · ${stage.skipped} satır kaydedilmedi`}
            </p>
            {stage.months.length > 0 && (
              <div className="mt-4 flex flex-wrap justify-center gap-2" aria-label="İşlemlerin eklendiği aylar">
                {stage.months.map((m) => (
                  <button
                    key={m.month}
                    type="button"
                    onClick={() => {
                      setMonth(m.month)
                      navigate('/')
                    }}
                    className="num rounded-full border border-line-strong px-3 py-1 text-[13px] text-muted hover:text-ink"
                  >
                    {periodLabel(m.month, cycle)}: {m.count} işlem
                  </button>
                ))}
              </div>
            )}
            <p className="mt-3 text-[12.5px] text-subtle">Yüklenen dosya saklanmadı; yalnızca onayladığınız işlemler kaydedildi.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Button variant="primary" onClick={() => navigate('/')}>
                {stage.months[0] ? `Panele git (${periodLabel(stage.months[0].month, cycle)})` : 'Panele git'}
              </Button>
              <Button onClick={() => navigate(`/islemler?aktarim=${stage.importId}`)}>Aktarılan işlemler</Button>
              <Button variant="ghost" icon={<FileUp className="size-4" />} onClick={flow.reset}>
                Yeni dosya
              </Button>
            </div>
            <Link to="/aktarimlar" onClick={onLeave} className="mt-4 inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
              <Undo2 className="size-3.5" /> Yanlışlık mı var? Aktarım geçmişinden geri alabilirsiniz.
            </Link>
          </Card>
        </motion.div>
      )}
    </div>
  )
}

function FileIcon({ kind }: { kind: string }) {
  if (kind === 'pdf') return <FileText className="size-4 text-rose-500" />
  if (kind === 'image') return <ImageIcon className="size-4 text-sky-500" />
  return <FileSpreadsheet className="size-4 text-emerald-600" />
}

function SelectStep({
  onFile,
  alias,
  setAlias,
  payment,
  setPayment,
}: {
  onFile: (f: File) => Promise<string | null>
  alias: string
  setAlias: (v: string) => void
  payment: PaymentMethod | ''
  setPayment: (p: PaymentMethod | '') => void
}) {
  const [drag, setDrag] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const handle = async (files: FileList | null) => {
    const f = files?.[0]
    if (!f) return
    setBusy(true)
    setError(null)
    try {
      const err = await onFile(f)
      if (err) setError(err)
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDrag(false)
    void handle(e.dataTransfer.files)
  }
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
      <div>
        <label
          onDragOver={(e) => {
            e.preventDefault()
            setDrag(true)
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          className={cn(
            'group relative flex min-h-[280px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed px-6 py-10 text-center transition-all duration-200',
            drag ? 'scale-[1.01] border-accent bg-accent-soft' : 'border-line-strong bg-surface hover:border-accent/60 hover:bg-surface-2/60',
          )}
        >
          <input ref={inputRef} type="file" accept={ACCEPT} className="sr-only" onChange={(e) => void handle(e.target.files)} aria-label="İçe aktarılacak dosyayı seçin" />
          <div className="mb-4 grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-[0_14px_30px_-12px_rgb(5_150_105/0.9)] transition-transform duration-200 group-hover:-translate-y-0.5">
            {busy ? <Loader2 className="size-7 animate-spin" /> : <FileUp className="size-7" />}
          </div>
          <p className="font-display text-lg font-semibold text-ink">Dosyayı sürükleyip bırakın</p>
          <p className="mt-1 text-sm text-muted">veya seçmek için dokunun</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2 text-[12px]">
            {['PDF ekstre', 'CSV', 'Excel (.xlsx)', 'PNG / JPEG ekran görüntüsü'].map((t) => (
              <span key={t} className="rounded-full border border-line bg-surface px-2.5 py-1 text-muted">
                {t}
              </span>
            ))}
          </div>
        </label>
        {error && (
          <Alert tone="danger" icon={<TriangleAlert />} className="mt-3">
            {error}
          </Alert>
        )}
      </div>
      <div className="flex flex-col gap-4">
        <Card className="p-5">
          <h2 className="text-sm font-semibold">Aktarılan işlemlere eklenecek bilgi</h2>
          <div className="mt-3 flex flex-col gap-3">
            <Field label="Kart/hesap takma adı" htmlFor="imp-alias" optional hint="Tekrar kontrolünde farklı kartları ayırmaya yarar. Kart numarası girmeyin.">
              <Input id="imp-alias" value={alias} maxLength={40} onChange={(e) => setAlias(e.target.value.replace(/\d{12,}/g, ''))} placeholder="Ör. Maaş kartı" />
            </Field>
            <Field label="Ödeme aracı" htmlFor="imp-pay" optional>
              <Select id="imp-pay" value={payment} onChange={(e) => setPayment(e.target.value as PaymentMethod | '')}>
                <option value="">Belirtilmedi</option>
                {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((p) => (
                  <option key={p} value={p}>
                    {PAYMENT_LABEL[p]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>
        <Card className="p-5 text-[13px] text-muted">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
            <ShieldCheck className="size-4 text-accent" /> Sınırlar ve gizlilik
          </h2>
          <ul className="space-y-1.5">
            <li>PDF: en çok {IMPORT_LIMITS.maxPdfBytes / 1048576} MB, {IMPORT_LIMITS.maxPdfPages} sayfa; taranmış sayfalarda OCR en çok {IMPORT_LIMITS.maxOcrPdfPages} sayfa.</li>
            <li>CSV / Excel: en çok {IMPORT_LIMITS.maxSheetBytes / 1048576} MB, {IMPORT_LIMITS.maxRows.toLocaleString('tr-TR')} satır.</li>
            <li>Görsel: en çok {IMPORT_LIMITS.maxImageBytes / 1048576} MB.</li>
            <li>Dosyalar bu cihazda okunur, sunucuya gönderilmez ve kalıcı saklanmaz.</li>
            <li>Bankaya özgü ayrıştırıcı yoktur; genel okuyucu kullanılır. Her satırı incelemeniz gerekir.</li>
          </ul>
          <a href="./ornek-dosyalar/" className="mt-3 inline-block font-medium text-accent hover:underline" target="_blank" rel="noopener">
            Sentetik örnek dosyalar
          </a>
        </Card>
      </div>
    </div>
  )
}

function PasswordStep({ incorrect, fileName, onSubmit, onCancel }: { incorrect: boolean; fileName: string; onSubmit: (pw: string) => void; onCancel: () => void }) {
  const [pw, setPw] = useState('')
  return (
    <Card className="mx-auto max-w-md p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-2xl bg-info-soft text-info">
          <KeyRound className="size-5" />
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold">PDF parola korumalı</h2>
          <p className="text-[13px] text-muted">{fileName}</p>
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (pw) onSubmit(pw)
        }}
      >
        <Field label="Parola" htmlFor="pdf-pw" error={incorrect ? 'Parola hatalı, tekrar deneyin.' : undefined} hint="Parola yalnızca bu okuma için kullanılır, saklanmaz.">
          <Input id="pdf-pw" type="password" autoComplete="off" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} aria-invalid={incorrect} />
        </Field>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Vazgeç
          </Button>
          <Button type="submit" variant="primary" disabled={!pw}>
            Aç
          </Button>
        </div>
      </form>
    </Card>
  )
}
