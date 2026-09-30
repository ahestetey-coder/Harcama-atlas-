/** Bulut tarafındaki satırlar (supabase/schema.sql ile birebir). */
export interface CloudGroup {
  id: string
  name: string
  color: string
  owner_id: string
}

export interface CloudMember {
  group_id: string
  user_id: string
  display_name: string
  color: string
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
export interface CloudBackend {
  /** Giriş yapmış kullanıcının kimliği. */
  userId(): string | null
  createGroup(name: string, color: string, displayName: string): Promise<CloudGroup>
  createInvite(groupId: string): Promise<string>
  joinGroup(code: string, displayName: string): Promise<CloudGroup>
  removeMember(groupId: string, userId: string): Promise<void>
  setDisplayName(groupId: string, displayName: string): Promise<void>
  listGroups(): Promise<CloudGroup[]>
  listMembers(groupIds: string[]): Promise<CloudMember[]>
  upsert(rows: CloudTxInput[]): Promise<void>
  remove(ids: string[]): Promise<void>
  /** `since` sonrasında değişen satırlar (silinenler dahil), updated_at sırasıyla. */
  pull(groupId: string, since: string | null): Promise<CloudTxRow[]>
}
