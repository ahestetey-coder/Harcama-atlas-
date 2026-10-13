import { isIsoDate } from '../domain/dates'
import type { BudgetProfile, Transaction } from '../domain/types'

export type TxFieldErrors = Partial<Record<'date' | 'amount' | 'type' | 'description' | 'category' | 'currency', string>>

export const MAX_AMOUNT_KURUS = 100_000_000_00 // 100 milyon TL: yazım hatalarına karşı üst sınır

/** Kaydedilecek bir işlemin zorunlu alanlarını denetler. */
export function validateTransaction(
  t: Pick<Transaction, 'date' | 'amountKurus' | 'type' | 'description' | 'categoryId'>,
  knownCategoryIds?: Set<string>,
): TxFieldErrors {
  const errors: TxFieldErrors = {}
  if (!t.date || !isIsoDate(t.date)) errors.date = 'Geçerli bir tarih girin.'
  if (!Number.isSafeInteger(t.amountKurus) || t.amountKurus <= 0) errors.amount = 'Sıfırdan büyük bir tutar girin.'
  else if (t.amountKurus > MAX_AMOUNT_KURUS) errors.amount = 'Tutar olağan dışı büyük; kontrol edin.'
  if (!['expense', 'refund', 'transfer', 'income'].includes(t.type)) errors.type = 'İşlem türünü seçin.'
  if (!t.description || !t.description.trim()) errors.description = 'Açıklama veya iş yeri girin.'
  if (t.type === 'expense' && !t.categoryId) errors.category = 'Gider için kategori seçilmeli.'
  if (t.categoryId && knownCategoryIds && !knownCategoryIds.has(t.categoryId)) errors.category = 'Seçilen kategori bulunamadı.'
  return errors
}

export function hasErrors(e: object): boolean {
  return Object.keys(e).length > 0
}

/** Bütçe beyanındaki tutar alanları (kuruş). */
export const BUDGET_PROFILE_KURUS_KEYS = ['housingKurus', 'billsKurus', 'cardPaymentKurus', 'loanPaymentKurus', 'consumerDebtKurus', 'emergencyFundKurus'] as const

const HOUSING_VALUES = ['rent', 'mortgage', 'owned', 'family']

/** Bütçe beyanı değişikliğini denetler; ilk hatanın mesajını, hata yoksa null döndürür. Verilmeyen alan denetlenmez. */
export function budgetProfileError(patch: Partial<Omit<BudgetProfile, 'updatedAt'>>): string | null {
  for (const k of BUDGET_PROFILE_KURUS_KEYS) {
    const v = patch[k]
    if (v != null && (!Number.isSafeInteger(v) || v < 0)) return 'Geçerli bir tutar girin.'
  }
  if (patch.housing !== undefined && !HOUSING_VALUES.includes(patch.housing)) return 'Konut durumunu seçin.'
  if (patch.earners != null && patch.earners !== 1 && patch.earners !== 2) return 'Gelir getiren kişi sayısı 1 veya 2 olmalı.'
  if (patch.dependents != null && (!Number.isInteger(patch.dependents) || patch.dependents < 0 || patch.dependents > 20))
    return 'Bakmakla yükümlü olunan kişi sayısı 0 ile 20 arasında olmalı.'
  return null
}
