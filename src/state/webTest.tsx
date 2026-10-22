import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { claimLead, clearPendingLeadCode, localLead, pendingLeadCode, rememberLeadCode, type ClaimedLead } from '../cloud/freedomLead'
import type { SupabaseBackend } from '../cloud/supabaseBackend'
import type { AtlasRepository } from '../data/repository'
import { LEAD_CODE_RE } from '../domain/quickTest'
import { useAuth } from './auth'
import { routeProfile } from '../domain/routeSetup'
import { useRepo, useSettings } from './data'
import { useUi } from './ui'
import { tt } from '../lib/i18n'

/** Adresteki ?kod=ATL-… (ör. #/yolculuk?kod=…) girişten sonra kullanılmak üzere saklanır. */
export function captureLeadCodeFromUrl(hash = window.location.hash) {
  const q = hash.split('?')[1]
  if (!q) return
  const code = new URLSearchParams(q).get('kod')?.trim().toUpperCase()
  if (code && LEAD_CODE_RE.test(code)) rememberLeadCode(code)
}

/** Bulunan web testi kaydını ayarlara yazar (cihazda; yedeğe dahil). */
export async function saveWebTest(repo: AtlasRepository, lead: ClaimedLead) {
  await repo.saveSettings({ webTest: { code: lead.code, answers: lead.answers, name: lead.name, createdAt: lead.createdAt, linkedAt: new Date().toISOString() } })
}

export async function linkWebTest(repo: AtlasRepository, backend: SupabaseBackend, code?: string | null): Promise<ClaimedLead | null> {
  const lead = await claimLead(backend, code)
  if (lead) await saveWebTest(repo, lead)
  return lead
}

/**
 * Giriş yapılınca web testi kaydını bir kez arar: bağlantıdaki kodla ya da doğrulanmış e-postayla.
 * Bulunursa ve rota henüz netleştirilmediyse Yolculuk açılır; orada web sonucu tekrar gösterilir.
 */
export function WebTestLinker() {
  const auth = useAuth()
  const repo = useRepo()
  const settings = useSettings()
  const { toast } = useUi()
  const navigate = useNavigate()
  const tried = useRef(false)
  useEffect(() => {
    if (tried.current || settings === undefined) return
    if (auth.enabled && (!auth.backend || !auth.user)) return
    const pending = pendingLeadCode()
    const local = localLead()
    if (settings?.webTest && (!pending || pending === settings.webTest.code)) {
      if (pending || local) clearPendingLeadCode()
      return
    }
    // Sunucuda e-posta eşleşmesi yalnızca bir kez, oturum başında denenir
    tried.current = true
    const run = async () => {
      let lead: ClaimedLead | null = null
      if (auth.backend) lead = await claimLead(auth.backend, pending)
      if (!lead && local && (!pending || local.code === pending)) lead = local
      clearPendingLeadCode()
      if (!lead) return
      await saveWebTest(repo, lead)
      toast(tt('Web\'deki finansal haritan hesabına bağlandı.'))
      if (!routeProfile(settings?.journey)) navigate('/yolculuk')
    }
    run().catch(() => {
      // Ağ hatası: kod saklı kalır, bir sonraki açılışta yeniden denenir
    })
  }, [auth.enabled, auth.backend, auth.user, settings, repo, toast, navigate])
  return null
}
