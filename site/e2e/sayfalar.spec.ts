import { expect, test } from '@playwright/test'

const pages = ['/', '/fiyatlar/', '/nasil-kullanilir/', '/test/', '/giris/', '/blog/', '/blog/finansal-ozgurluk-nedir/', '/yasal/kvkk/', '/yasal/mesafeli-satis/']

// Testler gerçek veritabanına gitmez; fiyatlar sayfadaki varsayılanlarla kalır
test.beforeEach(async ({ page }) => {
  await page.route(/supabase\.co/, (r) => r.abort())
})

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
  await expect(plus.getByRole('link', { name: /7 gün ücretsiz dene/ })).toHaveAttribute('href', '/odeme?plan=plus&period=yearly')
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

test('yasal sayfalar: taslak uyarısı ve doldurulacak alanlar', async ({ page }) => {
  for (const slug of ['kvkk', 'gizlilik', 'cerez', 'kullanim-kosullari', 'on-bilgilendirme', 'mesafeli-satis', 'iptal-iade']) {
    const res = await page.goto(`/yasal/${slug}/`)
    expect(res?.status()).toBe(200)
    await expect(page.getByRole('note')).toContainText('taslak')
  }
  await expect(page.locator('.fill').first()).toBeVisible()
})

test('SEO: canonical, paylaşım görseli, site haritası ve blog', async ({ page, request }) => {
  await page.goto('/fiyatlar/')
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', 'https://harcama-atlas.pages.dev/fiyatlar/')
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://harcama-atlas.pages.dev/og.png')
  await page.goto('/giris/')
  await expect(page.locator('link[rel=canonical]')).toHaveCount(0)
  const sitemap = await (await request.get('/sitemap.xml')).text()
  expect(sitemap).toContain('/yasal/kvkk/')
  expect(sitemap).toContain('/blog/50-30-20-butce-kurali/')
  expect(sitemap).not.toContain('/giris')
  expect(await (await request.get('/robots.txt')).text()).toContain('Sitemap:')
  await page.goto('/blog/')
  await page.getByRole('link', { name: /50\/30\/20 kuralı/ }).click()
  await expect(page.locator('h1')).toHaveText(/50\/30\/20/)
  await expect(page.getByRole('link', { name: 'Paketleri gör' })).toHaveAttribute('href', '/fiyatlar')
})
