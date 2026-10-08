import { describe, expect, it } from 'vitest'
import { averageMonthlyIncome, flexibleCategoryAverages, suggestBudget, type AutoBudgetInput } from './autoBudget'
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
