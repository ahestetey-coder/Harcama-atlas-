import type { SupabaseClient } from '@supabase/supabase-js'

/** Yönetici panelinde görünen hesap bilgisi. Şifre hiçbir zaman gelmez (Supabase'de hash olarak durur). */
export interface AdminUser {
  id: string
  email: string | null
  full_name: string | null
  provider: string
  created_at: string
  last_sign_in_at: string | null
  email_confirmed_at: string | null
  banned_until: string | null
  is_admin: boolean
  group_count: number
  shared_tx_count: number
  /** Yöneticinin tanımladığı paket (panelde eklenir). */
  plan?: UserPlan
}

/** Yönetici paneli veritabanına kurulmamışsa (fonksiyon yok) bu hata döner. */
export class AdminNotInstalledError extends Error {}

function isMissingFunction(error: { code?: string; message?: string }): boolean {
  return error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(error.message ?? '')
}

async function call<T>(client: SupabaseClient, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await client.rpc(fn, args)
  if (error) {
    if (isMissingFunction(error)) throw new AdminNotInstalledError('Yönetici paneli veritabanına henüz eklenmemiş.')
    throw error
  }
  return data as T
}

/** Oturumdaki hesap yönetici mi? Kurulum yoksa veya hata olursa false. */
export async function isAdmin(client: SupabaseClient): Promise<boolean> {
  try {
    return (await call<unknown>(client, 'ha_is_admin')) === true
  } catch {
    return false
  }
}

export async function listUsers(client: SupabaseClient): Promise<AdminUser[]> {
  const users = (await call<AdminUser[] | null>(client, 'ha_admin_list_users')) ?? []
  const plans = new Map((await listPlans(client)).map((p) => [p.user_id, p]))
  return users.map((u) => (plans.has(u.id) ? { ...u, plan: plans.get(u.id) } : u))
}

export async function setBanned(client: SupabaseClient, userId: string, banned: boolean): Promise<void> {
  await call(client, 'ha_admin_set_banned', { p_user: userId, p_banned: banned })
}

export async function confirmEmail(client: SupabaseClient, userId: string): Promise<void> {
  await call(client, 'ha_admin_confirm_email', { p_user: userId })
}

export async function deleteUser(client: SupabaseClient, userId: string): Promise<void> {
  await call(client, 'ha_admin_delete_user', { p_user: userId })
}

/** Kullanıcıya şifre yenileme e-postası gönderir (Supabase'in herkese açık uç noktası). */
export async function sendPasswordReset(client: SupabaseClient, email: string, redirectTo: string): Promise<void> {
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo })
  if (error) throw error
}

export function isBanned(u: Pick<AdminUser, 'banned_until'>, now = Date.now()): boolean {
  return !!u.banned_until && new Date(u.banned_until).getTime() > now
}

export type AccountPlan = 'free' | 'plus' | 'plusplus'

export interface UserPlan {
  user_id: string
  plan: Exclude<AccountPlan, 'free'>
  expires_at: string | null
}

/** Oturumdaki hesabın paketi. Kurulum yoksa veya hata olursa Ücretsiz. */
export async function getMyPlan(client: SupabaseClient): Promise<AccountPlan> {
  const { data, error } = await client.rpc('ha_my_plan')
  return !error && (data === 'plus' || data === 'plusplus') ? data : 'free'
}

/** Yönetici: paket tanımlanmış hesaplar (süresi bitenler dahil). */
export async function listPlans(client: SupabaseClient): Promise<UserPlan[]> {
  const { data, error } = await client.from('ha_user_plans').select('user_id, plan, expires_at')
  if (error) return []
  return (data ?? []) as UserPlan[]
}

export async function setPlan(client: SupabaseClient, userId: string, plan: AccountPlan, expiresAt: string | null): Promise<void> {
  await call(client, 'ha_admin_set_plan', { p_user: userId, p_plan: plan, p_expires: expiresAt })
}
