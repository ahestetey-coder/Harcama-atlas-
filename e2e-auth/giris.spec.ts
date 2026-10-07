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

const CLEAN_CHECKS = { ok: true, checkedAt: '2026-10-07T04:00:00Z', issues: [], counts: { kaynaksiz: 0, eskiVeri: 0, kaynaksizRakam: 0, yonlendirme: 0, kaynakSayisi: 2 } }
const sec = (text: string, refs: number[]) => ({ text, refs })
const TOPIC = {
  title: 'Politika faizi sabit kaldı',
  eventKey: 'e1',
  sections: {
    ne_oldu: sec('Merkez bankası politika faizini yüzde 40 seviyesinde sabit tuttu.', [1]),
    neden_onemli: sec('Kredi kartı ve kredi faizleri bu karara bağlı olarak değişebilir.', [1]),
    uzmanlar: sec('Örnek Ekonomist kişisel görüşünde gevşemenin gecikebileceğini düşünüyor.', [2]),
    degerlendirme: sec('Karar sıkı duruşun sürdüğünü gösteriyor olabilir.', [1, 2]),
    senaryolar: sec('Enflasyon yavaşlarsa indirim gündeme gelebilir; yavaşlamazsa faiz yüksek kalabilir.', []),
    sonraki_isaret: sec('Bir sonraki karar takvimdeki toplantıda açıklanacak.', []),
  },
  sources: [
    { n: 1, itemId: 'i1', title: 'Faiz Oranlarına İlişkin Basın Duyurusu', url: 'https://ornek-merkez.test/duyuru/1', author: null, institution: 'Örnek Merkez Bankası', publishedAt: '2026-10-06T11:00:00Z', period: null, type: 'resmi_veri' },
    { n: 2, itemId: 'i2', title: 'Faiz kararı üzerine', url: 'https://x.com/ornekekonomist/status/1', author: 'Örnek Ekonomist', institution: '@ornekekonomist', publishedAt: '2026-10-06T12:00:00Z', period: null, type: 'uzman_yorumu', personal: true },
  ],
}
const REPORT = { id: 'r1', kind: 'gunluk', title: 'Günlük ekonomi raporu · 7 Ekim 2026', window_start: '2026-10-06T04:00:00Z', window_end: new Date().toISOString(), status: 'yayinda', topics: [TOPIC], checks: CLEAN_CHECKS, version: 1, created_by: 'otomatik', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), published_at: new Date().toISOString(), status_note: null }
const DRAFT = { ...REPORT, id: 'r2', title: 'Haftalık ekonomi raporu · taslak', kind: 'haftalik', status: 'taslak', published_at: null, checks: { ...CLEAN_CHECKS, ok: false, issues: [{ topic: 0, section: 'degerlendirme', kind: 'kaynaksiz-rakam', detail: 'Kaynakta bulunmayan rakam: 35' }] } }
const SOURCES = [
  { id: 's1', kind: 'rss', value: 'https://ornek-merkez.test/rss', label: 'Örnek Merkez Bankası', active: true, grp: 'tr_resmi', default_type: 'resmi_veri', terms_status: 'izinli', terms_url: null, terms_note: null, terms_checked_at: null, poll_minutes: 60, expert_id: null, last_checked_at: new Date().toISOString(), last_ok_at: new Date().toISOString(), last_error: null, last_error_at: null, last_item_at: '2026-10-06T11:00:00Z', items_total: 12 },
  { id: 's2', kind: 'x', value: 'ornekekonomist', label: null, active: true, grp: 'haber_uzman', default_type: 'uzman_yorumu', terms_status: 'izinli', terms_url: null, terms_note: null, terms_checked_at: null, poll_minutes: 120, expert_id: 'e1', last_checked_at: new Date().toISOString(), last_ok_at: null, last_error: 'X erişim anahtarı (X_BEARER_TOKEN) tanımlı değil', last_error_at: new Date().toISOString(), last_item_at: null, items_total: 0 },
  { id: 's3', kind: 'tcmb_kur', value: 'https://www.tcmb.gov.tr/kurlar/today.xml', label: 'TCMB gösterge kurları', active: false, grp: 'piyasa', default_type: 'resmi_veri', terms_status: 'inceleniyor', terms_url: null, terms_note: null, terms_checked_at: null, poll_minutes: 120, expert_id: null, last_checked_at: null, last_ok_at: null, last_error: null, last_error_at: null, last_item_at: null, items_total: 0 },
]

/** Supabase kimlik ve veri API'sini taklit eder. */
async function mockSupabase(page: Page, opts: { google?: boolean; confirmEmail?: boolean; admin?: boolean; sharedGroup?: boolean } = {}) {
  const calls: string[] = []
  const bodies: Record<string, unknown> = {}
  let settlements: Record<string, unknown>[] = []
  let payments: Record<string, unknown>[] = []
  let budget: number | null = null
  const plans: Record<string, string> = {}
  let current = ''
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
      current = USERS[body.email].id
      return json(session(body.email))
    }
    if (url.pathname === '/auth/v1/signup') {
      const body = req.postDataJSON() as { email: string }
      return json(opts.confirmEmail ? user(body.email) : session(body.email))
    }
    if (url.pathname === '/auth/v1/recover') return json({})
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 })
    if (url.pathname === '/rest/v1/rpc/ha_is_admin') return json(!!opts.admin)
    if (url.pathname === '/rest/v1/rpc/ha_my_plan') return json(plans[current] ?? 'free')
    if (url.pathname === '/rest/v1/ha_user_plans') return json(Object.entries(plans).map(([user_id, plan]) => ({ user_id, plan, expires_at: null })))
    if (url.pathname === '/rest/v1/rpc/ha_admin_set_plan' && opts.admin) {
      const b = req.postDataJSON() as { p_user: string; p_plan: string }
      if (b.p_plan === 'free') delete plans[b.p_user]
      else plans[b.p_user] = b.p_plan
      return route.fulfill({ status: 204 })
    }
    if (url.pathname === '/functions/v1/coach-chat') {
      bodies.chat = req.postDataJSON()
      return json({ reply: 'Önce kredi kartı borcunu kapatalım; ardından ayda ayırdığınız tutarı birikime ayırırsınız.', remaining: 29 })
    }
    if (url.pathname === '/functions/v1/research-report' || url.pathname === '/functions/v1/research-collect' || url.pathname === '/functions/v1/coach-eval') {
      bodies[url.pathname] = req.postDataJSON()
      return json({ ok: true, checks: CLEAN_CHECKS, version: 2, kontrol: 1, yeni: 0, hata: 0 })
    }
    if (url.pathname === '/rest/v1/ha_reports') return json(url.searchParams.get('status') === 'eq.yayinda' ? [REPORT] : opts.admin ? [DRAFT, REPORT] : [])
    if (url.pathname === '/rest/v1/ha_report_revisions') return json([{ id: 'v1', version: 1, edited_by: null, edited_at: '2026-10-07T04:00:00Z', note: 'Otomatik taslak', after_publish: false, checks: DRAFT.checks }])
    if (url.pathname === '/rest/v1/ha_news_sources') return json(opts.admin ? SOURCES : [])
    if (url.pathname === '/rest/v1/ha_experts') return json(opts.admin ? [{ id: 'e1', name: 'Örnek Ekonomist', title: 'Profesör', institution: 'Örnek Üniversite', area: 'tr_makro', speaks_for: 'kisisel', profile_url: null, note: null, active: true }] : [])
    if (url.pathname === '/rest/v1/ha_agent_settings') return json({ collect_daily_max: 2000, market_daily_max: 50, ai_research_monthly_tokens: 3000000, ai_coach_monthly_tokens: 5000000, coach_daily_limit: 30 })
    if (url.pathname === '/rest/v1/rpc/ha_admin_research_metrics')
      return json({ taslak: 4, yayinlanan: 3, kaynaksizIddia: 2, kaynaksizRakam: 1, eskiVeri: 1, kaynakSayisi: 40, raporYonlendirme: 0, yakalamaDakikaMedyan: 12.5, duzeltilenRapor: 1, kocYenidenYazildi: 2, kocEngellendi: 0, sonKocTesti: { started_at: '2026-10-06T10:00:00Z', ok: true, stats: { vaka: 10, ilkYanittaYonlendirme: 1, kullaniciyaGidenYonlendirme: 0 } }, sonToplama: null, bugun: { collect: 120 }, buAy: { ai_coach: 25000 } })
    if (url.pathname === '/rest/v1/rpc/ha_admin_report_publish') {
      calls.push('YAYIN')
      return route.fulfill({ status: 204 })
    }
    if (url.pathname === '/rest/v1/rpc/ha_delete_my_account') return route.fulfill({ status: 204 })
    if (url.pathname === '/rest/v1/rpc/ha_admin_list_users') return opts.admin ? json(ADMIN_USERS) : json({ message: 'Bu işlem için yönetici yetkisi gerekir' }, 400)
    if (url.pathname.startsWith('/rest/v1/rpc/ha_admin_')) return opts.admin ? route.fulfill({ status: 204 }) : json({ message: 'yetki yok' }, 400)
    if (opts.sharedGroup) {
      const osman = USERS['osman@ornek.com'].id
      const ayse = USERS['ayse@ornek.com'].id
      if (req.method() === 'POST') bodies[url.pathname] = req.postDataJSON()
      if (url.pathname === '/rest/v1/ha_groups') return json([{ id: 'bulut-ortak', name: 'Ortak', color: '#059669', owner_id: osman, cycle_start_day: null, budget_kurus: budget }])
      if (url.pathname === '/rest/v1/ha_settlement_payments') return json(payments)
      if (url.pathname === '/rest/v1/rpc/ha_set_group_budget') {
        budget = (req.postDataJSON() as { p_budget: number | null }).p_budget
        return route.fulfill({ status: 204 })
      }
      if (url.pathname === '/rest/v1/rpc/ha_mark_payment') {
        const b = req.postDataJSON() as { p_group: string; p_start: string; p_from: string; p_to: string; p_amount: number; p_paid: boolean }
        payments = payments.filter((p) => !(p.from_user === b.p_from && p.to_user === b.p_to))
        if (b.p_paid) payments.push({ group_id: b.p_group, period_start: b.p_start, from_user: b.p_from, to_user: b.p_to, amount_kurus: b.p_amount, marked_by: osman, marked_at: new Date().toISOString() })
        return route.fulfill({ status: 204 })
      }
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
  const me = page.getByRole('dialog', { name: 'Osman' })
  await expect(me.getByRole('button', { name: 'Hesabı sil' })).toBeDisabled()

  // Paket tanımlama: yönetici kendine Plus+ verir; yenileyince hesabın paketi olur
  await me.getByLabel('Paket', { exact: true }).selectOption('plusplus')
  await me.getByRole('button', { name: 'Paketi kaydet' }).click()
  await expect(page.getByText('Plus+ tanımlandı.', { exact: false })).toBeVisible()
  await expect(me).toContainText('Plus+')
  await page.keyboard.press('Escape')
  await expect(list.getByRole('button', { name: 'Osman ayrıntıları' })).toContainText('Plus+')
  await page.goto('./#/paketler')
  await page.reload()
  await expect(page.getByText('Kullandığınız paket')).toBeVisible()
  await page.goto('./#/koc')
  await expect(page.getByRole('region', { name: 'Koç mesajları' })).toBeVisible()
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

test('Plus gelişmiş paylaşım: yüzdeyle paylaştırma, ödeme durumu ve grup bütçesi', async ({ page }) => {
  const calls = await mockSupabase(page, { sharedGroup: true, admin: true })
  await page.goto('./')
  await signIn(page, 'osman@ornek.com')
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await expect.poll(() => calls.some((c) => c.startsWith('GET /rest/v1/ha_settlements'))).toBe(true)
  const osman = USERS['osman@ornek.com'].id
  const ayse = USERS['ayse@ornek.com'].id

  // Plus kapalıyken yalnızca eşit paylaşım ve tanıtım görünür
  await page.getByRole('radiogroup', { name: 'Grup filtresi' }).getByRole('radio', { name: 'Ortak' }).click()
  await page.getByRole('button', { name: 'Gideri paylaştır' }).click()
  let split = page.getByRole('dialog', { name: 'Gideri paylaştır' })
  await expect(split).toContainText('Plus pakette')
  await page.keyboard.press('Escape')

  // Yönetici Plus önizlemesini açar
  await page.goto('./#/paketler')
  await page.getByRole('radiogroup', { name: 'Önizleme paketi' }).getByRole('radio', { name: 'Plus', exact: true }).click()
  await page.goto('./#/')

  // Grup bütçesi
  const card = page.getByRole('region', { name: 'Grup bütçesi' })
  await expect(card).toContainText('Ortak bütçesi')
  await card.getByRole('button', { name: 'Belirle' }).click()
  const bd = page.getByRole('dialog', { name: 'Ortak bütçesi' })
  await bd.getByLabel('Tutar (TL)').fill('1.000')
  await bd.getByRole('button', { name: 'Kaydet' }).click()
  await expect(bd).toBeHidden()
  expect(calls.bodies['/rest/v1/rpc/ha_set_group_budget']).toMatchObject({ p_group: 'bulut-ortak', p_budget: 100000 })
  await expect(card).toContainText('800,00 ₺ kaldı')

  // Yüzdeyle paylaştır: Osman %60, Ayşe %40 (toplam 200 ₺, hepsini Ayşe ödedi)
  await page.getByRole('button', { name: 'Gideri paylaştır' }).click()
  split = page.getByRole('dialog', { name: 'Gideri paylaştır' })
  await split.getByRole('radiogroup', { name: 'Paylaşım yöntemi' }).getByRole('radio', { name: 'Yüzde' }).click()
  await split.getByLabel('Siz yüzde').fill('70')
  await expect(split.getByRole('alert')).toContainText('100 olmalı')
  await expect(split.getByRole('button', { name: 'Gideri paylaştır' })).toBeDisabled()
  await split.getByLabel('Siz yüzde').fill('60')
  await split.getByLabel('Ayşe yüzde').fill('40')
  await split.getByRole('button', { name: 'Gideri paylaştır' }).click()
  await expect(split).toContainText('Bu dönem paylaştırıldı')
  expect(calls.bodies['/rest/v1/rpc/ha_settle_period']).toMatchObject({ p_total: 20000, p_shares: { [osman]: 12000, [ayse]: 8000 } })
  const transfer = split.getByRole('list', { name: 'Yapılacak ödemeler' }).getByRole('listitem')
  await expect(transfer).toContainText('120,00 ₺')
  await expect(transfer).toContainText('Ödenmedi')
  await transfer.getByRole('button', { name: 'Ödendi işaretle' }).click()
  await expect(transfer).toContainText('Ödendi ·')
  expect(calls.bodies['/rest/v1/rpc/ha_mark_payment']).toMatchObject({ p_from: osman, p_to: ayse, p_amount: 12000, p_paid: true })

  // Yalnızca seçili üyeler: Ayşe katılmazsa bütün gider Osman'a düşer
  await split.getByRole('radiogroup', { name: 'Paylaşım yöntemi' }).getByRole('radio', { name: 'Eşit' }).click()
  await split.getByLabel('Ayşe paylaşıma katılsın').uncheck()
  await expect(split).toContainText('paylaşıma katılmıyor')
  await split.getByRole('button', { name: 'Paylaşımı güncelle' }).click()
  await expect.poll(() => (calls.bodies['/rest/v1/rpc/ha_settle_period'] as { p_shares: Record<string, number> }).p_shares).toEqual({ [osman]: 20000, [ayse]: 0 })
  // Paylaşım değişince eski ödeme işareti tutarı farklı olduğu için belirtilir
  await expect(split).toContainText('Bu dönem paylaştırıldı')
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

test('Plus+ koç ve araştırma: rapor kaynaklı görünür, hafıza düzenlenir, kapatılan bilgi gönderilmez; yönetici taslağı denetler', async ({ page }) => {
  const calls = await mockSupabase(page, { admin: true })
  await page.goto('./')
  await signIn(page, 'osman@ornek.com')
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await page.goto('./#/paketler')
  await page.getByRole('radiogroup', { name: 'Önizleme paketi' }).getByRole('radio', { name: 'Plus+', exact: true }).click()

  await page.goto('./#/yolculuk')
  await page.getByLabel(/Hedefte aylık yaşam gideri/).fill('25.000')
  await page.getByLabel(/Aylık net gelir/).fill('50.000')
  await page.getByLabel(/Zorunlu aylık giderler/).fill('20.000')
  await page.getByRole('button', { name: 'Doğruladım, rotamı oluştur' }).click()
  await expect(page.getByRole('region', { name: 'Finansal güvence' })).toBeVisible()

  await page.goto('./#/koc')
  const chat = page.getByRole('region', { name: 'Koç mesajları' })
  // Ortak rapor: konu, içerik türü ve tamamına bağlantı
  await expect(chat).toContainText('Günlük ekonomi raporu')
  await expect(chat).toContainText('Politika faizi sabit kaldı')
  await expect(chat).toContainText('Resmî veri')
  await expect(chat.getByRole('link', { name: /Raporun tamamı/ })).toBeVisible()

  // Hafıza: not eklenir, düzeltilir; kapatılan bilgi gönderilmez
  const memory = page.getByRole('region', { name: 'Koçun hafızası' })
  await memory.getByLabel('Hafızaya not ekle').fill('İki yıl içinde ev peşinatı biriktirmek istiyorum')
  await memory.getByRole('button', { name: 'Ekle' }).click()
  await expect(memory.getByRole('list', { name: 'Hafıza notları' })).toContainText('ev peşinatı')
  await memory.getByRole('button', { name: 'Notu düzelt' }).click()
  await memory.getByLabel('Notu düzelt').fill('Üç yıl içinde ev peşinatı biriktirmek istiyorum')
  await memory.getByRole('button', { name: 'Kaydet' }).click()
  await expect(memory).toContainText('Üç yıl içinde')
  await memory.getByRole('switch', { name: 'Borçlar koça gönderilsin' }).click()

  // İzin yokken serbest soru kapalı
  const input = chat.getByLabel('Koça yazın')
  await expect(input).toBeDisabled()
  await page.getByRole('region', { name: 'Yapay zekâ sohbeti' }).getByRole('switch').click()
  await expect(input).toBeEnabled()
  await input.fill('Borcumu mu kapatayım birikim mi yapayım?')
  await chat.getByRole('button', { name: 'Gönder' }).click()
  await expect(chat).toContainText('Önce kredi kartı borcunu kapatalım')
  await expect(chat).toContainText('Bugün 29 soru hakkınız kaldı')
  const sent = JSON.stringify(calls.bodies.chat)
  expect(sent).toContain('aylikGelir')
  expect(sent).toContain('50000')
  expect(sent).toContain('Üç yıl içinde ev peşinatı')
  expect(sent).not.toContain('borclar')
  expect(sent).not.toContain('osman@ornek.com')
  await chat.getByRole('button', { name: 'Sohbeti sil' }).click()
  await expect(chat).not.toContainText('Önce kredi kartı borcunu kapatalım')
  await memory.getByRole('button', { name: 'Notu sil' }).click()
  await expect(memory).toContainText('Henüz not yok')

  // Finansal bilgi: 7 bölüm ve kaynaklar
  await page.goto('./#/ogren')
  const agenda = page.getByRole('region', { name: 'Ekonomi gündemi' })
  await expect(agenda).toContainText('Ortak araştırma değerlendirmesi')
  await expect(agenda).toContainText('Kişisel görüş')
  await expect(agenda.getByRole('link', { name: /Faiz Oranlarına İlişkin/ })).toHaveAttribute('href', 'https://ornek-merkez.test/duyuru/1')

  // Yönetici: araştırma ajanı
  await page.goto('./#/yonetim')
  await page.getByRole('link', { name: /Araştırma ajanını yönet/ }).click()
  await expect(page.getByRole('heading', { name: 'Araştırma ajanı', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: /Haftalık ekonomi raporu · taslak/ }).click()
  const editor = page.getByRole('dialog')
  await expect(editor).toContainText('Kaynakta bulunmayan rakam: 35')
  await expect(editor.getByRole('button', { name: 'Onayla ve yayınla' })).toBeDisabled()
  await editor.getByLabel('Konu 1 başlığı').fill('Faiz kararı')
  await editor.getByRole('button', { name: 'Kaydet ve denetle' }).click()
  await expect.poll(() => JSON.stringify(calls.bodies['/functions/v1/research-report'])).toContain('Faiz kararı')
  await expect(page.getByText('Kaydedildi ve yeniden denetlendi.')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(editor).toBeHidden()

  await page.getByRole('radio', { name: 'Kaynaklar' }).click()
  await expect(page.getByText('Örnek Merkez Bankası').first()).toBeVisible()
  await expect(page.getByText('Sağlıklı')).toBeVisible()
  await expect(page.getByText(/X_BEARER_TOKEN/)).toBeVisible()
  await expect(page.getByText('Koşullar inceleniyor').first()).toBeVisible()

  await page.getByRole('radio', { name: 'Ölçümler' }).click()
  await expect(page.getByText('Kaynaksız iddia')).toBeVisible()
  await expect(page.getByText('12,5 dk')).toBeVisible()
  await expect(page.getByText('Geçti')).toBeVisible()
})
