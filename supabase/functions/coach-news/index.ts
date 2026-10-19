// Eski günlük özet fonksiyonu. Yerini editör onaylı ortak araştırma raporları (research-collect ve
// research-report) aldı; eski zamanlayıcı çağırırsa hiçbir şey yazmadan döner.
import { cors, json } from '../_shared/openai.ts'

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  return json({ error: 'Bu fonksiyon kullanımdan kaldırıldı; research-report kullanılıyor' }, 410)
})
