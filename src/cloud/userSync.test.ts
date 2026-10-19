import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDb, type AtlasDb } from '../data/db'
import { AtlasRepository } from '../data/repository'
import { MemoryCloud } from './memoryBackend'
import { adoptCloudIdentity, shareGroup, syncAll } from './sync'
import { clearMyCloudRecords, recordHash, resolveConflict } from './userSync'

const OSMAN = '11111111-1111-1111-1111-111111111111'
const AYSE = '22222222-2222-2222-2222-222222222222'

let dbs: AtlasDb[] = []
async function device(user: string, name = 'Ben') {
  const db = createDb(`usync-${Math.random()}`)
  await db.open()
  dbs.push(db)
  const repo = new AtlasRepository(db)
  await adoptCloudIdentity(repo, user)
  if (name !== 'Ben') await db.members.update(user, { name })
  return repo
}
const tick = () => new Promise((r) => setTimeout(r, 5))
const descs = async (repo: AtlasRepository) => (await repo.db.transactions.toArray()).map((t) => t.description).sort()

let cloud: MemoryCloud
beforeEach(() => {
  cloud = new MemoryCloud()
})
afterEach(async () => {
  for (const db of dbs) {
    db.close()
    await Dexie.delete(db.name)
  }
  dbs = []
})

describe('hesapla eşitleme', () => {
  it('yeni cihaz aynı hesapla girince eski cihazdaki bütün kayıtlar gelir; varsayılanlar düzenlenmişin üstüne yazmaz', async () => {
    const web = await device(OSMAN, 'Osman')
    await tick()
    await web.addTransaction({ date: '2026-10-01', amountKurus: 25000, type: 'expense', description: 'Migros', categoryId: 'cat-market' })
    await web.addTransaction({ date: '2026-10-02', amountKurus: 900000, type: 'income', description: 'Maaş', categoryId: null })
    const evcil = await web.addCategory({ name: 'Evcil', icon: 'paw-print', color: '#a16207' })
    await web.updateCategory('cat-market', { name: 'Market alışverişi' })
    await web.saveSettings({ monthlyBudgetKurus: 3_000_000, cycleStartDay: 15 })
    await syncAll(web, cloud.as(OSMAN))

    const phone = await device(OSMAN)
    await tick()
    await phone.addTransaction({ date: '2026-10-05', amountKurus: 4000, type: 'expense', description: 'Kahve', categoryId: 'cat-restoran' })
    await syncAll(phone, cloud.as(OSMAN))

    expect(await descs(phone)).toEqual(['Kahve', 'Maaş', 'Migros'])
    expect((await phone.db.categories.get('cat-market'))?.name).toBe('Market alışverişi')
    expect(await phone.db.categories.get(evcil.id)).toBeTruthy()
    const s = await phone.getSettings()
    expect(s.monthlyBudgetKurus).toBe(3_000_000)
    expect(s.cycleStartDay).toBe(15)
    expect((await phone.db.members.get(OSMAN))?.name).toBe('Osman')

    // Telefonda eklenen kayıt eski cihaza da gider
    await syncAll(web, cloud.as(OSMAN))
    expect(await descs(web)).toEqual(['Kahve', 'Maaş', 'Migros'])
  })

  it('düzenleme ve silme diğer cihaza geçer; değişmeyen kayıt yeniden gönderilmez', async () => {
    const a = await device(OSMAN, 'Osman')
    const tx = await a.addTransaction({ date: '2026-10-01', amountKurus: 25000, type: 'expense', description: 'Migros', categoryId: 'cat-market' })
    const gone = await a.addTransaction({ date: '2026-10-02', amountKurus: 1000, type: 'expense', description: 'Simit', categoryId: 'cat-market' })
    await syncAll(a, cloud.as(OSMAN))
    const b = await device(OSMAN)
    await syncAll(b, cloud.as(OSMAN))

    await tick()
    await b.updateTransaction(tx.id, { date: '2026-10-01', amountKurus: 27500, type: 'expense', description: 'Migros', categoryId: 'cat-market' })
    await b.deleteTransactions([gone.id])
    await syncAll(b, cloud.as(OSMAN))
    await syncAll(a, cloud.as(OSMAN))
    expect((await a.db.transactions.get(tx.id))?.amountKurus).toBe(27500)
    expect(await a.db.transactions.get(gone.id)).toBeUndefined()

    const again = await syncAll(a, cloud.as(OSMAN))
    expect(again.records).toEqual({ received: 0, sent: 0 })
  })

  it('iki cihazda aynı kayıt değişirse son düzenlenen kazanır; ayarlar alan alan birleşir', async () => {
    const a = await device(OSMAN, 'Osman')
    const tx = await a.addTransaction({ date: '2026-10-01', amountKurus: 100, type: 'expense', description: 'Pazar', categoryId: 'cat-market' })
    await syncAll(a, cloud.as(OSMAN))
    const b = await device(OSMAN)
    await syncAll(b, cloud.as(OSMAN))

    await tick()
    await a.updateTransaction(tx.id, { date: '2026-10-01', amountKurus: 200, type: 'expense', description: 'Pazar', categoryId: 'cat-market' })
    await a.saveSettings({ monthlyBudgetKurus: 500_000 })
    await tick()
    await b.updateTransaction(tx.id, { date: '2026-10-01', amountKurus: 300, type: 'expense', description: 'Pazar', categoryId: 'cat-market' })
    await b.saveSettings({ cycleStartDay: 10 })
    await syncAll(a, cloud.as(OSMAN))
    await syncAll(b, cloud.as(OSMAN))
    await syncAll(a, cloud.as(OSMAN))
    for (const r of [a, b]) {
      expect((await r.db.transactions.get(tx.id))?.amountKurus).toBe(300)
      const s = await r.getSettings()
      expect([s.monthlyBudgetKurus, s.cycleStartDay]).toEqual([500_000, 10])
    }
  })

  it('verilerimi sıfırla diğer cihazdan da siler, ayarlar kalır', async () => {
    const a = await device(OSMAN, 'Osman')
    await a.addTransaction({ date: '2026-10-01', amountKurus: 100, type: 'expense', description: 'Pazar', categoryId: 'cat-market' })
    await syncAll(a, cloud.as(OSMAN))
    const b = await device(OSMAN)
    await syncAll(b, cloud.as(OSMAN))
    expect(await descs(b)).toEqual(['Pazar'])

    await clearMyCloudRecords(cloud.as(OSMAN))
    await a.clearAll()
    await syncAll(a, cloud.as(OSMAN))
    await syncAll(b, cloud.as(OSMAN))
    expect(await descs(a)).toEqual([])
    expect(await descs(b)).toEqual([])
    expect(await b.db.settings.get('settings')).toBeTruthy()
    expect(await b.db.categories.count()).toBeGreaterThan(0)
  })

  it('üyelerden gelen ortak harcamalar kişisel kayıtlara girmez; ortak grup yeni cihaza aynı kimlikle gelir', async () => {
    const o = await device(OSMAN, 'Osman')
    const ay = await device(AYSE, 'Ayşe')
    await o.updateGroup('grp-ortak', { name: 'Ev' })
    const shared = await shareGroup(o, cloud.as(OSMAN), 'grp-ortak')
    const { joinWithInvite } = await import('./sync')
    await joinWithInvite(ay, cloud.as(AYSE), await cloud.as(OSMAN).createInvite(shared.cloudId!))
    await ay.addTransaction({ date: '2026-10-03', amountKurus: 5000, type: 'expense', description: 'Fatura', categoryId: 'cat-market', groupId: (await ay.db.groups.filter((g) => g.cloudId === shared.cloudId).first())!.id })
    await syncAll(ay, cloud.as(AYSE))
    await syncAll(o, cloud.as(OSMAN))
    expect(await descs(o)).toEqual(['Fatura'])
    expect([...cloud.records.values()].some((r) => r.user_id === OSMAN && r.tbl === 'transactions')).toBe(false)

    const phone = await device(OSMAN)
    await syncAll(phone, cloud.as(OSMAN))
    const groups = (await phone.db.groups.toArray()).filter((g) => g.cloudId === shared.cloudId)
    expect(groups.map((g) => [g.id, g.name])).toEqual([['grp-ortak', 'Ev']])
    expect(await descs(phone)).toEqual(['Fatura'])
  })

  it('aynı ortak grup bir cihazda iki kez bağlıysa tek gruba iner, harcamalar taşınır', async () => {
    const o = await device(OSMAN, 'Osman')
    await o.updateGroup('grp-ortak', { name: 'Ev' })
    const shared = await shareGroup(o, cloud.as(OSMAN), 'grp-ortak')
    await syncAll(o, cloud.as(OSMAN))
    const phone = await device(OSMAN)
    const now = new Date().toISOString()
    await phone.db.groups.put({ id: 'grp-eski', name: 'Ev', color: '#000', cloudId: shared.cloudId, archived: false, order: 9, createdAt: now, updatedAt: now })
    const tx = await phone.addTransaction({ date: '2026-10-04', amountKurus: 700, type: 'expense', description: 'Su', categoryId: 'cat-market', groupId: 'grp-eski' })
    await syncAll(phone, cloud.as(OSMAN))
    expect((await phone.db.groups.toArray()).filter((g) => g.cloudId === shared.cloudId).map((g) => g.id)).toEqual(['grp-ortak'])
    expect((await phone.db.transactions.get(tx.id))?.groupId).toBe('grp-ortak')
    await syncAll(o, cloud.as(OSMAN))
    expect((await o.db.transactions.get(tx.id))?.groupId).toBe('grp-ortak')
    expect(await o.db.groups.get('grp-eski')).toBeUndefined()
  })

  it('özet anahtar sırasından ve updatedAt alanından etkilenmez', () => {
    expect(recordHash({ a: 1, b: { c: 2, d: 3 }, updatedAt: 'x' })).toBe(recordHash({ b: { d: 3, c: 2 }, a: 1, updatedAt: 'y' }))
    expect(recordHash({ a: 1 })).not.toBe(recordHash({ a: 2 }))
    expect(resolveConflict('members', { id: 'u', name: 'Ben', groupIds: ['x'], updatedAt: '2' }, { id: 'u', name: 'Osman', groupIds: ['y'], updatedAt: '1' })).toMatchObject({
      name: 'Osman',
      groupIds: ['x', 'y'],
    })
  })
})
