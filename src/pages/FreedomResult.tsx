import { BookOpen, CalendarCheck, Gauge, Hourglass, PiggyBank, Target } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Slider } from '../components/Slider'
import { Card } from '../components/ui/primitives'
import { FAT_FACTOR, LEAN_FACTOR, MC_RUNS } from '../domain/assumptions'
import { MONTH_NAMES } from '../domain/dates'
import { buildFreedomPlan, formatInBase, reachDateLabel, type BaseRates, type FreedomPlan, type JourneyFacts, type JourneyProfile, type PlanBase } from '../domain/journey'
import { formatKurus } from '../domain/money'
import { cn } from '../lib/cn'
import { useReducedMotion } from '../lib/hooks'

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

  const late = v.reachAge === null || v.reachAge > v.targetAge
  const debtDate = v.debtFreeMonth === null ? 'Kapanmıyor' : v.debtFreeMonth === 0 ? 'Borç yok' : reachDateLabel(v.debtFreeMonth, today)
  const nextEnds = [...v.debtEnds.filter((d) => d.month !== null).map((d) => ({ name: d.name, month: d.month!, freed: d.freedKurus })), ...v.recurringEnds.map((r) => ({ name: r.name, month: r.month, freed: r.freedKurus }))].sort((a, b) => a.month - b.month)
  const levels = [
    { key: 'lean', label: `Lean FI · sade (%${LEAN_FACTOR * 100})`, stage: 'Finansal güvence', value: v.leanKurus },
    { key: 'fi', label: 'FI · hedefiniz', stage: 'Finansal bağımsızlık', value: v.fiKurus },
    { key: 'fat', label: `Fat FI · rahat (%${FAT_FACTOR * 100})`, stage: 'Finansal özgürlük', value: v.fatKurus },
  ]

  return (
    <section className="flex flex-col gap-4" aria-label="Özgürlük hedefi">
      <Card className="p-5">
        <div className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Finansal özgürlük hedefiniz</div>
        <div className="num mt-1 font-display text-[34px] font-bold leading-none text-ink">{inBase(v.fiKurus)}</div>
        <p className="mt-1.5 text-[13px] text-muted">
          Yıllık {formatKurus(v.annualNeedKurus)} çekim ÷ %{v.withdrawal.usedPct.toLocaleString('tr-TR')} çekim oranı ({v.retirementYears} yıllık çekim süresi
          {v.withdrawal.custom ? `; önerilen %${v.withdrawal.recommendedPct.toLocaleString('tr-TR')}` : ', süreye göre önerilen'}). Bugünün parasıyla.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3" role="group" aria-label="Canlı özet">
          <Mini label="Hedef birikim" value={shortTl(v.fiKurus) + ' ₺'} />
          <Mini label="Bugünkü hızla" value={v.reachAge === null ? 'Ulaşılamıyor' : `${Math.ceil(v.reachAge)} yaşında`} tone={late ? 'warn' : 'good'} />
          <Mini label="Tasarruf oranı" value={`%${Math.round(v.savingRate * 100)}`} />
        </div>
        <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3" aria-label="Seviyeler">
          {levels.map((l) => {
            const done = v.netKurus >= l.value
            return (
              <li key={l.key} className={cn('rounded-xl border p-3', l.key === 'fi' ? 'border-accent' : 'border-line')}>
                <div className="text-[12px] text-muted">{l.label}</div>
                <div className="num text-[15px] font-semibold text-ink">{inBase(l.value)}</div>
                <div className={cn('mt-0.5 text-[11.5px]', done ? 'font-medium text-accent' : 'text-subtle')}>
                  {l.stage}
                  {done ? ' · ulaşıldı' : ''}
                </div>
              </li>
            )
          })}
        </ul>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Kpi icon={<PiggyBank className="size-4" />} label="Gereken aylık birikim" tone={v.gapKurus > 0 ? 'warn' : 'good'} value={`${formatKurus(v.requiredMonthlyKurus)}/ay`}>
          {v.targetAge} yaşında hedefe ulaşmak için ({v.risk.profile.label} senaryosu, reel %{v.realReturnPct.toLocaleString('tr-TR')}). Şu an {formatKurus(v.monthlySavingKurus)};{' '}
          {v.gapKurus > 0 ? `fark ${formatKurus(v.gapKurus)}.` : 'yeterli.'} Borç ve taksit bitişleri hesaba katıldı.
        </Kpi>
        <Kpi icon={<Hourglass className="size-4" />} label="Coast FI eşiği" tone={v.coastPassed ? 'good' : undefined} value={inBase(v.coastKurus)}>
          {v.coastPassed ? 'Geçtiniz: hiç eklemeseniz de beklenen getiriyle hedef yaşta yetiyor.' : `Net birikiminiz ${inBase(v.netKurus)}.`} Bileşik getiri hesabıdır.
        </Kpi>
        <Kpi icon={<Gauge className="size-4" />} label="Başarı olasılığı" tone={v.successRate >= 0.8 ? 'good' : v.successRate < 0.6 ? 'warn' : undefined} value={`%${Math.round(v.successRate * 100)}`}>
          {MC_RUNS.toLocaleString('tr-TR')} piyasa senaryosunda paranın {v.lifeAge} yaşına kadar yetme oranı. Varsayıma dayalı benzetimdir, gerçek olasılık değildir.
        </Kpi>
        <Kpi icon={<CalendarCheck className="size-4" />} label="Borçsuz olma tarihi" value={debtDate}>
          {nextEnds.length
            ? nextEnds
                .slice(0, 3)
                .map((e) => `${e.name}: ${reachDateLabel(e.month, today)} (+${formatKurus(e.freed)}/ay birikime)`)
                .join(' · ')
            : 'Biten borç ya da taksit yok.'}
          {v.debtEnds.length > 0 && ` Sıra: ${strategy === 'avalanche' ? 'önce en yüksek faiz' : 'önce en küçük borç'}.`}
        </Kpi>
      </div>

      <Card className="p-4 sm:p-5">
        <h3 className="font-display text-base font-semibold">Birikim projeksiyonu</h3>
        <p className="mt-0.5 text-[12.5px] text-muted">Bugünün parasıyla net birikim; varsayıma dayalı benzetim.</p>
        <Projection plan={v} />
      </Card>

      <Card className="p-4 sm:p-5" aria-label="Kaldıraçlar">
        <h3 className="font-display text-base font-semibold">Kaldıraçlarla oynayın</h3>
        <p className="mt-0.5 text-[12.5px] text-muted">Değişiklikler kaydedilmez; yalnızca sonucu nasıl etkilediğini gösterir.</p>
        <div className="mt-3 flex flex-col gap-4">
          <Slider id="l-extra" label="Aylık ek birikim" value={extra / 100} min={0} max={Math.max(50000, Math.ceil(plan.levers.extraMonthlyKurus / 100 / 5000) * 5000 + 10000)} step={500} onChange={(x) => setExtra(x * 100)} display={(x) => `+${formatKurus(x * 100)}`} />
          <Slider id="l-age" label="Hedef yaş" value={tAge} min={plan.age + 1} max={Math.max(plan.age + 2, plan.lifeAge - 1)} onChange={setTAge} display={(x) => `${x} yaş`} />
          <Slider id="l-pct" label="Hedef harcama düzeyi" value={pct} min={50} max={160} step={5} onChange={setPct} display={(x) => `%${x}`} />
        </div>
        <ul className="mt-4 flex list-disc flex-col gap-1.5 pl-5 text-[13px] text-muted" aria-label="Tek başına yeterli değerler">
          {plan.gapKurus > 0 ? (
            <>
              <li>
                Ayda <strong className="text-ink">{formatKurus(plan.levers.extraMonthlyKurus)}</strong> ek birikim tek başına yeterli.
              </li>
              <li>{plan.levers.targetAge !== null ? <>Hedef yaşı <strong className="text-ink">{plan.levers.targetAge}</strong> yapmak tek başına yeterli.</> : 'Bugünkü birikimle hiçbir hedef yaşta yetmiyor.'}</li>
              <li>
                Hedef harcama düzeyini <strong className="text-ink">%{Math.min(plan.spendPct, plan.levers.spendPct)}</strong> yapmak tek başına yeterli.
              </li>
            </>
          ) : (
            <li>
              Bugünkü hızınızla hedefin önündesiniz{plan.levers.targetAge !== null && plan.levers.targetAge < plan.targetAge ? `; ${plan.levers.targetAge} yaşında bırakmak da yetiyor` : ''}.
            </li>
          )}
          {changed && (
            <li>
              Bu ayarlarla: gereken {formatKurus(v.requiredMonthlyKurus)}/ay, başarı %{Math.round(v.successRate * 100)}, {v.reachAge === null ? 'hedefe ulaşılamıyor' : `hedefe ${Math.ceil(v.reachAge)} yaşında ulaşılır`}.
            </li>
          )}
        </ul>
      </Card>

      <Card className="p-4 sm:p-5" aria-label="Gelecekteki hedef">
        <h3 className="flex items-center gap-2 font-display text-base font-semibold">
          <Target className="size-4 text-accent" /> Hedef tarihte ({ageDate(v.targetAge)}) hedefiniz
        </h3>
        <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Future label="TL (nominal)" value={formatKurus(v.future.tlNominalKurus)} note={`Bugünkü ${formatKurus(v.fiKurus)}, yıllık %${v.future.inflationPct.toLocaleString('tr-TR')} enflasyon varsayımıyla ${v.future.years} yıl büyütüldü.`} />
          <Future
            label="USD"
            value={v.future.usd === null ? '—' : `${v.future.usd.toLocaleString('tr-TR')} $`}
            note={base === 'USD' ? 'Plan birimi USD: hedef bu tutarda sabit.' : 'Güncel kurla; doların TL karşısında reel değerini koruduğu varsayımıyla.'}
          />
          <Future
            label="Gram altın"
            value={v.future.goldGr === null ? '—' : `${v.future.goldGr.toLocaleString('tr-TR')} gr`}
            note={base === 'XAU' ? 'Plan birimi altın: hedef bu miktarda sabit.' : 'Güncel gram fiyatıyla; altının reel değerini koruduğu varsayımıyla.'}
          />
        </dl>
      </Card>

      <p className="text-[12.5px] text-muted">
        Bu ekran eğitim ve benzetim amaçlıdır; kişiye özel yatırım tavsiyesi değildir. Tutarlar bugünün parasıyladır{base === 'TRY' ? ' (TÜİK TÜFE ile enflasyondan arındırılmış TL varsayımı)' : ''}.{' '}
        <Link to="/ogren#varsayimlar" className="inline-flex items-center gap-1 font-medium text-accent">
          <BookOpen className="size-3.5" /> Varsayımlar ve kaynaklar
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

/** %10–%90 bantlı projeksiyon: ortanca çizgi, hedef çizgisi, hedef yaş ve borç bitiş noktaları. */
function Projection({ plan }: { plan: FreedomPlan }) {
  const reduced = useReducedMotion()
  const [hover, setHover] = useState<number | null>(null)
  const b = plan.bands
  if (b.length < 2) return null
  const W = 640
  const H = 260
  const L = 52
  const R = 14
  const T = 14
  const B = 30
  const iw = W - L - R
  const ih = H - T - B
  const top0 = Math.max(plan.fiKurus * 1.3, ...b.map((x) => x.p50)) * 1.05 || 1
  const raw = top0 / 4
  const pow = Math.pow(10, Math.floor(Math.log10(raw)))
  const f = raw / pow
  const stepV = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow
  const ymax = Math.ceil(top0 / stepV) * stepV
  const n = b.length - 1
  const x = (i: number) => L + (iw * i) / n
  const yv = (v: number) => T + ih * (1 - Math.max(0, Math.min(v, ymax)) / ymax)
  const ticks: number[] = []
  for (let v = 0; v <= ymax + 1; v += stepV) ticks.push(v)
  const up = b.map((p, i) => `${x(i)},${yv(p.p90)}`).join(' ')
  const lo = b.map((p, i) => `${x(i)},${yv(p.p10)}`).reverse().join(' ')
  const med = b.map((p, i) => `${x(i)},${yv(p.p50)}`).join(' ')
  const ti = Math.max(0, Math.min(n, plan.targetAge - plan.age))
  const debtAge = plan.debtFreeMonth && plan.debtFreeMonth > 0 ? plan.age + plan.debtFreeMonth / 12 : null
  const di = debtAge !== null && debtAge - plan.age <= n ? debtAge - plan.age : null
  const firstAge = Math.ceil(plan.age / 10) * 10
  const ages: number[] = []
  for (let a = firstAge; a <= plan.lifeAge; a += 10) ages.push(a)
  const h = hover === null ? null : b[hover]
  return (
    <div className="relative mt-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Yaşa göre net birikim projeksiyonu: ${plan.targetAge} yaşında ortanca ${shortTl(b[ti].p50)} ₺, hedef ${shortTl(plan.fiKurus)} ₺`}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          const px = ((e.clientX - r.left) / r.width) * W
          setHover(Math.max(0, Math.min(n, Math.round(((px - L) / iw) * n))))
        }}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={yv(v)} y2={yv(v)} stroke="var(--border)" strokeWidth={1} />
            <text x={L - 8} y={yv(v) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">
              {v === 0 ? '0' : shortTl(v)}
            </text>
          </g>
        ))}
        {ages.map((a) => (
          <text key={a} x={x(a - plan.age)} y={H - 10} textAnchor="middle" fontSize={11} fill="var(--muted)">
            {a}
          </text>
        ))}
        <polygon points={`${up} ${lo}`} fill="var(--accent)" fillOpacity={0.16} />
        <line x1={L} x2={W - R} y1={yv(plan.fiKurus)} y2={yv(plan.fiKurus)} stroke="var(--warning)" strokeWidth={1.5} strokeDasharray="5 4" />
        <line x1={x(ti)} x2={x(ti)} y1={T} y2={T + ih} stroke="var(--muted)" strokeWidth={1} strokeDasharray="2 3" />
        <text x={x(ti) + 5} y={T + 12} fontSize={11} fill="var(--muted)">
          Hedef yaş {plan.targetAge}
        </text>
        {di !== null && (
          <g>
            <line x1={x(di)} x2={x(di)} y1={T + 18} y2={T + ih} stroke="var(--teal)" strokeWidth={1} strokeDasharray="2 3" />
            <text x={x(di) + 5} y={T + 30} fontSize={11} fill="var(--teal)">
              Borçsuz
            </text>
          </g>
        )}
        <motion.polyline points={med} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1 }} />
        <circle cx={x(ti)} cy={yv(b[ti].p50)} r={4.5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
        {h && hover !== null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={T + ih} stroke="var(--border-strong)" strokeWidth={1} />
            <circle cx={x(hover)} cy={yv(h.p50)} r={4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
          </g>
        )}
      </svg>
      {h && hover !== null && (
        <div className="pointer-events-none absolute top-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] shadow" style={{ left: `${Math.min(70, Math.max(2, (x(hover) / W) * 100 - 10))}%` }}>
          <div className="font-semibold text-ink">{h.age} yaş</div>
          <div className="num text-muted">Ortanca {shortTl(h.p50)} ₺</div>
          <div className="num text-subtle">
            %10–%90: {shortTl(h.p10)} – {shortTl(h.p90)} ₺
          </div>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-[3px] w-4 rounded bg-[var(--accent)]" /> Ortanca senaryo
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2 w-4 rounded bg-[var(--accent)] opacity-20" /> %10–%90 aralığı
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-0 w-4 border-t-2 border-dashed border-[var(--warning)]" /> Hedef birikim
        </span>
      </div>
      <details className="mt-2 text-[12.5px] text-muted">
        <summary className="cursor-pointer font-medium text-ink">Tablo olarak göster</summary>
        <table className="num mt-2 w-full text-left text-[12px]">
          <thead>
            <tr className="text-subtle">
              <th className="py-1 font-medium">Yaş</th>
              <th className="py-1 font-medium">%10</th>
              <th className="py-1 font-medium">Ortanca</th>
              <th className="py-1 font-medium">%90</th>
            </tr>
          </thead>
          <tbody>
            {b
              .filter((_, i) => i % 5 === 0 || i === ti)
              .map((p) => (
                <tr key={p.age} className="border-t border-line">
                  <td className="py-1">{p.age}</td>
                  <td className="py-1">{shortTl(p.p10)} ₺</td>
                  <td className="py-1">{shortTl(p.p50)} ₺</td>
                  <td className="py-1">{shortTl(p.p90)} ₺</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
