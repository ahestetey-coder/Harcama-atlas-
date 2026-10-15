import { expect, test } from '@playwright/test'

/** Girişsiz web testini (#/harita) baştan sona çözer ve sonuç ekranına gelir. */
async function solveWebTest(page: import('@playwright/test').Page) {
  await page.goto('./#/harita')
  await expect(page.getByRole('heading', { name: 'Finansal özgürlüğüne ne kadar uzaksın?' })).toBeVisible()
  // Uygulama kabuğu ve giriş yok
  await expect(page.getByRole('navigation', { name: /Ana menü|Alt menü/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Özgürlük rotamı çıkar' }).click()

  await page.getByRole('button', { name: 'Çalışmasam da geçinebilmek' }).click()
  await expect(page.getByRole('heading', { name: 'Ayda ne kadar pasif gelir seni özgür hissettirir?' })).toBeVisible()
  await page.getByRole('button', { name: 'Devam' }).click()
  // Ara durak 1
  await expect(page.getByRole('heading', { name: 'Zirven belirdi.' })).toBeVisible()
  await page.getByRole('button', { name: 'Konumumu bul' }).click()

  await page.getByRole('button', { name: '50.000 – 100.000 TL' }).click()
  await page.getByRole('button', { name: "Gelirimin %10–20'si" }).click()
  await page.getByRole('button', { name: 'Kredi taksitlerim var, rahat ödüyorum' }).click()
  await page.getByRole('button', { name: '1 – 3 ay' }).click()
  // Ara durak 2: cevaplara göre ipucu
  await expect(page.getByRole('heading', { name: 'Yarıyı geçtin.' })).toBeVisible()
  await expect(page.getByText('İlk ipucun: İyi bir tempon var.')).toBeVisible()
  await page.getByRole('button', { name: 'Son 4 soru' }).click()

  await page.getByRole('button', { name: '100.000 – 500.000 TL' }).click()
  await page.getByRole('button', { name: 'Altın' }).click()
  await page.getByRole('button', { name: 'Devam' }).click()
  await page.getByRole('button', { name: 'Ara sıra, para artarsa' }).click()
  await page.getByRole('button', { name: 'Sakin kalıp beklerim' }).click()

  // İletişim izni: KVKK onayı olmadan sonuç açılmaz
  await expect(page.getByRole('heading', { name: 'Haritan hazır, ama henüz sisli.' })).toBeVisible()
  await expect(page.getByText('Arketipin Dengeli Yolcu')).toBeVisible()
  await page.getByLabel('Adın').fill('Osman Deneme')
  await page.getByLabel('E-posta adresin').fill('osman@ornek.com')
  await page.getByRole('button', { name: 'Haritamı aç' }).click()
  await expect(page.getByRole('alert')).toContainText('KVKK')
  await page.getByText(/KVKK kapsamında işlenmesini kabul ediyorum/).click()
  await page.getByRole('button', { name: 'Haritamı aç' }).click()
}

test('web testi: girişsiz çözülür, sonuç uygulamanın rota motoruyla hesaplanır ve simülatör çalışır', async ({ page }) => {
  await solveWebTest(page)
  await expect(page.getByRole('heading', { name: 'Dengeli Yolcu' })).toBeVisible()
  await expect(page.getByText(/Osman, haritan açıldı/)).toBeVisible()
  await expect(page.getByText('Özgürlük yılın')).toBeVisible()
  await expect(page.getByRole('heading', { name: /Rotanın 8 durağı/ })).toBeVisible()
  // Simülatör: ek birikim varış yılını öne çeker
  await expect(page.getByRole('heading', { name: 'Geleceğini şimdi değiştir' })).toBeVisible()
  await expect(page.getByText(/erken\./)).toBeVisible()
  // Devam bağlantısı kodu taşır
  const cont = page.getByRole('link', { name: "Web'de devam et" })
  await expect(cont).toHaveAttribute('href', /#\/yolculuk\?kod=ATL-[A-HJ-NP-Z2-9]{6}$/)
})

async function refine(page: import('@playwright/test').Page) {
  const card = page.getByRole('region', { name: 'Web testindeki haritan' })
  await expect(card).toContainText('Dengeli Yolcu')
  await card.getByRole('button', { name: /Rotamı netleştir/ }).click()
  const t = page.getByRole('region', { name: 'Finansal özgürlük testi' })
  await expect(t).toContainText('Web testindeki cevaplarınla dolduruldu')
  await t.getByLabel('Yaşınız').fill('34')
  await t.getByRole('button', { name: 'İleri' }).click()
  await expect(t.getByText('Web testinden · tahmini')).toBeVisible()
  await expect(t.getByLabel(/Aylık net gelir/)).toHaveValue('75.000,00')
  await t.getByLabel(/Aylık net gelir/).fill('82.000')
  for (let i = 0; i < 6; i++) await t.getByRole('button', { name: 'İleri' }).click()
  await t.getByRole('button', { name: /Testi tamamla/ }).click()
  await expect(t).toBeHidden()
  await expect(card).toHaveCount(0)
}

async function setPlan(page: import('@playwright/test').Page, plan: 'Plus' | 'Plus+') {
  await page.goto('./#/paketler')
  await page.getByRole('radiogroup', { name: 'Önizleme paketi' }).getByRole('radio', { name: plan, exact: true }).click()
  await page.goto('./#/yolculuk')
}

test('web testinden uygulamaya: paketsiz kişi Paketler’e, Plus netleştirip özetini görür', async ({ page }) => {
  await solveWebTest(page)
  await page.getByRole('link', { name: "Web'de devam et" }).click()
  // Ücretsiz pakette web sonucu görünür, netleştirme Plus ister ve Paketler'e gider
  await expect(page.getByRole('region', { name: 'Web testindeki haritan' })).toBeVisible()
  await page.getByRole('link', { name: 'Plus ile rotamı netleştir' }).click()
  await expect(page).toHaveURL(/#\/paketler/)

  await setPlan(page, 'Plus')
  await refine(page)
  // Plus: netleşen rota özeti; tam panel ve koç Plus+ tanıtımıyla kilitli
  const sum = page.getByRole('region', { name: 'Netleşen rotan' })
  await expect(sum).toContainText('Gerçek rakamlarınla')
  await expect(sum).toContainText('Özgürlük tarihin')
  await expect(page.getByRole('heading', { name: "Tam rota ve koç Plus+'ta" })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Rota', exact: true })).toHaveCount(0)
})

test('web testinden uygulamaya: Plus+ netleştirince 8 aşamalı rota açılır', async ({ page }) => {
  await solveWebTest(page)
  await page.getByRole('link', { name: "Web'de devam et" }).click()
  await expect(page.getByRole('region', { name: 'Web testindeki haritan' })).toBeVisible()
  await setPlan(page, 'Plus+')
  await refine(page)
  await expect(page.getByRole('region', { name: 'Rota', exact: true })).toBeVisible()
})
