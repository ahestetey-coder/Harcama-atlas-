import { formatKurusPlain } from '../domain/money'
import { formatDate } from '../domain/dates'
import { PAYMENT_LABEL, SOURCE_LABEL, TX_TYPE_LABEL, type Category, type SpendGroup, type Transaction } from '../domain/types'

/**
 * CSV formül enjeksiyonunu önler: =, +, -, @, sekme veya satır başı ile başlayan hücrelerin
 * başına tek tırnak eklenir (Excel/LibreOffice bunları formül olarak çalıştırmaz).
 */
export function sanitizeCsvCell(value: string): string {
  let v = value
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`
  if (/[";\n\r]/.test(v)) v = `"${v.replace(/"/g, '""')}"`
  return v
}

export function transactionsToCsv(txs: Transaction[], categories: Map<string, Category>, groups: Map<string, SpendGroup> = new Map()): string {
  const header = ['Tarih', 'Açıklama', 'Tür', 'Tutar (TL)', 'Kategori', 'Grup', 'Ödeme aracı', 'Kart/hesap', 'Kaynak', 'Taksit', 'Döviz', 'Not']
  const lines = [header.join(';')]
  for (const t of txs) {
    const signed = t.type === 'refund' ? -t.amountKurus : t.amountKurus
    const row = [
      formatDate(t.date),
      t.description,
      TX_TYPE_LABEL[t.type],
      // Tutar sayısal bir değerdir; eksi işareti biçimlendirici tarafından üretilir, kullanıcı metni değildir.
      formatKurusPlain(signed),
      t.categoryId ? (categories.get(t.categoryId)?.name ?? '') : '',
      t.groupId ? (groups.get(t.groupId)?.name ?? '') : '',
      t.paymentMethod ? PAYMENT_LABEL[t.paymentMethod] : '',
      t.accountAlias ?? '',
      SOURCE_LABEL[t.source],
      t.installment ? `${t.installment.current}/${t.installment.total || '?'}` : '',
      t.foreign ? `${(t.foreign.amountMinor / 100).toFixed(2)} ${t.foreign.currency}` : '',
      t.note ?? '',
    ]
    lines.push(row.map((v, i) => (i === 3 ? v : sanitizeCsvCell(v))).join(';'))
  }
  // Excel'in Türkçe karakterleri doğru açması için BOM
  return '﻿' + lines.join('\r\n')
}
