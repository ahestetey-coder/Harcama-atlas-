import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { fetchMarket, searchSymbols } from '../cloud/rates'
import { autoPriceCode, autoQuote, confidentMatch, defaultMarket, quoteKey, quoteUpdates, rateUpdates, SYMBOL_KINDS, type Asset, type AssetQuote } from '../domain/assets'
import { useAuth } from './auth'
import { useAssets, useRepo } from './data'

/**
 * Varlıkların güncel fiyatı kendiliğinden alınır: uygulama açılınca, varlık listesi değişince ve açık kaldıkça
 * 15 dakikada bir. Sembolü olmayan hisse, fon ve kripto adından güvenle eşlenebiliyorsa sembol de eklenir.
 * İstekler yalnızca piyasa, sembol ya da ad taşır; miktar ve maliyet gönderilmez.
 */

export interface LiveState {
  busy: boolean
  /** Son başarılı güncelleme zamanı (ISO). */
  at?: string
  error?: string
  /** Fiyatı alınamayan varlıklar: id → neden. */
  failed: Record<string, string>
  /** Adından kendiliğinden sembol eklenen varlıklar: id → sembol. */
  linked: Record<string, string>
  usd: { valueTl: number; date: string } | null
  /** Has altının gram fiyatı (TL); yolculuk planını altın bazında göstermek için. */
  goldGram: { valueTl: number; date: string } | null
}

let state: LiveState = { busy: false, failed: {}, linked: {}, usd: null, goldGram: null }
const listeners = new Set<() => void>()
const set = (patch: Partial<LiveState>) => {
  state = { ...state, ...patch }
  for (const l of listeners) l()
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useLiveState(): LiveState {
  return useSyncExternalStore(subscribe, () => state)
}

/** Elle "Fiyatları güncelle" için; eşitleyici bağlı değilse hiçbir şey yapmaz. */
let manualRefresh: (() => Promise<number | null>) | null = null
export const refreshPricesNow = () => manualRefresh?.() ?? Promise.resolve(null)

const REFRESH_MS = 15 * 60 * 1000
/** Oturumda adından eşleme denenen varlıklar (her biri bir kez denenir). */
const linkTried = new Set<string>()
let lastSignature: string | null = null
let lastRun = 0
/** Bir güncelleme sürerken liste değişirse, bittiğinde bir kez daha çalıştırılır. */
let rerun = false

const signatureOf = (assets: Asset[]) =>
  assets
    .filter((a) => !a.archived)
    .map((a) => `${a.id}=${autoPriceCode(a) ?? (autoQuote(a) ? quoteKey(autoQuote(a)!) : SYMBOL_KINDS.includes(a.kind) ? `?${a.name}` : '')}`)
    .join('|')

/** Uygulama kabuğunda bir kez bağlanır. */
export function useLivePriceSync(enabled: boolean) {
  const { backend, user } = useAuth()
  const assets = useAssets()
  const repo = useRepo()
  const client = enabled && backend && user ? backend.client : null
  const assetsRef = useRef<Asset[]>([])
  useEffect(() => {
    assetsRef.current = assets ?? []
  }, [assets])

  const run = useCallback(async (): Promise<number | null> => {
    if (!client) return null
    if (state.busy) {
      rerun = true
      return null
    }
    rerun = false
    set({ busy: true, error: undefined })
    try {
      let list = assetsRef.current.filter((a) => !a.archived)
      // 1) Sembolü olmayan hisse, fon ve kriptoyu adından eşle (emin olunamazsa dokunma)
      const linked: Record<string, string> = { ...state.linked }
      for (const a of list) {
        if (!SYMBOL_KINDS.includes(a.kind) || a.quote || linkTried.has(a.id) || a.name.trim().length < 2) continue
        linkTried.add(a.id)
        const market = defaultMarket(a.kind)
        const pick = confidentMatch(a.name, await searchSymbols(client, market, a.name.trim()))
        if (!pick) continue
        const quote: AssetQuote = { market, symbol: pick.symbol }
        await repo.saveAsset({ id: a.id, kind: a.kind, name: a.name, unit: a.unit, note: a.note, quote })
        linked[a.id] = pick.symbol
        list = list.map((x) => (x.id === a.id ? { ...x, quote } : x))
      }
      // 2) Kurlar ve piyasa fiyatları
      const wanted = new Map<string, AssetQuote>()
      // Altın gram fiyatı, altın varlığı olmasa da plan birimi için alınır
      wanted.set('gold:XAU', { market: 'gold', symbol: 'XAU' })
      for (const a of list) {
        const q = autoQuote(a)
        if (q) wanted.set(quoteKey(q), q)
      }
      const data = await fetchMarket(client, [...wanted.values()])
      const ok = data.quotes.filter((q) => q.ok).map((q) => ({ market: q.market, symbol: q.symbol, priceTl: q.priceTl!, date: q.date! }))
      const updates = [...(data.date ? rateUpdates(list, data.rates, data.date) : []), ...quoteUpdates(list, ok)]
      for (const u of updates) await repo.setAssetValuation(u.assetId, u.valuation)
      const errors = new Map(data.quotes.filter((q) => !q.ok).map((q) => [`${q.market}:${q.symbol}`, q.error ?? 'Fiyat alınamadı']))
      const failed: Record<string, string> = {}
      for (const a of list) {
        const q = autoQuote(a)
        const e = q ? errors.get(quoteKey(q)) : undefined
        if (e) failed[a.id] = e
      }
      const usd = data.rates.find((r) => r.code === 'USD')
      const gold = ok.find((q) => q.market === 'gold' && q.symbol === 'XAU')
      lastRun = Date.now()
      set({ busy: false, at: new Date().toISOString(), failed, linked, usd: usd && data.date ? { valueTl: usd.valueTl, date: data.date } : state.usd, goldGram: gold ? { valueTl: gold.priceTl, date: gold.date } : state.goldGram })
      return updates.length
    } catch (e) {
      set({ busy: false, error: e instanceof Error ? e.message : 'Güncel fiyatlar alınamadı.' })
      return null
    } finally {
      if (rerun) setTimeout(() => void runRef.current(), 0)
    }
  }, [client, repo])
  const runRef = useRef(run)
  useEffect(() => {
    runRef.current = run
  }, [run])

  useEffect(() => {
    manualRefresh = client ? run : null
    return () => {
      manualRefresh = null
    }
  }, [client, run])

  // Açılışta ve varlık listesi (sembol, ad, tür) değişince
  const signature = assets ? signatureOf(assets) : null
  useEffect(() => {
    if (!client || signature === null || signature === lastSignature) return
    lastSignature = signature
    void run()
  }, [client, signature, run])

  // Uygulama açık kaldıkça ve ön plana dönünce
  useEffect(() => {
    if (!client) return
    const tick = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRun > REFRESH_MS) void run()
    }
    const id = setInterval(tick, 60 * 1000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [client, run])
}
