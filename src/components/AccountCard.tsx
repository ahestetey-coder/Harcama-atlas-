import { LogOut, UserRound } from 'lucide-react'
import { useAuth } from '../state/auth'
import { Button, Card } from './ui/primitives'

/** Ayarlar'da giriş yapan hesabın bilgisi ve çıkış ("Hesabımı sil" sayfanın en altında). */
export function AccountCard() {
  const auth = useAuth()
  const user = auth.user
  if (!auth.enabled || !user) return null
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
      </div>
    </Card>
  )
}
