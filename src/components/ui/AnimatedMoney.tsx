import { animate } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { formatKurus } from '../../domain/money'
import { cn } from '../../lib/cn'
import { useReducedMotion } from '../../lib/hooks'

/** Tutarı eski değerinden yenisine sayarak gösterir (hareket azaltılmışsa doğrudan). */
export function AnimatedKurus({ value, className }: { value: number; className?: string }) {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    if (reduced) return
    const controls = animate(from.current, value, {
      duration: 0.8,
      ease: [0.2, 0.8, 0.2, 1],
      onUpdate: (v) => {
        from.current = v
        setShown(Math.round(v))
      },
    })
    return () => controls.stop()
  }, [value, reduced])
  return <span className={cn('num', className)}>{formatKurus(reduced ? value : shown)}</span>
}

/** Sayı sayacı: yıl, yüzde gibi değerler değiştikçe akarak yeni değere gelir. */
export function AnimatedNumber({ value, format = (v) => String(v), className, from: start }: { value: number; format?: (v: number) => string; className?: string; from?: number }) {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(start ?? value)
  const from = useRef(start ?? value)
  useEffect(() => {
    if (reduced) return
    const controls = animate(from.current, value, {
      duration: 1.1,
      ease: [0.2, 0.8, 0.2, 1],
      onUpdate: (v) => {
        from.current = v
        setShown(Math.round(v))
      },
    })
    return () => controls.stop()
  }, [value, reduced])
  return <span className={cn('num', className)}>{format(reduced ? value : shown)}</span>
}
