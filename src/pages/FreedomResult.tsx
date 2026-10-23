import { BookOpen, CalendarCheck, Check, Gauge, Hourglass, PiggyBank, Target } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Slider } from '../components/Slider'
import { Button, Card, Input, More } from '../components/ui/primitives'
import { FAT_FACTOR, LEAN_FACTOR, MC_RUNS } from '../domain/assumptions'
import { MONTH_NAMES } from '../domain/dates'
import { buildFreedomPlan, durationLabel, planAmountToKurus, formatInBase, freedomSteps, reachDateLabel, type BaseRates, type FreedomPlan, type JourneyFacts, type JourneyProfile, type PlanBase } from '../domain/journey'
import { formatKurus } from '../domain/money'
import { cn } from '../lib/cn'
import { toUserMessage } from '../data/repository'
import { useRepo } from '../state/data'
import { useUi } from '../state/ui'
import { tt, ttf } from '../lib/i18n'

const shortTl = (k: number) => {
  const v = k / 100
  const a = Math.abs(v)
  if (a >= 1e9) return `${(v / 1e9).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} mr`
  if (a >= 1e6) return `${(v / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} mn`
  if (a >= 1e3) return `${Math.round(v / 1e3).toLocaleString('tr-TR')} bin`
  return Math.round(v).toLocaleString('tr-TR')
}

/**
 * Özgürlük Rotası v2 sonuç ekranı: hedef, seviyeler, gereken birikim, Coast FI, başarı oranı,
 * borçsuz olma tarihi, %10–%90 bantlı projeksiyon, kaldıraçlar ve gelecekteki hedef (TL/USD/altın).
 */
export function FreedomResult({ profile, facts, rates, plan, strategy, today }: { profile: JourneyProfile; facts: JourneyFacts; rates: BaseRates; plan: FreedomPlan; strategy: 'avalanche' | 'snowball'; today: string }) {
  const base: PlanBase = profile.base ?? 'TRY'
  const inBase = (k: number) => (base === 'TRY' ? formatKurus(k) : (formatInBase(k, base, rates) ?? formatKurus(k)))
  const [y, mo] = today.split('-').map(Number)
  const ageDate = (age: number) => `${MONTH_NAMES[mo - 1]} ${y + Math.round(age - plan.age)}`

  // Kaldıraçlar: kaydedilmez, yalnızca "ne olurdu" hesabı
  const [extra, setExtra] = useState(0)
  const [tAge, setTAge] = useState(plan.targetAge)
  const [pct, setPct] = useState(plan.spendPct)
  const changed = extra !== 0 || tAge !== plan.targetAge || pct !== plan.spendPct
  const lever = useMemo(() => {
    if (!changed) return plan
    const p: JourneyProfile = { ...profile, targetAge: tAge, horizonYears: Math.max(1, tAge - plan.age), targetSpendPct: pct }
    if (!profile.spending) p.targetMonthlyExpenseKurus = Math.round((profile.targetMonthlyExpenseKurus * pct) / 100)
    return buildFreedomPlan(p, facts, { rates, strategy, extraMonthlyKurus: extra, runs: MC_RUNS })
  }, [changed, plan, profile, facts, rates, strategy, extra, tAge, pct])
  const v = lever

  // Simülasyon ve rota ile aynı: orta senaryoyla varış yaşı
  const midAge = v.route.mid === null ? null : v.age + Math.ceil(v.route.mid / 12)
  const late = midAge === null || midAge > v.targetAge
  const debtDate = v.debtFreeMonth === null ? tt('Kapanmıyor') : v.debtFreeMonth === 0 ? tt('Borç yok') : reachDateLabel(v.debtFreeMonth, today)
  const nextEnds = [...v.debtEnds.filter((d) => d.month !== null).map((d) => ({ name: d.name, month: d.month!, freed: d.freedKurus })), ...v.recurringEnds.map((r) => ({ name: r.name, month: r.month, freed: r.freedKurus }))].sort((a, b) => a.month - b.month)
  const steps = freedomSteps(v, inBase)
  const step = v.netKurus < v.leanKurus ? (steps.find((x) => !x.done) ?? null) : null
  const levels = [
    ...steps.map((x) => ({ key: x.id, label: x.title, stage: tt('Ara adım'), value: x.targetKurus })),
    { key: 'lean', label: ttf('Lean FI · sade (%{0})', LEAN_FACTOR * 100), stage: tt('Finansal güvence'), value: v.leanKurus },
    { key: 'fi', label: tt('FI · hedefiniz'), stage: tt('Finansal bağımsızlık'), value: v.fiKurus },
    { key: 'fat', label: ttf('Fat FI · rahat (%{0})', FAT_FACTOR * 100), stage: tt('Finansal özgürlük'), value: v.fatKurus },
  ]

  return (
    <section className="flex flex-col gap-4" aria-label={tt('Özgürlük hedefi')}>
      <Card className="p-5">
        {step ? (
          <>
            <div className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">{ttf('Sıradaki özgürlük adımınız · {0}', step.title)}</div>
            <div className="num mt-1 font-display text-[34px] font-bold leading-none text-ink">{inBase(step.targetKurus)}</div>
            <p className="mt-1.5 text-[13px] text-muted">
              {step.what}. {step.leftText}
              {step.etaMonths != null && ttf(', bu hızla ~{0}', durationLabel(step.etaMonths))}.
            </p>
            <p className="mt-1 text-[12.5px] text-subtle">{ttf('Tam bağımsızlık hedefi {0}; oraya bu küçük adımlarla gidilir. Bugünün parasıyla.', inBase(v.fiKurus))}</p>
          </>
        ) : (
          <>
            <div className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">{tt('Finansal özgürlük hedefiniz')}</div>
            <div className="num mt-1 font-display text-[34px] font-bold leading-none text-ink">{inBase(v.fiKurus)}</div>
            <p className="mt-1.5 text-[13px] text-muted">{tt('Bugünün parasıyla.')}</p>
          </>
        )}
        <More>
          {ttf('Yıllık {0} çekim ÷ %{1} çekim oranı ({2} yıllık çekim süresi {3}).', formatKurus(v.annualNeedKurus), v.withdrawal.usedPct.toLocaleString('tr-TR'), v.retirementYears, v.withdrawal.custom ? ttf('; önerilen %{0}', v.withdrawal.recommendedPct.toLocaleString('tr-TR')) : tt(', süreye göre önerilen'))}</More>
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3" role="group" aria-label={tt('Canlı özet')}>
          <Mini label={tt('Hedef birikim')} value={base === 'TRY' ? shortTl(v.fiKurus) + ' ₺' : inBase(v.fiKurus)} />
          <Mini label={tt('Bugünkü hızla')} value={midAge === null ? tt('Ulaşılamıyor') : ttf('{0} yaşında', midAge)} tone={late ? 'warn' : 'good'} />
          <Mini label={tt('Tasarruf oranı')} value={`%${Math.round(v.savingRate * 100)}`} />
        </div>
        <OwnGoal profile={profile} rates={rates} plan={plan} inBase={inBase} />
        <ol className="mt-4 flex flex-col gap-1.5" aria-label={tt('Seviyeler')}>
          {levels.map((l, i) => {
            const done = v.netKurus >= l.value
            const focus = step ? l.key === step.id : l.key === 'fi'
            return (
              <li key={l.key} className={cn('flex items-center gap-3 rounded-xl border px-3 py-2.5', focus ? 'border-accent bg-accent-soft/40' : 'border-line')}>
                <span className={cn('grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-bold', done ? 'bg-accent text-white' : focus ? 'border-2 border-accent text-accent' : 'border border-line text-muted')} aria-hidden>
                  {done ? <Check className="size-4" strokeWidth={3} /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-medium text-ink">{l.label}</div>
                  <div className={cn('text-[11.5px]', done ? 'font-medium text-accent' : 'text-subtle')}>
                    {l.stage}
                    {done ? tt(' · ulaşıldı') : focus ? tt(' · sıradaki') : ''}
                  </div>
                </div>
                <div className="num shrink-0 text-[15px] font-semibold text-ink">{inBase(l.value)}</div>
              </li>
            )
          })}
        </ol>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Kpi icon={<PiggyBank className="size-4" />} label={ttf('{0} yaşında bağımsız olmak için', v.targetAge)} tone={v.gapKurus > 0 ? 'warn' : 'good'} value={ttf('{0} ₺/ay', Math.round(v.requiredMonthlyKurus / 100).toLocaleString('tr-TR'))}>
          {ttf('Şu an {0} ₺/ay {1}', Math.round(v.monthlySavingKurus / 100).toLocaleString('tr-TR'), v.gapKurus > 0 ? (midAge === null ? tt(' · bu hızla ulaşılamıyor') : ttf(' · bu hızla {0} yaşında', midAge)) : tt(' · yetiyor'))}
        </Kpi>
        <Kpi icon={<Hourglass className="size-4" />} label={tt('Coast FI eşiği')} tone={v.coastPassed ? 'good' : undefined} value={inBase(v.coastKurus)}>
          {v.coastPassed ? tt('Geçtiniz; eklemeseniz de yetiyor.') : ttf('Net birikiminiz {0}.', inBase(v.netKurus))}
        </Kpi>
        <Kpi icon={<Gauge className="size-4" />} label={tt('Başarı olasılığı')} tone={v.successRate >= 0.8 ? 'good' : v.successRate < 0.6 ? 'warn' : undefined} value={`%${Math.round(v.successRate * 100)}`}>
          {tt('Varsayıma dayalı benzetimdir, garanti değildir.')}
        </Kpi>
        <Kpi icon={<CalendarCheck className="size-4" />} label={tt('Borçsuz olma tarihi')} value={debtDate}>
          {nextEnds.length
            ? nextEnds
                .slice(0, 3)
                .map((e) => ttf('{0}: {1} (+{2}/ay birikime)', e.name, reachDateLabel(e.month, today), formatKurus(e.freed)))
                .join(' · ')
            : tt('Biten borç ya da taksit yok.')}
          {v.debtEnds.length > 0 && ttf(' Sıra: {0}.', strategy === 'avalanche' ? tt('önce en yüksek faiz') : tt('önce en küçük borç'))}
        </Kpi>
      </div>

      <Card className="p-4 sm:p-5" aria-label={tt('Kaldıraçlar')}>
        <h3 className="font-display text-base font-semibold">{tt('Kaldıraçlarla oynayın')}</h3>
        <p className="mt-0.5 text-[12.5px] text-muted">{tt('Değişiklikler kaydedilmez.')}</p>
        <div className="mt-3 flex flex-col gap-4">
          <Slider id="l-extra" label={tt('Aylık ek birikim')} value={extra / 100} min={0} max={Math.max(50000, Math.ceil(plan.levers.extraMonthlyKurus / 100 / 5000) * 5000 + 10000)} step={500} onChange={(x) => setExtra(x * 100)} display={(x) => `+${formatKurus(x * 100)}`} />
          <Slider id="l-age" label={tt('Hedef yaş')} value={tAge} min={plan.age + 1} max={Math.max(plan.age + 2, plan.lifeAge - 1)} onChange={setTAge} display={(x) => ttf('{0} yaş', x)} />
          <Slider id="l-pct" label={tt('Hedef harcama düzeyi')} value={pct} min={50} max={160} step={5} onChange={setPct} display={(x) => `%${x}`} />
        </div>
        <ul className="mt-4 flex list-disc flex-col gap-1.5 pl-5 text-[13px] text-muted" aria-label={tt('Tek başına yeterli değerler')}>
          {plan.gapKurus > 0 ? (
            <>
              <li>
                {tt('Ayda')} <strong className="text-ink">{formatKurus(plan.levers.extraMonthlyKurus)}</strong> {tt('ek birikim tek başına yeterli.')}
              </li>
              <li>{plan.levers.targetAge !== null ? <>{tt('Hedef yaşı')} <strong className="text-ink">{plan.levers.targetAge}</strong> {tt('yapmak tek başına yeterli.')}</> : tt('Bugünkü birikimle hiçbir hedef yaşta yetmiyor.')}</li>
              <li>
                {tt('Hedef harcama düzeyini')} <strong className="text-ink">%{Math.min(plan.spendPct, plan.levers.spendPct)}</strong> {tt('yapmak tek başına yeterli.')}
              </li>
            </>
          ) : (
            <li>
              {ttf('Bugünkü hızınızla hedefin önündesiniz{0}.', plan.levers.targetAge !== null && plan.levers.targetAge < plan.targetAge ? ttf('; {0} yaşında bırakmak da yetiyor', plan.levers.targetAge) : '')}</li>
          )}
          {changed && (
            <li>
              {ttf('Bu ayarlarla: gereken {0}/ay, başarı %{1}, {2}.', formatKurus(v.requiredMonthlyKurus), Math.round(v.successRate * 100), midAge === null ? tt('hedefe ulaşılamıyor') : ttf('hedefe {0} yaşında ulaşılır', midAge))}</li>
          )}
        </ul>
      </Card>

      <Card className="p-4 sm:p-5" aria-label={tt('Gelecekteki hedef')}>
        <h3 className="flex items-center gap-2 font-display text-base font-semibold">
          <Target className="size-4 text-accent" /> {tt('Hedef tarihte (')}{ageDate(v.targetAge)}{tt(') hedefiniz')}
        </h3>
        <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Future label={tt('TL (nominal)')} value={formatKurus(v.future.tlNominalKurus)} note={ttf('Yıllık %{0} enflasyonla.', v.future.inflationPct.toLocaleString('tr-TR'))} />
          <Future
            label="USD"
            value={v.future.usd === null ? '—' : `${v.future.usd.toLocaleString('tr-TR')} $`}
            note={base === 'USD' ? tt('Plan birimi USD: hedef bu tutarda sabit.') : tt('Güncel kurla.')}
          />
          <Future
            label={tt('Gram altın')}
            value={v.future.goldGr === null ? '—' : `${v.future.goldGr.toLocaleString('tr-TR')} gr`}
            note={base === 'XAU' ? tt('Plan birimi altın: hedef bu miktarda sabit.') : tt('Güncel gram fiyatıyla.')}
          />
        </dl>
      </Card>

      <p className="text-[12.5px] text-muted">
        {tt('Yatırım tavsiyesi değildir.')}{' '}
        <Link to="/ogren#varsayimlar" className="inline-flex items-center gap-1 font-medium text-accent">
          <BookOpen className="size-3.5" /> {tt('Varsayımlar ve kaynaklar')}
        </Link>
      </p>
    </section>
  )
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'warn' }) {
  return (
    <div className="min-w-0">
      <div className="text-[11.5px] text-muted">{label}</div>
      <div className={cn('num truncate text-[15px] font-semibold', tone === 'warn' ? 'text-warning' : 'text-ink')}>{value}</div>
    </div>
  )
}

function Kpi({ icon, label, value, tone, children }: { icon: React.ReactNode; label: string; value: string; tone?: 'good' | 'warn'; children: React.ReactNode }) {
  return (
    <Card className={cn('border-t-2 p-4', tone === 'good' ? 'border-t-[var(--accent)]' : tone === 'warn' ? 'border-t-[var(--warning)]' : '')} aria-label={label}>
      <div className="flex items-center gap-2 text-[12.5px] font-semibold text-muted">
        <span className="text-accent">{icon}</span> {label}
      </div>
      <div className="num mt-1.5 font-display text-xl font-semibold text-ink">{value}</div>
      <p className="mt-1 text-[12.5px] text-muted">{children}</p>
    </Card>
  )
}

function Future({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div>
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className="num text-[16px] font-semibold text-ink">{value}</dd>
      <dd className="mt-0.5 text-[11.5px] text-subtle">{note}</dd>
    </div>
  )
}

/** Kişi kendi bağımsızlık hedefini plan biriminde yazar; bütün aşamalar bu tutara göre hesaplanır. */
function OwnGoal({ profile, rates, plan, inBase }: { profile: JourneyProfile; rates: BaseRates; plan: FreedomPlan; inBase: (k: number) => string }) {
  const repo = useRepo()
  const { toast } = useUi()
  const base: PlanBase = profile.base ?? 'TRY'
  const unit = base === 'USD' ? '$' : base === 'XAU' ? tt('gr altın') : '₺'
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const save = async (customFiKurus: number | undefined) => {
    await repo
      .saveSettings({ journey: { ...profile, customFiKurus } })
      .then(() => setOpen(false))
      .catch((e: unknown) => toast(toUserMessage(e), { kind: 'error' }))
  }
  const submit = () => {
    const k = planAmountToKurus(Number(text.replace(/[^\d]/g, '')), profile, rates)
    if (k === null) return toast(tt('Geçerli bir tutar yazın.'), { kind: 'error' })
    void save(k)
  }
  if (open)
    return (
      <form
        className="mt-4 flex flex-wrap items-end gap-2 rounded-xl border border-line p-3"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <label className="min-w-0 flex-1 text-[12.5px] text-muted">
          {tt('Bağımsızlık hedefin (')}{unit})
          <Input autoFocus inputMode="numeric" value={text} onChange={(e) => setText(e.target.value)} placeholder={ttf('Örn. {0}', inBase(plan.fiKurus))} className="mt-1" />
        </label>
        <Button size="sm" type="submit">
          {tt('Kaydet')}
        </Button>
        <Button size="sm" variant="soft" type="button" onClick={() => setOpen(false)}>
          {tt('Vazgeç')}
        </Button>
      </form>
    )
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
      <span className="text-muted">{plan.ownGoal ? ttf('Kendi hedefin · önerilen {0}', inBase(plan.suggestedFiKurus)) : tt('Hedef senin harcamalarından önerildi')}</span>
      <span className="flex gap-1">
        <button type="button" className="rounded-lg px-2 py-1 font-semibold text-accent hover:bg-accent-soft" onClick={() => setOpen(true)}>
          {plan.ownGoal ? tt('Hedefi değiştir') : tt('Hedefi kendim belirle')}
        </button>
        {plan.ownGoal && (
          <button type="button" className="rounded-lg px-2 py-1 font-semibold text-muted hover:bg-surface-2" onClick={() => void save(undefined)}>
            {tt('Önerilene dön')}
          </button>
        )}
      </span>
    </div>
  )
}
