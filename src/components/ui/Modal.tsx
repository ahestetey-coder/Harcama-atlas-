import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { useIsDesktop } from '../../lib/hooks'
import { revealOnFocus } from '../../lib/viewport'
import { Button, IconButton } from './primitives'

const ease = [0.2, 0.8, 0.2, 1] as const

/**
 * Erişilebilir modal: odak modal içinde tutulur, Esc ile kapanır, kapanınca odak
 * açan öğeye döner (Radix Dialog). Mobilde alttan açılan sayfa, masaüstünde ortada.
 * `side` ile masaüstünde sağdan açılan çekmece olur.
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  side = false,
  initialFocusRef,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  /** 'full': neredeyse tam ekran (içe aktarma gibi uzun akışlar). */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  side?: boolean
  initialFocusRef?: React.RefObject<HTMLElement | null>
}) {
  const desktop = useIsDesktop()
  // Modal koddan açıldığında (Dialog.Trigger yok) kapanınca odağı açan öğeye geri vermek için.
  // Layout effect, Radix'in odak taşımasından (passive effect) önce çalışır.
  const returnFocus = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    if (open) returnFocus.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null
  }, [open])
  const widths = { sm: 'lg:max-w-md', md: 'lg:max-w-lg', lg: 'lg:max-w-2xl', xl: 'lg:max-w-4xl', full: 'lg:max-w-6xl' }
  const full = size === 'full'
  const asDrawer = side && desktop
  const motionProps = desktop
    ? asDrawer
      ? { initial: { x: 40, opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: 40, opacity: 0 } }
      : { initial: { y: 12, scale: 0.97, opacity: 0 }, animate: { y: 0, scale: 1, opacity: 1 }, exit: { y: 8, scale: 0.98, opacity: 0 } }
    : { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' } }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              />
            </Dialog.Overlay>
            <Dialog.Content
              asChild
              forceMount
              aria-describedby={description ? undefined : undefined}
              onCloseAutoFocus={(e) => {
                const el = returnFocus.current
                if (el && el.isConnected) {
                  e.preventDefault()
                  el.focus()
                }
              }}
              onOpenAutoFocus={(e) => {
                if (initialFocusRef?.current) {
                  e.preventDefault()
                  initialFocusRef.current.focus()
                }
              }}
            >
              <motion.div
                {...motionProps}
                transition={{ duration: 0.22, ease }}
                className={cn(
                  'fixed z-50 flex flex-col border border-line bg-surface shadow-float outline-none',
                  asDrawer
                    ? 'inset-y-3 right-3 w-[min(520px,calc(100vw-24px))] rounded-3xl'
                    : desktop
                      ? cn('left-1/2 w-[calc(100vw-32px)] rounded-3xl', full ? 'top-[4vh] h-[92vh]' : 'top-[8vh] max-h-[84vh]', widths[size])
                      : cn('sheet-mobile inset-x-0 rounded-t-3xl', full && 'sheet-full'),
                )}
                style={desktop && !asDrawer ? { translateX: '-50%' } : undefined}
              >
                {!desktop && <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-line-strong" aria-hidden />}
                <div className="flex shrink-0 items-start justify-between gap-4 px-5 pb-3 pt-4 sm:px-6 sm:pt-5">
                  <div className="min-w-0">
                    <Dialog.Title className="font-display text-lg font-semibold text-ink">{title}</Dialog.Title>
                    {description ? (
                      <Dialog.Description className="mt-0.5 text-sm text-muted">{description}</Dialog.Description>
                    ) : (
                      <Dialog.Description className="sr-only">{typeof title === 'string' ? title : 'İletişim kutusu'}</Dialog.Description>
                    )}
                  </div>
                  <Dialog.Close asChild>
                    <IconButton label="Kapat" size="sm" className="-mr-1.5 -mt-0.5">
                      <X className="size-[18px]" />
                    </IconButton>
                  </Dialog.Close>
                </div>
                <div className={cn('scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6', !desktop && !footer && 'pb-[calc(1.25rem+env(safe-area-inset-bottom))]')} onFocus={desktop ? undefined : revealOnFocus}>
                  {children}
                </div>
                {footer && <div className="safe-bottom-pad flex shrink-0 flex-wrap justify-end gap-2 border-t border-line px-5 pt-3.5 sm:px-6">{footer}</div>}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  children,
  confirmLabel,
  onConfirm,
  danger,
  loading,
  confirmDisabled,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  children: ReactNode
  confirmLabel: string
  onConfirm: () => void
  danger?: boolean
  loading?: boolean
  confirmDisabled?: boolean
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading} disabled={confirmDisabled}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm leading-relaxed text-muted">{children}</div>
    </Modal>
  )
}
