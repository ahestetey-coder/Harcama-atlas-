// OpenAI Chat Completions çağrısı. Anahtar yalnızca sunucuda (Supabase sırları) durur.
// Model OPENAI_MODEL ile değiştirilebilir.

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatResult {
  text: string
  /** Toplam token (istem + yanıt); maliyet sınırı için. */
  tokens: number
}

export async function openaiChat(messages: ChatMessage[], opts: { json?: boolean; maxTokens?: number } = {}): Promise<string> {
  return (await openaiChatUsage(messages, opts)).text
}

export async function openaiChatUsage(messages: ChatMessage[], opts: { json?: boolean; maxTokens?: number; temperature?: number } = {}): Promise<ChatResult> {
  const key = Deno.env.get('OPENAI_API_KEY')
  if (!key) throw new Error('OPENAI_API_KEY tanımlı değil')
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini',
      messages,
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.maxTokens ?? 700,
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
    }),
  })
  if (!res.ok) throw new Error(`OpenAI hatası ${res.status}`)
  const data = await res.json()
  const text = data?.choices?.[0]?.message?.content
  if (typeof text !== 'string') throw new Error('OpenAI boş yanıt verdi')
  return { text, tokens: Number(data?.usage?.total_tokens) || 0 }
}

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

/** İstanbul saatine göre bugünün tarihi (YYYY-MM-DD). */
export function istanbulDay(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(d)
}
