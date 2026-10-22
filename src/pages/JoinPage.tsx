import { Cloud, UserPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/AppShell'
import { Alert, Button, Card, Field, Input, More } from '../components/ui/primitives'
import { parseInvite } from '../cloud/config'
import { cloudErrorMessage } from '../cloud/errors'
import { joinWithInvite } from '../cloud/sync'
import { UserFacingError } from '../data/repository'
import { useCloud, useMembers } from '../state/cloud'
import { useData } from '../state/data'
import { useUi } from '../state/ui'
import { AuthCard } from './MembersPage'
import { tt, ttf } from '../lib/i18n'

/** Davet bağlantısı (#/katil?d=…): bulut ayarını alır, oturum açtırır ve gruba katar. */
export default function JoinPage() {
  const [params] = useSearchParams()
  const invite = parseInvite(params.get('d'))
  const cloud = useCloud()
  const { isDemo } = useData()

  if (!invite) {
    return (
      <div>
        <PageHeader title={tt('Gruba katıl')} />
        <Alert tone="danger" title={tt('Davet bağlantısı okunamadı')}>
          {tt('Davet edenden yeni bir bağlantı isteyin.')}
        </Alert>
      </div>
    )
  }

  const host = hostOf(invite.url)
  const sameServer = cloud.config?.url.replace(/\/+$/, '') === invite.url.replace(/\/+$/, '')
  return (
    <div>
      <PageHeader title={tt('Gruba katıl')} subtitle={ttf('{0} sizi “{1}” grubuna davet etti.', invite.from, invite.group)} />
      <div className="flex max-w-2xl flex-col gap-4">
        {isDemo ? (
          <Alert tone="warning" title={tt('Demo modunda katılamazsınız')}>
            {tt('Demo modunu Ayarlar sayfasından kapatıp bağlantıyı tekrar açın.')}
          </Alert>
        ) : cloud.config === undefined ? null : !sameServer ? (
          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold">
              <Cloud className="size-5 text-accent" /> {tt('Paylaşım sunucusu')}
            </h2>
            <p className="mt-2 text-sm text-muted">
              {tt('Bu grup')} <span className="font-medium text-ink">{host}</span> {tt('sunucusunda tutuluyor.')}
            </p>
            <More label={tt('Neler gönderilir?')}>{tt('Yalnızca bu gruba eklediğiniz harcamalar oraya gönderilir; diğer kayıtlarınız cihazınızda kalır.')}</More>
            {cloud.config && (
              <p className="mt-2 text-sm text-warning">
                {ttf('Şu an {0} sunucusuna bağlısınız; devam ederseniz o bağlantı kapanır.', hostOf(cloud.config.url))}</p>
            )}
            <Button className="mt-4" variant="primary" onClick={() => void cloud.saveConfig({ url: invite.url, anonKey: invite.key })}>
              {tt('Bu sunucuyu kullan')}
            </Button>
          </Card>
        ) : cloud.status === 'loading' ? null : cloud.status === 'signed-out' ? (
          <AuthCard intro={tt('Katılmak için giriş yapın ya da hesap oluşturun.')} />
        ) : (
          <JoinForm code={invite.code} groupName={invite.group} />
        )}
      </div>
    </div>
  )
}

function JoinForm({ code, groupName }: { code: string; groupName: string }) {
  const { repo } = useData()
  const cloud = useCloud()
  const { map, selfId } = useMembers()
  const { setGroupFilter, toast } = useUi()
  const navigate = useNavigate()
  const current = selfId ? map.get(selfId)?.name : undefined
  const [name, setName] = useState<string | null>(null)
  const value = name ?? (current && current !== 'Ben' ? current : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const join = async (e: FormEvent) => {
    e.preventDefault()
    const n = value.trim()
    if (!n || !selfId || !cloud.backend) return
    setBusy(true)
    setError(undefined)
    try {
      await repo.db.members.update(selfId, { name: n.slice(0, 40), updatedAt: new Date().toISOString() })
      const group = await joinWithInvite(repo, cloud.backend, code)
      await cloud.sync()
      setGroupFilter(group.id)
      toast(ttf('“{0}” grubuna katıldınız.', group.name))
      navigate('/')
    } catch (err) {
      setError(err instanceof UserFacingError ? err.message : cloudErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-5">
      <p className="text-sm text-muted">
        {cloud.email} {tt('olarak giriş yaptınız. “')}{groupName}{tt('” grubuna eklediğiniz harcamaları üyeler görür.')}
      </p>
      <form onSubmit={join} className="mt-4 flex flex-wrap items-end gap-3">
        <Field label={tt('Adınız (üyeler sizi bu adla görür)')} htmlFor="join-name" className="min-w-[220px] flex-1">
          <Input id="join-name" value={value} maxLength={40} placeholder={tt('Ör. Ayşe')} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Button type="submit" variant="primary" loading={busy} disabled={!value.trim()} icon={<UserPlus className="size-4" />}>
          {tt('Gruba katıl')}
        </Button>
      </form>
      {error && (
        <p className="mt-3 text-[13px] font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </Card>
  )
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}
