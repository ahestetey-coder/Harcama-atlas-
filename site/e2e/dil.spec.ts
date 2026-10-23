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
  await expect(page.locator('.prices .amt').nth(1)).toHaveText(/\$2\.99/)
})

test.describe('yurt dışından gelen ziyaretçi', () => {
  test.use({ locale: 'en-US', timezoneId: 'America/New_York' })

  test('İngilizce yasal metinde Türkçe aslı bağlantısı var', async ({ page }) => {
    await page.goto('/en/legal/privacy/')
    await expect(page.getByRole('note')).toContainText('legally binding')
    await expect(page.getByRole('note').getByRole('link')).toHaveAttribute('href', '/yasal/gizlilik')
  })

  test('ilk ziyarette İngilizce açılır, elle seçilen Türkçe hatırlanır', async ({ page, isMobile }) => {
    await page.goto('/fiyatlar/')
    await expect(page).toHaveURL(/\/en\/pricing\/?$/)
    if (isMobile) await page.locator('.menu-btn').click()
    await page.locator(isMobile ? '#mobil-menu [data-lang-switch]' : '.actions [data-lang-switch]').click()
    await expect(page).toHaveURL(/\/fiyatlar\/?$/)
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('lang', 'tr')
  })

  test('İngilizce sayfada uygulama görüntüleri İngilizce', async ({ page }) => {
    await page.goto('/en/')
    await expect(page.locator('.phone img').first()).toHaveAttribute('src', /^\/screenshots\/en\//)
    await expect(page.locator('video source').first()).toHaveAttribute('src', /^\/video\/en\//)
  })
})

test('Türkiye\'den gelen ziyaretçi İngilizce bağlantıda Türkçeye yönlenir; ?dil=en İngilizcede tutar', async ({ page }) => {
  await page.goto('/en/')
  await expect(page).toHaveURL(/localhost:\d+\/$/)
  await expect(page.locator('.phone img').first()).toHaveAttribute('src', /^\/screenshots\/[a-z-]+\.webp$/)
  await page.goto('/en/pricing/?dil=en')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page).toHaveURL(/\/en\/pricing\/?\?dil=en$/)
})
