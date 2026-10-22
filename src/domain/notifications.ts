import { addDays, toIsoDate } from './dates'
import { formatKurus } from './money'
import { occurrencesBetween, type DuePayment } from './recurring'
import type { BudgetStatus, LimitState } from './budget'
import type { IsoDate, RecurringIncome } from './types'
import { tt, ttf } from '../lib/i18n'

/**
 * Mobil uygulamanın cihazda kurduğu (sunucusuz) bildirimler. Bu dosya yalnızca hangi bildirimin
 * ne zaman gösterileceğini hesaplar; kurma işi src/state/notifications.tsx'te.
 */
export type NotifyKind = 'payments' | 'income' | 'budget' | 'spending'

export interface NotifyPrefs {
  enabled: boolean
  payments: boolean
  income: boolean
  budget: boolean
  spending: boolean
}

export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = { enabled: true, payments: true, income: true, budget: true, spending: true }

export const NOTIFY_KIND_LABEL: Record<NotifyKind, { title: string; hint: string }> = {
  payments: { title: tt('Ödeme hatırlatmaları'), hint: tt('Düzenli ödeme, taksit ve borç günleri') },
  income: { title: tt('Gelir günü'), hint: tt('Maaş ve düzenli gelir günü') },
  budget: { title: tt('Bütçe uyarıları'), hint: tt('Bütçe dolmaya yaklaşınca ve aşılınca') },
  spending: { title: tt('Harcama girme hatırlatması'), hint: tt('2 gün kayıt girilmezse 3. gün akşamı') },
}

export interface PlannedNotification {
  /** Kalıcı anahtar; aynı bildirimin tekrar kurulmaması ve kimlik üretimi için. */
  key: string
  kind: NotifyKind
  at: Date
  title: string
  body: string
  /** Bildirime dokununca açılacak sayfa (ör. '/borclar?bolum=odemeler'). */
  route: string
}

/** iOS aynı anda en fazla 64 bekleyen bildirim tutar. */
export const MAX_PENDING = 60
/** Kaç gün ilerisi için bildirim kurulur (uygulama her açıldığında yeniden kurulur). */
export const HORIZON_DAYS = 45

const PAYMENT_HOUR = 10
const DUE_DAY_HOUR = 9
const INCOME_HOUR = 11
const SPENDING_HOUR = 20

/** Kuruşsuz tutar: 125000 → "1.250 ₺" */
function lira(kurus: number): string {
  return formatKurus(Math.round(kurus / 100) * 100).replace(/,00 ₺$/, ' ₺')
}

/** Yerel saatle o günün belirtilen saati. */
export function atLocal(date: IsoDate, hour: number, minute = 0): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d, hour, minute)
}

function localIso(d: Date): IsoDate {
  return toIsoDate(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

/** Bildirim kimliği: anahtardan 31 bitlik pozitif tam sayı (Android int, iOS string olarak kullanır). */
export function notificationId(key: string): number {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 1) || 1
}

export interface NotifyInput {
  now: Date
  /** Bugünden HORIZON_DAYS gün sonrasına kadarki ödemeler (düzenli ödeme, taksit, borç). */
  due: DuePayment[]
  incomes: RecurringIncome[]
  /** Elle ya da dosyadan son kayıt girilen gün; hiç kayıt yoksa null. */
  lastEntryDate: IsoDate | null
}

function dayWord(n: number): string {
  return n === 1 ? tt('Yarın') : ttf('{0} gün sonra', n)
}

/** Önümüzdeki günler için kurulacak zamanlı bildirimler (en yakından uzağa, en fazla MAX_PENDING). */
export function planNotifications(input: NotifyInput, prefs: NotifyPrefs): PlannedNotification[] {
  if (!prefs.enabled) return []
  const { now } = input
  const today = localIso(now)
  const to = addDays(today, HORIZON_DAYS)
  const out: PlannedNotification[] = []

  if (prefs.payments) {
    for (const d of input.due) {
      if (d.date < today || d.date > to) continue
      const amount = d.amountKurus > 0 ? ttf('{0} ödenecek.', lira(d.amountKurus)) : tt('Son ödeme günü.')
      const route = '/borclar?bolum=odemeler'
      if (d.reminderDays > 0)
        out.push({
          key: `pay:${d.id}:${d.date}:once`,
          kind: 'payments',
          at: atLocal(addDays(d.date, -d.reminderDays), PAYMENT_HOUR),
          title: ttf('{0} ödeme: {1}', dayWord(d.reminderDays), d.name),
          body: ttf('{0} Hesabında yeterli para olduğundan emin ol.', amount),
          route,
        })
      out.push({
        key: `pay:${d.id}:${d.date}:gun`,
        kind: 'payments',
        at: atLocal(d.date, DUE_DAY_HOUR),
        title: ttf('Bugün ödeme günü: {0}', d.name),
        body: amount,
        route,
      })
    }
  }

  if (prefs.income) {
    for (const inc of input.incomes) {
      if (!inc.active) continue
      const item = inc.cadence === 'once' ? { cadence: 'monthly' as const, startDate: inc.startDate, occurrences: 1 } : { cadence: inc.cadence, startDate: inc.startDate, occurrences: null }
      for (const d of occurrencesBetween(item, today, to)) {
        const salary = inc.kind === 'salary'
        out.push({
          key: `gelir:${inc.id}:${d}`,
          kind: 'income',
          at: atLocal(d, INCOME_HOUR),
          title: salary ? tt('Bugün maaş günü') : ttf('Bugün gelir günü: {0}', inc.name),
          body: salary
            ? ttf('{0} bekleniyor. Yeni dönemin bütçesine bir göz at.', lira(inc.amountKurus))
            : ttf('{0} bekleniyor. Geldiyse planına göz at.', lira(inc.amountKurus)),
          route: '/butce',
        })
      }
    }
  }

  if (prefs.spending && input.lastEntryDate) {
    // 2 gün kayıt yoksa 3. gün akşamı; girilmemeye devam ederse bir hafta ve iki hafta sonra tekrar
    for (const gap of [3, 7, 14]) {
      const d = addDays(input.lastEntryDate, gap)
      out.push({
        key: `kayit:${input.lastEntryDate}:${gap}`,
        kind: 'spending',
        at: atLocal(d, SPENDING_HOUR),
        title: tt('Harcamalarını girmeyi unutma'),
        body: ttf('{0} gündür kayıt yok. Birkaç saniyede ekleyebilir ya da ekstreni yükleyebilirsin.', gap),
        route: '/islemler',
      })
    }
  }

  return out
    .filter((n) => n.at.getTime() > now.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, MAX_PENDING)
}

/**
 * Bütçe uyarıları: dönemin toplam ve kategori limitleri dolmaya yaklaşınca (uyarı eşiği) ve aşılınca.
 * Her durum bir dönemde bir kez bildirilir; `sent` daha önce gönderilen anahtarlardır.
 */
export function budgetAlerts(
  status: BudgetStatus | null,
  period: string,
  categoryName: (id: string) => string,
  sent: ReadonlySet<string>,
  now: Date,
): PlannedNotification[] {
  if (!status) return []
  const out: PlannedNotification[] = []
  for (const w of status.warnings) {
    if (w.kind === 'week') continue
    const state: LimitState = w.status.state
    if (state === 'ok') continue
    const key = `butce:${period}:${w.kind === 'total' ? 'toplam' : w.categoryId}:${state}`
    if (sent.has(key)) continue
    const s = w.status
    const pct = Math.round(s.ratio * 100)
    const name = w.kind === 'total' ? tt('Aylık bütçen') : `${categoryName(w.categoryId ?? '')} limitin`
    out.push({
      key,
      kind: 'budget',
      at: new Date(now.getTime() + 2000),
      title: state === 'over' ? ttf('{0} aşıldı', name) : ttf('{0} %{1} doldu', name, pct),
      body:
        state === 'over'
          ? ttf('Bu dönem {0} harcandı, limit {1}. {2} fazla.', lira(s.spentKurus), lira(s.effectiveKurus), lira(s.spentKurus - s.effectiveKurus))
          : ttf('Bu dönem {0} / {1} harcandı. Kalan {2}.', lira(s.spentKurus), lira(s.effectiveKurus), lira(s.effectiveKurus - s.spentKurus)),
      route: '/butce',
    })
  }
  return out
}
