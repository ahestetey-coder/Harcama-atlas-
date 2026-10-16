import { expect, test } from '@playwright/test'

/** 10 soruyu ve iki ara durağı aynı cevaplarla geçer (web ve uygulama içi test aynı). */
async function answerQuestions(page: import('@playwright/test').Page) {
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
}

/** Girişsiz web testini (#/harita) baştan sona çözer ve sonuç ekranına gelir. */
async function solveWebTest(page: import('@playwright/test').Page) {
  await page.goto('./#/harita')
  await expect(page.getByRole('heading', { name: 'Finansal özgürlüğüne ne kadar uzaksın?' })).toBeVisible()
  // Uygulama kabuğu ve giriş yok
  await expect(page.getByRole('navigation', { name: /Ana menü|Alt menü/ })).toHaveCount(0)
  await answerQuestions(page)

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
  await expect(page.getByText('Özgürlük yılın', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Rotanın 8 durağı/ })).toBeVisible()
  // Simülatör: ek birikim varış yılını öne çeker
  await expect(page.getByRole('heading', { name: 'Geleceğini şimdi değiştir' })).toBeVisible()
  await expect(page.getByText(/erken\./)).toBeVisible()
  // Devam bağlantısı kodu taşır
  const cont = page.getByRole('link', { name: "Web'de devam et" })
  await expect(cont).toHaveAttribute('href', /#\/yolculuk\?kod=ATL-[A-HJ-NP-Z2-9]{6}$/)
})

/** Rota kurulumu: 6 adımda tahminler gerçek rakamlarla değişir, canlı yıl güncellenir, sonunda karşılaştırma açılır. */
async function setupRoute(page: import('@playwright/test').Page, finish: string, fromCard = true) {
  const card = page.getByRole('region', { name: 'Web testindeki haritan' })
  if (fromCard) {
    await expect(card).toContainText('Dengeli Yolcu')
    await card.getByRole('button', { name: /Rotamı kur/ }).click()
  }
  const t = page.getByRole('region', { name: 'Rota kurulumu' })
  await expect(t.getByRole('heading', { name: 'Gelirin' })).toBeVisible()
  await expect(t.getByText('Canlı özgürlük yılın')).toBeVisible()
  await expect(t.getByLabel('Aylık net ana gelir')).toHaveValue('75.000,00')
  await expect(t.getByText('Tahmini').first()).toBeVisible()
  await t.getByLabel('Aylık net ana gelir').fill('82.000')
  await expect(t.getByText('Onaylı').first()).toBeVisible()
  for (const h of ['Giderlerin', 'Borçların', 'Birikimin', 'Hedefin']) {
    await t.getByRole('button', { name: 'Onayla ve devam' }).click()
    await expect(t.getByRole('heading', { name: h })).toBeVisible()
  }
  // Yaş zorunlu
  await t.getByRole('button', { name: 'Onayla ve devam' }).click()
  await expect(t.getByRole('alert')).toContainText('Yaşını')
  await t.getByLabel('Yaşın').fill('34')
  await t.getByRole('button', { name: 'Onayla ve devam' }).click()
  await expect(t.getByRole('heading', { name: 'Son birkaç soru' })).toBeVisible()
  await t.getByRole('button', { name: 'Rotamı hesapla' }).click()
  const fin = page.getByRole('region', { name: 'Netleşen haritan' })
  await expect(fin.getByRole('heading', { name: 'Haritan netleşti.' })).toBeVisible()
  await expect(fin).toContainText('Özgürlük yılı')
  await expect(fin).toContainText('Koçun')
  await fin.getByRole('button', { name: finish }).click()
  await expect(fin).toBeHidden()
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
  await page.getByRole('link', { name: 'Plus ile rotamı kur' }).click()
  await expect(page).toHaveURL(/#\/paketler/)

  await setPlan(page, 'Plus')
  await setupRoute(page, 'Rotamı gör')
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
  await setupRoute(page, 'Finansal özgürlük sayfama git')
  await expect(page.getByRole('region', { name: 'Rota', exact: true })).toBeVisible()
  // Gerçek rakamlarla simülasyon ve aylık paranın yolu
  const sim = page.getByRole('region', { name: 'Özgürlük simülasyonu' })
  await expect(sim).toContainText('Finansal bağımsızlığa varış')
  await expect(sim.getByRole('list', { name: 'Rota takvimi' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Aylık paranın yolu' })).toContainText('Birikim')
})

test('uygulama içi Finansal Harita testi: ücretsizde çözülür, sonuç paket önerir; Plus rotasını kurar', async ({ page }) => {
  await page.goto('./#/yolculuk')
  await page.getByRole('link', { name: 'Özgürlük rotamı çıkar' }).click()
  await expect(page).toHaveURL(/#\/finansal-harita/)
  await answerQuestions(page)
  // Uygulamada iletişim adımı yok, sonuç hemen açılır ve paket önerir
  await expect(page.getByRole('heading', { name: 'Dengeli Yolcu' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Rotanı gerçek rakamlarınla kur' })).toBeVisible()
  // Sonucun hemen altında Plus yönlendirmesi; altta kilitli önizleme ve paketler
  await expect(page.getByRole('button', { name: 'Plus ile kesinleştir' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Plus ile açılanlar' })).toBeVisible()
  await page.getByRole('button', { name: /Paketleri gör/ }).click()
  await expect(page).toHaveURL(/#\/paketler/)

  await page.getByRole('radiogroup', { name: 'Önizleme paketi' }).getByRole('radio', { name: 'Plus', exact: true }).click()
  await page.goto('./#/finansal-harita')
  await answerQuestions(page)
  await page.getByRole('button', { name: /Rotamı kur · 5 dk/ }).click()
  await expect(page).toHaveURL(/#\/yolculuk$/)
  await setupRoute(page, 'Rotamı gör', false)
  await expect(page.getByRole('region', { name: 'Netleşen rotan' })).toContainText('Gerçek rakamlarınla')
})
