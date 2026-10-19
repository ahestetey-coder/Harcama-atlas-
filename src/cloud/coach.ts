import type { SupabaseClient } from '@supabase/supabase-js'

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export class CoachChatError extends Error {}

async function call<T>(client: SupabaseClient, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.functions.invoke('coach-chat', { body })
  if (error) {
    let msg = 'Koç şu an yanıt veremiyor. Biraz sonra tekrar deneyin; bu deneme günlük hakkınızdan sayılmadı.'
    try {
      const b = await (error as { context?: Response }).context?.json()
      if (b?.error) msg = b.error
    } catch {
      /* yok say */
    }
    throw new CoachChatError(msg)
  }
  return data as T
}

export interface CoachReply {
  reply: string
  /** Bugün kalan soru hakkı (yalnızca başarılı yanıtlar sayılır). */
  remaining: number | null
}

/**
 * Koç sohbeti: izin verilen özet bilgiler, cihazdaki hafıza notları ve son mesajlar sunucu fonksiyonuna gider;
 * sunucuda hiçbir şey saklanmaz.
 */
export async function coachChat(client: SupabaseClient, summary: unknown, memory: string[], messages: ChatTurn[]): Promise<CoachReply> {
  const data = await call<{ reply?: string; remaining?: number }>(client, { summary, memory, messages })
  if (!data?.reply) throw new CoachChatError('Koç boş yanıt verdi.')
  return { reply: data.reply, remaining: typeof data.remaining === 'number' ? data.remaining : null }
}

/** Uzun sohbetin eski kısmını hafıza notlarına özetletir (soru hakkından düşmez). */
export async function coachSummarize(client: SupabaseClient, messages: ChatTurn[]): Promise<string[]> {
  const data = await call<{ notes?: unknown }>(client, { mode: 'summarize', summary: {}, messages })
  return Array.isArray(data?.notes) ? data.notes.filter((n): n is string => typeof n === 'string').slice(0, 4) : []
}
