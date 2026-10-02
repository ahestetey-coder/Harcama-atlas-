import { expect, test, type Page } from '@playwright/test'
import { addExpense, open, trackExternalRequests } from './helpers'

function inviteParam(p: object): string {
  return Buffer.from(JSON.stringify({ v: 1, ...p })).toString('base64url')
}

/** Başka bir üyeden eşitlenmiş gibi bir işlem ekler (IndexedDB'ye doğrudan). */
async function injectSharedTx(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('harcama-atlasi')
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction(['members', 'transactions', 'groups'], 'readwrite')
          const groups = tx.objectStore('groups')
          const g = groups.get('grp-ortak')
          g.onsuccess = () => groups.put({ ...g.result, cloudId: 'bulut-ortak', cloudOwnerId: 'uye-ayse' })
          // Eşitlemede olduğu gibi cihaz sahibi de grubun üyesidir
          const ms = tx.objectStore('members').getAll()
          ms.onsuccess = () => {
            for (const m of ms.result) tx.objectStore('members').put({ ...m, groupIds: [...new Set([...(m.groupIds ?? []), 'grp-ortak'])] })
          }
          const now = new Date().toISOString()
          const d = new Date()
          const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
          tx.objectStore('members').put({ id: 'uye-ayse', name: 'Ayşe', color: '#7c3aed', groupIds: ['grp-ortak'], createdAt: now, updatedAt: now })
          tx.objectStore('transactions').put({
            id: 'tx-ayse-1',
            date,
            amountKurus: 20000,
            type: 'expense',
            description: 'Ayşe Fatura',
            normalizedDescription: 'AYSE FATURA',
            categoryId: 'cat-faturalar',
            groupId: 'grp-ortak',
            memberId: 'uye-ayse',
            source: 'shared',
            createdAt: now,
            updatedAt: now,
          })
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
      }),
  )
}

test('üyeler sayfası bulut ayarı olmadan ağ isteği yapmaz; davet bağlantısı sunucuyu gösterir', async ({ page }) => {
  const external = trackExternalRequests(page)
  await page.route('https://**.supabase.co/**', (r) => r.abort())
  await open(page, 'uyeler')
  await expect(page.getByRole('heading', { name: 'Bulut bağlantısı kurulmamış' })).toBeVisible()
  await page.getByLabel('Proje adresi (Project URL)').fill('http://yanlis')
  await page.getByLabel('Herkese açık anahtar (anon public key)').fill('x')
  await page.getByRole('button', { name: 'Bağlan' }).click()
  await expect(page.locator('form p.text-danger')).toBeVisible()
  expect(external).toEqual([])

  await open(page, 'katil?d=bozuk')
  await expect(page.getByText('Davet bağlantısı okunamadı')).toBeVisible()

  const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.' + 'a'.repeat(43)
  await open(page, `katil?d=${inviteParam({ url: 'https://ornek.supabase.co', key, code: 'abc123', group: 'Ortak', from: 'Osman' })}`)
  await expect(page.getByText('Osman sizi “Ortak” grubuna davet etti.')).toBeVisible()
  await expect(page.getByText('ornek.supabase.co')).toBeVisible()
  await page.getByRole('button', { name: 'Bu sunucuyu kullan' }).click()
  await expect(page.getByRole('heading', { name: 'Giriş yapın' })).toBeVisible()
})

test('üyenin harcaması panelde kişilere göre görünür ve salt okunurdur', async ({ page }) => {
  await open(page)
  await addExpense(page, { amount: '300', description: 'Ortak Market', category: 'Market', group: 'Ortak' })
  await expect(page.getByRole('dialog')).toBeHidden()
  await injectSharedTx(page)
  await page.reload()
  await open(page)

  await page.getByRole('radiogroup', { name: 'Grup filtresi' }).getByRole('radio', { name: 'Ortak' }).click()
  const people = page.getByRole('heading', { name: /Kişilere göre/ }).locator('xpath=ancestor::section[1]')
  await expect(people.getByRole('button', { name: /Siz: net 300,00 ₺, 1 işlem/ })).toBeVisible()
  await expect(people.getByRole('button', { name: /Ayşe: net 200,00 ₺, 1 işlem/ })).toBeVisible()

  // Gider üye sayısına bölünür: 500 ₺ / 2 = 250 ₺; Ayşe 50 ₺ öder. Paylaştırmayı yalnızca yönetici (Ayşe) yapar.
  await expect(page.getByText('Paylaştırılmadı', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Paylaşımı gör' }).click()
  const split = page.getByRole('dialog', { name: 'Gideri paylaştır' })
  await expect(split).toContainText('Bu dönem henüz paylaştırılmadı')
  await expect(split).toContainText('Paylaşımı grup yöneticisi yapar')
  await expect(split.getByRole('button', { name: 'Gideri paylaştır' })).toHaveCount(0)
  await expect(split).toContainText('500,00 ₺')
  await expect(split).toContainText('250,00 ₺')
  await expect(split.getByRole('list', { name: 'Yapılacak ödemeler' }).getByRole('listitem')).toHaveText(/Ayşe.*Siz.*50,00 ₺/)
  await page.keyboard.press('Escape')
  await expect(split).toBeHidden()

  // Son işlemlerde ekleyen kişi görünür
  const recent = page.getByRole('heading', { name: 'Son işlemler' }).locator('xpath=ancestor::section[1]')
  await expect(recent.locator('[title="Ayşe ekledi"]').filter({ visible: true }).first()).toBeVisible()
  await expect(recent.locator('[title="Siz ekledi"]').filter({ visible: true }).first()).toBeVisible()

  // Kişi filtresi bütün paneli süzer
  const persons = page.getByRole('radiogroup', { name: 'Kişi filtresi' })
  await persons.getByRole('radio', { name: 'Ayşe' }).click()
  await expect(page.getByRole('heading', { name: /Net gider .* · Ortak · Ayşe/ })).toBeVisible()
  await expect(page.getByText('Ortak Market')).toHaveCount(0)
  await persons.getByRole('radio', { name: 'Herkes' }).click()

  await open(page, 'islemler')
  await expect(page.getByText(/^2 işlem · Gider 500,00 ₺/)).toBeVisible()
  await page.getByRole('radiogroup', { name: 'Kişi filtresi' }).getByRole('radio', { name: 'Siz' }).click()
  await expect(page.getByText(/^1 işlem · Gider 300,00 ₺/)).toBeVisible()
  await page.getByRole('radiogroup', { name: 'Kişi filtresi' }).getByRole('radio', { name: 'Herkes' }).click()
  await expect(page.getByRole('button', { name: 'Ayşe Fatura sil' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Ayşe Fatura düzenle' }).first().click()
  const dlg = page.getByRole('dialog', { name: 'Üyenin harcaması' })
  await expect(dlg).toContainText('yalnızca o değiştirebilir')
  await expect(dlg).toContainText('Ayşe')
  await expect(dlg.getByRole('button', { name: /kaydet/i })).toHaveCount(0)
})

/** Yöneticinin bu ayı paylaştırdığını (eşitlemeden gelmiş gibi) ekler: 500 ₺, kişi başı 250 ₺. */
async function injectSettlement(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('harcama-atlasi')
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction(['groups', 'settings'], 'readwrite')
          const d = new Date()
          const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
          const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
          const st = tx.objectStore('settings').get('settings')
          st.onsuccess = () => {
            const self = st.result.selfMemberId as string
            const groups = tx.objectStore('groups')
            const g = groups.get('grp-ortak')
            g.onsuccess = () =>
              groups.put({
                ...g.result,
                settlements: [
                  { start: `${ym}-01`, end: `${ym}-${last}`, totalKurus: 50000, shares: { [self]: 25000, 'uye-ayse': 25000 }, createdBy: 'uye-ayse', createdAt: new Date().toISOString() },
                ],
              })
          }
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
      }),
  )
}

test('Tümü kişiseldir: üyenin ortak gideri listede görünür ama toplama girmez; paylaşım farkı eklenir', async ({ page }) => {
  await open(page)
  await addExpense(page, { amount: '300', description: 'Ortak Market', category: 'Market', group: 'Ortak' })
  await expect(page.getByRole('dialog')).toBeHidden()
  await addExpense(page, { amount: '40', description: 'Kendi Kahvem', category: 'Restoran/Kafe' })
  await expect(page.getByRole('dialog')).toBeHidden()
  await injectSharedTx(page)
  await page.reload()
  await open(page)

  // Paylaşım yokken: toplam kendi eklediğiniz 300 + 40; Ayşe'nin 200'ü listede görünür, toplama girmez
  const hero = page.locator('section[aria-labelledby="net-title"]')
  await expect(hero).toContainText('340,00')
  await expect(page.getByRole('radiogroup', { name: 'Kişi filtresi' })).toHaveCount(0)
  const recent = page.getByRole('heading', { name: 'Son işlemler' }).locator('xpath=ancestor::section[1]')
  await expect(recent.getByText('Ayşe Fatura').filter({ visible: true }).first()).toBeVisible()
  await expect(recent.getByText('Toplama girmez').filter({ visible: true }).first()).toBeVisible()
  const notes = page.getByRole('region', { name: 'Ortak grupların dönemi' })
  await expect(notes).toContainText('Ortak · bu dönem henüz paylaştırılmadı')

  // Yönetici paylaştırınca (500 ₺, kişi başı 250): 300 ödediniz, 50 alacak eklenir → 300 + 40 − 50 = 290
  await injectSettlement(page)
  await page.reload()
  await open(page)
  await expect(hero).toContainText('290,00')
  await expect(notes).toContainText('Yönetici Ortak giderini sizinle paylaştı')
  await expect(notes).toContainText('payınız 250,00 ₺')

  await open(page, 'islemler')
  await expect(page.getByText(/^4 işlem · Gider 340,00 ₺ · İade 50,00 ₺/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Ortak paylaşımı · alacak sil/ })).toHaveCount(0)
  await page.getByRole('button', { name: /Ortak paylaşımı · alacak.*düzenle/ }).first().click()
  const dlg = page.getByRole('dialog', { name: 'Paylaşım farkı' })
  await expect(dlg).toContainText('alacak olarak eklendi')
  await page.keyboard.press('Escape')

  // Grup seçilince grubun bütün giderleri ve paylaşım durumu görünür
  await page.getByRole('radiogroup', { name: 'Grup filtresi' }).getByRole('radio', { name: 'Ortak' }).click()
  await expect(page.getByText(/^2 işlem · Gider 500,00 ₺/)).toBeVisible()
  await open(page)
  await expect(page.getByText('Paylaştırıldı', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Paylaşımı gör' }).click()
  const split = page.getByRole('dialog', { name: 'Gideri paylaştır' })
  await expect(split).toContainText('Yönetici bu dönemin giderini sizinle paylaştı')
  await expect(split.getByRole('button', { name: 'Paylaşımı geri al' })).toHaveCount(0)
})
