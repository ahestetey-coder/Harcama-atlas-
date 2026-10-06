import type { SupabaseClient } from '@supabase/supabase-js'

/** Günlük ekonomi özeti maddesi: kaynak ve tarih sunucuda gerçek maddeden eklenir. */
export interface BroadcastItem {
  kind: 'haber' | 'yorum' | 'tahmin'
  text: string
  source: string
  url: string
  publishedAt: string
}

export interface Broadcast {
  id: string
  day: string
  title: string
  summary: string
  items: BroadcastItem[]
  created_at: string
}

export interface NewsSource {
  id: string
  kind: 'x' | 'rss'
  value: string
  label: string | null
  active: boolean
}

/** Son günlük özetler. Tablo kurulmamışsa boş liste. */
export async function listBroadcasts(client: SupabaseClient, limit = 7): Promise<Broadcast[]> {
  const { data, error } = await client.from('ha_coach_broadcasts').select('id, day, title, summary, items, created_at').order('day', { ascending: false }).limit(limit)
  if (error) return []
  return (data ?? []) as Broadcast[]
}

export async function listNewsSources(client: SupabaseClient): Promise<NewsSource[]> {
  const { data, error } = await client.from('ha_news_sources').select('id, kind, value, label, active').order('created_at')
  if (error) throw error
  return (data ?? []) as NewsSource[]
}

export async function addNewsSource(client: SupabaseClient, kind: 'x' | 'rss', value: string, label: string): Promise<void> {
  const { error } = await client.rpc('ha_admin_add_news_source', { p_kind: kind, p_value: value, p_label: label || null })
  if (error) throw error
}

export async function setNewsSourceActive(client: SupabaseClient, id: string, active: boolean): Promise<void> {
  const { error } = await client.rpc('ha_admin_set_news_source', { p_id: id, p_active: active })
  if (error) throw error
}

export async function deleteNewsSource(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.rpc('ha_admin_delete_news_source', { p_id: id })
  if (error) throw error
}

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export class CoachChatError extends Error {}

/** Koç sohbeti: özet bilgiler ve son mesajlar sunucu fonksiyonuna gider; hiçbir şey saklanmaz. */
export async function coachChat(client: SupabaseClient, summary: unknown, messages: ChatTurn[]): Promise<string> {
  const { data, error } = await client.functions.invoke('coach-chat', { body: { summary, messages } })
  if (error) {
    let msg = 'Koç şu an yanıt veremiyor. Biraz sonra tekrar deneyin.'
    try {
      const body = await (error as { context?: Response }).context?.json()
      if (body?.error) msg = body.error
    } catch {
      /* yok say */
    }
    throw new CoachChatError(msg)
  }
  if (!data?.reply) throw new CoachChatError('Koç boş yanıt verdi.')
  return data.reply as string
}
