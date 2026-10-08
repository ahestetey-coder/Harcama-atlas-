import { Slider } from '../components/Slider'
import { Info, Mountain, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/AppShell'
import { ScenarioLines, type ScenarioRow } from '../components/charts/Charts'
import { PlanBadge, PlanGate } from '../components/PlanGate'
import { Alert, Button, Card, Field, Input, Segmented } from '../components/ui/primitives'
import { todayIso } from '../domain/dates'
import { buildJourney, durationLabel, formatInBase, reachDateLabel, SCENARIOS, simulatePlan, type JourneyFacts, type JourneyProfile, type ScenarioInput, type ScenarioKey, type Simulation } from '../domain/journey'
import { formatKurus, formatKurusCompact, formatKurusPlain, parseUserAmount } from '../domain/money'
import { cn } from '../lib/cn'
import { useJourneyFacts } from '../state/budget'
import { useSettings } from '../state/data'
import { useBaseRates } from '../state/livePrices'

export default function ScenariosPage() {
  return (
    <div>
      <PageHeader
        title="Gelecek senaryoları"
        subtitle={
          <span className="inline-flex items-center gap-2">
            <PlanBadge plan="plusplus" /> Varsayımları değiştirin, rotanızın nasıl etkilendiğini görün
          </span>
        }
      />
      <PlanGate
        feature="scenarios"
        title="Gelecek senaryoları"
        points={[
          'Daha fazla birikim, gelir kaybı, büyük bir harcama, enflasyon ve getiri varsayımlarını deneyin',
          'Sonuçları bugünün satın alma gücüyle görün',
          'Temkinli, orta ve olumlu varsayımları yan yana karşılaştırın',
        ]}
      >
        <ScenariosContent />
      </PlanGate>
    </div>
  )
}

function ScenariosContent() {
  const settings = useSettings()
  const facts = useJourneyFacts()
  if (!settings || !facts) return null
  if (!settings.journey)
    return (
      <Card className="p-6 text-center">
        <Mountain className="mx-auto size-8 text-accent" />
        <h2 className="mt-2 font-display text-lg font-semibold">Önce yolculuğunuzu oluşturun</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">Senaryolar, Finansal Özgürlük Yolculuğum testindeki gelir, gider ve hedef bilgilerinizle başlar.</p>
        <Link to="/yolculuk" className="mt-4 inline-block">
          <Button variant="primary">Teste git</Button>
        </Link>
      </Card>
    )
  return <Scenarios profile={settings.journey} facts={facts} />
}

const KEYS: ScenarioKey[] = ['cautious', 'mid', 'optimistic']

interface Assumptions {
  years: number
  extra: number
  inflation: number
  lossMonths: number
  lossSpend: number
  big: number
  bigYear: number
  returns: Record<ScenarioKey, number>
}

const defaults = (profile: JourneyProfile, essentialNow: number): Assumptions => ({
  years: profile.horizonYears,
  extra: 0,
  inflation: 30,
  lossMonths: 0,
  lossSpend: essentialNow,
  big: 0,
  bigYear: 1,
  returns: { cautious: SCENARIOS.cautious.realReturnPct, mid: SCENARIOS.mid.realReturnPct, optimistic: SCENARIOS.optimistic.realReturnPct },
})

function Scenarios({ profile, facts }: { profile: JourneyProfile; facts: JourneyFacts }) {
  const rates = useBaseRates(profile)
  // Yolculukla aynı hesap: aynı hedef (plan birimi ve canlı kurla), aynı başlangıç ve aynı aylık birikim
  const j = useMemo(() => buildJourney(profile, facts, rates), [profile, facts, rates])
  const goal = j.indicators.goalKurus
  const start = j.indicators.progressKurus
  const baseSaving = j.indicators.monthlySavingKurus
  const essentialNow = Math.round(profile.essentialMonthlyKurus * j.indicators.indexFactor)
  const base = profile.base ?? 'TRY'
  const inBase = (k: number) => (base === 'TRY' ? formatKurus(k) : `${formatInBase(k, base, rates) ?? ''} (${formatKurus(k)})`)
  const today = todayIso()

  const [a, setA] = useState<Assumptions>(() => defaults(profile, essentialNow))
  const [formKey, setFormKey] = useState(0)
  const [view, setView] = useState<'real' | 'nominal'>('real')
  const set = <K extends keyof Assumptions>(k: K, v: Assumptions[K]) => setA((p) => ({ ...p, [k]: v }))
  const reset = () => {
    setA(defaults(profile, essentialNow))
    setFormKey((n) => n + 1)
  }
  const changed = JSON.stringify(a) !== JSON.stringify(defaults(profile, essentialNow))

  const input: ScenarioInput = {
    startKurus: start,
    monthlySavingKurus: baseSaving,
    years: a.years,
    inflationPct: a.inflation,
    extraSavingKurus: a.extra,
    incomeLossMonths: a.lossMonths,
    incomeLossMonthlySpendKurus: a.lossSpend,
    bigExpenseKurus: a.big,
    bigExpenseYear: Math.min(a.bigYear, a.years),
  }
  const sims = Object.fromEntries(KEYS.map((k) => [k, simulatePlan(input, a.returns[k], goal)])) as Record<ScenarioKey, Simulation>
  const inf = 1 + input.inflationPct / 100
  const rows: ScenarioRow[] = sims.mid.points.map((p, i) => {
    const pick = (k: ScenarioKey) => (view === 'real' ? sims[k].points[i].realKurus : sims[k].points[i].nominalKurus)
    return { year: p.year, cautious: pick('cautious'), mid: pick('mid'), optimistic: pick('optimistic'), target: view === 'real' ? goal : Math.round(goal * Math.pow(inf, p.year)) }
  })
  // Yolculuk sayfasındaki "Tahmini varış" ile aynı: hiçbir değişiklik olmadan, orta varsayım
  const journeyMid = j.indicators.route.mid
  const midNow = sims.mid.reachMonths
  const diff = journeyMid !== null && midNow !== null ? midNow - journeyMid : null
  const tableYears = rows.filter((r) => r.year === 0 || r.year === a.years || r.year % (a.years <= 10 ? 2 : 5) === 0)
  const reachText = (m: number | null) => (m === null ? '100 yıl içinde ulaşılmıyor' : m === 0 ? 'Hedef şimdiden karşılanıyor' : `${reachDateLabel(m, today)} · ${durationLabel(m)}`)

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5" aria-label="Başlangıç noktası">
        <h2 className="font-display text-base font-semibold">Başlangıç noktanız</h2>
        <p className="mt-0.5 text-[12.5px] text-muted">Finansal Özgürlük Yolculuğum ile aynı bilgiler ve aynı hesap; yolculukta bir şey değişince burası da değişir.</p>
        <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-[12.5px] text-muted">Net birikim</dt>
            <dd className="num font-display text-lg font-semibold">{formatKurus(start)}</dd>
          </div>
          <div>
            <dt className="text-[12.5px] text-muted">Aylık birikim</dt>
            <dd className="num font-display text-lg font-semibold">{formatKurus(baseSaving)}</dd>
          </div>
          <div>
            <dt className="text-[12.5px] text-muted">Özgürlük hedefi</dt>
            <dd className="num font-display text-lg font-semibold">{inBase(goal)}</dd>
          </div>
        </dl>
        <p className="mt-2 text-[12.5px] text-muted">
          Yolculuktaki tahmin (orta varsayım, değişikliksiz): <span className="font-medium text-ink">{reachText(journeyMid)}</span>
        </p>
      </Card>

      <Card className="p-5" aria-label="Varsayımlar">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <SlidersHorizontal className="size-5 text-accent" /> Varsayımlar
          </h2>
          <Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" />} onClick={reset} disabled={!changed}>
            Varsayılanlara dön
          </Button>
        </div>
        <p className="mt-1 text-[13px] text-muted">Değiştirdiğiniz her şey aşağıdaki sonuçlara hemen yansır. Tutarları bugünün parasıyla yazın.</p>
        <div key={formKey} className="mt-4 grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
          <MoneyField id="s-extra" label="Ek aylık birikim (TL)" value={a.extra} onChange={(v) => set('extra', v)} hint="Her ay mevcut birikiminize eklenecek tutar." />
          <Slider id="s-loss" label="Gelir kaybı (ay)" value={a.lossMonths} min={0} max={36} onChange={(v) => set('lossMonths', v)} display={(v) => (v === 0 ? 'Yok' : `${v} ay`)} hint="Bu süre birikim yapılamaz, giderler birikimden karşılanır." />
          <MoneyField id="s-loss-spend" label="Gelir kaybında aylık gider (TL)" value={a.lossSpend} onChange={(v) => set('lossSpend', v)} hint="Varsayılan: zorunlu giderleriniz." />
          <MoneyField id="s-big" label="Büyük harcama (TL)" value={a.big} onChange={(v) => set('big', v)} hint="Ev peşinatı, araba, düğün gibi tek seferlik harcama." />
          <Slider id="s-big-year" label="Büyük harcamanın yılı" value={Math.min(a.bigYear, a.years)} min={1} max={a.years} onChange={(v) => set('bigYear', v)} display={(v) => `${v}. yıl`} disabled={a.big === 0} />
          <Slider id="s-years" label="Grafik süresi (yıl)" value={a.years} min={1} max={60} onChange={(v) => set('years', v)} display={(v) => `${v} yıl`} hint="Hedefe ulaşma tarihi bu süreden bağımsız hesaplanır." />
          <Slider id="s-inflation" label="Yıllık enflasyon (%)" value={a.inflation} min={0} max={100} onChange={(v) => set('inflation', v)} display={(v) => `%${v}`} hint="Yalnızca nominal gösterimi etkiler." />
        </div>
        <fieldset className="mt-5">
          <legend className="text-[13px] font-medium text-muted">Yıllık reel getiri varsayımı (enflasyon üstü)</legend>
          <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-3">
            {KEYS.map((k) => (
              <Slider
                key={k}
                id={`s-r-${k}`}
                label={SCENARIOS[k].label}
                value={a.returns[k]}
                min={-5}
                max={10}
                step={0.5}
                onChange={(v) => setA((p) => ({ ...p, returns: { ...p.returns, [k]: v } }))}
                display={(v) => `%${v.toLocaleString('tr-TR')}`}
              />
            ))}
          </div>
        </fieldset>
      </Card>

      <Card className="p-5" aria-label="Senaryo grafiği">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base font-semibold">Net birikimin seyri</h2>
          <Segmented
            label="Gösterim"
            value={view}
            onChange={setView}
            options={[
              { value: 'real', label: 'Bugünün parasıyla' },
              { value: 'nominal', label: 'Nominal' },
            ]}
          />
        </div>
        <ScenarioLines rows={rows} caption={view === 'real' ? 'Senaryolar, bugünün parasıyla' : 'Senaryolar, nominal'} />
        <ul className="mt-3 grid grid-cols-1 gap-2 text-[13px] sm:grid-cols-3" aria-label="Hedefe ulaşma">
          {KEYS.slice()
            .reverse()
            .map((k) => (
              <li key={k} className="rounded-xl bg-surface-2 px-3 py-2">
                <div className="font-medium text-ink">
                  {SCENARIOS[k].label} <span className="text-[12px] font-normal text-subtle">(%{a.returns[k].toLocaleString('tr-TR')} reel)</span>
                </div>
                <div className="num text-muted">{reachText(sims[k].reachMonths)}</div>
              </li>
            ))}
        </ul>
        {changed && diff !== null && (
          <p className="mt-2 text-[12.5px] text-muted" aria-live="polite">
            Değişikliklerinizle orta varsayımda hedef{' '}
            <span className={cn('font-semibold', diff > 0 ? 'text-danger' : diff < 0 ? 'text-accent' : 'text-ink')}>{diff === 0 ? 'aynı tarihte' : diff > 0 ? `${durationLabel(diff)} gecikiyor` : `${durationLabel(-diff)} erken`}</span>
            {diff === 0 ? ' kalıyor.' : '.'}
          </p>
        )}
      </Card>

      <Card className="overflow-x-auto p-5" aria-label="Senaryo tablosu">
        <table className="w-full text-[13px]">
          <caption className="mb-2 text-left font-display text-base font-semibold text-ink">Yıllara göre {view === 'real' ? '(bugünün parasıyla)' : '(nominal)'}</caption>
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1.5 pr-3 font-medium">Yıl</th>
              {KEYS.map((k) => (
                <th key={k} className="py-1.5 pr-3 text-right font-medium">
                  {SCENARIOS[k].label}
                </th>
              ))}
              <th className="py-1.5 text-right font-medium">Hedef</th>
            </tr>
          </thead>
          <tbody className="num">
            {tableYears.map((r) => (
              <tr key={r.year} className="border-t border-line">
                <td className="py-1.5 pr-3">{r.year === 0 ? 'Bugün' : r.year}</td>
                {KEYS.map((k) => (
                  <td key={k} className="whitespace-nowrap py-1.5 pr-3 text-right">
                    <Amount kurus={r[k]} />
                  </td>
                ))}
                <td className="whitespace-nowrap py-1.5 text-right text-muted">
                  <Amount kurus={r.target} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Alert tone="info" icon={<Info className="size-4" />}>
        Bu senaryolar olasılık veya garanti değildir; girdiğiniz varsayımlarla yapılan basit hesaplardır. Gerçek getiri, enflasyon ve gelir farklı olabilir. Yatırım tavsiyesi içermez; hangi ürünün alınıp satılacağını söylemez.
      </Alert>
    </div>
  )
}

/** Tutar alanı: geçersiz yazımda son geçerli değer korunur ve uyarı gösterilir; boş = 0. */
function MoneyField({ id, label, value, onChange, hint }: { id: string; label: string; value: number; onChange: (v: number) => void; hint?: string }) {
  const [text, setText] = useState(() => (value ? formatKurusPlain(value) : ''))
  const [bad, setBad] = useState(false)
  const change = (t: string) => {
    setText(t)
    if (!t.trim()) {
      setBad(false)
      return onChange(0)
    }
    const p = parseUserAmount(t)
    if (p.ok && p.kurus >= 0) {
      setBad(false)
      onChange(p.kurus)
    } else setBad(true)
  }
  return (
    <Field label={label} htmlFor={id} hint={hint} error={bad ? 'Geçerli bir tutar girin; son geçerli tutar kullanılıyor.' : undefined}>
      <Input id={id} inputMode="decimal" value={text} onChange={(e) => change(e.target.value)} onBlur={() => !bad && setText(value ? formatKurusPlain(value) : '')} placeholder="0,00" aria-invalid={bad || undefined} />
    </Field>
  )
}

/** Dar ekranda kısa tutar (ör. 2,8 Mn ₺), geniş ekranda tam tutar. */
function Amount({ kurus }: { kurus: number }) {
  return (
    <>
      <span className="sm:hidden">{formatKurusCompact(kurus)}</span>
      <span className="max-sm:hidden">{formatKurus(kurus)}</span>
    </>
  )
}
