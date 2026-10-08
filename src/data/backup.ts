import { migrateAssetKind } from '../domain/assets'
import { z } from 'zod'
import { APP_CONFIG } from '../config/app'
import { isIsoDate } from '../domain/dates'
import { CURRENT_SCHEMA_VERSION } from './db'

// Doğrulama hata mesajları Türkçe
z.config(z.locales.tr())

export const BACKUP_FORMAT = 'harcama-atlasi-yedek'
export const BACKUP_VERSION = 1

const isoDate = z.string().refine(isIsoDate, 'Geçersiz tarih')
const kurus = z.number().int().nonnegative()

const transactionSchema = z.object({
  id: z.string().min(1),
  date: isoDate,
  amountKurus: kurus.positive(),
  type: z.enum(['expense', 'refund', 'transfer', 'income']),
  description: z.string().min(1),
  normalizedDescription: z.string(),
  categoryId: z.string().nullable(),
  groupId: z.string().nullable().optional(),
  memberId: z.string().nullable().optional(),
  categorySource: z.enum(['manual', 'rule', 'file', 'confirmed-other']).optional(),
  note: z.string().optional(),
  paymentMethod: z.enum(['cash', 'debit', 'credit']).optional(),
  accountAlias: z.string().optional(),
  source: z.enum(['manual', 'pdf', 'csv', 'xlsx', 'image', 'demo', 'shared', 'settlement', 'planned']),
  importId: z.string().optional(),
  installment: z.object({ current: z.number().int(), total: z.number().int(), purchaseTotalKurus: kurus.optional() }).optional(),
  foreign: z.object({ currency: z.string(), amountMinor: z.number().int() }).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const categorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  icon: z.string(),
  color: z.string(),
  archived: z.boolean(),
  order: z.number(),
  system: z.boolean().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const groupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string(),
  cloudId: z.string().optional(),
  cloudOwnerId: z.string().optional(),
  cycleStartDay: z.number().int().min(1).max(28).nullable().optional(),
  budgetKurus: kurus.nullable().optional(),
  splitRule: z
    .object({
      method: z.enum(['equal', 'percent', 'weights', 'amounts']),
      participants: z.array(z.string()).nullable(),
      values: z.record(z.string(), z.number()),
    })
    .optional(),
  archived: z.boolean(),
  order: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const memberSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string(),
  groupIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const ruleSchema = z.object({
  id: z.string().min(1),
  pattern: z.string().min(1),
  matchMode: z.enum(['word', 'prefix', 'contains']),
  categoryId: z.string().min(1),
  priority: z.number(),
  enabled: z.boolean(),
  origin: z.enum(['default', 'user', 'learned']),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const importSchema = z.object({
  id: z.string().min(1),
  fileName: z.string(),
  fileKind: z.enum(['pdf', 'csv', 'xlsx', 'image']),
  fileSize: z.number(),
  fileHash: z.string(),
  importedAt: z.string(),
  transactionCount: z.number(),
  skippedCount: z.number(),
  totalExpenseKurus: z.number(),
  totalRefundKurus: z.number(),
  status: z.enum(['active', 'undone']),
  undoneAt: z.string().optional(),
  parserId: z.string().optional(),
  accountAlias: z.string().optional(),
})

const recurringSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  kind: z.enum(['subscription', 'bill', 'installment']),
  amountKurus: kurus,
  categoryId: z.string().nullable(),
  cadence: z.enum(['weekly', 'monthly', 'yearly']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  occurrences: z.number().int().min(1).max(120).nullable().optional(),
  reminderDays: z.number().int().min(0).max(14),
  matchKey: z.string().optional(),
  groupId: z.string().nullable().optional(),
  recordedThrough: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const goalSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  icon: z.string(),
  color: z.string(),
  targetKurus: kurus,
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  contributions: z.array(z.object({ id: z.string().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), amountKurus: z.number().int() })),
  archived: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const assetSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['deposit', 'fx', 'fund', 'gold', 'commodity', 'stock', 'foreign', 'cash', 'other', 'crypto', 'debt']),
  name: z.string(),
  unit: z.string(),
  trades: z.array(z.object({ id: z.string().min(1), date: isoDate, side: z.enum(['buy', 'sell']), quantity: z.number().positive(), unitPriceKurus: z.number().nonnegative() })),
  valuations: z.array(z.object({ date: isoDate, unitPriceKurus: z.number().nonnegative(), source: z.enum(['manual', 'tcmb', 'piyasa']) })),
  quote: z.object({ market: z.enum(['bist', 'us', 'tefas', 'crypto', 'gold', 'commodity']), symbol: z.string().min(1).max(15) }).optional(),
  interestRatePct: z.number().min(0).max(1000).optional(),
  note: z.string().optional(),
  debtTerms: z.object({ monthlyRatePct: z.number().min(0).max(100), minPaymentKurus: z.number().int().nonnegative().nullable() }).optional(),
  debtPlan: z.object({ mode: z.enum(['once', 'monthly']), dueDate: isoDate.optional(), installmentKurus: z.number().int().positive().optional(), installments: z.number().int().min(1).max(600).optional() }).optional(),
  debtType: z.enum(['card', 'loan', 'overdraft', 'mortgage', 'auto', 'personal', 'tax', 'other']).optional(),
  archived: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const settingsSchema = z.object({
  id: z.literal('settings'),
  monthlyBudgetKurus: kurus.nullable(),
  defaultPaymentMethod: z.enum(['cash', 'debit', 'credit']).optional(),
  selfMemberId: z.string().optional(),
  cycleStartDay: z.number().int().min(1).max(28).optional(),
  budgetPlan: z
    .object({
      categoryLimits: z.record(z.string(), kurus),
      weeklyKurus: kurus.nullable(),
      carryover: z.boolean(),
      warnPct: z.number().int().min(50).max(100),
    })
    .optional(),
  budgetMode: z.enum(['auto', 'manual']).optional(),
  journey: z
    .object({
      goal: z.enum(['independence', 'security', 'early-retire', 'custom']),
      goalName: z.string().optional(),
      horizonYears: z.number().min(1).max(60),
      targetMonthlyExpenseKurus: kurus,
      monthlyIncomeKurus: kurus,
      essentialMonthlyKurus: kurus,
      incomeStability: z.enum(['regular', 'variable', 'irregular']),
      priorities: z.array(z.string()),
      withdrawalRatePct: z.number().min(0.5).max(10),
      celebrated: z.array(z.string().max(30)).max(30),
      confirmedAt: z.string(),
      age: z.number().int().min(15).max(100).optional(),
      dependents: z.number().int().min(0).max(20).optional(),
      housing: z.enum(['rent', 'mortgage', 'owned', 'family']).optional(),
      passiveIncomeKurus: kurus.optional(),
      pension: z.enum(['sgk-bes', 'sgk', 'bes', 'none']).optional(),
      health: z.enum(['private', 'public', 'none']).optional(),
      risk: z.enum(['cautious', 'balanced', 'bold']).optional(),
      base: z.enum(['TRY', 'USD', 'XAU']).optional(),
      baseRateTl: z.number().positive().optional(),
      tests: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(60).optional(),
    })
    .optional(),
  coach: z
    .object({
      strategy: z.enum(['avalanche', 'snowball']),
      debtsInExpenses: z.boolean(),
      dismissed: z.array(z.string()),
      aiConsent: z.boolean(),
      share: z.object({ income: z.boolean(), expenses: z.boolean(), debts: z.boolean(), goals: z.boolean(), budget: z.boolean() }).optional(),
      memory: z
        .array(
          z.object({
            id: z.string(),
            kind: z.enum(['hedef', 'tercih', 'not', 'sohbet']),
            text: z.string().max(400),
            source: z.enum(['kullanici', 'sohbet']),
            createdAt: z.string(),
            updatedAt: z.string(),
          }),
        )
        .max(60)
        .optional(),
    })
    .optional(),
  updatedAt: z.string(),
})

export const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  backupVersion: z.number().int().min(1).max(BACKUP_VERSION),
  schemaVersion: z.number().int().min(1).max(CURRENT_SCHEMA_VERSION),
  app: z.string(),
  exportedAt: z.string(),
  data: z.object({
    transactions: z.array(transactionSchema),
    categories: z.array(categorySchema).min(1),
    /** v4 öncesi yedeklerde yoktur. */
    groups: z.array(groupSchema).optional(),
    /** v5 öncesi yedeklerde yoktur. */
    members: z.array(memberSchema).optional(),
    rules: z.array(ruleSchema),
    imports: z.array(importSchema),
    /** v6 öncesi yedeklerde yoktur. */
    recurring: z.array(recurringSchema).optional(),
    /** v7 öncesi yedeklerde yoktur. */
    goals: z.array(goalSchema).optional(),
    /** v8 öncesi yedeklerde yoktur. */
    assets: z.array(assetSchema.transform(migrateAssetKind)).optional(),
    settings: settingsSchema.nullable(),
  }),
})

export type Backup = z.infer<typeof backupSchema>

export type BackupParseResult = { ok: true; backup: Backup } | { ok: false; message: string; details?: string[] }

/** Yedek dosyasını ayrıştırır ve yapısını doğrular. */
export function parseBackup(text: string): BackupParseResult {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false, message: 'Dosya geçerli bir JSON değil.' }
  }
  if (!json || typeof json !== 'object' || (json as { format?: unknown }).format !== BACKUP_FORMAT) {
    return { ok: false, message: `Bu dosya bir ${APP_CONFIG.name} yedeği değil.` }
  }
  const v = (json as { backupVersion?: unknown }).backupVersion
  if (typeof v === 'number' && v > BACKUP_VERSION) {
    return { ok: false, message: 'Yedek, uygulamanın daha yeni bir sürümüyle alınmış. Önce uygulamayı güncelleyin.' }
  }
  const r = backupSchema.safeParse(json)
  if (!r.success) {
    const details = r.error.issues.slice(0, 8).map((i) => `${i.path.join('.')}: ${i.message}`)
    return { ok: false, message: 'Yedek dosyasının yapısı bozuk veya eksik.', details }
  }
  // Tutarlılık: işlemlerin kategorileri yedekte bulunmalı
  const catIds = new Set(r.data.data.categories.map((c) => c.id))
  const orphan = r.data.data.transactions.filter((t) => t.categoryId && !catIds.has(t.categoryId))
  if (orphan.length) {
    return { ok: false, message: `Yedekte kategorisi bulunmayan ${orphan.length} işlem var; dosya bozuk olabilir.` }
  }
  // Grubu yedekte bulunmayan işlemler grupsuz yüklenir (dosyayı reddetmeye değmez).
  const groupIds = new Set((r.data.data.groups ?? []).map((g) => g.id))
  for (const t of r.data.data.transactions) if (t.groupId && !groupIds.has(t.groupId)) t.groupId = null
  return { ok: true, backup: r.data }
}

export function backupFileName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${APP_CONFIG.slug}-yedek-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`
}
