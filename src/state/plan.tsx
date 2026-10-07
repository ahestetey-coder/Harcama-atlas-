import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getMyPlan } from '../cloud/admin'
import { hasFeature, isPlan, type Feature, type Plan } from '../domain/plans'
import { useIsAdmin } from './admin'
import { useAuth } from './auth'
import { useData } from './data'
import { readPref, writePref } from './prefs'

interface PlanCtx {
  /** Geçerli paket (önizleme varsa o). */
  plan: Plan
  /** Hesabın paketi: mağaza ödemesi bağlanana kadar yöneticinin tanımladığı paket, yoksa Ücretsiz. */
  purchased: Plan
  /** Önizleme açık mı? */
  preview: Plan | null
  /** Önizleme seçilebilir mi: yönetici, demo modu veya hesapsız (yerel) kullanım. */
  canPreview: boolean
  setPreview: (p: Plan | null) => void
  has: (f: Feature) => boolean
}

const Ctx = createContext<PlanCtx | null>(null)

export function PlanProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const { isDemo } = useData()
  const admin = useIsAdmin()
  const [pref, setPref] = useState(() => readPref('planPreview'))
  const { backend, user } = auth
  const [account, setAccount] = useState<{ uid: string; plan: Plan } | null>(null)
  useEffect(() => {
    if (!backend || !user) return
    let alive = true
    getMyPlan(backend.client).then((plan) => alive && setAccount({ uid: user.id, plan }))
    return () => {
      alive = false
    }
  }, [backend, user])
  const purchased: Plan = user && account?.uid === user.id ? account.plan : 'free'
  const canPreview = admin || isDemo || !auth.enabled
  const preview = canPreview && isPlan(pref) && pref !== 'free' && pref !== purchased ? pref : null
  const plan = preview ?? purchased

  const setPreview = useCallback((p: Plan | null) => {
    const v = p && p !== 'free' ? p : null
    writePref('planPreview', v)
    setPref(v)
  }, [])
  const has = useCallback((f: Feature) => hasFeature(plan, f), [plan])

  const value = useMemo(() => ({ plan, purchased, preview, canPreview, setPreview, has }), [plan, purchased, preview, canPreview, setPreview, has])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function usePlan(): PlanCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('usePlan, PlanProvider içinde kullanılmalı')
  return c
}
