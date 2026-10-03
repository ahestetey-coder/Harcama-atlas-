import { expect, test } from '@playwright/test'
import { open } from './helpers'

test('mobil: alt menü, Ekle menüsü, kart listesi, yatay taşma yok', async ({ page }) => {
  await open(page)
  const nav = page.getByRole('navigation', { name: 'Alt menü' })
  await expect(nav).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeHidden()

  await nav.getByRole('button', { name: 'Ekle', exact: true }).click()
  await page.getByRole('dialog', { name: 'Ne eklemek istersiniz?' }).getByRole('button', { name: /^Gider/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Gider ekle' })
  await dialog.getByLabel('Tutar (TL)').fill('45,90')
  await dialog.getByLabel('Açıklama / iş yeri').fill('Mobil Fırın')
  await dialog.getByLabel('Kategori').selectOption({ label: 'Market' })
  await dialog.getByRole('button', { name: 'Kaydet', exact: true }).click()
  await expect(dialog).toBeHidden()

  await nav.getByRole('link', { name: 'İşlemler' }).click()
  await expect(page.getByRole('button', { name: /Mobil Fırın, 45,90 ₺, düzenle/ })).toBeVisible()
  await expect(page.getByRole('table')).toBeHidden()

  for (const r of ['', 'islemler', 'ice-aktar', 'kategoriler', 'aktarimlar', 'yedekleme', 'ayarlar']) {
    await page.goto('./#/' + r)
    await page.waitForTimeout(300)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, `/${r} yatay taşma`).toBeLessThanOrEqual(0)
  }
})

test('mobil: "Daha fazla" menüsünden sayfalara gidilir', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Daha fazla' }).click()
  await page.getByRole('dialog', { name: 'Menü' }).getByRole('button', { name: /Yedekleme/ }).click()
  await expect(page.getByRole('heading', { name: 'Yedekleme ve veri' })).toBeVisible()
})

test('mobil: Ekle menüsünden iade, kategori ve grup eklenir', async ({ page }) => {
  await open(page)
  const nav = page.getByRole('navigation', { name: 'Alt menü' })
  const sheet = page.getByRole('dialog', { name: 'Ne eklemek istersiniz?' })

  await nav.getByRole('button', { name: 'Ekle', exact: true }).click()
  await sheet.getByRole('button', { name: /^İade/ }).click()
  await expect(page.getByRole('dialog', { name: 'İade ekle' })).toBeVisible()
  await page.keyboard.press('Escape')

  await nav.getByRole('button', { name: 'Ekle', exact: true }).click()
  await sheet.getByRole('button', { name: /^Kategori/ }).click()
  await expect(page.getByRole('dialog', { name: 'Yeni kategori' })).toBeVisible()
  await expect(page).not.toHaveURL(/yeni=1/)
  await page.keyboard.press('Escape')

  await nav.getByRole('button', { name: 'Ekle', exact: true }).click()
  await sheet.getByRole('button', { name: /^Grup/ }).click()
  await expect(page).toHaveURL(/bolum=groups/)
  await expect(page.getByRole('dialog', { name: /grup/i })).toBeVisible()
})

test('mobil: Ekle menüsünden ekstre seçince içe aktarma başlar', async ({ page }) => {
  await open(page)
  await page.getByRole('navigation', { name: 'Alt menü' }).getByRole('button', { name: 'Ekle', exact: true }).click()
  const csv = 'Tarih;Açıklama;Tutar\n01.09.2026;HIZLI MARKET;-12,50\n'
  await page.getByLabel('Ekstre dosyası seçin').setInputFiles({ name: 'ornek.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  await expect(page).toHaveURL(/ice-aktar/)
  await expect(page.getByRole('heading', { name: 'Sütunları eşleştirin' })).toBeVisible()
})
