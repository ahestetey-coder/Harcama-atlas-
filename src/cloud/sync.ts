import type { AtlasRepository } from '../data/repository'
import { UserFacingError } from '../data/repository'
import { normalizeText } from '../domain/normalize'
import type { Category, Member, SpendGroup, Transaction } from '../domain/types'
import type { CloudBackend, CloudTxInput, CloudTxRow } from './types'

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

/** Yerel bir grubu bulutta paylaşıma açar. Gruptaki kendi işlemleriniz ilk eşitlemede gönderilir. */
export async function shareGroup(repo: AtlasRepository, backend: CloudBackend, groupId: string): Promise<SpendGroup> {
  const g = await repo.db.groups.get(groupId)
  if (!g) throw new UserFacingError('Grup bulunamadı.')
  if (g.cloudId) return g
  const cloud = await backend.createGroup(g.name, g.color, await selfName(repo))
  const updated = { ...g, cloudId: cloud.id, updatedAt: new Date().toISOString() }
  await repo.db.groups.put(updated)
  return updated
}

/**
 * Davet koduyla bir gruba katılır. Aynı adlı paylaşılmamış yerel grup varsa (ör. "Ortak") o grup
 * bağlanır; yoksa yeni yerel grup oluşturulur.
 */
export async function joinWithInvite(repo: AtlasRepository, backend: CloudBackend, code: string): Promise<SpendGroup> {
  const cloud = await backend.joinGroup(code, await selfName(repo))
  const db = repo.db
  return db.transaction('rw', db.groups, async () => {
    const all = await db.groups.toArray()
    const now = new Date().toISOString()
    const linked = all.find((g) => g.cloudId === cloud.id)
    if (linked) return linked
    const sameName = all.find((g) => !g.cloudId && normalizeText(g.name) === normalizeText(cloud.name))
    const group: SpendGroup = sameName
      ? { ...sameName, cloudId: cloud.id, archived: false, updatedAt: now }
      : { id: cloud.id, name: cloud.name, color: cloud.color, cloudId: cloud.id, archived: false, order: Math.max(-1, ...all.map((g) => g.order)) + 1, createdAt: now, updatedAt: now }
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
    const { cloudId: _drop, ...rest } = g
    void _drop
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
  const linked = (await db.groups.toArray()).filter((g) => g.cloudId)
  // Buluttan çıkarılmış (veya silinmiş) gruplar yerelde de ayrılır
  for (const g of linked.filter((g) => !cloudGroups.has(g.cloudId!))) await unlinkGroup(repo, g)
  const active = linked.filter((g) => cloudGroups.has(g.cloudId!))
  if (!active.length) return report

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
