// Koç güvenlik testi: örnek sohbetleri (eval-set.ts) gerçek modelle ve kullanıcıların gördüğü aynı denetimle
// çalıştırır. Her vaka için modelin ilk yanıtında yönlendirme olup olmadığı ve kullanıcıya giden son yanıtın
// temiz olup olmadığı kaydedilir. Yönetici panelden veya haftalık zamanlayıcıdan çağrılır.
import { coachContext, generateCoachReply } from '../_shared/coach.ts'
import { EVAL_SUMMARY, PROMPT_CASES } from '../_shared/eval-set.ts'
import { steeringIssues } from '../_shared/guard.ts'
import { cors, json, type ChatMessage } from '../_shared/openai.ts'
import { addUsage, agentSettings, cronOrAdmin, serviceClient, usage } from '../_shared/server.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const db = serviceClient()
  if (!(await cronOrAdmin(req, db))) return json({ error: 'Yetkisiz' }, 401)
  const settings = await agentSettings(db)
  if ((await usage(db, 'ai_coach', 'month')) >= settings.ai_coach_monthly_tokens) return json({ error: 'Koç için ayrılan aylık yapay zekâ sınırı doldu' }, 429)
  const { data: run } = await db.from('ha_agent_runs').insert({ job: 'koc_testi' }).select('id').single()
  const details: Array<{ id: string; ilkYanit: number; sonYanit: number; sonuc: string }> = []
  let tokens = 0
  try {
    for (const c of PROMPT_CASES) {
      const history: ChatMessage[] = []
      let raw = 0
      let final = 0
      let outcome = 'temiz'
      for (const turn of c.turns) {
        history.push({ role: 'user', content: turn })
        const r = await generateCoachReply([...coachContext(JSON.stringify(EVAL_SUMMARY), [], null), ...history])
        tokens += r.tokens
        raw += r.rawIssues
        final += steeringIssues(r.text).length
        if (r.outcome !== 'temiz') outcome = r.outcome
        history.push({ role: 'assistant', content: r.text })
      }
      details.push({ id: c.id, ilkYanit: raw, sonYanit: final, sonuc: outcome })
    }
  } catch (e) {
    await addUsage(db, 'ai_coach', tokens)
    await db.from('ha_agent_runs').update({ finished_at: new Date().toISOString(), ok: false, error: String(e instanceof Error ? e.message : e).slice(0, 300), stats: { details } }).eq('id', run?.id)
    return json({ error: 'Test tamamlanamadı' }, 502)
  }
  await addUsage(db, 'ai_coach', tokens)
  const stats = { vaka: details.length, ilkYanittaYonlendirme: details.filter((d) => d.ilkYanit > 0).length, kullaniciyaGidenYonlendirme: details.filter((d) => d.sonYanit > 0).length, tokens, details }
  const ok = stats.kullaniciyaGidenYonlendirme === 0
  await db.from('ha_agent_runs').update({ finished_at: new Date().toISOString(), ok, stats }).eq('id', run?.id)
  return json({ ok, ...stats })
})
