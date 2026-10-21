/**
 * Tanıtım sitesine gömülü test (?gomulu=1). Site kendi başlığını ve arka planını gösterir;
 * uygulama yalnızca testi çizer, yüksekliğini ve adım değişimini üst sayfaya bildirir.
 */
const params = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search)

export const EMBEDDED = params.get('gomulu') === '1' && typeof window !== 'undefined' && window.parent !== window

/** Sitenin seçili teması (?tema=acik|koyu); gömülü değilse ya da verilmediyse null. */
export const EMBED_THEME: 'light' | 'dark' | null = !EMBEDDED ? null : params.get('tema') === 'acik' ? 'light' : params.get('tema') === 'koyu' ? 'dark' : null

type EmbedMessage = { type: 'ha-test:height'; height: number } | { type: 'ha-test:step' }

/** Üst sayfaya yalnızca yükseklik ve adım bilgisi gider; kişisel veri gönderilmez. */
export function postToSite(msg: EmbedMessage) {
  if (EMBEDDED) window.parent.postMessage(msg, '*')
}

let started = false
export function startEmbedBridge() {
  if (!EMBEDDED || started) return
  started = true
  document.documentElement.dataset.embed = ''
  let last = 0
  const send = () => {
    const h = Math.ceil(document.documentElement.getBoundingClientRect().height)
    if (h !== last) postToSite({ type: 'ha-test:height', height: (last = h) })
  }
  new ResizeObserver(send).observe(document.documentElement)
  send()
}

/** Site temayı değiştirince gömülü test de değişir. */
export function onSiteTheme(cb: (t: 'light' | 'dark') => void): () => void {
  if (!EMBEDDED) return () => {}
  const on = (e: MessageEvent) => {
    if (e.source !== window.parent) return
    const d = e.data as { type?: string; theme?: string }
    if (d?.type === 'ha-site:theme' && (d.theme === 'light' || d.theme === 'dark')) cb(d.theme)
  }
  window.addEventListener('message', on)
  return () => window.removeEventListener('message', on)
}
