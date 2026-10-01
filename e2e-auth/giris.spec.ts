import { expect, test, type Page } from '@playwright/test'

const SUPABASE = 'https://test-proje.supabase.co'

const USERS: Record<string, { id: string; name: string }> = {
  'osman@ornek.com': { id: '11111111-1111-4111-8111-111111111111', name: 'Osman' },
  'ayse@ornek.com': { id: '22222222-2222-4222-8222-222222222222', name: 'Ayşe' },
}

function user(email: string) {
  const u = USERS[email]
  return { id: u.id, aud: 'authenticated', role: 'authenticated', email, user_metadata: { full_name: u.name }, app_metadata: { provider: 'email' }, identities: [{ id: u.id, provider: 'email' }], created_at: '2026-10-01T00:00:00Z' }
}

function session(email: string) {
  const now = Math.floor(Date.now() / 1000)
  const payload = Buffer.from(JSON.stringify({ sub: USERS[email].id, email, role: 'authenticated', aud: 'authenticated', exp: now + 3600 })).toString('base64url')
  return { access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.imza`, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'yenile', user: user(email) }
}

/** Supabase kimlik ve veri API'sini taklit eder. */
async function mockSupabase(page: Page, opts: { google?: boolean; confirmEmail?: boolean } = {}) {
  const calls: string[] = []
  await page.route(`${SUPABASE}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    calls.push(`${req.method()} ${url.pathname}${url.search}`)
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (url.pathname === '/auth/v1/settings') return json({ external: { google: !!opts.google, email: true } })
    if (url.pathname === '/auth/v1/token') {
      const body = req.postDataJSON() as { email: string; password: string }
      if (!USERS[body.email] || body.password !== 'gizli123') return json({ error: 'invalid_grant', error_description: 'Invalid login credentials', code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400)
      return json(session(body.email))
    }
    if (url.pathname === '/auth/v1/signup') {
      const body = req.postDataJSON() as { email: string }
      return json(opts.confirmEmail ? user(body.email) : session(body.email))
    }
    if (url.pathname === '/auth/v1/recover') return json({})
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 })
    if (url.pathname.startsWith('/rest/v1/')) return json([])
    return json({}, 404)
  })
  return calls
}

async function signIn(page: Page, email: string, password = 'gizli123') {
  await page.getByLabel('E-posta').fill(email)
  await page.getByLabel('Şifre', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Giriş yap', exact: true }).last().click()
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Çıkış' }).first().click()
  await page.getByRole('dialog', { name: 'Çıkış yapılsın mı?' }).getByRole('button', { name: 'Çıkış yap' }).click()
  await expect(page.getByRole('heading', { name: 'Tekrar hoş geldiniz' })).toBeVisible()
}

test('giriş yapılmadan uygulama açılmaz; hatalı şifre, kayıt ve şifre sıfırlama', async ({ page }) => {
  const calls = await mockSupabase(page, { confirmEmail: true })
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Tekrar hoş geldiniz' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Google ile devam et' })).toHaveCount(0)

  await signIn(page, 'osman@ornek.com', 'yanlis1')
  await expect(page.getByRole('alert')).toHaveText('E-posta veya parola hatalı.')

  await page.getByRole('tab', { name: 'Kayıt ol' }).click()
  await page.getByLabel('Adınız').fill('Ayşe')
  await page.getByLabel('E-posta').fill('ayse@ornek.com')
  await page.getByLabel('Şifre', { exact: true }).fill('gizli123')
  await page.getByRole('button', { name: 'Kayıt ol', exact: true }).last().click()
  await expect(page.getByRole('status')).toContainText('ayse@ornek.com adresine gelen bağlantıya')
  expect(calls.some((c) => c.startsWith('POST /auth/v1/signup'))).toBe(true)

  await page.getByRole('button', { name: 'Şifremi unuttum' }).click()
  await page.getByLabel('E-posta').fill('ayse@ornek.com')
  await page.getByRole('button', { name: 'Bağlantı gönder' }).click()
  await expect(page.getByRole('status')).toContainText('Şifre yenileme bağlantısı gönderildi')
})

test('Google ile giriş düğmesi Supabase ayarı açıkken görünür', async ({ page }) => {
  await mockSupabase(page, { google: true })
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'Google ile devam et' })).toBeVisible()
})

test('her hesap kendi kayıtlarını görür; çıkış ve tekrar giriş', async ({ page }) => {
  await mockSupabase(page)
  await page.goto('./')
  await signIn(page, 'osman@ornek.com')
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await expect(page.getByText('osman@ornek.com')).toBeVisible()

  await page.getByRole('button', { name: 'Gider ekle' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Gider ekle' })
  await dialog.getByLabel('Tutar (TL)').fill('250')
  await dialog.getByLabel('Açıklama / iş yeri').fill('Osmanın marketi')
  await dialog.getByLabel('Kategori').selectOption({ label: 'Market' })
  await dialog.getByRole('button', { name: 'Kaydet', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('Osmanın marketi').filter({ visible: true }).first()).toBeVisible()

  // Hesaptaki ad üyeler sayfasına gelir
  await page.goto('./#/uyeler')
  await expect(page.getByLabel(/Adınız/)).toHaveValue('Osman')

  await signOut(page)
  await signIn(page, 'ayse@ornek.com')
  await expect(page.getByText('ayse@ornek.com')).toBeVisible()
  await page.goto('./#/islemler')
  await expect(page.getByText('Osmanın marketi').filter({ visible: true })).toHaveCount(0)

  await signOut(page)
  await signIn(page, 'osman@ornek.com')
  await page.goto('./#/islemler')
  await expect(page.getByText('Osmanın marketi').filter({ visible: true }).first()).toBeVisible()
})
