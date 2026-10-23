import { Bell, BellRing } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NOTIFY_KIND_LABEL, type NotifyKind } from '../domain/notifications'
import { isNativeApp } from '../lib/native'
import { notifyPermission, requestNotifyPermission, sendTestNotification, setNotifyPrefs, useNotifyPrefs, usePlannedNotifications, type NotifyPermission } from '../state/notifications'
import { useUi } from '../state/ui'
import { Button, Card, Switch } from './ui/primitives'
import { dateLocale, tt, ttf } from '../lib/i18n'

const KINDS: NotifyKind[] = ['payments', 'income', 'budget', 'spending', 'gundem']

function when(d: Date): string {
  return d.toLocaleString(dateLocale(), { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
}

/** Ayarlar: mobil uygulamada bildirim tercihleri. Web'de gösterilmez. */
export function NotificationsCard() {
  if (!isNativeApp) return null
  return <NativeNotificationsCard />
}

function NativeNotificationsCard() {
  const prefs = useNotifyPrefs()
  const planned = usePlannedNotifications()
  const { toast } = useUi()
  const [perm, setPerm] = useState<NotifyPermission | null>(null)

  useEffect(() => {
    void notifyPermission().then(setPerm, () => setPerm('unsupported'))
  }, [])

  const enable = async (on: boolean) => {
    setNotifyPrefs({ enabled: on })
    if (on && perm !== 'granted') setPerm(await requestNotifyPermission().catch(() => 'unsupported' as const))
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <Bell className="size-5 text-accent" /> {tt('Bildirimler')}
          </h2>
          <p className="mt-1 text-sm text-muted">{tt('Hatırlatmalar telefonunda kurulur, internet gerekmez.')}</p>
        </div>
        <Switch checked={prefs.enabled} onChange={(on) => void enable(on)} label={tt('Bildirimler')} />
      </div>

      {prefs.enabled && perm === 'denied' && (
        <p className="mt-3 rounded-xl bg-warning-soft px-3 py-2 text-[13px] text-ink">
          {tt('Bildirim izni kapalı. Telefonun Ayarlar &gt; Harcama Atlası &gt; Bildirimler bölümünden açabilirsin.')}
        </p>
      )}

      {prefs.enabled && (
        <div className="mt-4 space-y-3">
          {KINDS.map((k) => (
            <div key={k} className="flex items-center justify-between gap-3">
              <div className="min-w-0 text-sm">
                <div className="font-medium text-ink">{NOTIFY_KIND_LABEL[k].title}</div>
                <div className="text-[12.5px] text-subtle">{NOTIFY_KIND_LABEL[k].hint}</div>
              </div>
              <Switch checked={prefs[k]} onChange={(on) => setNotifyPrefs({ [k]: on })} label={NOTIFY_KIND_LABEL[k].title} />
            </div>
          ))}
        </div>
      )}

      {prefs.enabled && planned && (
        <div className="mt-4 text-[13px]">
          {planned.length ? (
            <>
              <div className="font-medium text-ink">{ttf('Sıradaki bildirimler ({0})', planned.length)}</div>
              <ul className="mt-1 space-y-0.5 text-muted">
                {planned.slice(0, 3).map((n) => (
                  <li key={n.key} className="truncate">
                    <span className="num">{when(n.at)}</span> · {n.title}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-subtle">{tt('Şimdilik kurulacak bildirim yok. Ödeme, gelir veya harcama ekledikçe hatırlatmalar kurulur.')}</p>
          )}
        </div>
      )}

      <Button
        size="sm"
        className="mt-4"
        icon={<BellRing className="size-4" />}
        onClick={async () => {
          const p = await sendTestNotification().catch(() => 'unsupported' as const)
          setPerm(p)
          if (p === 'granted') toast(tt('Deneme bildirimi 5 saniye içinde gelecek. Uygulamayı arka plana alabilirsin.'))
          else toast(tt('Bildirim izni verilmedi.'), { kind: 'error' })
        }}
      >
        {tt('Deneme bildirimi gönder')}
      </Button>
    </Card>
  )
}
