import { Info, Mountain, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/AppShell'
import { ScenarioLines, type ScenarioRow } from '../components/charts/Charts'
import { PlanBadge, PlanGate } from '../components/PlanGate'
import { Alert, Button, Card, Field, Input, Segmented } from '../components/ui/primitives'
import { monthlySaving, monthsToTarget, projectScenario, SCENARIOS, targetCapital, type JourneyFacts, type JourneyProfile, type ScenarioInput, type ScenarioKey } from '../domain/journey'
import { formatKurus, formatKurusCompact, formatKurusPlain, parseUserAmount } from '../domain/money'
import { useJourneyFacts } from '../state/budget'
import { useSettings } from '../state/data'

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
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">Senaryolar, Finansal Özgürlük Yolculuğum anketindeki gelir, gider ve hedef bilgilerinizle başlar.</p>
        <Link to="/yolculuk" className="mt-4 inline-block">
          <Button variant="primary">Ankete git</Button>
        </Link>
      </Card>
    )
  return <Scenarios profile={settings.journey} facts={facts} />
}

const KEYS: ScenarioKey[] = ['cautious', 'mid', 'optimistic']

function num(s: string, min: number, max: number, fallback: number): number {
  const n = Number(s.replace(',', '.'))
  return Number.isFinite(n) && s.trim() !== '' ? Math.min(max, Math.max(min, n)) : fallback
}

function money(s: string): number {
  if (!s.trim()) return 0
  const p = parseUserAmount(s)
  return p.ok ? Math.max(0, p.kurus) : 0
}

function Scenarios({ profile, facts }: { profile: JourneyProfile; facts: JourneyFacts }) {
  const baseSaving = monthlySaving(profile, facts)
  const start = Math.max(0, facts.assetsKurus - facts.debtsKurus)
  const goal = targetCapital(profile)
  const [f, setF] = useState({
    years: String(profile.horizonYears),
    extra: '',
    lossMonths: '0',
    lossSpend: formatKurusPlain(profile.essentialMonthlyKurus),
    big: '',
    bigYear: '1',
    inflation: '30',
    cautious: String(SCENARIOS.cautious.realReturnPct),
    mid: String(SCENARIOS.mid.realReturnPct),
    optimistic: String(SCENARIOS.optimistic.realReturnPct),
  })
  const [view, setView] = useState<'real' | 'nominal'>('real')
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }))

  const years = Math.round(num(f.years, 1, 60, profile.horizonYears))
  const input: ScenarioInput = {
    startKurus: start,
    monthlySavingKurus: baseSaving,
    years,
    inflationPct: num(f.inflation, 0, 200, 0),
    extraSavingKurus: money(f.extra),
    incomeLossMonths: Math.round(num(f.lossMonths, 0, 120, 0)),
    incomeLossMonthlySpendKurus: money(f.lossSpend),
    bigExpenseKurus: money(f.big),
    bigExpenseYear: Math.round(num(f.bigYear, 1, years, 1)),
  }
  const returns = { cautious: num(f.cautious, -10, 15, 0), mid: num(f.mid, -10, 15, 2), optimistic: num(f.optimistic, -10, 15, 4) }
  const series = Object.fromEntries(KEYS.map((k) => [k, projectScenario(input, returns[k])])) as Record<ScenarioKey, ReturnType<typeof projectScenario>>
  const inf = 1 + input.inflationPct / 100
  const rows: ScenarioRow[] = series.mid.map((p, i) => {
    const pick = (k: ScenarioKey) => (view === 'real' ? series[k][i].realKurus : series[k][i].nominalKurus)
    return { year: p.year, cautious: pick('cautious'), mid: pick('mid'), optimistic: pick('optimistic'), target: view === 'real' ? goal : Math.round(goal * Math.pow(inf, p.year)) }
  })
  const reachYear = (k: ScenarioKey) => {
    const hit = series[k].find((p) => p.year > 0 && p.realKurus >= goal)
    return start >= goal ? 0 : (hit?.year ?? null)
  }
  const baseline = monthsToTarget(start, baseSaving, goal, returns.mid)
  const tableYears = rows.filter((r) => r.year === 0 || r.year === years || r.year % (years <= 10 ? 2 : 5) === 0)

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5" aria-label="Varsayımlar">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <SlidersHorizontal className="size-5 text-accent" /> Varsayımlar
        </h2>
        <p className="mt-1 text-[13px] text-muted">
          Başlangıç: net varlık {formatKurus(start)}, aylık birikim {formatKurus(baseSaving)}, hedef {formatKurus(goal)} (yolculuk bilgilerinizden). Tutarları bugünün parasıyla yazın.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Süre (yıl)" htmlFor="s-years">
            <Input id="s-years" inputMode="numeric" value={f.years} onChange={set('years')} />
          </Field>
          <Field label="Ek aylık birikim (TL)" htmlFor="s-extra">
            <Input id="s-extra" inputMode="decimal" value={f.extra} onChange={set('extra')} placeholder="0,00" />
          </Field>
          <Field label="Yıllık enflasyon varsayımı (%)" htmlFor="s-inflation" hint="Yalnızca nominal gösterimi etkiler.">
            <Input id="s-inflation" inputMode="decimal" value={f.inflation} onChange={set('inflation')} />
          </Field>
          <Field label="Gelir kaybı (ay)" htmlFor="s-loss" hint="Bu süre birikim yapılamaz, giderler birikimden karşılanır.">
            <Input id="s-loss" inputMode="numeric" value={f.lossMonths} onChange={set('lossMonths')} />
          </Field>
          <Field label="Gelir kaybında aylık gider (TL)" htmlFor="s-loss-spend">
            <Input id="s-loss-spend" inputMode="decimal" value={f.lossSpend} onChange={set('lossSpend')} />
          </Field>
          <div className="grid grid-cols-[1fr_6rem] gap-2">
            <Field label="Büyük harcama (TL)" htmlFor="s-big">
              <Input id="s-big" inputMode="decimal" value={f.big} onChange={set('big')} placeholder="0,00" />
            </Field>
            <Field label="Kaçıncı yıl" htmlFor="s-big-year">
              <Input id="s-big-year" inputMode="numeric" value={f.bigYear} onChange={set('bigYear')} />
            </Field>
          </div>
        </div>
        <fieldset className="mt-4">
          <legend className="text-[13px] font-medium text-muted">Yıllık reel getiri varsayımı (enflasyon üstü, %)</legend>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:max-w-md">
            {KEYS.map((k) => (
              <Field key={k} label={SCENARIOS[k].label} htmlFor={`s-r-${k}`}>
                <Input id={`s-r-${k}`} inputMode="decimal" value={f[k]} onChange={set(k)} />
              </Field>
            ))}
          </div>
        </fieldset>
      </Card>

      <Card className="p-5" aria-label="Senaryo grafiği">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base font-semibold">Net varlığın seyri</h2>
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
            .map((k) => {
              const y = reachYear(k)
              return (
                <li key={k} className="rounded-xl bg-surface-2 px-3 py-2">
                  <span className="font-medium text-ink">{SCENARIOS[k].label}:</span> <span className="text-muted">{y === null ? `${years} yılda hedefe ulaşılmıyor` : y === 0 ? 'Hedef şimdiden karşılanıyor' : `Hedefe ${y}. yılda ulaşılıyor`}</span>
                </li>
              )
            })}
        </ul>
        {baseline !== null && <p className="mt-2 text-[12px] text-subtle">Hiçbir değişiklik olmadan orta varsayımla hedefe yaklaşık {Math.ceil(baseline / 12)} yılda ulaşılır.</p>}
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

/** Dar ekranda kısa tutar (ör. 2,8 Mn ₺), geniş ekranda tam tutar. */
function Amount({ kurus }: { kurus: number }) {
  return (
    <>
      <span className="sm:hidden">{formatKurusCompact(kurus)}</span>
      <span className="max-sm:hidden">{formatKurus(kurus)}</span>
    </>
  )
}
