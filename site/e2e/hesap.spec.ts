import { expect, test, type Page } from '@playwright/test'

// Hesap sayfaları sahte bir Supabase ile denenir: oturum yerel depoya yazılır, REST yanıtları taklit edilir.
const KEY = 'sb-muonkdoiiuxwmcgshyza-auth-token'
const USER = { id: '22222222-2222-2222-2222-222222222222', email: 'deniz@ornek.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' }
const PRICES = [
  { plan: 'plus', period: 'monthly', currency: 'TRY', amount_kurus: 9999, trial_days: 0, active: true, paddle_price_id: 'pri_a' },
  { plan: 'plus', period: 'yearly', currency: 'TRY', amount_kurus: 95990, trial_days: 0, active: true, paddle_price_id: 'pri_b' },
  { plan: 'plusplus', period: 'monthly', currency: 'TRY', amount_kurus: 19999, trial_days: 7, active: true, paddle_price_id: 'pri_c' },
  { plan: 'plusplus', period: 'yearly', currency: 'TRY', amount_kurus: 191990, trial_days: 7, active: true, paddle_price_id: 'pri_d' },
  { plan: 'plus', period: 'monthly', currency: 'USD', amount_kurus: 299, trial_days: 7, active: true, paddle_price_id: 'pri_ua' },
  { plan: 'plus', period: 'yearly', currency: 'USD', amount_kurus: 2870, trial_days: 7, active: true, paddle_price_id: 'pri_ub' },
  { plan: 'plusplus', period: 'monthly', currency: 'USD', amount_kurus: 599, trial_days: 7, active: true, paddle_price_id: 'pri_uc' },
  { plan: 'plusplus', period: 'yearly', currency: 'USD', amount_kurus: 5750, trial_days: 7, active: true, paddle_price_id: 'pri_ud' },
]

async function fakeSupabase(page: Page, opts: { signedIn: boolean; sub?: Record<string, unknown> | null; token?: string | null }) {
  if (opts.signedIn)
    await page.addInitScript(
      ([k, u]) => localStorage.setItem(k as string, JSON.stringify({ access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user: u })),
      [KEY, USER] as const,
    )
  await page.route(/supabase\.co/, async (r) => {
    const url = r.request().url()
    const one = r.request().headers()['accept']?.includes('vnd.pgrst.object')
    const body = (v: unknown) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/auth/v1/user')) return body(USER)
    const settings = { environment: 'sandbox', client_token: opts.token === undefined ? 'test_abcdefghijklmn' : opts.token }
    if (url.includes('ha_billing_settings')) return body(one ? settings : [settings])
    if (url.includes('ha_web_prices')) return body(PRICES)
    if (url.includes('ha_subscriptions')) return one ? (opts.sub ? body(opts.sub) : r.fulfill({ status: 406, contentType: 'application/json', body: '{"code":"PGRST116"}' })) : body(opts.sub ? [opts.sub] : [])
    if (url.includes('rpc/ha_check_coupon')) return body(JSON.parse(r.request().postData() ?? '{}').p_code === 'YAZ20' ? 20 : null)
    if (url.includes('rpc/ha_my_plan')) return body(opts.sub ? opts.sub.plan : 'free')
    return r.abort()
  })
}

test('ödeme: oturum yoksa girişe, girişten sonra geri döner', async ({ page }) => {
  await fakeSupabase(page, { signedIn: false })
  await page.goto('/odeme?plan=plus_plus&period=yearly')
  await expect(page).toHaveURL(/\/giris\/?\?sonra=%2Fodeme%2F?%3Fplan%3Dplus_plus%26period%3Dyearly/)
  await page.getByLabel('E-posta').fill('yanlis')
  await page.getByLabel('Şifre').fill('123456')
  await page.locator('[data-submit]').click()
  await expect(page.getByText('Geçerli bir e-posta yaz.')).toBeVisible()
})

test('ödeme: Plus+ denemesi, kampanya kodu ve onay zorunluluğu', async ({ page }) => {
  await fakeSupabase(page, { signedIn: true, sub: null })
  await page.goto('/odeme?plan=plus_plus&period=monthly')
  const sum = page.locator('.summary')
  await expect(sum.getByText('Plus+ · Aylık')).toBeVisible()
  await expect(sum.locator('[data-total]')).toHaveText('₺0')
  await expect(sum.getByText(/7 gün ücretsiz. Deneme bitince ₺199,99 alınır/)).toBeVisible()
  await page.getByLabel('Kampanya kodu').fill('yaz20')
  await page.getByRole('button', { name: 'Uygula' }).click()
  await expect(page.getByText('Kod uygulandı: %20 indirim.')).toBeVisible()
  await expect(sum.getByText(/Deneme bitince ₺159,99 alınır/)).toBeVisible()
  await page.locator('[data-plan="plus"]').click()
  await expect(sum.locator('[data-total]')).toHaveText('₺99,99')
  await page.locator('[data-period="yearly"]').click()
  await expect(sum.locator('[data-total]')).toHaveText('₺959,90')
  await expect(page).toHaveURL(/plan=plus&period=yearly/)
  await page.getByRole('button', { name: 'Ödemeye geç' }).click()
  await expect(page.getByText(/sözleşmeyi onayla/)).toBeVisible()
})

test('İngilizce ödeme sayfası dolar fiyatlarını kullanır', async ({ page }) => {
  await fakeSupabase(page, { signedIn: true, sub: null })
  await page.goto('/en/checkout?dil=en&plan=plus&period=monthly')
  const sum = page.locator('.summary')
  await expect(sum.locator('[data-sum-price]')).toHaveText('$2.99')
  await expect(sum.getByText(/7 days free. \$2\.99 is charged/)).toBeVisible()
  await page.locator('[data-period="yearly"]').click()
  await expect(sum.locator('[data-sum-price]')).toHaveText('$28.70')
})

test('ödeme: Paddle bağlanmadıysa "çok yakında" gösterir', async ({ page }) => {
  await fakeSupabase(page, { signedIn: true, sub: null, token: null })
  await page.goto('/odeme?plan=plus&period=monthly')
  await expect(page.getByRole('heading', { name: 'Web ödemesi çok yakında' })).toBeVisible()
})

test('abonelik: denemedeki abonelik ve yönetim düğmeleri', async ({ page }) => {
  const sub = { id: 'sub_1', plan: 'plusplus', period: 'monthly', status: 'trialing', amount_kurus: 19999, current_period_end: '2026-10-28T10:00:00Z', trial_end: '2026-10-28T10:00:00Z', cancel_at: null }
  await fakeSupabase(page, { signedIn: true, sub })
  await page.goto('/hesap/abonelik')
  await expect(page.getByRole('heading', { name: 'Plus+ · Aylık' })).toBeVisible()
  await expect(page.getByText('Deneme', { exact: true })).toBeVisible()
  await expect(page.getByText(/Ücretsiz deneme 28 Ekim 2026 tarihinde bitiyor. Sonra ₺199,99 alınır./)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Aboneliği yönet' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'İptal et' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Plus · Yıllık/ })).toBeVisible()
  await expect(page.getByText('deniz@ornek.com')).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('ödeme: aboneliği olan kişi abonelik sayfasına yönlendirilir', async ({ page }) => {
  await fakeSupabase(page, { signedIn: true, sub: { id: 'sub_1', plan: 'plus', period: 'monthly', status: 'active', amount_kurus: 9999, current_period_end: null, trial_end: null, cancel_at: null } })
  await page.goto('/odeme?plan=plus&period=monthly')
  await expect(page.getByRole('heading', { name: 'Zaten bir aboneliğin var' })).toBeVisible()
})
