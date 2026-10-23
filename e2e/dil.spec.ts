import { expect, test } from '@playwright/test'

test.use({ locale: 'en-GB', timezoneId: 'Europe/London' })

test('cihaz dili İngilizce olan yeni kurulum İngilizce açılır, Ayarlar\'dan Türkçeye geçilir', async ({ page }) => {
  await page.goto('./#/')
  await expect(page.getByRole('navigation').first()).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('link', { name: 'Transactions' }).first()).toBeVisible()

  await page.goto('./#/ayarlar')
  await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible()
  await page.getByRole('radio', { name: 'Türkçe' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'tr')
  await expect(page.getByRole('heading', { name: 'Görünüm' })).toBeVisible()
})
