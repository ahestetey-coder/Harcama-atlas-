import { expect, test } from '@playwright/test'

const pages = ['/', '/fiyatlar/', '/nasil-kullanilir/', '/test/']

for (const path of pages) {
  test(`${path} açılır, tek h1 var, yatay kaydırma yok`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(path)
    await expect(page.locator('h1')).toHaveCount(1)
    await expect(page.locator('h1')).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    expect(errors).toEqual([])
  })
}

test('ana sayfa: test çağrısı ve SSS', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: /Finansal Harita testini çöz/ }).first()).toHaveAttribute('href', '/test')
  const q = page.getByText('Finansal Harita testi ücretli mi?')
  await q.click()
  await expect(page.getByText(/Test ücretsiz, yaklaşık 2 dakika/)).toBeVisible()
})

test('fiyatlar: yıllık seçilince fiyat ve ödeme bağlantısı değişir', async ({ page }) => {
  await page.goto('/fiyatlar/')
  const plus = page.locator('.plan', { hasText: 'Bütçeni planla' })
  await expect(plus.getByText('₺99,99')).toBeVisible()
  await page.getByRole('button', { name: /Yıllık/ }).click()
  await expect(plus.getByText('₺959,90')).toBeVisible()
  await expect(plus.getByRole('link', { name: /Plus'a geç/ })).toHaveAttribute('href', '/odeme?plan=plus&period=yearly')
  await expect(page.getByRole('row', { name: /Rotamı netleştir/ })).toBeVisible()
})

test('tema düğmesi koyu temaya geçer ve hatırlar', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  await page.getByRole('button', { name: 'Temayı değiştir' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.goto('/fiyatlar/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('mobil menü açılır ve sayfalar arasında gezilir', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'yalnızca mobil')
  await page.goto('/')
  await page.getByRole('button', { name: 'Menüyü aç' }).click()
  await page.getByRole('navigation', { name: 'Mobil menü' }).getByRole('link', { name: 'Nasıl kullanılır' }).click()
  await expect(page).toHaveURL(/nasil-kullanilir/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('nasıl kullanılır')
})

test('rehber: içindekiler bağlantısı bölüme götürür', async ({ page }) => {
  await page.goto('/nasil-kullanilir/')
  await page.getByRole('navigation', { name: 'Rehber bölümleri' }).getByRole('link', { name: /Koçla konuş/ }).click()
  await expect(page.locator('#koc')).toBeInViewport()
})

test('sayfa geçişinden sonra da etkileşimler çalışır', async ({ page, isMobile }) => {
  test.skip(isMobile, 'masaüstü menüsü')
  await page.goto('/')
  await page.getByRole('navigation', { name: 'Ana menü' }).getByRole('link', { name: 'Fiyatlar' }).click()
  await expect(page).toHaveURL(/fiyatlar/)
  await page.getByRole('button', { name: /Yıllık/ }).click()
  await expect(page.locator('.plan', { hasText: 'Bütçeni planla' }).getByText('₺959,90')).toBeVisible()
})

test('test sayfası uygulamadaki testi gömülü modda açar', async ({ page }) => {
  await page.goto('/test')
  const src = await page.locator('iframe[data-test]').getAttribute('src')
  expect(src).toContain('?gomulu=1&tema=')
  expect(src).toContain('#/harita')
  await expect(page.getByRole('link', { name: 'yeni sekmede aç' })).toHaveAttribute('href', /#\/harita$/)
})
