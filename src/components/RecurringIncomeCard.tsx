import { Pencil, Trash2, Wallet } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { toUserMessage } from '../data/repository'
import { todayIso } from '../domain/dates'
import { formatKurus, formatKurusPlain, parseUserAmount } from '../domain/money'
import { CADENCE_LABEL, INCOME_KIND_LABEL, type IncomeKind, type RecurringCadence, type RecurringIncome } from '../domain/types'
import { useRepo, useSettings } from '../state/data'
import { useUi } from '../state/ui'
import { Button, Card, Field, IconButton, Input, Select } from './ui/primitives'

interface Draft {
  id?: string
  name: string
  kind: IncomeKind
  amount: string
  startDate: string
  cadence: RecurringCadence
}

const EMPTY: Draft = { name: '', kind: 'salary', amount: '', startDate: todayIso(), cadence: 'monthly' }

function whenLabel(it: RecurringIncome): string {
  const day = Number(it.startDate.slice(8, 10))
  if (it.cadence === 'monthly') return `her ayın ${day}. günü`
  return CADENCE_LABEL[it.cadence].toLocaleLowerCase('tr')
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
    if (!draft.name.trim()) return setError('Bir ad girin (ör. Maaş).')
    if (!amt.ok || amt.kurus <= 0) return setError('Geçerli bir tutar girin. Örnek: 45.000')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.startDate)) return setError('İlk gelir gününü seçin.')
    try {
      await repo.saveRecurringIncome({ id: draft.id, name: draft.name, kind: draft.kind, amountKurus: amt.kurus, cadence: draft.cadence, startDate: draft.startDate, active: true })
      toast(draft.id ? 'Düzenli gelir güncellendi.' : 'Düzenli gelir eklendi.')
      setDraft(null)
      setError(undefined)
    } catch (err) {
      setError(toUserMessage(err))
    }
  }

  const remove = async (it: RecurringIncome) => {
    await repo.deleteRecurringIncome(it.id)
    toast(`${it.name} düzenli gelirlerden çıkarıldı. Önceki kayıtlarınız değişmez.`)
  }

  return (
    <Card ref={ref} id="duzenli-gelirler" className="scroll-mt-20 p-5" aria-label="Düzenli gelirler">
      <h2 className="flex items-center gap-2 font-display text-base font-semibold">
        <Wallet className="size-5 text-accent" /> Düzenli gelirler
      </h2>
      <p className="mt-1 text-sm text-muted">Maaş, kira geliri gibi. Günü gelince özetinize kendiliğinden eklenir; o ay geliri elle girerseniz iki kez sayılmaz. Yalnızca bu cihazda tutulur.</p>

      {items.length > 0 && (
        <ul className="mt-3 divide-y divide-line" aria-label="Düzenli gelir listesi">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink">{it.name}</div>
                <div className="text-[12.5px] text-muted">
                  {INCOME_KIND_LABEL[it.kind]} · {whenLabel(it)}
                </div>
              </div>
              <span className="num text-sm font-semibold text-ink">{formatKurus(it.amountKurus)}</span>
              <IconButton size="sm" label={`${it.name} düzenle`} onClick={() => setDraft({ id: it.id, name: it.name, kind: it.kind, amount: formatKurusPlain(it.amountKurus), startDate: it.startDate, cadence: it.cadence })}>
                <Pencil className="size-4" />
              </IconButton>
              <IconButton size="sm" label={`${it.name} sil`} onClick={() => void remove(it)}>
                <Trash2 className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      {draft ? (
        <form onSubmit={save} noValidate className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Ad" htmlFor="ri-name">
            <Input id="ri-name" value={draft.name} maxLength={80} placeholder="Örn. Maaş" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </Field>
          <Field label="Tür" htmlFor="ri-kind">
            <Select id="ri-kind" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as IncomeKind })}>
              {(Object.keys(INCOME_KIND_LABEL) as IncomeKind[]).map((k) => (
                <option key={k} value={k}>
                  {INCOME_KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tutar (TL)" htmlFor="ri-amount">
            <Input id="ri-amount" className="num" inputMode="decimal" placeholder="0,00" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
          </Field>
          <Field label="İlk gelir günü" htmlFor="ri-date">
            <Input id="ri-date" type="date" value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} />
          </Field>
          <Field label="Sıklık" htmlFor="ri-cadence">
            <Select id="ri-cadence" value={draft.cadence} onChange={(e) => setDraft({ ...draft, cadence: e.target.value as RecurringCadence })}>
              {(['monthly', 'weekly', 'yearly'] as RecurringCadence[]).map((c) => (
                <option key={c} value={c}>
                  {CADENCE_LABEL[c]}
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
              Vazgeç
            </Button>
            <Button type="submit" variant="primary">
              Kaydet
            </Button>
          </div>
        </form>
      ) : (
        <Button size="sm" className="mt-4" onClick={() => setDraft({ ...EMPTY, startDate: todayIso() })}>
          Düzenli gelir ekle
        </Button>
      )}
    </Card>
  )
}
