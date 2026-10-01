import { expect, test } from '@playwright/test'
import { open } from './helpers'

test('kişisel ve grup ay döngüsü panelde dönemi değiştirir', async ({ page }) => {
  await open(page, 'ayarlar')
  await page.getByLabel('Kişisel ay döngünüz').selectOption('15')
  await expect(page.getByText('Ay döngünüz her ayın 15’i olarak ayarlandı.')).toBeVisible()

  await open(page)
  await expect(page.getByRole('button', { name: /seçili: 15 \S+ – 14 \S+ \d{4}/ }).filter({ visible: true }).first()).toBeVisible()

  await open(page, 'kategoriler')
  await page.getByRole('radio', { name: 'Harcama grupları' }).click()
  await page.getByRole('button', { name: 'Ortak düzenle' }).click()
  await page.getByLabel('Ay döngüsü').selectOption('20')
  await page.getByRole('button', { name: 'Kaydet' }).click()
  await expect(page.getByText(/· 20\. gün döngüsü/)).toBeVisible()

  await open(page)
  await page.getByRole('radiogroup', { name: 'Grup filtresi' }).getByRole('radio', { name: 'Ortak' }).click()
  await expect(page.getByRole('button', { name: /seçili: 20 \S+ – 19 \S+ \d{4}/ }).filter({ visible: true }).first()).toBeVisible()
})
