import { expect, test } from '@playwright/test'
import { open } from './helpers'

test('mobil: alt menü, Gider ekle düğmesi, kart listesi, yatay taşma yok', async ({ page }) => {
  await open(page)
  const nav = page.getByRole('navigation', { name: 'Alt menü' })
  await expect(nav).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeHidden()

  await nav.getByRole('button', { name: 'Gider ekle' }).click()
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
