import { AtSign, Newspaper, Plus, Rss, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { addNewsSource, deleteNewsSource, listNewsSources, setNewsSourceActive, type NewsSource } from '../cloud/coach'
import { cloudErrorMessage } from '../cloud/errors'
import { useAuth } from '../state/auth'
import { useUi } from '../state/ui'
import { Alert, Badge, Button, Card, Input, Segmented, Switch } from './ui/primitives'

/** Yönetici: günlük ekonomi özeti için X hesapları ve RSS adresleri. */
export function NewsSourcesCard() {
  const { backend } = useAuth()
  const { toast } = useUi()
  const [list, setList] = useState<NewsSource[] | null>(null)
  const [missing, setMissing] = useState(false)
  const [kind, setKind] = useState<'x' | 'rss'>('x')
  const [value, setValue] = useState('')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!backend) return
    try {
      setList(await listNewsSources(backend.client))
      setMissing(false)
    } catch {
      setMissing(true)
    }
  }, [backend])
  useEffect(() => {
    void load()
  }, [load])

  const run = async (fn: () => Promise<void>, ok?: string) => {
    if (!backend) return
    setBusy(true)
    try {
      await fn()
      if (ok) toast(ok)
      await load()
    } catch (e) {
      toast(cloudErrorMessage(e), { kind: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mt-4 p-4 sm:p-5" aria-label="Haber kaynakları">
      <h2 className="flex items-center gap-2 font-display text-base font-semibold">
        <Newspaper className="size-5 text-accent" /> Günlük ekonomi özeti kaynakları
      </h2>
      <p className="mt-1 text-[13px] text-muted">Koç her sabah bu hesap ve adreslerin son 24 saatteki paylaşımlarını özetleyip Plus+ kullanıcılarına gönderir. Her maddede kaynak ve tarih gösterilir.</p>
      {missing ? (
        <Alert tone="warning" className="mt-3">
          Kaynak tablosu veritabanına henüz kurulmamış. Kurulum dosyasını (koc-ve-haberler.sql) çalıştırın.
        </Alert>
      ) : (
        <>
          <form
            className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center"
            onSubmit={(e) => {
              e.preventDefault()
              if (!value.trim() || !backend) return
              void run(async () => {
                await addNewsSource(backend.client, kind, value, label)
                setValue('')
                setLabel('')
              }, 'Kaynak eklendi.')
            }}
          >
            <Segmented<'x' | 'rss'>
              label="Kaynak türü"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'x', label: 'X hesabı', icon: <AtSign className="size-3.5" /> },
                { value: 'rss', label: 'RSS', icon: <Rss className="size-3.5" /> },
              ]}
            />
            <Input aria-label={kind === 'x' ? 'X kullanıcı adı' : 'RSS adresi'} value={value} onChange={(e) => setValue(e.target.value)} placeholder={kind === 'x' ? '@kullaniciadi' : 'https://…/rss'} className="flex-1" />
            <Input aria-label="Görünen ad (isteğe bağlı)" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Görünen ad (isteğe bağlı)" className="sm:w-48" />
            <Button type="submit" variant="primary" icon={<Plus className="size-4" />} loading={busy} disabled={!value.trim()}>
              Ekle
            </Button>
          </form>
          <ul className="mt-3 divide-y divide-line" aria-label="Kaynaklar">
            {list?.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-2.5">
                {s.kind === 'x' ? <AtSign className="size-4 shrink-0 text-subtle" /> : <Rss className="size-4 shrink-0 text-subtle" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-medium text-ink">{s.kind === 'x' ? `@${s.value}` : s.value}</div>
                  {s.label && <div className="text-[12px] text-muted">{s.label}</div>}
                </div>
                {!s.active && <Badge tone="neutral">Kapalı</Badge>}
                <Switch label={`${s.value} etkin`} checked={s.active} disabled={busy} onChange={(v) => void run(() => setNewsSourceActive(backend!.client, s.id, v))} />
                <Button size="sm" variant="ghost" aria-label={`${s.value} sil`} icon={<Trash2 className="size-4" />} disabled={busy} onClick={() => void run(() => deleteNewsSource(backend!.client, s.id), 'Kaynak silindi.')} />
              </li>
            ))}
            {list && list.length === 0 && <li className="py-2 text-sm text-muted">Henüz kaynak yok. X hesaplarını ve haber sitelerinin RSS adreslerini ekleyin.</li>}
          </ul>
        </>
      )}
    </Card>
  )
}
