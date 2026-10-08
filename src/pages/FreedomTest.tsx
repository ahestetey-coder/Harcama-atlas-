import { ArrowLeft, ArrowRight, ClipboardCheck } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Slider } from '../components/Slider'
import { Badge, Button, Card, Field, Input, Segmented, Select, Switch } from '../components/ui/primitives'
import { toUserMessage } from '../data/repository'
import { DEFAULT_INFLATION_PCT, DEFAULT_LIFE_AGE, DEFAULT_TARGET_AGE, RISK_PROFILES } from '../domain/assumptions'
import { STRATEGY_LABEL, type CoachDebt, type DebtStrategy } from '../domain/coach'
import { todayIso } from '../domain/dates'
import {
  BASE_LABEL,
  buildFreedomPlan,
  formatInBase,
  HEALTH_LABEL,
  HOUSING_LABEL,
  JOURNEY_GOAL_LABEL,
  PENSION_LABEL,
  RISK_QUESTIONS,
  riskToleranceOf,
  SPEND_GROUP_LABEL,
  SPEND_GROUPS,
  STABILITY_LABEL,
  sumSpend,
  TESTS_PER_MONTH,
  testsLeft,
  type BaseRates,
  type HealthCover,
  type Housing,
  type IncomeStability,
  type JourneyFacts,
  type JourneyGoal,
  type JourneyProfile,
  type Pension,
  type PlanBase,
  type RiskStance,
  type SpendBreakdown,
  type SpendGroup,
} from '../domain/journey'
import { formatKurus, formatKurusPlain, parseUserAmount } from '../domain/money'
import { cn } from '../lib/cn'
import { useReducedMotion } from '../lib/hooks'
import { DEFAULT_COACH } from '../state/coach'
import { useAssets, useRepo, useSettings } from '../state/data'
import { useUi } from '../state/ui'

const STEPS = ['Siz', 'Gelir', 'Harcamalar', 'Borçlar', 'Hedef yaşam', 'Risk', 'Emniyet', 'Plan'] as const

const plain = (k: number | null | undefined) => (k ? formatKurusPlain(k) : '')
/** Önizleme için hoşgörülü okuma: geçersiz ya da boşsa 0. */
const soft = (s: string) => {
  if (!s.trim()) return 0
  const p = parseUserAmount(s)
  return p.ok && p.kurus >= 0 ? p.kurus : 0
}
const num = (s: string) => Number(s.replace(',', '.'))

/**
 * Özgürlük Rotası v2 testi: uygulamadaki verilerle önceden doldurulur, kullanıcı doğrular.
 * Üstteki canlı özet, her değişiklikte hedef motoruyla yeniden hesaplanır.
 */
export function FreedomTest({ facts, rates, initial, onDone, onCancel }: { facts: JourneyFacts; rates: BaseRates; initial?: JourneyProfile; onDone: () => void; onCancel?: () => void }) {
  const repo = useRepo()
  const settings = useSettings()
  const assets = useAssets()
  const { toast } = useUi()
  const reduced = useReducedMotion()
  const today = todayIso()
  const left = testsLeft(initial, today)
  const coach = settings?.coach ?? DEFAULT_COACH
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)
  const fromData = facts.spendingByGroup
  const [f, setF] = useState(() => {
    const age = initial?.age
    return {
      age: age ? String(age) : '',
      targetAge: String(initial?.targetAge ?? (age ? age + initial!.horizonYears : DEFAULT_TARGET_AGE)),
      lifeAge: String(initial?.lifeAge ?? DEFAULT_LIFE_AGE),
      dependents: String(initial?.dependents ?? 0),
      housing: initial?.housing ?? ('rent' as Housing),
      income: plain(initial?.monthlyIncomeKurus),
      stability: initial?.incomeStability ?? ('regular' as IncomeStability),
      spending: Object.fromEntries(SPEND_GROUPS.map((g) => [g, plain(initial?.spending?.[g] ?? fromData?.[g])])) as Record<SpendGroup, string>,
      debts: {} as Record<string, { rate: string; pay: string }>,
      strategy: coach.strategy as DebtStrategy,
      pct: initial?.targetSpendPct ?? 100,
      ownHome: initial?.ownHomePlan ?? false,
      big: plain(initial?.annualBigSpendKurus),
      goal: initial?.goal ?? ('independence' as JourneyGoal),
      goalName: initial?.goalName ?? '',
      answers: initial?.riskAnswers ?? Array.from({ length: RISK_QUESTIONS.length }, () => (initial?.risk === 'cautious' ? 1 : initial?.risk === 'bold' ? 3 : 2)),
      pension: plain(initial?.pensionIncomeKurus),
      passive: plain(initial?.passiveIncomeKurus),
      partTime: plain(initial?.partTimeIncomeKurus),
      health: initial?.health ?? ('public' as HealthCover),
      pensionCover: initial?.pension ?? ('sgk' as Pension),
      base: initial?.base ?? ('TRY' as PlanBase),
      customW: initial?.withdrawalCustom ?? false,
      withdrawal: String(initial?.withdrawalRatePct ?? 3.5).replace('.', ','),
      inflation: String(initial?.inflationPct ?? DEFAULT_INFLATION_PCT).replace('.', ','),
    }
  })
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }))

  const assetById = useMemo(() => new Map((assets ?? []).map((a) => [a.id, a])), [assets])
  const debts = facts.debtList ?? []
  /** Testte girilen faiz/taksitle güncellenmiş borç listesi. */
  const debtsDraft: CoachDebt[] = debts.map((d) => {
    const e = f.debts[d.id]
    if (!e) return d
    const rate = e.rate.trim() ? num(e.rate) : d.monthlyRatePct
    const pay = e.pay.trim() ? soft(e.pay) : d.minPaymentKurus
    return { ...d, monthlyRatePct: Number.isFinite(rate) ? rate : d.monthlyRatePct, minPaymentKurus: pay || d.minPaymentKurus, estimatedMin: e.pay.trim() ? false : d.estimatedMin }
  })
  const spending = Object.fromEntries(SPEND_GROUPS.map((g) => [g, soft(f.spending[g])])) as SpendBreakdown
  const recurring = facts.recurringList ?? []
  const recurringTotal = recurring.reduce((s, r) => s + r.monthlyKurus, 0)

  const ageN = Number(f.age) || 35
  const targetN = Number(f.targetAge) || DEFAULT_TARGET_AGE
  const draft: JourneyProfile = {
    goal: f.goal,
    goalName: f.goal === 'custom' ? f.goalName.trim().slice(0, 60) || undefined : undefined,
    horizonYears: Math.max(1, targetN - ageN),
    targetMonthlyExpenseKurus: 0,
    monthlyIncomeKurus: soft(f.income),
    essentialMonthlyKurus: 0,
    incomeStability: f.stability,
    priorities: initial?.priorities ?? [],
    withdrawalRatePct: f.customW ? num(f.withdrawal) || 3.5 : 3.5,
    withdrawalCustom: f.customW,
    celebrated: initial?.celebrated ?? [],
    confirmedAt: '',
    age: ageN,
    dependents: Number(f.dependents) || 0,
    housing: f.housing,
    passiveIncomeKurus: soft(f.passive) || undefined,
    pension: f.pensionCover,
    health: f.health,
    base: f.base,
    baseRateTl: f.base === 'TRY' ? undefined : (rates[f.base] ?? undefined),
    targetAge: targetN,
    lifeAge: Number(f.lifeAge) || DEFAULT_LIFE_AGE,
    spending,
    targetSpendPct: f.pct,
    ownHomePlan: f.ownHome,
    annualBigSpendKurus: soft(f.big) || undefined,
    riskAnswers: f.answers,
    pensionIncomeKurus: soft(f.pension) || undefined,
    partTimeIncomeKurus: soft(f.partTime) || undefined,
    inflationPct: num(f.inflation) || DEFAULT_INFLATION_PCT,
  }
  const factsDraft: JourneyFacts = { ...facts, debtList: debtsDraft }
  // Canlı özet: hızlı olsun diye benzetim (Monte Carlo) çalıştırılmaz
  const preview = buildFreedomPlan(draft, factsDraft, { rates, strategy: f.strategy, runs: 0 })
  const inBase = (k: number) => (f.base === 'TRY' ? formatKurus(k) : (formatInBase(k, f.base, rates) ?? formatKurus(k)))
  const tolerance = riskToleranceOf({ riskAnswers: f.answers })

  const money = (s: string, label: string, optional = false) => {
    if (optional && !s.trim()) return 0
    const p = parseUserAmount(s)
    if (!p.ok || p.kurus < 0 || (!optional && p.kurus === 0)) throw new Error(`${label} için geçerli bir tutar girin.`)
    return p.kurus
  }
  const check = (i: number): string | null => {
    try {
      if (i === 0) {
        const age = Number(f.age)
        if (!Number.isInteger(age) || age < 15 || age > 99) return 'Yaşınızı 15 ile 99 arasında girin.'
        const t = Number(f.targetAge)
        if (!Number.isInteger(t) || t <= age || t > 100) return 'Hedef yaş, yaşınızdan büyük ve en çok 100 olmalı.'
        const l = Number(f.lifeAge)
        if (!Number.isInteger(l) || l <= t || l > 110) return 'Paranın yetmesi gereken yaş, hedef yaştan büyük ve en çok 110 olmalı.'
        const d = Number(f.dependents)
        if (!Number.isInteger(d) || d < 0 || d > 20) return 'Bakmakla yükümlü olduğunuz kişi sayısını girin (0 olabilir).'
      }
      if (i === 1) money(f.income, 'Aylık net gelir')
      if (i === 2) {
        for (const g of SPEND_GROUPS) money(f.spending[g], SPEND_GROUP_LABEL[g], true)
        if (sumSpend(spending) + recurringTotal <= 0) return 'En az bir harcama grubuna tutar girin.'
      }
      if (i === 3)
        for (const d of debts) {
          const e = f.debts[d.id]
          if (!e) continue
          if (e.rate.trim() && !(num(e.rate) >= 0 && num(e.rate) <= 20)) return `${d.name}: aylık faiz %0 ile %20 arasında olmalı.`
          if (e.pay.trim()) money(e.pay, `${d.name} aylık ödemesi`)
        }
      if (i === 4) money(f.big, 'Yıllık büyük harcama', true)
      if (i === 6) {
        money(f.pension, 'SGK/BES aylığı', true)
        money(f.passive, 'Kira ve pasif gelir', true)
        money(f.partTime, 'Yarı zamanlı gelir', true)
      }
      if (i === 7) {
        if (f.customW) {
          const w = num(f.withdrawal)
          if (!Number.isFinite(w) || w < 0.5 || w > 10) return 'Çekim oranı %0,5 ile %10 arasında olmalı.'
        }
        const inf = num(f.inflation)
        if (!Number.isFinite(inf) || inf < 0 || inf > 200) return 'Enflasyon varsayımı %0 ile %200 arasında olmalı.'
        if (f.base !== 'TRY' && !rates[f.base]) return `${BASE_LABEL[f.base]} fiyatı henüz alınamadı; giriş yaptığınızdan emin olun ya da TL seçin.`
      }
    } catch (e) {
      return e instanceof Error ? e.message : 'Geçersiz bilgi.'
    }
    return null
  }
  const go = (to: number) => {
    if (to > step) {
      const e = check(step)
      if (e) return setError(e)
    }
    setError(undefined)
    setDir(to > step ? 1 : -1)
    setStep(to)
  }

  const save = async () => {
    for (let i = 0; i < STEPS.length; i++) {
      const e = check(i)
      if (e) {
        setStep(i)
        return setError(e)
      }
    }
    setError(undefined)
    const full = buildFreedomPlan(draft, factsDraft, { rates, strategy: f.strategy, runs: 0 })
    const stance: RiskStance = tolerance === null || tolerance === 1 ? 'balanced' : tolerance === 0 ? 'cautious' : 'bold'
    const profile: JourneyProfile = {
      ...draft,
      horizonYears: targetN - Number(f.age),
      targetMonthlyExpenseKurus: full.targetMonthlyKurus,
      // Eski alan (koç planı ve senaryolar): zorunlu gruplar + düzenli ödemeler; borç ve taksit ödemeleri koçta ayrıca sayılır
      essentialMonthlyKurus: spending.housing + spending.food + spending.transport + spending.bills + recurring.filter((r) => !r.installment).reduce((t, r) => t + r.monthlyKurus, 0),
      withdrawalRatePct: f.customW ? num(f.withdrawal) : full.withdrawal.recommendedPct,
      confirmedAt: new Date().toISOString(),
      risk: stance,
      tests: [...(initial?.tests ?? []), today].slice(-24),
    }
    try {
      setBusy(true)
      // Testte tamamlanan faiz ve taksitler borç kaydına yazılır; bir dahaki hesapta oradan gelir
      for (const d of debts) {
        const e = f.debts[d.id]
        const a = assetById.get(d.id)
        if (!e || !a || (!e.rate.trim() && !e.pay.trim())) continue
        const rate = e.rate.trim() ? num(e.rate) : (a.debtTerms?.monthlyRatePct ?? 0)
        const pay = e.pay.trim() ? money(e.pay, '') : (a.debtTerms?.minPaymentKurus ?? null)
        await repo.saveAsset({ id: a.id, kind: a.kind, name: a.name, unit: a.unit, debtTerms: { monthlyRatePct: rate, minPaymentKurus: pay } })
      }
      await repo.saveSettings({ journey: profile, coach: { ...coach, strategy: f.strategy } })
      toast(initial ? 'Test yenilendi; rotanız güncellendi.' : 'Rotanız hazır.')
      onDone()
    } catch (e) {
      setError(toUserMessage(e))
    } finally {
      setBusy(false)
    }
  }

  if (initial && left === 0)
    return (
      <Card className="p-5">
        <p className="text-[13.5px] text-muted">Bu ayki {TESTS_PER_MONTH} test hakkınızı kullandınız. Gelecek ay yeniden yapabilirsiniz. Borç, düzenli ödeme ya da varlık değiştiğinde rotanız zaten kendiliğinden güncellenir.</p>
        {onCancel && (
          <Button className="mt-3" variant="ghost" onClick={onCancel}>
            Rotama dön
          </Button>
        )}
      </Card>
    )

  const last = step === STEPS.length - 1
  const tag = (has: boolean) => (has ? <Badge tone="accent">Uygulamadan</Badge> : <Badge tone="warning">Eksik</Badge>)
  const reach = preview.reachAge === null ? 'Ulaşılamıyor' : `${Math.ceil(preview.reachAge)} yaşında`
  return (
    <Card className="overflow-hidden p-5" aria-label="Finansal özgürlük testi">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
        <ClipboardCheck className="size-5 text-accent" /> Finansal özgürlük testi
      </h2>
      <p className="mt-1 text-[13.5px] text-muted">
        Uygulamadaki bilgiler getirildi; doğrulayın veya düzeltin. Tutarları bugünün parasıyla yazın. Borç, düzenli ödeme ya da varlık değiştiğinde rotanız testi yeniden yapmadan güncellenir.
        {initial ? ` Bu ay ${left} test hakkınız var.` : ` Testi ayda ${TESTS_PER_MONTH} kez yenileyebilirsiniz.`}
      </p>

      <div className="sticky top-0 z-10 mt-4 grid grid-cols-3 gap-2 rounded-xl border border-line bg-surface p-3" aria-label="Canlı özet" role="group">
        <div className="min-w-0">
          <div className="text-[11.5px] text-muted">Hedef birikim</div>
          <div className="num truncate text-[14px] font-semibold text-ink">{inBase(preview.fiKurus)}</div>
        </div>
        <div className="min-w-0">
          <div className="text-[11.5px] text-muted">Bugünkü hızla</div>
          <div className="num truncate text-[14px] font-semibold text-ink">{reach}</div>
        </div>
        <div className="min-w-0">
          <div className="text-[11.5px] text-muted">Tasarruf oranı</div>
          <div className="num truncate text-[14px] font-semibold text-ink">%{Math.round(preview.savingRate * 100)}</div>
        </div>
      </div>

      <ol className="mt-4 grid grid-cols-8 gap-1" aria-label="Test adımları">
        {STEPS.map((t, i) => (
          <li key={t}>
            <button type="button" className="w-full text-left" onClick={() => i < step && go(i)} aria-current={i === step ? 'step' : undefined} aria-label={t} disabled={i > step}>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <motion.div className="h-full rounded-full bg-accent" initial={false} animate={{ width: i <= step ? '100%' : '0%' }} transition={{ duration: reduced ? 0 : 0.35 }} />
              </div>
            </button>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[12.5px] font-medium text-muted">
        Adım {step + 1}/{STEPS.length}: {STEPS[step]}
      </p>
      <AnimatePresence mode="wait" initial={false} custom={dir}>
        <motion.div
          key={step}
          custom={dir}
          initial={reduced ? false : { opacity: 0, x: 24 * dir }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduced ? undefined : { opacity: 0, x: -24 * dir }}
          transition={{ duration: 0.22 }}
          className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2"
        >
          {step === 0 && (
            <>
              <Field label="Yaşınız" htmlFor="t-age">
                <Input id="t-age" inputMode="numeric" value={f.age} onChange={(e) => set('age', e.target.value.replace(/\D/g, ''))} placeholder="Örn. 32" />
              </Field>
              <Field label="Hangi yaşta çalışmayı bırakmak istersiniz?" htmlFor="t-target-age" hint="Hedef yaş. Hedef süresi buradan çıkar.">
                <Input id="t-target-age" inputMode="numeric" value={f.targetAge} onChange={(e) => set('targetAge', e.target.value.replace(/\D/g, ''))} />
              </Field>
              <Field label="Paranın yetmesi gereken yaş" htmlFor="t-life-age" hint="Uzun planlamak daha güvenli; varsayılan 90.">
                <Input id="t-life-age" inputMode="numeric" value={f.lifeAge} onChange={(e) => set('lifeAge', e.target.value.replace(/\D/g, ''))} />
              </Field>
              <Field label="Bakmakla yükümlü olduğunuz kişi sayısı" htmlFor="t-dependents" hint="Çocuk, eş, ebeveyn… Yoksa 0.">
                <Input id="t-dependents" inputMode="numeric" value={f.dependents} onChange={(e) => set('dependents', e.target.value.replace(/\D/g, ''))} />
              </Field>
              <Field label="Konut durumunuz" htmlFor="t-housing">
                <Select id="t-housing" value={f.housing} onChange={(e) => set('housing', e.target.value as Housing)}>
                  {(Object.keys(HOUSING_LABEL) as Housing[]).map((k) => (
                    <option key={k} value={k}>
                      {HOUSING_LABEL[k]}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}
          {step === 1 && (
            <>
              <Field label={<span className="inline-flex items-center gap-2">Aylık net gelir (TL) {tag(!!initial)}</span>} htmlFor="t-income" hint="Maaş ve düzenli iş geliri.">
                <Input id="t-income" inputMode="decimal" value={f.income} onChange={(e) => set('income', e.target.value)} placeholder="0,00" />
              </Field>
              <Field label="Gelir düzeni" htmlFor="t-stability">
                <Select id="t-stability" value={f.stability} onChange={(e) => set('stability', e.target.value as IncomeStability)}>
                  {(Object.keys(STABILITY_LABEL) as IncomeStability[]).map((k) => (
                    <option key={k} value={k}>
                      {STABILITY_LABEL[k]}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}
          {step === 2 && (
            <>
              <p className="text-[13px] text-muted md:col-span-2">
                {fromData ? 'Son 3 dönemin işlemlerinden dolduruldu (düzenli ödemeler ve taksitler hariç). ' : 'Son dönemlerde kategorili harcama kaydı yok; tahmini girin. '}
                Kategorilere bölmek, toplamı tahmin etmekten daha doğru sonuç verir.
              </p>
              {SPEND_GROUPS.map((g) => (
                <Field key={g} label={<span className="inline-flex items-center gap-2">{SPEND_GROUP_LABEL[g]} (TL)</span>} htmlFor={`t-spend-${g}`}>
                  <Input id={`t-spend-${g}`} inputMode="decimal" value={f.spending[g]} onChange={(e) => set('spending', { ...f.spending, [g]: e.target.value })} placeholder="0,00" />
                </Field>
              ))}
              <div className="md:col-span-2" aria-label="Düzenli ödemeler" role="group">
                <div className="text-[13px] font-medium text-ink">Düzenli ödemeler ve taksitler {tag(recurring.length > 0)}</div>
                {recurring.length ? (
                  <ul className="mt-1.5 divide-y divide-line text-[13px]">
                    {recurring.map((r, i) => (
                      <li key={i} className="flex items-baseline justify-between gap-3 py-1.5">
                        <span className="min-w-0 truncate text-muted">
                          {r.name}
                          {r.remainingMonths !== null && <span className="text-subtle"> · {r.remainingMonths} ay kaldı</span>}
                        </span>
                        <span className="num shrink-0 text-ink">{formatKurus(r.monthlyKurus)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-[12.5px] text-subtle">Düzenli ödeme kaydı yok.</p>
                )}
                <p className="mt-1 text-[12px] text-subtle">Bunlar zorunlu gidere kendiliğinden eklenir. Biten taksitler o aydan sonra birikime sayılır.</p>
              </div>
              <div className="flex items-baseline justify-between border-t border-dashed border-line pt-3 text-sm font-semibold md:col-span-2">
                <span>Toplam aylık harcama</span>
                <span className="num">{formatKurus(sumSpend(spending) + recurringTotal)}</span>
              </div>
            </>
          )}
          {step === 3 && (
            <>
              {debts.length === 0 ? (
                <p className="text-[13px] text-muted md:col-span-2">Borçlar ve ödemeler sayfasında kayıtlı borç yok. Borç eklerseniz rota kendiliğinden güncellenir.</p>
              ) : (
                <ul className="flex flex-col gap-3 md:col-span-2" aria-label="Borçlarınız">
                  {debts.map((d) => {
                    const a = assetById.get(d.id)
                    const missingRate = !!a && !a.debtTerms && a.debtPlan?.mode !== 'monthly'
                    const missingPay = !!d.estimatedMin && a?.debtPlan?.mode !== 'monthly'
                    const e = f.debts[d.id] ?? { rate: '', pay: '' }
                    const setD = (k: 'rate' | 'pay', v: string) => set('debts', { ...f.debts, [d.id]: { ...e, [k]: v } })
                    return (
                      <li key={d.id} className="rounded-xl border border-line p-3">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="font-medium text-ink">{d.name}</span>
                          <span className="num text-[13px] text-muted">
                            {formatKurus(d.balanceKurus)} · aylık %{d.monthlyRatePct.toLocaleString('tr-TR')} · {formatKurus(d.minPaymentKurus)}/ay
                          </span>
                        </div>
                        {(missingRate || missingPay) && (
                          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            {missingRate && (
                              <Field label={`${d.name} aylık faiz (%)`} htmlFor={`t-rate-${d.id}`} hint="Bilinmiyor; girerseniz kayda yazılır.">
                                <Input id={`t-rate-${d.id}`} inputMode="decimal" value={e.rate} onChange={(ev) => setD('rate', ev.target.value)} placeholder="Örn. 4,25" />
                              </Field>
                            )}
                            {missingPay && (
                              <Field label={`${d.name} aylık ödeme (TL)`} htmlFor={`t-pay-${d.id}`} hint="Şu an tahmini asgari kullanılıyor.">
                                <Input id={`t-pay-${d.id}`} inputMode="decimal" value={e.pay} onChange={(ev) => setD('pay', ev.target.value)} placeholder="0,00" />
                              </Field>
                            )}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
              <div className="md:col-span-2">
                <div className="text-[13px] font-medium text-muted">Borç kapatma sırası</div>
                <Segmented<DebtStrategy>
                  label="Borç kapatma sırası"
                  value={f.strategy}
                  onChange={(v) => set('strategy', v)}
                  className="mt-1.5 w-full sm:w-auto"
                  options={(Object.keys(STRATEGY_LABEL) as DebtStrategy[]).map((k) => ({ value: k, label: STRATEGY_LABEL[k] }))}
                />
                <p className="mt-1.5 text-[12px] text-subtle">
                  Önce en yüksek faiz, toplam faizi en aza indirir. Önce en küçük borç, küçük zaferlerle motivasyonu artırabilir (Gal ve McShane 2012). Bir borç kapanınca taksiti sıradakine, borçlar bitince birikime gider.
                  {preview.debtFreeMonth !== null && preview.debtFreeMonth > 0 && ` Bu sırayla bütün borçlar ${preview.debtFreeMonth} ayda kapanır.`}
                </p>
              </div>
            </>
          )}
          {step === 4 && (
            <>
              <div className="md:col-span-2">
                <Slider id="t-pct" label="Bugünkü harcamanızın yüzde kaçıyla yaşamak istersiniz?" value={f.pct} min={50} max={160} step={5} onChange={(v) => set('pct', v)} display={(v) => `%${v}`} hint="%70 sade bir yaşam, %100 bugünkü düzen, %150 daha rahat bir yaşam demek." />
              </div>
              <div className="flex items-start justify-between gap-3 md:col-span-2">
                <div>
                  <div className="text-sm font-medium text-ink">Hedef yaşa kadar ev sahibi olmayı planlıyorum</div>
                  <p className="text-[12.5px] text-muted">Kira/konut gideri hedeften düşülür.</p>
                </div>
                <Switch label="Ev sahibi olma planı" checked={f.ownHome} onChange={(v) => set('ownHome', v)} />
              </div>
              <Field label="Yıllık seyahat / büyük harcama bütçesi (TL)" htmlFor="t-big" optional>
                <Input id="t-big" inputMode="decimal" value={f.big} onChange={(e) => set('big', e.target.value)} placeholder="0,00" />
              </Field>
              <Field label="Hedefiniz" htmlFor="t-goal">
                <Select id="t-goal" value={f.goal} onChange={(e) => set('goal', e.target.value as JourneyGoal)}>
                  {(Object.keys(JOURNEY_GOAL_LABEL) as JourneyGoal[]).map((g) => (
                    <option key={g} value={g}>
                      {JOURNEY_GOAL_LABEL[g]}
                    </option>
                  ))}
                </Select>
              </Field>
              {f.goal === 'custom' && (
                <Field label="Hedefin adı" htmlFor="t-goal-name">
                  <Input id="t-goal-name" value={f.goalName} maxLength={60} onChange={(e) => set('goalName', e.target.value)} placeholder="Örn. Kendi işimi kurmak" />
                </Field>
              )}
              <p className="text-[12.5px] text-muted md:col-span-2">
                Hedef yaşamın aylık gideri: <span className="num font-semibold text-ink">{formatKurus(preview.targetMonthlyKurus)}</span>
              </p>
            </>
          )}
          {step === 5 && (
            <>
              <div className="flex flex-col gap-4 md:col-span-2">
                {RISK_QUESTIONS.map((q, i) => (
                  <fieldset key={i}>
                    <legend className="text-[13.5px] font-medium text-ink">{q.q}</legend>
                    <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2" role="radiogroup" aria-label={q.q}>
                      {q.options.map((o, j) => {
                        const on = f.answers[i] === j + 1
                        return (
                          <button
                            key={o}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            onClick={() => set('answers', f.answers.map((x, k) => (k === i ? j + 1 : x)))}
                            className={cn('rounded-lg border px-3 py-2 text-left text-[13px]', on ? 'border-accent bg-accent-soft text-ink' : 'border-line text-muted hover:text-ink')}
                          >
                            {o}
                          </button>
                        )
                      })}
                    </div>
                  </fieldset>
                ))}
              </div>
              <div className="rounded-xl bg-accent-soft p-3 text-[13px] md:col-span-2" aria-label="Risk profiliniz" role="group">
                <div>
                  Risk toleransı: <strong>{tolerance === null ? '—' : RISK_PROFILES[tolerance].label}</strong> · risk kapasitesi (verilerden): <strong>{RISK_PROFILES[preview.risk.capacity].label}</strong>
                </div>
                <div className="mt-1">
                  Profiliniz: <strong>{preview.risk.profile.label}</strong> (%{Math.round(preview.risk.profile.equity * 100)} hisse / %{100 - Math.round(preview.risk.profile.equity * 100)} tahvil-mevduat) · beklenen reel getiri %{preview.risk.profile.realReturnPct.toLocaleString('tr-TR')}
                </div>
                <p className="mt-1 text-[12px] text-muted">Nihai profil, toleransla kapasitenin düşük olanıdır. Kapasite yatırım süresi, gelir düzeni, acil fon ve borç yükünden hesaplanır. Yalnızca varsayımı belirler; ürün önerilmez.</p>
              </div>
            </>
          )}
          {step === 6 && (
            <>
              <Field label="Beklenen SGK/BES aylığı (TL)" htmlFor="t-pension" optional hint="Bugünün parasıyla. Emin değilseniz 0 bırakın.">
                <Input id="t-pension" inputMode="decimal" value={f.pension} onChange={(e) => set('pension', e.target.value)} placeholder="0,00" />
              </Field>
              <Field label="Kira ve pasif gelir (TL/ay)" htmlFor="t-passive" optional hint="Kira, temettü, faiz gibi çalışmadan gelen gelir.">
                <Input id="t-passive" inputMode="decimal" value={f.passive} onChange={(e) => set('passive', e.target.value)} placeholder="0,00" />
              </Field>
              <Field label="Yarı zamanlı / serbest iş geliri (TL/ay)" htmlFor="t-parttime" optional hint="Hedef yaştan sonra beklenen.">
                <Input id="t-parttime" inputMode="decimal" value={f.partTime} onChange={(e) => set('partTime', e.target.value)} placeholder="0,00" />
              </Field>
              <Field label="Sağlık güvenceniz" htmlFor="t-health">
                <Select id="t-health" value={f.health} onChange={(e) => set('health', e.target.value as HealthCover)}>
                  {(Object.keys(HEALTH_LABEL) as HealthCover[]).map((k) => (
                    <option key={k} value={k}>
                      {HEALTH_LABEL[k]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Emeklilik güvenceniz" htmlFor="t-pension-cover">
                <Select id="t-pension-cover" value={f.pensionCover} onChange={(e) => set('pensionCover', e.target.value as Pension)}>
                  {(Object.keys(PENSION_LABEL) as Pension[]).map((k) => (
                    <option key={k} value={k}>
                      {PENSION_LABEL[k]}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}
          {step === 7 && (
            <>
              <Field label="Plan birimi" htmlFor="t-base" hint="USD ya da gram altın seçerseniz hedefleriniz o birimde sabitlenir; TL karşılığı kurla birlikte değişir.">
                <Select id="t-base" value={f.base} onChange={(e) => set('base', e.target.value as PlanBase)}>
                  {(Object.keys(BASE_LABEL) as PlanBase[]).map((k) => (
                    <option key={k} value={k}>
                      {BASE_LABEL[k]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="TL enflasyon varsayımı (%/yıl)" htmlFor="t-inflation" hint="Yalnızca gelecekteki TL tutarını göstermek için.">
                <Input id="t-inflation" inputMode="decimal" value={f.inflation} onChange={(e) => set('inflation', e.target.value)} />
              </Field>
              <div className="flex items-start justify-between gap-3 md:col-span-2">
                <div>
                  <div className="text-sm font-medium text-ink">Çekim oranını kendim belirleyeceğim</div>
                  <p className="text-[12.5px] text-muted">
                    Önerilen: <strong>%{preview.withdrawal.recommendedPct.toLocaleString('tr-TR')}</strong> ({preview.retirementYears} yıllık çekim süresine göre; Bengen 1994, Pfau 2010).
                  </p>
                </div>
                <Switch label="Çekim oranını kendim belirleyeceğim" checked={f.customW} onChange={(v) => set('customW', v)} />
              </div>
              {f.customW && (
                <Field label="Birikimden yıllık çekim oranı (%)" htmlFor="t-withdrawal" hint="Düştükçe gereken birikim artar.">
                  <Input id="t-withdrawal" inputMode="decimal" value={f.withdrawal} onChange={(e) => set('withdrawal', e.target.value)} />
                </Field>
              )}
            </>
          )}
        </motion.div>
      </AnimatePresence>
      {error && (
        <p className="mt-3 text-[13px] font-medium text-danger" role="alert">
          {error}
        </p>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {step > 0 && (
          <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={() => go(step - 1)}>
            Geri
          </Button>
        )}
        {last ? (
          <Button variant="primary" loading={busy} onClick={() => void save()} disabled={!settings}>
            {initial ? 'Testi tamamla, rotamı güncelle' : 'Testi tamamla, rotamı oluştur'}
          </Button>
        ) : (
          <Button variant="primary" onClick={() => go(step + 1)}>
            İleri <ArrowRight className="size-4" />
          </Button>
        )}
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Vazgeç
          </Button>
        )}
      </div>
    </Card>
  )
}
