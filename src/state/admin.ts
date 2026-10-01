import { useEffect, useState } from 'react'
import { isAdmin } from '../cloud/admin'
import { useAuth } from './auth'

/** Oturumdaki hesap yönetici mi? Yönetici paneli menüde yalnızca o zaman görünür. */
export function useIsAdmin(): boolean {
  const { backend, user } = useAuth()
  const [result, setResult] = useState<{ uid: string; admin: boolean } | null>(null)
  useEffect(() => {
    if (!backend || !user) return
    let alive = true
    isAdmin(backend.client).then((admin) => alive && setResult({ uid: user.id, admin }))
    return () => {
      alive = false
    }
  }, [backend, user])
  return !!user && result?.uid === user.id && result.admin
}
