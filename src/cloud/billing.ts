import type { SupabaseClient } from '@supabase/supabase-js'
import { tt } from '../lib/i18n'

/** Web aboneliği (Paddle) yönetimi: fiyatlar, kampanya kodları, bağlantı ayarı ve abonelikler. */
export type WebPlan = 'plus' | 'plusplus'
export type WebPeriod = 'monthly' | 'yearly'

export interface BillingSettings {
  environment: 'sandbox' | 'production'
  client_token: string | null
  synced_at: string | null
  sync_error: string | null
}

export interface WebPrice {
  plan: WebPlan
  period: WebPeriod
  amount_kurus: number
  trial_days: number
  active: boolean
  paddle_price_id: string | null
}

export interface Coupon {
  code: string
  percent_off: number
  plans: WebPlan[]
  periods: WebPeriod[]
  recur_intervals: number | null
  usage_limit: number | null
  expires_at: string | null
  active: boolean
  note: string | null
  paddle_discount_id: string | null
}

export interface WebSubscription {
  id: string
  user_id: string | null
  plan: WebPlan
  period: WebPeriod
  status: 'active' | 'trialing' | 'past_due' | 'paused' | 'canceled'
  amount_kurus: number | null
  current_period_end: string | null
  trial_end: string | null
  cancel_at: string | null
  created_at: string
}

export interface WebhookEvent {
  event_id: string
  event_type: string
  received_at: string
  processed_at: string | null
  error: string | null
}

/** Web aboneliği tabloları veritabanına kurulmamışsa döner. */
export class BillingNotInstalledError extends Error {}

function check<T>(r: { data: T | null; error: { code?: string; message: string } | null }): T {
  if (r.error) {
    if (r.error.code === '42P01' || r.error.code === 'PGRST205' || /does not exist|could not find the table/i.test(r.error.message)) throw new BillingNotInstalledError('Web aboneliği veritabanına henüz kurulmamış (web-odeme.sql).')
    throw r.error
  }
  return r.data as T
}

export async function loadBillingAdmin(c: SupabaseClient) {
  const [s, p, k, sub, ev] = await Promise.all([
    c.from('ha_billing_settings').select('environment, client_token, synced_at, sync_error').eq('id', 1).maybeSingle(),
    c.from('ha_web_prices').select('plan, period, amount_kurus, trial_days, active, paddle_price_id'),
    c.from('ha_coupons').select('*').order('created_at', { ascending: false }),
    c.from('ha_subscriptions').select('id, user_id, plan, period, status, amount_kurus, current_period_end, trial_end, cancel_at, created_at').order('updated_at', { ascending: false }).limit(100),
    c.from('ha_webhook_events').select('event_id, event_type, received_at, processed_at, error').order('received_at', { ascending: false }).limit(30),
  ])
  const order = ['plus:monthly', 'plus:yearly', 'plusplus:monthly', 'plusplus:yearly']
  return {
    settings: check(s) as BillingSettings | null,
    prices: (check(p) as WebPrice[]).sort((a, b) => order.indexOf(`${a.plan}:${a.period}`) - order.indexOf(`${b.plan}:${b.period}`)),
    coupons: check(k) as Coupon[],
    subscriptions: check(sub) as WebSubscription[],
    events: check(ev) as WebhookEvent[],
  }
}

/** Fiyatları, kodları ve bildirim adresini Paddle'a aktarır. Hata iletisi Türkçe döner. */
export async function syncPaddle(c: SupabaseClient): Promise<void> {
  const { error } = await c.functions.invoke('ha-billing', { body: { action: 'sync' } })
  if (!error) return
  let msg = error.message
  try {
    msg = ((await (error as { context?: Response }).context?.json()) as { error?: string })?.error ?? msg
  } catch {
    /* gövde okunamadı */
  }
  throw new Error(msg)
}

export async function saveSettings(c: SupabaseClient, s: Pick<BillingSettings, 'environment' | 'client_token'>) {
  check(await c.from('ha_billing_settings').update({ environment: s.environment, client_token: s.client_token || null }).eq('id', 1))
}

export async function savePrice(c: SupabaseClient, p: Pick<WebPrice, 'plan' | 'period' | 'amount_kurus' | 'trial_days' | 'active'>) {
  check(await c.from('ha_web_prices').update({ amount_kurus: p.amount_kurus, trial_days: p.trial_days, active: p.active, updated_at: new Date().toISOString() }).eq('plan', p.plan).eq('period', p.period))
}

export async function addCoupon(c: SupabaseClient, k: Omit<Coupon, 'paddle_discount_id'>) {
  check(await c.from('ha_coupons').insert(k))
}

export async function setCouponActive(c: SupabaseClient, code: string, active: boolean) {
  check(await c.from('ha_coupons').update({ active, updated_at: new Date().toISOString() }).eq('code', code))
}

/** Paddle'a aktarılmış kod silinemez (Paddle'da yalnızca arşivlenir); yalnızca pasif yapılır. */
export async function deleteCoupon(c: SupabaseClient, code: string) {
  check(await c.from('ha_coupons').delete().eq('code', code).is('paddle_discount_id', null))
}

export const PLAN_LABEL: Record<WebPlan, string> = { plus: 'Plus', plusplus: 'Plus+' }
export const PERIOD_LABEL: Record<WebPeriod, string> = { monthly: tt('Aylık'), yearly: tt('Yıllık') }
