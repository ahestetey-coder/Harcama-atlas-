import type { Table } from 'dexie'
import type { AtlasDb } from '../data/db'
import type { AtlasRepository } from '../data/repository'
import type { RecordBackend } from './types'

/**
 * Kişisel verilerin hesapla eşitlenmesi: aynı hesapla hangi cihazdan girilirse girilsin aynı kayıtlar görünür.
 *
 * Kurallar:
 *  - Her tablo satırı bulutta kendi satırı olarak (JSON) durur; herkes yalnızca kendi satırlarını görür (RLS).
 *  - Önce buluttaki değişiklikler alınır, sonra bu cihazdaki değişiklikler gönderilir. Son eşitlemedeki hâli
 *    (özet) tutulduğu için hangi tarafın değiştiği bilinir; yalnızca bir taraf değiştiyse o kazanır.
 *  - İki taraf da değiştiyse: dokunulmamış (yeni kurulumdaki varsayılan) kayıt düzenlenmiş olana yer verir,
 *    yoksa son düzenlenen kazanır. Ayarlar alan alan birleştirilir; boş alan diğer taraftan doldurulur.
 *  - Bir cihazın bu hesapla ilk eşitlemesinde yerel hiçbir kayıt silinmez: yalnızca birleştirilir.
 *  - Üyelerden gelen ortak grup harcamaları ve planlı kayıtlar gönderilmez (onları grup eşitlemesi getirir).
 */

type Row = Record<string, unknown>

interface Spec {
  tbl: string
  table: (db: AtlasDb) => Table<Row, string>
  key: 'id' | 'key'
  include?: (row: Row, selfId: string) => boolean
  /** Buluttan gelen silme bu kaydı silemez (ayarlar, cihaz sahibi). */
  keep?: boolean
}

const SKIP_SOURCES = new Set(['shared', 'planned', 'settlement', 'demo'])
const SYNCED_META = new Set(['recurring-dismissed'])

const t = (name: keyof AtlasDb) => (db: AtlasDb) => db[name] as unknown as Table<Row, string>

export const SYNC_SPECS: Spec[] = [
  { tbl: 'settings', table: t('settings'), key: 'id', keep: true },
  { tbl: 'categories', table: t('categories'), key: 'id' },
  { tbl: 'groups', table: t('groups'), key: 'id' },
  { tbl: 'members', table: t('members'), key: 'id', include: (m, self) => m.id === self, keep: true },
  { tbl: 'rules', table: t('rules'), key: 'id' },
  { tbl: 'recurring', table: t('recurring'), key: 'id' },
  { tbl: 'goals', table: t('goals'), key: 'id' },
  { tbl: 'assets', table: t('assets'), key: 'id' },
  { tbl: 'imports', table: t('imports'), key: 'id' },
  { tbl: 'transactions', table: t('transactions'), key: 'id', include: (r) => !SKIP_SOURCES.has(r.source as string) },
  { tbl: 'meta', table: t('meta'), key: 'key', include: (r) => SYNCED_META.has(r.key as string) },
]

const STATE = (uid: string) => `usync:${uid}`
const OVERLAP_MS = 60_000
const CHUNK = 200

interface SyncState {
  cursor: string | null
  /** `tablo/kimlik` → son eşitlemede buluttaki hâlin özeti. */
  hashes: Record<string, string>
}

export interface RecordSyncReport {
  received: number
  sent: number
  deleted: number
}

/** Anahtarları sıralı JSON; `updatedAt` özetten çıkarılır (yalnızca saati değişen kayıt gönderilmez). */
function stable(v: unknown, top = true): string {
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : stable(x, false))).join(',')}]`
  if (v && typeof v === 'object') {
    const keys = Object.keys(v as Row)
      .filter((k) => (v as Row)[k] !== undefined && !(top && k === 'updatedAt'))
      .sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stable((v as Row)[k], false)}`).join(',')}}`
  }
  return JSON.stringify(v ?? null)
}

/** cyrb53: kısa, hızlı özet (güvenlik için değil, değişiklik fark etmek için). */
export function recordHash(row: unknown): string {
  const s = stable(row)
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

const isEmpty = (v: unknown) => v === undefined || v === null || (Array.isArray(v) && v.length === 0)
const edited = (r: Row) => typeof r.createdAt === 'string' && typeof r.updatedAt === 'string' && r.createdAt !== r.updatedAt
const stamp = (r: Row) => (typeof r.updatedAt === 'string' ? r.updatedAt : '')

/** İki tarafta da değişmiş kaydı birleştirir. */
export function resolveConflict(tbl: string, local: Row, remote: Row): Row {
  const localNewer = stamp(local) > stamp(remote)
  if (tbl === 'settings' || tbl === 'members') {
    const [base, other] = localNewer ? [local, remote] : [remote, local]
    const out: Row = { ...base }
    for (const [k, v] of Object.entries(other)) if (isEmpty(out[k]) && !isEmpty(v)) out[k] = v
    if (tbl === 'members') {
      if (out.name === 'Ben' && typeof other.name === 'string' && other.name !== 'Ben') out.name = other.name
      out.groupIds = [...new Set([...((local.groupIds as string[]) ?? []), ...((remote.groupIds as string[]) ?? [])])]
    }
    return out
  }
  if (tbl === 'meta') {
    const a = Array.isArray(local.value) ? local.value : []
    const b = Array.isArray(remote.value) ? remote.value : []
    return { ...remote, value: [...new Set([...b, ...a])] }
  }
  if (edited(local) !== edited(remote)) return edited(local) ? local : remote
  return localNewer ? local : remote
}

async function readState(db: AtlasDb, uid: string): Promise<SyncState | null> {
  const v = (await db.meta.get(STATE(uid)))?.value as SyncState | undefined
  return v && typeof v === 'object' && v.hashes ? v : null
}

/** Ortak grup bir cihazda iki ayrı yerel grupla bağlıysa (eski cihazlar) tek gruba indirir. */
async function dedupeLinkedGroups(db: AtlasDb, hashes: Record<string, string>): Promise<void> {
  const groups = (await db.groups.toArray()).filter((g) => g.cloudId)
  const byCloud = new Map<string, typeof groups>()
  for (const g of groups) byCloud.set(g.cloudId!, [...(byCloud.get(g.cloudId!) ?? []), g])
  for (const list of byCloud.values()) {
    if (list.length < 2) continue
    list.sort((a, b) => Number(!(`groups/${a.id}` in hashes)) - Number(!(`groups/${b.id}` in hashes)) || a.id.localeCompare(b.id))
    const [keep, ...drop] = list
    const ids = new Set(drop.map((g) => g.id))
    await db.transaction('rw', [db.groups, db.transactions, db.recurring, db.members, db.settings, db.meta], async () => {
      await db.transactions.where('groupId').anyOf([...ids]).modify((x) => {
        x.groupId = keep.id
      })
      await db.recurring.filter((r) => !!r.groupId && ids.has(r.groupId)).modify((r) => {
        r.groupId = keep.id
      })
      await db.members.toCollection().modify((m) => {
        if (m.groupIds.some((x) => ids.has(x))) m.groupIds = [...new Set(m.groupIds.map((x) => (ids.has(x) ? keep.id : x)))]
      })
      const s = await db.settings.get('settings')
      if (s?.plannedGroups && Object.values(s.plannedGroups).some((x) => x && ids.has(x))) {
        const pg = Object.fromEntries(Object.entries(s.plannedGroups).map(([k, x]) => [k, x && ids.has(x) ? keep.id : x]))
        await db.settings.put({ ...s, plannedGroups: pg })
      }
      await db.groups.bulkDelete([...ids])
      await db.meta.bulkDelete(drop.flatMap((g) => [`cloud-cursor:${g.id}`, `cloud-pushed:${g.id}`]))
    })
  }
}

/** Hesabın kişisel kayıtlarını bulutla iki yönlü eşitler. */
export async function syncRecords(repo: AtlasRepository, backend: RecordBackend): Promise<RecordSyncReport> {
  const report: RecordSyncReport = { received: 0, sent: 0, deleted: 0 }
  const uid = backend.userId()
  if (!uid) return report
  const db = repo.db
  const prev = await readState(db, uid)
  const first = !prev
  const hashes: Record<string, string> = { ...(prev?.hashes ?? {}) }
  const since = prev?.cursor ? new Date(Date.parse(prev.cursor) - OVERLAP_MS).toISOString() : null
  const selfId = (await repo.getSettings()).selfMemberId ?? uid

  // 1) Al
  const rows = await backend.pullRecords(since)
  let cursor = prev?.cursor ?? null
  const latest = new Map<string, (typeof rows)[number]>()
  for (const r of rows) {
    if (!cursor || r.updated_at > cursor) cursor = r.updated_at
    latest.set(`${r.tbl}/${r.id}`, r)
  }
  const tables = SYNC_SPECS.map((s) => s.table(db))
  await db.transaction('rw', [...tables, db.meta], async () => {
    for (const spec of SYNC_SPECS) {
      const mine = [...latest.values()].filter((r) => r.tbl === spec.tbl)
      if (!mine.length) continue
      const table = spec.table(db)
      const locals = await table.bulkGet(mine.map((r) => r.id))
      const puts: Row[] = []
      const dels: string[] = []
      mine.forEach((r, i) => {
        const k = `${spec.tbl}/${r.id}`
        const local = locals[i]
        const known = hashes[k]
        if (r.deleted || !r.data) {
          if (!local) {
            delete hashes[k]
            return
          }
          // İlk eşitlemede yerel kayıt silinmez; değişmiş kayıt silmeye üstün gelir (yeniden gönderilir)
          if (!first && !spec.keep && recordHash(local) === known) dels.push(r.id)
          delete hashes[k]
          return
        }
        const data = r.data
        if (data[spec.key] !== r.id || (spec.include && !spec.include(data, selfId))) return
        const rh = recordHash(data)
        if (!local) {
          // Bu cihazda silinmiş, bulutta değişmemiş: silme gönderilecek
          if (!first && known !== undefined && rh === known) return
          puts.push(data)
          hashes[k] = rh
          return
        }
        const lh = recordHash(local)
        if (lh === rh) {
          hashes[k] = rh
          return
        }
        const localChanged = first || lh !== known
        if (!localChanged) {
          puts.push(data)
          hashes[k] = rh
          return
        }
        // Bulut son eşitlemedeki hâlinde: yerel değişiklik gönderilecek
        if (!first && rh === known) return
        const merged = resolveConflict(spec.tbl, local, data)
        if (recordHash(merged) !== lh) puts.push(merged)
        hashes[k] = rh
      })
      if (puts.length) await table.bulkPut(puts)
      if (dels.length) await table.bulkDelete(dels)
      report.received += puts.length
      report.deleted += dels.length
    }
    await db.meta.put({ key: STATE(uid), value: { cursor, hashes } satisfies SyncState })
  })

  await dedupeLinkedGroups(db, hashes)

  // 2) Gönder
  const out: { k: string; h: string | null; row: { tbl: string; id: string; data: Row | null } }[] = []
  for (const spec of SYNC_SPECS) {
    const seen = new Set<string>()
    for (const row of await spec.table(db).toArray()) {
      if (spec.include && !spec.include(row, selfId)) continue
      const id = row[spec.key] as string
      const k = `${spec.tbl}/${id}`
      seen.add(k)
      const h = recordHash(row)
      if (hashes[k] !== h) out.push({ k, h, row: { tbl: spec.tbl, id, data: row } })
    }
    for (const k of Object.keys(hashes)) {
      if (!k.startsWith(`${spec.tbl}/`) || seen.has(k)) continue
      out.push({ k, h: null, row: { tbl: spec.tbl, id: k.slice(spec.tbl.length + 1), data: null } })
    }
  }
  for (let i = 0; i < out.length; i += CHUNK) {
    const part = out.slice(i, i + CHUNK)
    await backend.upsertRecords(part.map((x) => x.row))
    for (const x of part) {
      if (x.h) hashes[x.k] = x.h
      else delete hashes[x.k]
    }
    await db.meta.put({ key: STATE(uid), value: { cursor, hashes } satisfies SyncState })
  }
  report.sent = out.length
  return report
}

/** "Verilerimi sıfırla": hesabın buluttaki kişisel kayıtlarını siler (diğer cihazlarda da kalkar). */
export async function clearMyCloudRecords(backend: RecordBackend): Promise<void> {
  if (backend.userId()) await backend.clearRecords()
}
