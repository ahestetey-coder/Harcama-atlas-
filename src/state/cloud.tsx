import { useLiveQuery } from 'dexie-react-hooks'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { envCloudConfig, readCloudConfig, writeCloudConfig, type CloudConfig } from '../cloud/config'
import { cloudErrorMessage } from '../cloud/errors'
import type { SupabaseBackend } from '../cloud/supabaseBackend'
import { adoptCloudIdentity, setDefaultSelfName, syncAll, type SyncReport } from '../cloud/sync'
import { UserFacingError } from '../data/repository'
import { useAuth } from './auth'
import { useData } from './data'
import { useUi } from './ui'

export type CloudStatus = 'off' | 'loading' | 'signed-out' | 'idle' | 'syncing' | 'error'

interface CloudCtx {
  /** Supabase proje ayarı (yoksa bulut kapalı). */
  config: CloudConfig | null | undefined
  saveConfig: (c: CloudConfig | null) => Promise<void>
  backend: SupabaseBackend | null
  status: CloudStatus
  email: string | null
  lastSync: Date | null
  lastReport: SyncReport | null
  lastError: string | null
  signIn: (email: string, password: string) => Promise<void>
  /** Kayıt olur; e-posta doğrulaması gerekiyorsa false döner. */
  signUp: (email: string, password: string) => Promise<boolean>
  signOut: () => Promise<void>
  sync: () => Promise<SyncReport | null>
}

const Ctx = createContext<CloudCtx | null>(null)
const AUTO_SYNC_MS = 60_000

/**
 * Ortak grupların bulut eşitlemesi. Bulut ayarı yoksa hiçbir ağ isteği yapılmaz.
 * Demo modunda kapalıdır.
 */
export function CloudProvider({ children }: { children: ReactNode }) {
  const { repo, isDemo } = useData()
  const auth = useAuth()
  // Hesapla giriş açıksa (yayındaki site) istemci ve oturum AuthProvider'dan gelir.
  const managed = auth.enabled
  const [config, setConfig] = useState<CloudConfig | null | undefined>(undefined)
  const [email, setEmail] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [sessionChecked, setSessionChecked] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const [lastReport, setLastReport] = useState<SyncReport | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const inFlight = useRef<Promise<SyncReport | null> | null>(null)

  useEffect(() => {
    let alive = true
    if (isDemo) {
      setConfig(null)
      return
    }
    if (managed) {
      setConfig(envCloudConfig())
      return
    }
    readCloudConfig(repo).then((c) => alive && setConfig(c))
    return () => {
      alive = false
    }
  }, [repo, isDemo, managed])

  // Supabase istemcisi yalnızca bulut ayarı varsa (ayrı parça olarak) yüklenir.
  const [ownBackend, setBackend] = useState<SupabaseBackend | null>(null)
  const backend = managed ? (isDemo ? null : auth.backend) : ownBackend
  useEffect(() => {
    let alive = true
    if (!config || isDemo || managed) {
      setBackend(null)
      return
    }
    import('../cloud/supabaseBackend').then(({ SupabaseBackend }) => alive && setBackend(new SupabaseBackend(config.url, config.anonKey)))
    return () => {
      alive = false
    }
  }, [config, isDemo, managed])

  // Oturum (hesapla giriş açıksa AuthProvider'dan)
  const authUser = auth.user
  useEffect(() => {
    if (!managed) return
    setUserId(authUser?.id ?? null)
    setEmail(authUser?.email ?? null)
    setSessionChecked(auth.ready)
    if (authUser && !isDemo) void adoptCloudIdentity(repo, authUser.id).then(() => (authUser.name ? setDefaultSelfName(repo, authUser.name) : undefined))
  }, [managed, authUser, auth.ready, repo, isDemo])

  useEffect(() => {
    if (managed) return
    setSessionChecked(false)
    if (!backend) {
      setEmail(null)
      setUserId(null)
      return
    }
    const apply = (session: { user: { id: string; email?: string } } | null) => {
      backend.setUserId(session?.user.id ?? null)
      setUserId(session?.user.id ?? null)
      setEmail(session?.user.email ?? null)
      setSessionChecked(true)
      if (session) void adoptCloudIdentity(repo, session.user.id)
    }
    backend.client.auth
      .getSession()
      .then(({ data }) => apply(data.session))
      .catch(() => apply(null))
    const { data } = backend.client.auth.onAuthStateChange((_e, session) => apply(session))
    return () => data.subscription.unsubscribe()
  }, [backend, repo, managed])

  const sync = useCallback(async (): Promise<SyncReport | null> => {
    if (!backend || !backend.userId()) return null
    if (inFlight.current) return inFlight.current
    const run = (async () => {
      setSyncing(true)
      try {
        const r = await syncAll(repo, backend)
        setLastReport(r)
        setLastSync(new Date())
        setLastError(null)
        return r
      } catch (e) {
        setLastError(e instanceof UserFacingError ? e.message : cloudErrorMessage(e))
        return null
      } finally {
        setSyncing(false)
        inFlight.current = null
      }
    })()
    inFlight.current = run
    return run
  }, [backend, repo])

  // Otomatik eşitleme: açılışta, dakikada bir (sekme görünürken), bağlantı gelince ve
  // paylaşılan gruplardaki kendi kayıtlarınız değişince (kısa bir beklemeyle).
  const linkedSignature = useLiveQuery(async () => {
    const groups = (await repo.db.groups.toArray()).filter((g) => g.cloudId)
    if (!groups.length) return ''
    const ids = new Set(groups.map((g) => g.id))
    const own = await repo.db.transactions.filter((t) => !!t.groupId && ids.has(t.groupId) && t.source !== 'shared').toArray()
    return `${groups.map((g) => g.cloudId).join(',')}|${own.map((t) => t.id + t.updatedAt).join(',')}|${(await repo.db.transactions.count())}`
  }, [repo])

  // Oturum açıksa her zaman eşitlenir: bu cihazda henüz bağlı grup olmasa da hesabın üyesi olduğu
  // gruplar (yeni cihaz, ana ekran uygulaması) ilk eşitlemede bağlanır.
  const active = !!userId && linkedSignature !== undefined
  useEffect(() => {
    if (!active) return
    const t = window.setTimeout(() => void sync(), 1500)
    return () => window.clearTimeout(t)
  }, [active, linkedSignature, sync])

  useEffect(() => {
    if (!active) return
    const tick = () => document.visibilityState === 'visible' && void sync()
    const iv = window.setInterval(tick, AUTO_SYNC_MS)
    window.addEventListener('online', tick)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(iv)
      window.removeEventListener('online', tick)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [active, sync])

  const saveConfig = useCallback(
    async (c: CloudConfig | null) => {
      if (backend && !c) await backend.client.auth.signOut().catch(() => {})
      await writeCloudConfig(repo, c)
      setConfig(await readCloudConfig(repo))
    },
    [repo, backend],
  )

  const signIn = useCallback(
    async (mail: string, password: string) => {
      if (!backend) throw new UserFacingError('Önce bulut ayarını girin.')
      const { error } = await backend.client.auth.signInWithPassword({ email: mail.trim(), password })
      if (error) throw new UserFacingError(cloudErrorMessage(error))
    },
    [backend],
  )

  const signUp = useCallback(
    async (mail: string, password: string) => {
      if (!backend) throw new UserFacingError('Önce bulut ayarını girin.')
      const { data, error } = await backend.client.auth.signUp({
        email: mail.trim(),
        password,
        options: { emailRedirectTo: window.location.href.split('#')[0] + '#/uyeler' },
      })
      if (error) throw new UserFacingError(cloudErrorMessage(error))
      return !!data.session
    },
    [backend],
  )

  const authSignOut = auth.signOut
  const signOut = useCallback(async () => {
    if (managed) await authSignOut()
    else await backend?.client.auth.signOut()
  }, [backend, managed, authSignOut])

  const status: CloudStatus = !config || isDemo ? 'off' : !backend || !sessionChecked ? 'loading' : !userId ? 'signed-out' : syncing ? 'syncing' : lastError ? 'error' : 'idle'

  const value = useMemo(
    () => ({ config, saveConfig, backend, status, email, lastSync, lastReport, lastError, signIn, signUp, signOut, sync }),
    [config, saveConfig, backend, status, email, lastSync, lastReport, lastError, signIn, signUp, signOut, sync],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useCloud(): CloudCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('CloudProvider eksik')
  return c
}

/** Üyeler (id → üye) ve bu cihazın sahibinin kimliği. */
export function useMembers() {
  const { repo } = useData()
  const members = useLiveQuery(() => repo.db.members.toArray(), [repo])
  const settings = useLiveQuery(() => repo.getSettings(), [repo])
  return useMemo(() => ({ members: members ?? [], map: new Map((members ?? []).map((m) => [m.id, m])), selfId: settings?.selfMemberId ?? null }), [members, settings])
}

export interface PersonOption {
  id: string
  name: string
  color: string
}

/**
 * Kişi filtresi ve seçenekleri. Seçenekler yalnızca ortak bir grupta başka üye varsa vardır
 * (ilk seçenek cihaz sahibi, "Siz"). Filtre artık olmayan bir üyeye işaret ediyorsa "herkes"e döner.
 */
export function useMemberFilter(): { value: string; set: (m: string) => void; options: PersonOption[]; selfId: string | null } {
  const { memberFilter, setMemberFilter } = useUi()
  const { members, map, selfId } = useMembers()
  const options = useMemo(() => {
    const others = members.filter((m) => m.id !== selfId && m.groupIds.length > 0).sort((a, b) => a.name.localeCompare(b.name, 'tr'))
    if (!others.length || !selfId) return []
    const self = map.get(selfId)
    return [{ id: selfId, name: 'Siz', color: self?.color ?? '#94a3b8' }, ...others.map((m) => ({ id: m.id, name: m.name, color: m.color }))]
  }, [members, map, selfId])
  const valid = !memberFilter || options.some((o) => o.id === memberFilter)
  useEffect(() => {
    if (!valid && options.length) setMemberFilter('')
  }, [valid, options.length, setMemberFilter])
  return { value: valid ? memberFilter : '', set: setMemberFilter, options, selfId }
}
