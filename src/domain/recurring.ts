import { addDays, daysInMonth, monthOf, periodOf, periodRange, toIsoDate } from './dates'
import { cleanDescription, merchantKey } from './normalize'
import type { IsoDate, MonthKey, RecurringPayment, Transaction } from './types'

/** Tarihe k ay ekler; gün, `day` (yoksa tarihin günü) ile ayın son gününden küçük olanıdır. */
export function addMonthsClamped(date: IsoDate, k: number, day?: number): IsoDate {
  const [y, m, d] = date.split('-').map(Number)
  const idx = y * 12 + (m - 1) + k
  const ny = Math.floor(idx / 12)
  const nm = (idx % 12) + 1
  return toIsoDate(ny, nm, Math.min(day ?? d, daysInMonth(ny, nm)))
}

/** n. ödeme tarihi (0'dan başlar). */
export function nthDue(item: Pick<RecurringPayment, 'cadence' | 'startDate'>, n: number): IsoDate {
  const day = Number(item.startDate.slice(8, 10))
  if (item.cadence === 'weekly') return addDays(item.startDate, 7 * n)
  if (item.cadence === 'yearly') return addMonthsClamped(item.startDate, 12 * n, day)
  return addMonthsClamped(item.startDate, n, day)
}

/** [from, to] aralığındaki ödeme tarihleri. */
export function occurrencesBetween(item: Pick<RecurringPayment, 'cadence' | 'startDate' | 'occurrences'>, from: IsoDate, to: IsoDate): IsoDate[] {
  const out: IsoDate[] = []
  const max = item.occurrences ?? Infinity
  for (let n = 0; n < max && n < 2000; n++) {
    const d = nthDue(item, n)
    if (d > to) break
    if (d >= from) out.push(d)
  }
  return out
}

/** Kaç ödeme yapıldı (bugün dahil) ve kaç kaldı. Süresizse kalan null. */
export function progressOf(item: Pick<RecurringPayment, 'cadence' | 'startDate' | 'occurrences'>, today: IsoDate): { paid: number; remaining: number | null } {
  const paid = item.startDate > today ? 0 : occurrencesBetween(item, item.startDate, today).length
  return { paid, remaining: item.occurrences ? Math.max(0, item.occurrences - paid) : null }
}

/** İçe aktarılan işlemlerdeki taksit bilgisinden çıkarılan taksitli alışveriş. */
export interface InstallmentPlan {
  key: string
  name: string
  monthlyKurus: number
  current: number
  total: number
  lastDate: IsoDate
  remaining: number
  remainingKurus: number
  purchaseTotalKurus?: number
  categoryId: string | null
  /** Kalan taksitlerin tahmini tarihleri (son taksitten birer ay sonra). */
  nextDates: IsoDate[]
}

/** Açıklamadaki "(5/12 TAKSİT)", "3. Taksit" gibi ekleri atar. */
export function installmentName(description: string): string {
  const out = cleanDescription(
    description
      .replace(/\(?\s*\d+\s*\/\s*\d+\s*(taks[iİı]t)?\s*\)?/giu, ' ')
      .replace(/\d+\s*[-.]?\s*\d*\.?\s*taks[iİı]t/giu, ' ')
      .replace(/[-–(]\s*$/u, ''),
  )
  return out || cleanDescription(description)
}

/**
 * Ekstrelerdeki "3/12 taksit" bilgilerinden kalan taksitleri çıkarır. Aynı alışverişin taksitleri
 * iş yeri, taksit sayısı ve tutarla eşleştirilir; en son görülen taksit esas alınır.
 */
export function installmentPlans(txs: Transaction[], skipKeys: Set<string> = new Set()): InstallmentPlan[] {
  const latest = new Map<string, Transaction>()
  for (const t of txs) {
    if (t.type !== 'expense' || !t.installment || t.installment.total < 2) continue
    const mk = merchantKey(t.description) || t.normalizedDescription
    if (skipKeys.has(mk)) continue
    const key = `${mk}|${t.installment.total}|${t.amountKurus}`
    const prev = latest.get(key)
    if (!prev || t.installment.current > prev.installment!.current || (t.installment.current === prev.installment!.current && t.date > prev.date)) latest.set(key, t)
  }
  const plans: InstallmentPlan[] = []
  for (const [key, t] of latest) {
    const { current, total, purchaseTotalKurus } = t.installment!
    const remaining = Math.max(0, total - current)
    if (!remaining) continue
    plans.push({
      key,
      name: installmentName(t.description),
      monthlyKurus: t.amountKurus,
      current,
      total,
      lastDate: t.date,
      remaining,
      remainingKurus: remaining * t.amountKurus,
      purchaseTotalKurus,
      categoryId: t.categoryId,
      nextDates: Array.from({ length: remaining }, (_, i) => addMonthsClamped(t.date, i + 1)),
    })
  }
  return plans.sort((a, b) => b.remainingKurus - a.remainingKurus)
}

export interface DuePayment {
  date: IsoDate
  name: string
  amountKurus: number
  source: 'recurring' | 'installment'
  id: string
  /** Hatırlatma zamanı geldi mi (ödeme günü − hatırlatma günü ≤ bugün). */
  remind: boolean
}

/** Bugünden itibaren `days` gün içindeki ödemeler (tarih sırasıyla). */
export function upcomingPayments(items: RecurringPayment[], plans: InstallmentPlan[], today: IsoDate, days: number): DuePayment[] {
  const to = addDays(today, days)
  const out: DuePayment[] = []
  for (const it of items) {
    if (!it.active) continue
    for (const d of occurrencesBetween(it, today, to))
      out.push({ date: d, name: it.name, amountKurus: it.amountKurus, source: 'recurring', id: it.id, remind: addDays(d, -it.reminderDays) <= today })
  }
  for (const p of plans)
    for (const d of p.nextDates)
      if (d >= today && d <= to) out.push({ date: d, name: `${p.name} (taksit)`, amountKurus: p.monthlyKurus, source: 'installment', id: p.key, remind: addDays(d, -3) <= today })
  return out.sort((a, b) => a.date.localeCompare(b.date) || b.amountKurus - a.amountKurus)
}

export interface PeriodLoad {
  month: MonthKey
  recurringKurus: number
  installmentKurus: number
  totalKurus: number
}

/** Önümüzdeki dönemlerin düzenli ödeme ve taksit yükü. */
export function futureLoad(items: RecurringPayment[], plans: InstallmentPlan[], firstMonth: MonthKey, count: number, startDay: number): PeriodLoad[] {
  const rows: PeriodLoad[] = []
  for (let i = 0; i < count; i++) {
    const [y, m] = firstMonth.split('-').map(Number)
    const idx = y * 12 + (m - 1) + i
    const month = `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`
    const { start, end } = periodRange(month, startDay)
    let rec = 0
    for (const it of items) if (it.active) rec += occurrencesBetween(it, start, end).length * it.amountKurus
    let inst = 0
    for (const p of plans) inst += p.nextDates.filter((d) => d >= start && d <= end).length * p.monthlyKurus
    rows.push({ month, recurringKurus: rec, installmentKurus: inst, totalKurus: rec + inst })
  }
  return rows
}

/** Ay sonu tahmini için: dönemde düzenli/taksit olarak tanınan harcama ve bugünden sonra kalan ödemeler. */
export function fixedPayments(txs: Transaction[], items: RecurringPayment[], plans: InstallmentPlan[], month: MonthKey, startDay: number, today: IsoDate): { fixedSpentKurus: number; remainingKurus: number } {
  const keys = new Set(items.filter((i) => i.active && i.matchKey).map((i) => i.matchKey!))
  let fixedSpent = 0
  for (const t of txs) {
    if (t.type !== 'expense' || periodOf(t.date, startDay) !== month) continue
    if (t.installment || keys.has(merchantKey(t.description))) fixedSpent += t.amountKurus
  }
  const { end } = periodRange(month, startDay)
  const from = addDays(today, 1)
  let remaining = 0
  if (from <= end) {
    for (const it of items) if (it.active) remaining += occurrencesBetween(it, from, end).length * it.amountKurus
    for (const p of plans) remaining += p.nextDates.filter((d) => d >= from && d <= end).length * p.monthlyKurus
  }
  return { fixedSpentKurus: fixedSpent, remainingKurus: remaining }
}

export interface RecurringSuggestion {
  key: string
  name: string
  amountKurus: number
  categoryId: string | null
  /** Bir sonraki tahmini ödeme günü. */
  startDate: IsoDate
  months: number
}

/**
 * Son aylarda her ay benzer tutar ve benzer günde tekrarlanan harcamaları düzenli ödeme olarak önerir.
 * Öneriler kullanıcı onaylamadan kaydedilmez.
 */
export function detectRecurring(txs: Transaction[], knownKeys: Set<string>, dismissed: Set<string>, today: IsoDate): RecurringSuggestion[] {
  const since = addMonthsClamped(today, -7)
  const groups = new Map<string, Transaction[]>()
  for (const t of txs) {
    if (t.type !== 'expense' || t.installment || t.date < since || t.date > today) continue
    if (t.source === 'shared' || t.source === 'settlement') continue
    const k = merchantKey(t.description)
    if (!k || knownKeys.has(k) || dismissed.has(k)) continue
    const arr = groups.get(k)
    if (arr) arr.push(t)
    else groups.set(k, [t])
  }
  const out: RecurringSuggestion[] = []
  for (const [key, list] of groups) {
    // Her aydan bir işlem (o ayın en büyüğü)
    const perMonth = new Map<string, Transaction>()
    for (const t of list) {
      const m = monthOf(t.date)
      const cur = perMonth.get(m)
      if (!cur || t.amountKurus > cur.amountKurus) perMonth.set(m, t)
    }
    if (perMonth.size < 3) continue
    // Bir ayda birden çok kez (ör. market) olan harcamalar düzenli ödeme sayılmaz
    if (list.length > perMonth.size + 1) continue
    const rows = [...perMonth.values()].sort((a, b) => a.date.localeCompare(b.date))
    const amounts = rows.map((r) => r.amountKurus).sort((a, b) => a - b)
    const median = amounts[Math.floor(amounts.length / 2)]
    if (amounts.some((a) => Math.abs(a - median) > median * 0.2)) continue
    const days = rows.map((r) => Number(r.date.slice(8, 10)))
    if (Math.max(...days) - Math.min(...days) > 6) continue
    const last = rows[rows.length - 1]
    if (addDays(last.date, 45) < today) continue
    let next = addMonthsClamped(last.date, 1)
    while (next < today) next = addMonthsClamped(next, 1)
    out.push({ key, name: cleanDescription(last.description), amountKurus: last.amountKurus, categoryId: last.categoryId, startDate: next, months: perMonth.size })
  }
  return out.sort((a, b) => b.amountKurus - a.amountKurus)
}
