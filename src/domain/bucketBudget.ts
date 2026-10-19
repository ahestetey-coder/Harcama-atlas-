import { AUTO_MAX_CATEGORIES, type AutoBudget } from './autoBudget'
import {
  CONSUMER_DEBT_LIMIT,
  CONSUMPTION_AT_TARGET,
  DTI_LIMIT,
  EMERGENCY_RANGE,
  HOUSING_LIMIT,
  LOW_INCOME_SAVING_RATE,
  MIN_SAVING_RATE,
  SAVING_RATE_TARGET,
  STARTER_MONTHS,
  TUIK_HBA_2025_BP,
  WANTS_FLOOR,
  WANTS_SHARE,
} from './assumptions'
import type { IncomeBasis, IncomeSource, Payday, UpcomingIncome } from './income'
import type { IncomeStability, SpendBreakdown } from './journey'

/**
 * Gelire göre dört kovalı bütçe: zorunlu sabitler, ihtiyaçlar, istekler, birikim ve borç kapatma.
 * Sabitler kayıtlardan gelir; ihtiyaçlar TÜİK paylarıyla başlar ve üç dönemde kişinin harcamasına
 * geçer; kalan tutar birikim merdiveniyle (önce %5 birikim, %10 istek, birikim %10'a, sonra %20'ye,
 * istekler en fazla %30'a, artan birikime) dağıtılır. Tutarlar tam sayı kuruştur; saf fonksiyonlar.
 */

export type CategoryBucket = 'need' | 'want' | 'fixed' | 'fee'
export type BucketKind = 'fixed' | 'needs' | 'wants' | 'saving'
export type RuleId = 'shortfall' | 'consumer' | 'dti' | 'housing' | 'saving'
export type SaveStage = 'starter' | 'debt' | 'emergency' | 'grow'

/** Zorunlu sabit gider satırı (kira, fatura, abonelik, borç ödemesi, banka ücreti). */
export interface FixedLine {
  /** 'rec:<id>' | 'inst:<id>' | 'stmt:<planKey>' | 'debt:<assetId>' | 'fee:bank' | 'profile:<field>' | 'journey:<group>' */
  key: string
  label: string
  kind: 'housing' | 'bill' | 'subscription' | 'debt' | 'fee'
  /** Yapısal aylık tutar (kovalar ve oranlar). */
  monthlyKurus: number
  /** Bu dönemde ödenecek tutar (harcama bütçesi). */
  periodKurus: number
  housing: boolean
  consumer: boolean
  /** Harcama bütçesinin içinde mi (kart/KMH ödemesi transferle ödenir, dışarıda kalır). */
  inSpending: boolean
  source: 'recurring' | 'statement' | 'asset' | 'history' | 'profile' | 'journey'
  estimated?: boolean
}

/** Limit adayı kategori: TÜİK başlangıç payı ve netleştirilmiş geçmiş ortalaması. */
export interface LimitCandidate {
  id: string
  bucket: 'need' | 'want'
  priorBp: number
  historyKurus: number
  order: number
}

export interface BucketInput {
  income: IncomeBasis
  fixed: FixedLine[]
  /** Yalnızca faizli tüketici borcu (kart, KMH, faizli kredi) bakiyesi. */
  consumerBalanceKurus: number
  goalsKurus: number
  /** Mevduat ve nakit; bilinmiyorsa null. */
  liquidKurus: number | null
  household: { stability: IncomeStability; dependents: number; earners: 1 | 2 | null }
  journeySpending: SpendBreakdown | null
  candidates: LimitCandidate[]
  history: { needKurus: number; wantKurus: number; months: number } | null
  payday: Payday | null
  /** Kategori limitleri ve haftalık bütçe (advancedBudget). */
  detail: boolean
  periodDays: number
}

export interface BucketBudget {
  incomeKurus: number
  /** Birikim kovası borca ayrılan ek tutarı (debtExtra) içerir. */
  buckets: Record<BucketKind, { kurus: number; pct: number }>
  /** Dönemlik harcama bütçesi (= AutoBudget.totalKurus). */
  spendKurus: number
  /** Harcama bütçesi dışındaki satırlar (kart/KMH ödemesi). */
  outsideKurus: number
  needs: { priorKurus: number; historyKurus: number | null; historyWeight: number }
  saving: { kurus: number; targetKurus: number; debtExtraKurus: number; cutKurus: number; lowIncome: boolean }
  oneOffKurus: number
  reservedKurus: number
  upcoming: UpcomingIncome[]
  destinations: { emergencyKurus: number; debtKurus: number; goalsKurus: number; growKurus: number; stage: SaveStage | null; monthsToStage: number | null }
  emergency: { essentialKurus: number; starterKurus: number; minMonths: number; maxMonths: number; liquidKurus: number | null }
  /** Oranlar gelirin payı (0..1). */
  checks: { housingPct: number; dtiPct: number; consumerPct: number; savingPct: number; mustHavePct: number }
  broken: RuleId[]
  alert: RuleId | null
  shortfallKurus: number
  categoryLimits: Record<string, number>
  weeklyKurus: number | null
  historyKurus: number | null
  cutPct: number
  payday: Payday | null
  salaryUpdateKurus: number | null
}

// ---------- Kategori → kova ve TÜİK başlangıç payları ----------

/** Varsayılan kategorilerin kovası. Kira/Ev hiç limitlenmez (kalan geçmişi ihtiyaçlara sayılır); banka ücreti sabit satırdır. */
export const CATEGORY_BUCKET: Record<string, CategoryBucket> = {
  'cat-market': 'need',
  'cat-akaryakit': 'need',
  'cat-ulasim': 'need',
  'cat-faturalar': 'need',
  'cat-saglik': 'need',
  'cat-egitim': 'need',
  'cat-bebek': 'need',
  'cat-restoran': 'want',
  'cat-giyim': 'want',
  'cat-eglence': 'want',
  'cat-diger': 'want',
  'cat-abonelik': 'want',
  'cat-kira': 'fixed',
  'cat-banka': 'fee',
}

const T = TUIK_HBA_2025_BP

/**
 * Kategorilerin kova içi başlangıç payı (baz puan). Kaynak: TÜİK Hanehalkı Bütçe Araştırması,
 * "Hanehalkı Tüketim Harcaması, 2025" (yayım 2 Haziran 2026, COICOP 2018). Birincil bülten
 * (veriportali.tuik.gov.tr) açılamadı; rakamlar 2025 değerleri birebir aynı olan iki aynadan alındı:
 * https://www.cnbce.com/veriler/tuik-son-tabloyu-acikladi-konut-kira-ulastirma-hangi-kaleme-ne-kadar-harcadik-h30893
 * https://www.dunya.com/kose-yazisi/kazanc-kira-mutfak-ve-yola-gidiyor/827124
 * Birincil bülten doğrulanmalı. Ulaştırmanın Akaryakıt/Ulaşım arasında yarı yarıya bölünmesi
 * varsayımdır. Konut ve kira (yükletilmiş kira içerir) ile sigorta ve finansal hizmetler dışarıda;
 * Bebek/Çocuk ve Abonelikler için yayımlanmış grup yok, yalnızca geçmişten pay alır.
 */
export const CATEGORY_PRIOR_BP: Record<string, number> = {
  'cat-market': T.food,
  'cat-akaryakit': T.transport / 2,
  'cat-ulasim': T.transport / 2,
  'cat-faturalar': T.communication,
  'cat-saglik': T.health,
  'cat-egitim': T.education,
  'cat-bebek': 0,
  'cat-restoran': T.restaurants,
  'cat-giyim': T.clothing,
  'cat-eglence': T.recreation,
  'cat-diger': T.furnishings + T.personalCare + T.alcoholTobacco,
  'cat-abonelik': 0,
}

// Türkçe harfler ASCII \b'de kelime sayılmadığı için sınır harf/rakam sınıfıyla kurulur
const word = (s: string) => `(?:^|[^\\p{L}\\p{N}])(?:${s})(?:$|[^\\p{L}\\p{N}])`
const FEE_RE = /faiz|banka|komisyon|kart ücreti/u
const FIXED_RE = new RegExp(`${word('kira|kirası')}|aidat|konut`, 'u')
const NEED_RE = new RegExp(
  `market|gıda|bakkal|manav|kasap|fırın|ulaşım|yakıt|akaryakıt|benzin|otopark|toplu taşıma|fatura|elektrik|doğalgaz|${word('su')}|internet|telefon|sağlık|eczane|ilaç|hastane|doktor|eğitim|okul|kurs|kırtasiye|bebek|çocuk|kreş|mama|sigorta|temizlik`,
  'u',
)

/** Kategorinin kovası: önce varsayılan kimlikler, yoksa addan tahmin; tanınmayan her şey istek. */
export function categoryBucketOf(categoryId: string, name: string): CategoryBucket {
  const known = CATEGORY_BUCKET[categoryId]
  if (known) return known
  const n = name.toLocaleLowerCase('tr')
  if (FEE_RE.test(n)) return 'fee'
  if (FIXED_RE.test(n)) return 'fixed'
  if (NEED_RE.test(n)) return 'need'
  return 'want'
}

// ---------- Motor ----------

const TL = 100
/** Geçmiş bu kadar dönemde tamamen esas alınır. */
const HISTORY_MONTHS = 3
/** Kova içinde en az bu payı alan kategoriler limitlenir. */
const MIN_LIMIT_SHARE = 0.03
/** Yolculuk testindeki "diğer" grubunun kapsadığı TÜİK grupları (1940) ve bunlardan ihtiyaç sayılanlar: sağlık + eğitim (400). */
const JOURNEY_OTHER_BP = T.furnishings + T.clothing + T.personalCare + T.alcoholTobacco + T.health + T.education
const JOURNEY_OTHER_NEED_BP = T.health + T.education
/** Hedef birikimde tüketime kalan pay, binde (tam sayı hesap için). */
const CONSUMPTION_PERMILLE = Math.round(CONSUMPTION_AT_TARGET * 1000)

const floorTo = (k: number, step: number) => Math.max(0, Math.floor(k / step) * step)
const total = (lines: FixedLine[], f: (l: FixedLine) => number) => lines.reduce((s, l) => s + f(l), 0)

/** İhtiyaçların başlangıç tahmini: Yolculuk testindeki harcama, yoksa gelir × TÜİK ihtiyaç payı × 0,8. */
function needsPrior(income: number, billsCovered: boolean, journey: SpendBreakdown | null): number {
  if (journey) return (journey.food ?? 0) + (journey.transport ?? 0) + Math.round(((journey.other ?? 0) * JOURNEY_OTHER_NEED_BP) / JOURNEY_OTHER_BP)
  // Faturalar sabit satırdaysa iletişim payı ihtiyaçlara ikinci kez girmez
  const needBp = T.food + T.transport + T.health + T.education + (billsCovered ? 0 : T.communication)
  return Math.round((income * needBp * CONSUMPTION_PERMILLE) / 10_000_000)
}

function emergencyRange(h: BucketInput['household']): readonly [number, number] {
  if (h.stability === 'irregular') return EMERGENCY_RANGE.irregular
  if (h.stability === 'variable' || h.dependents > 0 || h.earners === 1) return EMERGENCY_RANGE.singleOrDependents
  return EMERGENCY_RANGE.regular
}

/** Kova bütçesini kategorilere böler: TÜİK payı ile geçmiş payı geçmiş ağırlığıyla karışır. */
function rawLimits(budget: number, cands: LimitCandidate[], w: number) {
  const P = cands.reduce((s, c) => s + c.priorBp, 0)
  const H = cands.reduce((s, c) => s + c.historyKurus, 0)
  const wb = H > 0 ? w : 0
  // Kuruşa yuvarlama 50 TL'ye taban almadan önce: 4.499,99 → 4.450 hatasını önler
  return cands.map((c) => ({ c, raw: Math.round(budget * ((P > 0 ? ((1 - wb) * c.priorBp) / P : 0) + (H > 0 ? (wb * c.historyKurus) / H : 0))) }))
}

export function buildBucketBudget(input: BucketInput): BucketBudget | null {
  const inc = input.income
  const I = inc.monthlyKurus
  if (!(I > 0)) return null
  const lines = input.fixed
  const F = total(lines, (l) => l.monthlyKurus)
  const fSpend = total(lines, (l) => (l.inSpending ? l.periodKurus : 0))
  const outside = total(lines, (l) => (l.inSpending ? 0 : l.monthlyKurus))
  const H = total(lines, (l) => (l.housing ? l.monthlyKurus : 0))
  // Kira borç değildir; konut kredisi hem konut hem borçtur
  const D = total(lines, (l) => (l.kind === 'debt' ? l.monthlyKurus : 0))
  const Dc = total(lines, (l) => (l.consumer ? l.monthlyKurus : 0))
  const billsCovered = lines.some((l) => l.kind === 'bill')

  // İhtiyaçlar: başlangıç tahmini üç dönemde geçmiş ortalamaya geçer; bir tahmindir, kısılmaz
  const m = input.history ? Math.min(HISTORY_MONTHS, Math.max(0, input.history.months)) : 0
  const w = m / HISTORY_MONTHS
  const needHist = m > 0 ? Math.max(0, input.history!.needKurus) : 0
  const wantHist = m > 0 ? Math.max(0, input.history!.wantKurus) : 0
  const historyKurus = m > 0 ? needHist + wantHist : null
  const prior = needsPrior(I, billsCovered, input.journeySpending)
  const N = floorTo(Math.round(((HISTORY_MONTHS - m) * prior + m * needHist) / HISTORY_MONTHS), 100 * TL)

  // Birikim merdiveni
  const L = I - F - N
  const s5 = Math.round(I * LOW_INCOME_SAVING_RATE)
  const sMin = Math.round(I * MIN_SAVING_RATE)
  const wFloor = Math.round(I * WANTS_FLOOR)
  const target = Math.max(Math.max(0, input.goalsKurus), Math.round(I * SAVING_RATE_TARGET))
  const wCap = Math.round(I * WANTS_SHARE)
  const consumerCap = Math.round(I * CONSUMER_DEBT_LIMIT)
  const shortfall = Math.max(0, -L)
  let S = 0
  let W = 0
  let debtExtra = 0
  if (L >= 0) {
    let rem = L
    const take = (want: number) => {
      const x = Math.min(rem, Math.max(0, want))
      rem -= x
      return x
    }
    // 1) %5 birikim 2) %10 istek 3) birikim %10'a 4) birikim hedefe 5) istekler %30'a 6) artan birikime
    let saved = take(s5)
    W += take(wFloor)
    saved += take(sMin - saved)
    take(target - saved)
    W += take(wCap - W)
    // Kart ve kredi ödemeleri %20'yi aşıyorsa %10 taban üstündeki istekler borca gider
    if (Dc > consumerCap) {
      debtExtra = Math.min(Dc - consumerCap, Math.max(0, W - wFloor))
      W -= debtExtra
    }
    W = floorTo(W, 100 * TL)
    debtExtra = floorTo(debtExtra, 100 * TL)
    // Artan tutar ve yuvarlama artığı birikime: F + N + W + debtExtra + S = I
    S = I - F - N - W - debtExtra
  }
  const spendKurus = fSpend + N + W
  const lowIncome = shortfall === 0 && S < sMin
  const pct = (k: number) => k / I

  const broken: RuleId[] = []
  if (shortfall > 0) broken.push('shortfall')
  if (Dc > consumerCap) broken.push('consumer')
  if (D > Math.round(I * DTI_LIMIT)) broken.push('dti')
  if (H > Math.round(I * HOUSING_LIMIT)) broken.push('housing')
  if (lowIncome) broken.push('saving')

  // Acil durum fonu ve birikimin gideceği yer
  const E = F + N
  const starter = STARTER_MONTHS * E
  const [minMonths, maxMonths] = emergencyRange(input.household)
  const Lq = input.liquidKurus
  const oneOff = Math.max(0, inc.oneOffKurus)
  const consumerBalance = Math.max(0, input.consumerBalanceKurus)
  let destinations: BucketBudget['destinations']
  if (Lq === null) {
    // Birikim bilinmiyor: tamamı yol gösterici olarak acil durum fonuna yazılır
    destinations = { emergencyKurus: S + oneOff, debtKurus: debtExtra, goalsKurus: 0, growKurus: 0, stage: null, monthsToStage: null }
  } else {
    const starterGap = Math.max(0, starter - Lq)
    const fullGap = Math.max(0, minMonths * E - Lq)
    const pool = (r: number) => {
      const st = Math.min(r, starterGap)
      r -= st
      // İstekten borca ayrılan tutar bakiyeden önce düşülür
      const debt = Math.min(r, Math.max(0, consumerBalance - debtExtra))
      r -= debt
      const goals = Math.min(r, Math.max(0, input.goalsKurus))
      r -= goals
      const em = Math.min(r, Math.max(0, fullGap - st))
      r -= em
      return { starter: st, debt, goals, emergency: em, grow: r }
    }
    const all = pool(S + oneOff)
    const stage: SaveStage = Lq < starter ? 'starter' : consumerBalance > 0 ? 'debt' : Lq < minMonths * E ? 'emergency' : 'grow'
    let monthsToStage: number | null = null
    if (stage !== 'grow') {
      // Kaç maaş günü (bu dönem dahil): bu dönemin ek geliri düşülür, kalan açık aylık birikimle kapanır
      const gap = stage === 'starter' ? starterGap : stage === 'debt' ? consumerBalance : fullGap
      const monthly = pool(S)
      const flow = monthly[stage] + (stage === 'debt' ? debtExtra : 0)
      const rest = Math.max(0, gap - (all[stage] - monthly[stage]))
      monthsToStage = rest === 0 ? 0 : flow > 0 ? Math.ceil(rest / flow) : null
    }
    destinations = { emergencyKurus: all.starter + all.emergency, debtKurus: debtExtra + all.debt, goalsKurus: all.goals, growKurus: all.grow, stage, monthsToStage }
  }

  // Kategori limitleri ve haftalık bütçe (Plus)
  let categoryLimits: Record<string, number> = {}
  let weeklyKurus: number | null = null
  let cutPct = 0
  if (input.detail) {
    const flexible = N + W
    const cands = input.candidates.map((c) => ({
      ...c,
      priorBp: billsCovered && c.id === 'cat-faturalar' ? 0 : Math.max(0, c.priorBp),
      historyKurus: Math.max(0, c.historyKurus),
    }))
    const raws = [
      ...rawLimits(N, cands.filter((c) => c.bucket === 'need'), w),
      ...rawLimits(W, cands.filter((c) => c.bucket === 'want'), w),
    ]
    const minRaw = Math.round(MIN_LIMIT_SHARE * flexible)
    categoryLimits = Object.fromEntries(
      raws
        .filter((r) => r.raw >= minRaw)
        .sort((a, b) => b.raw - a.raw || a.c.order - b.c.order)
        .slice(0, AUTO_MAX_CATEGORIES)
        .map((r) => [r.c.id, floorTo(r.raw, 50 * TL)] as const)
        .filter(([, v]) => v > 0),
    )
    weeklyKurus = floorTo(Math.round((flexible * 7) / Math.max(1, input.periodDays)), 50 * TL) || null
    cutPct = historyKurus !== null && historyKurus > flexible ? Math.round((1 - flexible / historyKurus) * 100) : 0
  }

  return {
    incomeKurus: I,
    buckets: {
      fixed: { kurus: F, pct: pct(F) },
      needs: { kurus: N, pct: pct(N) },
      wants: { kurus: W, pct: pct(W) },
      saving: { kurus: S + debtExtra, pct: pct(S + debtExtra) },
    },
    spendKurus,
    outsideKurus: outside,
    needs: { priorKurus: prior, historyKurus: m > 0 ? needHist : null, historyWeight: w },
    saving: { kurus: S, targetKurus: target, debtExtraKurus: debtExtra, cutKurus: Math.max(0, target - S), lowIncome },
    oneOffKurus: inc.oneOffKurus,
    reservedKurus: inc.reservedKurus,
    upcoming: inc.upcoming,
    destinations,
    emergency: { essentialKurus: E, starterKurus: starter, minMonths, maxMonths, liquidKurus: Lq },
    checks: { housingPct: pct(H), dtiPct: pct(D), consumerPct: pct(Dc), savingPct: pct(S + debtExtra), mustHavePct: pct(F + N) },
    broken,
    alert: broken[0] ?? null,
    shortfallKurus: shortfall,
    categoryLimits,
    weeklyKurus,
    historyKurus,
    cutPct,
    payday: input.payday,
    salaryUpdateKurus: inc.salaryUpdateKurus,
  }
}

/** Harcama bütçesindeki sabit satırların dönem tutarı: düzenli ödemeler (konut, fatura, abonelik, ücret) ve borç ödemeleri. */
export function fixedSpendSplit(lines: FixedLine[]): { recurringKurus: number; debtKurus: number } {
  const inSpend = lines.filter((l) => l.inSpending)
  return {
    recurringKurus: total(inSpend, (l) => (l.kind === 'debt' ? 0 : l.periodKurus)),
    debtKurus: total(inSpend, (l) => (l.kind === 'debt' ? l.periodKurus : 0)),
  }
}

/** Dört kovalı bütçeyi koçun mevcut bütçe biçimine çevirir (alanların anlamı değişmez). */
export function toAutoBudget(b: BucketBudget, source: IncomeSource, goalsKurus: number, recurringKurus: number, debtKurus: number): AutoBudget {
  const saving = b.saving.kurus + b.saving.debtExtraKurus
  const goals = Math.min(Math.max(0, goalsKurus), b.saving.kurus)
  return {
    incomeKurus: b.incomeKurus,
    incomeSource: source,
    savingKurus: saving,
    goalsKurus: goals,
    extraSavingKurus: saving - goals,
    savingCutKurus: b.saving.cutKurus,
    recurringKurus,
    debtKurus,
    flexibleKurus: b.buckets.needs.kurus + b.buckets.wants.kurus,
    totalKurus: b.spendKurus,
    weeklyKurus: b.weeklyKurus,
    categoryLimits: b.categoryLimits,
    historyKurus: b.historyKurus,
    cutPct: b.cutPct,
    shortfallKurus: b.shortfallKurus,
    buckets: b,
  }
}
