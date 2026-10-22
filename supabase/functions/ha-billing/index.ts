// Web aboneliği işlemleri (Paddle):
//  - sync (yönetici): ürünleri, fiyatları, kampanya kodlarını ve bildirim adresini Paddle'a aktarır.
//    Yönetici panelinde fiyat ya da kod kaydedilince kendiliğinden çağrılır.
//  - portal (kişi): Paddle müşteri sayfasının adresi (iptal, kart değiştirme, faturalar).
//  - change (kişi): aboneliği başka pakete ya da döneme geçirir; fark hemen orantılı hesaplanır.
// Paddle API anahtarı yalnızca Edge Function Secrets'ta durur (PADDLE_API_KEY).
import { cors, json } from '../_shared/openai.ts'
import { discountBody, PADDLE_API, PADDLE_EVENTS, PLAN_NAMES, priceBody, type Coupon, type PaddleEnv, type Period, type Plan, type WebPrice } from '../_shared/paddle.ts'
import { serviceClient, userId } from '../_shared/server.ts'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

class PaddleError extends Error {}

function paddle(env: PaddleEnv) {
  const key = Deno.env.get('PADDLE_API_KEY')
  if (!key) throw new PaddleError('PADDLE_API_KEY tanımlı değil (Supabase > Edge Functions > Secrets)')
  return async (method: string, path: string, body?: unknown) => {
    const r = await fetch(`${PADDLE_API[env]}${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Paddle-Version': '1' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const j = (await r.json().catch(() => ({}))) as { data?: Record<string, unknown>; error?: { detail?: string; code?: string } }
    if (!r.ok) throw new PaddleError(`Paddle ${method} ${path.split('/')[1]}: ${j.error?.detail ?? j.error?.code ?? r.status}`)
    return j.data ?? {}
  }
}

async function settings(db: SupabaseClient) {
  const { data } = await db.from('ha_billing_settings').select('*').eq('id', 1).single()
  return data as { environment: PaddleEnv; product_ids: Record<string, string> }
}

async function sync(db: SupabaseClient): Promise<{ prices: number; coupons: number }> {
  const s = await settings(db)
  const api = paddle(s.environment)
  let ids = s.product_ids ?? {}

  // Ortam değiştiyse (deneme → canlı) eski kimlikler o ortamda yoktur; hepsi yeniden oluşturulur
  if (ids.env !== s.environment) {
    ids = { env: s.environment }
    await db.from('ha_web_prices').update({ paddle_price_id: null }).neq('plan', '')
    await db.from('ha_coupons').update({ paddle_discount_id: null }).neq('code', '')
    await db.from('ha_billing_secrets').upsert({ id: 1, webhook_secret: null, notification_id: null, updated_at: new Date().toISOString() })
  }

  for (const plan of ['plus', 'plusplus'] as Plan[]) {
    if (ids[plan]) continue
    const p = await api('POST', '/products', { name: PLAN_NAMES[plan], tax_category: 'standard', custom_data: { plan } })
    ids[plan] = p.id as string
  }
  await db.from('ha_billing_settings').update({ product_ids: ids }).eq('id', 1)

  const { data: prices } = await db.from('ha_web_prices').select('*')
  const priceIds: Record<string, string> = {}
  for (const p of (prices ?? []) as (WebPrice & { paddle_price_id: string | null })[]) {
    let id = p.paddle_price_id
    if (id) await api('PATCH', `/prices/${id}`, priceBody(p, null))
    else {
      id = (await api('POST', '/prices', priceBody(p, ids[p.plan]))).id as string
      if (!p.active) await api('PATCH', `/prices/${id}`, { status: 'archived' })
      await db.from('ha_web_prices').update({ paddle_price_id: id }).eq('plan', p.plan).eq('period', p.period)
    }
    priceIds[`${p.plan}:${p.period}`] = id
  }

  const { data: coupons } = await db.from('ha_coupons').select('*')
  for (const c of (coupons ?? []) as (Coupon & { paddle_discount_id: string | null })[]) {
    if (c.paddle_discount_id) await api('PATCH', `/discounts/${c.paddle_discount_id}`, discountBody(c, priceIds))
    else {
      const d = await api('POST', '/discounts', discountBody(c, priceIds, true))
      // Pasif ya da süresi dolmuş kod oluşturulduktan sonra arşivlenir
      if (!c.active || (c.expires_at && new Date(c.expires_at).getTime() <= Date.now())) await api('PATCH', `/discounts/${d.id}`, { status: 'archived' })
      await db.from('ha_coupons').update({ paddle_discount_id: d.id }).eq('code', c.code)
    }
  }

  // Bildirim adresi bir kez kurulur; imza anahtarı yalnızca sunucunun okuduğu tabloda saklanır
  const { data: sec } = await db.from('ha_billing_secrets').select('notification_id').eq('id', 1).maybeSingle()
  if (!sec?.notification_id) {
    const n = await api('POST', '/notification-settings', {
      description: 'Harcama Atlası abonelik bildirimleri',
      destination: `${Deno.env.get('SUPABASE_URL')}/functions/v1/ha-paddle-webhook`,
      subscribed_events: PADDLE_EVENTS,
      type: 'url',
      include_sensitive_fields: false,
      api_version: 1,
      // Deneme ortamında Paddle'ın simülasyon bildirimleri de gelsin
      traffic_source: 'all',
    })
    await db.from('ha_billing_secrets').upsert({ id: 1, notification_id: n.id, webhook_secret: n.endpoint_secret_key, updated_at: new Date().toISOString() })
  }

  await db.from('ha_billing_settings').update({ synced_at: new Date().toISOString(), sync_error: null }).eq('id', 1)
  return { prices: Object.keys(priceIds).length, coupons: coupons?.length ?? 0 }
}

async function mySubscription(db: SupabaseClient, uid: string) {
  const { data } = await db
    .from('ha_subscriptions')
    .select('id, customer_id, status, plan, period')
    .eq('user_id', uid)
    .in('status', ['active', 'trialing', 'past_due', 'paused'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data as { id: string; customer_id: string; status: string; plan: Plan; period: Period } | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Yalnızca POST' }, 405)
  const db = serviceClient()
  const uid = await userId(req)
  if (!uid) return json({ error: 'Giriş yapılmamış' }, 401)
  const body = (await req.json().catch(() => ({}))) as { action?: string; plan?: Plan; period?: Period }

  try {
    if (body.action === 'sync') {
      const { data: admin } = await db.from('ha_admins').select('user_id').eq('user_id', uid).maybeSingle()
      if (!admin) return json({ error: 'Bu işlem için yönetici yetkisi gerekir' }, 403)
      try {
        return json({ ok: true, ...(await sync(db)) })
      } catch (e) {
        const msg = String((e as Error).message).slice(0, 300)
        await db.from('ha_billing_settings').update({ sync_error: msg }).eq('id', 1)
        return json({ error: msg }, e instanceof PaddleError ? 502 : 500)
      }
    }

    const s = await settings(db)
    const sub = await mySubscription(db, uid)
    if (!sub) return json({ error: 'Etkin web aboneliğin yok' }, 404)
    const api = paddle(s.environment)

    if (body.action === 'portal') {
      const p = await api('POST', `/customers/${sub.customer_id}/portal-sessions`, { subscription_ids: [sub.id] })
      const urls = p.urls as { general?: { overview?: string }; subscriptions?: { cancel_subscription?: string; update_subscription_payment_method?: string }[] }
      return json({ url: urls.general?.overview, cancelUrl: urls.subscriptions?.[0]?.cancel_subscription, paymentUrl: urls.subscriptions?.[0]?.update_subscription_payment_method })
    }

    if (body.action === 'change' || body.action === 'preview') {
      const plan = body.plan
      const period = body.period
      if ((plan !== 'plus' && plan !== 'plusplus') || (period !== 'monthly' && period !== 'yearly')) return json({ error: 'Geçersiz paket' }, 400)
      if (plan === sub.plan && period === sub.period) return json({ ok: true, unchanged: true })
      const { data: price } = await db.from('ha_web_prices').select('paddle_price_id, active').eq('plan', plan).eq('period', period).maybeSingle()
      if (!price?.paddle_price_id || !price.active) return json({ error: 'Bu paket şu an satışta değil' }, 409)
      // Yükseltmede yenileme tarihine kalan günlerin farkı hemen alınır, düşürmede kalan tutar sonraki ödemelere sayılır.
      // Denemedeyken ödeme yoktur: paket hemen değişir, deneme sürer, yeni fiyat deneme bitince alınır.
      const change = {
        items: [{ price_id: price.paddle_price_id, quantity: 1 }],
        proration_billing_mode: sub.status === 'trialing' ? 'do_not_bill' : 'prorated_immediately',
      }
      if (body.action === 'preview') {
        const p = await api('PATCH', `/subscriptions/${sub.id}/preview`, change)
        const r = (p.update_summary as { result?: { action?: string; amount?: string } } | null)?.result
        return json({ action: r?.action ?? 'none', amount_kurus: Number(r?.amount ?? 0), trialing: sub.status === 'trialing' })
      }
      await api('PATCH', `/subscriptions/${sub.id}`, change)
      return json({ ok: true })
    }

    return json({ error: 'Bilinmeyen işlem' }, 400)
  } catch (e) {
    return json({ error: String((e as Error).message).slice(0, 300) }, e instanceof PaddleError ? 502 : 500)
  }
})
