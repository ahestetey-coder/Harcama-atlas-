import { expect, test, type Page } from '@playwright/test'
import { open } from './helpers'

// Şartnamedeki örnek hesabın günü: Pazartesi 12 Ekim 2026 (maaş günü 15 → sıradaki maaş Perşembe)
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-12T10:00:00+03:00'))
})

/** Bütçe sayfasındaki "Maaşımı ekle" ile net maaşı ve maaş gününü girer; ay döngüsü anahtarı açık kalır. */
async function addSalary(page: Page, amount: string, day: string) {
  await open(page, 'butce')
  const card = page.getByRole('region', { name: 'Bütçe dağılımı' })
  await expect(card).toContainText('Maaşınızı ve maaş gününüzü girin')
  await card.getByRole('button', { name: 'Maaşımı ekle' }).click()
  const dlg = page.getByRole('dialog', { name: 'Maaş' })
  await dlg.getByLabel('Net maaş (TL)').fill(amount)
  await dlg.getByRole('combobox', { name: 'Maaş günü' }).selectOption(day)
  await expect(dlg.getByRole('switch', { name: 'Ayım maaş günümde başlasın' })).toBeChecked()
  await dlg.getByRole('button', { name: 'Kaydet' }).click()
  await expect(dlg).toBeHidden()
  await expect(page.getByText(`Ayınız artık her ayın ${day}. gününde başlıyor.`)).toBeVisible()
  return card
}

test('Ücretsiz: maaş ve sabit giderlerle dört kovalı bütçe kurulur, harcama bütçesi tek dokunuşla kopyalanır', async ({ page }) => {
  // 1) Maaş 60.000, maaş günü 15, ay döngüsü maaş gününde
  const card = await addSalary(page, '60.000', '15')
  await expect(card).toContainText('Maaş 60.000,00 ₺ · her ayın 15. günü')

  // 2) Kira, fatura ve kart asgarisi
  await card.getByRole('button', { name: 'Kira ve borçlarınızı ekleyin' }).click()
  const fixed = page.getByRole('dialog', { name: 'Sabit giderler' })
  await fixed.getByLabel('Kira ve aidat (TL)').fill('18.000')
  await fixed.getByLabel('Faturalar (TL)').fill('3.000')
  await fixed.getByLabel('Kart asgari ve KMH ödemesi (TL)').fill('4.000')
  await fixed.getByRole('button', { name: 'Kaydet' }).click()
  await expect(fixed).toBeHidden()

  // 3) 25.000 / 20.000 / 6.000 / 9.000; uyarı yok (konut tam %30 sınırda geçer)
  // Hedefler 50/30/20, esnetilmez; planlanan tutarlar altında
  await expect(card.getByRole('img', { name: '50/30/20 hedefi: zorunlu giderler ve ihtiyaçlar %50, istekler %30, birikim ve borç kapatma %20' })).toBeVisible()
  await expect(card).toContainText('30.000,00 ₺ · %50')
  await expect(card).toContainText('Sizde 45.000,00 ₺ (zorunlu sabitler 25.000,00 ₺ + ihtiyaçlar 20.000,00 ₺) · 15.000,00 ₺ fazla')
  await expect(card).toContainText('18.000,00 ₺ · %30')
  await expect(card).toContainText('Bütçede 6.000,00 ₺')
  await expect(card).toContainText('12.000,00 ₺ · %20')
  await expect(card).toContainText('Ayrılan 9.000,00 ₺ · 3.000,00 ₺ eksik')
  await expect(card).toContainText('15 Ekim, Perşembe: önce 9.000,00 ₺ birikime ayırın.')
  await expect(card).toContainText('→ acil durum fonu')
  await expect(card).not.toContainText('önerilen en fazla')
  await expect(card).not.toContainText('aşıyor')
  await expect(card).not.toContainText("%10'a çıkarmayı")
  await expect(card.getByRole('alert')).toHaveCount(0)
  await expect(card.getByRole('progressbar')).toHaveCount(0)

  // 4) Hesaplanan harcama bütçesi elle bütçeye kopyalanır
  await card.getByRole('button', { name: 'Bu bütçeyi kullan' }).click()
  await expect(page.getByText('Harcama bütçeniz 47.000,00 ₺ oldu.')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Bütçe belirleme' }).getByLabel('Dönemlik harcama bütçesi (TL)')).toHaveValue('47.000,00')
  await expect(card.getByRole('button', { name: 'Bu bütçeyi kullan' })).toHaveCount(0)

  // 5) Özet: aylık paranın yolu Bütçe'deki 50/30/20 hedefleriyle; kısayollar yok
  await page.goto('./#/')
  const flow = page.getByRole('region', { name: 'Aylık paranın yolu' })
  await expect(flow).toContainText('50/30/20 kuralı')
  await expect(flow).toContainText('Zorunlu giderler ve ihtiyaçlar %50')
  await expect(flow).toContainText('/ 30.000 ₺')
  await expect(flow).toContainText('İstekler %30')
  await expect(flow).toContainText('/ 18.000 ₺')
  await expect(flow).toContainText('Birikim ve borç kapatma %20')
  await expect(flow).toContainText('/ 12.000 ₺')
  await expect(page.getByRole('region', { name: 'Kısayollar' })).toHaveCount(0)
})

test('Ayarlar: ay döngüsü maaş gününe bağlanır ve çözülür; tek seferlik gelir bir kez sayılır', async ({ page }) => {
  await addSalary(page, '60.000', '15')

  // 5) "Maaş gününe göre" açık, kişisel döngü seçimi kilitli; kapatınca açılır
  await open(page, 'ayarlar')
  const follow = page.getByRole('switch', { name: 'Maaş gününe göre' })
  const cycle = page.getByLabel('Kişisel ay döngünüz')
  await expect(follow).toBeChecked()
  await expect(cycle).toBeDisabled()
  await expect(cycle).toHaveValue('15')
  await follow.click()
  await expect(follow).not.toBeChecked()
  await expect(cycle).toBeEnabled()

  // 6) Bugün tarihli tek seferlik gelir
  const incomes = page.getByRole('region', { name: 'Düzenli gelirler' })
  await incomes.getByRole('button', { name: 'Düzenli gelir ekle' }).click()
  await incomes.getByLabel('Ad').fill('Prim')
  await incomes.getByLabel('Tür').selectOption({ label: 'Ek gelir' })
  await incomes.getByLabel('Tutar (TL)').fill('5.000')
  await incomes.getByLabel('Sıklık').selectOption({ label: 'Tek sefer' })
  await expect(incomes.getByLabel('Tarih')).toHaveValue('2026-10-12')
  await incomes.getByRole('button', { name: 'Kaydet' }).click()
  await expect(page.getByText('Tek seferlik gelir eklendi.')).toBeVisible()
  const list = incomes.getByRole('list', { name: 'Düzenli gelir listesi' })
  await expect(list).toContainText('tek sefer · 12 Ekim 2026')
  await expect(list).toContainText('her ayın 15. günü')

  // Özette gelir bir kez sayılır (maaşın bu dönemde henüz günü gelmedi)
  await open(page)
  const hero = page.locator('section[aria-labelledby="net-title"]')
  await expect(hero).toContainText('Gelir5.000,00 ₺')

  // Bütçe kovaları değişmez; tek seferlik gelir birikime ek gelir olarak gösterilir
  await open(page, 'butce')
  const card = page.getByRole('region', { name: 'Bütçe dağılımı' })
  await expect(card).toContainText('+5.000,00 ₺ ek gelir')
  await expect(card.getByRole('img', { name: /^50\/30\/20 hedefi:/ })).toBeVisible()
})
