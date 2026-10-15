import type { CoachDebt } from './coach'
import type { JourneyFacts } from './journey'

/**
 * Rota kurulumunda girilen ilk rakamlar (borç ve birikim). Uygulamada henüz Borçlarım / Yatırımlarım
 * kaydı yokken rotayı bunlar besler; kayıt eklenince uygulamadaki gerçek veri bunların yerine geçer.
 */
export type SetupDebtType = 'card' | 'overdraft' | 'loan' | 'auto' | 'mortgage' | 'personal' | 'other'

export const SETUP_DEBT_LABEL: Record<SetupDebtType, string> = {
  card: 'Kredi kartı',
  overdraft: 'KMH / ek hesap',
  loan: 'İhtiyaç kredisi',
  auto: 'Taşıt kredisi',
  mortgage: 'Konut kredisi',
  personal: 'Kişisel borç',
  other: 'Diğer',
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
  /** Aylık harcama (düzenli ödemeler hariç); uygulamada harcama kaydı yokken kullanılır. */
  spendKurus?: number
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
 * borçlar, Yatırımlarım'da varlık varsa birikim, harcama kaydı varsa harcama uygulamadan gelir.
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
  if (setup.capital && !facts.hasAssets) {
    const c = setup.capital
    const total = capitalTotal(c)
    f = { ...f, liquidKurus: capitalLiquid(c), assetsKurus: total, contributedKurus: total, marketGainKurus: 0, recentMonthlyContributionKurus: c.monthlyInvestKurus, hasAssets: total > 0 }
  }
  if (setup.spendKurus && facts.averageExpenseKurus === null) f = { ...f, averageExpenseKurus: setup.spendKurus, expenseMonths: Math.max(f.expenseMonths, 1) }
  return f
}
