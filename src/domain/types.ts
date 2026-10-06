import type { BudgetPlan } from './budget'
/** Takvim günü: 'YYYY-AA-GG'. Saat dilimi bilgisi taşımaz; gün kayması olmaz. */
export type IsoDate = string
/** Takvim ayı: 'YYYY-AA'. */
export type MonthKey = string

/** gider, iade, kart ödemesi/transfer */
export type TxType = 'expense' | 'refund' | 'transfer'
export type PaymentMethod = 'cash' | 'debit' | 'credit'
/** settlement: ortak grup paylaşımında size düşen pay; kaydedilmez, "Tümü" görünümünde hesaplanır. */
export type TxSource = 'manual' | 'pdf' | 'csv' | 'xlsx' | 'image' | 'demo' | 'shared' | 'settlement'
export type CategorySource = 'manual' | 'rule' | 'file' | 'confirmed-other'

export interface Installment {
  current: number
  total: number
  /** Kaynakta görünüyorsa alışverişin toplam tutarı (kuruş). Yalnızca bilgi amaçlı, gidere eklenmez. */
  purchaseTotalKurus?: number
}

export interface ForeignAmount {
  currency: string
  /** Döviz tutarı, en küçük birim (ör. sent) cinsinden. */
  amountMinor: number
}

export interface Transaction {
  id: string
  date: IsoDate
  /** Her zaman pozitif tam sayı kuruş. İşaret, türden gelir. */
  amountKurus: number
  type: TxType
  description: string
  /** Eşleştirme ve tekrar kontrolü için normalize açıklama. */
  normalizedDescription: string
  categoryId: string | null
  categorySource?: CategorySource
  /** Kategoriden bağımsız ikinci gruplama (ör. Bireysel, Ortak). Boşsa grupsuz. */
  groupId?: string | null
  /** Harcamayı yapan üye. Boşsa bu cihazın sahibi ("Ben"). */
  memberId?: string | null
  note?: string
  paymentMethod?: PaymentMethod
  accountAlias?: string
  source: TxSource
  importId?: string
  installment?: Installment
  foreign?: ForeignAmount
  createdAt: string
  updatedAt: string
}

export interface Category {
  id: string
  name: string
  icon: string
  color: string
  archived: boolean
  order: number
  /** Sistem kategorisi (ör. "Diğer") silinemez. */
  system?: boolean
  createdAt: string
  updatedAt: string
}

/** Harcama grubu: kategoriden ayrı, kullanıcının tanımladığı gruplama (Bireysel, Ortak, İş…). */
export interface SpendGroup {
  id: string
  name: string
  color: string
  /** Bulutta paylaşılan grubun kimliği. Varsa gruptaki işlemler grup üyeleriyle eşitlenir. */
  cloudId?: string
  /** Paylaşılan grubun yöneticisinin (sahibinin) kimliği. */
  cloudOwnerId?: string
  /** Grubun ay döngüsünün başlangıç günü (1–28). Boşsa kişisel ayar kullanılır. */
  cycleStartDay?: number | null
  /** Yöneticinin paylaştırdığı dönemler (buluttan eşitlenir). */
  settlements?: GroupSettlement[]
  archived: boolean
  order: number
  createdAt: string
  updatedAt: string
}

/** Ortak grubun bir döneminin gideri üyelere paylaştırıldı; her üyenin payı (kuruş) saklanır. */
export interface GroupSettlement {
  /** Dönemin ilk ve son günü (YYYY-MM-DD). */
  start: string
  end: string
  totalKurus: number
  /** Üye kimliği → pay (kuruş). */
  shares: Record<string, number>
  createdBy: string
  createdAt: string
}

/**
 * Üye: ortak gruplarda harcama yapan kişi. Her cihazın kendi üyesi ("Ben") vardır;
 * davet bağlantısıyla katılan kişi, davet edenin verdiği kimliği alır.
 */
export interface Member {
  id: string
  name: string
  color: string
  /** Üyenin dahil olduğu harcama grupları. */
  groupIds: string[]
  createdAt: string
  updatedAt: string
}

/** word: tam kelime/ifade, prefix: kelime başlangıcı (≥4 harf), contains: içinde geçer (≥5 harf) */
export type RuleMatchMode = 'word' | 'prefix' | 'contains'

export interface Rule {
  id: string
  /** Kullanıcının yazdığı biçim. */
  pattern: string
  matchMode: RuleMatchMode
  categoryId: string
  /** Büyük olan kazanır. */
  priority: number
  enabled: boolean
  origin: 'default' | 'user' | 'learned'
  createdAt: string
  updatedAt: string
}

export type ImportFileKind = 'pdf' | 'csv' | 'xlsx' | 'image'

export interface ImportRecord {
  id: string
  fileName: string
  fileKind: ImportFileKind
  fileSize: number
  /** Dosyanın SHA-256 özeti; aynı dosyanın tekrar yüklenmesini fark etmek için. */
  fileHash: string
  importedAt: string
  transactionCount: number
  skippedCount: number
  totalExpenseKurus: number
  totalRefundKurus: number
  status: 'active' | 'undone'
  undoneAt?: string
  parserId?: string
  accountAlias?: string
}

export type ThemePreference = 'system' | 'light' | 'dark'

export interface Settings {
  id: 'settings'
  monthlyBudgetKurus: number | null
  defaultPaymentMethod?: PaymentMethod
  /** Bu cihazın sahibinin üye kimliği. */
  selfMemberId?: string
  /** Kişisel ay döngüsünün başlangıç günü (1–28). Boşsa takvim ayı. */
  cycleStartDay?: number
  /** Plus: kategori limitleri, haftalık bütçe, devir ve uyarı eşiği. */
  budgetPlan?: BudgetPlan
  updatedAt: string
}

export const TX_TYPE_LABEL: Record<TxType, string> = {
  expense: 'Gider',
  refund: 'İade',
  transfer: 'Kart ödemesi / Transfer',
}

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash: 'Nakit',
  debit: 'Banka kartı',
  credit: 'Kredi kartı',
}

export const SOURCE_LABEL: Record<TxSource, string> = {
  manual: 'Manuel',
  pdf: 'PDF',
  csv: 'CSV',
  xlsx: 'Excel',
  image: 'Görsel',
  demo: 'Demo',
  shared: 'Üyeden',
  settlement: 'Paylaşım',
}

/** Bu cihazda değiştirilemeyen işlem: üyenin harcaması veya paylaşımdaki payınız. */
export function isReadOnlyTx(t: Pick<Transaction, 'source'>): boolean {
  return t.source === 'shared' || t.source === 'settlement'
}
