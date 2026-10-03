/**
 * Mobilde ekran klavyesi: görünen alanın yüksekliği (--vvh) ve klavyenin kapladığı yükseklik (--kb)
 * CSS değişkeni olarak yazılır; klavye açıkken <html data-kb>. Alttan açılan pencereler klavyenin
 * üstünde kalır, alt menü gizlenir (iOS'ta düzen kaymaz). Klavyesi olmayan ortamda hiçbir şey yapmaz.
 */
export function installViewportVars(): void {
  const vv = window.visualViewport
  if (!vv) return
  const root = document.documentElement
  let frame = 0
  const update = () => {
    frame = 0
    const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
    root.style.setProperty('--vvh', `${Math.round(vv.height)}px`)
    root.style.setProperty('--kb', `${kb}px`)
    // Yakınlaştırma (pinch) klavye sayılmaz
    if (kb > 120 && vv.scale <= 1.01) root.dataset.kb = '1'
    else delete root.dataset.kb
  }
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update)
  }
  vv.addEventListener('resize', schedule)
  vv.addEventListener('scroll', schedule)
  update()
}

/** Odaklanan alanı (klavye açıldıktan sonra) görünür alana kaydırır. */
export function revealOnFocus(e: { target: EventTarget | null }): void {
  const el = e.target
  if (!(el instanceof HTMLElement) || !el.matches('input, textarea, select')) return
  if (el instanceof HTMLInputElement && ['checkbox', 'radio', 'file', 'button', 'submit'].includes(el.type)) return
  window.setTimeout(() => {
    if (document.activeElement === el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, 320)
}
