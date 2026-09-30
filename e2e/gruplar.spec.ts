import { expect, test } from '@playwright/test'
import { addExpense, open } from './helpers'

test('harcama grupları: gider formunda seçilir, panel ve işlemler gruba göre filtrelenir, toplu atanır', async ({ page }) => {
  await open(page)
  await addExpense(page, { amount: '300', description: 'Ortak Market', category: 'Market', group: 'Ortak' })
  await expect(page.getByRole('dialog')).toBeHidden()
  await addExpense(page, { amount: '120', description: 'Kendi Kahvem', category: 'Restoran/Kafe', group: 'Bireysel' })
  await expect(page.getByRole('dialog')).toBeHidden()
  await addExpense(page, { amount: '50', description: 'Grupsuz Otopark', category: 'Ulaşım' })
  await expect(page.getByRole('dialog')).toBeHidden()

  // Gruplara göre kartı ve filtre
  const byGroup = page.getByRole('heading', { name: 'Gruplara göre' }).locator('xpath=ancestor::section[1]')
  await expect(byGroup.getByRole('button', { name: /Ortak: net 300,00 ₺, 1 işlem/ })).toBeVisible()
  await expect(byGroup.getByRole('button', { name: /Bireysel: net 120,00 ₺, 1 işlem/ })).toBeVisible()
  await expect(byGroup.getByRole('button', { name: /Grupsuz: net 50,00 ₺, 1 işlem/ })).toBeVisible()

  const filter = page.getByRole('radiogroup', { name: 'Grup filtresi' })
  await filter.getByRole('radio', { name: 'Ortak' }).click()
  await expect(page.locator('#net-title')).toContainText('Ortak')
  await expect(page.getByText('300,00 ₺').first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Son işlemler' }).locator('xpath=ancestor::section[1]')).not.toContainText('Kendi Kahvem')

  // İşlemler sayfası aynı filtreyle açılır; toplu grup ata
  await open(page, 'islemler')
  await expect(page.getByRole('radiogroup', { name: 'Grup filtresi' }).getByRole('radio', { name: 'Ortak' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByText(/^1 işlem · Gider 300,00 ₺/)).toBeVisible()
  await page.getByRole('radiogroup', { name: 'Grup filtresi' }).getByRole('radio', { name: 'Grupsuz' }).click()
  await expect(page.getByText(/^1 işlem · Gider 50,00 ₺/)).toBeVisible()
  await page.getByRole('checkbox', { name: 'Grupsuz Otopark seç' }).first().check()
  await page.getByRole('button', { name: 'Grup ata' }).click()
  const dlg = page.getByRole('dialog', { name: 'Toplu grup ata' })
  await dlg.getByRole('radio', { name: 'Ortak' }).click()
  await dlg.getByRole('button', { name: 'Uygula' }).click()
  await expect(page.getByText('1 işlem “Ortak” grubuna alındı.')).toBeVisible()
  await page.getByRole('radiogroup', { name: 'Grup filtresi' }).getByRole('radio', { name: 'Ortak' }).click()
  await expect(page.getByText(/^2 işlem · Gider 350,00 ₺/)).toBeVisible()
})

test('grup eklenir, yeniden adlandırılır ve silinince işlemler grupsuz kalır', async ({ page }) => {
  await open(page, 'kategoriler')
  await page.getByRole('radio', { name: 'Harcama grupları' }).click()
  await page.getByRole('button', { name: 'Grup ekle' }).click()
  const dlg = page.getByRole('dialog', { name: 'Yeni grup' })
  await dlg.getByLabel('Ad').fill('Tatil')
  await dlg.getByRole('button', { name: 'Kaydet' }).click()
  await expect(page.getByText('Grup eklendi.')).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: 'Tatil' })).toBeVisible()

  await addExpense(page, { amount: '999', description: 'Otel', category: 'Diğer', group: 'Tatil' })
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page.getByRole('listitem').filter({ hasText: 'Tatil' })).toContainText('1 işlem')

  await page.getByRole('button', { name: 'Tatil sil' }).click()
  const confirm = page.getByRole('dialog', { name: '“Tatil” grubu silinsin mi?' })
  await expect(confirm).toContainText('1 işlem')
  await confirm.getByRole('button', { name: 'Sil' }).click()
  await expect(page.getByText('“Tatil” silindi. 1 işlem grupsuz kaldı.')).toBeVisible()
  await open(page, 'islemler')
  await expect(page.getByRole('row', { name: /Otel/ })).toBeVisible()
})
