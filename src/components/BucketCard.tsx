import { CalendarClock, Plus, Wallet } from 'lucide-react'
import { useState } from 'react'
import { toUserMessage } from '../data/repository'
import { CONSUMER_DEBT_LIMIT, DTI_LIMIT, HOUSING_LIMIT, MIN_SAVING_RATE } from '../domain/assumptions'
import type { BucketBudget, BucketKind } from '../domain/bucketBudget'
import { dayOf, formatDate } from '../domain/dates'
import { personalCycleDay, primarySalary } from '../domain/income'
import { formatKurus } from '../domain/money'
import type { Settings } from '../domain/types'
import { cn } from '../lib/cn'
import { useBudgetSetup } from '../state/budget'
import { useRepo, useSettings } from '../state/data'
import { usePlan } from '../state/plan'
import { useUi } from '../state/ui'
import { FixedCostsDialog } from './FixedCostsDialog'
import { SalaryDialog } from './SalaryDialog'
import { Alert, Button, Card, More } from './ui/primitives'

const ROWS: Array<{ key: BucketKind; label: string; short: string; color: string }> = [
  { key: 'fixed', label: 'Zorunlu sabitler', short: 'zorunlu sabitler', color: 'bg-slate-400 dark:bg-slate-500' },
  { key: 'needs', label: 'İhtiyaçlar', short: 'ihtiyaçlar', color: 'bg-info' },
  { key: 'wants', label: 'İstekler', short: 'istekler', color: 'bg-amber-400' },
  { key: 'saving', label: 'Birikim ve borç kapatma', short: 'birikim ve borç', color: 'bg-accent' },
]

const DESTINATION: Record<'emergency' | 'debt' | 'goals' | 'grow', string> = {
  emergency: 'acil durum fonu',
  debt: 'kart ve kredi borcu',
  goals: 'birikim hedefleri',
  grow: 'uzun vadeli birikim',
}

/** Gelirin payı (0..1) → "%41,7"; tam sayıda ondalık yazılmaz ("%10"). */
export function pctText(x: number): string {
  return `%${(x * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`
}

const limitText = (rate: number) => `%${Math.round(rate * 100)}`

/** Kova çubuğunun ekran okuyucu metni. */
export function bucketAriaLabel(b: BucketBudget): string {
  return `Dağılım: ${ROWS.map((r) => `${r.short} ${pctText(b.buckets[r.key].pct)}`).join(', ')}`
}

/** Kartın tek kalın cümlesi: maaş günü ne kadar birikime ayrılacak ya da açık ne kadar. */
export function bucketHeadline(b: BucketBudget): string {
  if (b.shortfallKurus > 0) return `Giderleriniz gelirinizi ${formatKurus(b.shortfallKurus)} aşıyor.`
  const save = `önce ${formatKurus(b.buckets.saving.kurus)} birikime ayırın`
  if (!b.payday) return `Gelir gelince ${save}.`
  return `${formatDate(b.payday.date, 'weekday')}: ${save}${b.payday.shifted ? ' (maaş hafta sonuna denk geliyor)' : ''}.`
}

/** En fazla bir uyarı: motorun öncelik sırasıyla ilk bozulan kural. */
export function bucketAlert(b: BucketBudget): { tone: 'danger' | 'warning'; text: string } | null {
  const c = b.checks
  switch (b.alert) {
    case 'shortfall':
      return { tone: 'danger', text: `Giderleriniz gelirinizi ${formatKurus(b.shortfallKurus)} aşıyor; bu ay istek ve birikim ayrılmadı.` }
    case 'consumer': {
      const extra = b.saving.debtExtraKurus > 0 ? ` İsteklerden ${formatKurus(b.saving.debtExtraKurus)} borca ayrıldı.` : ''
      return { tone: 'warning', text: `Kart ve kredi ödemeleri: gelirin ${pctText(c.consumerPct)} · önerilen en fazla ${limitText(CONSUMER_DEBT_LIMIT)}.${extra}` }
    }
    case 'dti':
      return { tone: 'warning', text: `Borç ödemeleri: gelirin ${pctText(c.dtiPct)} · önerilen en fazla ${limitText(DTI_LIMIT)}.` }
    case 'housing':
      return { tone: 'warning', text: `Konut gideri: gelirin ${pctText(c.housingPct)} · önerilen en fazla ${limitText(HOUSING_LIMIT)}.` }
    case 'saving':
      return { tone: 'warning', text: `Birikim: gelirin ${pctText(c.savingPct)} · önce ${limitText(MIN_SAVING_RATE)}'a çıkarmayı hedefleyin.` }
    default:
      return null
  }
}

/** Birikim kovasının çoğunun gittiği yer (eşitlikte acil durum fonu > borç > hedefler > uzun vade). */
export function mainDestination(b: BucketBudget): string | null {
  const d = b.destinations
  const list = [
    ['emergency', d.emergencyKurus],
    ['debt', d.debtKurus],
    ['goals', d.goalsKurus],
    ['grow', d.growKurus],
  ] as const
  let best: (typeof list)[number] = list[0]
  for (const x of list) if (x[1] > best[1]) best = x
  return best[1] > 0 ? DESTINATION[best[0]] : null
}

/** Birikimin sıradaki aşaması ve kaç maaş gününde tamamlanacağı; birikim bilinmiyorsa null. */
export function stageText(b: BucketBudget): string | null {
  const { stage, monthsToStage } = b.destinations
  if (!stage) return null
  const name = { starter: '1 aylık fon', debt: 'kart ve kredi borcunu kapatmak', emergency: `${b.emergency.minMonths} aylık fon`, grow: 'uzun vadeli birikim' }[stage]
  return monthsToStage ? `${name}, yaklaşık ${monthsToStage} maaş günü` : name
}

export type BucketChip = 'housing' | 'cycle' | 'raise'

/**
 * En fazla bir öneri: konut gideri yoksa sabit giderler; maaş var ama ay döngüsü hiç seçilmemişse
 * maaş günü; son maaş zamlı görünüyorsa maaşı güncelleme.
 */
export function bucketChip(b: BucketBudget, s: Pick<Settings, 'cycleSource' | 'cycleStartDay' | 'recurringIncomes' | 'budgetProfile' | 'journey'>): BucketChip | null {
  const p = s.budgetProfile
  const housing = p?.housing ?? s.journey?.housing
  // Konut gideri 0 beyan edildiyse ya da ev sahibi/aile yanındaysa sorulmaz
  const housingKnown = b.checks.housingPct > 0 || p?.housingKurus != null || housing === 'owned' || housing === 'family'
  if (!housingKnown) return 'housing'
  const salary = primarySalary(s.recurringIncomes)
  if (salary && !s.cycleSource && !s.cycleStartDay) return 'cycle'
  if (salary && b.salaryUpdateKurus != null) return 'raise'
  return null
}

/**
 * Gelirin dört kovaya dağılımı (zorunlu sabitler, ihtiyaçlar, istekler, birikim ve borç kapatma);
 * her pakette görünür. Ücretsizde hesaplanan harcama bütçesi tek dokunuşla elle bütçeye kopyalanır.
 */
export function BucketCard() {
  const setup = useBudgetSetup()
  const settings = useSettings()
  const repo = useRepo()
  const { has } = usePlan()
  const { toast } = useUi()
  const [salaryOpen, setSalaryOpen] = useState(false)
  const [fixedOpen, setFixedOpen] = useState(false)
  if (!setup || !settings) return null
  const auto = setup.auto
  const b = auto?.buckets ?? null
  const salary = primarySalary(settings.recurringIncomes)

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn()
      toast(msg)
    } catch (e) {
      toast(toUserMessage(e), { kind: 'error' })
    }
  }

  const dialogs = (
    <>
      <SalaryDialog open={salaryOpen} onOpenChange={setSalaryOpen} />
      <FixedCostsDialog open={fixedOpen} onOpenChange={setFixedOpen} />
    </>
  )
  const addSalary = (
    <Button size="sm" variant="soft" icon={<Plus className="size-4" />} onClick={() => setSalaryOpen(true)}>
      Maaşımı ekle
    </Button>
  )

  if (!auto || !b)
    return (
      <Card className="mb-4 p-5" aria-label="Bütçe dağılımı">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <Wallet className="size-5 text-accent" /> Gelirinizin dağılımı
        </h2>
        <p className="mt-1 text-sm text-muted">Maaşınızı ve maaş gününüzü girin; bütçeniz hazır olsun.</p>
        <div className="mt-3">{addSalary}</div>
        {dialogs}
      </Card>
    )

  const source = auto.incomeSource
  const alert = bucketAlert(b)
  const chip = bucketChip(b, settings)
  const destination = mainDestination(b)
  const scale = Math.max(b.incomeKurus, b.buckets.fixed.kurus + b.buckets.needs.kurus)
  const offerCopy = !has('advancedBudget') && setup.mode === 'manual' && b.spendKurus > 0 && settings.monthlyBudgetKurus !== b.spendKurus
  const cycleDay = personalCycleDay({ ...settings, cycleSource: 'salary' })
  const { minMonths, maxMonths, essentialKurus } = b.emergency
  const c = b.checks
  const stage = stageText(b)

  return (
    <Card className="mb-4 p-5" aria-label="Bütçe dağılımı">
      <h2 className="flex items-center gap-2 font-display text-base font-semibold">
        <Wallet className="size-5 text-accent" /> Gelirinizin dağılımı
      </h2>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[13px] text-muted">
        <span className="num min-w-0">
          {source === 'plan' && salary
            ? `Maaş ${formatKurus(salary.amountKurus)} · her ayın ${dayOf(salary.startDate)}. günü`
            : source === 'plan'
              ? `Gelir ${formatKurus(b.incomeKurus)} · düzenli gelirlerinize göre`
              : source === 'records'
                ? `Gelir ${formatKurus(b.incomeKurus)} · son dönemlere göre`
                : `Gelir ${formatKurus(b.incomeKurus)} · Yolculuk testinden`}
        </span>
        {salary ? (
          <Button size="sm" variant="ghost" aria-label="Maaşı değiştir" onClick={() => setSalaryOpen(true)}>
            Değiştir
          </Button>
        ) : (
          addSalary
        )}
      </div>

      <p className={cn('mt-3 font-semibold', b.shortfallKurus > 0 ? 'text-danger' : 'text-ink')}>{bucketHeadline(b)}</p>

      <div role="img" aria-label={bucketAriaLabel(b)} className="mt-3 flex h-3 overflow-hidden rounded-full bg-surface-2">
        {ROWS.map((r) => (
          <div key={r.key} className={cn('h-full', r.color)} style={{ width: `${(b.buckets[r.key].kurus / scale) * 100}%` }} />
        ))}
      </div>

      <dl className="mt-3 text-[13px]">
        {ROWS.map((r) => (
          <div key={r.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 border-b border-line/60 py-1.5 last:border-b-0">
            <dt className="flex min-w-0 items-center gap-2 text-muted">
              <span className={cn('size-2.5 shrink-0 rounded-full', r.color)} aria-hidden />
              {r.label}
            </dt>
            <dd className="num text-ink">
              {formatKurus(b.buckets[r.key].kurus)} <span className="text-subtle">· {pctText(b.buckets[r.key].pct)}</span>
            </dd>
            {r.key === 'saving' && (destination || b.oneOffKurus > 0) && (
              <dd className="col-span-2 mt-0.5 pl-[18px] text-[12.5px] text-subtle">
                {[destination && `→ ${destination}`, b.oneOffKurus > 0 && `+${formatKurus(b.oneOffKurus)} ek gelir`].filter(Boolean).join(' · ')}
              </dd>
            )}
          </div>
        ))}
      </dl>

      {alert && (
        <Alert tone={alert.tone} className="mt-3">
          {alert.text}
        </Alert>
      )}

      {chip === 'housing' ? (
        <Button size="sm" variant="soft" className="mt-3" icon={<Plus className="size-4" />} onClick={() => setFixedOpen(true)}>
          Kira ve borçlarınızı ekleyin
        </Button>
      ) : chip ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-accent-soft px-3 py-2 text-[13px] text-ink">
          <span className="flex min-w-0 items-center gap-2">
            <CalendarClock className="size-4 shrink-0 text-accent" aria-hidden />
            {chip === 'cycle' ? 'Ayınız maaş gününde başlasın mı?' : `Maaşınız ${formatKurus(b.salaryUpdateKurus!)} görünüyor.`}
          </span>
          {chip === 'cycle' ? (
            <Button size="sm" variant="primary" onClick={() => void run(() => repo.saveSettings({ cycleSource: 'salary' }), `Ayınız artık her ayın ${cycleDay}. gününde başlıyor.`)}>
              Başlat
            </Button>
          ) : (
            <Button
              size="sm"
              variant="primary"
              onClick={() =>
                void run(() => repo.saveSalary({ amountKurus: b.salaryUpdateKurus!, day: dayOf(salary!.startDate), followCycle: settings.cycleSource === 'salary' }), 'Maaş güncellendi.')
              }
            >
              Maaşı güncelle
            </Button>
          )}
        </div>
      ) : null}

      {offerCopy && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[13px]">
          <span className="text-muted">
            Harcama bütçesi <span className="num font-semibold text-ink">{formatKurus(b.spendKurus)}</span>
          </span>
          <Button
            size="sm"
            variant="soft"
            onClick={() => void run(() => repo.saveSettings({ budgetMode: 'manual', monthlyBudgetKurus: b.spendKurus }), `Harcama bütçeniz ${formatKurus(b.spendKurus)} oldu.`)}
          >
            Bu bütçeyi kullan
          </Button>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-start justify-between gap-x-3">
        <More label="Nasıl hesaplandı?">
          <ul className="list-disc space-y-1 pl-4">
            <li>
              50/30/20: gelirin yarısı zorunlu giderlere, %30'u isteklere, %20'si birikime. Sizde zorunlu giderler {pctText(c.mustHavePct)}. Önce %5 birikim ve %10 istek ayrılır; sonra birikim %10'a ve %20'ye, istekler en fazla %30'a çıkar.
            </li>
            <li>
              Konut {pctText(c.housingPct)} (en fazla {limitText(HOUSING_LIMIT)}) · borç ödemeleri {pctText(c.dtiPct)} (en fazla {limitText(DTI_LIMIT)}) · kart ve kredi {pctText(c.consumerPct)} (en fazla {limitText(CONSUMER_DEBT_LIMIT)}) · birikim {pctText(c.savingPct)} (en az {limitText(MIN_SAVING_RATE)}). Sınırlar brüt gelire göre tanımlı; net gelire uygulamak daha sıkıdır.
            </li>
            {b.outsideKurus > 0 && <li>Bütçe dışında: kart/KMH ödemesi {formatKurus(b.outsideKurus)}.</li>}
            <li>Kategori payları: TÜİK 2025, üç dönemde sizin harcamanıza geçer.</li>
            <li>
              Acil durum fonu: 1 aylık {formatKurus(essentialKurus)}, sonra {minMonths === maxMonths ? minMonths : `${minMonths}–${maxMonths}`} ay.
              {stage && ` Sıradaki adım: ${stage}.`}
            </li>
            {b.upcoming.map((u) => (
              <li key={u.id}>
                Yaklaşan gelir: {u.name}, {formatDate(u.date, 'long')}, {formatKurus(u.amountKurus)}.
              </li>
            ))}
            {b.reservedKurus > 0 && <li>Yıllık gelirin {formatKurus(b.reservedKurus)} kısmı sonraki aylara ayrıldı.</li>}
            <li>Maaş hafta sonuna denk gelirse önceki iş günü yatar; ayınız maaş gününde başlıyorsa o gelir yine yeni ayınıza sayılır.</li>
            <li>Uygulama yatırım ürünü önermez.</li>
          </ul>
        </More>
        {chip !== 'housing' && (
          <Button size="sm" variant="ghost" onClick={() => setFixedOpen(true)}>
            Sabit giderler
          </Button>
        )}
      </div>
      {dialogs}
    </Card>
  )
}
