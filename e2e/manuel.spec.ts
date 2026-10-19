import { expect, test } from '@playwright/test'
import { addExpense, expectTxTotals, filterCategory, open } from './helpers'

test('kategori seçilmeden gider kaydedilmez, seçilince kaydedilir', async ({ page }) => {
  await open(page)
  const dialog = await addExpense(page, { amount: '1.234,56', description: 'Deneme Market' })
  await expect(dialog.getByText('Gider için kategori seçmelisiniz.')).toBeVisible()
  await expect(dialog).toBeVisible()

  await dialog.getByLabel('Kategori').selectOption({ label: 'Market' })
  await dialog.getByRole('button', { name: 'Kaydet', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('Gider kaydedildi.')).toBeVisible()

  // Panel toplamları kuruş hassasiyetinde
  await expect(page.getByText('1.234,56 ₺').first()).toBeVisible()
  await page.getByRole('link', { name: 'İşlemler' }).first().click()
  await expect(page.getByRole('row', { name: /Deneme Market/ })).toContainText('1.234,56')
})

test('düzenleme, arama, filtre ve geri alınabilir silme', async ({ page }) => {
  await open(page, 'islemler')
  await addExpense(page, { amount: '100', description: 'Kahve Evi', category: 'Restoran/Kafe' })
  await expect(page.getByRole('dialog')).toBeHidden()
  await addExpense(page, { amount: '250,50', description: 'Benzinci', category: 'Akaryakıt' })
  await expect(page.getByRole('dialog')).toBeHidden()
  await expectTxTotals(page, 2, '350,50 ₺')

  // Düzenle
  await page.getByRole('button', { name: 'Kahve Evi düzenle' }).click()
  const dialog = page.getByRole('dialog', { name: 'İşlemi düzenle' })
  await dialog.getByLabel('Tutar (TL)').fill('120,25')
  await dialog.getByRole('button', { name: 'Değişiklikleri kaydet' }).click()
  await expect(dialog).toBeHidden()
  await expectTxTotals(page, 2, '370,75 ₺')

  // Ara (Türkçe harf/büyük-küçük harf duyarsız)
  await page.getByLabel('Açıklama veya notta ara').fill('KAHVE')
  await expectTxTotals(page, 1)
  await page.getByLabel('Açıklama veya notta ara').fill('')

  // Kategori filtresi
  await filterCategory(page, 'Akaryakıt')
  await expectTxTotals(page, 1, '250,50 ₺')
  await filterCategory(page, null)

  // Sil ve geri al
  await page.getByRole('button', { name: 'Benzinci sil' }).click()
  await expect(page.getByText('İşlem silindi.')).toBeVisible()
  await expect(page.getByRole('row', { name: /Benzinci/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Geri al' }).click()
  await expect(page.getByRole('row', { name: /Benzinci/ })).toHaveCount(1)
})

test('toplu kategori değiştirme ve toplu silme', async ({ page }) => {
  await open(page, 'islemler')
  for (const d of ['A Dükkan', 'B Dükkan', 'C Dükkan']) {
    await addExpense(page, { amount: '10', description: d, category: 'Market' })
    await expect(page.getByRole('dialog')).toBeHidden()
  }
  await page.getByRole('checkbox', { name: 'A Dükkan seç' }).check()
  await page.getByRole('checkbox', { name: 'B Dükkan seç' }).check()
  await page.getByRole('button', { name: /Kategori değiştir/ }).click()
  const dlg = page.getByRole('dialog')
  await dlg.getByLabel('Yeni kategori').selectOption({ label: 'Giyim' })
  await dlg.getByRole('button', { name: 'Uygula' }).click()
  await expect(page.getByRole('row', { name: /A Dükkan/ })).toContainText('Giyim')
  await expect(page.getByRole('row', { name: /C Dükkan/ })).toContainText('Market')

  await page.getByRole('checkbox', { name: 'Görünen tüm işlemleri seç' }).check()
  await page.getByRole('region', { name: 'Toplu işlemler' }).getByRole('button', { name: 'Sil', exact: true }).click()
  const confirm = page.getByRole('dialog', { name: '3 işlem silinsin mi?' })
  await confirm.getByRole('button', { name: 'Sil', exact: true }).click()
  await expect(confirm).toBeHidden()
  await expect(page.getByText('3 işlem silindi.')).toBeVisible()
})

test('kaydet butonuna çift tıklama tek kayıt oluşturur', async ({ page }) => {
  await open(page, 'islemler')
  await page.getByRole('button', { name: 'Gider ekle' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Gider ekle' })
  await dialog.getByLabel('Tutar (TL)').fill('42')
  await dialog.getByLabel('Açıklama / iş yeri').fill('Çift Tık')
  await dialog.getByLabel('Kategori').selectOption({ label: 'Market' })
  await dialog.getByRole('button', { name: 'Kaydet', exact: true }).dblclick()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('row', { name: /Çift Tık/ })).toHaveCount(1)
})

test('sayfa yenilendikten sonra veriler kalır', async ({ page }) => {
  await open(page)
  await addExpense(page, { amount: '77,70', description: 'Kalıcı Kayıt', category: 'Eğlence' })
  await expect(page.getByRole('dialog')).toBeHidden()
  await page.reload()
  await open(page, 'islemler')
  await expect(page.getByRole('row', { name: /Kalıcı Kayıt/ })).toContainText('77,70')
})

test('ay değiştirme: toplamlar, iade ve grafik tutarlı', async ({ page }) => {
  await open(page)
  // Bugünkü ay ve önceki ayda kayıtlar
  // "Bugün" tarayıcının saat diliminde hesaplanır (Node UTC'de ay sonuna denk gelebilir).
  const [year, month] = await page.evaluate(() => [new Date().getFullYear(), new Date().getMonth()])
  const pad = (n: number) => String(n).padStart(2, '0')
  const prev = new Date(year, month - 1, 15)
  const prevIso = `${prev.getFullYear()}-${pad(prev.getMonth() + 1)}-15`
  await addExpense(page, { amount: '300', description: 'Bu Ay Market', category: 'Market' })
  await expect(page.getByRole('dialog')).toBeHidden()
  await addExpense(page, { amount: '1.000', description: 'Geçen Ay Giyim', category: 'Giyim', date: prevIso })
  await expect(page.getByRole('dialog')).toBeHidden()

  // Geçen aya ait iade
  await page.getByRole('button', { name: 'Gider ekle' }).first().click()
  const d = page.getByRole('dialog')
  await d.getByRole('radio', { name: 'İade' }).click()
  await d.getByLabel('Tutar (TL)').fill('200')
  await d.getByLabel('Tarih').fill(prevIso)
  await d.getByLabel('Açıklama / iş yeri').fill('Giyim İade')
  await d.getByLabel('Kategori').selectOption({ label: 'Giyim' })
  await d.getByRole('button', { name: 'Kaydet', exact: true }).click()
  await expect(d).toBeHidden()

  await expect(page.getByText('300,00 ₺').first()).toBeVisible()
  await page.getByRole('button', { name: 'Önceki ay' }).click()
  // Net = 1000 - 200 = 800; brüt 1000; iade 200
  await expect(page.getByText('800,00 ₺').first()).toBeVisible()
  await expect(page.getByText('1.000,00 ₺').first()).toBeVisible()
  await expect(page.getByText(/200,00 ₺/).first()).toBeVisible()
  // Kategori dağılımı brüt giderden: Giyim 1.000 (iade düşülmeden)
  await page.getByRole('button', { name: /Giyim/ }).first().click()
  const drawer = page.getByRole('dialog')
  await expect(drawer.getByRole('button', { name: /Geçen Ay Giyim, 1\.000,00 ₺/ })).toBeVisible()
  await expect(drawer).toContainText(/Net\s*800,00 ₺/)
})

test('gelir kaydı: harcama toplamına girmez, özette gelir ve kalan görünür', async ({ page }) => {
  await open(page)
  await addExpense(page, { amount: '1.000', description: 'Market Alışverişi', category: 'Market' })
  await expect(page.getByRole('dialog')).toBeHidden()
  await page.getByRole('button', { name: 'Yeni ekle' }).click()
  await page.getByRole('dialog', { name: 'Ne eklemek istersiniz?' }).getByRole('button', { name: /^Gelir/ }).click()
  const form = page.getByRole('dialog', { name: 'Gelir ekle' })
  await form.getByLabel('Tutar (TL)').fill('30.000')
  await form.getByLabel('Açıklama / iş yeri').fill('Maaş')
  await expect(form.getByRole('radiogroup', { name: 'Harcama grubu' })).toHaveCount(0)
  await form.getByRole('button', { name: 'Kaydet', exact: true }).click()
  await expect(page.getByText('Gelir kaydedildi.')).toBeVisible()

  const hero = page.locator('section[aria-labelledby="net-title"]')
  await expect(hero).toContainText('1.000,00 ₺')
  await expect(hero).toContainText('Gelir30.000,00 ₺')
  await expect(hero).toContainText('Kalan29.000,00 ₺')

  await open(page, 'islemler')
  await expectTxTotals(page, 2, '1.000,00 ₺')
  await expect(page.getByRole('group', { name: 'Gelir', exact: true })).toContainText('30.000,00 ₺')
  await page.getByRole('radiogroup', { name: 'İşlem türü' }).getByRole('radio', { name: 'Gelir' }).click()
  await expectTxTotals(page, 1)
  await expect(page.getByRole('row', { name: /Maaş/ })).toContainText('+30.000,00')
})

test('düzenli gelir: bir kez girilen maaş sonraki ay kendiliğinden eklenir, Ayarlar\'dan yönetilir', async ({ page }) => {
  await open(page)
  // Geçen ayın bugünkü günü (ay kısaysa ayın son günü)
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth(), 0)
  const day = Math.min(now.getDate(), prev.getDate())
  const lastMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  await page.getByRole('button', { name: 'Yeni ekle' }).click()
  await page.getByRole('dialog', { name: 'Ne eklemek istersiniz?' }).getByRole('button', { name: /^Gelir/ }).click()
  const form = page.getByRole('dialog', { name: 'Gelir ekle' })
  await form.getByLabel('Tutar (TL)').fill('30.000')
  await form.getByLabel('Tarih').fill(lastMonth)
  await form.getByLabel('Açıklama / iş yeri').fill('Maaş')
  await form.getByLabel(/Her ay tekrarlansın/).check()
  await form.getByRole('button', { name: 'Kaydet', exact: true }).click()
  await expect(form).toBeHidden()

  // Bu ay elle gelir girilmedi: düzenli gelir özete yansır
  await open(page)
  const hero = page.locator('section[aria-labelledby="net-title"]')
  await expect(hero).toContainText('Gelir30.000,00 ₺')
  await open(page, 'islemler')
  await expect(page.getByRole('row', { name: /Maaş/ }).first()).toContainText('Düzenli gelir')
  await page.getByRole('button', { name: 'Maaş düzenle' }).first().click()
  const view = page.getByRole('dialog', { name: 'Düzenli gelir' })
  await expect(view).toContainText('iki kez sayılmaz')
  await page.keyboard.press('Escape')

  // Bu ay elle girilirse planlı gelir düşer, iki kez sayılmaz
  await open(page)
  await page.getByRole('button', { name: 'Yeni ekle' }).click()
  await page.getByRole('dialog', { name: 'Ne eklemek istersiniz?' }).getByRole('button', { name: /^Gelir/ }).click()
  const again = page.getByRole('dialog', { name: 'Gelir ekle' })
  await again.getByLabel('Tutar (TL)').fill('31.000')
  await again.getByLabel('Açıklama / iş yeri').fill('Maaş Ekim')
  await again.getByRole('button', { name: 'Kaydet', exact: true }).click()
  await expect(hero).toContainText('Gelir31.000,00 ₺')

  // Ayarlar: listede görünür, silinince bir daha eklenmez
  await open(page, 'ayarlar')
  const card = page.getByRole('region', { name: 'Düzenli gelirler' })
  await expect(card.getByRole('list', { name: 'Düzenli gelir listesi' })).toContainText('Maaş')
  await expect(card).toContainText(`her ayın ${day}. günü`)
  await card.getByRole('button', { name: 'Maaş sil' }).click()
  await expect(card.getByRole('list', { name: 'Düzenli gelir listesi' })).toHaveCount(0)
  await card.getByRole('button', { name: 'Düzenli gelir ekle' }).click()
  await card.getByLabel('Ad').fill('Kira geliri')
  await card.getByLabel('Tür').selectOption({ label: 'Kira geliri' })
  await card.getByLabel('Tutar (TL)').fill('12.000')
  await card.getByRole('button', { name: 'Kaydet' }).click()
  await expect(card.getByRole('list', { name: 'Düzenli gelir listesi' })).toContainText('12.000,00 ₺')
})
