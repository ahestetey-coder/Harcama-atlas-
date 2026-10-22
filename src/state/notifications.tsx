import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { LocalNotificationsPlugin } from '@capacitor/local-notifications'
import { holdingSummary } from '../domain/assets'
import { periodOf, todayIso } from '../domain/dates'
import {
  budgetAlerts,
  DEFAULT_NOTIFY_PREFS,
  HORIZON_DAYS,
  notificationId,
  planNotifications,
  type NotifyPrefs,
  type PlannedNotification,
} from '../domain/notifications'
import { installmentPlans, upcomingPayments } from '../domain/recurring'
import type { IsoDate } from '../domain/types'
import { isNativeApp } from '../lib/native'
import { useBudgetStatus } from './budget'
import { usePersonalCycle } from './cycle'
import { useAssets, useCategoryMap, useSettings, useTransactions } from './data'
import { useAllRecurring, usePersonalTransactions } from './personal'
import { tt } from '../lib/i18n'

/**
 * Mobil uygulamada cihazda kurulan bildirimler (sunucu yok; ücretsiz Apple kimliğiyle kurulan
 * deneme sürümünde de çalışır). Uygulama her açıldığında ve veri değiştiğinde yeniden kurulur.
 * Tercihler cihaza özeldir ve localStorage'da tutulur.
 */
const PREFS_KEY = 'ha:notify'
const SENT_KEY = 'ha:notify-sent'
const CHANNEL = 'hatirlatmalar'

const listeners = new Set<() => void>()
let prefsCache: NotifyPrefs | null = null

function readPrefs(): NotifyPrefs {
  if (prefsCache) return prefsCache
  try {
    prefsCache = { ...DEFAULT_NOTIFY_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') }
  } catch {
    prefsCache = DEFAULT_NOTIFY_PREFS
  }
  return prefsCache!
}

export function setNotifyPrefs(patch: Partial<NotifyPrefs>): void {
  prefsCache = { ...readPrefs(), ...patch }
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefsCache))
  } catch {
    /* tercih kaydedilemedi; bu oturumda yine geçerli */
  }
  listeners.forEach((l) => l())
}

export function useNotifyPrefs(): NotifyPrefs {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    readPrefs,
    readPrefs,
  )
}

function readSent(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SENT_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

function writeSent(keys: Set<string>, period: string): void {
  try {
    // Yalnızca bu dönemin anahtarları saklanır
    localStorage.setItem(SENT_KEY, JSON.stringify([...keys].filter((k) => k.includes(`:${period}:`))))
  } catch {
    /* yok say */
  }
}

let pluginPromise: Promise<LocalNotificationsPlugin> | null = null
function plugin(): Promise<LocalNotificationsPlugin> {
  pluginPromise ??= import('@capacitor/local-notifications').then(async ({ LocalNotifications }) => {
    await LocalNotifications.createChannel({ id: CHANNEL, name: tt('Hatırlatmalar'), description: tt('Ödeme, gelir, bütçe ve kayıt hatırlatmaları'), importance: 4 }).catch(() => {})
    // Bildirime dokununca ilgili sayfa açılır
    await LocalNotifications.addListener('localNotificationActionPerformed', (e) => {
      const route = (e.notification.extra as { route?: string } | undefined)?.route
      if (route) window.location.hash = `#${route}`
    })
    return LocalNotifications
  })
  return pluginPromise
}

export type NotifyPermission = 'granted' | 'denied' | 'prompt' | 'unsupported'

export async function notifyPermission(): Promise<NotifyPermission> {
  if (!isNativeApp) return 'unsupported'
  const p = await (await plugin()).checkPermissions()
  return p.display === 'granted' ? 'granted' : p.display === 'denied' ? 'denied' : 'prompt'
}

export async function requestNotifyPermission(): Promise<NotifyPermission> {
  if (!isNativeApp) return 'unsupported'
  const p = await (await plugin()).requestPermissions()
  return p.display === 'granted' ? 'granted' : p.display === 'denied' ? 'denied' : 'prompt'
}

function toNative(n: PlannedNotification) {
  return {
    id: notificationId(n.key),
    title: n.title,
    body: n.body,
    schedule: { at: n.at, allowWhileIdle: true },
    channelId: CHANNEL,
    extra: { route: n.route, kind: n.kind },
  }
}

/** Kurulu tüm bildirimleri silip verilenleri kurar. */
async function replaceScheduled(planned: PlannedNotification[], instant: PlannedNotification[]): Promise<void> {
  const ln = await plugin()
  const pending = await ln.getPending()
  if (pending.notifications.length) await ln.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) })
  const all = [...planned, ...instant]
  if (all.length) await ln.schedule({ notifications: all.map(toNative) })
}

/** Ayarlar'daki "Deneme bildirimi": 5 saniye sonra gösterilir (uygulamayı arka plana alınca görünür). */
export async function sendTestNotification(): Promise<NotifyPermission> {
  let perm = await notifyPermission()
  if (perm === 'prompt') perm = await requestNotifyPermission()
  if (perm !== 'granted') return perm
  const ln = await plugin()
  await ln.schedule({
    notifications: [
      toNative({
        key: `deneme:${Date.now()}`,
        kind: 'payments',
        at: new Date(Date.now() + 5000),
        title: tt('Harcama Atlası'),
        body: tt('Bildirimler çalışıyor. Hatırlatmalar bu şekilde gelecek.'),
        route: '/ayarlar',
      }),
    ],
  })
  return perm
}

/** Şu anki verilerle kurulacak bildirimler (Ayarlar'da sıradakileri göstermek için de kullanılır). */
export function usePlannedNotifications(): PlannedNotification[] | null {
  const prefs = useNotifyPrefs()
  const personal = usePersonalTransactions()
  const recurring = useAllRecurring()
  const assets = useAssets()
  const settings = useSettings()
  const all = useTransactions()
  return useMemo(() => {
    if (!personal || !recurring || !assets || !settings || !all) return null
    const now = new Date()
    const today = todayIso(now)
    const manual = new Set(recurring.filter((i) => i.kind === 'installment' && i.matchKey).map((i) => i.matchKey!))
    const due = upcomingPayments(recurring, installmentPlans(personal.counted, manual), today, HORIZON_DAYS)
    // Tek seferde ödenecek borçlar (ör. kart ekstresi son ödeme günü)
    for (const a of assets) {
      const p = a.debtPlan
      if (a.kind !== 'debt' || a.archived || p?.mode !== 'once' || !p.dueDate || p.dueDate < today) continue
      due.push({ date: p.dueDate, name: a.name, amountKurus: Math.abs(holdingSummary(a, today).valueKurus ?? 0), source: 'recurring', id: `borc:${a.id}`, remind: false, reminderDays: 3 })
    }
    // Son kayıt: elle ya da dosyadan bu cihazda girilen işlemler (planlı, üyeden gelen ve demo satırları sayılmaz)
    let last: IsoDate | null = null
    for (const t of all) {
      if (t.source === 'planned' || t.source === 'shared' || t.source === 'settlement' || t.source === 'demo') continue
      const d = todayIso(new Date(t.createdAt))
      if (!last || d > last) last = d
    }
    return planNotifications({ now, due, incomes: settings.recurringIncomes ?? [], lastEntryDate: last }, prefs)
  }, [prefs, personal, recurring, assets, settings, all])
}

/** Uygulama kabuğunda çalışır: bildirimleri veri değiştikçe yeniden kurar. Web'de hiçbir şey yapmaz. */
export function NotificationScheduler() {
  if (!isNativeApp) return null
  return <Scheduler />
}

function Scheduler() {
  const prefs = useNotifyPrefs()
  const planned = usePlannedNotifications()
  const startDay = usePersonalCycle()
  const period = periodOf(todayIso(), startDay)
  const status = useBudgetStatus(period, prefs.enabled && prefs.budget)
  const categories = useCategoryMap()

  useEffect(() => {
    if (!planned) return
    let cancelled = false
    // Veri art arda değişince (içe aktarma vb.) tek sefer kurulsun
    const t = setTimeout(async () => {
      try {
        let perm = await notifyPermission()
        if (perm === 'prompt' && prefs.enabled) perm = await requestNotifyPermission()
        if (cancelled || perm !== 'granted') return
        const sent = readSent()
        const instant = budgetAlerts(status, period, (id) => categories.get(id)?.name ?? 'Kategori', sent, new Date())
        await replaceScheduled(planned, instant)
        if (instant.length) {
          for (const n of instant) {
            sent.add(n.key)
            // Aşıldıysa aynı dönem için "doldu" uyarısı artık gönderilmez
            sent.add(n.key.replace(/:over$/, ':near'))
          }
          writeSent(sent, period)
        }
      } catch {
        /* bildirim kurulamadı; uygulama çalışmaya devam eder */
      }
    }, 1500)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [planned, status, period, categories, prefs.enabled])

  return null
}
