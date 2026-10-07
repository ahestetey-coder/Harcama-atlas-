// Varlıklarım için TCMB gösterge kurları. Tarayıcı TCMB'ye doğrudan erişemediği (CORS) için kurlar
// burada okunur. İstek hiçbir kullanıcı verisi taşımaz; yanıt yalnızca herkese açık kur listesidir.
import { cors, json } from '../_shared/openai.ts'
import { parseTcmbRates } from '../_shared/research.ts'

const TCMB_URL = 'https://www.tcmb.gov.tr/kurlar/today.xml'
const TTL_MS = 30 * 60 * 1000

let cache: { at: number; body: { date: string; source: 'tcmb'; rates: { code: string; name: string; valueTl: number }[] } } | null = null

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (cache && Date.now() - cache.at < TTL_MS) return json(cache.body)
  try {
    const res = await fetch(TCMB_URL, { headers: { Accept: 'application/xml' }, signal: AbortSignal.timeout(10000) })
    if (!res.ok) throw new Error(`TCMB ${res.status}`)
    const parsed = parseTcmbRates(await res.text())
    if (!parsed) throw new Error('TCMB yanıtı okunamadı')
    const body = { date: parsed.date, source: 'tcmb' as const, rates: parsed.rates.map((r) => ({ code: r.code, name: r.name, valueTl: r.value })) }
    cache = { at: Date.now(), body }
    return json(body)
  } catch (e) {
    console.error('market-rates', e instanceof Error ? e.message : 'hata')
    if (cache) return json(cache.body)
    return json({ error: 'TCMB kurları şu an alınamadı. Biraz sonra tekrar deneyin.' }, 502)
  }
})
