import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { CloudBackend, CloudGroup, CloudMember, CloudTxInput, CloudTxRow } from './types'

export class SupabaseBackend implements CloudBackend {
  readonly client: SupabaseClient
  private uid: string | null = null

  constructor(url: string, anonKey: string) {
    this.client = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'harcama-atlasi-bulut-oturum' } })
  }

  setUserId(id: string | null) {
    this.uid = id
  }

  userId(): string | null {
    return this.uid
  }

  private async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.client.rpc(fn, args)
    if (error) throw error
    return data as T
  }

  createGroup(name: string, color: string, displayName: string) {
    return this.rpc<CloudGroup>('ha_create_group', { p_name: name, p_color: color, p_display_name: displayName })
  }

  createInvite(groupId: string) {
    return this.rpc<string>('ha_create_invite', { p_group: groupId })
  }

  joinGroup(code: string, displayName: string) {
    return this.rpc<CloudGroup>('ha_join_group', { p_code: code, p_display_name: displayName })
  }

  async removeMember(groupId: string, userId: string) {
    await this.rpc('ha_remove_member', { p_group: groupId, p_user: userId })
  }

  async setDisplayName(groupId: string, displayName: string) {
    await this.rpc('ha_set_display_name', { p_group: groupId, p_display_name: displayName })
  }

  async setGroupCycle(groupId: string, startDay: number | null) {
    await this.rpc('ha_set_group_cycle', { p_group: groupId, p_day: startDay })
  }

  async listGroups(): Promise<CloudGroup[]> {
    const { data, error } = await this.client.from('ha_groups').select('id, name, color, owner_id, cycle_start_day')
    if (error) throw error
    return data ?? []
  }

  async listMembers(groupIds: string[]): Promise<CloudMember[]> {
    if (!groupIds.length) return []
    const { data, error } = await this.client.from('ha_group_members').select('group_id, user_id, display_name, color').in('group_id', groupIds)
    if (error) throw error
    return data ?? []
  }

  async upsert(rows: CloudTxInput[]) {
    if (rows.length) await this.rpc('ha_upsert_transactions', { p_rows: rows })
  }

  async remove(ids: string[]) {
    if (ids.length) await this.rpc('ha_delete_transactions', { p_ids: ids })
  }

  async pull(groupId: string, since: string | null): Promise<CloudTxRow[]> {
    const out: CloudTxRow[] = []
    const PAGE = 1000
    for (let from = 0; ; from += PAGE) {
      let q = this.client
        .from('ha_transactions')
        .select('id, group_id, user_id, date, amount_kurus, type, description, category_name, category_icon, category_color, note, installment, deleted, updated_at')
        .eq('group_id', groupId)
        .order('updated_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1)
      if (since) q = q.gt('updated_at', since)
      const { data, error } = await q
      if (error) throw error
      out.push(...((data ?? []) as CloudTxRow[]))
      if (!data || data.length < PAGE) break
    }
    return out
  }
}
