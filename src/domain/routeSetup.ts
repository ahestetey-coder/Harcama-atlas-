import type { CoachDebt } from './coach'
import type { JourneyFacts } from './journey'
import { tt } from '../lib/i18n'

/**
 * Rota kurulumunda girilen ilk rakamlar (borç ve birikim). Uygulamada henüz Borçlarım / Yatırımlarım
 * kaydı yokken rotayı bunlar besler; kayıt eklenince uygulamadaki gerçek veri bunların yerine geçer.
 */
export type SetupDebtType = 'card' | 'overdraft' | 'loan' | 'auto' | 'mortgage' | 'personal' | 'other'

export const SETUP_DEBT_LABEL: Record<SetupDebtType, string> = {
  card: tt('Kredi kartı'),
  overdraft: tt('KMH / ek hesap'),
  loan: tt('İhtiyaç kredisi'),
  auto: tt('Taşıt kredisi'),
  mortgage: tt('Konut kredisi'),
  personal: tt('Kişisel borç'),
  other: tt('Diğer'),
}
const CONSUMER: SetupDebtType[] = ['card', 'overdraft', 'loan', 'personal']

export interface SetupDebt {
  type: SetupDebtType
  balanceKurus: number
  paymentKurus: number
  monthlyRatePct: number
}

export interface SetupCapital {
  emergencyKurus: number
  fxKurus: number
  goldKurus: number
  fundsKurus: number
  cryptoKurus: number
  pensionKurus: number
  /** Her ay düzenli yatırıma ayrılan. */
  monthlyInvestKurus: number
}

export interface RouteSetupData {
  debts?: SetupDebt[]
  capital?: SetupCapital
  /** true: kişi tahmini birikimle ilerledi; Yatırımlarım'da kayıt olsa da tahmin kullanılır. */
  capitalEstimate?: boolean
  /** Aylık harcama (düzenli ödemeler hariç); uygulamada harcama kaydı yokken kullanılır. */
  spendKurus?: number
  /** Kurulum formunun son hâli: "Testi yenile" bu rakamlarla dolu açılır. */
  form?: Record<string, unknown>
  at: string
}

export const capitalTotal = (c: SetupCapital) => c.emergencyKurus + c.fxKurus + c.goldKurus + c.fundsKurus + c.cryptoKurus + c.pensionKurus
/** Hızlı kullanılabilir kısım: nakit/mevduat, döviz, altın ve fon (uygulamadaki LIQUID ile aynı). */
export const capitalLiquid = (c: SetupCapital) => c.emergencyKurus + c.fxKurus + c.goldKurus + c.fundsKurus

export function setupDebtList(debts: SetupDebt[]): CoachDebt[] {
  return debts
    .filter((d) => d.balanceKurus > 0)
    .map((d, i) => ({
      id: `kurulum-${i}`,
      name: SETUP_DEBT_LABEL[d.type],
      balanceKurus: d.balanceKurus,
      monthlyRatePct: d.monthlyRatePct,
      minPaymentKurus: d.paymentKurus,
      estimatedMin: false,
    }))
}

/**
 * Uygulamada karşılığı olmayan alanları kurulum rakamlarıyla doldurur. Borçlarım'da borç varsa
 * borçlar, Yatırımlarım'da varlık varsa birikim (kişi tahminle ilerlemeyi seçmediyse), harcama kaydı varsa
 * harcama uygulamadan gelir.
 */
export function applySetup(facts: JourneyFacts, setup: RouteSetupData | undefined): JourneyFacts {
  if (!setup) return facts
  let f = facts
  if (setup.debts && !(facts.debtList ?? []).length) {
    const list = setupDebtList(setup.debts)
    const total = list.reduce((s, d) => s + d.balanceKurus, 0)
    const consumer = setup.debts.filter((d) => CONSUMER.includes(d.type)).reduce((s, d) => s + d.balanceKurus, 0)
    const pay = list.reduce((s, d) => s + d.minPaymentKurus, 0)
    f = { ...f, debtList: list, debtsKurus: f.debtsKurus + total, consumerDebtKurus: (f.consumerDebtKurus ?? 0) + consumer, monthlyDebtPaymentKurus: (f.monthlyDebtPaymentKurus ?? 0) + pay }
  }
  if (setup.capital && (!facts.hasAssets || setup.capitalEstimate)) {
    const c = setup.capital
    const total = capitalTotal(c)
    f = { ...f, liquidKurus: capitalLiquid(c), assetsKurus: total, contributedKurus: total, marketGainKurus: 0, recentMonthlyContributionKurus: c.monthlyInvestKurus, hasAssets: total > 0 }
  }
  if (setup.spendKurus && facts.averageExpenseKurus === null) f = { ...f, averageExpenseKurus: setup.spendKurus, expenseMonths: Math.max(f.expenseMonths, 1) }
  return f
}

/**
 * Rotayı yalnızca rota kurulumundan (Finansal Harita testinden sonra 6 adım) çıkan profil besler.
 * Eski 5/8 adımlı testten kalan profiller (setup alanı yok) yok sayılır.
 */
export function routeProfile<P extends { setup?: RouteSetupData }>(p: P | null | undefined): P | null {
  return p?.setup ? p : null
}

/** Yarıda kalan rota kurulumu: cihazda saklanır, Finansal Yolculuğum'a dönünce kaldığı yerden açılır. */
export interface RouteDraft {
  code: string
  step: number
  form: Record<string, unknown>
  status: Record<string, string>
}
const DRAFT_KEY = 'ha:rota-taslak'

export function loadRouteDraft(code: string): RouteDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as RouteDraft
    return d && d.code === code && typeof d.step === 'number' && d.form && typeof d.form === 'object' ? d : null
  } catch {
    return null
  }
}

export function saveRouteDraft(d: RouteDraft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d))
  } catch {
    // Depolama kapalıysa taslak saklanmaz; kurulum yine çalışır
  }
}

export function clearRouteDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    // yok say
  }
}
