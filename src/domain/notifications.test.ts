import { describe, expect, it } from 'vitest'
import { budgetAlerts, DEFAULT_NOTIFY_PREFS, MAX_PENDING, notificationId, planNotifications } from './notifications'
import type { BudgetStatus, LimitStatus } from './budget'
import type { DuePayment } from './recurring'
import type { RecurringIncome } from './types'

const now = new Date(2026, 9, 19, 12, 0) // 19 Ekim 2026 12:00 (yerel)

const due = (date: string, reminderDays = 3, amountKurus = 125_000): DuePayment => ({ date, name: 'Kira', amountKurus, source: 'recurring', id: 'r1', remind: false, reminderDays })

const salary: RecurringIncome = {
  id: 'm1',
  name: 'Maaş',
  kind: 'salary',
  amountKurus: 5_000_000,
  cadence: 'monthly',
  startDate: '2026-01-25',
  active: true,
  createdAt: '',
  updatedAt: '',
}

describe('planNotifications', () => {
  it('ödemeden önce ve ödeme günü hatırlatır, geçmiş saatleri atlar', () => {
    const out = planNotifications({ now, due: [due('2026-10-21'), due('2026-10-19', 0)], incomes: [], lastEntryDate: null }, DEFAULT_NOTIFY_PREFS)
    // 19 Ekim 09:00 geçti; 21 Ekim için 18 Ekim 10:00 da geçti → yalnızca 21 Ekim 09:00
    expect(out.map((n) => [n.at.getDate(), n.at.getHours(), n.title])).toEqual([[21, 9, 'Bugün ödeme günü: Kira']])
    expect(out[0].body).toBe('1.250 ₺ ödenecek.')
  })

  it('maaş gününü ve kayıt girilmeyen günleri bildirir', () => {
    const out = planNotifications({ now, due: [], incomes: [salary], lastEntryDate: '2026-10-18' }, DEFAULT_NOTIFY_PREFS)
    const keys = out.map((n) => `${n.kind}@${n.at.getMonth() + 1}-${n.at.getDate()} ${n.at.getHours()}`)
    expect(keys).toContain('income@10-25 11')
    expect(keys).toContain('income@11-25 11')
    // Son kayıt 18 Ekim → 21 Ekim akşamı, sonra 25 Ekim ve 1 Kasım
    expect(keys.filter((k) => k.startsWith('spending'))).toEqual(['spending@10-21 20', 'spending@10-25 20', 'spending@11-1 20'])
    expect(out.find((n) => n.kind === 'spending')!.body).toMatch(/^3 gündür kayıt yok/)
  })

  it('kapalı türleri ve ana anahtarı dikkate alır, iOS sınırını aşmaz', () => {
    expect(planNotifications({ now, due: [due('2026-10-25')], incomes: [salary], lastEntryDate: '2026-10-18' }, { ...DEFAULT_NOTIFY_PREFS, enabled: false })).toEqual([])
    const onlyPay = planNotifications({ now, due: [due('2026-10-25')], incomes: [salary], lastEntryDate: '2026-10-18' }, { ...DEFAULT_NOTIFY_PREFS, income: false, spending: false })
    expect(new Set(onlyPay.map((n) => n.kind))).toEqual(new Set(['payments']))
    const many = Array.from({ length: 40 }, (_, i) => ({ ...due(`2026-11-${String((i % 28) + 1).padStart(2, '0')}`), id: `r${i}` }))
    expect(planNotifications({ now, due: many, incomes: [], lastEntryDate: null }, DEFAULT_NOTIFY_PREFS)).toHaveLength(MAX_PENDING)
  })

  it('kimlikler kararlı ve pozitif', () => {
    expect(notificationId('a')).toBe(notificationId('a'))
    expect(notificationId('a')).not.toBe(notificationId('b'))
    expect(notificationId('pay:x:2026-10-21:gun')).toBeGreaterThan(0)
    expect(notificationId('pay:x:2026-10-21:gun')).toBeLessThan(2 ** 31)
  })
})

describe('budgetAlerts', () => {
  const lim = (spent: number, limit: number, state: LimitStatus['state']): LimitStatus => ({
    limitKurus: limit,
    carryKurus: 0,
    effectiveKurus: limit,
    spentKurus: spent,
    ratio: spent / limit,
    state,
  })
  const status = (warnings: BudgetStatus['warnings']): BudgetStatus => ({ total: null, categories: [], week: null, forecast: null, warnings })

  it('dönemde her durumu bir kez bildirir', () => {
    const s = status([
      { kind: 'total', status: lim(850_000, 1_000_000, 'near') },
      { kind: 'category', categoryId: 'market', status: lim(320_000, 300_000, 'over') },
      { kind: 'week', status: lim(1, 1, 'over') },
    ])
    const out = budgetAlerts(s, '2026-10', () => 'Market', new Set(), now)
    expect(out.map((n) => n.title)).toEqual(['Aylık bütçen %85 doldu', 'Market limitin aşıldı'])
    expect(out[1].body).toBe('Bu dönem 3.200 ₺ harcandı, limit 3.000 ₺. 200 ₺ fazla.')
    expect(budgetAlerts(s, '2026-10', () => 'Market', new Set(out.map((n) => n.key)), now)).toEqual([])
  })
})
