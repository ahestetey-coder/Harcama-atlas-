import { foldTr, normalizeText } from './normalize'
import type { Installment, TxType } from './types'

/**
 * Ekstre satırlarının sınıflandırılması. Tüm eşleşmeler normalize metin üzerinde
 * tam kelime/ifade olarak yapılır.
 */

function hasPhrase(normalized: string, phrase: string): boolean {
  const p = normalizeText(phrase)
  return (' ' + normalized + ' ').includes(' ' + p + ' ')
}

function anyPhrase(normalized: string, phrases: string[]): string | null {
  for (const p of phrases) if (hasPhrase(normalized, p)) return p
  return null
}

/** İşlem olmayan özet satırları: dönem borcu, asgari ödeme, limit, toplamlar… */
const SUMMARY_PHRASES = [
  'ÖNCEKİ DÖNEM BORCU',
  'ÖNCEKİ DÖNEM BAKİYESİ',
  'ÖNCEKİ DÖNEM BAKİYENİZ',
  'SON HESAP BAKİYESİ',
  'HESAP BAKİYESİ',
  'GÜNCEL BAKİYE',
  'BORÇ BAKİYESİ',
  'KULLANILABİLİR BAKİYE',
  'DEVREDEN BAKİYE',
  'DEVREDEN BORÇ',
  'DÖNEM BORCU',
  'DÖNEM BORCUNUZ',
  'GÜNCEL DÖNEM BORCU',
  'TOPLAM BORÇ',
  'TOPLAM BORCUNUZ',
  'ASGARİ ÖDEME',
  'ASGARİ ÖDEME TUTARI',
  'MİNİMUM ÖDEME',
  'KART LİMİTİ',
  'KREDİ LİMİTİ',
  'TOPLAM LİMİT',
  'KULLANILABİLİR LİMİT',
  'KALAN LİMİT',
  'NAKİT AVANS LİMİTİ',
  'HESAP KESİM TARİHİ',
  'SON ÖDEME TARİHİ',
  'EKSTRE TARİHİ',
  'EKSTRE DÖNEMİ',
  'DÖNEM İÇİ HARCAMALAR',
  'DÖNEM İÇİ İŞLEMLER',
  'İŞLEMLER TOPLAMI',
  'HARCAMALAR TOPLAMI',
  'HARCAMA TOPLAMI',
  'GENEL TOPLAM',
  'ARA TOPLAM',
  'TOPLAM',
  'BONUS',
  'KAZANILAN PUAN',
  'PUAN BAKİYESİ',
  'MAXİPUAN',
  'WORLDPUAN',
  'PARAPUAN',
  'GELECEK DÖNEM TAKSİTLERİ',
  'KALAN TAKSİT TUTARI',
  'SONRAKİ DÖNEM',
]

/** Kaynakta bulunan işlem toplamı satırları (doğrulama için). */
const TX_TOTAL_PHRASES = ['DÖNEM İÇİ HARCAMALAR', 'DÖNEM İÇİ İŞLEMLER', 'İŞLEMLER TOPLAMI', 'HARCAMALAR TOPLAMI', 'HARCAMA TOPLAMI', 'TOPLAM HARCAMA']

const PAYMENT_PHRASES = [
  'ÖDEMENİZ İÇİN TEŞEKKÜR',
  'ÖDEMENİZ İÇİN TEŞEKKÜRLER',
  'ÖDEME TEŞEKKÜR EDERİZ',
  'ÖDEMENİZ İÇİN TEŞEKKÜR EDERİZ',
  'HESABINIZDAN YAPILAN ÖDEME',
  'HESAPTAN ÖDEME',
  'OTOMATİK ÖDEME TALİMATI',
  'KART ÖDEMESİ',
  'KREDİ KARTI ÖDEMESİ',
  'KREDİ KARTI BORÇ ÖDEMESİ',
  'KART BORCU ÖDEMESİ',
  'KART BORÇ ÖDEMESİ',
  'BORÇ ÖDEME',
  'OTOMATİK ÖDEME',
  'MOBİL ÖDEME',
  'İNTERNET ÖDEME',
  'İNTERNETTEN ÖDEME',
  'ATM ÖDEME',
  'ŞUBE ÖDEME',
  'EKSTRE ÖDEMESİ',
  'VİRMAN',
  'HAVALE',
  'EFT',
  'FAST',
  'HESAPLAR ARASI',
  'PARA TRANSFERİ',
]

// İndirim/kampanya iadeleri de harcamayı azaltan alacaklardır.
const REFUND_PHRASES = ['İADE', 'IADE', 'İADESİ', 'İPTAL', 'REFUND', 'CHARGEBACK', 'İADE İŞLEMİ', 'İNDİRİM', 'İNDİRİMİ', 'CASHBACK']

const FEE_PHRASES = ['FAİZ', 'AKDİ FAİZ', 'GECİKME FAİZİ', 'BSMV', 'KKDF', 'YILLIK ÜCRET', 'KART ÜCRETİ', 'KART AİDATI', 'ÜYELİK ÜCRETİ', 'HESAP İŞLETİM ÜCRETİ', 'NAKİT AVANS ÜCRETİ', 'MASRAF', 'KOMİSYON', 'İŞLEM ÜCRETİ']

export function isSummaryLine(text: string): string | null {
  const n = normalizeText(text)
  return anyPhrase(n, SUMMARY_PHRASES)
}

export function isTransactionTotalLine(text: string): boolean {
  return !!anyPhrase(normalizeText(text), TX_TOTAL_PHRASES)
}

export function isPaymentLine(text: string): boolean {
  return !!anyPhrase(normalizeText(text), PAYMENT_PHRASES)
}

export function isRefundLine(text: string): boolean {
  return !!anyPhrase(normalizeText(text), REFUND_PHRASES)
}

export function isFeeLine(text: string): boolean {
  return !!anyPhrase(normalizeText(text), FEE_PHRASES)
}

export interface TypeDecision {
  type: TxType
  /** Tutarın mutlak değeri (kuruş). İade asla iki kez eksiye çevrilmez. */
  amountKurus: number
  warnings: string[]
}

/**
 * Satırın türünü ve pozitif tutarını belirler.
 * - Ödeme/transfer ifadesi → transfer (gidere dahil edilmez).
 * - Alacak (negatif) tutar → iade; ödeme ifadesi varsa transfer.
 * - İade ifadesi taşıyan pozitif tutar → iade (işaret ne olursa olsun tutar bir kez çıkarılır).
 */
export function decideType(description: string, signedKurus: number, creditHint?: boolean): TypeDecision {
  const warnings: string[] = []
  const credit = creditHint ?? signedKurus < 0
  const amountKurus = Math.abs(signedKurus)
  // "TURKCELL FATURA OTOMATİK ÖDEME" gibi borç yönlü fatura talimatları harcamadır, kart ödemesi değil.
  const billDebit = !credit && /\b(FATURA|FATURASI|ABONE)\b/.test(normalizeText(description))
  if (isPaymentLine(description) && !billDebit) return { type: 'transfer', amountKurus, warnings }
  if (isRefundLine(description)) return { type: 'refund', amountKurus, warnings }
  if (credit) {
    warnings.push('Alacak tutarı iade olarak yorumlandı; kontrol edin.')
    return { type: 'refund', amountKurus, warnings }
  }
  return { type: 'expense', amountKurus, warnings }
}

const INSTALLMENT_RES = [
  /\bTAKSIT\s*:?\s*(\d{1,2})\s*\/\s*(\d{1,2})(?![\d/.])/,
  /(?<![\d/.,])(\d{1,2})\s*\/\s*(\d{1,2})(?![\d/.,])/,
  /\b(\d{1,2})\s*\.?\s*TAKSIT\b(?:\s*\/?\s*(\d{1,2}))?/,
  /\b(\d{1,2})\s+OF\s+(\d{1,2})\b/,
]

/**
 * "3/12 TAKSİT", "Taksit 3/12", "3. taksit" gibi ifadeleri bulur.
 * Tarih parçaları ("15/09/2026") taksit sayılmaz.
 */
export function detectInstallment(text: string): Installment | null {
  const folded = foldTr(text)
  // "6 - 1. Taksit" biçimi: toplam taksit – bu taksit (bazı banka mobil dökümleri)
  const dash = /(?<![\d.,])(\d{1,2})\s*-\s*(\d{1,2})\s*\.\s*TAKSIT\b/.exec(folded)
  if (dash) {
    const total = Number(dash[1])
    const current = Number(dash[2])
    if (current >= 1 && total >= 2 && total <= 48 && current <= total) return { current, total }
  }
  for (const re of INSTALLMENT_RES) {
    const m = re.exec(folded)
    if (!m) continue
    const current = Number(m[1])
    const total = m[2] ? Number(m[2]) : NaN
    if (!Number.isFinite(total)) {
      if (current >= 1 && current <= 48) return { current, total: 0 }
      continue
    }
    if (current >= 1 && total >= 2 && total <= 48 && current <= total) return { current, total }
  }
  return null
}
