import { expect, test } from '@playwright/test'
import { addExpense, open, takeFreedomTest } from './helpers'

test('Plus bütçe: ücretsizde kilitli; önizlemede kategori limiti, uyarı ve tahmin çalışır', async ({ page }) => {
  await open(page, 'butce')
  await expect(page.getByRole('heading', { name: 'Gelişmiş bütçe' })).toBeVisible()
  await page.getByRole('link', { name: 'Paketleri incele' }).click()
  await expect(page.getByRole('heading', { name: 'Paketler', level: 1 })).toBeVisible()
  await expect(page.getByText('Kullandığınız paket')).toBeVisible()

  await page.getByRole('radiogroup', { name: 'Önizleme paketi' }).getByRole('radio', { name: 'Plus', exact: true }).click()
  await page.getByRole('link', { name: 'Aç' }).first().click()
  await expect(page.getByRole('heading', { name: 'Bütçe planı' })).toBeVisible()
  await expect(page.getByText('Henüz kategori limiti yok')).toBeVisible()

  await page.getByRole('button', { name: 'Limit ekle' }).click()
  const dlg = page.getByRole('dialog', { name: 'Kategori limiti ekle' })
  await dlg.getByLabel('Kategori').selectOption({ label: 'Market' })
  await dlg.getByLabel('Tutar (TL)').fill('100')
  await dlg.getByRole('button', { name: 'Kaydet' }).click()
  await expect(dlg).toBeHidden()
  await expect(page.getByRole('progressbar', { name: 'Market limit kullanımı' })).toBeVisible()

  await addExpense(page, { amount: '90', description: 'Bakkal', category: 'Market' })
  const warn = page.getByRole('region', { name: 'Bütçe uyarıları' })
  await expect(warn).toContainText('Market')
  await expect(warn).toContainText('%90 kullanıldı')
  await expect(page.getByText(/Dönemin \d+ gününün \d+\. günündesiniz/)).toBeVisible()

  // Panelde uyarı sayısı görünür
  await page.goto('./#/')
  await expect(page.getByRole('link', { name: /Bütçe planı.*1 uyarı/ })).toBeVisible()
})

test('Plus düzenli ödemeler: abonelik eklenir, yaklaşan ödeme ve panel hatırlatması görünür', async ({ page }) => {
  await open(page, 'paketler')
  await page.getByRole('radiogroup', { name: 'Önizleme paketi' }).getByRole('radio', { name: 'Plus', exact: true }).click()
  // Eski adres, Borçlar ve ödemeler sayfasının Düzenli ödemeler bölümüne yönlenir
  await page.goto('./#/odemeler')
  await expect(page.getByRole('heading', { name: 'Borçlar ve ödemeler', level: 1 })).toBeVisible()
  await expect(page.getByRole('radiogroup', { name: 'Bölüm' }).getByRole('radio', { name: 'Düzenli ödemeler' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByText('Henüz düzenli ödeme yok')).toBeVisible()

  const tomorrow = await page.evaluate(() => {
    const d = new Date(Date.now() + 86_400_000)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  await page.getByRole('button', { name: 'Ödeme ekle', exact: true }).click()
  const dlg = page.getByRole('dialog', { name: 'Düzenli ödeme ekle' })
  await dlg.getByLabel('Ad').fill('Dijital yayın')
  await dlg.getByLabel('Tutar (TL)').fill('229,99')
  await dlg.getByLabel('İlk ödeme tarihi').fill(tomorrow)
  await dlg.getByRole('button', { name: 'Kaydet' }).click()
  await expect(dlg).toBeHidden()

  const upcoming = page.getByRole('list', { name: 'Yaklaşan ödemeler' })
  await expect(upcoming).toContainText('Dijital yayın')
  await expect(upcoming).toContainText('Yarın')
  await expect(upcoming).toContainText('Yaklaştı')
  await expect(page.getByRole('table')).toContainText('229,99')

  // Elle taksit
  await page.getByRole('button', { name: 'Taksit ekle' }).click()
  const inst = page.getByRole('dialog', { name: 'Taksit ekle' })
  await inst.getByLabel('Ad').fill('Telefon')
  await inst.getByLabel('Aylık taksit tutarı (TL)').fill('1.000')
  await inst.getByLabel('İlk taksit tarihi').fill(tomorrow)
  await inst.getByRole('button', { name: 'Kaydet' }).click()
  await expect(inst).toBeHidden()
  await expect(page.getByText(/Aylık · sıradaki .* · 0\/6 ödendi/)).toBeVisible()

  await page.goto('./#/')
  await expect(page.getByRole('link', { name: 'Yaklaşan ödemeler' })).toContainText('Dijital yayın')
})

test('Plus birikim hedefi ve raporlar: hedef eklenir, para eklenip çekilir; rapor dönemi özetler', async ({ page }) => {
  await open(page, 'hedefler')
  await expect(page.getByRole('heading', { name: 'Birikim hedefleri', level: 2 })).toBeVisible()
  await page.goto('./#/paketler')
  await page.getByRole('radiogroup', { name: 'Önizleme paketi' }).getByRole('radio', { name: 'Plus', exact: true }).click()
  await page.goto('./#/hedefler')
  await expect(page.getByText('Henüz birikim hedefi yok')).toBeVisible()
  await page.getByRole('button', { name: 'Tatil' }).click()
  const dlg = page.getByRole('dialog', { name: 'Birikim hedefi ekle' })
  await expect(dlg.getByLabel('Hedefin adı')).toHaveValue('Tatil')
  await dlg.getByLabel('Hedef tutar (TL)').fill('10.000')
  await dlg.getByRole('button', { name: 'Kaydet' }).click()
  await expect(dlg).toBeHidden()

  const card = page.getByRole('article', { name: 'Tatil' })
  await expect(card).toContainText('Tarihsiz')
  await card.getByRole('button', { name: 'Para ekle' }).click()
  const add = page.getByRole('dialog', { name: 'Hedefe para ekle' })
  await add.getByLabel('Tutar (TL)').fill('2.500')
  await add.getByRole('button', { name: 'Kaydet' }).click()
  await expect(add).toBeHidden()
  await expect(card.getByRole('progressbar', { name: 'Tatil ilerlemesi' })).toHaveAttribute('aria-valuenow', '25')

  await card.getByRole('button', { name: 'Çek' }).click()
  const take = page.getByRole('dialog', { name: 'Hedeften para çek' })
  await take.getByLabel('Tutar (TL)').fill('5.000')
  await take.getByRole('button', { name: 'Kaydet' }).click()
  await expect(take.getByText('Biriktirdiğinizden fazlasını çekemezsiniz.')).toBeVisible()
  await take.getByLabel('Tutar (TL)').fill('500')
  await take.getByRole('button', { name: 'Kaydet' }).click()
  await expect(take).toBeHidden()
  await expect(card).toContainText('2.000,00 ₺')

  await addExpense(page, { amount: '450', description: 'Kırtasiye', category: 'Market' })
  await page.goto('./#/raporlar')
  await expect(page.getByRole('heading', { name: 'Raporlar', level: 1 })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Dönem özeti' })).toContainText('450,00 ₺')
  await expect(page.getByRole('table', { name: 'Kategori karşılaştırması' })).toContainText('Market')
  await expect(page.getByRole('list', { name: 'İş yerleri' })).toContainText('Kırtasiye')
  await expect(page.getByText('Karşılaştırma için önceki dönemlerden kayıt gerekiyor.', { exact: false })).toBeVisible()
})

test('Plus yatırımlarım ve borçlarım: altın eklenir, fiyat güncellenir, satılır; borç ayrı sayfada türüne göre izlenir', async ({ page }) => {
  await open(page, 'paketler')
  await page.getByRole('radiogroup', { name: 'Önizleme paketi' }).getByRole('radio', { name: 'Plus', exact: true }).click()
  await page.goto('./#/varliklar')
  await expect(page).toHaveURL(/#\/yatirimlar/)
  await expect(page.getByText('Henüz yatırım eklenmedi')).toBeVisible()

  await page.getByRole('button', { name: 'Altın', exact: true }).click()
  let dlg = page.getByRole('dialog', { name: 'Yatırım ekle' })
  await dlg.getByRole('button', { name: 'Gram altın' }).click()
  await dlg.getByLabel('Miktar (gram)').fill('10')
  await dlg.getByLabel('Birim alış fiyatı (TL)').fill('4.000')
  await dlg.getByLabel('Alış tarihi').fill('2026-09-01')
  await dlg.getByRole('button', { name: 'Kaydet' }).click()
  await expect(dlg).toBeHidden()

  const list = page.getByRole('list', { name: 'Varlıklar' })
  await expect(list).toContainText('Gram altın')
  await expect(list).toContainText('40.000,00 ₺')

  await list.getByRole('button', { name: /Fiyatı güncelle/ }).click()
  const pr = page.getByRole('dialog', { name: 'Fiyatı güncelle' })
  await pr.getByLabel('Güncel birim fiyat (TL / gram)').fill('4.500')
  await pr.getByRole('button', { name: 'Kaydet' }).click()
  await expect(pr).toBeHidden()
  await expect(list).toContainText('45.000,00 ₺')
  await expect(list).toContainText('+5.000,00 ₺')
  await expect(list).toContainText('Fiyat elle girildi')

  await list.getByRole('button', { name: /Alış \/ satış/ }).click()
  const tr = page.getByRole('dialog', { name: 'Alış veya satış ekle' })
  await tr.getByRole('radio', { name: 'Satış' }).click()
  await tr.getByLabel('Miktar (gram)').fill('20')
  await tr.getByLabel('Birim fiyat (TL)').fill('4.500')
  await tr.getByRole('button', { name: 'Kaydet' }).click()
  await expect(tr.getByText('Elinizdekinden fazlasını satamazsınız.')).toBeVisible()
  await tr.getByLabel('Miktar (gram)').fill('2')
  await tr.getByRole('button', { name: 'Kaydet' }).click()
  await expect(tr).toBeHidden()

  const sum = page.getByRole('region', { name: 'Yatırım özeti' })
  // 8 gram × 4.500 = 36.000; borçlar bu sayfada yok
  await expect(sum).toContainText('36.000,00 ₺')
  await expect(sum).not.toContainText('Borç')
  await expect(sum).toContainText('Gerçekleşen +1.000,00 ₺')
  await expect(page.getByRole('list', { name: 'Varlık dağılımı' })).toContainText('Altın')
  await expect(page.getByRole('table')).toContainText('36.000,00 ₺')
  await expect(sum).not.toContainText('günden eski')

  // Fiyatı 30 günden eski varlık uyarıda adıyla ve tarihiyle görünür
  await page.getByRole('button', { name: 'Yatırım ekle' }).first().click()
  dlg = page.getByRole('dialog', { name: 'Yatırım ekle' })
  await dlg.getByRole('button', { name: 'Çeyrek altın' }).click()
  await dlg.getByLabel('Miktar (adet)').fill('1')
  await dlg.getByLabel('Birim alış fiyatı (TL)').fill('10.000')
  await dlg.getByLabel('Alış tarihi').fill('2026-08-14')
  await dlg.getByRole('button', { name: 'Kaydet' }).click()
  await expect(dlg).toBeHidden()
  await expect(sum).toContainText('Fiyatı 30 günden eski olan varlıklar: Çeyrek altın (14.08.2026)')
  await expect(page.getByRole('list', { name: 'Varlıklar' })).toContainText('Fiyat eski')

  // Emtia listeden seçilir: ad, birim ve fiyat kaynağı kendiliğinden dolar; dağılımda altınla birlikte gösterilir
  await page.getByRole('button', { name: 'Yatırım ekle' }).first().click()
  dlg = page.getByRole('dialog', { name: 'Yatırım ekle' })
  await dlg.getByRole('radiogroup', { name: 'Tür' }).getByRole('radio', { name: 'Emtia', exact: true }).click()
  await dlg.getByRole('combobox', { name: 'Emtia' }).selectOption('XAG')
  await expect(dlg.getByLabel('Ad', { exact: true })).toHaveValue('Gümüş')
  await dlg.getByLabel('Miktar (gram)').fill('100')
  await dlg.getByLabel('Birim alış fiyatı (TL)').fill('50')
  await expect(dlg.getByLabel('Toplam maliyet')).toContainText('5.000,00 ₺')
  await dlg.getByRole('button', { name: 'Kaydet' }).click()
  await expect(dlg).toBeHidden()
  await expect(list).toContainText('Gümüş')
  await expect(page.getByRole('list', { name: 'Varlık dağılımı' })).toContainText('Altın ve emtia')

  // Mevduatta faiz alanı yok; bakiye girilen tutardır
  await page.getByRole('button', { name: 'Yatırım ekle' }).first().click()
  dlg = page.getByRole('dialog', { name: 'Yatırım ekle' })
  await dlg.getByRole('radiogroup', { name: 'Tür' }).getByRole('radio', { name: 'Mevduat', exact: true }).click()
  await dlg.getByRole('button', { name: 'Vadeli mevduat' }).click()
  await expect(dlg.getByLabel('Yıllık net faiz (%)')).toHaveCount(0)
  await dlg.getByLabel('Tutar (TL)').fill('10.000')
  await dlg.getByLabel('Yatırma tarihi').fill('2026-01-01')
  await dlg.getByRole('button', { name: 'Kaydet' }).click()
  await expect(dlg).toBeHidden()
  const dep = list.getByRole('listitem').filter({ hasText: 'Vadeli mevduat' })
  await expect(dep).toContainText('10.000,00 ₺')
  await expect(dep).not.toContainText('Faiz')

  // Borçlar ayrı sayfada, türüne göre
  await page.goto('./#/borclar')
  await page.getByRole('button', { name: 'Borç ekle', exact: true }).click()
  dlg = page.getByRole('dialog', { name: 'Borç ekle' })
  await expect(dlg.getByLabel('Borç türü')).toHaveValue('card')
  await expect(dlg.getByLabel('Ad', { exact: true })).toHaveValue('Kredi kartı')
  await expect(dlg.getByRole('radio', { name: 'Tek seferde' })).toHaveAttribute('aria-checked', 'true')
  await dlg.getByLabel('Borç tutarı (TL)').fill('6.000')
  await dlg.getByRole('button', { name: 'Kaydet' }).click()
  await expect(dlg).toBeHidden()
  await page.getByRole('button', { name: 'Konut kredisi' }).click()
  dlg = page.getByRole('dialog', { name: 'Borç ekle' })
  await expect(dlg.getByLabel('Borç türü')).toHaveValue('mortgage')
  // Kredilerde varsayılan aylık taksit: taksit tutarı, kalan taksit ve sıradaki tarih
  await expect(dlg.getByRole('radio', { name: 'Aylık taksit' })).toHaveAttribute('aria-checked', 'true')
  const day = (k: number) =>
    page.evaluate((k) => {
      const d = new Date(Date.now() + k * 86_400_000)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }, k)
  await dlg.getByLabel('Taksit tutarı (TL)').fill('10.000')
  await dlg.getByLabel('Kalan taksit sayısı').fill('10')
  await dlg.getByLabel('Sıradaki taksit tarihi').fill(await day(1))
  await expect(dlg.getByLabel('Kalan borç')).toContainText('100.000,00 ₺')
  await dlg.getByRole('button', { name: 'Kaydet' }).click()
  await expect(dlg).toBeHidden()
  // Taksidi bugün olan taşıt kredisi: bugünkü taksit ödendi sayılır ve aylık özete planlı taksit olarak yansır
  await page.getByRole('button', { name: 'Taşıt kredisi' }).click()
  dlg = page.getByRole('dialog', { name: 'Borç ekle' })
  await dlg.getByLabel('Taksit tutarı (TL)').fill('2.000')
  await dlg.getByLabel('Kalan taksit sayısı').fill('5')
  await dlg.getByLabel('Sıradaki taksit tarihi').fill(await day(0))
  await dlg.getByRole('button', { name: 'Kaydet' }).click()
  await expect(dlg).toBeHidden()
  const debtSum = page.getByRole('region', { name: 'Borç özeti' })
  await expect(debtSum).toContainText('114.000,00 ₺')
  await expect(page.getByRole('list', { name: 'Taşıt kredisi borçları' })).toContainText('4 taksit kaldı')
  // Yüksek faizli borç yalnızca kart
  await expect(debtSum).toContainText('6.000,00 ₺')
  await expect(page.getByRole('list', { name: 'Kredi kartı borçları' })).toContainText('Kredi kartı')
  await expect(page.getByRole('list', { name: 'Konut kredisi borçları' })).toContainText('100.000,00 ₺')

  // Taksitli borçlar düzenli ödemelerde
  await page.getByRole('radiogroup', { name: 'Bölüm' }).getByRole('radio', { name: 'Düzenli ödemeler' }).click()
  const rec = page.getByRole('list', { name: 'Düzenli ödeme listesi' })
  await expect(rec.getByRole('listitem').filter({ hasText: 'Konut kredisi' })).toContainText('Borç taksiti')
  await expect(rec.getByRole('listitem').filter({ hasText: 'Konut kredisi' })).toContainText('10 taksit kaldı')
  await expect(page.getByRole('list', { name: 'Yaklaşan ödemeler' })).toContainText('Konut kredisi')

  // Bugünkü taksit işlemlerde planlı taksit gideri; kaydedilmez, değiştirilemez
  await page.goto('./#/islemler')
  await expect(page.getByText('Taşıt kredisi (1/5. taksit)').first()).toBeVisible()
  await expect(page.getByText('Planlı taksit').first()).toBeVisible()
})

test('Plus+ yolculuk, senaryolar ve bilgi: anket doğrulanır, aşamalar ve göstergeler hesaplanır', async ({ page }) => {
  await open(page, 'paketler')
  await page.getByRole('radiogroup', { name: 'Önizleme paketi' }).getByRole('radio', { name: 'Plus+', exact: true }).click()
  await page.goto('./#/varliklar')
  await page.getByRole('button', { name: 'Altın', exact: true }).click()
  const dlg = page.getByRole('dialog', { name: 'Yatırım ekle' })
  await dlg.getByRole('button', { name: 'Gram altın' }).click()
  await dlg.getByLabel('Miktar (gram)').fill('10')
  await dlg.getByLabel('Birim alış fiyatı (TL)').fill('4.000')
  await dlg.getByRole('button', { name: 'Kaydet' }).click()
  await expect(dlg).toBeHidden()

  // Senaryolar ankete bağlıdır
  await page.goto('./#/senaryolar')
  await expect(page.getByRole('heading', { name: 'Önce yolculuğunuzu oluşturun' })).toBeVisible()

  await page.goto('./#/yolculuk')
  const t = page.getByRole('region', { name: 'Finansal özgürlük testi' })
  await t.getByRole('button', { name: 'İleri' }).click()
  await expect(t.getByRole('alert')).toContainText('Yaşınızı 15 ile 100 arasında girin.')
  await t.getByLabel('Yaşınız').fill('32')
  await t.getByRole('button', { name: 'İleri' }).click()
  await expect(t).toContainText('Eksik')
  await t.getByRole('button', { name: 'Geri' }).click()
  await expect(t.getByLabel('Yaşınız')).toHaveValue('32')
  await takeFreedomTest(page, { income: '50.000', essential: '20.000', target: '25.000' })

  // 40.000 / 20.000 = 2 ay; hedef 25.000 × 12 / %4 = 7.500.000
  await expect(page.getByRole('region', { name: 'Finansal güvence' })).toContainText('2 ay')
  await expect(page.getByRole('region', { name: 'Hedef ilerlemesi' })).toContainText('7.500.000,00 ₺')
  await expect(page.getByRole('region', { name: 'Tahmini rota' })).toContainText('Ayda 30.000,00 ₺ birikimle')
  // Denge ve başlangıç fonu tamam, borç yok: sıradaki acil durum fonu
  await expect(page.getByRole('region', { name: 'Rota', exact: true })).toContainText('Seviye 3/8')
  await expect(page.getByRole('region', { name: 'Rota', exact: true })).toContainText('sıradaki aşama Acil durum fonu')
  await expect(page.getByRole('region', { name: 'Rota', exact: true })).toContainText('Hedef: Kenarda 60.000 ₺ hızlı kullanılabilir para')
  await expect(page.getByRole('region', { name: 'Rota', exact: true })).toContainText('Kalan: 20.000 ₺ daha biriktirin')
  await expect(page.getByRole('region', { name: 'Test çağrısı' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Testi yenile · bu ay 1 hak' })).toBeVisible()
  const stages = page.getByRole('list', { name: 'Aşamalar' })
  const stage = (name: string) => stages.locator(':scope > li').filter({ hasText: name })
  await expect(stages.locator(':scope > li')).toHaveCount(8)
  await expect(stage('Bütçe dengesi')).toContainText('Tamamlandı')
  // Sıradaki aşamanın kalan koşulları açık; süre bugünkü birikim hızıyla
  await expect(stage('Acil durum fonu').getByRole('list', { name: 'Acil durum fonu koşulları' })).toContainText('20.000 ₺ daha biriktirin')
  await expect(stage('Acil durum fonu')).toContainText('bu hızla ~1 ay')
  await expect(stage('Düzenli birikim')).toContainText('Tamamlandı')
  // Diğer aşamalar dokununca açılır
  await expect(stage('Finansal güvence').getByRole('list')).toHaveCount(0)
  await stage('Finansal güvence').getByRole('button').click()
  await expect(stage('Finansal güvence').getByRole('list', { name: 'Finansal güvence koşulları' })).toContainText('Net birikim')
  const midReach = (await page.getByRole('region', { name: 'Tahmini rota' }).textContent())?.match(/Orta varsayım: (\S+ \d{4})/)?.[1]
  expect(midReach).toBeTruthy()
  await expect(page.getByText(/Kilometre taşı:/)).toBeVisible()

  // Sekmeler: yatırımlar, borçlar, bu ay ve bütün ölçütler
  const tabs = page.getByRole('tablist', { name: 'Yolculuk bölümleri' })
  await tabs.getByRole('tab', { name: 'Yatırımlarım' }).click()
  await expect(page.getByRole('tabpanel')).toContainText('Toplam yatırım')
  await tabs.getByRole('tab', { name: 'Borçlarım' }).click()
  await expect(page.getByRole('tabpanel')).toContainText('Kayıtlı borç ya da kalan taksit yok')
  await tabs.getByRole('tab', { name: 'Bu ay' }).click()
  await expect(page.getByRole('tabpanel')).toContainText('Testteki aylık gelir')
  await tabs.getByRole('tab', { name: 'Kriterler' }).click()
  const criteria = page.getByRole('list', { name: 'Ölçütler' })
  await expect(criteria.getByRole('listitem')).toHaveCount(10)
  await expect(criteria).toContainText('%4 kuralı')
  await expect(criteria).toContainText('50/30/20')
  await expect(page.getByRole('region', { name: 'Test yanıtlarınız' })).toContainText('Bu ay 1 test hakkınız kaldı')

  // USD bazı fiyat olmadan seçilemez (giriş yok)
  await page.getByRole('radiogroup', { name: 'Plan birimi' }).getByRole('radio', { name: 'USD' }).click()
  await expect(page.getByText('USD fiyatı henüz alınamadı.')).toBeVisible()

  // Test yeniden yapılır: yanıtlar dolu gelir; ay içindeki ikinci testten sonra hak kalmaz
  await page.getByRole('button', { name: 'Testi yeniden yap' }).click()
  await expect(page.getByRole('region', { name: 'Finansal özgürlük testi' })).toContainText('Bu ay 1 test hakkınız var')
  await takeFreedomTest(page, { income: '50.000', essential: '20.000', target: '25.000' })
  await page.getByRole('tablist', { name: 'Yolculuk bölümleri' }).getByRole('tab', { name: 'Kriterler' }).click()
  await expect(page.getByRole('button', { name: 'Testi yeniden yap' })).toBeDisabled()

  await page.getByRole('link', { name: 'Senaryolar' }).first().click()
  await expect(page).toHaveURL(/#\/senaryolar/)
  const table = page.getByRole('region', { name: 'Senaryo tablosu' })
  await expect(table).toContainText('40.000,00 ₺')
  await expect(page.getByRole('list', { name: 'Hedefe ulaşma' })).toContainText('Temkinli')
  // Senaryolar yolculukla aynı hedef ve tahmini kullanır
  await expect(page.getByRole('region', { name: 'Başlangıç noktası' })).toContainText('7.500.000,00 ₺')
  await expect(page.getByRole('region', { name: 'Başlangıç noktası' })).toContainText(midReach!)
  await expect(page.getByRole('list', { name: 'Hedefe ulaşma' }).getByRole('listitem').filter({ hasText: 'Orta' })).toContainText(midReach!)
  // Geçersiz tutar son geçerli değeri korur
  await page.getByLabel('Ek aylık birikim (TL)').fill('abc')
  await expect(page.getByRole('region', { name: 'Varsayımlar' }).getByRole('alert')).toContainText('Geçerli bir tutar girin')
  await page.getByLabel('Ek aylık birikim (TL)').fill('10.000')
  await expect(page.getByText(/erken\./)).toBeVisible()
  await page.getByRole('button', { name: 'Varsayılanlara dön' }).click()
  await expect(page.getByLabel('Ek aylık birikim (TL)')).toHaveValue('')
  // Gelir kaybı ilk yılda birikimi azaltır
  const before = await table.getByRole('row').nth(2).textContent()
  await page.getByLabel('Gelir kaybı (ay)').fill('6')
  await expect(table.getByRole('row').nth(2)).not.toHaveText(before ?? '')
  await page.getByRole('radio', { name: 'Nominal' }).click()
  await expect(table).toContainText('(nominal)')
  await expect(page.getByText('olasılık veya garanti değildir')).toBeVisible()

  await page.goto('./#/ogren')
  await expect(page.getByText('Likidite', { exact: true })).toBeVisible()
  await expect(page.getByText(/Henüz yayınlanmış rapor yok/)).toBeVisible()
})

test('Plus+ koç: borç önce kapanır, yatırım tutarı ve yapılandırma hesabı; hazır sorular yanıtlanır', async ({ page }) => {
  await open(page, 'paketler')
  await page.getByRole('radiogroup', { name: 'Önizleme paketi' }).getByRole('radio', { name: 'Plus+', exact: true }).click()
  await page.goto('./#/koc')
  await expect(page.getByRole('region', { name: 'Koç özeti' })).toContainText('Sizi tanıyınca')
  await expect(page.getByRole('region', { name: 'Koç mesajları' })).toContainText('Sizi tanıyalım')

  await page.goto('./#/borclar')
  await page.getByRole('button', { name: 'Borç ekle', exact: true }).click()
  const dlg = page.getByRole('dialog', { name: 'Borç ekle' })
  await dlg.getByLabel('Borç tutarı (TL)').fill('30.000')
  await dlg.getByLabel('Aylık faiz (%)').fill('4,25')
  await dlg.getByLabel('Asgari ödeme (TL)').fill('3.000')
  await dlg.getByRole('button', { name: 'Kaydet' }).click()
  await expect(dlg).toBeHidden()
  await expect(page.getByRole('list', { name: 'Kredi kartı borçları' })).toContainText('Aylık %4,25 faiz · aylık ödeme 3.000,00 ₺')

  await page.goto('./#/yolculuk')
  await takeFreedomTest(page, { income: '50.000', essential: '40.000', target: '25.000' })
  await expect(page.getByRole('region', { name: 'Finansal güvence' })).toBeVisible()

  await page.goto('./#/koc')
  // Fazla 10.000; düzenli gelirde %90'ı (9.000) plana ayrılır
  const plan = page.getByRole('region', { name: 'Planın' })
  await expect(plan.getByRole('listitem').first()).toContainText('Borçları kapat')
  await expect(plan).toContainText('Ayda 9.000,00 ₺')
  await expect(plan).toContainText('Düzenli yatırım')
  const debt = page.getByRole('region', { name: 'Borç planı' })
  await expect(debt).toContainText('4 ay')
  await expect(debt).toContainText('Yalnızca asgari ödemeye göre')

  const chat = page.getByRole('region', { name: 'Koç mesajları' })
  await expect(chat).toContainText('Bu ayın planı')
  // Koç rotadaki sıradaki aşamayı söyler (kart borcu yüksek faizli)
  await expect(chat).toContainText('Rotanızda sıradaki')
  await chat.getByRole('button', { name: 'Her ay ne kadar yatırıma ayırmalıyım?' }).click()
  await expect(chat).toContainText('Ayda 9.000 ₺ ayırabilirsiniz')
  await expect(chat.getByLabel('Koça yazın')).toBeDisabled()

  await debt.getByRole('button', { name: 'Yapılandırma hesabı' }).click()
  await debt.getByLabel('Yeni aylık faiz (%)').fill('1,5')
  await debt.getByLabel('Vade (ay)').fill('12')
  await expect(debt.getByLabel('Yapılandırma sonucu')).toContainText('Faiz tasarrufu')

  await debt.getByRole('radio', { name: 'Önce en küçük borç' }).click()
  await page.goto('./#/')
  await expect(page.getByRole('link', { name: 'Koç mesajları' })).toBeVisible()
  await page.goto('./#/koc')
  await expect(page.getByRole('radio', { name: 'Önce en küçük borç' })).toHaveAttribute('aria-checked', 'true')
})

test('Plus+ yolculuk: testi olmayan eski profilde test çağrısı görünür ve test açılır', async ({ page }) => {
  await open(page, 'paketler')
  await page.getByRole('radiogroup', { name: 'Önizleme paketi' }).getByRole('radio', { name: 'Plus+', exact: true }).click()
  await page.goto('./#/yolculuk')
  await takeFreedomTest(page, { income: '50.000', essential: '20.000', target: '25.000' })
  // Eski anketle oluşturulmuş profil: test tarihi yok
  await page.evaluate(async () => {
    for (const { name } of await indexedDB.databases()) {
      if (!name) continue
      const db = await new Promise<IDBDatabase>((ok, ko) => {
        const r = indexedDB.open(name)
        r.onsuccess = () => ok(r.result)
        r.onerror = () => ko(r.error)
      })
      if (!db.objectStoreNames.contains('settings')) continue
      await new Promise<void>((ok) => {
        const store = db.transaction('settings', 'readwrite').objectStore('settings')
        const g = store.get('settings')
        g.onsuccess = () => {
          const s = g.result
          if (s?.journey) {
            delete s.journey.tests
            store.put(s).onsuccess = () => ok()
          } else ok()
        }
      })
      db.close()
    }
  })
  await page.reload()
  const cta = page.getByRole('region', { name: 'Test çağrısı' })
  await expect(cta).toContainText('Finansal özgürlük testini henüz yapmadınız')
  await cta.getByRole('button', { name: 'Testi başlat' }).click()
  await expect(page.getByRole('region', { name: 'Finansal özgürlük testi' })).toBeVisible()
})
