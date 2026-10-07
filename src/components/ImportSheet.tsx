import { lazy, Suspense, useCallback, useState } from 'react'
import { useUi } from '../state/ui'
import { ConfirmDialog, Modal } from './ui/Modal'
import { Spinner } from './ui/primitives'

const ImportFlow = lazy(() => import('../pages/import/ImportPage').then((m) => ({ default: m.ImportFlow })))

/**
 * "+" menüsünden açılan içe aktarma: bulunulan sayfa arkada kalır, akış bu pencerede yürür.
 * Okunan veya incelenen bir dosya varken kapatmadan önce sorulur (onaylanmamış satırlar kaybolur).
 */
export function ImportSheet() {
  const { importOpen, closeImport } = useUi()
  const [dirty, setDirty] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const onDirtyChange = useCallback((d: boolean) => setDirty(d), [])
  const leave = () => {
    setConfirm(false)
    setDirty(false)
    closeImport()
  }
  return (
    <>
      <Modal
        open={importOpen}
        onOpenChange={(o) => {
          if (o) return
          if (dirty) setConfirm(true)
          else leave()
        }}
        title="İçe aktar"
        description="Dosya bu cihazda okunur. Onaylamadığınız hiçbir satır kaydedilmez."
        size="full"
      >
        <Suspense
          fallback={
            <div className="grid min-h-[40vh] place-items-center">
              <Spinner className="size-7" />
            </div>
          }
        >
          {importOpen && <ImportFlow embedded onLeave={leave} onDirtyChange={onDirtyChange} />}
        </Suspense>
      </Modal>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="İçe aktarma bırakılsın mı?" confirmLabel="Bırak" danger onConfirm={leave}>
        Okunan satırlar henüz kaydedilmedi. Pencereyi kapatırsanız bu dosyayı yeniden seçmeniz gerekir.
      </ConfirmDialog>
    </>
  )
}
