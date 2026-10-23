import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isQuickAnswers, LEAD_CODE_RE, newLeadCode, type QuickAnswers } from '../domain/quickTest'
import { cloudErrorMessage } from './errors'
import { envCloudConfig } from './config'
import type { SupabaseBackend } from './supabaseBackend'
import { tt } from '../lib/i18n'

/**
 * Web Finansal Harita testinin kayıtları (supabase/schema.sql: ha_freedom_leads).
 * Girişsiz sayfa kendi oturumsuz istemcisini kullanır; uygulamadaki oturuma dokunmaz.
 */
let publicClient: SupabaseClient | null = null
function anonClient(): SupabaseClient | null {
  if (publicClient) return publicClient
  const c = envCloudConfig()
  if (!c) return null
  publicClient = createClient(c.url, c.anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'harcama-atlasi-web-testi' } })
  return publicClient
}

export const leadsAvailable = () => !!envCloudConfig()

export interface LeadInput {
  name: string
  email: string
  answers: QuickAnswers
  /** Sonucun kısa özeti (yönetici listesi ve e-posta için); hesap yine cevaplardan yapılır. */
  summary: { level: number; archetype: string; place: string; reachYear: number | null; goalTl: number }
  marketing: boolean
}

/** Kaydı gönderir, devam kodunu döner. Aynı kod (çok düşük olasılık) çakışırsa yeni kodla bir kez dener. */
export async function submitLead(input: LeadInput): Promise<string> {
  const client = anonClient()
  if (!client) throw new Error(tt('Kayıt sunucusu tanımlı değil.'))
  for (let attempt = 0; attempt < 2; attempt++) {
    const code = newLeadCode(() => {
      const b = new Uint32Array(1)
      crypto.getRandomValues(b)
      return b[0] / 2 ** 32
    })
    const { data, error } = await client.rpc('ha_submit_freedom_lead', {
      p_code: code,
      p_name: input.name.trim().slice(0, 60),
      p_email: input.email.trim(),
      p_answers: input.answers,
      p_summary: input.summary,
      p_marketing: input.marketing,
    })
    if (!error) return (data as string) ?? code
    if (attempt === 0 && /duplicate key|unique/i.test(error.message)) continue
    throw new Error(cloudErrorMessage(error))
  }
  throw new Error(tt('Kayıt tamamlanamadı, tekrar deneyin.'))
}

export interface ClaimedLead {
  code: string
  name: string
  answers: QuickAnswers
  createdAt: string
}

/** Girişli kişinin web testi: kodla ya da (kod yoksa) doğrulanmış e-postasıyla. Bulunamazsa null. */
export async function claimLead(backend: SupabaseBackend, code?: string | null): Promise<ClaimedLead | null> {
  const p = code && LEAD_CODE_RE.test(code.trim().toUpperCase()) ? code.trim().toUpperCase() : null
  const { data, error } = await backend.client.rpc('ha_claim_freedom_lead', { p_code: p })
  if (error) throw new Error(cloudErrorMessage(error))
  const row = (Array.isArray(data) ? data[0] : null) as { code: string; name: string; answers: unknown; created_at: string } | null
  if (!row || !isQuickAnswers(row.answers)) return null
  return { code: row.code, name: row.name, answers: row.answers, createdAt: row.created_at }
}

const PENDING_KEY = 'ha:web-test-code'
const LOCAL_KEY = 'ha:web-test-local'

/** Aynı cihazda devam edilirse kayıt sunucuya gitmeden de bağlanabilsin diye cevaplar cihazda tutulur. */
export function rememberLocalLead(lead: ClaimedLead) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(lead))
  } catch {
    /* gizli pencere */
  }
}
export function localLead(): ClaimedLead | null {
  try {
    const v = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? 'null') as Partial<ClaimedLead> | null
    return v && typeof v.code === 'string' && LEAD_CODE_RE.test(v.code) && isQuickAnswers(v.answers) && typeof v.createdAt === 'string' ? (v as ClaimedLead) : null
  } catch {
    return null
  }
}

/** Bağlantıdaki ?kod=ATL-… girişten sonra kullanılmak üzere saklanır. */
export function rememberLeadCode(code: string) {
  try {
    if (LEAD_CODE_RE.test(code)) localStorage.setItem(PENDING_KEY, code)
  } catch {
    /* gizli pencere */
  }
}
export function pendingLeadCode(): string | null {
  try {
    return localStorage.getItem(PENDING_KEY)
  } catch {
    return null
  }
}
export function clearPendingLeadCode() {
  try {
    localStorage.removeItem(PENDING_KEY)
    localStorage.removeItem(LOCAL_KEY)
  } catch {
    /* yok sayılır */
  }
}
