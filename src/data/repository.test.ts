import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Dexie from 'dexie'
import { parseBackup } from './backup'
import { createDb, type AtlasDb } from './db'
import { AtlasRepository, UserFacingError } from './repository'
import { buildDefaultCategories, buildDefaultRules, RULES_BEFORE_V3 } from './seed'
import { buildCommit } from '../import/enrich'
import type { DraftRow } from '../import/types'
import { personalCycleDay } from '../domain/income'
import { applyPlannedGroups, type RecurringIncome } from '../domain/types'

let db: AtlasDb
let repo: AtlasRepository
let n = 0

beforeEach(async () => {
  db = createDb(`test-${++n}-${Math.random()}`)
  await db.open()
  repo = new AtlasRepository(db)
})
afterEach(async () => {
  db.close()
  await Dexie.delete(db.name)
})

const draft = (over: Partial<DraftRow>): DraftRow => ({
  id: crypto.randomUUID(),
  include: true,
  date: '2026-09-10',
  dateRaw: '10.09.2026',
  description: 'MIGROS KADIKOY',
  amountKurus: 12550,
  amountRaw: '125,50',
  type: 'expense',
  categoryId: 'cat-market',
  categorySource: 'rule',
  currency: 'TRY',
  source: { kind: 'sheet-row', line: 2, text: '' },
  notes: [],
  ...over,
})

const active = () => db.categories.toArray().then((cs) => new Set(cs.filter((c) => !c.archived).map((c) => c.id)))
const file = { name: 'a.csv', kind: 'csv' as const, size: 10, hash: 'h1' }

describe('ilk kurulum ve göç', () => {
  it('başlangıç kategorilerini ve kurallarını ekler', async () => {
    const cats = await db.categories.toArray()
    expect(cats.map((c) => c.name)).toEqual(expect.arrayContaining(['Market', 'Akaryakıt', 'Restoran/Kafe', 'Ulaşım', 'Faturalar', 'Kira/Ev', 'Sağlık', 'Eğitim', 'Giyim', 'Bebek/Çocuk', 'Eğlence', 'Abonelikler', 'Diğer']))
    expect(await db.rules.count()).toBeGreaterThan(20)
    expect(db.verno).toBe(9)
    const selfId = (await repo.getSettings()).selfMemberId
    expect(selfId).toBeTruthy()
    expect((await db.members.get(selfId!))?.name).toBe('Ben')
    expect((await db.groups.orderBy('order').toArray()).map((g) => g.name)).toEqual(['Bireysel', 'Ortak'])
  })
  it('v1 veritabanını v2ye taşır ve normalize açıklamayı doldurur', async () => {
    const name = `mig-${Math.random()}`
    const v1 = new Dexie(name)
    v1.version(1).stores({ transactions: 'id, date, type, categoryId, source, importId, amountKurus', categories: 'id, order', rules: 'id, categoryId, priority', imports: 'id, fileHash, importedAt, status', settings: 'id', meta: 'key' })
    await v1.open()
    await v1.table('transactions').add({ id: 'x', date: '2026-01-01', amountKurus: 100, type: 'expense', description: 'Şok Market', categoryId: null, source: 'manual' })
    v1.close()
    const v2 = createDb(name)
    await v2.open()
    const t = await v2.transactions.get('x')
    expect(t?.normalizedDescription).toBe('SOK MARKET')
    v2.close()
    await Dexie.delete(name)
  })
  it('v2 veritabanına yeni varsayılan kuralları ekler, silinmiş eski kuralı geri getirmez', async () => {
    const name = `mig3-${Math.random()}`
    const v2 = new Dexie(name)
    v2.version(1).stores({ transactions: 'id, date, type, categoryId, source, importId, amountKurus', categories: 'id, order', rules: 'id, categoryId, priority', imports: 'id, fileHash, importedAt, status', settings: 'id', meta: 'key' })
    v2.version(2).stores({ transactions: 'id, date, type, categoryId, source, importId, amountKurus, normalizedDescription, accountAlias, [date+amountKurus]' })
    await v2.open()
    const now = '2026-01-01T00:00:00.000Z'
    await v2.table('categories').bulkAdd(buildDefaultCategories(now))
    const oldRules = buildDefaultRules(now).slice(0, RULES_BEFORE_V3)
    await v2.table('rules').bulkAdd(oldRules.slice(1)) // kullanıcı ilk kuralı silmiş
    v2.close()
    const v3 = createDb(name)
    await v3.open()
    const ids = new Set((await v3.rules.toArray()).map((r) => r.id))
    expect(ids.has(oldRules[0].id)).toBe(false)
    expect([...ids].some((id) => (buildDefaultRules(now).find((r) => r.pattern === 'LOKANTA')?.id ?? '') === id)).toBe(true)
    v3.close()
    await Dexie.delete(name)
  })
})

describe('manuel işlemler', () => {
  it('kategorisiz gideri reddeder', async () => {
    await expect(repo.addTransaction({ date: '2026-09-01', amountKurus: 100, type: 'expense', description: 'X', categoryId: null })).rejects.toBeInstanceOf(UserFacingError)
    expect(await db.transactions.count()).toBe(0)
  })
  it('ekler, düzenler, siler ve geri alır', async () => {
    const t = await repo.addTransaction({ date: '2026-09-01', amountKurus: 100, type: 'expense', description: 'Kahve', categoryId: 'cat-restoran' })
    await repo.updateTransaction(t.id, { date: '2026-09-02', amountKurus: 250, type: 'expense', description: 'Kahve', categoryId: 'cat-restoran' })
    expect((await db.transactions.get(t.id))?.amountKurus).toBe(250)
    const deleted = await repo.deleteTransactions([t.id])
    expect(await db.transactions.count()).toBe(0)
    await repo.restoreTransactions(deleted)
    expect((await db.transactions.get(t.id))?.date).toBe('2026-09-02')
  })
  it('"bu iş yeri için kullan" öğrenilmiş kural ekler', async () => {
    await repo.addTransaction({ date: '2026-09-01', amountKurus: 100, type: 'expense', description: 'Nazo Fırın', categoryId: 'cat-market' }, { pattern: 'NAZO FIRIN', categoryId: 'cat-market' })
    const rules = await db.rules.where('categoryId').equals('cat-market').toArray()
    expect(rules.find((r) => r.origin === 'learned')?.priority).toBe(90)
  })
})

describe('içe aktarma', () => {
  it('yalnızca geçerli satırları tek işlemde kaydeder; sorunlu satırlar girmez', async () => {
    const rows = [draft({}), draft({ categoryId: null, categorySource: undefined }), draft({ date: null }), draft({ include: false }), draft({ duplicateOf: ['z'], duplicateDecision: null })]
    const commit = buildCommit({ importId: 'imp1', rows, activeCategoryIds: await active(), file, isDemo: false })
    expect(commit.transactions.length).toBe(1)
    const r = await repo.commitImport(commit)
    expect(r).toEqual({ saved: true, count: 1 })
    expect(await db.transactions.count()).toBe(1)
  })
  it('çift tıklama/yeniden deneme mükerrer kayıt üretmez', async () => {
    const commit = buildCommit({ importId: 'imp2', rows: [draft({}), draft({})], activeCategoryIds: await active(), file, isDemo: false })
    const [a, b] = await Promise.all([repo.commitImport(commit), repo.commitImport(commit)])
    expect([a.saved, b.saved].filter(Boolean).length).toBe(1)
    expect(await repo.commitImport(commit)).toEqual({ saved: false, count: 0 })
    expect(await db.transactions.count()).toBe(2)
    expect(await db.imports.count()).toBe(1)
  })
  it('hata olursa yarım kayıt bırakmaz (atomik)', async () => {
    const good = draft({})
    const commit = buildCommit({ importId: 'imp3', rows: [good, draft({})], activeCategoryIds: await active(), file, isDemo: false })
    await db.transactions.add({ ...commit.transactions[1] }) // ikinci satırın kimliği zaten var → bulkAdd hata verir
    await expect(repo.commitImport(commit)).rejects.toBeTruthy()
    expect(await db.transactions.get(good.id)).toBeUndefined()
    expect(await db.imports.get('imp3')).toBeUndefined()
  })
  it('doğrulanmamış satırı depo katmanında da reddeder', async () => {
    const commit = buildCommit({ importId: 'imp4', rows: [draft({})], activeCategoryIds: await active(), file, isDemo: false })
    commit.transactions[0].categoryId = null
    await expect(repo.commitImport(commit)).rejects.toBeInstanceOf(UserFacingError)
    expect(await db.transactions.count()).toBe(0)
  })
  it('aktarımı güvenle geri alır, diğer kayıtlara dokunmaz', async () => {
    const manual = await repo.addTransaction({ date: '2026-09-01', amountKurus: 100, type: 'expense', description: 'Elden', categoryId: 'cat-diger' })
    const commit = buildCommit({ importId: 'imp5', rows: [draft({}), draft({ type: 'refund', amountKurus: 500 })], activeCategoryIds: await active(), file, isDemo: false })
    await repo.commitImport(commit)
    expect(await repo.findImportByHash('h1')).toBeTruthy()
    expect(await repo.undoImport('imp5')).toBe(2)
    expect(await db.transactions.count()).toBe(1)
    expect(await db.transactions.get(manual.id)).toBeTruthy()
    expect((await db.imports.get('imp5'))?.status).toBe('undone')
    expect(await repo.findImportByHash('h1')).toBeUndefined()
  })
})

describe('kategoriler', () => {
  it('kullanılan kategori silinince kayıtları seçilen kategoriye taşır', async () => {
    const c = await repo.addCategory({ name: 'Evcil Hayvan', icon: 'paw-print', color: '#000' })
    const t = await repo.addTransaction({ date: '2026-09-01', amountKurus: 100, type: 'expense', description: 'Mama', categoryId: c.id })
    await expect(repo.deleteCategory(c.id)).rejects.toBeInstanceOf(UserFacingError)
    await repo.deleteCategory(c.id, 'cat-diger')
    expect((await db.transactions.get(t.id))?.categoryId).toBe('cat-diger')
    expect(await db.categories.get(c.id)).toBeUndefined()
  })
  it('Diğer kategorisi silinemez, aynı ad iki kez eklenemez', async () => {
    await expect(repo.deleteCategory('cat-diger', 'cat-market')).rejects.toBeInstanceOf(UserFacingError)
    await expect(repo.addCategory({ name: 'market', icon: 'x', color: '#000' })).rejects.toBeInstanceOf(UserFacingError)
  })
})

describe('grubun düzenli gideri', () => {
  it('gider olarak eklenir ve aynı ödeme ikinci kez eklenmez', async () => {
    const r = await repo.saveRecurring({ name: 'Kira', kind: 'bill', amountKurus: 1500000, categoryId: null, cadence: 'monthly', startDate: '2026-09-05', reminderDays: 3, active: true, groupId: 'grp-ortak' })
    const t = await repo.recordRecurring(r.id, '2026-09-05')
    expect(t).toMatchObject({ amountKurus: 1500000, groupId: 'grp-ortak', description: 'Kira', type: 'expense' })
    expect((await db.recurring.get(r.id))?.recordedThrough).toBe('2026-09-05')
    await expect(repo.recordRecurring(r.id, '2026-09-05')).rejects.toBeInstanceOf(UserFacingError)
  })
})

describe('birikim hedefleri', () => {
  it('para ekler, çeker ve eksiye düşürmez', async () => {
    const g = await repo.saveGoal({ name: ' Araç ', icon: 'Car', color: '#000', targetKurus: 100000, targetDate: null })
    expect(g.name).toBe('Araç')
    await repo.addGoalContribution(g.id, { date: '2026-09-01', amountKurus: 40000 })
    await repo.addGoalContribution(g.id, { date: '2026-09-02', amountKurus: -10000 })
    await expect(repo.addGoalContribution(g.id, { date: '2026-09-03', amountKurus: -40000 })).rejects.toBeInstanceOf(UserFacingError)
    const saved = (await db.goals.get(g.id))!
    expect(saved.contributions.reduce((s, c) => s + c.amountKurus, 0)).toBe(30000)
    await repo.removeGoalContribution(g.id, saved.contributions[0].id)
    expect((await db.goals.get(g.id))!.contributions).toHaveLength(1)
    await expect(repo.saveGoal({ name: '', icon: 'x', color: '#000', targetKurus: 1, targetDate: null })).rejects.toBeInstanceOf(UserFacingError)
    await repo.deleteGoal(g.id)
    expect(await db.goals.count()).toBe(0)
  })
})

describe('varlıklar', () => {
  it('alış/satış ekler, fazla satışı ve sonraki satışı bozan silmeyi engeller, fiyatı günceller', async () => {
    const a = await repo.saveAsset({ kind: 'fx', name: 'Dolar', unit: 'USD' }, { date: '2026-09-01', quantity: 100, unitPriceKurus: 4100 })
    await repo.addAssetTrade(a.id, { date: '2026-09-20', side: 'sell', quantity: 40, unitPriceKurus: 4150 })
    await expect(repo.addAssetTrade(a.id, { date: '2026-09-25', side: 'sell', quantity: 61, unitPriceKurus: 4150 })).rejects.toBeInstanceOf(UserFacingError)
    await expect(repo.addAssetTrade(a.id, { date: '2026-08-01', side: 'sell', quantity: 1, unitPriceKurus: 4150 })).rejects.toBeInstanceOf(UserFacingError)
    const buyId = (await db.assets.get(a.id))!.trades[0].id
    await expect(repo.removeAssetTrade(a.id, buyId)).rejects.toBeInstanceOf(UserFacingError)
    await repo.setAssetValuation(a.id, { date: '2026-10-01', unitPriceKurus: 4200 })
    await repo.setAssetValuation(a.id, { date: '2026-10-01', unitPriceKurus: 4210 })
    expect((await db.assets.get(a.id))!.valuations).toEqual([{ date: '2026-10-01', unitPriceKurus: 4210, source: 'manual' }])
    await repo.deleteAsset(a.id)
    expect(await db.assets.count()).toBe(0)
  })
})

describe('yedekleme / geri yükleme', () => {
  it('tam yedek alır, doğrular ve değiştirerek geri yükler', async () => {
    await repo.addTransaction({ date: '2026-09-01', amountKurus: 12345, type: 'expense', description: 'A', categoryId: 'cat-market', note: 'not' })
    await repo.saveSettings({ monthlyBudgetKurus: 5000000, budgetPlan: { categoryLimits: { 'cat-market': 100000 }, weeklyKurus: 50000, carryover: true, warnPct: 80 } })
    await repo.saveRecurring({ name: 'Netflix', kind: 'subscription', amountKurus: 22999, categoryId: null, cadence: 'monthly', startDate: '2026-09-15', reminderDays: 3, active: true })
    const goal = await repo.saveGoal({ name: 'Tatil', icon: 'Plane', color: '#0ea5e9', targetKurus: 3000000, targetDate: '2027-06-30' })
    await repo.addGoalContribution(goal.id, { date: '2026-09-10', amountKurus: 500000 })
    await repo.saveAsset({ kind: 'gold', name: 'Gram altın', unit: 'gram' }, { date: '2026-09-01', quantity: 2.5, unitPriceKurus: 450000 })
    const backup = await repo.exportBackup()
    const text = JSON.stringify(backup)
    const parsed = parseBackup(text)
    expect(parsed.ok).toBe(true)
    await repo.clearAll()
    expect(await db.transactions.count()).toBe(0)
    if (!parsed.ok) return
    const rep = await repo.restoreBackup(parsed.backup, 'replace')
    expect(rep.added.transactions).toBe(1)
    expect((await db.transactions.toArray())[0].amountKurus).toBe(12345)
    expect((await repo.getSettings()).monthlyBudgetKurus).toBe(5000000)
    expect((await repo.getSettings()).budgetPlan?.categoryLimits['cat-market']).toBe(100000)
    expect(await db.recurring.toArray()).toMatchObject([{ name: 'Netflix', matchKey: 'NETFLIX', amountKurus: 22999 }])
    expect(await db.goals.toArray()).toMatchObject([{ name: 'Tatil', contributions: [{ amountKurus: 500000 }] }])
    expect(await db.assets.toArray()).toMatchObject([{ name: 'Gram altın', trades: [{ quantity: 2.5, side: 'buy' }] }])
  })
  it('birleştirmede mevcut kayıtları ezmez', async () => {
    const t = await repo.addTransaction({ date: '2026-09-01', amountKurus: 100, type: 'expense', description: 'A', categoryId: 'cat-market' })
    const backup = await repo.exportBackup()
    await repo.updateTransaction(t.id, { date: '2026-09-01', amountKurus: 999, type: 'expense', description: 'A', categoryId: 'cat-market' })
    const rep = await repo.restoreBackup(backup, 'merge')
    expect(rep.skipped.transactions).toBe(1)
    expect((await db.transactions.get(t.id))?.amountKurus).toBe(999)
  })
  it('bozuk veya yabancı dosyaları reddeder', () => {
    expect(parseBackup('{').ok).toBe(false)
    expect(parseBackup('{"a":1}').ok).toBe(false)
    const bad = { format: 'harcama-atlasi-yedek', backupVersion: 1, schemaVersion: 2, app: 'x', exportedAt: '', data: { transactions: [{ id: 1 }], categories: [], rules: [], imports: [], settings: null } }
    const r = parseBackup(JSON.stringify(bad))
    expect(r.ok).toBe(false)
    const future = { ...bad, backupVersion: 99 }
    const r2 = parseBackup(JSON.stringify(future))
    expect(!r2.ok && r2.message).toMatch(/daha yeni/)
  })
})

describe('harcama grupları', () => {
  it('v3 veritabanına varsayılan grupları ekler; işlemler grupsuz kalır', async () => {
    const name = `mig4-${Math.random()}`
    const v3 = new Dexie(name)
    v3.version(3).stores({
      transactions: 'id, date, type, categoryId, source, importId, amountKurus, normalizedDescription, accountAlias, [date+amountKurus]',
      categories: 'id, order',
      rules: 'id, categoryId, priority',
      imports: 'id, fileHash, importedAt, status',
      settings: 'id',
      meta: 'key',
    })
    await v3.open()
    await v3.table('transactions').add({ id: 'x', date: '2026-01-01', amountKurus: 100, type: 'expense', description: 'A', normalizedDescription: 'A', categoryId: null, source: 'manual' })
    v3.close()
    const v4 = createDb(name)
    await v4.open()
    expect((await v4.groups.toArray()).map((g) => g.name).sort()).toEqual(['Bireysel', 'Ortak'])
    expect((await v4.transactions.get('x'))?.groupId ?? null).toBeNull()
    v4.close()
    await Dexie.delete(name)
  })
  it('işlemde grup saklanır, düzenlenir ve toplu atanır', async () => {
    const t = await repo.addTransaction({ date: '2026-09-01', amountKurus: 100, type: 'expense', description: 'A', categoryId: 'cat-market', groupId: 'grp-ortak' })
    expect((await db.transactions.get(t.id))?.groupId).toBe('grp-ortak')
    // Düzenlemede grup verilmezse korunur
    await repo.updateTransaction(t.id, { date: '2026-09-01', amountKurus: 200, type: 'expense', description: 'A', categoryId: 'cat-market' })
    expect((await db.transactions.get(t.id))?.groupId).toBe('grp-ortak')
    await repo.updateTransaction(t.id, { date: '2026-09-01', amountKurus: 200, type: 'expense', description: 'A', categoryId: 'cat-market', groupId: null })
    expect((await db.transactions.get(t.id))?.groupId).toBeNull()
    expect(await repo.bulkSetGroup([t.id], 'grp-bireysel')).toBe(1)
    expect((await db.transactions.get(t.id))?.groupId).toBe('grp-bireysel')
    await expect(repo.bulkSetGroup([t.id], 'yok')).rejects.toBeInstanceOf(UserFacingError)
  })
  it('planlı taksitin grubu ayarlarda saklanır ve yeniden üretilen satıra uygulanır', async () => {
    const id = 'plan:rec:debt:d1:2026-10-15'
    expect(await repo.bulkSetGroup([id], 'grp-ortak')).toBe(1)
    const s = await repo.getSettings()
    expect(s.plannedGroups).toEqual({ [id]: 'grp-ortak' })
    const row = { id, date: '2026-10-15', amountKurus: 100, type: 'expense', description: 'Kredi', normalizedDescription: 'kredi', categoryId: null, groupId: null, source: 'planned', createdAt: '', updatedAt: '' } as const
    expect(applyPlannedGroups([row], s.plannedGroups)[0].groupId).toBe('grp-ortak')
    await repo.bulkSetGroup([id], null)
    expect(applyPlannedGroups([{ ...row, groupId: 'x' }], (await repo.getSettings()).plannedGroups)[0].groupId).toBeNull()
  })
  it('grup ekler; aynı ad iki kez eklenemez; silinen grubun işlemleri silinmez, grupsuz kalır', async () => {
    const g = await repo.addGroup({ name: 'İş', color: '#000' })
    await expect(repo.addGroup({ name: ' iş ', color: '#000' })).rejects.toBeInstanceOf(UserFacingError)
    const t = await repo.addTransaction({ date: '2026-09-01', amountKurus: 100, type: 'expense', description: 'A', categoryId: 'cat-market', groupId: g.id })
    expect(await repo.deleteGroup(g.id)).toBe(1)
    expect((await db.transactions.get(t.id))?.groupId).toBeNull()
    expect(await db.groups.get(g.id)).toBeUndefined()
  })
  it('içe aktarmada satır grubu kaydedilir', async () => {
    const commit = buildCommit({ importId: 'impg', rows: [draft({ groupId: 'grp-ortak' }), draft({ amountKurus: 700 })], activeCategoryIds: await active(), file, isDemo: false })
    await repo.commitImport(commit)
    const saved = await db.transactions.where('importId').equals('impg').toArray()
    expect(saved.map((t) => t.groupId ?? null).sort()).toEqual(['grp-ortak', null])
  })
  it('yedek grupları taşır; grupsuz eski yedek varsayılan gruplarla yüklenir', async () => {
    const g = await repo.addGroup({ name: 'Tatil', color: '#111' })
    await repo.addTransaction({ date: '2026-09-01', amountKurus: 100, type: 'expense', description: 'A', categoryId: 'cat-market', groupId: g.id })
    const parsed = parseBackup(JSON.stringify(await repo.exportBackup()))
    if (!parsed.ok) throw new Error(parsed.message)
    await repo.clearAll()
    await repo.restoreBackup(parsed.backup, 'replace')
    expect((await db.transactions.toArray())[0].groupId).toBe(g.id)
    expect((await db.groups.toArray()).map((x) => x.name)).toContain('Tatil')

    const old = { ...parsed.backup, data: { ...parsed.backup.data, groups: undefined } }
    const reparsed = parseBackup(JSON.stringify(old))
    if (!reparsed.ok) throw new Error(reparsed.message)
    expect(reparsed.backup.data.transactions[0].groupId).toBeNull()
    await repo.restoreBackup(reparsed.backup, 'replace')
    expect((await db.groups.toArray()).map((x) => x.name).sort()).toEqual(['Bireysel', 'Ortak'])
  })
})

describe('düzenli gelir ve maaş', () => {
  const rent = { name: 'Kira geliri', kind: 'rent' as const, amountKurus: 1_000_000, cadence: 'monthly' as const, startDate: '2026-09-01', active: true }
  const incomes = async () => (await repo.getSettings()).recurringIncomes ?? []

  it('düzenli gelirde tarihi, sıklığı ve türü doğrular', async () => {
    await expect(repo.saveRecurringIncome({ ...rent, startDate: '2026-02-30' })).rejects.toThrow('Geçerli bir tarih seçin.')
    await expect(repo.saveRecurringIncome({ ...rent, startDate: '01.09.2026' })).rejects.toBeInstanceOf(UserFacingError)
    await expect(repo.saveRecurringIncome({ ...rent, cadence: 'daily' as never })).rejects.toThrow('Geçerli bir sıklık seçin.')
    await expect(repo.saveRecurringIncome({ ...rent, cadence: 'toString' as never })).rejects.toThrow('Geçerli bir sıklık seçin.')
    await expect(repo.saveRecurringIncome({ ...rent, kind: 'bonus' as never })).rejects.toThrow('Geçerli bir gelir türü seçin.')
    expect(await incomes()).toHaveLength(0)
    const once = await repo.saveRecurringIncome({ ...rent, name: 'Prim', kind: 'other', cadence: 'once', startDate: '2026-10-05' })
    expect(await incomes()).toEqual([once])
    expect(once).toMatchObject({ cadence: 'once', startDate: '2026-10-05' })
  })

  it('örnek hesap: 60.000 TL, ayın 15i, döngü maaşa bağlı (bugün 12 Ekim 2026)', async () => {
    const s = await repo.saveSalary({ amountKurus: 6_000_000, day: 15, followCycle: true }, '2026-10-12')
    expect(s).toMatchObject({ name: 'Maaş', kind: 'salary', cadence: 'monthly', amountKurus: 6_000_000, startDate: '2026-09-15', active: true })
    const st = await repo.getSettings()
    expect(st.cycleSource).toBe('salary')
    expect(st.recurringIncomes).toEqual([s])
    expect(personalCycleDay(st)).toBe(15)
  })

  it('başlangıç, bugün veya öncesindeki son maaş günüdür; ayda o gün yoksa o günün olduğu son ay', async () => {
    const start = async (day: number, today: string) => (await repo.saveSalary({ amountKurus: 100_000, day, followCycle: false }, today)).startDate
    expect(await start(12, '2026-10-12')).toBe('2026-10-12')
    expect(await start(5, '2026-10-12')).toBe('2026-10-05')
    expect(await start(31, '2026-10-12')).toBe('2026-08-31')
    expect(await start(30, '2026-03-10')).toBe('2026-01-30')
    expect(await start(31, '2026-01-10')).toBe('2025-12-31')
    expect(await start(29, '2028-03-01')).toBe('2028-02-29')
    expect(await incomes()).toHaveLength(1)
  })

  it('tek bir birincil maaşı günceller; adı, kimliği ve diğer gelirleri korur', async () => {
    const small = await repo.saveRecurringIncome({ ...rent, name: 'Ek iş', kind: 'salary', amountKurus: 500_000 })
    const big = await repo.saveRecurringIncome({ ...rent, name: 'Maaş (ABC A.Ş.)', kind: 'salary', amountKurus: 5_000_000, startDate: '2026-01-15' })
    const weekly = await repo.saveRecurringIncome({ ...rent, name: 'Haftalık', kind: 'salary', cadence: 'weekly', amountKurus: 9_000_000 })
    const kira = await repo.saveRecurringIncome(rent)
    const s = await repo.saveSalary({ amountKurus: 6_000_000, day: 15, followCycle: false }, '2026-10-12')
    expect(s).toMatchObject({ id: big.id, name: 'Maaş (ABC A.Ş.)', amountKurus: 6_000_000, createdAt: big.createdAt })
    // Maaş günü değişmediyse eski başlangıç korunur (geçmiş dönemlerin planlı maaşı silinmez)
    expect(s.startDate).toBe('2026-01-15')
    const list = await incomes()
    expect(list.map((i) => i.id)).toEqual([small.id, big.id, weekly.id, kira.id])
    expect(list.find((i) => i.id === small.id)).toEqual(small)
    expect(list.find((i) => i.id === kira.id)).toEqual(kira)
    // Gün değişince başlangıç yeni güne taşınır
    expect((await repo.saveSalary({ amountKurus: 6_000_000, day: 20, followCycle: false }, '2026-10-12')).startDate).toBe('2026-09-20')
    expect(await incomes()).toHaveLength(4)
  })

  it('pasif maaşı birincil saymaz; yeni maaş ekler', async () => {
    await repo.saveRecurringIncome({ ...rent, kind: 'salary', amountKurus: 9_000_000, active: false })
    const s = await repo.saveSalary({ amountKurus: 6_000_000, day: 1, followCycle: false }, '2026-10-12')
    expect(s.name).toBe('Maaş')
    expect(await incomes()).toHaveLength(2)
  })

  it('döngüyü yalnızca anahtar açıksa maaşa bağlar; kapatılınca elle döngüye döner', async () => {
    await repo.saveSettings({ cycleStartDay: 10 })
    await repo.saveSalary({ amountKurus: 6_000_000, day: 15, followCycle: false }, '2026-10-12')
    expect((await repo.getSettings()).cycleSource).toBeUndefined()
    await repo.saveSalary({ amountKurus: 6_000_000, day: 15, followCycle: true }, '2026-10-12')
    expect((await repo.getSettings()).cycleSource).toBe('salary')
    await repo.saveSalary({ amountKurus: 6_000_000, day: 15, followCycle: false }, '2026-10-12')
    let st = await repo.getSettings()
    expect(st.cycleSource).toBe('manual')
    expect(st.cycleStartDay).toBe(10)
    expect(personalCycleDay(st)).toBe(10)
    await repo.saveSalary({ amountKurus: 6_000_000, day: 15, followCycle: false }, '2026-10-12')
    st = await repo.getSettings()
    expect(st.cycleSource).toBe('manual')
  })

  it('geçersiz maaşı reddeder ve hiçbir şey yazmaz', async () => {
    for (const day of [0, 32, 15.5, NaN]) await expect(repo.saveSalary({ amountKurus: 6_000_000, day, followCycle: true }, '2026-10-12')).rejects.toThrow('Maaş gününü seçin.')
    await expect(repo.saveSalary({ amountKurus: 0, day: 15, followCycle: true }, '2026-10-12')).rejects.toThrow('Geçerli bir tutar girin.')
    await expect(repo.saveSalary({ amountKurus: 100.5, day: 15, followCycle: true }, '2026-10-12')).rejects.toBeInstanceOf(UserFacingError)
    const st = await repo.getSettings()
    expect(st.recurringIncomes ?? []).toHaveLength(0)
    expect(st.cycleSource).toBeUndefined()
  })
})

describe('bütçe beyanı', () => {
  it('örnek hesabın beyanını kaydeder, değişikliği birleştirir ve null ile boşaltır', async () => {
    const before = new Date().toISOString()
    const p = await repo.saveBudgetProfile({ housing: 'rent', housingKurus: 1_800_000, billsKurus: 300_000, cardPaymentKurus: 400_000, consumerDebtKurus: 2_000_000, emergencyFundKurus: 0 })
    expect(p.updatedAt >= before).toBe(true)
    expect((await repo.getSettings()).budgetProfile).toEqual(p)
    await repo.saveBudgetProfile({ earners: 1, dependents: 0, housingKurus: null })
    expect((await repo.getSettings()).budgetProfile).toMatchObject({ housing: 'rent', housingKurus: null, billsKurus: 300_000, cardPaymentKurus: 400_000, consumerDebtKurus: 2_000_000, emergencyFundKurus: 0, earners: 1, dependents: 0 })
  })

  it('geçersiz değerleri reddeder ve önceki beyanı korur', async () => {
    const p = await repo.saveBudgetProfile({ billsKurus: 300_000, earners: 2, dependents: 1 })
    const bad: Parameters<typeof repo.saveBudgetProfile>[0][] = [
      { billsKurus: -1 },
      { housingKurus: 100.5 },
      { cardPaymentKurus: NaN },
      { emergencyFundKurus: Infinity },
      { loanPaymentKurus: '100' as never },
      { consumerDebtKurus: Number.MAX_SAFE_INTEGER + 2 },
      { earners: 3 as never },
      { earners: 0 as never },
      { dependents: -1 },
      { dependents: 21 },
      { dependents: 1.5 },
      { housing: 'tent' as never },
    ]
    for (const patch of bad) await expect(repo.saveBudgetProfile(patch), JSON.stringify(patch)).rejects.toBeInstanceOf(UserFacingError)
    expect((await repo.getSettings()).budgetProfile).toEqual(p)
    // Sınırlar geçerlidir
    await repo.saveBudgetProfile({ dependents: 20, earners: null, billsKurus: 0 })
    expect((await repo.getSettings()).budgetProfile).toMatchObject({ dependents: 20, earners: null, billsKurus: 0 })
  })

  it('bilinmeyen alanları yazmaz', async () => {
    await repo.saveBudgetProfile({ billsKurus: 100, foo: 1 } as never)
    expect((await repo.getSettings()).budgetProfile).not.toHaveProperty('foo')
  })
})

describe('yedek: maaş, tek seferlik gelir ve bütçe beyanı', () => {
  const once = { name: 'Prim', kind: 'other' as const, amountKurus: 2_000_000, cadence: 'once' as const, startDate: '2026-10-05', active: true }
  const roundTrip = async () => {
    const backup = await repo.exportBackup()
    const parsed = parseBackup(JSON.stringify(backup))
    if (!parsed.ok) throw new Error(parsed.message)
    return { backup, parsed: parsed.backup }
  }

  it('tek seferlik gelir yoksa sürüm 1 yazar; eski (v1) yedek geri yüklenir', async () => {
    await repo.saveSalary({ amountKurus: 6_000_000, day: 15, followCycle: false }, '2026-10-12')
    const { backup, parsed } = await roundTrip()
    expect(backup.backupVersion).toBe(1)
    // Eski sürümün yedeği: yeni alanlar yok
    const old = JSON.parse(JSON.stringify(backup))
    delete old.data.settings.cycleSource
    delete old.data.settings.budgetProfile
    const r = parseBackup(JSON.stringify(old))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    await repo.clearAll()
    await repo.restoreBackup(r.backup, 'replace')
    expect((await repo.getSettings()).recurringIncomes).toEqual(parsed.data.settings!.recurringIncomes)
  })

  it('tek seferlik gelir sürüm 2 ile yazılır ve aynen geri gelir', async () => {
    const o = await repo.saveRecurringIncome(once)
    const { backup, parsed } = await roundTrip()
    expect(backup.backupVersion).toBe(2)
    expect(parsed.data.settings?.recurringIncomes).toEqual([o])
    await repo.clearAll()
    await repo.restoreBackup(parsed, 'replace')
    expect((await repo.getSettings()).recurringIncomes).toEqual([o])
  })

  it('döngü kaynağı ve bütçe beyanı yedekte atılmaz, geri yüklenir', async () => {
    await repo.saveSalary({ amountKurus: 6_000_000, day: 15, followCycle: true }, '2026-10-12')
    const profile = await repo.saveBudgetProfile({ housing: 'mortgage', housingKurus: 1_800_000, earners: 2, dependents: 3, emergencyFundKurus: null })
    const { parsed } = await roundTrip()
    expect(parsed.data.settings).toMatchObject({ cycleSource: 'salary', budgetProfile: profile })
    await repo.clearAll()
    expect((await repo.getSettings()).cycleSource).toBeUndefined()
    await repo.restoreBackup(parsed, 'replace')
    const st = await repo.getSettings()
    expect(st.cycleSource).toBe('salary')
    expect(st.budgetProfile).toEqual(profile)
    expect(personalCycleDay(st)).toBe(15)
  })

  it('daha yeni sürümün yedeğinde "güncelleyin" der; bozuk beyanı reddeder', async () => {
    const { backup } = await roundTrip()
    const r = parseBackup(JSON.stringify({ ...backup, backupVersion: 3 }))
    expect(!r.ok && r.message).toMatch(/güncelleyin/)
    const bad = { ...backup, data: { ...backup.data, settings: { ...backup.data.settings!, budgetProfile: { earners: 3, updatedAt: '' } } } }
    expect(parseBackup(JSON.stringify(bad)).ok).toBe(false)
    const badCycle = { ...backup, data: { ...backup.data, settings: { ...backup.data.settings!, cycleSource: 'payday' } } }
    expect(parseBackup(JSON.stringify(badCycle)).ok).toBe(false)
  })

  it('birleştirmede gelirleri kimliğe göre ekler, yereli korur; beyan ve döngü kaynağı yalnızca yerelde yoksa alınır', async () => {
    const salary = await repo.saveSalary({ amountKurus: 6_000_000, day: 15, followCycle: true }, '2026-10-12')
    const prim = await repo.saveRecurringIncome(once)
    const profile = await repo.saveBudgetProfile({ housing: 'rent', housingKurus: 1_800_000 })
    const { parsed } = await roundTrip()

    await repo.clearAll()
    const local: RecurringIncome = { ...salary, amountKurus: 6_500_000, updatedAt: new Date().toISOString() }
    await repo.saveSettings({ recurringIncomes: [local] })
    await repo.restoreBackup(parsed, 'merge')
    let st = await repo.getSettings()
    expect(st.recurringIncomes).toEqual([local, prim])
    expect(st.budgetProfile).toEqual(profile)
    expect(st.cycleSource).toBe('salary')

    // Yerelde beyan ve elle seçilmiş döngü günü varsa korunur
    await repo.clearAll()
    const mine = await repo.saveBudgetProfile({ billsKurus: 300_000 })
    await repo.saveSettings({ cycleStartDay: 10 })
    await repo.restoreBackup(parsed, 'merge')
    st = await repo.getSettings()
    expect(st.budgetProfile).toEqual(mine)
    expect(st.cycleSource).toBeUndefined()
    expect(st.cycleStartDay).toBe(10)
    expect(st.recurringIncomes).toEqual([salary, prim])

    // Yerelde döngü kaynağı varsa korunur; ikinci birleştirme gelirleri çoğaltmaz
    await repo.saveSettings({ cycleSource: 'manual' })
    await repo.restoreBackup(parsed, 'merge')
    st = await repo.getSettings()
    expect(st.cycleSource).toBe('manual')
    expect(st.recurringIncomes).toEqual([salary, prim])
  })
})
