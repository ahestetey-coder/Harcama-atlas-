import { AnimatePresence, motion } from 'motion/react'
import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { currentMonth } from '../domain/dates'
import type { MonthKey, Transaction } from '../domain/types'

type ToastKind = 'success' | 'error' | 'info'
interface Toast {
  id: number
  kind: ToastKind
  message: string
  action?: { label: string; onClick: () => void }
  duration: number
}

interface UiCtx {
  month: MonthKey
  setMonth: (m: MonthKey) => void
  /** Panel ve işlemler için grup filtresi: '' tümü, 'none' grupsuz, aksi halde grup kimliği. */
  groupFilter: string
  setGroupFilter: (g: string) => void
  /** Ortak gruplarda kişi filtresi: '' herkes, aksi halde üye kimliği. */
  memberFilter: string
  setMemberFilter: (m: string) => void
  toast: (message: string, opts?: { kind?: ToastKind; action?: Toast['action']; duration?: number }) => void
  /** İşlem formunu açar: yeni kayıt (isteğe bağlı türüyle) veya düzenleme. */
  openTransactionForm: (tx?: Transaction, opts?: { type?: Transaction['type'] }) => void
  formState: { open: boolean; tx?: Transaction; type?: Transaction['type'] }
  /** "+" menüsünden seçilen ekstre/görsel; içe aktarma penceresi açılınca okunur. */
  pendingImport: File | null
  setPendingImport: (f: File | null) => void
  /** İçe aktarma, bulunulan sayfanın üstünde açılan pencerede yapılır. */
  importOpen: boolean
  openImport: (file?: File) => void
  closeImport: () => void
  closeTransactionForm: () => void
  /** Son eklenen/güncellenen satırı vurgulamak için. */
  highlightId: string | null
  setHighlightId: (id: string | null) => void
}

const Ctx = createContext<UiCtx | null>(null)

export function UiProvider({ children }: { children: ReactNode }) {
  const [month, setMonth] = useState<MonthKey>(() => currentMonth())
  const [groupFilter, setGroupFilter] = useState('')
  const [memberFilter, setMemberFilter] = useState('')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [formState, setFormState] = useState<UiCtx['formState']>({ open: false })
  const [pendingImport, setPendingImport] = useState<File | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const seq = useRef(0)

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const toast = useCallback<UiCtx['toast']>(
    (message, opts) => {
      const id = ++seq.current
      const t: Toast = { id, message, kind: opts?.kind ?? 'success', action: opts?.action, duration: opts?.duration ?? (opts?.action ? 7000 : 3800) }
      setToasts((list) => [...list.slice(-2), t])
      window.setTimeout(() => dismiss(id), t.duration)
    },
    [dismiss],
  )

  const openTransactionForm = useCallback<UiCtx['openTransactionForm']>((tx, opts) => setFormState({ open: true, tx, type: opts?.type }), [])
  const closeTransactionForm = useCallback(() => setFormState((s) => ({ ...s, open: false })), [])
  const openImport = useCallback((file?: File) => {
    if (file) setPendingImport(file)
    setImportOpen(true)
  }, [])
  const closeImport = useCallback(() => {
    setImportOpen(false)
    setPendingImport(null)
  }, [])

  const value = useMemo(
    () => ({ month, setMonth, groupFilter, setGroupFilter, memberFilter, setMemberFilter, toast, openTransactionForm, formState, closeTransactionForm, highlightId, setHighlightId, pendingImport, setPendingImport, importOpen, openImport, closeImport }),
    [month, groupFilter, memberFilter, toast, openTransactionForm, formState, closeTransactionForm, highlightId, pendingImport, importOpen, openImport, closeImport],
  )

  return (
    <Ctx.Provider value={value}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:pr-6">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
              className="glass pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-line-strong px-4 py-3 text-sm shadow-float"
            >
              {t.kind === 'success' && <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />}
              {t.kind === 'error' && <CircleAlert className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />}
              {t.kind === 'info' && <Info className="mt-0.5 size-5 shrink-0 text-info" aria-hidden />}
              <p className="flex-1 leading-snug text-ink">{t.message}</p>
              {t.action && (
                <button
                  type="button"
                  className="shrink-0 rounded-lg px-2 py-0.5 font-semibold text-accent hover:bg-accent-soft"
                  onClick={() => {
                    t.action!.onClick()
                    dismiss(t.id)
                  }}
                >
                  {t.action.label}
                </button>
              )}
              <button type="button" aria-label="Bildirimi kapat" className="shrink-0 rounded-md p-0.5 text-subtle hover:text-ink" onClick={() => dismiss(t.id)}>
                <X className="size-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  )
}

export function useUi(): UiCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('UiProvider eksik')
  return c
}
