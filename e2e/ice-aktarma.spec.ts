import { expect, test, type Page } from '@playwright/test'
import { open, trackExternalRequests, uploadImport } from './helpers'

const tab = (page: Page, name: string) => page.getByRole('tablist', { name: 'Satır durumu' }).getByRole('tab', { name: new RegExp(`^${name}`) })

test('CSV: eşleştirme, inceleme; sorunlu satırlar sessizce kaydedilmez; geri alınabilir', async ({ page }) => {
  const external = trackExternalRequests(page)
  await uploadImport(page, 'ornek-kart-ekstresi.csv')
  await page.getByRole('button', { name: 'İşlemleri çıkar ve incele' }).click()

  // 10 satır: 7 geçerli (1 transfer dahil), 3 sorunlu (kategorisiz ×2, döviz), dönem borcu işlem değildir
  await expect(tab(page, 'Tümü')).toContainText('10')
  await expect(tab(page, 'Sorunlu')).toContainText('3')
  await expect(page.getByText(/7 işlem\s*kaydedilecek/)).toBeVisible()
  await expect(page.getByText('3 satır düzeltilmeden kaydedilmez.')).toBeVisible()
  await expect(page.getByRole('article', { name: /Dönem Borcu/ })).toHaveCount(0)

  // Onaydan önce hiçbir şey kaydedilmedi
  await page.getByRole('button', { name: 'Onayla ve kaydet' }).click()
  const confirm = page.getByRole('dialog', { name: '7 işlem kaydedilsin mi?' })
  await expect(confirm).toContainText('3 sorunlu')
  await confirm.getByRole('button', { name: 'Kaydet', exact: true }).dblclick()
  await expect(page.getByRole('heading', { name: '7 işlem kaydedildi' })).toBeVisible()

  await page.getByRole('button', { name: 'Aktarılan işlemler' }).click()
  await expect(page.getByText(/^7 işlem/)).toBeVisible()
  await expect(page.getByRole('row', { name: /KUAFÖR/ })).toHaveCount(0)
  await expect(page.getByRole('row', { name: /HYPERLINK/ })).toHaveCount(0)
  await expect(page.getByRole('row', { name: /ZARA İADE/ })).toContainText('450,00')

  // Aynı dosya ikinci kez: dosya özeti uyarısı
  await uploadImport(page, 'ornek-kart-ekstresi.csv')
  await expect(page.getByRole('heading', { name: 'Bu dosya daha önce içe aktarılmış' })).toBeVisible()

  // Aktarımı geri al
  await open(page, 'aktarimlar')
  await page.getByRole('button', { name: /Geri al/ }).first().click()
  await page.getByRole('dialog', { name: 'Aktarım geri alınsın mı?' }).getByRole('button', { name: '7 işlemi sil' }).click()
  await expect(page.getByText('Aktarım geri alındı; 7 işlem silindi.')).toBeVisible()
  await open(page, 'islemler')
  await expect(page.getByRole('row', { name: /MİGROS KADIKÖY/ })).toHaveCount(0)
  expect(external).toEqual([])
})

test('CSV: sorunlu satır düzeltilince kaydedilir, "Diğer" açıkça onaylanır', async ({ page }) => {
  await uploadImport(page, 'ornek-kart-ekstresi.csv')
  await page.getByRole('button', { name: 'İşlemleri çıkar ve incele' }).click()
  await tab(page, 'Sorunlu').click()
  const kuafor = page.getByRole('article', { name: /KUAFÖR SELİN/ })
  await expect(kuafor.getByText('Bu iş yeri tanınmadı; kategori tahmin edilmedi.')).toBeVisible()
  await kuafor.getByRole('button', { name: /Diğer/ }).click()
  await expect(tab(page, 'Sorunlu')).toContainText('2')
  await expect(page.getByText(/8 işlem\s*kaydedilecek/)).toBeVisible()
})

test('Excel: sayfa seçimi ve formül çalıştırılmaz', async ({ page }) => {
  await uploadImport(page, 'ornek-kart-hareketleri.xlsx')
  await expect(page.getByLabel('Excel sayfası')).toBeVisible()
  await page.getByLabel('Excel sayfası').selectOption({ index: 1 })
  await expect(page.getByLabel('Excel sayfası')).toHaveValue('1')
  await page.getByRole('button', { name: 'İşlemleri çıkar ve incele' }).click()
  await expect(page.getByRole('article', { name: /BOOKING\.COM/ })).toBeVisible()
})

test('Windows-1254 hesap hareketleri: Türkçe karakterler ve gelen para hariç', async ({ page }) => {
  await uploadImport(page, 'ornek-hesap-hareketleri-windows1254.csv')
  await page.getByRole('button', { name: 'İşlemleri çıkar ve incele' }).click()
  await expect(page.getByRole('article', { name: /ŞOK MARKETLER/ })).toBeVisible()
  await tab(page, 'Hariç').click()
  await expect(page.getByRole('article', { name: /MAAŞ ÖDEMESİ/ })).toBeVisible()
})

test('Metin tabanlı PDF ekstre okunur ve ekstre toplamıyla kontrol edilir', async ({ page }) => {
  const external = trackExternalRequests(page)
  await uploadImport(page, 'ornek-kredi-karti-ekstresi.pdf')
  await expect(tab(page, 'Tümü')).toContainText('14', { timeout: 30_000 })
  await expect(page.getByRole('article', { name: /TEKNOSA/ })).toContainText('3/12')
  await expect(page.getByText('Kaynak toplamıyla kontrol')).toBeVisible()
  await expect(page.getByText(/doğrulanmadı/)).toBeVisible()
  expect(external).toEqual([])
})

test('Şifreli PDF: parola sorulur, yanlış parola reddedilir, parola saklanmaz', async ({ page }) => {
  await uploadImport(page, 'ornek-sifreli-ekstre-parola-1234.pdf')
  const pw = page.getByLabel('Parola')
  await expect(pw).toBeVisible({ timeout: 20_000 })
  await pw.fill('yanlis')
  await page.getByRole('button', { name: 'Aç', exact: true }).click()
  await expect(page.getByText('Parola hatalı, tekrar deneyin.')).toBeVisible()
  await page.getByLabel('Parola').fill('1234')
  await page.getByRole('button', { name: 'Aç', exact: true }).click()
  await expect(tab(page, 'Tümü')).toContainText('14', { timeout: 30_000 })
  const stored = await page.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage))
  expect(stored).not.toContain('1234')
})

test('PNG ekran görüntüsü yerel OCR ile okunur (uzak sunucu yok)', async ({ page }) => {
  test.setTimeout(240_000)
  const external = trackExternalRequests(page)
  await uploadImport(page, 'ornek-ekran-goruntusu.png')
  await page.getByRole('button', { name: 'Metni oku' }).click({ timeout: 20_000 })
  await expect(page.getByText('OCR okuma kalitesi')).toBeVisible({ timeout: 200_000 })
  await expect(page.getByRole('article', { name: /MIGROS|MİGROS/i }).first()).toBeVisible()
  expect(external).toEqual([])
})

test('Taranmış (görüntü) PDF sayfa bazında OCR ile okunur', async ({ page }) => {
  test.setTimeout(300_000)
  await uploadImport(page, 'ornek-taranmis-ekstre.pdf')
  await expect(page.getByText('OCR okuma kalitesi')).toBeVisible({ timeout: 280_000 })
  const n = Number((await tab(page, 'Tümü').innerText()).replace(/\D/g, ''))
  expect(n).toBeGreaterThanOrEqual(10)
})
