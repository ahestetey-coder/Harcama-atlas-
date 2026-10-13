import { describe, expect, it } from 'vitest'
import { averageMonthlyIncome, flexibleCategoryAverages, flexibleCategoryAveragesWithMonths, suggestBudget, type AutoBudgetInput } from './autoBudget'
import { buildBucketBudget, fixedSpendSplit, toAutoBudget, type FixedLine } from './bucketBudget'
import { merchantKey, normalizeText } from './normalize'
import type { Transaction } from './types'

let seq = 0
const tx = (date: string, lira: number, type: Transaction['type'] = 'expense', categoryId: string | null = 'market', extra: Partial<Transaction> = {}): Transaction => ({
  id: String(++seq),
  date,
  amountKurus: Math.round(lira * 100),
  type,
  description: extra.description ?? 'X',
  normalizedDescription: normalizeText(extra.description ?? 'X'),
  categoryId,
  source: 'manual',
  createdAt: '',
  updatedAt: '',
  ...extra,
})

const base: AutoBudgetInput = {
  incomeKurus: 50_000_00,
  incomeSource: 'records',
  recurringKurus: 5_000_00,
  debtKurus: 10_000_00,
  goals: [],
  minSavingRate: 0.1,
  categoryAverages: null,
  weekly: false,
  periodDays: 30,
}

describe('koçun otomatik bütçesi', () => {
  it('gelir yoksa bütçe kurmaz', () => {
    expect(suggestBudget({ ...base, incomeKurus: null, incomeSource: null })).toBeNull()
  })

  it('gelirden birikim payını ayırır, ödemeler bütçenin içinde kalır', () => {
    const b = suggestBudget(base)!
    expect(b.savingKurus).toBe(5_000_00)
    expect(b.totalKurus).toBe(45_000_00)
    expect(b.flexibleKurus).toBe(30_000_00)
    expect(b.weeklyKurus).toBeNull()
    expect(b.categoryLimits).toEqual({})
  })

  it('birikim hedefleri asgari payı aşarsa hedefler esas alınır', () => {
    const b = suggestBudget({ ...base, goals: [{ id: 'g', name: 'Tatil', monthlyKurus: 8_000_00 }] })!
    expect(b.goalsKurus).toBe(8_000_00)
    expect(b.extraSavingKurus).toBe(0)
    expect(b.totalKurus).toBe(42_000_00)
  })

  it('ödemeler gelire sığmazsa önce birikim kısılır, sonra açık gösterilir', () => {
    const tight = suggestBudget({ ...base, debtKurus: 42_000_00 })!
    expect(tight.savingKurus).toBe(3_000_00)
    expect(tight.savingCutKurus).toBe(2_000_00)
    expect(tight.flexibleKurus).toBe(0)
    const over = suggestBudget({ ...base, debtKurus: 50_000_00 })!
    expect(over.savingKurus).toBe(0)
    expect(over.shortfallKurus).toBe(5_000_00)
    expect(over.totalKurus).toBe(55_000_00)
  })

  it('serbest harcamayı kategorilere geçmişe göre dağıtır, sığmazsa orantılı kısar', () => {
    const b = suggestBudget({
      ...base,
      weekly: true,
      categoryAverages: [
        { categoryId: 'market', averageKurus: 24_000_00 },
        { categoryId: 'restoran', averageKurus: 16_000_00 },
        { categoryId: 'kirtasiye', averageKurus: 500_00 },
      ],
    })!
    // 40.500 TL ortalama, 30.000 TL serbest harcama: %26 kısıntı; küçük kategori limitlenmez
    expect(b.cutPct).toBe(26)
    expect(Object.keys(b.categoryLimits).sort()).toEqual(['market', 'restoran'])
    expect(b.categoryLimits.market).toBe(17_750_00)
    expect(b.weeklyKurus).toBe(7_000_00)
    expect(b.historyKurus).toBe(40_500_00)
  })

  it('geliri son dönemlerin ortalamasından, yoksa bu dönemden alır', () => {
    const today = '2026-10-08'
    expect(averageMonthlyIncome([tx('2026-09-05', 40_000, 'income'), tx('2026-08-05', 50_000, 'income'), tx('2026-10-05', 99_000, 'income')], 1, today)).toBe(45_000_00)
    expect(averageMonthlyIncome([tx('2026-10-05', 30_000, 'income')], 1, today)).toBe(30_000_00)
    expect(averageMonthlyIncome([tx('2026-09-05', 1_000, 'expense')], 1, today)).toBeNull()
  })

  it('kategori ortalamasına taksitleri ve düzenli ödemeleri katmaz', () => {
    const avg = flexibleCategoryAverages(
      [
        tx('2026-09-03', 3_000, 'expense', 'market'),
        tx('2026-08-03', 1_000, 'expense', 'market'),
        tx('2026-09-04', 500, 'refund', 'market'),
        tx('2026-09-10', 2_000, 'expense', 'elektronik', { installment: { current: 1, total: 6 } as Transaction['installment'] }),
        tx('2026-09-12', 800, 'expense', 'fatura', { description: 'TURKCELL FATURA' }),
        tx('2026-10-02', 9_000, 'expense', 'market'),
      ],
      1,
      '2026-10-08',
      new Set([merchantKey('TURKCELL FATURA')]),
    )
    expect(avg).toEqual([{ categoryId: 'market', averageKurus: 1_750_00 }])
  })
})

describe('dört kovalı bütçeden koç bütçesine', () => {
  const line = (key: string, kind: FixedLine['kind'], kurus: number, flags: Partial<FixedLine> = {}): FixedLine => ({
    key,
    label: key,
    kind,
    monthlyKurus: kurus,
    periodKurus: kurus,
    housing: false,
    consumer: false,
    inSpending: true,
    source: 'recurring',
    ...flags,
  })

  it('alanları eşler: toplam = düzenli + borç + serbest', () => {
    const fixed = [
      line('rec:kira', 'housing', 18_000_00, { housing: true }),
      line('rec:fatura', 'bill', 3_000_00),
      line('rec:dizi', 'subscription', 300_00),
      line('fee:bank', 'fee', 200_00, { source: 'history' }),
      // Haftalık ödeme: bu dönem 5 kez, aylık karşılığı daha düşük
      line('inst:telefon', 'debt', 2_000_00, { consumer: true, periodKurus: 2_500_00 }),
      line('debt:kart', 'debt', 4_000_00, { consumer: true, inSpending: false, source: 'asset' }),
    ]
    const b = buildBucketBudget({
      income: { monthlyKurus: 70_000_00, source: 'plan', plannedKurus: 70_000_00, irregularKurus: 0, oneOffKurus: 0, reservedKurus: 0, upcoming: [], salaryUpdateKurus: null, confidence: 'high' },
      fixed,
      consumerBalanceKurus: 20_000_00,
      goalsKurus: 5_000_00,
      liquidKurus: null,
      household: { stability: 'regular', dependents: 0, earners: null },
      journeySpending: null,
      candidates: [],
      history: { needKurus: 15_000_00, wantKurus: 8_000_00, months: 3 },
      payday: null,
      detail: true,
      periodDays: 31,
    })!
    const split = fixedSpendSplit(fixed)
    expect(split).toEqual({ recurringKurus: 21_500_00, debtKurus: 2_500_00 })
    const a = toAutoBudget(b, 'plan', 5_000_00, split.recurringKurus, split.debtKurus)
    expect(a.incomeKurus).toBe(70_000_00)
    expect(a.incomeSource).toBe('plan')
    expect(a.savingKurus).toBe(b.saving.kurus + b.saving.debtExtraKurus)
    expect(a.goalsKurus).toBe(5_000_00)
    expect(a.extraSavingKurus).toBe(a.savingKurus - 5_000_00)
    expect(a.savingCutKurus).toBe(b.saving.cutKurus)
    expect(a.flexibleKurus).toBe(b.buckets.needs.kurus + b.buckets.wants.kurus)
    expect(a.totalKurus).toBe(b.spendKurus)
    expect(a.recurringKurus + a.debtKurus + a.flexibleKurus).toBe(a.totalKurus)
    expect(a.historyKurus).toBe(23_000_00)
    expect(a.weeklyKurus).toBe(b.weeklyKurus)
    expect(a.categoryLimits).toBe(b.categoryLimits)
    expect(a.shortfallKurus).toBe(0)
    expect(a.buckets).toBe(b)
  })

  it('hedefler birikimden büyükse hedef payı birikimle sınırlı', () => {
    const b = buildBucketBudget({
      income: { monthlyKurus: 60_000_00, source: 'records', plannedKurus: 0, irregularKurus: 60_000_00, oneOffKurus: 0, reservedKurus: 0, upcoming: [], salaryUpdateKurus: null, confidence: 'low' },
      fixed: [line('rec:kira', 'housing', 18_000_00, { housing: true }), line('rec:fatura', 'bill', 3_000_00), line('debt:kart', 'debt', 4_000_00, { consumer: true, inSpending: false, source: 'asset' })],
      consumerBalanceKurus: 0,
      goalsKurus: 15_000_00,
      liquidKurus: 0,
      household: { stability: 'variable', dependents: 0, earners: null },
      journeySpending: null,
      candidates: [],
      history: null,
      payday: null,
      detail: false,
      periodDays: 30,
    })!
    const a = toAutoBudget(b, 'records', 15_000_00, 21_000_00, 0)
    expect(a.incomeSource).toBe('records')
    expect(a.savingKurus).toBe(9_000_00)
    expect(a.goalsKurus).toBe(9_000_00)
    expect(a.extraSavingKurus).toBe(0)
    expect(a.savingCutKurus).toBe(6_000_00)
    expect(a.weeklyKurus).toBeNull()
    expect(a.categoryLimits).toEqual({})
  })

  it('gelir kaynağı maaş tanımı olabilir', () => {
    expect(suggestBudget({ ...base, incomeSource: 'plan' })!.incomeSource).toBe('plan')
  })

  it('kategori ortalamalarıyla birlikte harcama görülen dönem sayısını verir', () => {
    const txs = [tx('2026-09-03', 3_000, 'expense', 'market'), tx('2026-08-03', 1_000, 'expense', 'market'), tx('2026-10-02', 9_000, 'expense', 'market')]
    const r = flexibleCategoryAveragesWithMonths(txs, 1, '2026-10-08', new Set())
    expect(r).toEqual({ averages: [{ categoryId: 'market', averageKurus: 2_000_00 }], months: 2 })
    expect(flexibleCategoryAverages(txs, 1, '2026-10-08', new Set())).toEqual(r.averages)
    expect(flexibleCategoryAveragesWithMonths([], 1, '2026-10-08', new Set())).toEqual({ averages: [], months: 0 })
    // Yalnızca bu dönemde harcama varsa geçmiş dönem sayılmaz
    expect(flexibleCategoryAveragesWithMonths([txs[2]], 1, '2026-10-08', new Set()).months).toBe(0)
    expect(flexibleCategoryAveragesWithMonths(txs, 1, '2026-10-08', new Set(), 1).months).toBe(1)
  })
})
