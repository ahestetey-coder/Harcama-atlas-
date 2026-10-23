import { Pencil, Trash2, Wallet } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { toUserMessage } from '../data/repository'
import { formatDate, todayIso } from '../domain/dates'
import { formatKurus, formatKurusPlain, parseUserAmount } from '../domain/money'
import { INCOME_CADENCE_LABEL, INCOME_KIND_LABEL, type IncomeCadence, type IncomeKind, type RecurringIncome } from '../domain/types'
import { useRepo, useSettings } from '../state/data'
import { useUi } from '../state/ui'
import { Button, Card, Field, IconButton, Input, More, Select } from './ui/primitives'
import { tt, ttf } from '../lib/i18n'

interface Draft {
  id?: string
  name: string
  kind: IncomeKind
  amount: string
  startDate: string
  cadence: IncomeCadence
}

const EMPTY: Draft = { name: '', kind: 'salary', amount: '', startDate: todayIso(), cadence: 'monthly' }

function whenLabel(it: RecurringIncome): string {
  const day = Number(it.startDate.slice(8, 10))
  if (it.cadence === 'monthly') return ttf('her ayın {0}. günü', day)
  if (it.cadence === 'once') return ttf('tek sefer · {0}', formatDate(it.startDate, 'long'))
  return INCOME_CADENCE_LABEL[it.cadence].toLocaleLowerCase('tr')
}

/** Tarih alanının adı ve boş bırakılınca gösterilen uyarı (gelirin türüne ve sıklığına göre). */
function dateField(d: Pick<Draft, 'kind' | 'cadence'>): { label: string; missing: string } {
  if (d.cadence === 'once') return { label: tt('Tarih'), missing: tt('Tarihi seçin.') }
  if (d.kind === 'salary' && d.cadence === 'monthly') return { label: tt('Maaş günü'), missing: tt('Maaş gününü seçin.') }
  return { label: tt('İlk gelir günü'), missing: tt('İlk gelir gününü seçin.') }
}

/** Maaş, kira geliri gibi düzenli gelirler: günü gelince özete kendiliğinden eklenir. */
export function RecurringIncomeCard() {
  const repo = useRepo()
  const items = useSettings()?.recurringIncomes ?? []
  const { toast } = useUi()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string>()
  const ref = useRef<HTMLElement>(null)

  // Bağlantıyla (#duzenli-gelirler) gelindiyse karta kaydır
  useEffect(() => {
    if (window.location.hash.endsWith('#duzenli-gelirler')) ref.current?.scrollIntoView({ block: 'start' })
  }, [])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!draft) return
    const amt = parseUserAmount(draft.amount)
    if (!draft.name.trim()) return setError(tt('Bir ad girin (ör. Maaş).'))
    if (!amt.ok || amt.kurus <= 0) return setError(tt('Geçerli bir tutar girin. Örnek: 45.000'))
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.startDate)) return setError(dateField(draft).missing)
    try {
      await repo.saveRecurringIncome({ id: draft.id, name: draft.name, kind: draft.kind, amountKurus: amt.kurus, cadence: draft.cadence, startDate: draft.startDate, active: true })
      const once = draft.cadence === 'once'
      toast(draft.id ? (once ? tt('Tek seferlik gelir güncellendi.') : tt('Düzenli gelir güncellendi.')) : once ? tt('Tek seferlik gelir eklendi.') : tt('Düzenli gelir eklendi.'))
      setDraft(null)
      setError(undefined)
    } catch (err) {
      setError(toUserMessage(err))
    }
  }

  const remove = async (it: RecurringIncome) => {
    await repo.deleteRecurringIncome(it.id)
    toast(ttf('{0} düzenli gelirlerden çıkarıldı. Önceki kayıtlarınız değişmez.', it.name))
  }

  return (
    <Card ref={ref} id="duzenli-gelirler" className="scroll-mt-20 p-5" aria-label={tt('Düzenli gelirler')}>
      <h2 className="flex items-center gap-2 font-display text-base font-semibold">
        <Wallet className="size-5 text-accent" /> {tt('Düzenli gelirler')}
      </h2>
      <p className="mt-1 text-sm text-muted">{tt('Maaş gibi gelirler, günü gelince eklenir.')}</p>
      <More>{tt('O ay geliri elle girerseniz iki kez sayılmaz. Yalnızca bu cihazda tutulur.')}</More>

      {items.length > 0 && (
        <ul className="mt-3 divide-y divide-line" aria-label={tt('Düzenli gelir listesi')}>
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink">{it.name}</div>
                <div className="text-[12.5px] text-muted">
                  {INCOME_KIND_LABEL[it.kind]} · {whenLabel(it)}
                </div>
              </div>
              <span className="num text-sm font-semibold text-ink">{formatKurus(it.amountKurus)}</span>
              <IconButton size="sm" label={ttf('{0} düzenle', it.name)} onClick={() => setDraft({ id: it.id, name: it.name, kind: it.kind, amount: formatKurusPlain(it.amountKurus), startDate: it.startDate, cadence: it.cadence })}>
                <Pencil className="size-4" />
              </IconButton>
              <IconButton size="sm" label={ttf('{0} sil', it.name)} onClick={() => void remove(it)}>
                <Trash2 className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      {draft ? (
        <form onSubmit={save} noValidate className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={tt('Ad')} htmlFor="ri-name">
            <Input id="ri-name" value={draft.name} maxLength={80} placeholder={tt('Örn. Maaş')} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </Field>
          <Field label={tt('Tür')} htmlFor="ri-kind">
            <Select id="ri-kind" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as IncomeKind })}>
              {(Object.keys(INCOME_KIND_LABEL) as IncomeKind[]).map((k) => (
                <option key={k} value={k}>
                  {INCOME_KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={tt('Tutar (TL)')} htmlFor="ri-amount">
            <Input id="ri-amount" className="num" inputMode="decimal" placeholder="0,00" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
          </Field>
          <Field label={dateField(draft).label} htmlFor="ri-date">
            <Input id="ri-date" type="date" value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} />
          </Field>
          <Field label={tt('Sıklık')} htmlFor="ri-cadence">
            <Select id="ri-cadence" value={draft.cadence} onChange={(e) => setDraft({ ...draft, cadence: e.target.value as IncomeCadence })}>
              {(Object.keys(INCOME_CADENCE_LABEL) as IncomeCadence[]).map((c) => (
                <option key={c} value={c}>
                  {INCOME_CADENCE_LABEL[c]}
                </option>
              ))}
            </Select>
          </Field>
          {error && (
            <p role="alert" className="text-sm text-danger sm:col-span-2">
              {error}
            </p>
          )}
          <div className="flex gap-2 sm:col-span-2">
            <Button variant="ghost" onClick={() => (setDraft(null), setError(undefined))}>
              {tt('Vazgeç')}
            </Button>
            <Button type="submit" variant="primary">
              {tt('Kaydet')}
            </Button>
          </div>
        </form>
      ) : (
        <Button size="sm" className="mt-4" onClick={() => setDraft({ ...EMPTY, startDate: todayIso() })}>
          {tt('Düzenli gelir ekle')}
        </Button>
      )}
    </Card>
  )
}
