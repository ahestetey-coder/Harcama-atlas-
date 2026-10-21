// Paddle (web aboneliği) için saf yardımcılar: bildirim imzası, abonelik olayının veritabanı biçimine
// çevrilmesi ve Paddle'a gönderilecek fiyat/indirim gövdeleri. Ağ ve veritabanı işi fonksiyonlardadır.

export type Plan = 'plus' | 'plusplus'
export type Period = 'monthly' | 'yearly'
export type PaddleEnv = 'sandbox' | 'production'

export const PADDLE_API: Record<PaddleEnv, string> = {
  sandbox: 'https://sandbox-api.paddle.com',
  production: 'https://api.paddle.com',
}

/** Bildirimlerden dinlenen olaylar. */
export const PADDLE_EVENTS = [
  'subscription.created',
  'subscription.updated',
  'subscription.activated',
  'subscription.trialing',
  'subscription.past_due',
  'subscription.paused',
  'subscription.resumed',
  'subscription.canceled',
] as const

export const PLAN_NAMES: Record<Plan, string> = { plus: 'Harcama Atlası Plus', plusplus: 'Harcama Atlası Plus+' }
const PERIOD_NAMES: Record<Period, string> = { monthly: 'Aylık', yearly: 'Yıllık' }

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

/**
 * Paddle-Signature başlığını doğrular: "ts=...;h1=..." ve h1 = HMAC-SHA256(secret, `${ts}:${gövde}`).
 * Beş dakikadan eski imza tekrar gönderim sayılıp reddedilir.
 */
export async function verifyPaddleSignature(header: string | null, rawBody: string, secret: string, nowSec = Math.floor(Date.now() / 1000), toleranceSec = 300): Promise<boolean> {
  if (!header || !secret) return false
  const parts = Object.fromEntries(
    header.split(';').map((p) => {
      const i = p.indexOf('=')
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()]
    }),
  )
  const ts = Number(parts.ts)
  const sigs = header
    .split(';')
    .filter((p) => p.trim().startsWith('h1='))
    .map((p) => p.trim().slice(3))
  if (!Number.isFinite(ts) || !sigs.length || Math.abs(nowSec - ts) > toleranceSec) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const expected = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${parts.ts}:${rawBody}`)))
  return sigs.some((s) => safeEqual(s, expected))
}

export interface PaddleEvent {
  event_id: string
  event_type: string
  occurred_at: string
  data: Record<string, unknown>
}

export function parseEvent(raw: string): PaddleEvent | null {
  try {
    const e = JSON.parse(raw) as Partial<PaddleEvent>
    if (typeof e.event_id !== 'string' || typeof e.event_type !== 'string' || typeof e.occurred_at !== 'string' || !e.data || typeof e.data !== 'object') return null
    return e as PaddleEvent
  } catch {
    return null
  }
}

/** ha_apply_subscription'a giden satır. */
export interface SubscriptionRow {
  id: string
  user_id: string | null
  customer_id: string
  plan: Plan
  period: Period
  status: 'active' | 'trialing' | 'past_due' | 'paused' | 'canceled'
  price_id: string | null
  amount_kurus: number | null
  currency: string | null
  current_period_end: string | null
  trial_end: string | null
  cancel_at: string | null
  discount_code: string | null
  event_at: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const STATUSES = ['active', 'trialing', 'past_due', 'paused', 'canceled'] as const

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {})
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

/**
 * Abonelik olayını satıra çevirir. Paket ve dönem fiyatın custom_data'sından (Paddle'a aktarırken yazılır),
 * yoksa bilinen fiyat kimliklerinden bulunur. Tanınmayan fiyat ya da durum için null döner.
 */
export function subscriptionFromEvent(e: PaddleEvent, knownPrices: Record<string, { plan: Plan; period: Period }> = {}): SubscriptionRow | null {
  if (!e.event_type.startsWith('subscription.')) return null
  const d = e.data
  const id = str(d.id)
  const status = str(d.status)
  const customer = str(d.customer_id)
  if (!id || !/^sub_[a-z0-9]+$/.test(id) || !customer || !STATUSES.includes(status as (typeof STATUSES)[number])) return null
  const items = Array.isArray(d.items) ? d.items.map(obj) : []
  const item = items[0] ?? {}
  const price = obj(item.price)
  const priceId = str(price.id)
  const pcd = obj(price.custom_data)
  let plan = pcd.plan as Plan | undefined
  let period = pcd.period as Period | undefined
  if ((plan !== 'plus' && plan !== 'plusplus') || (period !== 'monthly' && period !== 'yearly')) {
    const k = priceId ? knownPrices[priceId] : undefined
    if (!k) return null
    plan = k.plan
    period = k.period
  }
  const userId = str(obj(d.custom_data).user_id)
  const amount = Number(obj(price.unit_price).amount)
  const scheduled = obj(d.scheduled_change)
  return {
    id,
    user_id: userId && UUID.test(userId) ? userId : null,
    customer_id: customer,
    plan,
    period,
    status: status as SubscriptionRow['status'],
    price_id: priceId,
    amount_kurus: Number.isFinite(amount) ? Math.round(amount) : null,
    currency: str(d.currency_code) ?? str(obj(price.unit_price).currency_code),
    current_period_end: str(obj(d.current_billing_period).ends_at),
    trial_end: str(obj(item.trial_dates).ends_at),
    cancel_at: scheduled.action === 'cancel' ? str(scheduled.effective_at) : null,
    discount_code: str(obj(d.discount).id),
    event_at: e.occurred_at,
  }
}

export interface WebPrice {
  plan: Plan
  period: Period
  amount_kurus: number
  trial_days: number
  active: boolean
}

/**
 * Paddle fiyat gövdesi. Fiyat KDV dahildir (tax_mode internal); paket bilgisi custom_data'da taşınır.
 * productId verilirse oluşturma gövdesidir (Paddle oluştururken status kabul etmez), verilmezse güncelleme.
 */
export function priceBody(p: WebPrice, productId: string | null) {
  return {
    ...(productId ? { product_id: productId } : { status: p.active ? 'active' : 'archived' }),
    description: `${PLAN_NAMES[p.plan]} · ${PERIOD_NAMES[p.period]}`,
    name: PERIOD_NAMES[p.period],
    unit_price: { amount: String(p.amount_kurus), currency_code: 'TRY' },
    billing_cycle: { interval: p.period === 'monthly' ? 'month' : 'year', frequency: 1 },
    trial_period: p.trial_days > 0 ? { interval: 'day', frequency: p.trial_days } : null,
    tax_mode: 'internal',
    quantity: { minimum: 1, maximum: 1 },
    custom_data: { plan: p.plan, period: p.period },
  }
}

export interface Coupon {
  code: string
  percent_off: number
  plans: Plan[]
  periods: Period[]
  recur_intervals: number | null
  usage_limit: number | null
  expires_at: string | null
  active: boolean
  note: string | null
}

/** Paddle indirim gövdesi; yalnızca kodun geçerli olduğu fiyatlarla sınırlanır. Oluştururken status gönderilmez. */
export function discountBody(c: Coupon, priceIds: Record<string, string>, create = false) {
  const restrict = c.plans.flatMap((pl) => c.periods.map((pe) => priceIds[`${pl}:${pe}`])).filter(Boolean)
  const expired = c.expires_at !== null && new Date(c.expires_at).getTime() <= Date.now()
  return {
    description: c.note?.trim() || `Kampanya kodu ${c.code}`,
    type: 'percentage',
    amount: String(c.percent_off),
    enabled_for_checkout: true,
    code: c.code,
    recur: c.recur_intervals !== 1,
    maximum_recurring_intervals: c.recur_intervals === null || c.recur_intervals === 1 ? null : c.recur_intervals,
    usage_limit: c.usage_limit,
    restrict_to: restrict.length ? restrict : null,
    // Geçmiş tarih Paddle'da reddedilir; süresi dolan kod zaten arşivlenir
    expires_at: expired ? null : c.expires_at,
    ...(create ? {} : { status: c.active && !expired ? 'active' : 'archived' }),
  }
}
