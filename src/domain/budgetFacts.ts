import { CARD_MIN_RATE } from './assumptions'
import { CONSUMER_DEBT, debtMonthlyPayment, debtPlanStatus, debtTypeOf, holdingSummary, INSTALLMENT_DEBT, type Asset, type DebtType } from './assets'
import { flexibleCategoryAveragesWithMonths } from './autoBudget'
import { CATEGORY_PRIOR_BP, categoryBucketOf, type BucketInput, type CategoryBucket, type FixedLine, type LimitCandidate } from './bucketBudget'
import { estimatedMinPayment } from './coach'
import { periodLength, periodOf, periodRange } from './dates'
import { goalProgress, type SavingsGoal } from './goals'
import { incomeBasis, monthlyEquivalent, nextPayday, primarySalary } from './income'
import { spendGroupOf, type IncomeStability } from './journey'
import { installmentPlans, occurrencesBetween, progressOf } from './recurring'
import type { Category, IsoDate, MonthKey, RecurringPayment, Settings, Transaction } from './types'

/**
 * Dört kovalı bütçenin girdileri: gelir tabanı, zorunlu sabit satırlar, geçmiş harcama, borç ve
 * birikim bilgisi. Öncelik satır türü başına: ayrıntılı kayıt > kısa beyan (budgetProfile) > Yolculuk
 * testi. Paket kapıları girdi olarak gelir; saf fonksiyonlar, cihazda çalışır.
 */

/** Sahip kararı: Plus'ta girilmiş mevcut ödeme/borç/varlık verisi her pakette okunur (yalnızca giriş Plus). */
export const READ_LOCKED_DATA: boolean = true

/** Hangi verinin bütçeye girdiği (paket kapıları). */
export interface FactsGates {
  /** Düzenli ödemeler (kira, fatura, abonelik). */
  recurring: boolean
  /** Borçlar ve varlıklar. */
  assets: boolean
  /** Elle eklenen taksitler ve ekstre taksitleri. */
  installments: boolean
  /** Birikim hedefleri. */
  goals: boolean
  /** Yolculuk testi (gelir, harcama, hane bilgisi). */
  journey: boolean
  /** Kategori limitleri ve haftalık bütçe. */
  detail: boolean
}

export interface FactsInput {
  /** "Tümü" görünümünde hesaba giren işlemler; planlı satırlar olabilir. */
  txs: Transaction[]
  settings: Settings
  /** Kayıtlı düzenli ödemeler (useRecurring); borç planlarından türeyen debt:* kalemleri okunmaz. */
  recurring: RecurringPayment[]
  assets: Asset[]
  goals: SavingsGoal[]
  categories: Category[]
  startDay: number
  today: IsoDate
  gates: FactsGates
}

/** Paketi açık, etkin düzenli ödemeler; borçtan türeyen kalemler, varlıktaki borçla iki kez sayılmasın diye dışarıda. */
function gatedRecurring(a: FactsInput): RecurringPayment[] {
  return a.recurring.filter((r) => r.active && !r.id.startsWith('debt:') && (r.kind === 'installment' ? a.gates.installments : a.gates.recurring))
}

/** Bütçeye giren düzenli ödemeler: taksitte kalan taksit olmalı, diğerlerinde bitmemiş olmalı. */
function usedRecurring(a: FactsInput): RecurringPayment[] {
  return gatedRecurring(a).filter((r) => {
    const left = progressOf(r, a.today).remaining
    return r.kind === 'installment' ? (left ?? 0) > 0 : left !== 0
  })
}

/** Düzenli ödeme konut gideri mi: kategorinin grubu; kategorisizse adı ("Ev kirası" evet, "Araç kiralama" hayır). */
function isHousing(r: RecurringPayment, cats: Map<string, Category>): boolean {
  if (!r.categoryId) return categoryBucketOf('', r.name) === 'fixed'
  return spendGroupOf(r.categoryId, cats.get(r.categoryId)?.name ?? '') === 'housing'
}

/** Kart asgarisi girilmemişse: faiz + %3 ile bakiyenin %20'sinden büyüğü. */
function cardEstimate(balanceKurus: number, monthlyRatePct: number): number {
  return Math.max(estimatedMinPayment(balanceKurus, monthlyRatePct), Math.ceil(balanceKurus * CARD_MIN_RATE))
}

/** Beyandaki tutar girilmiş mi (0 da bir beyandır: o tür için Yolculuk testine düşülmez). */
const declared = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

function bucketResolver(categories: Category[]): (id: string) => CategoryBucket {
  const names = new Map(categories.map((c) => [c.id, c.name]))
  return (id) => categoryBucketOf(id, names.get(id) ?? '')
}

/**
 * Zorunlu sabit satırlar (şartname §3.C). `history`: kategori kimliği → son dönemlerin aylık ortalaması
 * (düzenli ödemelerle netleştirilmiş); yalnızca banka ücreti satırı için okunur. Kart asgarisi ekstre
 * taksitlerini zaten içerdiği için kart satırlarından ekstre taksitleri düşülür.
 */
export function collectFixedLines(a: FactsInput, period: MonthKey, history: Map<string, number>): FixedLine[] {
  const { today, gates } = a
  const { start, end } = periodRange(period, a.startDay)
  const cats = new Map(a.categories.map((c) => [c.id, c]))
  const lines: FixedLine[] = []
  const cardLines: FixedLine[] = []
  const assetTypes = new Set<DebtType>()

  // 1–2) Düzenli ödemeler ve elle eklenen taksitler
  for (const r of usedRecurring(a)) {
    const monthlyKurus = monthlyEquivalent(r.amountKurus, r.cadence)
    const periodKurus = occurrencesBetween(r, start, end).length * r.amountKurus
    if (r.kind === 'installment') {
      lines.push({ key: `inst:${r.id}`, label: r.name, kind: 'debt', monthlyKurus, periodKurus, housing: false, consumer: true, inSpending: true, source: 'recurring' })
      continue
    }
    const housing = isHousing(r, cats)
    const kind = housing ? 'housing' : r.kind === 'subscription' ? 'subscription' : 'bill'
    lines.push({ key: `rec:${r.id}`, label: r.name, kind, monthlyKurus, periodKurus, housing, consumer: false, inSpending: true, source: 'recurring' })
  }

  // 3) Ekstrelerdeki taksitler (elle eklenen taksitlerin iş yerleri hariç)
  let statementKurus = 0
  if (gates.installments) {
    const manualKeys = new Set(a.recurring.filter((r) => r.kind === 'installment' && r.matchKey).map((r) => r.matchKey!))
    for (const p of installmentPlans(a.txs, manualKeys)) {
      if (p.remaining <= 0) continue
      statementKurus += p.monthlyKurus
      lines.push({ key: `stmt:${p.key}`, label: `${p.name} (taksit)`, kind: 'debt', monthlyKurus: p.monthlyKurus, periodKurus: p.monthlyKurus, housing: false, consumer: true, inSpending: true, source: 'statement' })
    }
  }

  // 4) Borçlar: taksit, girilen asgari ya da tahmin
  if (gates.assets)
    for (const as of a.assets) {
      if (as.archived || as.kind !== 'debt') continue
      const bal = holdingSummary(as, today).valueKurus
      if (bal <= 0) continue
      const type = debtTypeOf(as)
      const k = debtMonthlyPayment(as, bal, today, type === 'card' ? cardEstimate : estimatedMinPayment)
      const line: FixedLine = {
        key: `debt:${as.id}`,
        label: as.name,
        kind: 'debt',
        monthlyKurus: k,
        periodKurus: k,
        housing: type === 'mortgage',
        consumer: CONSUMER_DEBT.includes(type),
        // Kart ve KMH ödemesi transferle yapılır; taksitli krediler gider olarak kaydedilir
        inSpending: as.debtPlan?.mode === 'monthly' || INSTALLMENT_DEBT.includes(type),
        source: 'asset',
        estimated: !debtPlanStatus(as.debtPlan, today) && !as.debtTerms?.minPaymentKurus,
      }
      lines.push(line)
      assetTypes.add(type)
      if (type === 'card') cardLines.push(line)
    }

  // 5) Banka ücretleri ve faiz: son dönemlerin ortalaması
  const bucketOf = bucketResolver(a.categories)
  let fee = 0
  for (const [id, k] of history) if (k > 0 && bucketOf(id) === 'fee') fee += k
  if (fee > 0) lines.push({ key: 'fee:bank', label: 'Banka ücretleri', kind: 'fee', monthlyKurus: fee, periodKurus: fee, housing: false, consumer: false, inSpending: true, source: 'history' })

  // 6–9) Kısa beyan: yalnızca aynı türden ayrıntılı kayıt yoksa
  const p = a.settings.budgetProfile
  const profileLine = (field: string, label: string, kind: FixedLine['kind'], k: number, flags: Pick<FixedLine, 'housing' | 'consumer' | 'inSpending'>): FixedLine => ({
    key: `profile:${field}`,
    label,
    kind,
    monthlyKurus: k,
    periodKurus: k,
    ...flags,
    source: 'profile',
  })
  let housingDeclared = false
  let billsDeclared = false
  if (!lines.some((l) => l.housing) && declared(p?.housingKurus)) {
    housingDeclared = true
    const mortgage = p.housing === 'mortgage'
    if (p.housingKurus > 0)
      lines.push(profileLine('housingKurus', mortgage ? 'Konut kredisi taksiti' : 'Kira ve aidat', mortgage ? 'debt' : 'housing', p.housingKurus, { housing: true, consumer: false, inSpending: true }))
  }
  if (!lines.some((l) => l.kind === 'bill') && declared(p?.billsKurus)) {
    billsDeclared = true
    if (p.billsKurus > 0) lines.push(profileLine('billsKurus', 'Faturalar', 'bill', p.billsKurus, { housing: false, consumer: false, inSpending: true }))
  }
  if (!assetTypes.has('card') && !assetTypes.has('overdraft') && declared(p?.cardPaymentKurus) && p.cardPaymentKurus > 0) {
    const line = profileLine('cardPaymentKurus', 'Kart asgari ve KMH ödemesi', 'debt', p.cardPaymentKurus, { housing: false, consumer: true, inSpending: false })
    lines.push(line)
    cardLines.push(line)
  }
  // Ekstre ve elle eklenen taksitler kart alışverişidir (kart asgarisinden düşülür), kredi değildir
  const loanLine = assetTypes.has('loan') || assetTypes.has('auto') || assetTypes.has('personal')
  if (!loanLine && declared(p?.loanPaymentKurus) && p.loanPaymentKurus > 0)
    lines.push(profileLine('loanPaymentKurus', 'Kredi taksitleri', 'debt', p.loanPaymentKurus, { housing: false, consumer: true, inSpending: true }))

  // 10–11) Yolculuk testi: konut ve faturalar için son çare
  const j = gates.journey ? a.settings.journey : undefined
  const sp = j?.spending
  if (j && sp) {
    const housing = p?.housing ?? j.housing
    if (!housingDeclared && !lines.some((l) => l.housing) && (housing === 'rent' || housing === 'mortgage') && sp.housing > 0) {
      const mortgage = housing === 'mortgage'
      lines.push({ key: 'journey:housing', label: mortgage ? 'Konut kredisi taksiti' : 'Kira', kind: mortgage ? 'debt' : 'housing', monthlyKurus: sp.housing, periodKurus: sp.housing, housing: true, consumer: false, inSpending: true, source: 'journey' })
    }
    if (!billsDeclared && !lines.some((l) => l.kind === 'bill') && sp.bills > 0)
      lines.push({ key: 'journey:bills', label: 'Faturalar ve abonelikler', kind: 'bill', monthlyKurus: sp.bills, periodKurus: sp.bills, housing: false, consumer: false, inSpending: true, source: 'journey' })
  }

  // Kart netleştirme: ekstre taksitleri kart asgarisinin içindedir, sırayla düşülür (taban 0)
  let left = statementKurus
  for (const l of cardLines) {
    const cut = Math.min(l.monthlyKurus, left)
    l.monthlyKurus -= cut
    l.periodKurus -= cut
    left -= cut
  }
  return lines
}

/** Bütçe motorunun girdisi; gelir tabanı yoksa null. */
export function budgetFacts(a: FactsInput): BucketInput | null {
  const { settings, startDay, today, gates } = a
  const journey = gates.journey ? (settings.journey ?? null) : null
  const incomes = settings.recurringIncomes ?? []
  const income = incomeBasis({ txs: a.txs, incomes, startDay, today, journey })
  if (!income) return null
  const period = periodOf(today, startDay)
  const profile = settings.budgetProfile

  // Geçmiş: serbest harcamanın kategori ortalamaları; iş yerinden tanınan düzenli ödemeler dışarıda
  const fixedKeys = new Set(gatedRecurring(a).filter((r) => r.matchKey).map((r) => r.matchKey!))
  const { averages, months } = flexibleCategoryAveragesWithMonths(a.txs, startDay, today, fixedKeys)
  const avg = new Map(averages.map((c) => [c.categoryId, c.averageKurus]))
  /** Kategorinin ortalamasından düşer (taban 0); düşülemeyen kalanı döndürür. */
  const net = (id: string, k: number) => {
    const cur = avg.get(id) ?? 0
    const cut = Math.min(cur, Math.max(0, k))
    if (cut > 0) avg.set(id, cur - cut)
    return Math.max(0, k) - cut
  }
  // Düzenli ödeme kategorisinin ortalamasında da durur ("Ekim kirası" gibi açıklamalar iş yeri anahtarına
  // uymaz): kategori başına düzenli ödemelerin toplamından, anahtarla zaten dışarıda kalan kısım düşülür
  const raw = new Map(flexibleCategoryAveragesWithMonths(a.txs, startDay, today, new Set()).averages.map((c) => [c.categoryId, c.averageKurus]))
  const byCategory = new Map<string, number>()
  for (const r of usedRecurring(a)) if (r.categoryId) byCategory.set(r.categoryId, (byCategory.get(r.categoryId) ?? 0) + monthlyEquivalent(r.amountKurus, r.cadence))
  for (const [id, k] of byCategory) net(id, k - Math.max(0, (raw.get(id) ?? 0) - (avg.get(id) ?? 0)))
  const fixed = collectFixedLines(a, period, avg)
  // Beyan ve Yolculuk testindeki konut ve faturalar geçmişte de görünür
  for (const l of fixed) {
    if (l.source !== 'profile' && l.source !== 'journey') continue
    if (l.housing) net('cat-kira', l.monthlyKurus)
    else if (l.kind === 'bill') net('cat-abonelik', net('cat-faturalar', l.monthlyKurus))
  }

  // Kovalara ayırma: Kira/Ev'de kalan (aidat, eşya) ihtiyaçlara sayılır, limitlenmez; banka ücreti sabit satırda
  const bucketOf = bucketResolver(a.categories)
  let needKurus = 0
  let wantKurus = 0
  for (const [id, k] of avg) {
    const b = bucketOf(id)
    if (b === 'want') wantKurus += k
    else if (b === 'need' || b === 'fixed') needKurus += k
  }
  const billsCovered = fixed.some((l) => l.kind === 'bill')
  const candidates: LimitCandidate[] = []
  for (const c of a.categories) {
    if (c.archived) continue
    const bucket = categoryBucketOf(c.id, c.name)
    if (bucket !== 'need' && bucket !== 'want') continue
    const priorBp = billsCovered && c.id === 'cat-faturalar' ? 0 : (CATEGORY_PRIOR_BP[c.id] ?? 0)
    candidates.push({ id: c.id, bucket, priorBp, historyKurus: avg.get(c.id) ?? 0, order: c.order })
  }

  // Faizli tüketici borcu bakiyesi: kart, KMH ya da faizli kredi; kayıt yoksa beyan
  let consumer: number | null = null
  let liquid: number | null = null
  if (gates.assets) {
    for (const as of a.assets) {
      if (as.archived || as.kind !== 'debt') continue
      const type = debtTypeOf(as)
      if (!CONSUMER_DEBT.includes(type)) continue
      if (type !== 'card' && type !== 'overdraft' && !((as.debtTerms?.monthlyRatePct ?? 0) > 0)) continue
      consumer = (consumer ?? 0) + Math.max(0, holdingSummary(as, today).valueKurus)
    }
    // Acil durum fonu yalnızca mevduat ve nakit; varlık girilmişse beyan okunmaz
    if (a.assets.some((as) => !as.archived && as.kind !== 'debt')) {
      liquid = 0
      for (const as of a.assets) if (!as.archived && (as.kind === 'deposit' || as.kind === 'cash')) liquid += Math.max(0, holdingSummary(as, today).valueKurus)
    }
  }
  const consumerBalanceKurus = consumer ?? (declared(profile?.consumerDebtKurus) ? profile.consumerDebtKurus : 0)
  const liquidKurus = liquid ?? (declared(profile?.emergencyFundKurus) ? profile.emergencyFundKurus : null)

  // Hedefler için ayda ayrılması gereken tutarlar
  let goalsKurus = 0
  if (gates.goals)
    for (const g of a.goals) {
      if (g.archived) continue
      const p = goalProgress(g, today)
      if (p.status === 'done') continue
      const monthly = p.monthlyNeededKurus ?? p.monthlyAverageKurus
      if (monthly > 0) goalsKurus += monthly
    }

  const salary = primarySalary(incomes)
  const stability: IncomeStability = journey?.incomeStability ?? (salary ? 'regular' : income.source === 'records' ? 'variable' : 'regular')

  return {
    income,
    fixed,
    consumerBalanceKurus,
    goalsKurus,
    liquidKurus,
    household: { stability, dependents: profile?.dependents ?? journey?.dependents ?? 0, earners: profile?.earners ?? null },
    journeySpending: journey?.spending ?? null,
    candidates,
    history: months > 0 ? { needKurus, wantKurus, months } : null,
    payday: salary ? nextPayday(salary, today) : null,
    detail: gates.detail,
    periodDays: periodLength(period, startDay),
  }
}
