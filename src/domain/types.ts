import type { SplitRule } from './split'
import type { BudgetPlan } from './budget'
import type { BudgetMode } from './autoBudget'
import type { JourneyProfile } from './journey'
/** Takvim günü: 'YYYY-AA-GG'. Saat dilimi bilgisi taşımaz; gün kayması olmaz. */
export type IsoDate = string
/** Takvim ayı: 'YYYY-AA'. */
export type MonthKey = string

/** gider, iade, kart ödemesi/transfer */
export type TxType = 'expense' | 'refund' | 'transfer' | 'income'

/** Harcama toplamlarına giren türler (gider ve iade). Gelir ve transfer harcama sayılmaz. */
export function isSpending(t: { type: TxType }): boolean {
  return t.type === 'expense' || t.type === 'refund'
}
export type PaymentMethod = 'cash' | 'debit' | 'credit'
/** settlement: ortak grup paylaşımında size düşen pay; kaydedilmez, "Tümü" görünümünde hesaplanır. */
/** planned: borç ve taksit planlarından ekrana yansıtılan, kaydedilmeyen taksit gideri. */
export type TxSource = 'manual' | 'pdf' | 'csv' | 'xlsx' | 'image' | 'demo' | 'shared' | 'settlement' | 'planned'
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
  /** Plus: grubun aylık bütçesi (paylaşılan grupta yöneticinin belirlediği, buluttan eşitlenir). */
  budgetKurus?: number | null
  /** Plus: yöneticinin bu cihazda seçtiği paylaşım kuralı (yalnızca yerel). */
  splitRule?: SplitRule
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
  /** Plus: "ödendi" işaretlenen ödemeler (buluttan eşitlenir). */
  payments?: SettlementPayment[]
}

export interface SettlementPayment {
  from: string
  to: string
  amountKurus: number
  markedBy: string
  markedAt: string
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
  /** Bütçeyi koç mu belirler (otomatik) yoksa kullanıcı mı (elle)? Boşsa: bütçe girilmişse elle, yoksa otomatik. */
  budgetMode?: BudgetMode
  /** Plus+: Finansal Özgürlük Yolculuğum anketi (kullanıcının doğruladığı bilgiler). */
  journey?: JourneyProfile
  /** Plus+ koç tercihleri. */
  coach?: CoachSettings
  /** Maaş, kira geliri gibi düzenli gelirler; günü gelince özete planlı gelir olarak yansır. */
  recurringIncomes?: RecurringIncome[]
  updatedAt: string
}

export type IncomeKind = 'salary' | 'rent' | 'other'

/** Düzenli gelir. Yalnızca bu cihazda tutulur; gerçek gelir kaydı girilirse o ayın planlı geliri düşer. */
export interface RecurringIncome {
  id: string
  name: string
  kind: IncomeKind
  amountKurus: number
  cadence: RecurringCadence
  /** İlk gelir günü; sonrakiler sıklığa göre hesaplanır. */
  startDate: IsoDate
  active: boolean
  createdAt: string
  updatedAt: string
}

export const INCOME_KIND_LABEL: Record<IncomeKind, string> = {
  salary: 'Maaş',
  rent: 'Kira geliri',
  other: 'Ek gelir',
}

export interface CoachSettings {
  strategy: 'avalanche' | 'snowball'
  /** Borç ödemeleri ortalama gidere zaten dahil mi. */
  debtsInExpenses: boolean
  /** Okunan/kapatılan koç mesajları. */
  dismissed: string[]
  /** Yapay zekâ sohbeti için özet verilerin gönderilmesine izin. */
  aiConsent: boolean
  /** Hangi bilgi gruplarının koça gönderileceği (boşsa hepsi açık). */
  share?: CoachShare
  /** Koçun kişisel hafızası: yalnızca bu cihazda durur; kullanıcı görür, düzeltir, siler. */
  memory?: CoachMemoryEntry[]
}

export interface CoachShare {
  income: boolean
  expenses: boolean
  debts: boolean
  goals: boolean
  budget: boolean
}

export type CoachMemoryKind = 'hedef' | 'tercih' | 'not' | 'sohbet'

export interface CoachMemoryEntry {
  id: string
  kind: CoachMemoryKind
  text: string
  /** Kullanıcı mı yazdı, sohbet özetinden mi geldi. */
  source: 'kullanici' | 'sohbet'
  createdAt: string
  updatedAt: string
}

export type RecurringKind = 'subscription' | 'bill' | 'installment'
export type RecurringCadence = 'weekly' | 'monthly' | 'yearly'

/** Plus: abonelik, düzenli ödeme (kira, fatura) veya elle eklenen taksitli alışveriş. */
export interface RecurringPayment {
  id: string
  name: string
  kind: RecurringKind
  amountKurus: number
  categoryId: string | null
  cadence: RecurringCadence
  /** İlk ödeme günü; sonrakiler buradan sıklığa göre hesaplanır. */
  startDate: IsoDate
  /** Toplam ödeme sayısı (taksitte taksit sayısı). Boşsa süresiz. */
  occurrences?: number | null
  /** Ödemeden kaç gün önce hatırlatılsın (0 = aynı gün). */
  reminderDays: number
  /** Ödendiğini işlemlerden tanımak için iş yeri anahtarı. */
  matchKey?: string
  /** Plus: grubun düzenli gideri; ödeme günü gelince o grubun gideri olarak eklenebilir. */
  groupId?: string | null
  /** Gider olarak eklenen son ödeme günü (bu tarih ve öncesi tekrar önerilmez). */
  recordedThrough?: IsoDate
  active: boolean
  createdAt: string
  updatedAt: string
}

export const RECURRING_KIND_LABEL: Record<RecurringKind, string> = {
  subscription: 'Abonelik',
  bill: 'Düzenli ödeme',
  installment: 'Taksit',
}

export const CADENCE_LABEL: Record<RecurringCadence, string> = {
  weekly: 'Haftalık',
  monthly: 'Aylık',
  yearly: 'Yıllık',
}

export const TX_TYPE_LABEL: Record<TxType, string> = {
  expense: 'Gider',
  refund: 'İade',
  transfer: 'Kart ödemesi / Transfer',
  income: 'Gelir',
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
  planned: 'Planlı taksit',
}

/** Bu cihazda değiştirilemeyen işlem: üyenin harcaması veya paylaşımdaki payınız. */
export function isReadOnlyTx(t: Pick<Transaction, 'source'>): boolean {
  return t.source === 'shared' || t.source === 'settlement' || t.source === 'planned'
}
