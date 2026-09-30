import { Cloud, UserPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/AppShell'
import { Alert, Button, Card, Field, Input } from '../components/ui/primitives'
import { parseInvite } from '../cloud/config'
import { cloudErrorMessage } from '../cloud/errors'
import { joinWithInvite } from '../cloud/sync'
import { UserFacingError } from '../data/repository'
import { useCloud, useMembers } from '../state/cloud'
import { useData } from '../state/data'
import { useUi } from '../state/ui'
import { AuthCard } from './MembersPage'

/** Davet bağlantısı (#/katil?d=…): bulut ayarını alır, oturum açtırır ve gruba katar. */
export default function JoinPage() {
  const [params] = useSearchParams()
  const invite = parseInvite(params.get('d'))
  const cloud = useCloud()
  const { isDemo } = useData()

  if (!invite) {
    return (
      <div>
        <PageHeader title="Gruba katıl" />
        <Alert tone="danger" title="Davet bağlantısı okunamadı">
          Bağlantı eksik kopyalanmış olabilir. Davet edenden yeni bir bağlantı isteyin.
        </Alert>
      </div>
    )
  }

  const host = hostOf(invite.url)
  const sameServer = cloud.config?.url.replace(/\/+$/, '') === invite.url.replace(/\/+$/, '')
  return (
    <div>
      <PageHeader title="Gruba katıl" subtitle={`${invite.from} sizi “${invite.group}” grubuna davet etti.`} />
      <div className="flex max-w-2xl flex-col gap-4">
        {isDemo ? (
          <Alert tone="warning" title="Demo modunda katılamazsınız">
            Demo modunu Ayarlar sayfasından kapatıp bağlantıyı tekrar açın.
          </Alert>
        ) : cloud.config === undefined ? null : !sameServer ? (
          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold">
              <Cloud className="size-5 text-accent" /> Paylaşım sunucusu
            </h2>
            <p className="mt-2 text-sm text-muted">
              Bu grup <span className="font-medium text-ink">{host}</span> adresindeki Supabase projesinde tutuluyor. Yalnızca bu gruba eklediğiniz harcamalar oraya gönderilir; diğer kayıtlarınız cihazınızda kalır.
            </p>
            {cloud.config && (
              <p className="mt-2 text-sm text-warning">
                Şu an başka bir sunucuya ({hostOf(cloud.config.url)}) bağlısınız. Devam ederseniz o bağlantı kapanır.
              </p>
            )}
            <Button className="mt-4" variant="primary" onClick={() => void cloud.saveConfig({ url: invite.url, anonKey: invite.key })}>
              Bu sunucuyu kullan
            </Button>
          </Card>
        ) : cloud.status === 'loading' ? null : cloud.status === 'signed-out' ? (
          <AuthCard intro="Gruba katılmak için bir hesapla giriş yapın ya da yeni hesap oluşturun. Parolanız bu uygulamada saklanmaz." />
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
      toast(`“${group.name}” grubuna katıldınız.`)
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
        {cloud.email} olarak giriş yaptınız. Katıldıktan sonra “{groupName}” grubuna eklediğiniz harcamalar diğer üyelerle paylaşılır, onların harcamaları da panelinizde görünür.
      </p>
      <form onSubmit={join} className="mt-4 flex flex-wrap items-end gap-3">
        <Field label="Adınız (üyeler sizi bu adla görür)" htmlFor="join-name" className="min-w-[220px] flex-1">
          <Input id="join-name" value={value} maxLength={40} placeholder="Ör. Ayşe" onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Button type="submit" variant="primary" loading={busy} disabled={!value.trim()} icon={<UserPlus className="size-4" />}>
          Gruba katıl
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
