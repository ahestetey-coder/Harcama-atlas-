import { expect, test } from '@playwright/test'

test('İngilizce sürüm ve dil seçici', async ({ page, isMobile }) => {
  await page.goto('/fiyatlar/')
  await expect(page.locator('html')).toHaveAttribute('lang', 'tr')
  await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute('href', /\/en\/pricing$/)

  if (isMobile) await page.locator('.menu-btn').click()
  await page.locator(isMobile ? '#mobil-menu [data-lang-switch]' : '.actions [data-lang-switch]').click()
  await expect(page).toHaveURL(/\/en\/pricing\/?$/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Pick the plan')
  // Fiyatlar İngilizce biçimde, ödeme bağlantısı İngilizce sayfaya gider
  await expect(page.locator('a[data-plan="plus"]').first()).toHaveAttribute('href', /^\/en\/checkout\?plan=plus/)
  await expect(page.locator('.prices .amt').nth(1)).toHaveText(/₺99\.99/)
})

test('İngilizce yasal metinde Türkçe aslı bağlantısı var', async ({ page }) => {
  await page.goto('/en/legal/privacy/')
  await expect(page.getByRole('note')).toContainText('legally binding')
  await expect(page.getByRole('note').getByRole('link')).toHaveAttribute('href', '/yasal/gizlilik')
})
