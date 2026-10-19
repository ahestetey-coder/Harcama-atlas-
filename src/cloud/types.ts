/** Bulut tarafındaki satırlar (supabase/schema.sql ile birebir). */
export interface CloudGroup {
  id: string
  name: string
  color: string
  owner_id: string
  /** Grubun ay döngüsünün başlangıç günü (1–28); yalnızca yönetici değiştirir. */
  cycle_start_day?: number | null
}

export interface CloudMember {
  group_id: string
  user_id: string
  display_name: string
  color: string
}

export interface CloudSettlement {
  group_id: string
  period_start: string
  period_end: string
  total_kurus: number
  shares: Record<string, number>
  created_by: string
  created_at: string
}

/** Paylaştırılmış dönemde "ödendi" işaretlenen ödeme (gelişmiş paylaşım). */
export interface CloudPayment {
  group_id: string
  period_start: string
  from_user: string
  to_user: string
  amount_kurus: number
  marked_by: string
  marked_at: string
}

export interface CloudTxInput {
  id: string
  group_id: string
  date: string
  amount_kurus: number
  type: 'expense' | 'refund' | 'transfer'
  description: string
  category_name: string | null
  category_icon: string | null
  category_color: string | null
  note: string | null
  installment: { current: number; total: number } | null
}

export interface CloudTxRow extends CloudTxInput {
  user_id: string
  deleted: boolean
  updated_at: string
}

/**
 * Eşitlemenin ihtiyaç duyduğu bulut işlemleri. Gerçek uygulama Supabase ile çalışır;
 * testler bellek içi bir uygulama kullanır.
 */
export interface CloudBackend extends RecordBackend {
  /** Giriş yapmış kullanıcının kimliği. */
  userId(): string | null
  createGroup(name: string, color: string, displayName: string): Promise<CloudGroup>
  createInvite(groupId: string): Promise<string>
  joinGroup(code: string, displayName: string): Promise<CloudGroup>
  removeMember(groupId: string, userId: string): Promise<void>
  setDisplayName(groupId: string, displayName: string): Promise<void>
  /** Yalnızca grup yöneticisi (sahibi) çağırabilir; null takvim ayına döner. */
  setGroupCycle(groupId: string, startDay: number | null): Promise<void>
  /** Dönemin giderini paylaştırır (varsa günceller); yalnızca yönetici. */
  settlePeriod(groupId: string, start: string, end: string, totalKurus: number, shares: Record<string, number>): Promise<void>
  /** Paylaşımı geri alır; yalnızca yönetici. */
  unsettlePeriod(groupId: string, start: string): Promise<void>
  listSettlements(groupIds: string[]): Promise<CloudSettlement[]>
  /** Grup bütçesi; yalnızca yönetici. null kaldırır. */
  setGroupBudget(groupId: string, budgetKurus: number | null): Promise<void>
  /** Grup bütçeleri (sunucu şeması eskiyse hata verir; eşitleme bunu yok sayar). */
  listGroupBudgets(groupIds: string[]): Promise<{ id: string; budget_kurus: number | null }[]>
  /** Ödemeyi ödendi/ödenmedi işaretler; yönetici veya ödemenin tarafları. */
  markPayment(groupId: string, start: string, from: string, to: string, amountKurus: number, paid: boolean): Promise<void>
  listPayments(groupIds: string[]): Promise<CloudPayment[]>
  listGroups(): Promise<CloudGroup[]>
  listMembers(groupIds: string[]): Promise<CloudMember[]>
  upsert(rows: CloudTxInput[]): Promise<void>
  remove(ids: string[]): Promise<void>
  /** `since` sonrasında değişen satırlar (silinenler dahil), updated_at sırasıyla. */
  pull(groupId: string, since: string | null): Promise<CloudTxRow[]>
}

/** Hesaba bağlı kişisel kayıt (supabase/schema.sql: ha_user_records). Her tablo satırı JSON olarak saklanır. */
export interface CloudRecord {
  tbl: string
  id: string
  data: Record<string, unknown> | null
  deleted: boolean
  updated_at: string
}

/** Kişisel verilerin hesapla eşitlenmesi için bulut işlemleri. Herkes yalnızca kendi satırlarını görür. */
export interface RecordBackend {
  userId(): string | null
  /** Kayıtları yazar; `data: null` olan satır silinmiş olarak işaretlenir. */
  upsertRecords(rows: { tbl: string; id: string; data: Record<string, unknown> | null }[]): Promise<void>
  /** `since` sonrasında değişen kendi satırları (silinenler dahil), updated_at sırasıyla. */
  pullRecords(since: string | null): Promise<CloudRecord[]>
  /** "Verilerimi sıfırla": bütün kendi satırlarını silinmiş işaretler (diğer cihazlarda da kalkar). */
  clearRecords(): Promise<void>
}
