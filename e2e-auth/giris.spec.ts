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

const ADMIN_USERS = [
  { id: USERS['osman@ornek.com'].id, email: 'osman@ornek.com', full_name: 'Osman', provider: 'google', created_at: '2026-09-30T10:00:00Z', last_sign_in_at: new Date().toISOString(), email_confirmed_at: '2026-09-30T10:00:00Z', banned_until: null, is_admin: true, group_count: 1, shared_tx_count: 4 },
  { id: USERS['ayse@ornek.com'].id, email: 'ayse@ornek.com', full_name: 'Ayşe', provider: 'email', created_at: new Date().toISOString(), last_sign_in_at: null, email_confirmed_at: null, banned_until: null, is_admin: false, group_count: 1, shared_tx_count: 2 },
  { id: '33333333-3333-4333-8333-333333333333', email: 'eski@ornek.com', full_name: null, provider: 'email', created_at: '2026-01-01T00:00:00Z', last_sign_in_at: '2026-02-01T00:00:00Z', email_confirmed_at: '2026-01-01T00:00:00Z', banned_until: '2126-01-01T00:00:00Z', is_admin: false, group_count: 0, shared_tx_count: 0 },
]

/** Supabase kimlik ve veri API'sini taklit eder. */
async function mockSupabase(page: Page, opts: { google?: boolean; confirmEmail?: boolean; admin?: boolean; sharedGroup?: boolean } = {}) {
  const calls: string[] = []
  const bodies: Record<string, unknown> = {}
  let settlements: Record<string, unknown>[] = []
  const d = new Date()
  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
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
    if (url.pathname === '/rest/v1/rpc/ha_is_admin') return json(!!opts.admin)
    if (url.pathname === '/rest/v1/rpc/ha_delete_my_account') return route.fulfill({ status: 204 })
    if (url.pathname === '/rest/v1/rpc/ha_admin_list_users') return opts.admin ? json(ADMIN_USERS) : json({ message: 'Bu işlem için yönetici yetkisi gerekir' }, 400)
    if (url.pathname.startsWith('/rest/v1/rpc/ha_admin_')) return opts.admin ? route.fulfill({ status: 204 }) : json({ message: 'yetki yok' }, 400)
    if (opts.sharedGroup) {
      const osman = USERS['osman@ornek.com'].id
      const ayse = USERS['ayse@ornek.com'].id
      if (req.method() === 'POST') bodies[url.pathname] = req.postDataJSON()
      if (url.pathname === '/rest/v1/ha_groups') return json([{ id: 'bulut-ortak', name: 'Ortak', color: '#059669', owner_id: osman, cycle_start_day: null }])
      if (url.pathname === '/rest/v1/ha_group_members')
        return json([
          { group_id: 'bulut-ortak', user_id: osman, display_name: 'Osman', color: '#0f766e' },
          { group_id: 'bulut-ortak', user_id: ayse, display_name: 'Ayşe', color: '#7c3aed' },
        ])
      if (url.pathname === '/rest/v1/ha_transactions')
        return json(
          url.searchParams.has('updated_at')
            ? []
            : [{ id: 'tx-ayse', group_id: 'bulut-ortak', user_id: ayse, date: `${ym}-01`, amount_kurus: 20000, type: 'expense', description: 'Ayşe Fatura', category_name: 'Faturalar', category_icon: 'receipt', category_color: '#0891b2', note: null, installment: null, deleted: false, updated_at: '2026-10-01T10:00:00Z' }],
        )
      if (url.pathname === '/rest/v1/ha_settlements') return json(settlements)
      if (url.pathname === '/rest/v1/rpc/ha_settle_period') {
        const b = req.postDataJSON() as { p_group: string; p_start: string; p_end: string; p_total: number; p_shares: Record<string, number> }
        settlements = [{ group_id: b.p_group, period_start: b.p_start, period_end: b.p_end, total_kurus: b.p_total, shares: b.p_shares, created_by: osman, created_at: new Date().toISOString() }]
        return route.fulfill({ status: 204 })
      }
      if (url.pathname === '/rest/v1/rpc/ha_unsettle_period') {
        settlements = []
        return route.fulfill({ status: 204 })
      }
    }
    if (url.pathname.startsWith('/rest/v1/')) return json([])
    return json({}, 404)
  })
  return Object.assign(calls, { bodies })
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
  const calls = await mockSupabase(page, { google: true })
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'Google ile devam et' })).toBeVisible()
  // Her seferinde Google hesap seçimi istenir
  await page.getByRole('button', { name: 'Google ile devam et' }).click()
  await expect.poll(() => calls.find((c) => c.includes('/auth/v1/authorize'))).toMatch(/provider=google.*prompt=select_account/)
})

test('her hesap kendi kayıtlarını görür; çıkış ve tekrar giriş', async ({ page }) => {
  const calls = await mockSupabase(page)
  await page.goto('./')
  await signIn(page, 'osman@ornek.com')
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  // Bu cihazda bağlı grup olmasa da girişten sonra eşitlenir (hesabın grupları kendiliğinden bağlanır)
  await expect.poll(() => calls.some((c) => c.startsWith('GET /rest/v1/ha_groups'))).toBe(true)
  await expect(page.getByText('osman@ornek.com').filter({ visible: true }).first()).toBeVisible()

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
  await expect(page.getByText('ayse@ornek.com').filter({ visible: true }).first()).toBeVisible()
  await page.goto('./#/islemler')
  await expect(page.getByText('Osmanın marketi').filter({ visible: true })).toHaveCount(0)

  await signOut(page)
  await signIn(page, 'osman@ornek.com')
  await page.goto('./#/islemler')
  await expect(page.getByText('Osmanın marketi').filter({ visible: true }).first()).toBeVisible()
})

test('yönetici paneli yalnızca yöneticiye görünür; kullanıcılar listelenir ve hesap işlemleri yapılır', async ({ page }) => {
  await mockSupabase(page)
  await page.goto('./')
  await signIn(page, 'ayse@ornek.com')
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Yönetici paneli' })).toHaveCount(0)
  await page.goto('./#/yonetim')
  await expect(page.getByText('Bu sayfa yalnızca yöneticiye açık')).toBeVisible()
  await signOut(page)

  await page.unrouteAll({ behavior: 'ignoreErrors' })
  const calls = await mockSupabase(page, { admin: true })
  await signIn(page, 'osman@ornek.com')
  await page.getByRole('link', { name: 'Yönetici paneli' }).click()
  await expect(page.getByRole('heading', { name: 'Yönetici paneli', level: 1 })).toBeVisible()
  const list = page.getByRole('list', { name: 'Kullanıcılar' })
  await expect(list.getByRole('listitem')).toHaveCount(3)
  await expect(page.getByText('Toplam hesap').locator('xpath=ancestor::section[1]')).toContainText('3')

  await page.getByRole('radio', { name: 'Dondurulmuş' }).click()
  await expect(list.getByRole('listitem')).toHaveCount(1)
  await page.getByRole('radio', { name: 'Tümü' }).click()
  await page.getByLabel('Ad veya e-postada ara').fill('ayşe')
  await expect(list.getByRole('listitem')).toHaveCount(1)

  await list.getByRole('button', { name: 'Ayşe ayrıntıları' }).click()
  const modal = page.getByRole('dialog', { name: 'Ayşe' })
  await modal.getByRole('button', { name: 'Şifre yenileme e-postası' }).click()
  await page.getByRole('dialog', { name: 'Şifre yenileme e-postası gönderilsin mi?' }).getByRole('button', { name: 'Gönder' }).click()
  await expect(page.getByText('ayse@ornek.com adresine şifre yenileme bağlantısı gönderildi.')).toBeVisible()
  expect(calls.some((c) => c.startsWith('POST /auth/v1/recover'))).toBe(true)

  await list.getByRole('button', { name: 'Ayşe ayrıntıları' }).click()
  await page.getByRole('dialog', { name: 'Ayşe' }).getByRole('button', { name: 'Hesabı dondur' }).click()
  await page.getByRole('dialog', { name: 'Hesap dondurulsun mu?' }).getByRole('button', { name: 'Dondur' }).click()
  await expect(page.getByText('Hesap donduruldu; oturumları kapatıldı.')).toBeVisible()
  expect(calls.some((c) => c.startsWith('POST /rest/v1/rpc/ha_admin_set_banned'))).toBe(true)

  // Kendi hesabı dondurulamaz/silinemez
  await page.getByLabel('Ad veya e-postada ara').fill('osman')
  await list.getByRole('button', { name: 'Osman ayrıntıları' }).click()
  await expect(page.getByRole('dialog', { name: 'Osman' }).getByRole('button', { name: 'Hesabı sil' })).toBeDisabled()
})

test('ortak grubun yöneticisi gideri paylaştırır ve geri alır; Tümü toplamına alacak satırı eklenir', async ({ page }) => {
  const calls = await mockSupabase(page, { sharedGroup: true })
  await page.goto('./')
  await signIn(page, 'osman@ornek.com')
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await expect.poll(() => calls.some((c) => c.startsWith('GET /rest/v1/ha_settlements'))).toBe(true)

  await page.getByRole('button', { name: 'Gider ekle' }).first().click()
  const form = page.getByRole('dialog', { name: 'Gider ekle' })
  await form.getByLabel('Tutar (TL)').fill('300')
  await form.getByLabel('Açıklama / iş yeri').fill('Ortak Market')
  await form.getByLabel('Kategori').selectOption({ label: 'Market' })
  await form.getByRole('radiogroup', { name: 'Harcama grubu' }).getByRole('radio', { name: 'Ortak' }).click()
  await form.getByRole('button', { name: 'Kaydet', exact: true }).click()
  await expect(form).toBeHidden()

  const hero = page.locator('section[aria-labelledby="net-title"]')
  await expect(hero).toContainText('300,00')
  await page.getByRole('radiogroup', { name: 'Grup filtresi' }).getByRole('radio', { name: 'Ortak' }).click()
  await expect(hero).toContainText('500,00')
  await page.getByRole('button', { name: 'Gideri paylaştır' }).click()
  const split = page.getByRole('dialog', { name: 'Gideri paylaştır' })
  await split.getByRole('button', { name: 'Gideri paylaştır' }).click()
  await expect(split).toContainText('Bu dönem paylaştırıldı')
  await expect(split).toContainText('payınız 250,00 ₺')
  expect(calls.bodies['/rest/v1/rpc/ha_settle_period']).toMatchObject({
    p_group: 'bulut-ortak',
    p_total: 50000,
    p_shares: { [USERS['osman@ornek.com'].id]: 25000, [USERS['ayse@ornek.com'].id]: 25000 },
  })
  await page.keyboard.press('Escape')

  // Tümü: kendi 300 ₺ gideriniz yerinde kalır, 50 ₺ alacak eklenir → 250
  await page.getByRole('radiogroup', { name: 'Grup filtresi' }).getByRole('radio', { name: 'Tümü' }).click()
  await expect(hero).toContainText('250,00')
  await expect(page.getByText('Ortak paylaşımı · alacak').filter({ visible: true }).first()).toBeVisible()
  await expect(page.getByRole('region', { name: 'Ortak grupların dönemi' })).toContainText('Ortak giderini paylaştırdınız')

  // Geri alınınca Tümü yine kendi eklediğiniz tutarı sayar
  await page.getByRole('radiogroup', { name: 'Grup filtresi' }).getByRole('radio', { name: 'Ortak' }).click()
  await page.getByRole('button', { name: 'Paylaşımı yönet' }).click()
  await split.getByRole('button', { name: 'Paylaşımı geri al' }).click()
  await split.getByRole('button', { name: 'Evet, geri al' }).click()
  await expect(split).toContainText('Bu dönem henüz paylaştırılmadı')
  await page.keyboard.press('Escape')
  await page.getByRole('radiogroup', { name: 'Grup filtresi' }).getByRole('radio', { name: 'Tümü' }).click()
  await expect(hero).toContainText('300,00')
})

test('Ayarlar: hesabımı sil, hesabı ve bu cihazdaki kayıtları siler', async ({ page }) => {
  const calls = await mockSupabase(page)
  await page.goto('./')
  await signIn(page, 'osman@ornek.com')
  await page.getByRole('button', { name: 'Gider ekle' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Gider ekle' })
  await dialog.getByLabel('Tutar (TL)').fill('99')
  await dialog.getByLabel('Açıklama / iş yeri').fill('Silinecek kayıt')
  await dialog.getByLabel('Kategori').selectOption({ label: 'Market' })
  await dialog.getByRole('button', { name: 'Kaydet', exact: true }).click()
  await expect(dialog).toBeHidden()

  await page.goto('./#/ayarlar')
  await expect(page.getByRole('link', { name: 'Gizlilik politikasının tamamı' })).toHaveAttribute('href', /gizlilik\.html$/)
  await page.getByRole('button', { name: 'Hesabımı sil' }).click()
  const confirm = page.getByRole('dialog', { name: 'Hesabınız silinsin mi?' })
  const go = confirm.getByRole('button', { name: 'Hesabımı kalıcı olarak sil' })
  await expect(go).toBeDisabled()
  await confirm.getByLabel('Onay').fill('sil')
  await go.click()
  await expect(page.getByRole('heading', { name: 'Tekrar hoş geldiniz' })).toBeVisible()
  expect(calls).toContain('POST /rest/v1/rpc/ha_delete_my_account')
  await expect(page.getByRole('link', { name: 'Gizlilik politikası' })).toBeVisible()

  await signIn(page, 'osman@ornek.com')
  await page.goto('./#/islemler')
  await expect(page.getByText('Silinecek kayıt').filter({ visible: true })).toHaveCount(0)
})
