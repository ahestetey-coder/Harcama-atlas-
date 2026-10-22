import { useState, type FormEvent } from 'react'
import { toUserMessage } from '../data/repository'
import { dayOf, MAX_CYCLE_START_DAY } from '../domain/dates'
import { personalCycleDay, primarySalary } from '../domain/income'
import { formatKurusPlain, parseUserAmount } from '../domain/money'
import type { Settings } from '../domain/types'
import { useRepo, useSettings } from '../state/data'
import { useUi } from '../state/ui'
import { Modal } from './ui/Modal'
import { Button, Field, Input, Select, Switch } from './ui/primitives'
import { tt, ttf } from '../lib/i18n'

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

/** Anahtarın varsayılanı: döngü zaten maaşa bağlıysa, hiç döngü seçilmemişse ya da seçilen gün maaş günüyse açık. */
function followDefault(s: Settings | undefined, day: number | null): boolean {
  if (s?.cycleSource === 'salary') return true
  if (!s?.cycleSource && !s?.cycleStartDay) return true
  return day !== null && s?.cycleStartDay === day
}

type ErrorAt = { at: 'amount' | 'day' | 'form'; message: string }

/** Net maaş ve maaş günü; isteğe bağlı olarak kişisel ay döngüsü maaş gününde başlar. Her pakette. */
export function SalaryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const repo = useRepo()
  const settings = useSettings()
  const { toast } = useUi()
  const salary = primarySalary(settings?.recurringIncomes)
  const [amount, setAmount] = useState('')
  const [day, setDay] = useState<number | null>(null)
  // null: kullanıcı anahtara dokunmadı, varsayılan seçilen güne göre hesaplanır
  const [follow, setFollow] = useState<boolean | null>(null)
  const [error, setError] = useState<ErrorAt>()
  const [busy, setBusy] = useState(false)
  // Her açılışta alanları kayıtlı maaşla doldur (render sırasında, React'in önerdiği biçimde)
  const [shown, setShown] = useState(false)
  if (open !== shown) {
    setShown(open)
    if (open) {
      setAmount(salary ? formatKurusPlain(salary.amountKurus) : '')
      setDay(salary ? dayOf(salary.startDate) : null)
      setFollow(null)
      setError(undefined)
    }
  }
  const following = follow ?? followDefault(settings, day)

  const save = async (e?: FormEvent) => {
    e?.preventDefault()
    const p = parseUserAmount(amount)
    if (!p.ok || p.kurus <= 0) return setError({ at: 'amount', message: tt('Geçerli bir tutar girin. Örnek: 45.000') })
    if (!day) return setError({ at: 'day', message: tt('Maaş gününü seçin.') })
    setError(undefined)
    setBusy(true)
    try {
      const before = personalCycleDay(settings ?? {})
      const cycleDay = Math.min(MAX_CYCLE_START_DAY, day)
      await repo.saveSalary({ amountKurus: p.kurus, day, followCycle: following })
      toast(following && cycleDay !== before ? ttf('Ayınız artık her ayın {0}. gününde başlıyor.', cycleDay) : tt('Maaş kaydedildi.'))
      onOpenChange(false)
    } catch (err) {
      setError({ at: 'form', message: toUserMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title={tt('Maaş')}
      size="sm"
      footer={
        <Button variant="primary" loading={busy} onClick={() => void save()}>
          {tt('Kaydet')}
        </Button>
      }
    >
      <form onSubmit={(e) => void save(e)} noValidate className="flex flex-col gap-3">
        <Field label={tt('Net maaş (TL)')} htmlFor="salary-amount" error={error?.at === 'amount' ? error.message : undefined}>
          <Input
            id="salary-amount"
            inputMode="decimal"
            className="num"
            placeholder={tt('Örn. 45.000')}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={error?.at === 'amount'}
            aria-describedby={error?.at === 'amount' ? 'salary-amount-error' : undefined}
          />
        </Field>
        <Field
          label={tt('Maaş günü')}
          htmlFor="salary-day"
          hint={following && day !== null && day > MAX_CYCLE_START_DAY ? tt('Ay döngüsü 28\'inde başlar.') : undefined}
          error={error?.at === 'day' ? error.message : undefined}
        >
          <Select id="salary-day" value={day ?? ''} onChange={(e) => setDay(e.target.value ? Number(e.target.value) : null)} aria-invalid={error?.at === 'day'}>
            {day === null && <option value="">{tt('Seçin…')}</option>}
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-ink">{tt('Ayım maaş günümde başlasın')}</span>
          <Switch label={tt('Ayım maaş günümde başlasın')} checked={following} onChange={setFollow} />
        </div>
        {error?.at === 'form' && (
          <p role="alert" className="text-[13px] text-danger">
            {error.message}
          </p>
        )}
      </form>
    </Modal>
  )
}
