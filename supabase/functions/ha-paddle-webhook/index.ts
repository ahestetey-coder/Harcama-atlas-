// Paddle bildirimleri (webhook). İmza doğrulanır, her olay ha_webhook_events'e kimliğiyle bir kez yazılır,
// abonelik olayları ha_apply_subscription ile işlenir ve paket uygulamaya yansır.
// Bu fonksiyon JWT istemez (Paddle çağırır); güven yalnızca imzadan gelir.
import { PADDLE_API, parseEvent, subscriptionFromEvent, verifyPaddleSignature, type PaddleEnv, type Period, type Plan } from '../_shared/paddle.ts'
import { serviceClient } from '../_shared/server.ts'

const text = (body: string, status: number) => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })

type Db = ReturnType<typeof serviceClient>

// Ücretsiz deneme kişi başına bir kezdir: aynı hesap ya da Paddle müşterisi daha önce abone olduysa
async function hadSubscriptionBefore(db: Db, row: { id: string; user_id: string | null; customer_id: string | null }) {
  const or = [row.user_id && `user_id.eq.${row.user_id}`, row.customer_id && `customer_id.eq.${row.customer_id}`].filter(Boolean).join(',')
  if (!or) return false
  const { count } = await db.from('ha_subscriptions').select('id', { count: 'exact', head: true }).neq('id', row.id).or(or)
  return (count ?? 0) > 0
}

// Tekrarlanan denemeyi bitirir: Paddle aboneliği hemen başlatır ve ilk ödemeyi alır
async function endTrial(db: Db, id: string): Promise<string> {
  const key = Deno.env.get('PADDLE_API_KEY')
  if (!key) return 'tekrar deneme: PADDLE_API_KEY yok, deneme bitirilemedi'
  const { data: s } = await db.from('ha_billing_settings').select('environment').eq('id', 1).single()
  const r = await fetch(`${PADDLE_API[(s?.environment ?? 'sandbox') as PaddleEnv]}/subscriptions/${id}/activate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Paddle-Version': '1' },
  })
  return r.ok ? 'tekrar deneme: abonelik hemen başlatıldı' : `tekrar deneme: başlatılamadı (${r.status})`
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return text('yalnızca POST', 405)
  const raw = await req.text()
  if (raw.length > 180_000) return text('gövde çok büyük', 413)
  const db = serviceClient()

  const { data: sec } = await db.from('ha_billing_secrets').select('webhook_secret').eq('id', 1).maybeSingle()
  const secret = (sec?.webhook_secret as string | undefined) ?? Deno.env.get('PADDLE_WEBHOOK_SECRET') ?? ''
  if (!(await verifyPaddleSignature(req.headers.get('Paddle-Signature'), raw, secret))) return text('imza geçersiz', 401)

  const ev = parseEvent(raw)
  if (!ev) return text('olay okunamadı', 400)

  const ins = await db.from('ha_webhook_events').insert({ event_id: ev.event_id, event_type: ev.event_type, occurred_at: ev.occurred_at, payload: ev })
  if (ins.error) {
    if (ins.error.code !== '23505') return text('kaydedilemedi', 500)
    // Aynı olay tekrar geldi: işlenmişse yok sayılır, önceki deneme hata verdiyse yeniden işlenir
    const { data: prev } = await db.from('ha_webhook_events').select('processed_at').eq('event_id', ev.event_id).maybeSingle()
    if (prev?.processed_at) return text('zaten işlendi', 200)
  }

  try {
    let note: string | null = null
    if (ev.event_type.startsWith('subscription.')) {
      const { data: prices } = await db.from('ha_web_prices').select('plan, period, paddle_price_id')
      const known: Record<string, { plan: Plan; period: Period }> = {}
      for (const p of prices ?? []) if (p.paddle_price_id) known[p.paddle_price_id as string] = { plan: p.plan as Plan, period: p.period as Period }
      const row = subscriptionFromEvent(ev, known)
      if (!row) note = 'tanınmayan abonelik'
      else {
        const { data, error } = await db.rpc('ha_apply_subscription', { p: row })
        if (error) throw new Error(error.message)
        // Kullanıcısı bulunamayan abonelik yöneticinin göreceği şekilde işaretlenir
        if (data === 'kullanici-yok') note = 'kullanıcı bulunamadı'
        else if (row.status === 'trialing' && (await hadSubscriptionBefore(db, row))) note = await endTrial(db, row.id)
      }
    }
    await db.from('ha_webhook_events').update({ processed_at: new Date().toISOString(), error: note }).eq('event_id', ev.event_id)
    return text('tamam', 200)
  } catch (e) {
    await db.from('ha_webhook_events').update({ error: String((e as Error).message ?? e).slice(0, 500) }).eq('event_id', ev.event_id)
    // 5xx: Paddle bildirimi sonra yeniden gönderir
    return text('işlenemedi', 500)
  }
})
