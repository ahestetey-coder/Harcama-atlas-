import type { AtlasRepository } from '../data/repository'
import { UserFacingError } from '../data/repository'
import { normalizeText } from '../domain/normalize'
import type { Category, GroupSettlement, Member, SettlementPayment, SpendGroup, Transaction } from '../domain/types'
import type { CloudBackend, CloudGroup, CloudPayment, CloudSettlement, CloudTxInput, CloudTxRow } from './types'

/**
 * Ortak grupların bulutla eşitlenmesi.
 *
 * Kurallar:
 *  - Yalnızca bulutta paylaşılan (cloudId'li) gruplardaki işlemler gönderilir; diğer her şey cihazda kalır.
 *  - Herkes yalnızca kendi işlemlerini gönderir/siler. Başka üyelerin işlemleri bu cihaza "Üyeden"
 *    (source: 'shared') olarak gelir ve burada değiştirilmez; bir sonraki eşitlemede buluttakiyle güncellenir.
 *  - Bu cihazdan gönderilen işlemlerin listesi tutulur; listedeki bir işlem silinir veya gruptan çıkarılırsa
 *    bulutta da silinir.
 */

const CURSOR = (g: string) => `cloud-cursor:${g}`
const PUSHED = (g: string) => `cloud-pushed:${g}`
const CHUNK = 200
const OVERLAP_MS = 60_000

export interface SyncReport {
  groups: number
  pushed: number
  removed: number
  received: number
  deletedLocal: number
}

async function meta<T>(repo: AtlasRepository, key: string, fallback: T): Promise<T> {
  const e = await repo.db.meta.get(key)
  return (e?.value as T) ?? fallback
}

async function setMeta(repo: AtlasRepository, key: string, value: unknown): Promise<void> {
  if (value === null) await repo.db.meta.delete(key)
  else await repo.db.meta.put({ key, value })
}

export async function selfMemberId(repo: AtlasRepository): Promise<string | undefined> {
  return (await repo.getSettings()).selfMemberId
}

/**
 * Giriş yapan hesabın kimliğini bu cihazın "Ben" üyesine verir. Önceki yerel kimlikle yazılmış
 * işlemler yeni kimliğe taşınır.
 */
export async function adoptCloudIdentity(repo: AtlasRepository, userId: string): Promise<void> {
  const db = repo.db
  await db.transaction('rw', db.members, db.transactions, db.settings, async () => {
    const settings = await repo.getSettings()
    const old = settings.selfMemberId
    if (old === userId) return
    const now = new Date().toISOString()
    const prev = old ? await db.members.get(old) : undefined
    const existing = await db.members.get(userId)
    const self: Member = {
      id: userId,
      name: prev?.name ?? existing?.name ?? 'Ben',
      color: prev?.color ?? existing?.color ?? '#0f766e',
      groupIds: [...new Set([...(prev?.groupIds ?? []), ...(existing?.groupIds ?? [])])],
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    }
    await db.members.put(self)
    if (old && old !== userId) {
      await db.members.delete(old)
      await db.transactions
        .where('memberId')
        .equals(old)
        .modify((t) => {
          t.memberId = userId
        })
    }
    await db.settings.put({ ...settings, selfMemberId: userId, updatedAt: now })
  })
}

async function selfName(repo: AtlasRepository): Promise<string> {
  const id = await selfMemberId(repo)
  const m = id ? await repo.db.members.get(id) : undefined
  const name = m?.name?.trim()
  if (!name || name === 'Ben') throw new UserFacingError('Önce adınızı yazın; grup üyeleri sizi bu adla görecek.')
  return name
}

/**
 * Grubun ay döngüsünü değiştirir. Paylaşılan grupta yalnızca yönetici değiştirebilir ve
 * değişiklik buluta yazılır; diğer üyelere eşitlemeyle gelir.
 */
export async function setGroupCycle(repo: AtlasRepository, backend: CloudBackend | null, groupId: string, startDay: number | null): Promise<void> {
  const g = await repo.db.groups.get(groupId)
  if (!g) throw new UserFacingError('Grup bulunamadı.')
  const day = startDay && startDay > 1 ? Math.min(28, Math.trunc(startDay)) : null
  if (g.cloudId) {
    if (!backend?.userId()) throw new UserFacingError('Paylaşılan grubun ayarını değiştirmek için giriş yapın.')
    if (g.cloudOwnerId && g.cloudOwnerId !== backend.userId()) throw new UserFacingError('Bu grubun ay döngüsünü yalnızca grup yöneticisi değiştirebilir.')
    await backend.setGroupCycle(g.cloudId, day)
  }
  await repo.updateGroup(groupId, { cycleStartDay: day })
}

/**
 * Paylaşılan grubun bir dönemini üyelere paylaştırır (aynı dönem yeniden paylaştırılırsa güncellenir).
 * Yalnızca grup yöneticisi yapabilir; üyelere eşitlemeyle gelir.
 */
export async function settleGroupPeriod(
  repo: AtlasRepository,
  backend: CloudBackend | null,
  groupId: string,
  input: Pick<GroupSettlement, 'start' | 'end' | 'totalKurus' | 'shares'>,
): Promise<void> {
  const { g, cloudId, uid } = await ownedSharedGroup(repo, backend, groupId, 'Gideri yalnızca grup yöneticisi paylaştırabilir.')
  await backend!.settlePeriod(cloudId, input.start, input.end, input.totalKurus, input.shares)
  const entry: GroupSettlement = { ...input, shares: { ...input.shares }, createdBy: uid, createdAt: new Date().toISOString() }
  const list = [...(g.settlements ?? []).filter((x) => x.start !== input.start), entry].sort((a, b) => a.start.localeCompare(b.start))
  await repo.db.groups.update(groupId, { settlements: list })
}

/**
 * Plus: grubun aylık bütçesi. Paylaşılan grupta yalnızca yönetici değiştirir ve üyelere eşitlenir;
 * yerel grupta doğrudan kaydedilir.
 */
export async function setGroupBudget(repo: AtlasRepository, backend: CloudBackend | null, groupId: string, budgetKurus: number | null): Promise<void> {
  const g = await repo.db.groups.get(groupId)
  if (!g) throw new UserFacingError('Grup bulunamadı.')
  if (budgetKurus !== null && (!Number.isSafeInteger(budgetKurus) || budgetKurus <= 0)) throw new UserFacingError('Geçerli bir tutar girin.')
  if (g.cloudId) {
    const { cloudId } = await ownedSharedGroup(repo, backend, groupId, 'Grup bütçesini yalnızca grup yöneticisi değiştirebilir.')
    await backend!.setGroupBudget(cloudId, budgetKurus)
  }
  await repo.db.groups.update(groupId, { budgetKurus })
}

/** Plus: paylaştırılmış dönemdeki bir ödemeyi ödendi/ödenmedi işaretler (yönetici veya taraflar). */
export async function markSettlementPayment(
  repo: AtlasRepository,
  backend: CloudBackend | null,
  groupId: string,
  start: string,
  payment: { from: string; to: string; amountKurus: number },
  paid: boolean,
): Promise<void> {
  const g = await repo.db.groups.get(groupId)
  if (!g?.cloudId) throw new UserFacingError('Ödeme durumu yalnızca paylaşılan gruplarda tutulur.')
  const uid = backend?.userId()
  if (!backend || !uid) throw new UserFacingError('Bu işlem için giriş yapın.')
  if (uid !== payment.from && uid !== payment.to && uid !== g.cloudOwnerId) throw new UserFacingError('Ödemeyi yalnızca yönetici veya ödemenin tarafları işaretleyebilir.')
  await backend.markPayment(g.cloudId, start, payment.from, payment.to, payment.amountKurus, paid)
  const settlements = (g.settlements ?? []).map((s) => {
    if (s.start !== start) return s
    const rest = (s.payments ?? []).filter((p) => !(p.from === payment.from && p.to === payment.to))
    return { ...s, payments: paid ? [...rest, { ...payment, markedBy: uid, markedAt: new Date().toISOString() }] : rest }
  })
  await repo.db.groups.update(groupId, { settlements })
}

/** Dönemin paylaşımını geri alır. Yalnızca grup yöneticisi. */
export async function unsettleGroupPeriod(repo: AtlasRepository, backend: CloudBackend | null, groupId: string, start: string): Promise<void> {
  const { g, cloudId } = await ownedSharedGroup(repo, backend, groupId, 'Paylaşımı yalnızca grup yöneticisi geri alabilir.')
  await backend!.unsettlePeriod(cloudId, start)
  await repo.db.groups.update(groupId, { settlements: (g.settlements ?? []).filter((x) => x.start !== start) })
}

async function ownedSharedGroup(repo: AtlasRepository, backend: CloudBackend | null, groupId: string, notOwner: string) {
  const g = await repo.db.groups.get(groupId)
  if (!g?.cloudId) throw new UserFacingError('Gider yalnızca paylaşılan gruplarda paylaştırılabilir.')
  const uid = backend?.userId()
  if (!backend || !uid) throw new UserFacingError('Bu işlem için giriş yapın.')
  if (g.cloudOwnerId !== uid) throw new UserFacingError(notOwner)
  return { g, cloudId: g.cloudId, uid }
}

function fromCloudPayment(p: CloudPayment): SettlementPayment {
  return { from: p.from_user, to: p.to_user, amountKurus: Number(p.amount_kurus), markedBy: p.marked_by, markedAt: p.marked_at }
}

function fromCloudSettlement(s: CloudSettlement): GroupSettlement {
  const shares: Record<string, number> = {}
  for (const [k, v] of Object.entries(s.shares ?? {})) if (Number.isSafeInteger(v) && v >= 0) shares[k] = v
  return { start: s.period_start.slice(0, 10), end: s.period_end.slice(0, 10), totalKurus: Number(s.total_kurus), shares, createdBy: s.created_by, createdAt: s.created_at }
}

/** Kendi adınız henüz yazılmadıysa ("Ben") hesaptaki adı kullanır. */
export async function setDefaultSelfName(repo: AtlasRepository, name: string): Promise<void> {
  const id = await selfMemberId(repo)
  const m = id ? await repo.db.members.get(id) : undefined
  const n = name.trim().slice(0, 40)
  if (m && n && (!m.name.trim() || m.name === 'Ben')) await repo.db.members.update(m.id, { name: n, updatedAt: new Date().toISOString() })
}

/** Yerel bir grubu bulutta paylaşıma açar. Gruptaki kendi işlemleriniz ilk eşitlemede gönderilir. */
export async function shareGroup(repo: AtlasRepository, backend: CloudBackend, groupId: string): Promise<SpendGroup> {
  const g = await repo.db.groups.get(groupId)
  if (!g) throw new UserFacingError('Grup bulunamadı.')
  if (g.cloudId) return g
  const cloud = await backend.createGroup(g.name, g.color, await selfName(repo))
  if (g.cycleStartDay) await backend.setGroupCycle(cloud.id, g.cycleStartDay)
  const updated = { ...g, cloudId: cloud.id, cloudOwnerId: cloud.owner_id, updatedAt: new Date().toISOString() }
  await repo.db.groups.put(updated)
  return updated
}

/**
 * Davet koduyla bir gruba katılır. Aynı adlı paylaşılmamış yerel grup varsa (ör. "Ortak") o grup
 * bağlanır; yoksa yeni yerel grup oluşturulur.
 */
export async function joinWithInvite(repo: AtlasRepository, backend: CloudBackend, code: string): Promise<SpendGroup> {
  const cloud = await backend.joinGroup(code, await selfName(repo))
  return linkCloudGroup(repo, cloud)
}

/**
 * Buluttaki bir grubu bu cihazdaki gruba bağlar: aynı adlı (bağlanmamış) grup varsa o kullanılır,
 * yoksa yeni grup oluşturulur. Zaten bağlıysa olduğu gibi döner.
 */
async function linkCloudGroup(repo: AtlasRepository, cloud: CloudGroup): Promise<SpendGroup> {
  const db = repo.db
  return db.transaction('rw', db.groups, async () => {
    const all = await db.groups.toArray()
    const now = new Date().toISOString()
    const linked = all.find((g) => g.cloudId === cloud.id)
    if (linked) return linked
    const sameName = all.find((g) => !g.cloudId && normalizeText(g.name) === normalizeText(cloud.name))
    const shared = { cloudId: cloud.id, cloudOwnerId: cloud.owner_id, cycleStartDay: cloud.cycle_start_day ?? null }
    const group: SpendGroup = sameName
      ? { ...sameName, ...shared, archived: false, updatedAt: now }
      : { id: cloud.id, name: cloud.name, color: cloud.color, ...shared, archived: false, order: Math.max(-1, ...all.map((g) => g.order)) + 1, createdAt: now, updatedAt: now }
    await db.groups.put(group)
    return group
  })
}

/** Gruptan ayrılır: buluttaki işlemleriniz silinir, diğer üyelerin işlemleri bu cihazdan kaldırılır. */
export async function leaveGroup(repo: AtlasRepository, backend: CloudBackend, groupId: string): Promise<void> {
  const g = await repo.db.groups.get(groupId)
  if (!g?.cloudId) return
  const self = backend.userId()
  if (self) await backend.removeMember(g.cloudId, self)
  await unlinkGroup(repo, g)
}

async function unlinkGroup(repo: AtlasRepository, g: SpendGroup): Promise<void> {
  const db = repo.db
  await db.transaction('rw', [db.groups, db.transactions, db.members, db.meta, db.settings], async () => {
    await db.transactions
      .where('groupId')
      .equals(g.id)
      .filter((t) => t.source === 'shared')
      .delete()
    const { cloudId: _drop, settlements: _settled, ...rest } = g
    void _drop
    void _settled
    await db.groups.put({ ...rest, updatedAt: new Date().toISOString() })
    await db.meta.bulkDelete([CURSOR(g.id), PUSHED(g.id)])
    const selfId = (await repo.getSettings()).selfMemberId
    for (const m of await db.members.toArray()) {
      if (m.id === selfId || !m.groupIds.includes(g.id)) continue
      const groupIds = m.groupIds.filter((x) => x !== g.id)
      if (groupIds.length) await db.members.put({ ...m, groupIds })
      else await db.members.delete(m.id)
    }
  })
}

function toCloud(t: Transaction, cloudGroupId: string, cat: Category | undefined): CloudTxInput {
  return {
    id: t.id,
    group_id: cloudGroupId,
    date: t.date,
    amount_kurus: t.amountKurus,
    type: t.type,
    description: t.description.slice(0, 200),
    category_name: cat?.name ?? null,
    category_icon: cat?.icon ?? null,
    category_color: cat?.color ?? null,
    note: t.note?.slice(0, 500) ?? null,
    installment: t.installment ? { current: t.installment.current, total: t.installment.total } : null,
  }
}

function validRow(r: CloudTxRow): boolean {
  return (
    typeof r.id === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(r.date) &&
    Number.isSafeInteger(r.amount_kurus) &&
    r.amount_kurus > 0 &&
    ['expense', 'refund', 'transfer'].includes(r.type) &&
    typeof r.description === 'string' &&
    r.description.length > 0
  )
}

/** Paylaşılan bütün grupları eşitler: önce kendi değişikliklerinizi gönderir, sonra diğer üyelerinkini alır. */
export async function syncAll(repo: AtlasRepository, backend: CloudBackend): Promise<SyncReport> {
  const report: SyncReport = { groups: 0, pushed: 0, removed: 0, received: 0, deletedLocal: 0 }
  const userId = backend.userId()
  if (!userId) return report
  await adoptCloudIdentity(repo, userId)
  const db = repo.db

  const cloudGroups = new Map((await backend.listGroups()).map((g) => [g.id, g]))
  // Hesabın üyesi olduğu ama bu cihazda bağlı olmayan gruplar (yeni cihaz, ana ekrana eklenen
  // uygulama, başka tarayıcı) kendiliğinden bağlanır; davet bağlantısını yeniden açmak gerekmez.
  const linkedIds = new Set((await db.groups.toArray()).map((g) => g.cloudId).filter(Boolean))
  for (const cg of cloudGroups.values()) if (!linkedIds.has(cg.id)) await linkCloudGroup(repo, cg)
  const linked = (await db.groups.toArray()).filter((g) => g.cloudId)
  // Buluttan çıkarılmış (veya silinmiş) gruplar yerelde de ayrılır
  for (const g of linked.filter((g) => !cloudGroups.has(g.cloudId!))) await unlinkGroup(repo, g)
  const active = linked.filter((g) => cloudGroups.has(g.cloudId!))
  if (!active.length) return report
  // Yöneticinin belirlediği ay döngüsü ve yönetici bilgisi buluttan gelir
  for (const g of active) {
    const cg = cloudGroups.get(g.cloudId!)!
    const cycle = cg.cycle_start_day ?? null
    if ((g.cycleStartDay ?? null) !== cycle || g.cloudOwnerId !== cg.owner_id) {
      await db.groups.update(g.id, { cycleStartDay: cycle, cloudOwnerId: cg.owner_id })
      Object.assign(g, { cycleStartDay: cycle, cloudOwnerId: cg.owner_id })
    }
  }
  // Yöneticinin paylaştırdığı dönemler. Okunamazsa (ör. sunucu şeması henüz güncellenmediyse)
  // eşitlemenin geri kalanı yine çalışır, eldeki paylaşımlar korunur.
  // Ödeme durumu ve grup bütçesi (gelişmiş paylaşım) ayrı okunur: sunucuya ilgili SQL henüz
  // kurulmadıysa hata verir ve yok sayılır; paylaşımlar yine eşitlenir.
  const groupIds = active.map((g) => g.cloudId!)
  let payments: CloudPayment[] = []
  let paymentsOk = true
  try {
    payments = await backend.listPayments(groupIds)
  } catch {
    paymentsOk = false
  }
  try {
    const settlements = await backend.listSettlements(groupIds)
    for (const g of active) {
      const list = settlements
        .filter((x) => x.group_id === g.cloudId)
        .map((x) => {
          const s = fromCloudSettlement(x)
          const own = paymentsOk
            ? payments.filter((p) => p.group_id === x.group_id && p.period_start.slice(0, 10) === s.start).map(fromCloudPayment)
            : (g.settlements?.find((y) => y.start === s.start)?.payments ?? [])
          return own.length ? { ...s, payments: own.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to)) } : s
        })
        .sort((a, b) => a.start.localeCompare(b.start))
      if (JSON.stringify(g.settlements ?? []) !== JSON.stringify(list)) {
        await db.groups.update(g.id, { settlements: list })
        g.settlements = list
      }
    }
  } catch {
    /* paylaşımlar bir sonraki eşitlemede denenir */
  }
  try {
    const budgets = new Map((await backend.listGroupBudgets(groupIds)).map((b) => [b.id, b.budget_kurus == null ? null : Number(b.budget_kurus)]))
    for (const g of active) {
      const b = budgets.get(g.cloudId!) ?? null
      if ((g.budgetKurus ?? null) !== b) {
        await db.groups.update(g.id, { budgetKurus: b })
        g.budgetKurus = b
      }
    }
  } catch {
    /* sunucu şeması eskiyse grup bütçesi yereldeki gibi kalır */
  }

  const categories = await db.categories.toArray()
  const catById = new Map(categories.map((c) => [c.id, c]))
  const catByName = new Map(categories.map((c) => [normalizeText(c.name), c]))
  const resolveCategory = async (r: CloudTxRow): Promise<string | null> => {
    if (!r.category_name) return null
    const found = catByName.get(normalizeText(r.category_name))
    if (found) return found.id
    // Üyenin kendi kategorisi bu cihazda yoksa aynı adla oluşturulur
    const cat = await repo.addCategory({ name: r.category_name, icon: r.category_icon ?? 'shapes', color: r.category_color ?? '#94a3b8' })
    catByName.set(normalizeText(cat.name), cat)
    catById.set(cat.id, cat)
    return cat.id
  }

  // Üyeler
  const members = await backend.listMembers(active.map((g) => g.cloudId!))
  const localGroupOf = new Map(active.map((g) => [g.cloudId!, g.id]))
  await db.transaction('rw', db.members, db.transactions, async () => {
    const now = new Date().toISOString()
    const byUser = new Map<string, { name: string; color: string; groups: string[] }>()
    for (const m of members) {
      const lg = localGroupOf.get(m.group_id)
      if (!lg) continue
      const e = byUser.get(m.user_id) ?? { name: m.display_name, color: m.color, groups: [] }
      e.groups.push(lg)
      byUser.set(m.user_id, e)
    }
    for (const [id, e] of byUser) {
      const cur = await db.members.get(id)
      const keep = (cur?.groupIds ?? []).filter((x) => !active.some((g) => g.id === x))
      await db.members.put({
        id,
        name: id === userId ? (cur?.name ?? e.name) : e.name,
        color: cur?.color ?? e.color,
        groupIds: [...new Set([...keep, ...e.groups])],
        createdAt: cur?.createdAt ?? now,
        updatedAt: now,
      })
    }
    // Gruptan çıkan üyeler ve işlemleri
    for (const m of await db.members.toArray()) {
      if (m.id === userId) continue
      for (const g of active) {
        if (!m.groupIds.includes(g.id) || byUser.get(m.id)?.groups.includes(g.id)) continue
        await db.transactions
          .where('memberId')
          .equals(m.id)
          .filter((t) => t.groupId === g.id && t.source === 'shared')
          .delete()
        m.groupIds = m.groupIds.filter((x) => x !== g.id)
      }
      if (m.groupIds.length) await db.members.put(m)
      else await db.members.delete(m.id)
    }
  })

  for (const g of active) {
    report.groups++
    const cloudId = g.cloudId!
    // 1) Gönder
    const own = (await db.transactions.where('groupId').equals(g.id).toArray()).filter((t) => t.source !== 'shared' && (!t.memberId || t.memberId === userId))
    const pushed = await meta<Record<string, string>>(repo, PUSHED(g.id), {})
    const changed = own.filter((t) => pushed[t.id] !== t.updatedAt)
    for (let i = 0; i < changed.length; i += CHUNK) {
      const part = changed.slice(i, i + CHUNK)
      await backend.upsert(part.map((t) => toCloud(t, cloudId, t.categoryId ? catById.get(t.categoryId) : undefined)))
      for (const t of part) pushed[t.id] = t.updatedAt
      await setMeta(repo, PUSHED(g.id), pushed)
    }
    report.pushed += changed.length
    const ownIds = new Set(own.map((t) => t.id))
    const gone = Object.keys(pushed).filter((id) => !ownIds.has(id))
    if (gone.length) {
      await backend.remove(gone)
      for (const id of gone) delete pushed[id]
      await setMeta(repo, PUSHED(g.id), pushed)
      report.removed += gone.length
    }

    // 2) Al
    const cursor = await meta<string | null>(repo, CURSOR(g.id), null)
    // Aynı anda yazılan satırları kaçırmamak için imleçten biraz geriye gidilir; tekrar gelenler zararsızdır.
    const since = cursor ? new Date(Date.parse(cursor) - OVERLAP_MS).toISOString() : null
    const rows = await backend.pull(cloudId, since)
    let maxSeen = cursor
    const incoming: Transaction[] = []
    const toDelete: string[] = []
    for (const r of rows) {
      if (!maxSeen || r.updated_at > maxSeen) maxSeen = r.updated_at
      if (r.user_id === userId) continue // kendi işlemlerimiz: bu cihaz esastır
      if (r.deleted) {
        toDelete.push(r.id)
        continue
      }
      if (!validRow(r)) continue
      incoming.push({
        id: r.id,
        date: r.date,
        amountKurus: r.amount_kurus,
        type: r.type,
        description: r.description,
        normalizedDescription: normalizeText(r.description),
        categoryId: await resolveCategory(r),
        categorySource: 'manual',
        groupId: g.id,
        memberId: r.user_id,
        note: r.note ?? undefined,
        installment: r.installment ? { current: r.installment.current, total: r.installment.total } : undefined,
        source: 'shared',
        createdAt: r.updated_at,
        updatedAt: r.updated_at,
      })
    }
    await db.transaction('rw', db.transactions, db.meta, async () => {
      // Aynı kimlikli yerel (kendi) kayıt varsa üzerine yazılmaz
      const existing = await db.transactions.bulkGet(incoming.map((t) => t.id))
      const safe = incoming.filter((_, i) => !existing[i] || existing[i]!.source === 'shared')
      if (safe.length) await db.transactions.bulkPut(safe)
      const del = (await db.transactions.bulkGet(toDelete)).filter((t): t is Transaction => !!t && t.source === 'shared').map((t) => t.id)
      if (del.length) await db.transactions.bulkDelete(del)
      report.received += safe.length
      report.deletedLocal += del.length
      if (maxSeen) await db.meta.put({ key: CURSOR(g.id), value: maxSeen })
    })
  }
  return report
}
