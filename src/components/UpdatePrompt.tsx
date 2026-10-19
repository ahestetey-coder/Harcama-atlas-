import { RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { isNativeApp } from '../lib/native'
import { Button } from './ui/primitives'

/** Servis çalışanını kaydeder (çevrimdışı kullanım) ve yeni sürüm hazır olduğunda sorar. */
export function UpdatePrompt() {
  const [update, setUpdate] = useState<null | (() => void)>(null)
  useEffect(() => {
    // Mağaza uygulamasında dosyalar uygulamayla gelir; güncelleme mağazadan yapılır.
    if (import.meta.env.DEV || isNativeApp || !('serviceWorker' in navigator)) return
    let cancelled = false
    void import('virtual:pwa-register').then(({ registerSW }) => {
      if (cancelled) return
      const updateSW = registerSW({
        onNeedRefresh: () => setUpdate(() => () => void updateSW(true)),
      })
    })
    return () => {
      cancelled = true
    }
  }, [])
  if (!update) return null
  return (
    <div className="glass fixed inset-x-4 bottom-24 z-[60] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-line-strong px-4 py-3 text-sm shadow-float lg:bottom-6">
      <RefreshCw className="size-5 shrink-0 text-accent" />
      <span className="flex-1">Uygulamanın yeni sürümü hazır.</span>
      <Button size="sm" variant="primary" onClick={update}>
        Yenile
      </Button>
    </div>
  )
}
