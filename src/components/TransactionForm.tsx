import { Lightbulb } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { hasErrors, type TxFieldErrors } from '../data/validation'
import { toUserMessage } from '../data/repository'
import { isIsoDate, todayIso, monthOf } from '../domain/dates'
import { formatKurusPlain, parseUserAmount } from '../domain/money'
import { merchantKey, normalizeText } from '../domain/normalize'
import { evaluateRules } from '../domain/rules'
import { PAYMENT_LABEL, TX_TYPE_LABEL, type PaymentMethod, type Transaction, type TxType } from '../domain/types'
import { useCategories, useGroups, useRepo, useRules, useSettings } from '../state/data'
import { useUi } from '../state/ui'
import { cn } from '../lib/cn'
import { CategoryIcon, GroupPicker } from './common'
import { Modal } from './ui/Modal'
import { Button, Checkbox, Field, Input, Segmented, Select, Textarea } from './ui/primitives'

interface FormState {
  date: string
  amount: string
  type: TxType
  description: string
  categoryId: string
  groupId: string
  note: string
  paymentMethod: PaymentMethod | ''
  accountAlias: string
  learn: boolean
  learnPattern: string
}

function initialState(tx?: Transaction): FormState {
  return {
    date: tx?.date ?? todayIso(),
    amount: tx ? formatKurusPlain(tx.amountKurus) : '',
    type: tx?.type ?? 'expense',
    description: tx?.description ?? '',
    categoryId: tx?.categoryId ?? '',
    groupId: tx?.groupId ?? '',
    note: tx?.note ?? '',
    paymentMethod: tx?.paymentMethod ?? '',
    accountAlias: tx?.accountAlias ?? '',
    learn: false,
    learnPattern: tx ? merchantKey(tx.description) : '',
  }
}

/** Manuel gider ekleme ve düzenleme formu. */
export function TransactionFormHost() {
  const { formState, closeTransactionForm } = useUi()
  return (
    <Modal
      open={formState.open}
      onOpenChange={(o) => !o && closeTransactionForm()}
      title={formState.tx ? 'İşlemi düzenle' : 'Gider ekle'}
      description={formState.tx ? undefined : 'Kategorisini siz seçersiniz; kayıt yalnızca bu cihazda tutulur.'}
      size="md"
      side
    >
      <TransactionForm key={formState.tx?.id ?? 'new'} tx={formState.tx} onDone={closeTransactionForm} />
    </Modal>
  )
}

function TransactionForm({ tx, onDone }: { tx?: Transaction; onDone: () => void }) {
  const repo = useRepo()
  const categories = useCategories()
  const rules = useRules()
  const groups = useGroups()
  const activeGroups = useMemo(() => (groups ?? []).filter((g) => !g.archived || g.id === tx?.groupId), [groups, tx])
  const { toast, setHighlightId, setMonth, month } = useUi()
  const [s, setS] = useState<FormState>(() => initialState(tx))
  const [errors, setErrors] = useState<TxFieldErrors>({})
  const [saving, setSaving] = useState(false)
  const submitting = useRef(false)
  const amountRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!tx) amountRef.current?.focus()
  }, [tx])

  // Yeni işlemde ayarlardaki varsayılan ödeme yöntemi (kullanıcı henüz seçmediyse).
  const settings = useSettings()
  const defaultPm = settings?.defaultPaymentMethod
  useEffect(() => {
    if (!tx && defaultPm) setS((prev) => (prev.paymentMethod ? prev : { ...prev, paymentMethod: defaultPm }))
  }, [tx, defaultPm])

  const activeCats = useMemo(() => (categories ?? []).filter((c) => !c.archived || c.id === tx?.categoryId), [categories, tx])
  const selectedCat = activeCats.find((c) => c.id === s.categoryId)
  const suggestion = useMemo(() => {
    if (!rules || !s.description.trim() || s.categoryId) return null
    const ev = evaluateRules(rules, normalizeText(s.description))
    const c = ev.winner ? activeCats.find((x) => x.id === ev.winner!.rule.categoryId) : undefined
    return c ?? null
  }, [rules, s.description, s.categoryId, activeCats])

  const categoryChanged = !!s.categoryId && s.categoryId !== (tx?.categoryId ?? '')
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setS((p) => ({ ...p, [k]: v }))
    if (errors[k as keyof TxFieldErrors]) setErrors((e) => ({ ...e, [k]: undefined }))
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (submitting.current) return
    const errs: TxFieldErrors = {}
    const amt = parseUserAmount(s.amount)
    if (!amt.ok) errs.amount = amt.reason === 'empty' ? 'Tutar girin.' : amt.reason === 'ambiguous' ? 'Tutar belirsiz; kuruşu virgülle yazın (ör. 1.234,56).' : 'Tutar okunamadı. Örnek: 1.234,56'
    else if (amt.kurus <= 0) errs.amount = 'Sıfırdan büyük bir tutar girin. İade için türü "İade" seçin.'
    if (!isIsoDate(s.date)) errs.date = 'Geçerli bir tarih seçin.'
    if (!s.description.trim()) errs.description = 'Açıklama veya iş yeri girin.'
    if (s.type === 'expense' && !s.categoryId) errs.category = 'Gider için kategori seçmelisiniz.'
    setErrors(errs)
    if (hasErrors(errs) || !amt.ok) {
      const first = Object.keys(errs)[0]
      document.getElementById(`tx-${first}`)?.focus()
      return
    }
    submitting.current = true
    setSaving(true)
    try {
      const input = {
        date: s.date,
        amountKurus: amt.kurus,
        type: s.type,
        description: s.description,
        categoryId: s.categoryId || null,
        groupId: s.groupId || null,
        note: s.note,
        paymentMethod: s.paymentMethod || undefined,
        accountAlias: s.accountAlias,
      }
      const learn = s.learn && s.categoryId && s.learnPattern.trim() ? { pattern: s.learnPattern, categoryId: s.categoryId } : undefined
      if (tx) {
        await repo.updateTransaction(tx.id, input, learn)
        setHighlightId(tx.id)
        toast('İşlem güncellendi.')
      } else {
        const saved = await repo.addTransaction(input, learn)
        setHighlightId(saved.id)
        const other = monthOf(saved.date) !== month
        toast(other ? `Kaydedildi. İşlem ${saved.date.slice(0, 7)} ayında.` : 'Gider kaydedildi.', {
          action: other ? { label: 'O aya git', onClick: () => setMonth(monthOf(saved.date)) } : undefined,
        })
      }
      onDone()
    } catch (err) {
      toast(toUserMessage(err), { kind: 'error' })
      submitting.current = false
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4 pt-1">
      <Segmented
        label="İşlem türü"
        value={s.type}
        onChange={(v) => set('type', v)}
        options={(['expense', 'refund', 'transfer'] as TxType[]).map((t) => ({ value: t, label: t === 'transfer' ? 'Kart ödemesi / Transfer' : TX_TYPE_LABEL[t] }))}
        className="w-full [&>button]:px-2 [&>button]:text-[12.5px] sm:[&>button]:text-[13px]"
      />
      {s.type === 'transfer' && <p className="-mt-2 text-[12.5px] text-subtle">Kart borcu ödemeleri ve hesaplar arası transferler gider toplamına dahil edilmez.</p>}
      {s.type === 'refund' && <p className="-mt-2 text-[12.5px] text-subtle">İade tutarını pozitif girin; kayıt tarihinin ayındaki net giderden bir kez düşülür.</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Tutar (TL)" htmlFor="tx-amount" error={errors.amount}>
          <div className="relative">
            <Input
              ref={amountRef}
              id="tx-amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0,00"
              value={s.amount}
              onChange={(e) => set('amount', e.target.value)}
              aria-invalid={!!errors.amount}
              aria-describedby={errors.amount ? 'tx-amount-error' : undefined}
              className="num pr-9 text-lg font-semibold sm:text-base"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-subtle">₺</span>
          </div>
        </Field>
        <Field label="Tarih" htmlFor="tx-date" error={errors.date}>
          <Input id="tx-date" type="date" value={s.date} onChange={(e) => set('date', e.target.value)} aria-invalid={!!errors.date} max="2200-12-31" />
        </Field>
      </div>

      <Field label="Açıklama / iş yeri" htmlFor="tx-description" error={errors.description}>
        <Input
          id="tx-description"
          autoComplete="off"
          placeholder="Örn. Migros Kadıköy"
          maxLength={200}
          value={s.description}
          onChange={(e) => {
            const v = e.target.value
            setS((p) => ({ ...p, description: v, learnPattern: merchantKey(v) }))
            if (errors.description) setErrors((er) => ({ ...er, description: undefined }))
          }}
          aria-invalid={!!errors.description}
        />
      </Field>

      <Field label="Kategori" htmlFor="tx-category" error={errors.category} optional={s.type !== 'expense'}>
        <div className="flex items-center gap-2">
          <CategoryIcon category={selectedCat} />
          <Select id="tx-category" value={s.categoryId} onChange={(e) => set('categoryId', e.target.value)} aria-invalid={!!errors.category}>
            <option value="">{s.type === 'expense' ? 'Kategori seçin…' : 'Kategori yok'}</option>
            {activeCats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.archived ? ' (arşivde)' : ''}
              </option>
            ))}
          </Select>
        </div>
        {suggestion && (
          <button
            type="button"
            onClick={() => set('categoryId', suggestion.id)}
            className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-lg bg-accent-soft px-2.5 py-1 text-[12.5px] font-medium text-accent-strong transition-colors hover:brightness-105 dark:text-accent"
          >
            <Lightbulb className="size-3.5" /> Kural önerisi: {suggestion.name} — seçmek için dokunun
          </button>
        )}
      </Field>

      {activeGroups.length > 0 && (
        <Field label="Harcama grubu" optional hint="Kategoriden ayrı bir gruplama; panelde bu gruba göre filtreleyebilirsiniz.">
          <GroupPicker groups={activeGroups} value={s.groupId} onChange={(v) => set('groupId', v)} />
        </Field>
      )}

      {categoryChanged && s.description.trim() && (
        <div className="rounded-2xl border border-line bg-surface-2 p-3">
          <Checkbox
            label="Bu iş yeri için sonraki işlemlerde de kullan"
            description="İçe aktarılan işlemlerde bu kategori önerilir. Mevcut kayıtlar değişmez."
            checked={s.learn}
            onChange={(v) => set('learn', v)}
          />
          {s.learn && (
            <div className="mt-2 pl-7">
              <Input aria-label="Eşleşecek iş yeri ifadesi" value={s.learnPattern} onChange={(e) => set('learnPattern', e.target.value)} className="h-9 text-sm" />
              <p className="mt-1 text-[12px] text-subtle">Açıklamada bu kelimeler tam olarak geçtiğinde eşleşir.</p>
            </div>
          )}
        </div>
      )}

      <details className="group rounded-2xl border border-line px-3 py-2 open:pb-3">
        <summary className="cursor-pointer select-none list-none py-1 text-sm font-medium text-muted marker:hidden hover:text-ink">
          <span className="inline-block transition-transform group-open:rotate-90">›</span> Ödeme aracı, kart adı ve not
        </summary>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Ödeme aracı" htmlFor="tx-payment" optional>
            <Select id="tx-payment" value={s.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value as PaymentMethod | '')}>
              <option value="">Belirtilmedi</option>
              {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((p) => (
                <option key={p} value={p}>
                  {PAYMENT_LABEL[p]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Kart/hesap takma adı" htmlFor="tx-alias" optional hint="Ör. “Maaş kartı”. Kart numarası girmeyin.">
            <Input id="tx-alias" maxLength={40} value={s.accountAlias} onChange={(e) => set('accountAlias', e.target.value.replace(/\d{12,}/g, ''))} />
          </Field>
          <Field label="Not" htmlFor="tx-note" optional className="sm:col-span-2">
            <Textarea id="tx-note" maxLength={500} value={s.note} onChange={(e) => set('note', e.target.value)} />
          </Field>
        </div>
      </details>

      <div className={cn('sticky bottom-0 -mx-5 mt-1 flex gap-2 border-t border-line bg-surface px-5 pb-1 pt-3 sm:-mx-6 sm:px-6')}>
        <Button variant="ghost" onClick={onDone} className="flex-1 sm:flex-none">
          Vazgeç
        </Button>
        <Button type="submit" variant="primary" loading={saving} className="flex-1">
          {tx ? 'Değişiklikleri kaydet' : 'Kaydet'}
        </Button>
      </div>
    </form>
  )
}
