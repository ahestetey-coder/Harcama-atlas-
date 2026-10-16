/**
 * Web'deki "Finansal Harita" hızlı testi (10 soru, aralıklı cevaplar).
 *
 * Ayrı bir hesap motoru yoktur: cevaplar tahmini bir JourneyProfile + JourneyFacts çiftine çevrilir
 * ve uygulamanın kendi Özgürlük Rotası motoru (buildJourney, 8 aşama) çalıştırılır. Böylece web
 * sonucu ile uygulamadaki rota aynı kurallarla hesaplanır. Uygulamada kişi "Rotamı netleştir"
 * dediğinde aynı cevaplar Finansal özgürlük testine ön doldurma olarak verilir (seedProfile).
 */
import { SAVING_GROWTH_PCT } from './assumptions'
import type { CoachDebt } from './coach'
import { buildFreedomPlan, buildJourney, SPEND_GROUPS, type FreedomPlan, type JourneyFacts, type JourneyGoal, type JourneyProfile, type JourneyResult, type SpendBreakdown, type StageId } from './journey'

export const QUICK_TEST_VERSION = 1

export type QuickGoal = 'calismadan_gecinmek' | 'borcsuz' | 'erken_emeklilik' | 'guvence'
export type IncomeBand = 'g1' | 'g2' | 'g3' | 'g4' | 'g5'
export type LeftBand = 'eksi' | 'az' | 'orta' | 'iyi'
export type DebtState = 'yok' | 'kart_tam' | 'kredi_rahat' | 'zor'
export type CushionBand = 'a0' | 'a1' | 'a3' | 'a6'
export type SavingsBand = 'b0' | 'b1' | 'b2' | 'b3' | 'b4'
export type AssetPlace = 'mevduat' | 'doviz' | 'altin' | 'hisseFon' | 'kripto' | 'bes'
export type InvestHabit = 'hayir' | 'arasira' | 'her_ay'
export type DropReaction = 'sat' | 'bekle' | 'al'

export interface QuickAnswers {
  v: typeof QUICK_TEST_VERSION
  amac: QuickGoal
  /** Hayal edilen aylık pasif gelir (TL, bugünün parasıyla). */
  hayal: number
  gelir: IncomeBand
  kalan: LeftBand
  borc: DebtState
  acil: CushionBand
  birikim: SavingsBand
  nerede: AssetPlace[]
  yatirim: InvestHabit
  dusus: DropReaction
}

type Opt<T extends string> = { id: T; label: string; icon?: string }

/** Soru metinleri; web sayfası ve uygulama aynı listeyi kullanır. */
export const QUICK_QUESTIONS = [
  {
    id: 'amac',
    kind: 'cards',
    title: 'Finansal özgürlük sana ne ifade ediyor?',
    hint: 'Rotanın varış noktasını bu belirler.',
    options: [
      { id: 'calismadan_gecinmek', label: 'Çalışmasam da geçinebilmek', icon: 'sun' },
      { id: 'borcsuz', label: 'Hiç borcum olmaması', icon: 'unlink' },
      { id: 'erken_emeklilik', label: 'Erken emekli olmak', icon: 'hourglass' },
      { id: 'guvence', label: 'Ailemi güvenceye almak', icon: 'shield' },
    ] as Opt<QuickGoal>[],
  },
  { id: 'hayal', kind: 'slider', title: 'Ayda ne kadar pasif gelir seni özgür hissettirir?', hint: 'Bugünün fiyatlarıyla düşün.', min: 10000, max: 500000, step: 5000, def: 60000 },
  {
    id: 'gelir',
    kind: 'list',
    title: 'Hanene her ay giren net gelir ne kadar?',
    hint: 'Maaş ve ek gelirler dahil.',
    options: [
      { id: 'g1', label: '25.000 TL altı' },
      { id: 'g2', label: '25.000 – 50.000 TL' },
      { id: 'g3', label: '50.000 – 100.000 TL' },
      { id: 'g4', label: '100.000 – 200.000 TL' },
      { id: 'g5', label: '200.000 TL üstü' },
    ] as Opt<IncomeBand>[],
  },
  {
    id: 'kalan',
    kind: 'list',
    title: 'Ay sonunda elinde ne kalıyor?',
    hint: 'Tüm harcama ve taksitlerden sonra.',
    options: [
      { id: 'eksi', label: 'Ay sonunu getiremiyorum' },
      { id: 'az', label: "Çok az, gelirimin %10'undan az" },
      { id: 'orta', label: "Gelirimin %10–20'si" },
      { id: 'iyi', label: "Gelirimin %20'sinden fazlası" },
    ] as Opt<LeftBand>[],
  },
  {
    id: 'borc',
    kind: 'list',
    title: 'Borç tarafında durumun hangisine yakın?',
    hint: 'Kredi kartı, kredi, KMH dahil.',
    options: [
      { id: 'yok', label: 'Hiç borcum yok', icon: 'check' },
      { id: 'kart_tam', label: 'Sadece kart, her ay tamamını ödüyorum', icon: 'card' },
      { id: 'kredi_rahat', label: 'Kredi taksitlerim var, rahat ödüyorum', icon: 'calendar' },
      { id: 'zor', label: 'Taksitler zorluyor, kartta asgari ödediğim oluyor', icon: 'alert' },
    ] as Opt<DebtState>[],
  },
  {
    id: 'acil',
    kind: 'list',
    title: 'Gelirin yarın kesilse kaç ay idare edersin?',
    hint: 'Sadece hemen ulaşabildiğin parayla.',
    options: [
      { id: 'a0', label: '1 aydan az' },
      { id: 'a1', label: '1 – 3 ay' },
      { id: 'a3', label: '3 – 6 ay' },
      { id: 'a6', label: '6 aydan fazla' },
    ] as Opt<CushionBand>[],
  },
  {
    id: 'birikim',
    kind: 'list',
    title: 'Toplam birikimin yaklaşık ne kadar?',
    hint: 'Oturduğun ev hariç.',
    options: [
      { id: 'b0', label: 'Henüz birikimim yok' },
      { id: 'b1', label: '100.000 TL altı' },
      { id: 'b2', label: '100.000 – 500.000 TL' },
      { id: 'b3', label: '500.000 – 2 milyon TL' },
      { id: 'b4', label: '2 milyon TL üstü' },
    ] as Opt<SavingsBand>[],
  },
  {
    id: 'nerede',
    kind: 'multi',
    title: 'Birikimin nerede duruyor?',
    hint: 'Birden fazla seçebilirsin.',
    options: [
      { id: 'mevduat', label: 'Mevduat / nakit', icon: 'bank' },
      { id: 'doviz', label: 'Döviz', icon: 'dollar' },
      { id: 'altin', label: 'Altın', icon: 'gold' },
      { id: 'hisseFon', label: 'Hisse / fon', icon: 'chart' },
      { id: 'kripto', label: 'Kripto', icon: 'hex' },
      { id: 'bes', label: 'BES', icon: 'piggy' },
    ] as Opt<AssetPlace>[],
  },
  {
    id: 'yatirim',
    kind: 'list',
    title: 'Düzenli yatırım yapıyor musun?',
    hint: 'Her ay belli bir tutarı kenara ayırmak.',
    options: [
      { id: 'hayir', label: 'Hayır' },
      { id: 'arasira', label: 'Ara sıra, para artarsa' },
      { id: 'her_ay', label: 'Evet, her ay düzenli' },
    ] as Opt<InvestHabit>[],
  },
  {
    id: 'dusus',
    kind: 'list',
    title: 'Yatırımın bir ayda %20 düşse ne yaparsın?',
    hint: 'İlk tepkini seç.',
    options: [
      { id: 'sat', label: 'Satıp kurtulurum', icon: 'down' },
      { id: 'bekle', label: 'Sakin kalıp beklerim', icon: 'pause' },
      { id: 'al', label: 'Fırsat bilip alırım', icon: 'up' },
    ] as Opt<DropReaction>[],
  },
] as const

export type QuickQuestion = (typeof QUICK_QUESTIONS)[number]
export type QuickQuestionId = QuickQuestion['id']

// ---------- Aralıkların tahmini karşılıkları (TL) ----------

const INCOME_TL: Record<IncomeBand, number> = { g1: 20000, g2: 37500, g3: 75000, g4: 150000, g5: 260000 }
const LEFT_RATE: Record<LeftBand, number> = { eksi: -0.05, az: 0.05, orta: 0.15, iyi: 0.3 }
const CUSHION_MONTHS: Record<CushionBand, number> = { a0: 0.5, a1: 2, a3: 4.5, a6: 8 }
const SAVINGS_TL: Record<SavingsBand, number> = { b0: 0, b1: 50000, b2: 250000, b3: 1000000, b4: 3000000 }
const INVEST_RATE: Record<InvestHabit, number> = { hayir: 0, arasira: 0.03, her_ay: 0.1 }
/** Tahmini harcamanın 6 gruba dağılımı (yalnızca uygulamada harcama kaydı yoksa kullanılır). */
const SPEND_SHARE: SpendBreakdown = { housing: 0.32, food: 0.24, transport: 0.12, bills: 0.1, fun: 0.12, other: 0.1 }
const GOAL_MAP: Record<QuickGoal, JourneyGoal> = { calismadan_gecinmek: 'independence', borcsuz: 'security', erken_emeklilik: 'early-retire', guvence: 'security' }
/** Likit sayılan yerler (uygulamadaki LIQUID kümesiyle aynı mantık: mevduat, döviz, altın, fon). */
const LIQUID_PLACES: AssetPlace[] = ['mevduat', 'doviz', 'altin', 'hisseFon']

const K = 100 // TL → kuruş
const r100 = (tl: number) => Math.round(tl / 100) * 100

export function isQuickAnswers(v: unknown): v is QuickAnswers {
  if (!v || typeof v !== 'object') return false
  const a = v as Record<string, unknown>
  const has = <T extends string>(k: string, ids: readonly T[]) => typeof a[k] === 'string' && (ids as readonly string[]).includes(a[k] as string)
  return (
    a.v === QUICK_TEST_VERSION &&
    has('amac', Object.keys(GOAL_MAP)) &&
    typeof a.hayal === 'number' &&
    a.hayal >= 1000 &&
    a.hayal <= 10_000_000 &&
    has('gelir', Object.keys(INCOME_TL)) &&
    has('kalan', Object.keys(LEFT_RATE)) &&
    has('borc', ['yok', 'kart_tam', 'kredi_rahat', 'zor']) &&
    has('acil', Object.keys(CUSHION_MONTHS)) &&
    has('birikim', Object.keys(SAVINGS_TL)) &&
    Array.isArray(a.nerede) &&
    a.nerede.every((x) => typeof x === 'string' && ['mevduat', 'doviz', 'altin', 'hisseFon', 'kripto', 'bes'].includes(x)) &&
    has('yatirim', Object.keys(INVEST_RATE)) &&
    has('dusus', ['sat', 'bekle', 'al'])
  )
}

export interface QuickEstimate {
  incomeTl: number
  spendTl: number
  debtPaymentTl: number
  debts: Array<{ name: string; type: 'card' | 'loan'; balanceTl: number; paymentTl: number; monthlyRatePct: number }>
  liquidTl: number
  assetsTl: number
  investTl: number
}

/** Aralıklı cevapların tahmini rakamları (TL). Sonuç ekranı ve ön doldurma aynı tahmini kullanır. */
export function estimate(a: QuickAnswers): QuickEstimate {
  const income = INCOME_TL[a.gelir]
  const rate = LEFT_RATE[a.kalan]
  const debts: QuickEstimate['debts'] = []
  if (a.borc === 'kredi_rahat') debts.push({ name: 'İhtiyaç kredisi', type: 'loan', paymentTl: income * 0.15, balanceTl: income * 0.15 * 24, monthlyRatePct: 2 })
  if (a.borc === 'zor') {
    debts.push({ name: 'Kredi kartı', type: 'card', paymentTl: income * 0.1, balanceTl: income, monthlyRatePct: 4.25 })
    debts.push({ name: 'İhtiyaç kredisi', type: 'loan', paymentTl: income * 0.25, balanceTl: income * 0.25 * 24, monthlyRatePct: 3 })
  }
  const pay = debts.reduce((s, d) => s + d.paymentTl, 0)
  const spend = Math.max(income * 0.3, income * (1 - rate) - pay)
  const total = SAVINGS_TL[a.birikim]
  const liquidCushion = Math.min(total, CUSHION_MONTHS[a.acil] * (spend + pay))
  const rest = total - liquidCushion
  const places = a.nerede.filter((p) => p !== 'mevduat')
  const liquidRest = places.length ? (rest * places.filter((p) => LIQUID_PLACES.includes(p)).length) / places.length : rest
  const surplus = Math.max(0, income - spend - pay)
  return {
    incomeTl: r100(income),
    spendTl: r100(spend),
    debtPaymentTl: r100(pay),
    debts: debts.map((d) => ({ ...d, balanceTl: r100(d.balanceTl), paymentTl: r100(d.paymentTl) })),
    liquidTl: r100(liquidCushion + liquidRest),
    assetsTl: r100(total),
    investTl: r100(Math.min(surplus, income * INVEST_RATE[a.yatirim])),
  }
}

/** Toplam birikimin yerlere tahmini dağılımı (TL): acil yastık mevduatta, kalanı seçilen yerlere eşit. */
export function estimateCapital(a: QuickAnswers): Record<AssetPlace, number> {
  const e = estimate(a)
  const total = SAVINGS_TL[a.birikim]
  const cushion = Math.min(total, CUSHION_MONTHS[a.acil] * (e.spendTl + e.debtPaymentTl))
  const out: Record<AssetPlace, number> = { mevduat: cushion, doviz: 0, altin: 0, hisseFon: 0, kripto: 0, bes: 0 }
  const places = a.nerede.filter((p) => p !== 'mevduat')
  const rest = total - cushion
  if (rest > 0) {
    if (places.length) for (const p of places) out[p] += rest / places.length
    else out.mevduat += rest
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, r100(v)])) as Record<AssetPlace, number>
}

function spendGroups(spendTl: number): SpendBreakdown {
  return Object.fromEntries(SPEND_GROUPS.map((g) => [g, Math.round(spendTl * SPEND_SHARE[g]) * K])) as SpendBreakdown
}

/**
 * Hayal edilen aylık yaşamı testteki iki alana böler: bugünkü harcamanın %50–160'ı (testteki sınır)
 * ve aşan kısım yıllık büyük harcama olarak. Harcama değişince (ör. uygulamadaki gerçek ortalama)
 * yeniden çağrılır ki hedef yine hayal edilen tutar olsun.
 */
export function targetSplit(dreamKurus: number, spendKurus: number): { pct: number; annualBigSpendKurus: number | undefined } {
  const pct = Math.max(50, Math.min(160, Math.round((dreamKurus / Math.max(1, spendKurus)) * 100)))
  const excess = Math.max(0, dreamKurus - (spendKurus * pct) / 100)
  return { pct, annualBigSpendKurus: excess > 0 ? Math.round((excess * 12) / K) * K : undefined }
}

/**
 * Hızlı test cevaplarından tahmini profil. Yaş sorulmadığı için boş bırakılır (motor 35 varsayar);
 * hedef yaşam gideri, hayal edilen pasif gelirin bugünkü harcamaya oranıdır.
 */
export function seedProfile(a: QuickAnswers): JourneyProfile {
  const e = estimate(a)
  const spending = spendGroups(e.spendTl)
  const { pct, annualBigSpendKurus } = targetSplit(a.hayal * K, e.spendTl * K)
  return {
    goal: GOAL_MAP[a.amac],
    horizonYears: 15,
    targetMonthlyExpenseKurus: a.hayal * K,
    monthlyIncomeKurus: e.incomeTl * K,
    essentialMonthlyKurus: spending.housing + spending.food + spending.transport + spending.bills,
    incomeStability: 'regular',
    priorities: [],
    withdrawalRatePct: 4,
    celebrated: [],
    confirmedAt: '',
    spending,
    targetSpendPct: pct,
    annualBigSpendKurus,
    riskAnswers: [1, 2, 3, 4].map(() => (a.dusus === 'sat' ? 1 : a.dusus === 'al' ? 4 : 2)),
    risk: a.dusus === 'sat' ? 'cautious' : a.dusus === 'al' ? 'bold' : 'balanced',
    base: 'TRY',
  }
}

/** Hızlı testin tahmini "uygulama verisi" (yalnızca web sonucunu hesaplamak için). */
export function seedFacts(a: QuickAnswers): JourneyFacts {
  const e = estimate(a)
  const debtList: CoachDebt[] = e.debts.map((d, i) => ({
    id: `web-${i}`,
    name: d.name,
    balanceKurus: d.balanceTl * K,
    monthlyRatePct: d.monthlyRatePct,
    minPaymentKurus: d.paymentTl * K,
    estimatedMin: false,
  }))
  const debtsKurus = debtList.reduce((s, d) => s + d.balanceKurus, 0)
  return {
    averageExpenseKurus: e.spendTl * K,
    expenseMonths: 3,
    recurringMonthlyKurus: 0,
    liquidKurus: e.liquidTl * K,
    assetsKurus: e.assetsTl * K,
    debtsKurus,
    consumerDebtKurus: debtsKurus,
    monthlyDebtPaymentKurus: e.debtPaymentTl * K,
    contributedKurus: e.assetsTl * K,
    marketGainKurus: 0,
    recentMonthlyContributionKurus: e.investTl * K,
    hasAssets: e.assetsTl > 0,
    debtList,
    recurringList: [],
    spendingByGroup: spendGroups(e.spendTl),
  }
}

// ---------- Sonuç ----------

export const ARCHETYPE: Record<DropReaction, { name: string; text: string }> = {
  sat: { name: 'Temkinli Kaşif', text: 'Riski sevmiyor, adımlarını sağlama alıyorsun.' },
  bekle: { name: 'Dengeli Yolcu', text: 'Ne aceleci ne çekingen; yolu planlayarak yürüyorsun.' },
  al: { name: 'Atak Dağcı', text: 'Dalgalanmadan korkmuyor, zirveye kısa yoldan tırmanmak istiyorsun.' },
}

export const PLACES = [
  { min: 0, name: 'Sisli Vadi', text: 'Önce sis dağılmalı: bütçe dengesi ve ilk birikim yönünü kapatıyor.' },
  { min: 1, name: 'Patikanın Başı', text: 'Yolu buldun; birkaç temel adımla hızlanacaksın.' },
  { min: 4, name: 'Ana Yol', text: 'Zemin sağlam. Artık mesele hız ve doğru yatırım dağılımı.' },
  { min: 6, name: 'Zirve Kampı', text: 'Zirve görünüyor. Birikimi korumak ve doğru çekmek önemli.' },
] as const

export interface QuickInsight {
  stage: StageId | 'positive'
  tone: 'danger' | 'warning' | 'accent'
  text: string
}

export interface QuickResult {
  journey: JourneyResult
  /** Hesabın tahmini girdileri (senaryo denemesi aynı motorla yeniden hesaplar). */
  inputs: { profile: JourneyProfile; facts: JourneyFacts }
  /** Arka arkaya tamamlanan aşama sayısı (0–8) ve sıradaki aşama. */
  level: number
  archetype: { name: string; text: string }
  place: { name: string; text: string }
  /** Hedef birikim (kuruş): uygulamadaki hedef motoruyla. */
  goalKurus: number
  /** Varış: olumlu–temkinli senaryo aralığı (ay); ulaşılamıyorsa null. */
  reach: { fastMonths: number | null; midMonths: number | null; slowMonths: number | null }
  insights: QuickInsight[]
  firstMove: string
  /** Orta senaryoda varışta birikimin ne kadarı getiriden gelir (0..1); varılamıyorsa null. */
  growth: { returnShare: number; years: number } | null
}

/** Orta senaryoyla varışa kadar yatırılan toplam (başlangıç + aylık birikim, yıllık artışla) ve getirinin payı. */
function growthShare(j: JourneyResult): QuickResult['growth'] {
  const m = j.indicators.route.mid
  const goal = j.indicators.goalKurus
  if (m === null || m <= 0 || goal <= 0) return null
  const g = 1 + SAVING_GROWTH_PCT / 100
  let paid = Math.max(0, j.indicators.progressKurus)
  for (let i = 1; i <= m; i++) paid += Math.max(0, j.plan.monthlySavingKurus) * Math.pow(g, Math.floor((i - 1) / 12))
  return { returnShare: Math.max(0, Math.min(1, 1 - paid / goal)), years: Math.ceil(m / 12) }
}

const INSIGHT: Partial<Record<StageId, [QuickInsight['tone'], string]>> = {
  balance: ['danger', 'Ay sonunda açık veriyorsun. Rota bu açığı kapatmakla başlıyor.'],
  starter: ['warning', 'Beklenmedik bir masraf seni borca itebilir; ilk kalkanın henüz yok.'],
  debt: ['danger', 'Taksitler zorluyor; yüksek faizli borç birikimini eritiyor.'],
  emergency: ['warning', 'Acil durum yastığın var ama henüz tam değil.'],
  saving: ['warning', "Gelirinin %20'sini düzenli biriktirmek rotanı ciddi hızlandırır."],
}

export function quickResult(a: QuickAnswers): QuickResult {
  const inputs = { profile: seedProfile(a), facts: seedFacts(a) }
  const j = buildJourney(inputs.profile, inputs.facts, {}, { runs: 0 })
  const level = j.level
  const place = [...PLACES].reverse().find((p) => level >= p.min) ?? PLACES[0]
  const insights: QuickInsight[] = []
  for (const s of j.stages) {
    if (s.done || insights.length >= 3) continue
    const i: QuickInsight['tone'] | undefined = INSIGHT[s.id]?.[0]
    if (!i) continue
    // Rahat ödenen kredi taksiti uyarı değil bilgi: kapandıkça birikime döner
    if (s.id === 'debt' && a.borc === 'kredi_rahat') insights.push({ stage: s.id, tone: 'warning', text: 'Kredi taksitlerin birikime ayırabileceğin parayı azaltıyor; kapandıkça rotan hızlanır.' })
    else insights.push({ stage: s.id, tone: i, text: INSIGHT[s.id]![1] })
  }
  const e = estimate(a)
  if (insights.length < 3 && e.incomeTl > 0 && (e.incomeTl - e.spendTl - e.debtPaymentTl) / e.incomeTl >= 0.2) insights.push({ stage: 'positive', tone: 'accent', text: 'Güçlü bir tasarruf oranın var; rotanın motoru bu.' })
  if (insights.length < 3 && !e.debts.length) insights.push({ stage: 'positive', tone: 'accent', text: 'Borcun olmaması sana büyük bir hız avantajı veriyor.' })
  const r = j.indicators.route
  return {
    journey: j,
    inputs,
    level,
    archetype: ARCHETYPE[a.dusus],
    place: { name: place.name, text: place.text },
    goalKurus: j.indicators.goalKurus,
    reach: { fastMonths: r.optimistic, midMonths: r.mid, slowMonths: r.cautious },
    insights,
    // Borç rakamları testte tahmin edildi: kesin tutar yerine gerçek borcu girmeye çağırır
    firstMove:
      j.current?.id === 'debt'
        ? 'Testte taksitlerin olduğunu söyledin. Rota kurulumunda borçlarını girince hangisini önce kapatacağın ve borçsuzluk tarihin çıkar.'
        : (j.current?.next ?? 'Rotan tamam: birikimini koru ve güvenli çekim planı yap.'),
    growth: growthShare(j),
  }
}

/**
 * Varış yılı aralığı: olumlu senaryo – temkinli senaryo; temkinlide ulaşılamıyorsa olumlu – orta.
 * Hiçbirinde ulaşılamıyorsa null.
 */
export function reachRange(r: Pick<QuickResult, 'reach'>, year = new Date().getFullYear()): string | null {
  const at = (m: number) => year + Math.ceil(m / 12)
  const { fastMonths: f, midMonths: m, slowMonths: s } = r.reach
  if (f === null) return null
  const end = s ?? m
  if (end === null) return `${at(f)}+`
  return at(f) === at(end) ? String(at(f)) : `${at(f)}–${at(end)}`
}

/**
 * "Ayda X TL daha ayırırsam?" senaryosu: rota motorunun aynı nakit akışıyla (borç bitişleri, birikim
 * artışı, orta getiri). Noktalar yıl sonu net birikimdir.
 */
export function quickScenario(res: QuickResult, extraTl: number, years = 40) {
  const plus = extraTl > 0 ? buildFreedomPlan(res.inputs.profile, res.inputs.facts, { runs: 0, extraMonthlyKurus: extraTl * K }) : res.journey.plan
  const sim = (p: FreedomPlan) => ({ reachMonths: p.route.mid, points: p.midPath.slice(0, years + 1).map((v, year) => ({ year, realKurus: v, nominalKurus: v })) })
  return { base: sim(res.journey.plan), plus: sim(plus) }
}

/** Devam kodu: ATL- + 6 karakter (karışan harfler yok). */
export function newLeadCode(rand: () => number = Math.random): string {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 6; i++) s += abc[Math.floor(rand() * abc.length) % abc.length]
  return `ATL-${s}`
}

export const LEAD_CODE_RE = /^ATL-[A-HJ-NP-Z2-9]{6}$/

/** Uygulamaya taşınan web testi kaydı (ayarlarda saklanır). */
export interface WebTestLink {
  code: string
  answers: QuickAnswers
  name?: string
  createdAt: string
  linkedAt: string
  /** Kişi "Rotamı netleştir" ile testi tamamladı mı (tarih). */
  refinedAt?: string
  /** Test nerede çözüldü: web'de (e-postayla) ya da uygulamada. Eski kayıtlarda yok (web). */
  source?: 'web' | 'app'
}
