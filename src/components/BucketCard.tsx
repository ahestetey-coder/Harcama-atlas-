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
import { tt, ttf } from '../lib/i18n'

const ROWS: Array<{ key: BucketKind; label: string; short: string; color: string }> = [
  { key: 'fixed', label: tt('Zorunlu sabitler'), short: tt('zorunlu sabitler'), color: 'bg-slate-400 dark:bg-slate-500' },
  { key: 'needs', label: tt('İhtiyaçlar'), short: tt('ihtiyaçlar'), color: 'bg-info' },
  { key: 'wants', label: tt('İstekler'), short: 'istekler', color: 'bg-amber-400' },
  { key: 'saving', label: tt('Birikim ve borç kapatma'), short: tt('birikim ve borç'), color: 'bg-accent' },
]

const DESTINATION: Record<'emergency' | 'debt' | 'goals' | 'grow', string> = {
  emergency: tt('acil durum fonu'),
  debt: tt('kart ve kredi borcu'),
  goals: tt('birikim hedefleri'),
  grow: tt('uzun vadeli birikim'),
}

/** Gelirin payı (0..1) → "%41,7"; tam sayıda ondalık yazılmaz ("%10"). */
export function pctText(x: number): string {
  return `%${(x * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`
}

const limitText = (rate: number) => `%${Math.round(rate * 100)}`

/** Kova çubuğunun ekran okuyucu metni. */
export function bucketAriaLabel(b: BucketBudget): string {
  return ttf('Dağılım: {0}', ROWS.map((r) => `${r.short} ${pctText(b.buckets[r.key].pct)}`).join(', '))
}

/** Kartın tek kalın cümlesi: maaş günü ne kadar birikime ayrılacak ya da açık ne kadar. */
export function bucketHeadline(b: BucketBudget): string {
  if (b.shortfallKurus > 0) return ttf('Giderleriniz gelirinizi {0} aşıyor.', formatKurus(b.shortfallKurus))
  const save = ttf('önce {0} birikime ayırın', formatKurus(b.buckets.saving.kurus))
  if (!b.payday) return ttf('Gelir gelince {0}.', save)
  return `${formatDate(b.payday.date, 'weekday')}: ${save}${b.payday.shifted ? tt(' (maaş hafta sonuna denk geliyor)') : ''}.`
}

/** En fazla bir uyarı: motorun öncelik sırasıyla ilk bozulan kural. */
export function bucketAlert(b: BucketBudget): { tone: 'danger' | 'warning'; text: string } | null {
  const c = b.checks
  switch (b.alert) {
    case 'shortfall':
      return { tone: 'danger', text: ttf('Giderleriniz gelirinizi {0} aşıyor; bu ay istek ve birikim ayrılmadı.', formatKurus(b.shortfallKurus)) }
    case 'consumer': {
      const extra = b.saving.debtExtraKurus > 0 ? ttf(' İsteklerden {0} borca ayrıldı.', formatKurus(b.saving.debtExtraKurus)) : ''
      return { tone: 'warning', text: ttf('Kart ve kredi ödemeleri: gelirin {0} · önerilen en fazla {1}.{2}', pctText(c.consumerPct), limitText(CONSUMER_DEBT_LIMIT), extra) }
    }
    case 'dti':
      return { tone: 'warning', text: ttf('Borç ödemeleri: gelirin {0} · önerilen en fazla {1}.', pctText(c.dtiPct), limitText(DTI_LIMIT)) }
    case 'housing':
      return { tone: 'warning', text: ttf('Konut gideri: gelirin {0} · önerilen en fazla {1}.', pctText(c.housingPct), limitText(HOUSING_LIMIT)) }
    case 'saving':
      return { tone: 'warning', text: ttf('Birikim: gelirin {0} · önce {1}\'a çıkarmayı hedefleyin.', pctText(c.savingPct), limitText(MIN_SAVING_RATE)) }
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
  const name = { starter: tt('1 aylık fon'), debt: tt('kart ve kredi borcunu kapatmak'), emergency: ttf('{0} aylık fon', b.emergency.minMonths), grow: tt('uzun vadeli birikim') }[stage]
  return monthsToStage ? ttf('{0}, yaklaşık {1} maaş günü', name, monthsToStage) : name
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
      {tt('Maaşımı ekle')}
    </Button>
  )

  if (!auto || !b)
    return (
      <Card className="mb-4 p-5" aria-label={tt('Bütçe dağılımı')}>
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <Wallet className="size-5 text-accent" /> {tt('Gelirinizin dağılımı')}
        </h2>
        <p className="mt-1 text-sm text-muted">{tt('Maaşınızı ve maaş gününüzü girin; bütçeniz hazır olsun.')}</p>
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
    <Card className="mb-4 p-5" aria-label={tt('Bütçe dağılımı')}>
      <h2 className="flex items-center gap-2 font-display text-base font-semibold">
        <Wallet className="size-5 text-accent" /> {tt('Gelirinizin dağılımı')}
      </h2>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[13px] text-muted">
        <span className="num min-w-0">
          {source === 'plan' && salary
            ? ttf('Maaş {0} · her ayın {1}. günü', formatKurus(salary.amountKurus), dayOf(salary.startDate))
            : source === 'plan'
              ? ttf('Gelir {0} · düzenli gelirlerinize göre', formatKurus(b.incomeKurus))
              : source === 'records'
                ? ttf('Gelir {0} · son dönemlere göre', formatKurus(b.incomeKurus))
                : ttf('Gelir {0} · Yolculuk testinden', formatKurus(b.incomeKurus))}
        </span>
        {salary ? (
          <Button size="sm" variant="ghost" aria-label={tt('Maaşı değiştir')} onClick={() => setSalaryOpen(true)}>
            {tt('Değiştir')}
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
                {[destination && `→ ${destination}`, b.oneOffKurus > 0 && ttf('+{0} ek gelir', formatKurus(b.oneOffKurus))].filter(Boolean).join(' · ')}
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
          {tt('Kira ve borçlarınızı ekleyin')}
        </Button>
      ) : chip ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-accent-soft px-3 py-2 text-[13px] text-ink">
          <span className="flex min-w-0 items-center gap-2">
            <CalendarClock className="size-4 shrink-0 text-accent" aria-hidden />
            {chip === 'cycle' ? tt('Ayınız maaş gününde başlasın mı?') : ttf('Maaşınız {0} görünüyor.', formatKurus(b.salaryUpdateKurus!))}
          </span>
          {chip === 'cycle' ? (
            <Button size="sm" variant="primary" onClick={() => void run(() => repo.saveSettings({ cycleSource: 'salary' }), ttf('Ayınız artık her ayın {0}. gününde başlıyor.', cycleDay))}>
              {tt('Başlat')}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="primary"
              onClick={() =>
                void run(() => repo.saveSalary({ amountKurus: b.salaryUpdateKurus!, day: dayOf(salary!.startDate), followCycle: settings.cycleSource === 'salary' }), tt('Maaş güncellendi.'))
              }
            >
              {tt('Maaşı güncelle')}
            </Button>
          )}
        </div>
      ) : null}

      {offerCopy && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[13px]">
          <span className="text-muted">
            {tt('Harcama bütçesi')} <span className="num font-semibold text-ink">{formatKurus(b.spendKurus)}</span>
          </span>
          <Button
            size="sm"
            variant="soft"
            onClick={() => void run(() => repo.saveSettings({ budgetMode: 'manual', monthlyBudgetKurus: b.spendKurus }), ttf('Harcama bütçeniz {0} oldu.', formatKurus(b.spendKurus)))}
          >
            {tt('Bu bütçeyi kullan')}
          </Button>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-start justify-between gap-x-3">
        <More label={tt('Nasıl hesaplandı?')}>
          <ul className="list-disc space-y-1 pl-4">
            <li>
              {ttf('50/30/20: gelirin yarısı zorunlu giderlere, %30\'u isteklere, %20\'si birikime. Sizde zorunlu giderler {0}. Önce %5 birikim ve %10 istek ayrılır; sonra birikim %10\'a ve %20\'ye, istekler en fazla %30\'a çıkar.', pctText(c.mustHavePct))}</li>
            <li>
              {ttf('Konut {0} (en fazla {1}) · borç ödemeleri {2} (en fazla {3}) · kart ve kredi {4} (en fazla {5}) · birikim {6} (en az {7}). Sınırlar brüt gelire göre tanımlı; net gelire uygulamak daha sıkıdır.', pctText(c.housingPct), limitText(HOUSING_LIMIT), pctText(c.dtiPct), limitText(DTI_LIMIT), pctText(c.consumerPct), limitText(CONSUMER_DEBT_LIMIT), pctText(c.savingPct), limitText(MIN_SAVING_RATE))}</li>
            {b.outsideKurus > 0 && <li>{ttf('Bütçe dışında: kart/KMH ödemesi {0}.', formatKurus(b.outsideKurus))}</li>}
            <li>{tt('Kategori payları: TÜİK 2025, üç dönemde sizin harcamanıza geçer.')}</li>
            <li>
              {tt('Acil durum fonu: 1 aylık')} {formatKurus(essentialKurus)}{tt(', sonra')} {minMonths === maxMonths ? minMonths : `${minMonths}–${maxMonths}`} {tt('ay.')}
              {stage && ttf(' Sıradaki adım: {0}.', stage)}
            </li>
            {b.upcoming.map((u) => (
              <li key={u.id}>
                {ttf('Yaklaşan gelir: {0}, {1}, {2}.', u.name, formatDate(u.date, 'long'), formatKurus(u.amountKurus))}</li>
            ))}
            {b.reservedKurus > 0 && <li>{ttf('Yıllık gelirin {0} kısmı sonraki aylara ayrıldı.', formatKurus(b.reservedKurus))}</li>}
            <li>{tt('Maaş hafta sonuna denk gelirse önceki iş günü yatar; ayınız maaş gününde başlıyorsa o gelir yine yeni ayınıza sayılır.')}</li>
            <li>{tt('Uygulama yatırım ürünü önermez.')}</li>
          </ul>
        </More>
        {chip !== 'housing' && (
          <Button size="sm" variant="ghost" onClick={() => setFixedOpen(true)}>
            {tt('Sabit giderler')}
          </Button>
        )}
      </div>
      {dialogs}
    </Card>
  )
}
