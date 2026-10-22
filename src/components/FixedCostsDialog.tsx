import { useMemo, useState, type FormEvent } from 'react'
import { toUserMessage } from '../data/repository'
import { CONSUMER_DEBT, debtTypeOf, holdingSummary, type DebtType } from '../domain/assets'
import type { FixedLine } from '../domain/bucketBudget'
import { collectFixedLines, READ_LOCKED_DATA, type FactsInput } from '../domain/budgetFacts'
import { periodOf, todayIso } from '../domain/dates'
import type { Housing } from '../domain/journey'
import { formatKurus, formatKurusPlain, parseUserAmount } from '../domain/money'
import type { BudgetProfile } from '../domain/types'
import { usePersonalCycle } from '../state/cycle'
import { useAssets, useCategories, useRecurring, useRepo, useSettings } from '../state/data'
import { usePersonalTransactions } from '../state/personal'
import { usePlan } from '../state/plan'
import { useUi } from '../state/ui'
import { Modal } from './ui/Modal'
import { Button, Field, Input, More, Select } from './ui/primitives'
import { tt } from '../lib/i18n'

export type AmountKey = 'housingKurus' | 'billsKurus' | 'cardPaymentKurus' | 'loanPaymentKurus' | 'consumerDebtKurus' | 'emergencyFundKurus'

const MAIN: AmountKey[] = ['housingKurus', 'billsKurus', 'cardPaymentKurus', 'loanPaymentKurus']
const EXTRA: AmountKey[] = ['consumerDebtKurus', 'emergencyFundKurus']

const LABEL: Record<AmountKey, string> = {
  housingKurus: tt('Kira ve aidat (TL)'),
  billsKurus: tt('Faturalar (TL)'),
  cardPaymentKurus: tt('Kart asgari ve KMH ödemesi (TL)'),
  loanPaymentKurus: tt('Kredi taksitleri, konut hariç (TL)'),
  consumerDebtKurus: tt('Toplam kart ve kredi borcu (TL)'),
  emergencyFundKurus: tt('Acil durum birikimi (TL)'),
}

const HOUSING_OPTIONS: Array<[Housing, string]> = [
  ['rent', 'Kirada'],
  ['mortgage', tt('Konut kredisi')],
  ['owned', tt('Ev sahibi')],
  ['family', tt('Aile yanında')],
]

const LOAN_TYPES: DebtType[] = ['loan', 'auto', 'personal']

/** Ayrıntılı kayıttan gelen tutar; o alanın beyanı bütçede okunmaz. */
export interface Covered {
  kurus: number
  from: 'payments' | 'debts' | 'assets'
}

const COVERED_HINT: Record<Covered['from'], string> = {
  payments: tt('Düzenli ödemelerinizden'),
  debts: tt('Borçlarınızdan'),
  assets: tt('Varlıklarınızdan'),
}

/**
 * Beyandaki hangi alanların ayrıntılı kayıtla (düzenli ödeme, ekstre taksiti, borç, varlık) karşılandığı.
 * Satırlar bütçeyle aynı fonksiyondan, beyan ve Yolculuk testi çıkarılarak toplanır; bakiye ve birikim
 * kuralı budgetFacts ile aynıdır.
 */
export function detailedCoverage(a: FactsInput): Partial<Record<AmountKey, Covered>> {
  const lines = collectFixedLines({ ...a, settings: { ...a.settings, budgetProfile: undefined }, gates: { ...a.gates, journey: false } }, periodOf(a.today, a.startDay), new Map())
  const types = new Map(a.assets.map((as) => [`debt:${as.id}`, debtTypeOf(as)]))
  const out: Partial<Record<AmountKey, Covered>> = {}
  const put = (key: AmountKey, ls: FixedLine[]) => {
    if (ls.length) out[key] = { kurus: ls.reduce((s, l) => s + l.monthlyKurus, 0), from: ls.some((l) => l.source === 'asset') ? 'debts' : 'payments' }
  }
  put('housingKurus', lines.filter((l) => l.housing))
  put('billsKurus', lines.filter((l) => l.kind === 'bill'))
  put('cardPaymentKurus', lines.filter((l) => l.source === 'asset' && (types.get(l.key) === 'card' || types.get(l.key) === 'overdraft')))
  put('loanPaymentKurus', lines.filter((l) => l.source === 'asset' && LOAN_TYPES.includes(types.get(l.key)!)))
  if (!a.gates.assets) return out
  let consumer: number | null = null
  for (const as of a.assets) {
    if (as.archived || as.kind !== 'debt') continue
    const type = debtTypeOf(as)
    if (!CONSUMER_DEBT.includes(type)) continue
    if (type !== 'card' && type !== 'overdraft' && !((as.debtTerms?.monthlyRatePct ?? 0) > 0)) continue
    consumer = (consumer ?? 0) + Math.max(0, holdingSummary(as, a.today).valueKurus)
  }
  if (consumer !== null) out.consumerDebtKurus = { kurus: consumer, from: 'debts' }
  if (a.assets.some((as) => !as.archived && as.kind !== 'debt')) {
    let liquid = 0
    for (const as of a.assets) if (!as.archived && (as.kind === 'deposit' || as.kind === 'cash')) liquid += Math.max(0, holdingSummary(as, a.today).valueKurus)
    out.emergencyFundKurus = { kurus: liquid, from: 'assets' }
  }
  return out
}

interface Draft {
  amounts: Record<AmountKey, string>
  housing: Housing | ''
  earners: '' | '1' | '2'
  dependents: string
}

function draftOf(p: BudgetProfile | undefined): Draft {
  const amounts = {} as Record<AmountKey, string>
  for (const k of [...MAIN, ...EXTRA]) amounts[k] = p?.[k] != null ? formatKurusPlain(p[k]) : ''
  return {
    amounts,
    housing: p?.housing ?? '',
    earners: p?.earners === 1 || p?.earners === 2 ? (String(p.earners) as '1' | '2') : '',
    dependents: p?.dependents != null ? String(p.dependents) : '',
  }
}

type Errors = Partial<Record<AmountKey | 'dependents' | 'form', string>>

/** Kira, fatura, kart ve kredi ödemeleri için kısa beyan; ayrıntılı kayıt yoksa bütçede kullanılır. Her pakette. */
export function FixedCostsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const repo = useRepo()
  const settings = useSettings()
  const personal = usePersonalTransactions()
  const startDay = usePersonalCycle()
  const recurring = useRecurring()
  const assets = useAssets()
  const categories = useCategories()
  const { has } = usePlan()
  const { toast } = useUi()
  const [draft, setDraft] = useState<Draft>(() => draftOf(undefined))
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
  // Her açılışta alanları kayıtlı beyanla doldur (render sırasında, React'in önerdiği biçimde)
  const [shown, setShown] = useState(false)
  if (open !== shown) {
    setShown(open)
    if (open) {
      setDraft(draftOf(settings?.budgetProfile))
      setErrors({})
    }
  }

  const covered = useMemo(() => {
    if (!open || !settings || !personal || !recurring || !assets || !categories) return {}
    return detailedCoverage({
      txs: personal.counted,
      settings,
      recurring,
      assets,
      goals: [],
      categories,
      startDay,
      today: todayIso(),
      gates: {
        recurring: READ_LOCKED_DATA || has('subscriptions'),
        assets: READ_LOCKED_DATA || has('assets'),
        installments: READ_LOCKED_DATA || has('installments'),
        goals: false,
        journey: false,
        detail: false,
      },
    })
  }, [open, settings, personal, recurring, assets, categories, startDay, has])

  const setAmount = (k: AmountKey, v: string) => setDraft((d) => ({ ...d, amounts: { ...d.amounts, [k]: v } }))

  const save = async (e?: FormEvent) => {
    e?.preventDefault()
    const next: Errors = {}
    const patch: Partial<Omit<BudgetProfile, 'updatedAt'>> = {}
    for (const k of [...MAIN, ...EXTRA]) {
      // Ayrıntılı kayıtla karşılanan alanın beyanı olduğu gibi kalır
      if (covered[k]) continue
      const v = draft.amounts[k].trim()
      if (!v) {
        patch[k] = null
        continue
      }
      const p = parseUserAmount(v)
      if (!p.ok || p.kurus < 0) next[k] = tt('Geçerli bir tutar girin. Örnek: 18.000')
      else patch[k] = p.kurus
    }
    patch.housing = draft.housing || undefined
    patch.earners = draft.earners ? (Number(draft.earners) as 1 | 2) : null
    const dep = draft.dependents.trim()
    if (!dep) patch.dependents = null
    else if (!/^\d{1,2}$/.test(dep) || Number(dep) > 20) next.dependents = tt('0 ile 20 arasında bir sayı girin.')
    else patch.dependents = Number(dep)
    // "Daha fazla" kapatılmışsa oradaki hata görünmez; altta da belirtilir
    if (next.dependents || EXTRA.some((k) => next[k])) next.form = tt('"Daha fazla" bölümündeki alanları düzeltin.')
    setErrors(next)
    if (Object.keys(next).length) return
    setBusy(true)
    try {
      await repo.saveBudgetProfile(patch)
      toast(tt('Sabit giderler kaydedildi.'))
      onOpenChange(false)
    } catch (err) {
      setErrors({ form: toUserMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  const amountField = (k: AmountKey) => {
    const c = covered[k]
    const id = `fixed-${k}`
    const label = k === 'housingKurus' && draft.housing === 'mortgage' ? tt('Konut kredisi taksiti (TL)') : LABEL[k]
    return (
      <Field key={k} label={label} htmlFor={id} error={errors[k]} hint={c ? `${COVERED_HINT[c.from]}: ${formatKurus(c.kurus)}` : undefined}>
        <Input
          id={id}
          inputMode="decimal"
          className="num"
          placeholder={c ? '—' : '0,00'}
          value={c ? '' : draft.amounts[k]}
          disabled={!!c}
          onChange={(e) => setAmount(k, e.target.value)}
          aria-invalid={!!errors[k]}
          aria-describedby={errors[k] ? `${id}-error` : undefined}
        />
      </Field>
    )
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title={tt('Sabit giderler')}
      description={tt('Aylık tutarları girin; boş bırakabilirsiniz.')}
      size="sm"
      footer={
        <Button variant="primary" loading={busy} onClick={() => void save()}>
          {tt('Kaydet')}
        </Button>
      }
    >
      <form onSubmit={(e) => void save(e)} noValidate className="flex flex-col gap-3">
        {MAIN.map(amountField)}
        <More label={tt('Daha fazla')}>
          <div className="flex flex-col gap-3 pt-1">
            <Field label={tt('Konut durumu')} htmlFor="fixed-housing">
              <Select id="fixed-housing" value={draft.housing} onChange={(e) => setDraft((d) => ({ ...d, housing: e.target.value as Housing | '' }))}>
                <option value="">{tt('Seçin…')}</option>
                {HOUSING_OPTIONS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            {EXTRA.map(amountField)}
            <Field label={tt('Hanede gelir getiren')} htmlFor="fixed-earners">
              <Select id="fixed-earners" value={draft.earners} onChange={(e) => setDraft((d) => ({ ...d, earners: e.target.value as Draft['earners'] }))}>
                <option value="">{tt('Seçin…')}</option>
                <option value="1">{tt('1 kişi')}</option>
                <option value="2">{tt('2 kişi')}</option>
              </Select>
            </Field>
            <Field label={tt('Bakmakla yükümlü olduğunuz kişi')} htmlFor="fixed-dependents" error={errors.dependents}>
              <Input
                id="fixed-dependents"
                inputMode="numeric"
                className="num"
                placeholder="0"
                value={draft.dependents}
                onChange={(e) => setDraft((d) => ({ ...d, dependents: e.target.value.replace(/\D/g, '') }))}
                aria-invalid={!!errors.dependents}
                aria-describedby={errors.dependents ? 'fixed-dependents-error' : undefined}
              />
            </Field>
          </div>
        </More>
        {errors.form && (
          <p role="alert" className="text-[13px] text-danger">
            {errors.form}
          </p>
        )}
      </form>
    </Modal>
  )
}
