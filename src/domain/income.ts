import { addDays, addMonths, dayOf, daysInMonth, diffDays, normalizeStartDay, periodOf, periodRange, previousBusinessDay, toIsoDate } from './dates'
import type { JourneyProfile } from './journey'
import type { IncomeCadence, IsoDate, MonthKey, RecurringCadence, RecurringIncome, Settings, Transaction } from './types'

/**
 * Gelir tabanı: bütçenin dayandığı aylık gelir. Maaş ve düzenli gelir tanımları önceliklidir;
 * düzensiz gelir temkinli (son dönemlerin en düşüğü) sayılır, tek seferlik gelir tabana girmez.
 * Saf fonksiyonlar; cihazda çalışır.
 */

export type IncomeSource = 'plan' | 'records' | 'journey'

export interface UpcomingIncome {
  id: string
  name: string
  date: IsoDate
  amountKurus: number
}

export interface IncomeMatch {
  txId: string
  incomeId: string
  nominal: IsoDate
  raise: boolean
  /** Maaş bandının altında (A ÷ 1,6'ya kadar): eski ya da düşük maaş; tabanı değiştirmez. */
  low?: boolean
}

export interface Payday {
  nominal: IsoDate
  date: IsoDate
  shifted: boolean
}

export interface IncomeBasis {
  /** Aylık gelir tabanı (I). */
  monthlyKurus: number
  source: IncomeSource
  /** Tanımlı gelirlerin katkısı. */
  plannedKurus: number
  irregularKurus: number
  /** Bu dönemdeki tek seferlik/fazla gelir; tabana girmez. */
  oneOffKurus: number
  /** Bu dönem gelen yıllık gelirin ileriki aylara ayrılan kısmı: A − round(A/12). */
  reservedKurus: number
  upcoming: UpcomingIncome[]
  /** Maaş zammı görünüyorsa son maaş tutarı. */
  salaryUpdateKurus: number | null
  confidence: 'high' | 'low'
}

/** Gerçek gelir, tanımlı tutardan en çok bu oranda farklıysa aynı gelir sayılır (en az 1 TL). */
export const SALARY_TOLERANCE = 0.15
/** Maaşın bu katına kadar olan gelir zam sayılır; üstü (ör. ikramiye) eşleşmez. */
export const SALARY_RAISE_MAX = 1.6

/** Eşleştirmede gerçek gelir tarihinin nominal tarihten en çok uzaklığı (gün). */
const MATCH_DAYS = 10
/** Tanımdan geriye doğru kaç tarih yürünür: tanımdan önce girilmiş gelirler de eşleşsin. */
const N_BACK: Record<RecurringCadence, number> = { monthly: 24, weekly: 104, yearly: 3 }

/** Aylık karşılık: haftalık × 52/12, yıllık ÷ 12; tek seferlik gelir tabana girmez. */
export function monthlyEquivalent(amountKurus: number, cadence: IncomeCadence): number {
  if (cadence === 'weekly') return Math.round((amountKurus * 52) / 12)
  if (cadence === 'yearly') return Math.round(amountKurus / 12)
  if (cadence === 'once') return 0
  return amountKurus
}

/** n. nominal tarih (0 = startDate; negatif n geriye). recurring.ts'deki nthDue ile aynı kural; döngüsel içe aktarma olmasın diye burada. */
function nthDate(cadence: RecurringCadence, startDate: IsoDate, n: number): IsoDate {
  if (cadence === 'weekly') return addDays(startDate, 7 * n)
  const [y, m, d] = startDate.split('-').map(Number)
  const idx = y * 12 + (m - 1) + (cadence === 'yearly' ? 12 * n : n)
  const ny = Math.floor(idx / 12)
  const nm = (idx % 12) + 1
  return toIsoDate(ny, nm, Math.min(d, daysInMonth(ny, nm)))
}

/**
 * [from, to] aralığındaki nominal gelir tarihleri (hafta sonuna kaydırılmaz). Tek seferlik gelirde
 * yalnızca startDate; diğerlerinde startDate'ten geriye de yürünür (aylık 24, haftalık 104, yıllık 3 tarih).
 */
export function incomeDates(def: Pick<RecurringIncome, 'cadence' | 'startDate'>, from: IsoDate, to: IsoDate): IsoDate[] {
  if (def.cadence === 'once') return def.startDate >= from && def.startDate <= to ? [def.startDate] : []
  const cadence = def.cadence
  // Aralık startDate'ten çok sonraysa baştan yürümek yerine ileri atla (adım en çok 7/31/366 gün)
  const span = diffDays(from, def.startDate)
  const step = cadence === 'weekly' ? 7 : cadence === 'monthly' ? 31 : 366
  const out: IsoDate[] = []
  const first = span > 0 ? Math.floor(span / step) - 1 : -N_BACK[cadence]
  for (let n = first; n < first + 10_000; n++) {
    const d = nthDate(cadence, def.startDate, n)
    if (!(d <= to)) break
    if (d >= from) out.push(d)
  }
  return out
}

/** Birincil maaş: etkin, aylık maaş gelirlerinden en yükseği; eşitse ilk eklenen. */
export function primarySalary(incomes: RecurringIncome[] | undefined): RecurringIncome | null {
  let best: RecurringIncome | null = null
  for (const i of incomes ?? []) {
    if (!i.active || i.kind !== 'salary' || i.cadence !== 'monthly') continue
    if (!best || i.amountKurus > best.amountKurus || (i.amountKurus === best.amountKurus && i.createdAt < best.createdAt)) best = i
  }
  return best
}

/** Kişisel ay döngüsünün başlangıç günü. Maaş gününe bağlıysa 29–31 → 28 (normalize etmeden önce kırpılır; yoksa 31 → 1 olurdu). */
export function personalCycleDay(s: Pick<Settings, 'cycleSource' | 'cycleStartDay' | 'recurringIncomes'>): number {
  if (s.cycleSource === 'salary') {
    const salary = primarySalary(s.recurringIncomes)
    if (salary) return normalizeStartDay(Math.min(28, dayOf(salary.startDate)))
  }
  return normalizeStartDay(s.cycleStartDay)
}

/** Bir sonraki maaşın yatacağı gün: hafta sonundaysa önceki Cuma. */
export function nextPayday(salary: RecurringIncome, today: IsoDate): Payday {
  const pick = (to: IsoDate) => incomeDates(salary, addDays(today, -3), to).find((n) => previousBusinessDay(n) >= today)
  // Aylık maaşta 40 gün yeter; yıllık/haftalık gibi tanımlar için daha geniş pencere
  const nominal = pick(addDays(today, 40)) ?? pick(addDays(today, 400)) ?? salary.startDate
  const date = previousBusinessDay(nominal)
  return { nominal, date, shifted: date !== nominal }
}

function tolerance(amountKurus: number): number {
  return Math.max(100, Math.round(amountKurus * SALARY_TOLERANCE))
}

/** Aynı gelir bandı: |tutar − A| ≤ max(1 TL, %15). */
function inBand(amountKurus: number, a: number): boolean {
  return Math.abs(amountKurus - a) <= tolerance(a)
}

/** Zam bandı: bandın üstü, A × 1,6'ya kadar. */
function inRaiseBand(amountKurus: number, a: number): boolean {
  return amountKurus > a + tolerance(a) && amountKurus <= Math.round(a * SALARY_RAISE_MAX)
}

/** Düşük maaş bandı: bandın altı, A ÷ 1,6'ya kadar (maaş tanımı güncellenmeden önceki maaşlar). */
function inLowBand(amountKurus: number, a: number): boolean {
  return amountKurus < a - tolerance(a) && amountKurus >= Math.round(a / SALARY_RAISE_MAX)
}

/** Eşleştirme sırası: önce maaş, sonra büyük tutar, sonra kimlik. */
function byPriority(a: RecurringIncome, b: RecurringIncome): number {
  return Number(b.kind === 'salary') - Number(a.kind === 'salary') || b.amountKurus - a.amountKurus || a.id.localeCompare(b.id)
}

/** Adaylardan tutarı en yakın, sonra tarihi en yakın, sonra en erken olan. */
function closest(cands: Transaction[], a: number, nominal: IsoDate): Transaction | null {
  const by = (t: Transaction) => [Math.abs(t.amountKurus - a), Math.abs(diffDays(t.date, nominal))]
  return (
    [...cands].sort((x, y) => {
      const [ax, dx] = by(x)
      const [ay, dy] = by(y)
      return ax - ay || dx - dy || x.date.localeCompare(y.date) || x.id.localeCompare(y.id)
    })[0] ?? null
  )
}

/**
 * Gerçek gelir kayıtlarını gelir tanımlarının nominal tarihleriyle eşleştirir. `range` tanım başına
 * bakılacak tarih aralığını verir (null: atla); pasif tanımlar eşleşmez. Her kayıt bir kez kullanılır.
 * 1. tur: ±10 gün, tutar ±%15 (en az 1 TL). 2. tur (yalnızca aylık maaş, 1. turda boş kalan tarihler):
 * ±10 gün, %15'in üstü ile 1,6 kat arası → zam. İkramiye gibi 2 kat gelir eşleşmez.
 * Planlı (source 'planned') kayıtlar yok sayılır. Anahtar: işlem kimliği.
 */
export function matchIncomes(real: Transaction[], defs: RecurringIncome[], range: (d: RecurringIncome) => { from: IsoDate; to: IsoDate } | null): Map<string, IncomeMatch> {
  const pool = real.filter((t) => t.type === 'income' && t.source !== 'planned')
  const out = new Map<string, IncomeMatch>()
  const slots: { def: RecurringIncome; nominal: IsoDate }[] = []
  for (const def of defs.filter((d) => d.active).sort(byPriority)) {
    const r = range(def)
    if (!r) continue
    for (const nominal of incomeDates(def, r.from, r.to)) slots.push({ def, nominal })
  }
  const near = (nominal: IsoDate, ok: (amount: number) => boolean) => pool.filter((t) => !out.has(t.id) && Math.abs(diffDays(t.date, nominal)) <= MATCH_DAYS && ok(t.amountKurus))
  const open: typeof slots = []
  for (const s of slots) {
    const a = s.def.amountKurus
    const hit = closest(near(s.nominal, (x) => inBand(x, a)), a, s.nominal)
    if (hit) out.set(hit.id, { txId: hit.id, incomeId: s.def.id, nominal: s.nominal, raise: false })
    else open.push(s)
  }
  const salaries = open.filter((s) => s.def.kind === 'salary' && s.def.cadence === 'monthly')
  const still: typeof slots = []
  for (const s of salaries) {
    const a = s.def.amountKurus
    const hit = closest(near(s.nominal, (x) => inRaiseBand(x, a)), a, s.nominal)
    if (hit) out.set(hit.id, { txId: hit.id, incomeId: s.def.id, nominal: s.nominal, raise: true })
    else still.push(s)
  }
  // 3. tur: maaş tanımı değişmeden önceki (ya da düşen) maaşlar ek gelir sayılmasın
  for (const s of still) {
    const a = s.def.amountKurus
    const hit = closest(near(s.nominal, (x) => inLowBand(x, a)), a, s.nominal)
    if (hit) out.set(hit.id, { txId: hit.id, incomeId: s.def.id, nominal: s.nominal, raise: false, low: true })
  }
  return out
}

/**
 * Bütçenin aylık gelir tabanı (I). Tanımlı gelirler (maaşta son gerçek maaş daha düşükse o) + temkinli
 * düzensiz gelir (en az 2 kayıtlı dönemin en düşüğü). Tek seferlik ve fazla gelir yalnızca bu dönemin
 * ek geliridir, tabana girmez. Hiç gelir yoksa: son dönem kayıtları, sonra Yolculuk testi, yoksa null.
 */
export function incomeBasis(a: {
  txs: Transaction[]
  incomes: RecurringIncome[]
  startDay: number
  today: IsoDate
  journey: Pick<JourneyProfile, 'monthlyIncomeKurus' | 'passiveIncomeKurus'> | null
}): IncomeBasis | null {
  const { startDay, today } = a
  const P = periodOf(today, startDay)
  const { start: ps, end: pe } = periodRange(P, startDay)
  const prev = addMonths(P, -1)
  const completed = [prev, addMonths(P, -2), addMonths(P, -3)]
  const real = a.txs.filter((t) => t.source !== 'planned')
  const realIncome = real.filter((t) => t.type === 'income')
  const active = a.incomes.filter((d) => d.active)

  // Eşleştirme penceresi bugünden 10 gün ileri uzanır: günü henüz gelmemiş maaş erken yattıysa ek gelir sayılmasın
  const window = { from: addDays(periodRange(completed[2], startDay).start, -MATCH_DAYS), to: addDays(today, MATCH_DAYS) }
  const matches = matchIncomes(realIncome, active, () => window)
  const txById = new Map(realIncome.map((t) => [t.id, t]))

  // Kayıtlı dönemler ve dönem başına eşleşmeyen gelir
  // Kayıtlı dönem: ilk kayıttan önce başlamış (kısmen kaydedilmiş ilk ay sayılmaz)
  const first = real.reduce<IsoDate | null>((m, t) => (m === null || t.date < m ? t.date : m), null)
  const covered = new Set<MonthKey>()
  const unmatched = new Map<MonthKey, number>()
  let unmatchedNow = 0
  for (const t of real) {
    const p = periodOf(t.date, startDay)
    if (first !== null && first <= periodRange(p, startDay).start) covered.add(p)
    if (t.type !== 'income' || matches.has(t.id)) continue
    unmatched.set(p, (unmatched.get(p) ?? 0) + t.amountKurus)
    if (t.date >= ps && t.date <= today) unmatchedNow += t.amountKurus
  }

  const salary = primarySalary(active)
  let planned = 0
  let oneOff = 0
  let reserved = 0
  let salaryUpdate: number | null = null
  const upcoming: UpcomingIncome[] = []
  const recent = new Set([P, prev])
  for (const d of active) {
    const amount = d.amountKurus
    if (d.cadence === 'monthly' || d.cadence === 'weekly') {
      if (d.startDate > pe) continue
      let eff = amount
      if (d.kind === 'salary' && d.cadence === 'monthly') {
        const own = [...matches.values()]
          .filter((m) => m.incomeId === d.id && recent.has(periodOf(m.nominal, startDay)))
          .sort((x, y) => y.nominal.localeCompare(x.nominal) || txById.get(y.txId)!.date.localeCompare(txById.get(x.txId)!.date))
        // Yıl içinde gelir vergisi dilimi artınca net maaş düşer: son gerçek maaş daha düşükse o esas alınır
        const lastNormal = own.find((m) => !m.raise && !m.low)
        if (lastNormal) eff = Math.min(amount, txById.get(lastNormal.txId)!.amountKurus)
        // Zam ipucu yalnızca birincil maaşta ve en son eşleşme zamsa; taban değişmez
        if (d.id === salary?.id && own[0]?.raise) salaryUpdate = txById.get(own[0].txId)!.amountKurus
      }
      planned += monthlyEquivalent(eff, d.cadence)
    } else if (d.cadence === 'yearly') {
      if (d.startDate > today) {
        upcoming.push({ id: d.id, name: d.name, date: d.startDate, amountKurus: amount })
        continue
      }
      planned += monthlyEquivalent(amount, 'yearly')
      // Bu dönem gelen yıllık gelirin 11/12'si ileriki aylara ayrılır
      if (incomeDates(d, ps, today).length) reserved += amount - monthlyEquivalent(amount, 'yearly')
    } else {
      if (d.startDate > today) upcoming.push({ id: d.id, name: d.name, date: d.startDate, amountKurus: amount })
      else if (d.startDate >= ps) oneOff += amount
    }
  }

  const coveredPeriods = completed.filter((p) => covered.has(p))
  const irregular = coveredPeriods.length >= 2 ? Math.min(...coveredPeriods.map((p) => unmatched.get(p) ?? 0)) : 0
  oneOff += Math.max(0, unmatchedNow - irregular)

  let monthly = planned + irregular
  let source: IncomeSource = planned > 0 ? 'plan' : 'records'
  let confidence: IncomeBasis['confidence'] = planned > 0 || coveredPeriods.length === 3 ? 'high' : 'low'
  if (monthly === 0) {
    const prevSum = unmatched.get(prev) ?? 0
    confidence = 'low'
    if (unmatchedNow > 0 || prevSum > 0) {
      // Bu dönemin kaydı henüz eksik olabilir: geçen dönemle büyük olanı taban olur; bu dönemki ek gelir sayılmaz
      monthly = Math.max(unmatchedNow, prevSum)
      oneOff -= unmatchedNow
    } else if (a.journey) {
      const rent = active.some((d) => d.kind === 'rent')
      monthly = (a.journey.monthlyIncomeKurus || 0) + (rent ? 0 : (a.journey.passiveIncomeKurus ?? 0))
      source = 'journey'
    }
    if (monthly <= 0) return null
  }

  return {
    monthlyKurus: monthly,
    source,
    plannedKurus: planned,
    irregularKurus: irregular,
    oneOffKurus: Math.max(0, oneOff),
    reservedKurus: reserved,
    upcoming: upcoming.sort((x, y) => x.date.localeCompare(y.date) || x.name.localeCompare(y.name, 'tr')),
    salaryUpdateKurus: salaryUpdate,
    confidence,
  }
}

/**
 * Hafta sonuna denk gelen maaş önceki iş günü yatar; o kayıt yine maaş gününün dönemine sayılsın diye
 * yalnızca hesaba giren listede (counted) tarihi nominal güne taşınır. Yalnızca ay döngüsü maaş gününe
 * bağlıyken (cycleSource 'salary') çağrılmalıdır. `moved`: işlem kimliği → sayıldığı gün.
 */
export function attributeEarlySalary(counted: Transaction[], salary: RecurringIncome, today: IsoDate): { txs: Transaction[]; moved: Map<string, IsoDate> } {
  const moved = new Map<string, IsoDate>()
  const a = salary.amountKurus
  const cands = counted.filter((t) => t.type === 'income' && t.source !== 'planned' && (inBand(t.amountKurus, a) || inRaiseBand(t.amountKurus, a)))
  if (!cands.length) return { txs: counted, moved }
  for (const n of incomeDates(salary, addDays(today, -400), addDays(today, 3))) {
    const pay = previousBusinessDay(n)
    // Maaş zaten nominal günde kayıtlıysa taşınacak bir şey yok (tekrar çağrıda da aynı sonuç)
    if (pay >= n || cands.some((t) => t.date === n)) continue
    const hit = closest(cands.filter((t) => !moved.has(t.id) && t.date >= pay && t.date < n), a, n)
    if (hit) moved.set(hit.id, n)
  }
  if (!moved.size) return { txs: counted, moved }
  return { txs: counted.map((t) => (moved.has(t.id) ? { ...t, date: moved.get(t.id)! } : t)), moved }
}
