import Dexie, { type EntityTable } from 'dexie'
import { normalizeText } from '../domain/normalize'
import type { Asset } from '../domain/assets'
import type { SavingsGoal } from '../domain/goals'
import type { Category, ImportRecord, Member, RecurringPayment, Rule, Settings, SpendGroup, Transaction } from '../domain/types'
import { buildDefaultCategories, buildDefaultGroups, buildDefaultRules, buildSelfMember, RULES_BEFORE_V3 } from './seed'

export interface MetaEntry {
  key: string
  value: unknown
}

export type AtlasDb = Dexie & {
  transactions: EntityTable<Transaction, 'id'>
  categories: EntityTable<Category, 'id'>
  groups: EntityTable<SpendGroup, 'id'>
  members: EntityTable<Member, 'id'>
  recurring: EntityTable<RecurringPayment, 'id'>
  goals: EntityTable<SavingsGoal, 'id'>
  assets: EntityTable<Asset, 'id'>
  rules: EntityTable<Rule, 'id'>
  imports: EntityTable<ImportRecord, 'id'>
  settings: EntityTable<Settings, 'id'>
  meta: EntityTable<MetaEntry, 'key'>
}

export const REAL_DB_NAME = 'harcama-atlasi'
export const DEMO_DB_NAME = 'harcama-atlasi-demo'

/**
 * Şema sürümleri. Yeni bir alan/indeks eklerken:
 *  1. Aşağıya yeni bir `db.version(n)` bloğu ekleyin (eski blokları silmeyin).
 *  2. Gerekirse `.upgrade()` ile mevcut kayıtları dönüştürün.
 *  3. `CURRENT_SCHEMA_VERSION` değerini artırın; yedek dosyaları bu değeri taşır.
 */
export const CURRENT_SCHEMA_VERSION = 8

export function createDb(name: string): AtlasDb {
  const db = new Dexie(name) as AtlasDb

  db.version(1).stores({
    transactions: 'id, date, type, categoryId, source, importId, amountKurus',
    categories: 'id, order',
    rules: 'id, categoryId, priority',
    imports: 'id, fileHash, importedAt, status',
    settings: 'id',
    meta: 'key',
  })

  // v2: tekrar kontrolü için normalize açıklama indeksi ve kart/hesap adı indeksi.
  db.version(2)
    .stores({
      transactions: 'id, date, type, categoryId, source, importId, amountKurus, normalizedDescription, accountAlias, [date+amountKurus]',
    })
    .upgrade(async (tx) => {
      await tx
        .table('transactions')
        .toCollection()
        .modify((t: Transaction) => {
          if (!t.normalizedDescription) t.normalizedDescription = normalizeText(t.description ?? '')
        })
    })

  // v3: yeni varsayılan kurallar (mevcut kullanıcılara da eklenir; silinmiş eski kurallar geri gelmez).
  db.version(3).upgrade(async (tx) => {
    const now = new Date().toISOString()
    const catIds = new Set((await tx.table('categories').toArray()).map((c: Category) => c.id))
    const fresh = buildDefaultRules(now)
      .slice(RULES_BEFORE_V3)
      .filter((r) => catIds.has(r.categoryId))
    for (const r of fresh) if (!(await tx.table('rules').get(r.id))) await tx.table('rules').add(r)
  })

  // v4: harcama grupları (Bireysel, Ortak…) ve işlemlerde grup alanı.
  db.version(4)
    .stores({
      transactions: 'id, date, type, categoryId, groupId, source, importId, amountKurus, normalizedDescription, accountAlias, [date+amountKurus]',
      groups: 'id, order',
    })
    .upgrade(async (tx) => {
      await tx.table('groups').bulkAdd(buildDefaultGroups(new Date().toISOString()))
    })

  // v5: üyeler ve "kim harcadı". Cihaz sahibi için "Ben" üyesi oluşturulur.
  db.version(5)
    .stores({
      transactions: 'id, date, type, categoryId, groupId, memberId, source, importId, amountKurus, normalizedDescription, accountAlias, [date+amountKurus]',
      members: 'id',
    })
    .upgrade(async (tx) => {
      const now = new Date().toISOString()
      const self = buildSelfMember(now)
      await tx.table('members').add(self)
      const s = (await tx.table('settings').get('settings')) as Settings | undefined
      await tx.table('settings').put({ ...(s ?? { id: 'settings', monthlyBudgetKurus: null }), selfMemberId: self.id, updatedAt: now })
    })

  // v6: Plus düzenli ödemeler (abonelik, fatura, elle eklenen taksit).
  db.version(6).stores({ recurring: 'id, kind, active' })
  db.version(7).stores({ goals: 'id, archived' })
  db.version(8).stores({ assets: 'id, kind, archived' })

  db.on('populate', async (tx) => {
    const now = new Date().toISOString()
    const self = buildSelfMember(now)
    await tx.table('categories').bulkAdd(buildDefaultCategories(now))
    await tx.table('groups').bulkAdd(buildDefaultGroups(now))
    await tx.table('members').add(self)
    await tx.table('rules').bulkAdd(buildDefaultRules(now))
    await tx.table('settings').add({ id: 'settings', monthlyBudgetKurus: null, selfMemberId: self.id, updatedAt: now } satisfies Settings)
  })

  return db
}
