import { isIsoDate } from '../domain/dates'
import type { Transaction } from '../domain/types'

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
  if (!['expense', 'refund', 'transfer'].includes(t.type)) errors.type = 'İşlem türünü seçin.'
  if (!t.description || !t.description.trim()) errors.description = 'Açıklama veya iş yeri girin.'
  if (t.type === 'expense' && !t.categoryId) errors.category = 'Gider için kategori seçilmeli.'
  if (t.categoryId && knownCategoryIds && !knownCategoryIds.has(t.categoryId)) errors.category = 'Seçilen kategori bulunamadı.'
  return errors
}

export function hasErrors(e: object): boolean {
  return Object.keys(e).length > 0
}
