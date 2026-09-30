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
          const tx = db.transaction(['members', 'transactions'], 'readwrite')
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

  await open(page, 'islemler')
  await expect(page.getByText(/^2 işlem · Gider 500,00 ₺/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ayşe Fatura sil' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Ayşe Fatura düzenle' }).first().click()
  const dlg = page.getByRole('dialog', { name: 'Üyenin harcaması' })
  await expect(dlg).toContainText('yalnızca o değiştirebilir')
  await expect(dlg).toContainText('Ayşe')
  await expect(dlg.getByRole('button', { name: /kaydet/i })).toHaveCount(0)
})
