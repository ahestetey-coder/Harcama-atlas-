import { RotateCcw, Trash2, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { deleteMyCloudTransactions } from '../cloud/sync'
import { clearMyCloudRecords } from '../cloud/userSync'
import { toUserMessage } from '../data/repository'
import { useAuth } from '../state/auth'
import { clearLocalAccountData, resetLocalData } from '../state/data'
import { useUi } from '../state/ui'
import { ConfirmDialog } from './ui/Modal'
import { Button, Card, Checkbox, Field, Input } from './ui/primitives'

/** Ayarlar'ın en altı: "Verilerimi sıfırla" ve altında "Hesabımı sil". */
export function DangerZoneCard() {
  const auth = useAuth()
  const { toast } = useUi()
  const [open, setOpen] = useState(false)
  // Kapanış animasyonunda başlık değişmesin diye son seçilen işlem ayrıca tutulur
  const [kind, setKind] = useState<'reset' | 'delete'>('reset')
  const [text, setText] = useState('')
  const [wipeLocal, setWipeLocal] = useState(true)
  const [busy, setBusy] = useState(false)
  const user = auth.enabled ? auth.user : null
  const word = kind === 'reset' ? 'SIFIRLA' : 'SİL'

  const close = (o: boolean) => {
    if (busy || o) return
    setOpen(false)
    setText('')
  }

  const reset = async () => {
    setBusy(true)
    try {
      if (user && auth.backend) {
        await deleteMyCloudTransactions(auth.backend)
        await clearMyCloudRecords(auth.backend)
      }
      await resetLocalData(user?.id)
      // Bellekteki eşitleme ve ekran durumunu da temizlemek için baştan aç
      window.location.hash = '#/'
      window.location.reload()
    } catch (e) {
      toast(toUserMessage(e), { kind: 'error' })
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!user) return
    setBusy(true)
    try {
      await auth.deleteAccount()
      if (wipeLocal) await clearLocalAccountData(user.id).catch(() => {})
      toast('Hesabınız silindi.')
    } catch (e) {
      toast(toUserMessage(e), { kind: 'error' })
      setBusy(false)
    }
  }

  return (
    <Card className="p-5 lg:col-span-2">
      <h2 className="flex items-center gap-2 font-display text-base font-semibold">
        <TriangleAlert className="size-5 text-danger" /> Verileri sil
      </h2>
      <p className="mt-1 text-sm text-muted">Bu işlemler geri alınamaz.</p>
      <div className="mt-4 flex flex-col items-start gap-2">
        <Button className="text-danger" icon={<RotateCcw className="size-4" />} onClick={() => (setKind('reset'), setOpen(true))}>
          Verilerimi sıfırla
        </Button>
        {user && (
          <Button className="text-danger" icon={<Trash2 className="size-4" />} onClick={() => (setKind('delete'), setOpen(true))}>
            Hesabımı sil
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={open}
        onOpenChange={close}
        title={kind === 'reset' ? 'Verileriniz sıfırlansın mı?' : 'Hesabınız silinsin mi?'}
        confirmLabel={kind === 'reset' ? 'Verilerimi sıfırla' : 'Hesabımı kalıcı olarak sil'}
        danger
        loading={busy}
        confirmDisabled={text.trim().toLocaleUpperCase('tr-TR') !== word}
        onConfirm={() => void (kind === 'reset' ? reset() : remove())}
      >
        {kind === 'reset' ? (
          <p>
            Harcamalarınız, gelirleriniz, bütçeniz, varlık ve borçlarınız, hedefleriniz ve test sonuçlarınız silinir; uygulama ilk günkü gibi açılır.
            {user ? ' Kayıtlar buluttan ve hesabınızla girdiğiniz diğer cihazlardan da silinir; ortak gruplara eklediğiniz harcamalar da kalkar. Hesabınız, paketiniz ve grup üyelikleriniz kalır.' : ''} Geri alınamaz.
          </p>
        ) : (
          <>
            <p>
              Hesabınız ve buluttaki verileriniz kalıcı olarak silinir. Yöneticisi olduğunuz ortak gruplar, içindeki herkesin harcamalarıyla birlikte gider. Geri
              alınamaz.
            </p>
            <Checkbox className="mt-3" label="Bu cihazdaki kayıtlarımı da sil" checked={wipeLocal} onChange={setWipeLocal} />
          </>
        )}
        <p className="mt-3">
          Onaylamak için aşağıya <strong className="text-ink">{word}</strong> yazın.
        </p>
        <Field label="Onay" htmlFor="danger-confirm" className="mt-2">
          <Input id="danger-confirm" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
        </Field>
      </ConfirmDialog>
    </Card>
  )
}
