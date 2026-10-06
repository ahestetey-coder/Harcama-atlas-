import { expect, test } from '@playwright/test'
import { addExpense, open } from './helpers'

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
  await page.goto('./#/odemeler')
  await expect(page.getByRole('heading', { name: 'Düzenli ödemeler', level: 1 })).toBeVisible()
  await expect(page.getByText('Henüz düzenli ödeme yok')).toBeVisible()

  const tomorrow = await page.evaluate(() => {
    const d = new Date(Date.now() + 86_400_000)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  await page.getByRole('button', { name: 'Ekle', exact: true }).click()
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
