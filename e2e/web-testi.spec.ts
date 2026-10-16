import { expect, test } from '@playwright/test'
import { answerQuestions } from './helpers'

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
    // Gider adımı tek boş satırla başlar
    if (h === 'Giderlerin') {
      await t.getByRole('button', { name: 'Gider ekle' }).click()
      await t.getByRole('group', { name: 'Gider kategorisi' }).getByRole('button', { name: 'Kira / konut' }).click()
      await page.keyboard.type('25000')
    }
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

test('web testinden uygulamaya: paketsiz kişi Paketler’e, Plus netleştirince Finansal Yolculuğum açılır', async ({ page }) => {
  await solveWebTest(page)
  await page.getByRole('link', { name: "Web'de devam et" }).click()
  // Ücretsiz pakette web sonucu görünür, netleştirme Plus ister ve Paketler'e gider
  await expect(page.getByRole('region', { name: 'Web testindeki haritan' })).toBeVisible()
  await page.getByRole('link', { name: 'Plus ile rotamı kur' }).click()
  await expect(page).toHaveURL(/#\/paketler/)

  await setPlan(page, 'Plus')
  await setupRoute(page, 'Finansal özgürlük sayfama git')
  // Plus: Finansal Yolculuğum paneli test sonucuyla kurulur (koç Plus+'ta)
  await expect(page.getByRole('region', { name: 'Rota', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Özgürlük simülasyonu' })).toContainText('Finansal bağımsızlığa varış')
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
  await expect(page.getByRole('region', { name: 'Aylık paranın yolu' })).toContainText('Borç kapama ve birikim')
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
  // Çözülen test kalıcı: bölüm yeniden açılınca kayıtlı sonuç gelir, testi baştan çözmek gerekmez
  await page.goto('./#/finansal-harita')
  await expect(page.getByRole('heading', { name: 'Dengeli Yolcu' })).toBeVisible()
  await page.getByRole('button', { name: /Rotamı kur · 5 dk/ }).click()
  await expect(page).toHaveURL(/#\/yolculuk$/)
  await setupRoute(page, 'Finansal özgürlük sayfama git', false)
  await expect(page.getByRole('region', { name: 'Rota', exact: true })).toBeVisible()
})

test('rota kurulumu: giderler + ile kategoriyle eklenip toplanır; yarıda bırakılan kurulum kaldığı yerden sürer', async ({ page }) => {
  await page.goto('./#/paketler')
  await page.getByRole('radiogroup', { name: 'Önizleme paketi' }).getByRole('radio', { name: 'Plus', exact: true }).click()
  await page.goto('./#/finansal-harita')
  await answerQuestions(page)
  await page.getByRole('button', { name: /Rotamı kur · 5 dk/ }).click()
  const t = page.getByRole('region', { name: 'Rota kurulumu' })
  await t.getByRole('button', { name: 'Onayla ve devam' }).click()
  await expect(t.getByRole('heading', { name: 'Giderlerin' })).toBeVisible()
  // Liste boş başlar; + ile kayıtlı gider türlerinden biri seçilir, tutar yazılır
  await expect(t.getByRole('list', { name: 'Giderler' }).getByRole('listitem')).toHaveCount(0)
  const add = async (cat: string, amount: string) => {
    await t.getByRole('button', { name: 'Gider ekle' }).click()
    await t.getByRole('group', { name: 'Gider kategorisi' }).getByRole('button', { name: cat }).click()
    // Yeni satırın tutar alanı odaklanır; doğrudan yazılır
    await page.keyboard.type(amount)
  }
  await add('Kira / konut', '20000')
  await add('Gıda ve market', '8000')
  await add('Gıda ve market', '2000')
  await expect(t.getByRole('list', { name: 'Giderler' }).getByRole('listitem')).toHaveCount(3)
  await expect(t).toContainText('30.000,00 ₺')
  // Kredi ve kart taksitleri Borçlar sayfasında eklenir; dönünce adım 2'de otomatik görünür ve toplama girer
  await t.getByRole('link', { name: /Kredi \/ kart taksiti ekle/ }).click()
  await expect(page).toHaveURL(/#\/borclar/)
  await page.getByRole('button', { name: 'Borç ekle', exact: true }).click()
  const dlg = page.getByRole('dialog', { name: 'Borç ekle' })
  await dlg.getByLabel('Borç tutarı (TL)').fill('30.000')
  await dlg.getByLabel('Aylık faiz (%)').fill('4,25')
  await dlg.getByLabel('Asgari ödeme (TL)').fill('3.000')
  await dlg.getByRole('button', { name: 'Kaydet' }).click()
  await expect(dlg).toBeHidden()
  await page.goto('./#/yolculuk')
  await expect(t.getByRole('heading', { name: 'Giderlerin' })).toBeVisible()
  await expect(t.getByRole('group', { name: 'Kredi, taksit ve düzenli ödemeler' })).toContainText('3.000 ₺/ay')
  await expect(t).toContainText('33.000,00 ₺')
  await t.getByRole('button', { name: 'Onayla ve devam' }).click()
  await expect(t.getByRole('heading', { name: 'Borçların' })).toBeVisible()
  await expect(t).toContainText('Borçların uygulamadaki Borçlar sayfasından geldi.')

  // Başka sayfaya gidip dönünce kurulum aynı adımdan ve aynı rakamlarla sürer
  await page.goto('./#/')
  await page.goto('./#/yolculuk')
  await expect(t.getByRole('heading', { name: 'Borçların' })).toBeVisible()
  await t.getByRole('button', { name: 'Geri' }).click()
  await expect(t.getByLabel('Kira / konut', { exact: true })).toHaveValue('20000')
  await expect(t).toContainText('33.000,00 ₺')
})
