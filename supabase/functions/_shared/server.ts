// Sunucu fonksiyonlarının ortak yardımcıları: servis istemcisi, yönetici/zamanlayıcı doğrulaması, kullanım sayaçları.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
}

export async function userId(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization') ?? ''
  if (!auth) return null
  const r = await createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } }).auth.getUser()
  return r.data.user?.id ?? null
}

export function isCron(req: Request): boolean {
  const secret = Deno.env.get('CRON_SECRET')
  return !!secret && req.headers.get('x-cron-secret') === secret
}

/** Zamanlayıcıdan geliyorsa 'cron', yöneticiyse kullanıcı kimliği, değilse null. */
export async function cronOrAdmin(req: Request, db: SupabaseClient): Promise<'cron' | string | null> {
  if (isCron(req)) return 'cron'
  const uid = await userId(req)
  if (!uid) return null
  const { data } = await db.from('ha_admins').select('user_id').eq('user_id', uid).maybeSingle()
  return data ? uid : null
}

export interface AgentSettings {
  collect_daily_max: number
  market_daily_max: number
  ai_research_monthly_tokens: number
  ai_coach_monthly_tokens: number
  coach_daily_limit: number
}

const DEFAULTS: AgentSettings = { collect_daily_max: 2000, market_daily_max: 50, ai_research_monthly_tokens: 3000000, ai_coach_monthly_tokens: 5000000, coach_daily_limit: 30 }

export async function agentSettings(db: SupabaseClient): Promise<AgentSettings> {
  const { data } = await db.from('ha_agent_settings').select('*').eq('id', 1).maybeSingle()
  return { ...DEFAULTS, ...(data ?? {}) }
}

export type UsageKind = 'collect' | 'market' | 'ai_research' | 'ai_coach' | 'koc_yeniden' | 'koc_engel'

export async function addUsage(db: SupabaseClient, kind: UsageKind, amount: number): Promise<void> {
  if (amount > 0) await db.rpc('ha_agent_usage_add', { p_kind: kind, p_amount: amount })
}

/** Bugünkü (İstanbul) ya da bu ayki kullanım. */
export async function usage(db: SupabaseClient, kind: UsageKind, scope: 'day' | 'month'): Promise<number> {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date())
  const from = scope === 'day' ? today : `${today.slice(0, 7)}-01`
  const { data } = await db.from('ha_agent_usage').select('amount').eq('kind', kind).gte('day', from)
  return (data ?? []).reduce((n: number, r: { amount: number }) => n + Number(r.amount), 0)
}
