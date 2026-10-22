import { useLiveQuery } from 'dexie-react-hooks'
import { Cloud, CloudOff, Copy, Crown, KeyRound, Link2, LogOut, RefreshCw, Share2, UserMinus, Users } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { PageHeader } from '../components/AppShell'
import { ConfirmDialog, Modal } from '../components/ui/Modal'
import { Alert, Badge, Button, Card, Field, Input, More } from '../components/ui/primitives'
import { buildInviteLink, envCloudConfig, validateCloudConfig } from '../cloud/config'
import { cloudErrorMessage } from '../cloud/errors'
import { leaveGroup, shareGroup } from '../cloud/sync'
import type { CloudGroup } from '../cloud/types'
import { toUserMessage, UserFacingError } from '../data/repository'
import type { SpendGroup } from '../domain/types'
import { useCloud, useMembers } from '../state/cloud'
import { useData } from '../state/data'
import { useUi } from '../state/ui'
import { tt, ttf } from '../lib/i18n'

export const SETUP_GUIDE_URL = 'https://github.com/ahestetey-coder/Harcama-atlas-/blob/main/BULUT-KURULUM.md'

function errText(e: unknown): string {
  return e instanceof UserFacingError ? e.message : cloudErrorMessage(e)
}

export default function MembersPage() {
  const cloud = useCloud()
  const { isDemo } = useData()
  return (
    <div>
      <PageHeader title={tt('Üyeler ve paylaşım')} subtitle={tt('Grupları üyelerle paylaşın')} />
      {isDemo ? (
        <Alert tone="warning" title={tt('Demo modunda paylaşım kapalı')}>
          {tt('Paylaşım gerçek verilerinizle çalışır. Demo modunu kapatıp tekrar deneyin.')}
        </Alert>
      ) : cloud.config === undefined ? null : !cloud.config ? (
        <ConfigCard />
      ) : (
        <div className="flex flex-col gap-4">
          <ProfileCard />
          {cloud.status === 'loading' ? null : cloud.status === 'signed-out' ? <AuthCard /> : <SessionCard />}
          {cloud.status !== 'signed-out' && cloud.status !== 'loading' && <GroupsCard />}
          <ConfigFooter />
        </div>
      )}
    </div>
  )
}

/** Supabase proje adresi ve herkese açık anahtar. */
export function ConfigCard() {
  const cloud = useCloud()
  const [url, setUrl] = useState('')
  const [key, setKey] = useState('')
  const [error, setError] = useState<string>()
  const save = async (e: FormEvent) => {
    e.preventDefault()
    const err = validateCloudConfig({ url, anonKey: key })
    setError(err ?? undefined)
    if (!err) await cloud.saveConfig({ url, anonKey: key })
  }
  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 font-display text-base font-semibold">
        <CloudOff className="size-5 text-muted" /> {tt('Bulut bağlantısı kurulmamış')}
      </h2>
      <p className="mt-2 text-sm text-muted">{tt('Paylaşım için ücretsiz bir Supabase projesi gerekir.')}</p>
      <More>
        {tt('Kurulum bir kez yapılır; adımlar')}{' '}
        <a href={SETUP_GUIDE_URL} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
          {tt('kurulum rehberinde')}
        </a>
        {tt('. Davet bağlantısı geldiyse yalnızca onu açmanız yeterli.')}
      </More>
      <form onSubmit={save} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={tt('Proje adresi (Project URL)')} htmlFor="cloud-url">
          <Input id="cloud-url" placeholder="https://abcd.supabase.co" value={url} onChange={(e) => setUrl(e.target.value)} autoComplete="off" />
        </Field>
        <Field label={tt('Herkese açık anahtar (anon public key)')} htmlFor="cloud-key">
          <Input id="cloud-key" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" />
        </Field>
        {error && <p className="text-[13px] font-medium text-danger sm:col-span-2">{error}</p>}
        <div className="sm:col-span-2">
          <Button type="submit" variant="primary" icon={<Cloud className="size-4" />}>
            {tt('Bağlan')}
          </Button>
        </div>
      </form>
      <p className="mt-3 text-[12.5px] text-subtle">{tt('Gizli “service_role” anahtarını asla girmeyin.')}</p>
    </Card>
  )
}

function ProfileCard() {
  const { repo } = useData()
  const { map, selfId } = useMembers()
  const cloud = useCloud()
  const { toast } = useUi()
  const self = selfId ? map.get(selfId) : undefined
  const [name, setName] = useState('')
  const [last, setLast] = useState<string | null>(null)
  if ((self?.name ?? '') !== last) {
    setLast(self?.name ?? '')
    setName(self?.name === 'Ben' ? '' : (self?.name ?? ''))
  }
  const save = async (e: FormEvent) => {
    e.preventDefault()
    const n = name.trim()
    if (!n || !selfId) return
    await repo.db.members.update(selfId, { name: n.slice(0, 40), updatedAt: new Date().toISOString() })
    if (cloud.backend?.userId()) {
      const groups = (await repo.db.groups.toArray()).filter((g) => g.cloudId)
      for (const g of groups) await cloud.backend.setDisplayName(g.cloudId!, n).catch(() => {})
    }
    toast(tt('Adınız kaydedildi.'))
  }
  return (
    <Card className="p-5">
      <form onSubmit={save} className="flex flex-wrap items-end gap-3">
        <Field label={tt('Adınız (grup üyeleri sizi bu adla görür)')} htmlFor="self-name" className="min-w-[220px] flex-1">
          <Input id="self-name" value={name} maxLength={40} placeholder={tt('Ör. Osman')} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button type="submit" disabled={!name.trim() || name.trim() === self?.name}>
          {tt('Kaydet')}
        </Button>
      </form>
    </Card>
  )
}

export function AuthCard({ intro }: { intro?: string }) {
  const cloud = useCloud()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [info, setInfo] = useState<string>()
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(undefined)
    setInfo(undefined)
    try {
      if (mode === 'in') await cloud.signIn(email, password)
      else if (!(await cloud.signUp(email, password))) setInfo(tt('Hesap oluşturuldu. E-postanıza gelen doğrulama bağlantısına tıklayın, sonra buradan giriş yapın.'))
    } catch (err) {
      setError(errText(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 font-display text-base font-semibold">
        <KeyRound className="size-5 text-accent" /> {mode === 'in' ? tt('Giriş yapın') : tt('Hesap oluşturun')}
      </h2>
      <p className="mt-1 text-sm text-muted">{intro ?? tt('Paylaşım için bir hesap gerekir.')}</p>
      <form onSubmit={submit} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={tt('E-posta')} htmlFor="auth-email">
          <Input id="auth-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label={tt('Parola')} htmlFor="auth-password" hint={mode === 'up' ? tt('En az 6 karakter, banka parolası olmasın.') : undefined}>
          <Input id="auth-password" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        </Field>
        {error && <p className="text-[13px] font-medium text-danger sm:col-span-2" role="alert">{error}</p>}
        {info && <p className="text-[13px] font-medium text-accent sm:col-span-2">{info}</p>}
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" variant="primary" loading={busy}>
            {mode === 'in' ? tt('Giriş yap') : tt('Hesap oluştur')}
          </Button>
          <button type="button" className="text-sm font-medium text-accent hover:underline" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
            {mode === 'in' ? tt('Hesabım yok, oluştur') : tt('Hesabım var, giriş yap')}
          </button>
        </div>
      </form>
    </Card>
  )
}

function SessionCard() {
  const cloud = useCloud()
  const last = cloud.lastSync ? cloud.lastSync.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : null
  return (
    <Card className="flex flex-wrap items-center gap-3 p-4">
      <Cloud className="size-5 text-accent" />
      <div className="min-w-0 flex-1 text-sm">
        <div className="truncate font-medium text-ink">{cloud.email}</div>
        <div className="text-[12.5px] text-muted" aria-live="polite">
          {cloud.status === 'syncing' ? tt('Eşitleniyor…') : cloud.lastError ? <span className="text-danger">{cloud.lastError}</span> : last ? ttf('Otomatik eşitleniyor · son {0}', last) : tt('Otomatik eşitleniyor')}
        </div>
      </div>
      {cloud.lastError && cloud.status !== 'syncing' && (
        <Button size="sm" icon={<RefreshCw className="size-4" />} onClick={() => void cloud.sync()}>
          {tt('Tekrar dene')}
        </Button>
      )}
      <Button size="sm" variant="ghost" icon={<LogOut className="size-4" />} onClick={() => void cloud.signOut()}>
        {tt('Çıkış')}
      </Button>
    </Card>
  )
}

function GroupsCard() {
  const { repo } = useData()
  const cloud = useCloud()
  const { members, selfId } = useMembers()
  const { toast } = useUi()
  const groups = useLiveQuery(() => repo.db.groups.orderBy('order').toArray(), [repo])
  const [cloudGroups, setCloudGroups] = useState<Map<string, CloudGroup>>(new Map())
  const [busy, setBusy] = useState<string | null>(null)
  const [invite, setInvite] = useState<{ group: SpendGroup; link: string } | null>(null)
  const [leave, setLeave] = useState<SpendGroup | null>(null)
  const [kick, setKick] = useState<{ group: SpendGroup; memberId: string; name: string } | null>(null)

  const linkedKey = (groups ?? []).map((g) => g.cloudId ?? '').join(',')
  useEffect(() => {
    if (!cloud.backend?.userId()) return
    cloud.backend
      .listGroups()
      .then((list) => setCloudGroups(new Map(list.map((g) => [g.id, g]))))
      .catch(() => {})
  }, [cloud.backend, linkedKey, cloud.lastSync])

  if (!groups) return null
  const visible = groups.filter((g) => !g.archived || g.cloudId)

  const run = async (id: string, f: () => Promise<void>) => {
    setBusy(id)
    try {
      await f()
    } catch (e) {
      toast(errText(e), { kind: 'error' })
    } finally {
      setBusy(null)
    }
  }

  const share = (g: SpendGroup) =>
    run(g.id, async () => {
      await shareGroup(repo, cloud.backend!, g.id)
      await cloud.sync()
      toast(ttf('“{0}” paylaşıma açıldı. Şimdi üye davet edebilirsiniz.', g.name))
    })

  const makeInvite = (g: SpendGroup) =>
    run(g.id, async () => {
      const code = await cloud.backend!.createInvite(g.cloudId!)
      const self = members.find((m) => m.id === selfId)
      const link = buildInviteLink(window.location.href, { url: cloud.config!.url, key: cloud.config!.anonKey, code, group: g.name, from: self?.name ?? '' })
      setInvite({ group: g, link })
    })

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <Users className="size-5 text-accent" /> {tt('Gruplar ve üyeler')}
        </h2>
        <p className="mt-1 text-[13px] text-muted">{tt('Paylaşılan gruptaki harcamaları bütün üyeler görür.')}</p>
        <More>{tt('Herkes yalnızca kendi harcamasını ekler, düzenler ve siler. Diğer kayıtlarınızı üyeler görmez.')}</More>
      </div>
      <ul>
        {visible.map((g) => {
          const shared = !!g.cloudId
          const cg = g.cloudId ? cloudGroups.get(g.cloudId) : undefined
          const isOwner = !!cg && cg.owner_id === selfId
          const groupMembers = members.filter((m) => m.groupIds.includes(g.id) && (shared || m.id === selfId))
          return (
            <li key={g.id} className="border-b border-line px-5 py-4 last:border-b-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="size-3 rounded-full" style={{ backgroundColor: g.color }} aria-hidden />
                <span className="font-semibold text-ink">{g.name}</span>
                {shared ? <Badge tone="accent">{tt('Paylaşılıyor')}</Badge> : <Badge>{tt('Yalnızca bu cihaz')}</Badge>}
                <div className="ml-auto flex flex-wrap gap-2">
                  {shared ? (
                    <>
                      <Button size="sm" variant="primary" icon={<Link2 className="size-4" />} loading={busy === g.id} onClick={() => makeInvite(g)}>
                        {tt('Üye davet et')}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setLeave(g)}>
                        {tt('Paylaşımdan ayrıl')}
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" icon={<Share2 className="size-4" />} loading={busy === g.id} onClick={() => share(g)}>
                      {tt('Paylaşıma aç')}
                    </Button>
                  )}
                </div>
              </div>
              {shared && (
                <ul className="mt-3 flex flex-wrap gap-2" aria-label={ttf('{0} üyeleri', g.name)}>
                  {groupMembers.map((m) => (
                    <li key={m.id} className="inline-flex items-center gap-1.5 rounded-full border border-line py-1 pl-2.5 pr-1.5 text-[13px]">
                      <span className="size-2 rounded-full" style={{ backgroundColor: m.color }} aria-hidden />
                      {m.id === selfId ? `${m.name} (siz)` : m.name}
                      {cg?.owner_id === m.id && <Crown className="size-3.5 text-warning" aria-label={tt('Grubu açan')} />}
                      {isOwner && m.id !== selfId && (
                        <button type="button" aria-label={ttf('{0} üyesini çıkar', m.name)} className="grid size-6 place-items-center rounded-full text-subtle hover:bg-surface-2 hover:text-danger" onClick={() => setKick({ group: g, memberId: m.id, name: m.name })}>
                          <UserMinus className="size-3.5" />
                        </button>
                      )}
                    </li>
                  ))}
                  {groupMembers.length <= 1 && <li className="self-center text-[12.5px] text-subtle">{tt('Henüz başka üye yok.')}</li>}
                </ul>
              )}
            </li>
          )
        })}
      </ul>

      <Modal
        open={!!invite}
        onOpenChange={(o) => !o && setInvite(null)}
        title={ttf('“{0}” için davet bağlantısı', invite?.group.name)}
        description={tt('7 gün geçerlidir; bağlantıyı alan herkes katılabilir.')}
        footer={
          <>
            {typeof navigator.share === 'function' && (
              <Button icon={<Share2 className="size-4" />} onClick={() => navigator.share({ title: tt('Harcama Atlası daveti'), text: ttf('“{0}” grubuna katıl', invite!.group.name), url: invite!.link }).catch(() => {})}>
                {tt('Paylaş')}
              </Button>
            )}
            <Button
              variant="primary"
              icon={<Copy className="size-4" />}
              onClick={() =>
                navigator.clipboard
                  .writeText(invite!.link)
                  .then(() => toast(tt('Bağlantı kopyalandı.')))
                  .catch(() => toast(tt('Kopyalanamadı; bağlantıyı elle seçip kopyalayın.'), { kind: 'error' }))
              }
            >
              {tt('Kopyala')}
            </Button>
          </>
        }
      >
        <textarea readOnly value={invite?.link ?? ''} aria-label={tt('Davet bağlantısı')} className="h-28 w-full resize-none rounded-xl border border-line bg-surface-2 p-3 font-mono text-base text-ink sm:text-[12px]" onFocus={(e) => e.currentTarget.select()} />
        <p className="mt-2 text-[12.5px] text-subtle">{tt('Bağlantıda harcama bilgisi yoktur.')}</p>
      </Modal>

      <ConfirmDialog
        open={!!leave}
        onOpenChange={(o) => !o && setLeave(null)}
        title={ttf('“{0}” paylaşımından ayrılınsın mı?', leave?.name)}
        confirmLabel={tt('Ayrıl')}
        danger
        onConfirm={() =>
          leave &&
          run(leave.id, async () => {
            await leaveGroup(repo, cloud.backend!, leave.id)
            setLeave(null)
            toast(tt('Paylaşımdan ayrıldınız. Kendi kayıtlarınız bu cihazda duruyor.'))
          })
        }
      >
        {tt('Buluttaki kendi harcamalarınız silinir, diğer üyelerin harcamaları bu cihazdan kaldırılır. Bu cihazdaki kendi kayıtlarınız silinmez.')}
      </ConfirmDialog>

      <ConfirmDialog
        open={!!kick}
        onOpenChange={(o) => !o && setKick(null)}
        title={ttf('{0} gruptan çıkarılsın mı?', kick?.name)}
        confirmLabel={tt('Çıkar')}
        danger
        onConfirm={() =>
          kick &&
          run(kick.group.id, async () => {
            await cloud.backend!.removeMember(kick.group.cloudId!, kick.memberId)
            setKick(null)
            await cloud.sync()
            toast(ttf('{0} gruptan çıkarıldı.', kick.name))
          })
        }
      >
        {tt('Bu üyenin gruptaki harcamaları buluttan ve diğer cihazlardan silinir. Kendi cihazındaki kayıtları silinmez.')}
      </ConfirmDialog>
    </Card>
  )
}

function ConfigFooter() {
  const cloud = useCloud()
  const [open, setOpen] = useState(false)
  // Uygulamayla gelen hazır bulut ayarı kaldırılamaz (kaldırılsa da yeniden okunur).
  const builtIn = cloud.config?.url === envCloudConfig()?.url
  return (
    <p className="px-1 text-[12.5px] text-subtle">
      {tt('Bulut:')} {cloud.config ? new URL(cloud.config.url).host : '—'}
      {!builtIn && (
        <>
          {' · '}
          <button type="button" className="font-medium text-accent hover:underline" onClick={() => setOpen(true)}>
            {tt('Bulut bağlantısını kaldır')}
          </button>
        </>
      )}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={tt('Bulut bağlantısı kaldırılsın mı?')}
        confirmLabel={tt('Kaldır')}
        danger
        onConfirm={async () => {
          try {
            await cloud.saveConfig(null)
          } catch (e) {
            void toUserMessage(e)
          }
          setOpen(false)
        }}
      >
        {tt('Oturumunuz kapanır ve eşitleme durur. Buluttaki veriler silinmez; tekrar bağlanınca eşitleme kaldığı yerden sürer.')}
      </ConfirmDialog>
    </p>
  )
}
