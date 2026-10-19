import { ArrowRight, Ban, BookOpenCheck, CheckCircle2, KeyRound, Lock, MailCheck, RefreshCw, Search, ShieldCheck, Trash2, UserCheck, Users, UserX } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/AppShell'
import { Link } from 'react-router-dom'
import { ConfirmDialog, Modal } from '../components/ui/Modal'
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Segmented, Select, Skeleton } from '../components/ui/primitives'
import { AdminNotInstalledError, confirmEmail, deleteUser, isBanned, listUsers, sendPasswordReset, setBanned, setPlan, type AccountPlan, type AdminUser } from '../cloud/admin'
import { cloudErrorMessage } from '../cloud/errors'
import { cn } from '../lib/cn'
import { useIsAdmin } from '../state/admin'
import { appBaseUrl, useAuth } from '../state/auth'
import { useUi } from '../state/ui'

type View = 'all' | 'active' | 'banned' | 'unconfirmed'
type Action = 'reset' | 'ban' | 'unban' | 'confirm' | 'delete'

const DAY = 86_400_000

export default function AdminPage() {
  const auth = useAuth()
  const admin = useIsAdmin()

  if (!auth.enabled) {
    return (
      <div>
        <PageHeader title="Yönetici paneli" />
        <Alert tone="info" title="Hesap sunucusu yok">
          Yönetici paneli yalnızca hesapla giriş yapılan yayındaki sürümde çalışır.
        </Alert>
      </div>
    )
  }
  if (!admin) {
    return (
      <div>
        <PageHeader title="Yönetici paneli" />
        <Card>
          <EmptyState icon={<Lock className="size-6" />} title="Bu sayfa yalnızca yöneticiye açık">
            Hesabınızın yönetici yetkisi yok.
          </EmptyState>
        </Card>
      </div>
    )
  }
  return <AdminConsole />
}

function AdminConsole() {
  const { backend, user: me } = useAuth()
  const { toast } = useUi()
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [view, setView] = useState<View>('all')
  const [selected, setSelected] = useState<AdminUser | null>(null)
  const [pending, setPending] = useState<{ action: Action; user: AdminUser } | null>(null)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async () => {
    if (!backend) return
    setLoading(true)
    try {
      setUsers(await listUsers(backend.client))
      setNow(Date.now())
      setError(undefined)
    } catch (e) {
      setError(e instanceof AdminNotInstalledError ? e.message : cloudErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [backend])

  useEffect(() => {
    if (!backend) return
    let alive = true
    listUsers(backend.client)
      .then((u) => alive && setUsers(u))
      .catch((e) => alive && setError(e instanceof AdminNotInstalledError ? e.message : cloudErrorMessage(e)))
    return () => {
      alive = false
    }
  }, [backend])

  const stats = useMemo(() => {
    const list = users ?? []
    return {
      total: list.length,
      newWeek: list.filter((u) => now - new Date(u.created_at).getTime() < 7 * DAY).length,
      activeWeek: list.filter((u) => u.last_sign_in_at && now - new Date(u.last_sign_in_at).getTime() < 7 * DAY).length,
      banned: list.filter((u) => isBanned(u, now)).length,
    }
  }, [users, now])

  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr')
    return (users ?? []).filter((u) => {
      if (view === 'active' && isBanned(u, now)) return false
      if (view === 'banned' && !isBanned(u, now)) return false
      if (view === 'unconfirmed' && u.email_confirmed_at) return false
      if (q && !`${u.full_name ?? ''} ${u.email ?? ''}`.toLocaleLowerCase('tr').includes(q)) return false
      return true
    })
  }, [users, query, view, now])

  const run = async () => {
    if (!pending || !backend) return
    const { action, user } = pending
    setBusy(true)
    try {
      if (action === 'reset') {
        if (!user.email) throw new Error('Bu hesabın e-postası yok.')
        await sendPasswordReset(backend.client, user.email, appBaseUrl())
        toast(`${user.email} adresine şifre yenileme bağlantısı gönderildi.`)
      } else if (action === 'ban' || action === 'unban') {
        await setBanned(backend.client, user.id, action === 'ban')
        toast(action === 'ban' ? 'Hesap donduruldu; oturumları kapatıldı.' : 'Hesabın dondurulması kaldırıldı.')
      } else if (action === 'confirm') {
        await confirmEmail(backend.client, user.id)
        toast('E-posta doğrulandı olarak işaretlendi.')
      } else {
        await deleteUser(backend.client, user.id)
        toast('Hesap ve buluttaki verileri silindi.')
      }
      setPending(null)
      setSelected(null)
      await load()
    } catch (e) {
      toast(cloudErrorMessage(e), { kind: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Yönetici paneli"
        subtitle="Kayıtlı hesaplar ve hesap işlemleri"
        actions={
          <Button icon={<RefreshCw className={cn('size-4', loading && 'animate-spin')} />} onClick={() => void load()} disabled={loading}>
            Yenile
          </Button>
        }
      />

      {error ? (
        <Alert tone="danger" title="Kullanıcılar alınamadı">
          {error}
        </Alert>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat icon={<Users />} label="Toplam hesap" value={stats.total} loading={!users} />
            <Stat icon={<UserCheck />} label="Son 7 günde yeni" value={stats.newWeek} loading={!users} />
            <Stat icon={<CheckCircle2 />} label="Son 7 günde giriş" value={stats.activeWeek} loading={!users} />
            <Stat icon={<Ban />} label="Dondurulmuş" value={stats.banned} loading={!users} tone={stats.banned ? 'danger' : undefined} />
          </div>

          <Alert tone="info" icon={<KeyRound />} className="mb-4">
            Şifreler geri çevrilemez biçimde (hash) saklanır; yönetici dahil kimse göremez veya değiştiremez. Bir kullanıcı şifresini unuttuysa ona şifre yenileme e-postası gönderebilirsiniz.
          </Alert>

          <Card className="overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-line p-3 sm:flex-row sm:items-center sm:p-4">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
                <Input aria-label="Ad veya e-postada ara" placeholder="Ad veya e-posta ara…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" type="search" />
              </div>
              <Segmented<View>
                label="Hesap durumu"
                value={view}
                onChange={setView}
                className="no-scrollbar max-sm:w-full max-sm:overflow-x-auto"
                options={[
                  { value: 'all', label: 'Tümü' },
                  { value: 'active', label: 'Etkin' },
                  { value: 'banned', label: 'Dondurulmuş' },
                  { value: 'unconfirmed', label: 'Onaysız' },
                ]}
              />
            </div>
            {!users ? (
              <div className="space-y-3 p-4">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : shown.length === 0 ? (
              <EmptyState icon={<Search className="size-6" />} title="Eşleşen hesap yok" />
            ) : (
              <ul aria-label="Kullanıcılar">
                {shown.map((u) => (
                  <UserRow key={u.id} u={u} self={u.id === me?.id} now={now} onOpen={() => setSelected(u)} />
                ))}
              </ul>
            )}
          </Card>
          <Card className="mt-4 p-4 sm:p-5" aria-label="Araştırma ajanı">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold">
              <BookOpenCheck className="size-5 text-accent" /> Ortak ekonomi araştırma ajanı
            </h2>
            <p className="mt-1 text-[13px] text-muted">Kaynaklar ve uzmanlar, yayın takvimi, rapor taslaklarının onayı, kullanım limitleri ve kalite ölçümleri.</p>
            <Link to="/yonetim/arastirma" className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-accent hover:underline">
              Araştırma ajanını yönet <ArrowRight className="size-4" />
            </Link>
          </Card>
        </>
      )}

      <UserModal
        key={selected?.id ?? 'yok'}
        user={selected}
        self={selected?.id === me?.id}
        now={now}
        onClose={() => setSelected(null)}
        onAction={(action) => selected && setPending({ action, user: selected })}
        onPlan={async (plan, expires) => {
          if (!backend || !selected) return
          try {
            await setPlan(backend.client, selected.id, plan, expires)
            toast(plan === 'free' ? 'Paket kaldırıldı; hesap Ücretsiz.' : `${plan === 'plus' ? 'Plus' : 'Plus+'} tanımlandı. Kişi uygulamayı yenileyince açılır.`)
            const fresh = await listUsers(backend.client)
            setUsers(fresh)
            setSelected(fresh.find((u) => u.id === selected.id) ?? null)
          } catch (e) {
            toast(e instanceof AdminNotInstalledError ? 'Paket tanımlama veritabanına henüz eklenmemiş (paket-tanimlama.sql).' : cloudErrorMessage(e), { kind: 'error' })
          }
        }}
      />

      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => !o && !busy && setPending(null)}
        title={pending ? CONFIRM_TITLE[pending.action] : ''}
        confirmLabel={pending ? CONFIRM_LABEL[pending.action] : ''}
        danger={pending?.action === 'delete' || pending?.action === 'ban'}
        loading={busy}
        onConfirm={() => void run()}
      >
        {pending && <ConfirmBody action={pending.action} user={pending.user} />}
      </ConfirmDialog>
    </div>
  )
}

const CONFIRM_TITLE: Record<Action, string> = {
  reset: 'Şifre yenileme e-postası gönderilsin mi?',
  ban: 'Hesap dondurulsun mu?',
  unban: 'Dondurma kaldırılsın mı?',
  confirm: 'E-posta doğrulansın mı?',
  delete: 'Hesap silinsin mi?',
}
const CONFIRM_LABEL: Record<Action, string> = { reset: 'Gönder', ban: 'Dondur', unban: 'Kaldır', confirm: 'Doğrula', delete: 'Kalıcı olarak sil' }

function ConfirmBody({ action, user }: { action: Action; user: AdminUser }) {
  const who = <strong className="text-ink">{user.email ?? user.full_name ?? 'Bu kullanıcı'}</strong>
  if (action === 'reset') return <p>{who} adresine şifre belirleme bağlantısı gider. Supabase'in ücretsiz e-posta gönderimi saatte birkaç e-postayla sınırlıdır.</p>
  if (action === 'ban') return <p>{who} giriş yapamaz ve açık oturumları kapatılır. Verileri silinmez; dondurmayı istediğiniz zaman kaldırabilirsiniz.</p>
  if (action === 'unban') return <p>{who} yeniden giriş yapabilir.</p>
  if (action === 'confirm') return <p>{who} doğrulama e-postasını açmadan giriş yapabilir.</p>
  return (
    <p>
      {who} hesabı, sahibi olduğu ortak gruplar ve gruplara eklediği harcamalar buluttan kalıcı olarak silinir. Bu işlem geri alınamaz. Kişinin kendi cihazındaki yerel kayıtlar silinmez.
    </p>
  )
}

function Stat({ icon, label, value, loading, tone }: { icon: React.ReactNode; label: string; value: number; loading: boolean; tone?: 'danger' }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-[12.5px] font-medium text-muted">
        <span className={cn('grid size-7 place-items-center rounded-lg bg-accent-soft text-accent [&>svg]:size-4', tone === 'danger' && 'bg-danger-soft text-danger')}>{icon}</span>
        {label}
      </div>
      {loading ? <Skeleton className="mt-3 h-7 w-12" /> : <div className="num mt-2 font-display text-[26px] font-bold leading-none text-ink">{value}</div>}
    </Card>
  )
}

function initials(u: AdminUser): string {
  const base = (u.full_name || u.email || '?').trim()
  const parts = base.split(/[\s@._-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 && u.full_name ? parts[1][0] : '')).toLocaleUpperCase('tr')
}

function relative(iso: string | null, now: number): string {
  if (!iso) return 'hiç'
  const diff = now - new Date(iso).getTime()
  if (diff < 60_000) return 'az önce'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} dk önce`
  if (diff < DAY) return `${Math.floor(diff / 3_600_000)} sa önce`
  if (diff < 30 * DAY) return `${Math.floor(diff / DAY)} gün önce`
  return dateText(iso)
}

function dateText(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function activePlan(u: AdminUser, now: number): AccountPlan {
  return u.plan && (!u.plan.expires_at || Date.parse(u.plan.expires_at) > now) ? u.plan.plan : 'free'
}

function StatusBadges({ u, now }: { u: AdminUser; now: number }) {
  const plan = activePlan(u, now)
  return (
    <>
      {plan !== 'free' && <Badge tone="teal">{plan === 'plus' ? 'Plus' : 'Plus+'}</Badge>}
      {u.is_admin && (
        <Badge tone="accent">
          <ShieldCheck className="size-3" /> Yönetici
        </Badge>
      )}
      {isBanned(u, now) && <Badge tone="danger">Dondurulmuş</Badge>}
      {!u.email_confirmed_at && <Badge tone="warning">E-posta onaysız</Badge>}
      <Badge>{u.provider === 'google' ? 'Google' : u.provider === 'email' ? 'E-posta' : u.provider}</Badge>
    </>
  )
}

function UserRow({ u, self, now, onOpen }: { u: AdminUser; self: boolean; now: number; onOpen: () => void }) {
  return (
    <li className="border-b border-line last:border-b-0">
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2" aria-label={`${u.full_name ?? u.email ?? 'Kullanıcı'} ayrıntıları`}>
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-[13px] font-semibold text-white', isBanned(u, now) && 'from-slate-400 to-slate-500')} aria-hidden>
          {initials(u)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-medium text-ink">{u.full_name ?? u.email ?? 'Adsız'}</span>
            {self && <span className="shrink-0 text-[12px] text-subtle">(siz)</span>}
          </span>
          {u.full_name && <span className="block truncate text-[12.5px] text-muted">{u.email}</span>}
          <span className="mt-1 flex flex-wrap items-center gap-1.5 sm:hidden">
            <StatusBadges u={u} now={now} />
          </span>
        </span>
        <span className="hidden flex-wrap items-center justify-end gap-1.5 sm:flex">
          <StatusBadges u={u} now={now} />
        </span>
        <span className="num hidden w-[120px] shrink-0 text-right text-[12.5px] text-muted md:block">
          <span className="block text-subtle">Son giriş</span>
          {relative(u.last_sign_in_at, now)}
        </span>
      </button>
    </li>
  )
}

function UserModal({
  user,
  self,
  now,
  onClose,
  onAction,
  onPlan,
}: {
  user: AdminUser | null
  self: boolean
  now: number
  onClose: () => void
  onAction: (a: Action) => void
  onPlan: (plan: AccountPlan, expiresAt: string | null) => Promise<void>
}) {
  const banned = user ? isBanned(user, now) : false
  const current = user ? activePlan(user, now) : 'free'
  const [plan, setPlanSel] = useState<AccountPlan>(current)
  const [until, setUntil] = useState(user?.plan?.expires_at && current !== 'free' ? user.plan.expires_at.slice(0, 10) : '')
  const [saving, setSaving] = useState(false)
  const locked = self || !!user?.is_admin
  return (
    <Modal open={!!user} onOpenChange={(o) => !o && onClose()} title={user?.full_name ?? user?.email ?? 'Kullanıcı'} description={user?.full_name ? (user.email ?? undefined) : undefined} size="md">
      {user && (
        <div className="flex flex-col gap-4 pb-2">
          <div className="flex flex-wrap gap-1.5">
            <StatusBadges u={user} now={now} />
          </div>
          <dl className="grid grid-cols-2 gap-3 rounded-2xl border border-line bg-surface-2 p-4 text-[13px]">
            <Info label="Kayıt" value={dateText(user.created_at)} />
            <Info label="Son giriş" value={relative(user.last_sign_in_at, now)} />
            <Info label="Ortak grup" value={String(user.group_count)} />
            <Info label="Ortak harcama" value={String(user.shared_tx_count)} />
          </dl>
          <form
            aria-label="Paket tanımlama"
            className="grid gap-2 rounded-2xl border border-line p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            onSubmit={async (e) => {
              e.preventDefault()
              setSaving(true)
              await onPlan(plan, plan !== 'free' && until ? new Date(`${until}T23:59:59`).toISOString() : null)
              setSaving(false)
            }}
          >
            <Field label="Paket" htmlFor="kullanici-paket">
              <Select id="kullanici-paket" value={plan} onChange={(e) => setPlanSel(e.target.value as AccountPlan)}>
                <option value="free">Ücretsiz</option>
                <option value="plus">Plus</option>
                <option value="plusplus">Plus+</option>
              </Select>
            </Field>
            <Field label="Bitiş" htmlFor="kullanici-paket-bitis" optional>
              <Input id="kullanici-paket-bitis" type="date" value={until} disabled={plan === 'free'} onChange={(e) => setUntil(e.target.value)} />
            </Field>
            <Button type="submit" variant="primary" loading={saving}>
              Paketi kaydet
            </Button>
            <p className="text-[12px] text-subtle sm:col-span-3">Mağaza ödemesi bağlanana kadar paketleri buradan tanımlarsınız. Bitiş boşsa süresizdir.</p>
          </form>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button icon={<KeyRound className="size-4" />} onClick={() => onAction('reset')} disabled={!user.email}>
              Şifre yenileme e-postası
            </Button>
            {!user.email_confirmed_at && (
              <Button icon={<MailCheck className="size-4" />} onClick={() => onAction('confirm')}>
                E-postayı doğrula
              </Button>
            )}
            {banned ? (
              <Button icon={<UserCheck className="size-4" />} onClick={() => onAction('unban')} disabled={locked}>
                Dondurmayı kaldır
              </Button>
            ) : (
              <Button icon={<UserX className="size-4" />} onClick={() => onAction('ban')} disabled={locked}>
                Hesabı dondur
              </Button>
            )}
            <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => onAction('delete')} disabled={locked}>
              Hesabı sil
            </Button>
          </div>
          {locked && <p className="text-[12.5px] text-subtle">{self ? 'Kendi hesabınızı buradan donduramaz veya silemezsiniz.' : 'Yönetici hesapları dondurulamaz veya silinemez.'}</p>}
        </div>
      )}
    </Modal>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] text-subtle">{label}</dt>
      <dd className="num mt-0.5 font-medium text-ink">{value}</dd>
    </div>
  )
}
