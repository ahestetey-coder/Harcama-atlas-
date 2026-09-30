import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Dexie from 'dexie'
import { parseBackup } from './backup'
import { createDb, type AtlasDb } from './db'
import { AtlasRepository, UserFacingError } from './repository'
import { buildCommit } from '../import/enrich'
import type { DraftRow } from '../import/types'

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
    expect(db.verno).toBe(2)
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

describe('yedekleme / geri yükleme', () => {
  it('tam yedek alır, doğrular ve değiştirerek geri yükler', async () => {
    await repo.addTransaction({ date: '2026-09-01', amountKurus: 12345, type: 'expense', description: 'A', categoryId: 'cat-market', note: 'not' })
    await repo.saveSettings({ monthlyBudgetKurus: 5000000 })
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
