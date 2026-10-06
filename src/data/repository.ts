import Dexie from 'dexie'
import { APP_CONFIG } from '../config/app'
import { merchantKey, normalizeText, cleanDescription } from '../domain/normalize'
import { PRIORITY, validateRulePattern } from '../domain/rules'
import type { GoalContribution, SavingsGoal } from '../domain/goals'
import type { Category, ImportRecord, Member, RecurringPayment, Rule, Settings, SpendGroup, Transaction, TxSource } from '../domain/types'
import { BACKUP_FORMAT, BACKUP_VERSION, type Backup } from './backup'
import { CURRENT_SCHEMA_VERSION, type AtlasDb } from './db'
import { buildDefaultCategories, buildDefaultGroups, buildDefaultRules, buildSelfMember, OTHER_CATEGORY_ID } from './seed'
import { hasErrors, validateTransaction } from './validation'

export function newId(): string {
  return crypto.randomUUID()
}

const nowIso = () => new Date().toISOString()

export const SHARED_READONLY = 'Bu harcamayı grup üyesi ekledi; yalnızca o değiştirebilir veya silebilir.'
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UserFacingError'
  }
}

/** Tarayıcı/IndexedDB hatalarını kullanıcıya anlaşılır mesaja çevirir. */
export function toUserMessage(e: unknown): string {
  if (e instanceof UserFacingError) return e.message
  const name = (e as { name?: string })?.name ?? ''
  const inner = (e as { inner?: { name?: string } })?.inner?.name ?? ''
  if (name === 'QuotaExceededError' || inner === 'QuotaExceededError')
    return 'Tarayıcı depolama alanı dolu. Eski aktarımları geri alın veya yedek alıp gereksiz verileri silin.'
  if (name === 'DatabaseClosedError' || name === 'InvalidStateError')
    return 'Veritabanı açılamadı. Tarayıcı gizli modda olabilir veya depolamaya izin verilmiyor olabilir.'
  if (name === 'ConstraintError' || inner === 'ConstraintError') return 'Bu kayıt zaten mevcut.'
  if (name === 'VersionError') return 'Veritabanı daha yeni bir uygulama sürümüyle oluşturulmuş. Sayfayı yenileyin.'
  return 'Beklenmeyen bir hata oluştu. İşlem kaydedilmedi.'
}

export interface TransactionInput {
  date: string
  amountKurus: number
  type: Transaction['type']
  description: string
  categoryId: string | null
  groupId?: string | null
  memberId?: string | null
  note?: string
  paymentMethod?: Transaction['paymentMethod']
  accountAlias?: string
  categorySource?: Transaction['categorySource']
  installment?: Transaction['installment']
  foreign?: Transaction['foreign']
}

export interface LearnRuleRequest {
  pattern: string
  categoryId: string
}

export interface ImportCommit {
  record: ImportRecord
  transactions: Transaction[]
  learnedRules: LearnRuleRequest[]
}

export type RestoreMode = 'replace' | 'merge'

export interface RestoreReport {
  mode: RestoreMode
  added: { transactions: number; categories: number; groups: number; rules: number; imports: number }
  skipped: { transactions: number; categories: number; groups: number; rules: number; imports: number }
}

/**
 * Veri erişim katmanı. Arayüz yalnızca bu sınıf üzerinden yazar; ileride bulut
 * senkronizasyonu eklemek için bu sınıfın bir eşleniği yazılabilir.
 */
export class AtlasRepository {
  readonly db: AtlasDb
  readonly isDemo: boolean

  constructor(db: AtlasDb, isDemo = false) {
    this.db = db
    this.isDemo = isDemo
  }

  // ---------- İşlemler ----------

  async allTransactions(): Promise<Transaction[]> {
    return this.db.transactions.orderBy('date').reverse().toArray()
  }

  async transactionsBetween(start: string, end: string): Promise<Transaction[]> {
    return this.db.transactions.where('date').between(start, end, true, true).toArray()
  }

  private async categoryIdSet(): Promise<Set<string>> {
    return new Set((await this.db.categories.toArray()).map((c) => c.id))
  }

  buildTransaction(input: TransactionInput, source: TxSource, importId?: string, id = newId()): Transaction {
    const now = nowIso()
    const description = cleanDescription(input.description)
    return {
      id,
      date: input.date,
      amountKurus: input.amountKurus,
      type: input.type,
      description,
      normalizedDescription: normalizeText(description),
      categoryId: input.type === 'transfer' ? (input.categoryId ?? null) : input.categoryId,
      categorySource: input.categorySource ?? 'manual',
      groupId: input.groupId || null,
      memberId: input.memberId,
      note: input.note?.trim() || undefined,
      paymentMethod: input.paymentMethod,
      accountAlias: input.accountAlias?.trim() || undefined,
      source,
      importId,
      installment: input.installment,
      foreign: input.foreign,
      createdAt: now,
      updatedAt: now,
    }
  }

  async addTransaction(input: TransactionInput, learn?: LearnRuleRequest): Promise<Transaction> {
    const tx = this.buildTransaction(input, this.isDemo ? 'demo' : 'manual')
    // "Kim harcadı" belirtilmezse cihazın sahibi
    if (tx.memberId === undefined) tx.memberId = (await this.getSettings()).selfMemberId ?? null
    const errors = validateTransaction(tx, await this.categoryIdSet())
    if (hasErrors(errors)) throw new UserFacingError(Object.values(errors)[0]!)
    await this.assertGroup(tx.groupId)
    await this.db.transaction('rw', this.db.transactions, this.db.rules, async () => {
      await this.db.transactions.add(tx)
      if (learn) await this.learnRule(learn)
    })
    return tx
  }

  async updateTransaction(id: string, input: TransactionInput, learn?: LearnRuleRequest): Promise<void> {
    const existing = await this.db.transactions.get(id)
    if (!existing) throw new UserFacingError('İşlem bulunamadı; silinmiş olabilir.')
    if (existing.source === 'shared') throw new UserFacingError(SHARED_READONLY)
    const description = cleanDescription(input.description)
    const updated: Transaction = {
      ...existing,
      date: input.date,
      amountKurus: input.amountKurus,
      type: input.type,
      description,
      normalizedDescription: normalizeText(description),
      categoryId: input.categoryId,
      categorySource: existing.categoryId !== input.categoryId ? 'manual' : existing.categorySource,
      groupId: input.groupId === undefined ? (existing.groupId ?? null) : input.groupId || null,
      note: input.note?.trim() || undefined,
      paymentMethod: input.paymentMethod,
      accountAlias: input.accountAlias?.trim() || undefined,
      installment: input.installment ?? existing.installment,
      updatedAt: nowIso(),
    }
    const errors = validateTransaction(updated, await this.categoryIdSet())
    if (hasErrors(errors)) throw new UserFacingError(Object.values(errors)[0]!)
    await this.assertGroup(updated.groupId)
    await this.db.transaction('rw', this.db.transactions, this.db.rules, async () => {
      await this.db.transactions.put(updated)
      if (learn) await this.learnRule(learn)
    })
  }

  /** Siler ve geri alma için silinen kayıtları döndürür. Üyelerden gelen kayıtlar silinmez. */
  async deleteTransactions(ids: string[]): Promise<Transaction[]> {
    return this.db.transaction('rw', this.db.transactions, async () => {
      const found = (await this.db.transactions.bulkGet(ids)).filter((t): t is Transaction => !!t && t.source !== 'shared')
      await this.db.transactions.bulkDelete(found.map((t) => t.id))
      return found
    })
  }

  async restoreTransactions(txs: Transaction[]): Promise<void> {
    await this.db.transactions.bulkPut(txs)
  }

  async bulkSetCategory(ids: string[], categoryId: string): Promise<number> {
    if (!(await this.db.categories.get(categoryId))) throw new UserFacingError('Kategori bulunamadı.')
    const now = nowIso()
    return this.db.transactions
      .where('id')
      .anyOf(ids)
      .filter((t) => t.source !== 'shared')
      .modify((t) => {
        t.categoryId = categoryId
        t.categorySource = 'manual'
        t.updatedAt = now
      })
  }

  /** Seçili işlemlerin grubunu değiştirir; null grubu kaldırır. */
  async bulkSetGroup(ids: string[], groupId: string | null): Promise<number> {
    await this.assertGroup(groupId)
    const now = nowIso()
    return this.db.transactions
      .where('id')
      .anyOf(ids)
      .filter((t) => t.source !== 'shared')
      .modify((t) => {
        t.groupId = groupId
        t.updatedAt = now
      })
  }

  // ---------- Harcama grupları ----------

  private async assertGroup(groupId: string | null | undefined): Promise<void> {
    if (groupId && !(await this.db.groups.get(groupId))) throw new UserFacingError('Seçilen grup bulunamadı.')
  }

  async addGroup(input: Pick<SpendGroup, 'name' | 'color'>): Promise<SpendGroup> {
    const name = input.name.trim()
    if (!name) throw new UserFacingError('Grup adı boş olamaz.')
    const all = await this.db.groups.toArray()
    if (all.some((g) => normalizeText(g.name) === normalizeText(name))) throw new UserFacingError('Bu adla bir grup zaten var.')
    const now = nowIso()
    const group: SpendGroup = {
      id: newId(),
      name,
      color: input.color,
      archived: false,
      order: Math.max(-1, ...all.map((g) => g.order)) + 1,
      createdAt: now,
      updatedAt: now,
    }
    await this.db.groups.add(group)
    return group
  }

  async updateGroup(id: string, patch: Partial<Pick<SpendGroup, 'name' | 'color' | 'archived' | 'cycleStartDay'>>): Promise<void> {
    if (!(await this.db.groups.get(id))) throw new UserFacingError('Grup bulunamadı.')
    if (patch.name !== undefined) {
      const name = patch.name.trim()
      if (!name) throw new UserFacingError('Grup adı boş olamaz.')
      const all = await this.db.groups.toArray()
      if (all.some((g) => g.id !== id && normalizeText(g.name) === normalizeText(name))) throw new UserFacingError('Bu adla bir grup zaten var.')
      patch.name = name
    }
    await this.db.groups.update(id, { ...patch, updatedAt: nowIso() })
  }

  async groupUsage(id: string): Promise<number> {
    return this.db.transactions.where('groupId').equals(id).count()
  }

  /** Grubu siler; o gruptaki işlemler silinmez, grupsuz kalır. */
  async deleteGroup(id: string): Promise<number> {
    if ((await this.db.groups.get(id))?.cloudId) throw new UserFacingError('Bu grup üyelerle paylaşılıyor. Silmeden önce Üyeler sayfasından paylaşımdan ayrılın.')
    return this.db.transaction('rw', this.db.groups, this.db.transactions, async () => {
      const now = nowIso()
      const n = await this.db.transactions
        .where('groupId')
        .equals(id)
        .modify((t) => {
          t.groupId = null
          t.updatedAt = now
        })
      await this.db.groups.delete(id)
      return n
    })
  }

  // ---------- Kategoriler ----------

  async addCategory(input: Pick<Category, 'name' | 'icon' | 'color'>): Promise<Category> {
    const name = input.name.trim()
    if (!name) throw new UserFacingError('Kategori adı boş olamaz.')
    const all = await this.db.categories.toArray()
    if (all.some((c) => normalizeText(c.name) === normalizeText(name))) throw new UserFacingError('Bu adla bir kategori zaten var.')
    const now = nowIso()
    const cat: Category = {
      id: newId(),
      name,
      icon: input.icon,
      color: input.color,
      archived: false,
      order: Math.max(0, ...all.map((c) => c.order)) + 1,
      createdAt: now,
      updatedAt: now,
    }
    await this.db.categories.add(cat)
    return cat
  }

  async updateCategory(id: string, patch: Partial<Pick<Category, 'name' | 'icon' | 'color' | 'archived'>>): Promise<void> {
    const cat = await this.db.categories.get(id)
    if (!cat) throw new UserFacingError('Kategori bulunamadı.')
    if (patch.name !== undefined) {
      const name = patch.name.trim()
      if (!name) throw new UserFacingError('Kategori adı boş olamaz.')
      const all = await this.db.categories.toArray()
      if (all.some((c) => c.id !== id && normalizeText(c.name) === normalizeText(name))) throw new UserFacingError('Bu adla bir kategori zaten var.')
      patch.name = name
    }
    if (patch.archived && cat.system) throw new UserFacingError('"Diğer" kategorisi arşivlenemez.')
    await this.db.categories.update(id, { ...patch, updatedAt: nowIso() })
  }

  async categoryUsage(id: string): Promise<{ transactions: number; rules: number }> {
    const [transactions, rules] = await Promise.all([
      this.db.transactions.where('categoryId').equals(id).count(),
      this.db.rules.where('categoryId').equals(id).count(),
    ])
    return { transactions, rules }
  }

  /**
   * Kategoriyi siler. Kullanılan kategoride işlemler ve kurallar önce `reassignTo` kategorisine
   * taşınır; böylece kayıtlar sahipsiz kalmaz.
   */
  async deleteCategory(id: string, reassignTo?: string): Promise<void> {
    await this.db.transaction('rw', this.db.categories, this.db.transactions, this.db.rules, async () => {
      const cat = await this.db.categories.get(id)
      if (!cat) throw new UserFacingError('Kategori bulunamadı.')
      if (cat.system) throw new UserFacingError('"Diğer" kategorisi silinemez.')
      const usage = await this.categoryUsage(id)
      if (usage.transactions + usage.rules > 0) {
        if (!reassignTo || reassignTo === id) throw new UserFacingError('Kullanılan kategori silinmeden önce kayıtların taşınacağı kategoriyi seçin.')
        if (!(await this.db.categories.get(reassignTo))) throw new UserFacingError('Hedef kategori bulunamadı.')
        const now = nowIso()
        await this.db.transactions
          .where('categoryId')
          .equals(id)
          .modify((t) => {
            t.categoryId = reassignTo
            t.updatedAt = now
          })
        await this.db.rules
          .where('categoryId')
          .equals(id)
          .modify((r) => {
            r.categoryId = reassignTo
            r.updatedAt = now
          })
      }
      await this.db.categories.delete(id)
    })
  }

  async reorderCategories(ids: string[]): Promise<void> {
    await this.db.transaction('rw', this.db.categories, async () => {
      for (let i = 0; i < ids.length; i++) await this.db.categories.update(ids[i], { order: i })
    })
  }

  // ---------- Kurallar ----------

  async saveRule(input: Omit<Rule, 'id' | 'createdAt' | 'updatedAt' | 'origin'> & { id?: string; origin?: Rule['origin'] }): Promise<Rule> {
    const err = validateRulePattern(input.pattern, input.matchMode)
    if (err) throw new UserFacingError(err)
    if (!(await this.db.categories.get(input.categoryId))) throw new UserFacingError('Kategori bulunamadı.')
    const now = nowIso()
    const existing = input.id ? await this.db.rules.get(input.id) : undefined
    const rule: Rule = {
      id: existing?.id ?? newId(),
      pattern: input.pattern.trim(),
      matchMode: input.matchMode,
      categoryId: input.categoryId,
      priority: Math.round(input.priority),
      enabled: input.enabled,
      origin: existing?.origin ?? input.origin ?? 'user',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    await this.db.rules.put(rule)
    return rule
  }

  async deleteRule(id: string): Promise<void> {
    await this.db.rules.delete(id)
  }

  /**
   * "Bu iş yeri için sonraki işlemlerde de kullan": iş yeri anahtarına yüksek öncelikli
   * öğrenilmiş kural ekler veya mevcut öğrenilmiş kuralı günceller.
   */
  async learnRule(req: LearnRuleRequest): Promise<Rule | null> {
    const pattern = req.pattern.trim()
    if (!pattern || validateRulePattern(pattern, 'word')) return null
    const n = normalizeText(pattern)
    const all = await this.db.rules.toArray()
    const existing = all.find((r) => r.origin === 'learned' && normalizeText(r.pattern) === n)
    const now = nowIso()
    const rule: Rule = existing
      ? { ...existing, categoryId: req.categoryId, enabled: true, updatedAt: now }
      : {
          id: newId(),
          pattern,
          matchMode: 'word',
          categoryId: req.categoryId,
          priority: PRIORITY.learned,
          enabled: true,
          origin: 'learned',
          createdAt: now,
          updatedAt: now,
        }
    await this.db.rules.put(rule)
    return rule
  }

  // ---------- İçe aktarma ----------

  async findImportByHash(hash: string): Promise<ImportRecord | undefined> {
    const list = await this.db.imports.where('fileHash').equals(hash).toArray()
    return list.find((r) => r.status === 'active')
  }

  /**
   * Onaylanan aktarımı tek veritabanı işlemiyle kaydeder. Aynı aktarım kimliğiyle ikinci çağrı
   * (çift tıklama/yeniden deneme) hiçbir şey yazmaz.
   */
  async commitImport(commit: ImportCommit): Promise<{ saved: boolean; count: number }> {
    const catIds = await this.categoryIdSet()
    const groupIds = new Set((await this.db.groups.toArray()).map((g) => g.id))
    for (const t of commit.transactions) {
      if (t.groupId && !groupIds.has(t.groupId)) throw new UserFacingError('Seçilen grup bulunamadı.')
      const errors = validateTransaction(t, catIds)
      if (hasErrors(errors)) throw new UserFacingError(`Eksik veya hatalı satır kaydedilemez: ${t.description || '(açıklamasız)'} — ${Object.values(errors)[0]}`)
      if (t.importId !== commit.record.id) throw new UserFacingError('Aktarım kimliği tutarsız.')
    }
    return this.db.transaction('rw', this.db.imports, this.db.transactions, this.db.rules, async () => {
      if (await this.db.imports.get(commit.record.id)) return { saved: false, count: 0 }
      await this.db.imports.add(commit.record)
      await this.db.transactions.bulkAdd(commit.transactions)
      for (const l of commit.learnedRules) await this.learnRule(l)
      return { saved: true, count: commit.transactions.length }
    })
  }

  async importImpact(importId: string): Promise<{ count: number; edited: number }> {
    const rec = await this.db.imports.get(importId)
    const txs = await this.db.transactions.where('importId').equals(importId).toArray()
    const edited = rec ? txs.filter((t) => t.updatedAt > t.createdAt).length : 0
    return { count: txs.length, edited }
  }

  /** Aktarımı geri alır: o aktarımla gelen bütün işlemleri tek işlemde siler. */
  async undoImport(importId: string): Promise<number> {
    return this.db.transaction('rw', this.db.imports, this.db.transactions, async () => {
      const rec = await this.db.imports.get(importId)
      if (!rec) throw new UserFacingError('Aktarım kaydı bulunamadı.')
      if (rec.status === 'undone') return 0
      const n = await this.db.transactions.where('importId').equals(importId).delete()
      await this.db.imports.update(importId, { status: 'undone', undoneAt: nowIso() })
      return n
    })
  }

  // ---------- Ayarlar ----------

  async getSettings(): Promise<Settings> {
    return (await this.db.settings.get('settings')) ?? { id: 'settings', monthlyBudgetKurus: null, updatedAt: nowIso() }
  }

  async saveSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<void> {
    const cur = await this.getSettings()
    await this.db.settings.put({ ...cur, ...patch, id: 'settings', updatedAt: nowIso() })
  }

  // ---------- Düzenli ödemeler (Plus) ----------

  async saveRecurring(input: Omit<RecurringPayment, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<RecurringPayment> {
    const name = cleanDescription(input.name).slice(0, 80)
    if (!name) throw new UserFacingError('Bir ad girin.')
    if (!Number.isInteger(input.amountKurus) || input.amountKurus <= 0) throw new UserFacingError('Geçerli bir tutar girin.')
    if (input.occurrences != null && (!Number.isInteger(input.occurrences) || input.occurrences < 1 || input.occurrences > 120))
      throw new UserFacingError('Taksit sayısı 1 ile 120 arasında olmalı.')
    const now = nowIso()
    const prev = input.id ? await this.db.recurring.get(input.id) : undefined
    const row: RecurringPayment = {
      ...input,
      name,
      id: prev?.id ?? newId(),
      reminderDays: Math.max(0, Math.min(14, Math.round(input.reminderDays))),
      matchKey: input.matchKey || merchantKey(name) || undefined,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    }
    await this.db.recurring.put(row)
    return row
  }

  async deleteRecurring(id: string): Promise<void> {
    await this.db.recurring.delete(id)
  }

  /** Kullanıcının "önerme" dediği düzenli ödeme önerileri (iş yeri anahtarları). */
  async dismissedRecurring(): Promise<string[]> {
    return ((await this.db.meta.get('recurring-dismissed'))?.value as string[] | undefined) ?? []
  }

  async dismissRecurring(key: string): Promise<void> {
    const cur = await this.dismissedRecurring()
    if (!cur.includes(key)) await this.db.meta.put({ key: 'recurring-dismissed', value: [...cur, key] })
  }

  // ---------- Birikim hedefleri (Plus) ----------

  async saveGoal(input: Pick<SavingsGoal, 'name' | 'icon' | 'color' | 'targetKurus' | 'targetDate'> & { id?: string; archived?: boolean }): Promise<SavingsGoal> {
    const name = input.name.trim().slice(0, 60)
    if (!name) throw new UserFacingError('Hedefe bir ad verin.')
    if (!Number.isInteger(input.targetKurus) || input.targetKurus <= 0) throw new UserFacingError('Geçerli bir hedef tutarı girin.')
    if (input.targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.targetDate)) throw new UserFacingError('Geçerli bir tarih seçin.')
    const now = nowIso()
    const prev = input.id ? await this.db.goals.get(input.id) : undefined
    const row: SavingsGoal = {
      id: prev?.id ?? newId(),
      name,
      icon: input.icon,
      color: input.color,
      targetKurus: input.targetKurus,
      targetDate: input.targetDate || null,
      contributions: prev?.contributions ?? [],
      archived: input.archived ?? prev?.archived ?? false,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    }
    await this.db.goals.put(row)
    return row
  }

  async deleteGoal(id: string): Promise<void> {
    await this.db.goals.delete(id)
  }

  /** Hedefe para ekler (pozitif) veya hedeften çeker (negatif). Birikim eksiye düşemez. */
  async addGoalContribution(goalId: string, c: Omit<GoalContribution, 'id'>): Promise<void> {
    if (!Number.isInteger(c.amountKurus) || c.amountKurus === 0) throw new UserFacingError('Geçerli bir tutar girin.')
    await this.db.transaction('rw', this.db.goals, async () => {
      const g = await this.db.goals.get(goalId)
      if (!g) throw new UserFacingError('Hedef bulunamadı.')
      const saved = g.contributions.reduce((s, x) => s + x.amountKurus, 0)
      if (saved + c.amountKurus < 0) throw new UserFacingError('Biriktirdiğinizden fazlasını çekemezsiniz.')
      await this.db.goals.put({ ...g, contributions: [...g.contributions, { ...c, id: newId() }], updatedAt: nowIso() })
    })
  }

  async removeGoalContribution(goalId: string, contributionId: string): Promise<void> {
    await this.db.transaction('rw', this.db.goals, async () => {
      const g = await this.db.goals.get(goalId)
      if (!g) return
      await this.db.goals.put({ ...g, contributions: g.contributions.filter((x) => x.id !== contributionId), updatedAt: nowIso() })
    })
  }

  // ---------- Yedekleme ----------

  async exportBackup(): Promise<Backup> {
    return this.db.transaction('r', [this.db.transactions, this.db.categories, this.db.groups, this.db.members, this.db.rules, this.db.imports, this.db.settings, this.db.recurring, this.db.goals], async () => ({
      format: BACKUP_FORMAT,
      backupVersion: BACKUP_VERSION,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      app: APP_CONFIG.name,
      exportedAt: nowIso(),
      data: {
        transactions: await this.db.transactions.toArray(),
        categories: await this.db.categories.toArray(),
        groups: await this.db.groups.toArray(),
        members: await this.db.members.toArray(),
        rules: await this.db.rules.toArray(),
        imports: await this.db.imports.toArray(),
        recurring: await this.db.recurring.toArray(),
        goals: await this.db.goals.toArray(),
        settings: (await this.db.settings.get('settings')) ?? null,
      },
    }))
  }

  async counts(): Promise<{ transactions: number; categories: number; rules: number; imports: number }> {
    const [transactions, categories, rules, imports] = await Promise.all([
      this.db.transactions.count(),
      this.db.categories.count(),
      this.db.rules.count(),
      this.db.imports.count(),
    ])
    return { transactions, categories, rules, imports }
  }

  /**
   * Yedeği geri yükler.
   * - replace: mevcut tüm veriler silinir, yedek yüklenir (tek işlemde).
   * - merge: aynı kimlikli kayıtlar korunur (yedektekiler atlanır), yeniler eklenir.
   */
  async restoreBackup(backup: Backup, mode: RestoreMode): Promise<RestoreReport> {
    const d = backup.data
    const tables = [this.db.transactions, this.db.categories, this.db.groups, this.db.members, this.db.rules, this.db.imports, this.db.settings, this.db.recurring, this.db.goals]
    return this.db.transaction('rw', tables, async () => {
      // Cihazın kendi üye kimliği korunur (bulut hesabı bu cihaza bağlıdır)
      const cur = await this.getSettings()
      const selfBefore = cur.selfMemberId ? await this.db.members.get(cur.selfMemberId) : undefined
      const report: RestoreReport = {
        mode,
        added: { transactions: 0, categories: 0, groups: 0, rules: 0, imports: 0 },
        skipped: { transactions: 0, categories: 0, groups: 0, rules: 0, imports: 0 },
      }
      // Grupları olmayan (eski) yedekte varsayılan gruplar kullanılır.
      const groups = d.groups ?? buildDefaultGroups(nowIso())
      if (mode === 'replace') {
        await Promise.all(tables.map((t) => t.clear()))
        await this.db.categories.bulkAdd(d.categories)
        if (!d.categories.some((c) => c.id === OTHER_CATEGORY_ID)) {
          const other = buildDefaultCategories(nowIso()).find((c) => c.id === OTHER_CATEGORY_ID)!
          await this.db.categories.add({ ...other, order: d.categories.length })
        }
        await this.db.groups.bulkAdd(groups)
        await this.db.rules.bulkAdd(d.rules)
        await this.db.imports.bulkAdd(d.imports)
        await this.db.transactions.bulkAdd(d.transactions)
        if (d.recurring?.length) await this.db.recurring.bulkAdd(d.recurring)
        if (d.goals?.length) await this.db.goals.bulkAdd(d.goals)
        const members: Member[] = d.members ?? []
        if (members.length) await this.db.members.bulkPut(members)
        if (selfBefore) await this.db.members.put(selfBefore)
        await this.db.settings.put({ ...(d.settings ?? { id: 'settings', monthlyBudgetKurus: null }), selfMemberId: cur.selfMemberId, updatedAt: nowIso() })
        report.added = { transactions: d.transactions.length, categories: d.categories.length, groups: groups.length, rules: d.rules.length, imports: d.imports.length }
        return report
      }
      const mergeTable = async <T extends { id: string }>(table: Dexie.Table<T, string>, rows: T[], key: keyof RestoreReport['added']) => {
        const existing = new Set((await table.bulkGet(rows.map((r) => r.id))).filter(Boolean).map((r) => (r as T).id))
        const toAdd = rows.filter((r) => !existing.has(r.id))
        if (toAdd.length) await table.bulkAdd(toAdd)
        report.added[key] = toAdd.length
        report.skipped[key] = rows.length - toAdd.length
      }
      await mergeTable(this.db.categories as unknown as Dexie.Table<Category, string>, d.categories, 'categories')
      if (d.groups) await mergeTable(this.db.groups as unknown as Dexie.Table<SpendGroup, string>, d.groups, 'groups')
      if (d.members) {
        const existing = new Set((await this.db.members.bulkGet(d.members.map((m) => m.id))).filter(Boolean).map((m) => m!.id))
        await this.db.members.bulkAdd(d.members.filter((m) => !existing.has(m.id)))
      }
      await mergeTable(this.db.rules as unknown as Dexie.Table<Rule, string>, d.rules, 'rules')
      await mergeTable(this.db.imports as unknown as Dexie.Table<ImportRecord, string>, d.imports, 'imports')
      await mergeTable(this.db.transactions as unknown as Dexie.Table<Transaction, string>, d.transactions, 'transactions')
      if (d.recurring?.length) {
        const existing = new Set((await this.db.recurring.bulkGet(d.recurring.map((r) => r.id))).filter(Boolean).map((r) => r!.id))
        await this.db.recurring.bulkAdd(d.recurring.filter((r) => !existing.has(r.id)))
      }
      if (d.goals?.length) {
        const existing = new Set((await this.db.goals.bulkGet(d.goals.map((g) => g.id))).filter(Boolean).map((g) => g!.id))
        await this.db.goals.bulkAdd(d.goals.filter((g) => !existing.has(g.id)))
      }
      return report
    })
  }

  /** Bütün verileri siler ve başlangıç kategorileri/kurallarıyla yeniden başlatır. */
  async clearAll(): Promise<void> {
    const tables = [this.db.transactions, this.db.categories, this.db.groups, this.db.members, this.db.rules, this.db.imports, this.db.settings, this.db.meta, this.db.recurring, this.db.goals]
    await this.db.transaction('rw', tables, async () => {
      const cur = await this.getSettings()
      const selfBefore = cur.selfMemberId ? await this.db.members.get(cur.selfMemberId) : undefined
      const cloudConfig = await this.db.meta.get('cloud-config')
      await Promise.all(tables.map((t) => t.clear()))
      const now = nowIso()
      // Cihaz sahibi ve bulut bağlantı ayarı korunur; paylaşılan grup bağlantıları silinir.
      const self = selfBefore ? { ...selfBefore, groupIds: buildDefaultGroups(now).map((g) => g.id), updatedAt: now } : buildSelfMember(now)
      await this.db.members.put(self)
      if (cloudConfig) await this.db.meta.put(cloudConfig)
      await this.db.categories.bulkAdd(buildDefaultCategories(now))
      await this.db.groups.bulkAdd(buildDefaultGroups(now))
      await this.db.rules.bulkAdd(buildDefaultRules(now))
      await this.db.settings.put({ id: 'settings', monthlyBudgetKurus: null, selfMemberId: self.id, updatedAt: now })
    })
  }
}

export { merchantKey }
