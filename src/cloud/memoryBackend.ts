import type { CloudBackend, CloudGroup, CloudMember, CloudPayment, CloudSettlement, CloudTxInput, CloudTxRow } from './types'

/**
 * Testler için bellek içi bulut. supabase/schema.sql'deki kuralların aynısını uygular
 * (üyelik denetimi, herkes yalnızca kendi işlemini yazar/siler, silinenler işaretlenir).
 */
export class MemoryCloud {
  groups = new Map<string, CloudGroup>()
  members: CloudMember[] = []
  invites = new Map<string, string>()
  rows = new Map<string, CloudTxRow>()
  settlements: CloudSettlement[] = []
  payments: CloudPayment[] = []
  budgets = new Map<string, number | null>()
  private clock = Date.parse('2026-10-01T00:00:00Z')

  now(): string {
    this.clock += 1000
    return new Date(this.clock).toISOString()
  }

  isMember(groupId: string, userId: string) {
    return this.members.some((m) => m.group_id === groupId && m.user_id === userId)
  }

  as(userId: string): CloudBackend {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- dönen nesnenin metotları bu bulutu paylaşır
    const c = this
    const must = (g: string) => {
      if (!c.isMember(g, userId)) throw new Error('Bu grubun üyesi değilsiniz')
    }
    return {
      userId: () => userId,
      async createGroup(name, color, displayName) {
        const g = { id: crypto.randomUUID(), name, color, owner_id: userId }
        c.groups.set(g.id, g)
        c.members.push({ group_id: g.id, user_id: userId, display_name: displayName, color: '#0f766e' })
        return g
      },
      async createInvite(groupId) {
        must(groupId)
        const code = crypto.randomUUID()
        c.invites.set(code, groupId)
        return code
      },
      async joinGroup(code, displayName) {
        const gid = c.invites.get(code)
        if (!gid) throw new Error('Davet geçersiz veya süresi dolmuş')
        c.members = c.members.filter((m) => !(m.group_id === gid && m.user_id === userId))
        c.members.push({ group_id: gid, user_id: userId, display_name: displayName, color: '#0f766e' })
        return c.groups.get(gid)!
      },
      async removeMember(groupId, uid) {
        const g = c.groups.get(groupId)
        if (!g || (uid !== userId && g.owner_id !== userId)) throw new Error('Yetkiniz yok')
        for (const [id, r] of c.rows) if (r.group_id === groupId && r.user_id === uid) c.rows.delete(id)
        c.members = c.members.filter((m) => !(m.group_id === groupId && m.user_id === uid))
      },
      async setDisplayName(groupId, name) {
        for (const m of c.members) if (m.group_id === groupId && m.user_id === userId) m.display_name = name
      },
      async setGroupCycle(groupId, startDay) {
        const g = c.groups.get(groupId)
        if (!g || g.owner_id !== userId) throw new Error('Ay döngüsünü yalnızca grup yöneticisi değiştirebilir')
        g.cycle_start_day = startDay
      },
      async settlePeriod(groupId, start, end, totalKurus, shares) {
        const g = c.groups.get(groupId)
        if (!g || g.owner_id !== userId) throw new Error('Gideri yalnızca grup yöneticisi paylaştırabilir')
        for (const k of Object.keys(shares)) if (!c.isMember(groupId, k)) throw new Error('Paylar yalnızca grup üyelerine verilebilir')
        c.settlements = c.settlements.filter((s) => !(s.group_id === groupId && s.period_start === start))
        c.settlements.push({ group_id: groupId, period_start: start, period_end: end, total_kurus: totalKurus, shares: { ...shares }, created_by: userId, created_at: c.now() })
      },
      async unsettlePeriod(groupId, start) {
        const g = c.groups.get(groupId)
        if (!g || g.owner_id !== userId) throw new Error('Paylaşımı yalnızca grup yöneticisi geri alabilir')
        c.settlements = c.settlements.filter((s) => !(s.group_id === groupId && s.period_start === start))
        c.payments = c.payments.filter((p) => !(p.group_id === groupId && p.period_start === start))
      },
      async setGroupBudget(groupId, budgetKurus) {
        const g = c.groups.get(groupId)
        if (!g || g.owner_id !== userId) throw new Error('Grup bütçesini yalnızca grup yöneticisi değiştirebilir')
        c.budgets.set(groupId, budgetKurus)
      },
      async listGroupBudgets(groupIds) {
        return groupIds.filter((id) => c.isMember(id, userId)).map((id) => ({ id, budget_kurus: c.budgets.get(id) ?? null }))
      },
      async markPayment(groupId, start, from, to, amountKurus, paid) {
        const g = c.groups.get(groupId)
        if (!g || !c.isMember(groupId, userId)) throw new Error('Bu grubun üyesi değilsiniz')
        if (userId !== from && userId !== to && g.owner_id !== userId) throw new Error('Ödemeyi yalnızca yönetici veya ödemenin tarafları işaretleyebilir')
        if (!c.settlements.some((s) => s.group_id === groupId && s.period_start === start)) throw new Error('Bu dönem paylaştırılmamış')
        c.payments = c.payments.filter((p) => !(p.group_id === groupId && p.period_start === start && p.from_user === from && p.to_user === to))
        if (paid) c.payments.push({ group_id: groupId, period_start: start, from_user: from, to_user: to, amount_kurus: amountKurus, marked_by: userId, marked_at: c.now() })
      },
      async listPayments(groupIds) {
        return c.payments.filter((p) => groupIds.includes(p.group_id) && c.isMember(p.group_id, userId)).map((p) => ({ ...p }))
      },
      async listSettlements(groupIds) {
        return c.settlements.filter((s) => groupIds.includes(s.group_id) && c.isMember(s.group_id, userId)).map((s) => ({ ...s, shares: { ...s.shares } }))
      },
      async listGroups() {
        return [...c.groups.values()].filter((g) => c.isMember(g.id, userId)).map((g) => ({ ...g }))
      },
      async listMembers(groupIds) {
        return c.members.filter((m) => groupIds.includes(m.group_id) && c.isMember(m.group_id, userId)).map((m) => ({ ...m }))
      },
      async upsert(rows: CloudTxInput[]) {
        for (const r of rows) {
          must(r.group_id)
          const ex = c.rows.get(r.id)
          if (ex && ex.user_id !== userId) throw new Error('Başka bir üyenin işlemi değiştirilemez')
          c.rows.set(r.id, { ...r, user_id: userId, deleted: false, updated_at: c.now() })
        }
      },
      async remove(ids) {
        for (const id of ids) {
          const r = c.rows.get(id)
          if (r && r.user_id === userId && !r.deleted) c.rows.set(id, { ...r, deleted: true, updated_at: c.now() })
        }
      },
      async pull(groupId, since) {
        must(groupId)
        return [...c.rows.values()]
          .filter((r) => r.group_id === groupId && (!since || r.updated_at > since))
          .sort((a, b) => a.updated_at.localeCompare(b.updated_at))
          .map((r) => ({ ...r }))
      },
    }
  }
}
