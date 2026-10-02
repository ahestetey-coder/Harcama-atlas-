import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { envCloudConfig } from '../cloud/config'
import { cloudErrorMessage } from '../cloud/errors'
import type { SupabaseBackend } from '../cloud/supabaseBackend'
import { UserFacingError } from '../data/repository'

export interface AuthUser {
  id: string
  email: string | null
  name: string | null
}

interface AuthCtx {
  /** Uygulama hazır bir hesap sunucusuyla derlendiyse true; giriş zorunludur. */
  enabled: boolean
  /** Oturum durumu öğrenildi mi? */
  ready: boolean
  backend: SupabaseBackend | null
  user: AuthUser | null
  /** Şifre sıfırlama bağlantısıyla gelindi; yeni şifre istenir. */
  recovery: boolean
  googleEnabled: boolean
  signIn: (email: string, password: string) => Promise<void>
  /** Kayıt olur; e-posta doğrulaması gerekiyorsa false döner. */
  signUp: (name: string, email: string, password: string) => Promise<boolean>
  signInWithGoogle: () => Promise<void>
  sendPasswordReset: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)
const AFTER_LOGIN_KEY = 'ha:after-login'

function restoreAfterLogin() {
  try {
    const hash = sessionStorage.getItem(AFTER_LOGIN_KEY)
    if (!hash) return
    sessionStorage.removeItem(AFTER_LOGIN_KEY)
    window.location.hash = hash
  } catch {
    /* yok sayılır */
  }
}

/** Giriş/şifre sıfırlama dönüşünde gidilecek adres (hash yönlendirmesinden önceki kısım). */
export function appBaseUrl(): string {
  return window.location.origin + window.location.pathname
}

type Session = { user: { id: string; email?: string; user_metadata?: Record<string, unknown> } } | null

function toUser(session: Session): AuthUser | null {
  if (!session) return null
  const m = session.user.user_metadata ?? {}
  const name = [m.full_name, m.name].find((v): v is string => typeof v === 'string' && v.trim().length > 0)
  return { id: session.user.id, email: session.user.email ?? null, name: name?.trim().slice(0, 40) ?? null }
}

function fail(error: unknown): never {
  throw new UserFacingError(cloudErrorMessage(error))
}

/**
 * Hesap ve oturum. Uygulama hazır bir Supabase adresiyle derlendiyse (yayındaki site) herkes kendi
 * hesabıyla girer. Adres yoksa (yerel geliştirme) giriş istenmez ve uygulama yalnızca bu cihazda çalışır.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const config = useMemo(() => envCloudConfig(), [])
  const enabled = !!config
  const [backend, setBackend] = useState<SupabaseBackend | null>(null)
  const [ready, setReady] = useState(!enabled)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [recovery, setRecovery] = useState(false)
  const [googleEnabled, setGoogleEnabled] = useState(false)

  useEffect(() => {
    if (!config) return
    let alive = true
    let unsubscribe = () => {}
    import('../cloud/supabaseBackend').then(({ SupabaseBackend }) => {
      if (!alive) return
      const b = new SupabaseBackend(config.url, config.anonKey)
      setBackend(b)
      const apply = (session: Session) => {
        b.setUserId(session?.user.id ?? null)
        setUser((prev) => {
          const next = toUser(session)
          return prev && next && prev.id === next.id && prev.email === next.email && prev.name === next.name ? prev : next
        })
        setReady(true)
        if (session) restoreAfterLogin()
      }
      const { data } = b.client.auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY') setRecovery(true)
        apply(session)
      })
      unsubscribe = () => data.subscription.unsubscribe()
      b.client.auth
        .getSession()
        .then(({ data }) => apply(data.session))
        .catch(() => apply(null))
        .finally(() => {
          // Giriş/şifre dönüşündeki tek kullanımlık kodu adres çubuğundan temizle
          const url = new URL(window.location.href)
          if (url.searchParams.has('code') || url.searchParams.has('error_description')) {
            url.search = ''
            window.history.replaceState(null, '', url.toString())
          }
        })
      // Google ile giriş Supabase'de açıksa düğme gösterilir
      fetch(`${config.url}/auth/v1/settings`, { headers: { apikey: config.anonKey } })
        .then((r) => (r.ok ? r.json() : null))
        .then((s: { external?: { google?: boolean } } | null) => alive && setGoogleEnabled(!!s?.external?.google))
        .catch(() => {})
    })
    return () => {
      alive = false
      unsubscribe()
    }
  }, [config])

  const need = useCallback(() => {
    if (!backend) throw new UserFacingError('Bağlantı hazırlanıyor, biraz sonra tekrar deneyin.')
    return backend
  }, [backend])

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { error } = await need().client.auth.signInWithPassword({ email: email.trim(), password })
      if (error) fail(error)
    },
    [need],
  )

  const signUp = useCallback(
    async (name: string, email: string, password: string) => {
      const { data, error } = await need().client.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: appBaseUrl(), data: { full_name: name.trim().slice(0, 40) } },
      })
      if (error) fail(error)
      // Supabase, kayıtlı bir e-posta için de hata vermeden kimliksiz kullanıcı döndürür
      if (data.user && !data.user.identities?.length) throw new UserFacingError('Bu e-posta ile zaten hesap var; giriş yapın.')
      return !!data.session
    },
    [need],
  )

  const signInWithGoogle = useCallback(async () => {
    // Google dönüşünde açık sayfaya (ör. davet bağlantısı) geri gelinsin
    try {
      if (window.location.hash.length > 2) sessionStorage.setItem(AFTER_LOGIN_KEY, window.location.hash)
    } catch {
      /* yok sayılır */
    }
    // select_account: Google her seferinde hesap seçtirir (ana ekrana eklenen uygulamada tek hesaba kilitlenmesin)
    const { error } = await need()
      .client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: appBaseUrl(), queryParams: { prompt: 'select_account' } } })
    if (error) fail(error)
  }, [need])

  const sendPasswordReset = useCallback(
    async (email: string) => {
      const { error } = await need().client.auth.resetPasswordForEmail(email.trim(), { redirectTo: appBaseUrl() })
      if (error) fail(error)
    },
    [need],
  )

  const updatePassword = useCallback(
    async (password: string) => {
      const { error } = await need().client.auth.updateUser({ password })
      if (error) fail(error)
      setRecovery(false)
    },
    [need],
  )

  const signOut = useCallback(async () => {
    setRecovery(false)
    await backend?.client.auth.signOut().catch(() => {})
  }, [backend])

  const value = useMemo(
    () => ({ enabled, ready, backend, user, recovery, googleEnabled, signIn, signUp, signInWithGoogle, sendPasswordReset, updatePassword, signOut }),
    [enabled, ready, backend, user, recovery, googleEnabled, signIn, signUp, signInWithGoogle, sendPasswordReset, updatePassword, signOut],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('AuthProvider eksik')
  return c
}
