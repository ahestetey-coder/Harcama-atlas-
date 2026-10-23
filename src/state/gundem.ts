import { useEffect, useState, useSyncExternalStore } from 'react'
import { APP_CONFIG } from '../config/app'
import type { ArticleBody, ArticleIndex, ArticleMeta } from '../domain/gundem'

/**
 * Gündem yazıları yayındaki web adresinden okunur (mobil uygulama da aynı dosyaları kullanır).
 * Liste açılışta, uygulamaya dönüldüğünde ve 15 dakikada bir yenilenir; son liste cihazda saklanır.
 */
const BASE = `${APP_CONFIG.webUrl}gundem/`
const CACHE_KEY = 'ha:gundem'
const REFRESH_MS = 15 * 60_000

let list: ArticleMeta[] | null = readCache()
let loading: Promise<void> | null = null
let lastFetch = 0
const listeners = new Set<() => void>()

function readCache(): ArticleMeta[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as ArticleMeta[]) : null
  } catch {
    return null
  }
}

export async function refreshArticles(force = false): Promise<void> {
  if (loading) return loading
  if (!force && Date.now() - lastFetch < 60_000) return
  loading = (async () => {
    try {
      const res = await fetch(`${BASE}index.json?t=${Date.now()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(String(res.status))
      const data = (await res.json()) as ArticleIndex
      list = Array.isArray(data.articles) ? data.articles : []
      lastFetch = Date.now()
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(list))
      } catch {
        /* önbellek yazılamadı */
      }
    } catch {
      // Çevrimdışı: eldeki listeyle devam
      list ??= []
    } finally {
      loading = null
      listeners.forEach((l) => l())
    }
  })()
  return loading
}

/** Tüm yazılar (yayına girmemiş olanlar dahil; görünürlüğü visibleArticles belirler). null: yükleniyor. */
export function useArticles(): ArticleMeta[] | null {
  const value = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => list,
    () => list,
  )
  useEffect(() => {
    void refreshArticles()
    const onVisible = () => document.visibilityState === 'visible' && void refreshArticles()
    document.addEventListener('visibilitychange', onVisible)
    const t = setInterval(() => void refreshArticles(), REFRESH_MS)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(t)
    }
  }, [])
  return value
}

/** Saat ilerledikçe yeni yazıların görünmesi için dakikada bir güncellenen "şimdi". */
export function useNow(stepMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), stepMs)
    return () => clearInterval(t)
  }, [stepMs])
  return now
}

const bodies = new Map<string, ArticleBody>()

export function useArticleBody(slug: string | undefined): ArticleBody | null | 'error' {
  const [state, setState] = useState<{ slug: string; body: ArticleBody | 'error' } | null>(null)
  useEffect(() => {
    if (!slug || bodies.has(slug)) return
    let alive = true
    fetch(`${BASE}${encodeURIComponent(slug)}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<ArticleBody>) : Promise.reject(new Error(String(r.status)))))
      .then((b) => {
        bodies.set(slug, b)
        if (alive) setState({ slug, body: b })
      })
      .catch(() => alive && setState({ slug, body: 'error' }))
    return () => {
      alive = false
    }
  }, [slug])
  if (!slug) return null
  return bodies.get(slug) ?? (state?.slug === slug ? state.body : null)
}

/** Bildirimler: en son hangi yazıya kadar haber verildi (ms). */
const SEEN_KEY = 'ha:gundem-seen'
export function readSeenAt(): number | null {
  try {
    const v = localStorage.getItem(SEEN_KEY)
    return v ? Number(v) : null
  } catch {
    return null
  }
}
export function writeSeenAt(ms: number): void {
  try {
    localStorage.setItem(SEEN_KEY, String(ms))
  } catch {
    /* yok say */
  }
}
