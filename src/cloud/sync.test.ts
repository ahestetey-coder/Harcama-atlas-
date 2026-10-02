import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDb, type AtlasDb } from '../data/db'
import { AtlasRepository, UserFacingError } from '../data/repository'
import { buildInviteLink, parseInvite } from './config'
import { MemoryCloud } from './memoryBackend'
import { adoptCloudIdentity, joinWithInvite, leaveGroup, setGroupCycle, settleGroupPeriod, shareGroup, syncAll, unsettleGroupPeriod } from './sync'

const OSMAN = '11111111-1111-1111-1111-111111111111'
const AYSE = '22222222-2222-2222-2222-222222222222'

let dbs: AtlasDb[] = []
async function device(name: string) {
  const db = createDb(`cloud-${name}-${Math.random()}`)
  await db.open()
  dbs.push(db)
  const repo = new AtlasRepository(db)
  const selfId = (await repo.getSettings()).selfMemberId!
  await db.members.update(selfId, { name })
  return repo
}

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

async function setup() {
  const osman = await device('Osman')
  const ayse = await device('Ayşe')
  const oCloud = cloud.as(OSMAN)
  const aCloud = cloud.as(AYSE)
  await adoptCloudIdentity(osman, OSMAN)
  await adoptCloudIdentity(ayse, AYSE)
  const shared = await shareGroup(osman, oCloud, 'grp-ortak')
  const code = await oCloud.createInvite(shared.cloudId!)
  const joined = await joinWithInvite(ayse, aCloud, code)
  return { osman, ayse, oCloud, aCloud, shared, joined }
}

describe('bulut eşitleme', () => {
  it('ortak gruptaki harcamalar iki cihaz arasında eşitlenir; kişisel harcamalar buluta gitmez', async () => {
    const { osman, ayse, oCloud, aCloud, joined } = await setup()
    // Ayşe'nin kendi "Ortak" grubu paylaşılan gruba bağlandı
    expect(joined.id).toBe('grp-ortak')
    await osman.addTransaction({ date: '2026-09-10', amountKurus: 30000, type: 'expense', description: 'Migros', categoryId: 'cat-market', groupId: 'grp-ortak' })
    await osman.addTransaction({ date: '2026-09-11', amountKurus: 5000, type: 'expense', description: 'Kendi kahvem', categoryId: 'cat-restoran', groupId: 'grp-bireysel' })
    await osman.addTransaction({ date: '2026-09-12', amountKurus: 7000, type: 'expense', description: 'Grupsuz', categoryId: 'cat-ulasim' })
    await ayse.addTransaction({ date: '2026-09-13', amountKurus: 12000, type: 'expense', description: 'Fatura', categoryId: 'cat-faturalar', groupId: 'grp-ortak' })

    expect((await syncAll(osman, oCloud)).pushed).toBe(1)
    expect([...cloud.rows.values()].map((r) => r.description)).toEqual(['Migros'])
    const ar = await syncAll(ayse, aCloud)
    expect(ar).toMatchObject({ pushed: 1, received: 1 })
    await syncAll(osman, oCloud)

    const oShared = await osman.db.transactions.where('groupId').equals('grp-ortak').toArray()
    expect(oShared.map((t) => [t.description, t.memberId, t.source]).sort()).toEqual([
      ['Fatura', AYSE, 'shared'],
      ['Migros', OSMAN, 'manual'],
    ])
    expect(oShared.find((t) => t.description === 'Fatura')?.categoryId).toBe('cat-faturalar')
    // Üyeler iki tarafta da görünür
    expect((await osman.db.members.get(AYSE))?.name).toBe('Ayşe')
    expect((await ayse.db.members.get(OSMAN))?.name).toBe('Osman')
    // Ayşe Osman'ın kişisel harcamalarını görmez
    expect((await ayse.db.transactions.toArray()).map((t) => t.description).sort()).toEqual(['Fatura', 'Migros'])
  })

  it('düzenleme, silme ve gruptan çıkarma diğer cihaza yansır', async () => {
    const { osman, ayse, oCloud, aCloud } = await setup()
    const t = await osman.addTransaction({ date: '2026-09-10', amountKurus: 30000, type: 'expense', description: 'Migros', categoryId: 'cat-market', groupId: 'grp-ortak' })
    const u = await osman.addTransaction({ date: '2026-09-11', amountKurus: 1000, type: 'expense', description: 'Simit', categoryId: 'cat-restoran', groupId: 'grp-ortak' })
    await syncAll(osman, oCloud)
    await syncAll(ayse, aCloud)
    expect(await ayse.db.transactions.count()).toBe(2)

    await osman.updateTransaction(t.id, { date: '2026-09-10', amountKurus: 45000, type: 'expense', description: 'Migros', categoryId: 'cat-market' })
    await osman.deleteTransactions([u.id])
    await syncAll(osman, oCloud)
    const r = await syncAll(ayse, aCloud)
    expect(r.deletedLocal).toBe(1)
    expect((await ayse.db.transactions.get(t.id))?.amountKurus).toBe(45000)
    expect(await ayse.db.transactions.get(u.id)).toBeUndefined()

    // Kişisel gruba taşınan işlem ortaktan kalkar
    await osman.bulkSetGroup([t.id], 'grp-bireysel')
    await syncAll(osman, oCloud)
    await syncAll(ayse, aCloud)
    expect(await ayse.db.transactions.get(t.id)).toBeUndefined()
  })

  it('başkasının işlemi bulutta değiştirilemez; yerel kopya yeniden eşitlemede düzelir', async () => {
    const { osman, ayse, oCloud, aCloud } = await setup()
    const t = await osman.addTransaction({ date: '2026-09-10', amountKurus: 30000, type: 'expense', description: 'Migros', categoryId: 'cat-market', groupId: 'grp-ortak' })
    await syncAll(osman, oCloud)
    await syncAll(ayse, aCloud)
    await expect(aCloud.upsert([{ id: t.id, group_id: [...cloud.groups.keys()][0], date: '2026-09-10', amount_kurus: 1, type: 'expense', description: 'X', category_name: null, category_icon: null, category_color: null, note: null, installment: null }])).rejects.toThrow()
    // Ayşe'nin eşitlemesi Osman'ın işlemini kendi işlemi sanıp göndermez
    expect((await syncAll(ayse, aCloud)).pushed).toBe(0)
  })

  it('üye gruptan ayrılınca işlemleri diğer cihazdan kalkar', async () => {
    const { osman, ayse, oCloud, aCloud } = await setup()
    await ayse.addTransaction({ date: '2026-09-13', amountKurus: 12000, type: 'expense', description: 'Fatura', categoryId: 'cat-faturalar', groupId: 'grp-ortak' })
    await syncAll(ayse, aCloud)
    await syncAll(osman, oCloud)
    expect(await osman.db.transactions.count()).toBe(1)
    await leaveGroup(ayse, aCloud, 'grp-ortak')
    expect((await ayse.db.groups.get('grp-ortak'))?.cloudId).toBeUndefined()
    await syncAll(osman, oCloud)
    expect(await osman.db.transactions.count()).toBe(0)
    expect(await osman.db.members.get(AYSE)).toBeUndefined()
  })

  it('aynı hesap yeni bir cihazda (ör. ana ekrana eklenen uygulama) davetsiz eşitlenir', async () => {
    const { osman, oCloud, aCloud } = await setup()
    await osman.addTransaction({ date: '2026-09-10', amountKurus: 30000, type: 'expense', description: 'Migros', categoryId: 'cat-market', groupId: 'grp-ortak' })
    await syncAll(osman, oCloud)
    // Ayşe'nin ikinci cihazı: boş veritabanı, "Ortak" grubu bağlı değil
    const ayse2 = await device('Ayşe')
    await adoptCloudIdentity(ayse2, AYSE)
    await ayse2.addTransaction({ date: '2026-09-11', amountKurus: 5000, type: 'expense', description: 'Fırın', categoryId: 'cat-market', groupId: 'grp-ortak' })
    const r = await syncAll(ayse2, aCloud)
    expect(r).toMatchObject({ received: 1, pushed: 1 })
    const g = await ayse2.db.groups.get('grp-ortak')
    expect(g?.cloudId).toBeTruthy()
    expect((await ayse2.db.transactions.where('groupId').equals('grp-ortak').toArray()).map((t) => t.description).sort()).toEqual(['Fırın', 'Migros'])
    await syncAll(osman, oCloud)
    expect((await osman.db.transactions.where('groupId').equals('grp-ortak').toArray()).map((t) => t.description).sort()).toEqual(['Fırın', 'Migros'])
  })

  it('bulut kimliği alınınca eski yerel "Ben" kayıtları yeni kimliğe taşınır', async () => {
    const repo = await device('Osman')
    const old = (await repo.getSettings()).selfMemberId!
    const t = await repo.addTransaction({ date: '2026-09-10', amountKurus: 100, type: 'expense', description: 'A', categoryId: 'cat-market' })
    await repo.db.transactions.update(t.id, { memberId: old })
    await adoptCloudIdentity(repo, OSMAN)
    expect((await repo.getSettings()).selfMemberId).toBe(OSMAN)
    expect((await repo.db.transactions.get(t.id))?.memberId).toBe(OSMAN)
    expect(await repo.db.members.get(old)).toBeUndefined()
    expect((await repo.db.members.get(OSMAN))?.name).toBe('Osman')
  })

  it('üyeden gelen işlem bu cihazda düzenlenemez, silinemez, taşınamaz; paylaşılan grup silinemez', async () => {
    const { osman, ayse, oCloud, aCloud } = await setup()
    const t = await osman.addTransaction({ date: '2026-09-10', amountKurus: 30000, type: 'expense', description: 'Migros', categoryId: 'cat-market', groupId: 'grp-ortak' })
    const own = await ayse.addTransaction({ date: '2026-09-11', amountKurus: 1000, type: 'expense', description: 'Simit', categoryId: 'cat-restoran', groupId: 'grp-ortak' })
    await syncAll(osman, oCloud)
    await syncAll(ayse, aCloud)
    await expect(ayse.updateTransaction(t.id, { date: '2026-09-10', amountKurus: 1, type: 'expense', description: 'X', categoryId: 'cat-market' })).rejects.toThrow(UserFacingError)
    expect((await ayse.deleteTransactions([t.id, own.id])).map((x) => x.id)).toEqual([own.id])
    expect(await ayse.bulkSetGroup([t.id], 'grp-bireysel')).toBe(0)
    expect(await ayse.bulkSetCategory([t.id], 'cat-diger')).toBe(0)
    expect((await ayse.db.transactions.get(t.id))?.groupId).toBe('grp-ortak')
    await expect(ayse.deleteGroup('grp-ortak')).rejects.toThrow(UserFacingError)
  })

  it('ay döngüsünü yalnızca grup yöneticisi belirler, üyelere eşitlenir', async () => {
    const { osman, ayse, oCloud, aCloud } = await setup()
    expect((await ayse.db.groups.get('grp-ortak'))?.cloudOwnerId).toBe(OSMAN)
    await expect(setGroupCycle(ayse, aCloud, 'grp-ortak', 10)).rejects.toThrow(UserFacingError)
    await setGroupCycle(osman, oCloud, 'grp-ortak', 15)
    expect((await osman.db.groups.get('grp-ortak'))?.cycleStartDay).toBe(15)
    await syncAll(ayse, aCloud)
    expect((await ayse.db.groups.get('grp-ortak'))?.cycleStartDay).toBe(15)
    // Takvim ayına dönüş
    await setGroupCycle(osman, oCloud, 'grp-ortak', 1)
    await syncAll(ayse, aCloud)
    expect((await ayse.db.groups.get('grp-ortak'))?.cycleStartDay ?? null).toBeNull()
    // Paylaşılmayan grupta herkes kendi döngüsünü seçer
    await setGroupCycle(ayse, aCloud, 'grp-bireysel', 20)
    expect((await ayse.db.groups.get('grp-bireysel'))?.cycleStartDay).toBe(20)
  })

  it('paylaşıma açılırken grubun döngüsü buluta taşınır, katılan üye alır', async () => {
    const osman = await device('Osman')
    const ayse = await device('Ayşe')
    const oCloud = cloud.as(OSMAN)
    const aCloud = cloud.as(AYSE)
    await adoptCloudIdentity(osman, OSMAN)
    await adoptCloudIdentity(ayse, AYSE)
    await setGroupCycle(osman, null, 'grp-ortak', 25)
    const shared = await shareGroup(osman, oCloud, 'grp-ortak')
    const joined = await joinWithInvite(ayse, aCloud, await oCloud.createInvite(shared.cloudId!))
    expect(joined.cycleStartDay).toBe(25)
  })

  it('adı yazılmadan grup paylaşılamaz', async () => {
    const repo = await device('Ben')
    await expect(shareGroup(repo, cloud.as(OSMAN), 'grp-ortak')).rejects.toBeInstanceOf(UserFacingError)
  })
})

describe('davet bağlantısı', () => {
  it('kodlanır ve çözülür; bozuk bağlantı reddedilir', () => {
    const link = buildInviteLink('https://ornek.github.io/app/#/uyeler', { url: 'https://abcd.supabase.co', key: 'x'.repeat(40), code: 'kod123', group: 'Ortak', from: 'Osman' })
    expect(link.startsWith('https://ornek.github.io/app/#/katil?d=')).toBe(true)
    const d = new URL(link.replace('#/', '')).searchParams.get('d')
    expect(parseInvite(d)).toMatchObject({ code: 'kod123', group: 'Ortak', from: 'Osman', url: 'https://abcd.supabase.co' })
    expect(parseInvite('bozuk')).toBeNull()
    expect(parseInvite(null)).toBeNull()
  })

  it('gider paylaşımını yalnızca yönetici yapar; üyeye eşitlenir ve geri alınabilir', async () => {
    const { osman, ayse, oCloud, aCloud } = await setup()
    await syncAll(ayse, aCloud)
    const shares = { [OSMAN]: 5000, [AYSE]: 5000 }
    const input = { start: '2026-09-01', end: '2026-09-30', totalKurus: 10000, shares }
    await expect(settleGroupPeriod(ayse, aCloud, 'grp-ortak', input)).rejects.toBeInstanceOf(UserFacingError)
    await settleGroupPeriod(osman, oCloud, 'grp-ortak', input)
    expect((await osman.db.groups.get('grp-ortak'))?.settlements).toMatchObject([{ start: '2026-09-01', totalKurus: 10000, shares }])
    await syncAll(ayse, aCloud)
    expect((await ayse.db.groups.get('grp-ortak'))?.settlements).toMatchObject([{ start: '2026-09-01', end: '2026-09-30', shares, createdBy: OSMAN }])
    // Yeniden paylaştırma aynı dönemi günceller
    await settleGroupPeriod(osman, oCloud, 'grp-ortak', { ...input, totalKurus: 20000, shares: { [OSMAN]: 10000, [AYSE]: 10000 } })
    await syncAll(ayse, aCloud)
    expect((await ayse.db.groups.get('grp-ortak'))?.settlements?.map((x) => x.totalKurus)).toEqual([20000])
    await expect(unsettleGroupPeriod(ayse, aCloud, 'grp-ortak', '2026-09-01')).rejects.toBeInstanceOf(UserFacingError)
    await unsettleGroupPeriod(osman, oCloud, 'grp-ortak', '2026-09-01')
    await syncAll(ayse, aCloud)
    expect((await ayse.db.groups.get('grp-ortak'))?.settlements).toEqual([])
    // Gruptan ayrılınca paylaşımlar da kalkar
    await settleGroupPeriod(osman, oCloud, 'grp-ortak', input)
    await syncAll(ayse, aCloud)
    await leaveGroup(ayse, aCloud, 'grp-ortak')
    expect((await ayse.db.groups.get('grp-ortak'))?.settlements).toBeUndefined()
  })

  it('paylaşımlar okunamazsa eşitlemenin geri kalanı çalışır', async () => {
    const { osman, ayse, oCloud, aCloud } = await setup()
    await osman.addTransaction({ date: '2026-09-10', amountKurus: 30000, type: 'expense', description: 'Migros', categoryId: 'cat-market', groupId: 'grp-ortak' })
    await syncAll(osman, oCloud)
    const broken = { ...aCloud, listSettlements: async () => Promise.reject(new Error('relation does not exist')) }
    expect((await syncAll(ayse, broken)).received).toBe(1)
  })
})
