import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

/** `?yeni=1` ile gelindiyse (hızlı ekleme menüsü) düzenleyiciyi "yeni" modunda açar ve parametreyi temizler. */
export function useStartNew(open: () => void) {
  const [params, setParams] = useSearchParams()
  const wantsNew = params.get('yeni') === '1'
  useEffect(() => {
    if (!wantsNew) return
    open()
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        next.delete('yeni')
        return next
      },
      { replace: true },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsNew])
}
