import { expect, test } from '@playwright/test'
import { addExpense, open } from './helpers'

test('Plus bütçe: ücretsizde kilitli; önizlemede kategori limiti, uyarı ve tahmin çalışır', async ({ page }) => {
  await open(page, 'butce')
  await expect(page.getByRole('heading', { name: 'Gelişmiş bütçe' })).toBeVisible()
  await page.getByRole('link', { name: 'Paketleri incele' }).click()
  await expect(page.getByRole('heading', { name: 'Paketler', level: 1 })).toBeVisible()
  await expect(page.getByText('Kullandığınız paket')).toBeVisible()

  await page.getByRole('radiogroup', { name: 'Önizleme paketi' }).getByRole('radio', { name: 'Plus', exact: true }).click()
  await page.getByRole('link', { name: 'Aç' }).click()
  await expect(page.getByRole('heading', { name: 'Bütçe planı' })).toBeVisible()
  await expect(page.getByText('Henüz kategori limiti yok')).toBeVisible()

  await page.getByRole('button', { name: 'Limit ekle' }).click()
  const dlg = page.getByRole('dialog', { name: 'Kategori limiti ekle' })
  await dlg.getByLabel('Kategori').selectOption({ label: 'Market' })
  await dlg.getByLabel('Tutar (TL)').fill('100')
  await dlg.getByRole('button', { name: 'Kaydet' }).click()
  await expect(dlg).toBeHidden()
  await expect(page.getByRole('progressbar', { name: 'Market limit kullanımı' })).toBeVisible()

  await addExpense(page, { amount: '90', description: 'Bakkal', category: 'Market' })
  const warn = page.getByRole('region', { name: 'Bütçe uyarıları' })
  await expect(warn).toContainText('Market')
  await expect(warn).toContainText('%90 kullanıldı')
  await expect(page.getByText(/Dönemin \d+ gününün \d+\. günündesiniz/)).toBeVisible()

  // Panelde uyarı sayısı görünür
  await page.goto('./#/')
  await expect(page.getByRole('link', { name: /Bütçe planı.*1 uyarı/ })).toBeVisible()
})
