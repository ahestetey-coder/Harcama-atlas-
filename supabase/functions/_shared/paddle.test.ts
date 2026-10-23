import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { discountBody, parseEvent, priceBody, subscriptionFromEvent, verifyPaddleSignature, type PaddleEvent } from './paddle'

const secret = 'pdl_ntfset_test_secret'
const sign = (ts: number, body: string, key = secret) => `ts=${ts};h1=${createHmac('sha256', key).update(`${ts}:${body}`).digest('hex')}`

describe('Paddle bildirim imzası', () => {
  const body = '{"event_id":"evt_1"}'
  const now = 1_760_000_000

  it('doğru imzayı kabul eder', async () => {
    expect(await verifyPaddleSignature(sign(now, body), body, secret, now)).toBe(true)
  })
  it('değişmiş gövdeyi, yanlış anahtarı ve eski imzayı reddeder', async () => {
    expect(await verifyPaddleSignature(sign(now, body), body + ' ', secret, now)).toBe(false)
    expect(await verifyPaddleSignature(sign(now, body, 'baska'), body, secret, now)).toBe(false)
    expect(await verifyPaddleSignature(sign(now - 301, body), body, secret, now)).toBe(false)
    expect(await verifyPaddleSignature(null, body, secret, now)).toBe(false)
    expect(await verifyPaddleSignature('ts=abc;h1=00', body, secret, now)).toBe(false)
  })
  it('anahtar değişimi sırasında gelen iki imzadan biri doğruysa kabul eder', async () => {
    const h = `${sign(now, body)};h1=${'0'.repeat(64)}`
    expect(await verifyPaddleSignature(h, body, secret, now)).toBe(true)
  })
})

const sub = (over: Record<string, unknown> = {}, type = 'subscription.created'): PaddleEvent => ({
  event_id: 'evt_01',
  event_type: type,
  occurred_at: '2026-10-21T10:00:00Z',
  data: {
    id: 'sub_01abc',
    status: 'trialing',
    customer_id: 'ctm_01',
    currency_code: 'TRY',
    custom_data: { user_id: '22222222-2222-2222-2222-222222222222' },
    current_billing_period: { starts_at: '2026-10-21T10:00:00Z', ends_at: '2026-10-28T10:00:00Z' },
    scheduled_change: null,
    items: [{ price: { id: 'pri_01', unit_price: { amount: '19999', currency_code: 'TRY' }, custom_data: { plan: 'plusplus', period: 'monthly' } }, trial_dates: { starts_at: '2026-10-21T10:00:00Z', ends_at: '2026-10-28T10:00:00Z' } }],
    ...over,
  },
})

describe('abonelik olayı', () => {
  it('denemedeki Plus+ aboneliğini satıra çevirir', () => {
    expect(subscriptionFromEvent(sub())).toEqual({
      id: 'sub_01abc',
      user_id: '22222222-2222-2222-2222-222222222222',
      customer_id: 'ctm_01',
      plan: 'plusplus',
      period: 'monthly',
      status: 'trialing',
      price_id: 'pri_01',
      amount_kurus: 19999,
      currency: 'TRY',
      current_period_end: '2026-10-28T10:00:00Z',
      trial_end: '2026-10-28T10:00:00Z',
      cancel_at: null,
      discount_code: null,
      event_at: '2026-10-21T10:00:00Z',
    })
  })
  it('planlanmış iptali ve indirimi taşır', () => {
    const r = subscriptionFromEvent(sub({ status: 'active', scheduled_change: { action: 'cancel', effective_at: '2026-11-21T10:00:00Z' }, discount: { id: 'dsc_9' } }, 'subscription.updated'))
    expect(r?.cancel_at).toBe('2026-11-21T10:00:00Z')
    expect(r?.discount_code).toBe('dsc_9')
  })
  it('custom_data yoksa bilinen fiyat kimliğinden paketi bulur', () => {
    const e = sub({ items: [{ price: { id: 'pri_x', unit_price: { amount: '9999' } } }] })
    expect(subscriptionFromEvent(e)).toBeNull()
    expect(subscriptionFromEvent(e, { pri_x: { plan: 'plus', period: 'yearly' } })?.plan).toBe('plus')
  })
  it('geçersiz kullanıcı kimliğini yok sayar, tanınmayan durumu ve başka olayları reddeder', () => {
    expect(subscriptionFromEvent(sub({ custom_data: { user_id: "x' or 1=1" } }))?.user_id).toBeNull()
    expect(subscriptionFromEvent(sub({ status: 'weird' }))).toBeNull()
    expect(subscriptionFromEvent({ ...sub(), event_type: 'transaction.completed' })).toBeNull()
  })
  it('bozuk gövdeyi ayrıştırmaz', () => {
    expect(parseEvent('{')).toBeNull()
    expect(parseEvent('{"event_id":1}')).toBeNull()
    expect(parseEvent(JSON.stringify(sub()))?.event_id).toBe('evt_01')
  })
})

describe('Paddle gövdeleri', () => {
  it('fiyat KDV dahil, deneme süresi ve paket bilgisiyle gider', () => {
    const b = priceBody({ plan: 'plusplus', period: 'yearly', currency: 'TRY', amount_kurus: 191990, trial_days: 7, active: true }, 'pro_1')
    expect(b.unit_price).toEqual({ amount: '191990', currency_code: 'TRY' })
    expect(b.billing_cycle).toEqual({ interval: 'year', frequency: 1 })
    expect(b.trial_period).toEqual({ interval: 'day', frequency: 7 })
    expect(b.tax_mode).toBe('internal')
    expect(b.custom_data).toEqual({ plan: 'plusplus', period: 'yearly' })
    expect(b).not.toHaveProperty('status')
    expect(priceBody({ plan: 'plus', period: 'monthly', currency: 'TRY', amount_kurus: 9999, trial_days: 0, active: false }, null)).toMatchObject({ trial_period: null, status: 'archived' })
    expect(priceBody({ plan: 'plus', period: 'monthly', currency: 'USD', amount_kurus: 299, trial_days: 7, active: true }, 'pro_1').unit_price).toEqual({ amount: '299', currency_code: 'USD' })
  })
  it('kampanya kodu yalnızca seçilen fiyatlara uygulanır', () => {
    const ids = { 'plus:monthly': ['pri_a'], 'plus:yearly': ['pri_b'], 'plusplus:monthly': ['pri_c', 'pri_cu'], 'plusplus:yearly': ['pri_d'] }
    const b = discountBody({ code: 'YAZ20', percent_off: 20, plans: ['plusplus'], periods: ['monthly', 'yearly'], recur_intervals: 3, usage_limit: 100, expires_at: null, active: true, note: null }, ids)
    expect(b).toMatchObject({ amount: '20', type: 'percentage', code: 'YAZ20', recur: true, maximum_recurring_intervals: 3, restrict_to: ['pri_c', 'pri_cu', 'pri_d'], status: 'active' })
    const once = discountBody({ code: 'ILK', percent_off: 50, plans: ['plus'], periods: ['monthly'], recur_intervals: 1, usage_limit: null, expires_at: '2020-01-01T00:00:00Z', active: true, note: 'İlk ay' }, ids)
    expect(once).toMatchObject({ recur: false, maximum_recurring_intervals: null, status: 'archived', expires_at: null, description: 'İlk ay' })
    expect(discountBody({ code: 'X1', percent_off: 10, plans: ['plus'], periods: ['monthly'], recur_intervals: null, usage_limit: null, expires_at: null, active: true, note: null }, ids, true)).not.toHaveProperty('status')
  })
})
