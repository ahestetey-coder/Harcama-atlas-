// Hesap sayfalarının (giriş, ödeme, abonelik) ortak istemci kodu. Uygulamayla aynı Supabase hesabı kullanılır.
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config'

export type Plan = 'plus' | 'plusplus'
export type Period = 'monthly' | 'yearly'

let client: SupabaseClient | null = null
export function supa(): SupabaseClient {
  client ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } })
  return client
}

export async function currentUser(): Promise<User | null> {
  const { data } = await supa().auth.getSession()
  return data.session?.user ?? null
}

/** Yalnızca sitenin kendi sayfalarına dönülür (açık yönlendirme yok). */
export function safeNext(v: string | null, fallback = '/hesap/abonelik'): string {
  if (!v) return fallback
  try {
    // "/\evil.com" gibi tarayıcının başka siteye çevirdiği yollar da elenir
    const u = new URL(v, location.origin)
    return u.origin === location.origin ? u.pathname + u.search + u.hash : fallback
  } catch {
    return fallback
  }
}

/** Oturum yoksa giriş sayfasına gönderir; dönünce aynı sayfaya gelinir. */
export async function requireUser(): Promise<User | null> {
  const u = await currentUser()
  if (!u) location.assign(`/giris?sonra=${encodeURIComponent(location.pathname + location.search)}`)
  return u
}

/** Site plan kimliği (plus_plus) ile veritabanı kimliği (plusplus) arasında çeviri. */
export const toPlan = (v: string | null): Plan => (v === 'plus_plus' || v === 'plusplus' ? 'plusplus' : 'plus')
export const toPeriod = (v: string | null): Period => (v === 'yearly' ? 'yearly' : 'monthly')
export const PLAN_LABEL: Record<Plan, string> = { plus: 'Plus', plusplus: 'Plus+' }
export const PERIOD_LABEL: Record<Period, string> = { monthly: 'Aylık', yearly: 'Yıllık' }

export interface WebPrice {
  plan: Plan
  period: Period
  amount_kurus: number
  trial_days: number
  active: boolean
  paddle_price_id: string | null
}

export interface BillingSettings {
  environment: 'sandbox' | 'production'
  client_token: string | null
}

export async function loadBilling(): Promise<{ settings: BillingSettings | null; prices: WebPrice[] }> {
  const [s, p] = await Promise.all([
    supa().from('ha_billing_settings').select('environment, client_token').eq('id', 1).maybeSingle(),
    supa().from('ha_web_prices').select('plan, period, amount_kurus, trial_days, active, paddle_price_id'),
  ])
  return { settings: (s.data as BillingSettings | null) ?? null, prices: (p.data as WebPrice[] | null) ?? [] }
}

export interface Subscription {
  id: string
  plan: Plan
  period: Period
  status: 'active' | 'trialing' | 'past_due' | 'paused' | 'canceled'
  amount_kurus: number | null
  current_period_end: string | null
  trial_end: string | null
  cancel_at: string | null
}

export async function mySubscription(): Promise<Subscription | null> {
  const { data } = await supa()
    .from('ha_subscriptions')
    .select('id, plan, period, status, amount_kurus, current_period_end, trial_end, cancel_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as Subscription | null) ?? null
}

export const isLive = (s: Subscription | null) => !!s && ['active', 'trialing', 'past_due', 'paused'].includes(s.status)

export async function billing<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supa().functions.invoke('ha-billing', { body })
  if (error) {
    let msg = error.message
    try {
      msg = ((await (error as { context?: Response }).context?.json()) as { error?: string })?.error ?? msg
    } catch {
      /* gövde okunamadı; genel ileti kalır */
    }
    throw new Error(msg)
  }
  return data as T
}

const tl = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const tl0 = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 })
export const formatTl = (kurus: number) => (kurus % 100 === 0 ? tl0 : tl).format(kurus / 100)
export const formatDate = (iso: string | null) => (iso ? new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso)) : '')

/** Kullanıcıya gösterilecek kısa hata iletisi. */
export function authMessage(e: unknown): string {
  const m = String((e as Error)?.message ?? e)
  if (/Invalid login credentials/i.test(m)) return 'E-posta ya da şifre hatalı.'
  if (/Email not confirmed/i.test(m)) return 'E-postanı henüz doğrulamadın. Gelen kutundaki bağlantıya dokun.'
  if (/User already registered/i.test(m)) return 'Bu e-postayla bir hesap var. Giriş yap.'
  if (/Password should be at least/i.test(m)) return 'Şifre en az 6 karakter olmalı.'
  if (/rate limit|too many/i.test(m)) return 'Çok fazla deneme yapıldı. Biraz sonra tekrar dene.'
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Bağlantı kurulamadı. İnternetini kontrol et.'
  return m
}
