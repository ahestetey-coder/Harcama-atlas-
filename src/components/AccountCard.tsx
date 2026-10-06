import { LogOut, Trash2, UserRound } from 'lucide-react'
import { useState } from 'react'
import { toUserMessage } from '../data/repository'
import { useAuth } from '../state/auth'
import { clearLocalAccountData } from '../state/data'
import { useUi } from '../state/ui'
import { ConfirmDialog } from './ui/Modal'
import { Button, Card, Checkbox, Field, Input } from './ui/primitives'

/** Ayarlar'da giriş yapan hesabın bilgisi, çıkış ve "Hesabımı sil". */
export function AccountCard() {
  const auth = useAuth()
  const { toast } = useUi()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [wipeLocal, setWipeLocal] = useState(true)
  const [busy, setBusy] = useState(false)
  const user = auth.user
  if (!auth.enabled || !user) return null

  const remove = async () => {
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
        <UserRound className="size-5 text-accent" /> Hesap
      </h2>
      <p className="mt-1 text-sm text-muted">
        {user.name ? `${user.name} · ` : ''}
        {user.email}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button icon={<LogOut className="size-4" />} onClick={() => void auth.signOut()}>
          Çıkış yap
        </Button>
        <Button className="text-danger" icon={<Trash2 className="size-4" />} onClick={() => setOpen(true)}>
          Hesabımı sil
        </Button>
      </div>
      <ConfirmDialog
        open={open}
        onOpenChange={(o) => {
          if (busy) return
          setOpen(o)
          if (!o) setText('')
        }}
        title="Hesabınız silinsin mi?"
        confirmLabel="Hesabımı kalıcı olarak sil"
        danger
        loading={busy}
        confirmDisabled={text.trim().toLocaleUpperCase('tr-TR') !== 'SİL'}
        onConfirm={() => void remove()}
      >
        <p>
          Hesabınız ve buluttaki verileriniz kalıcı olarak silinir: yöneticisi olduğunuz ortak gruplar (içindeki herkesin harcamalarıyla), diğer gruplara
          eklediğiniz harcamalar, üyelikleriniz ve davetleriniz. Bu işlem geri alınamaz.
        </p>
        <Checkbox className="mt-3" label="Bu cihazdaki kayıtlarımı da sil" checked={wipeLocal} onChange={setWipeLocal} />
        <p className="mt-3">
          Onaylamak için aşağıya <strong className="text-ink">SİL</strong> yazın.
        </p>
        <Field label="Onay" htmlFor="delete-account-confirm" className="mt-2">
          <Input id="delete-account-confirm" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
        </Field>
      </ConfirmDialog>
    </Card>
  )
}
