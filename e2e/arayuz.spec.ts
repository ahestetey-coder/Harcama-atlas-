import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { addExpense, open } from './helpers'

test('koyu tema seçilir ve yenilemeden sonra korunur', async ({ page }) => {
  await open(page, 'ayarlar')
  await page.getByRole('radiogroup', { name: 'Tema' }).getByRole('radio', { name: 'Koyu' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(bg).not.toBe('rgb(255, 255, 255)')
})

test('klavye: form modalı odak tuzağı, Esc ile kapanır ve odak geri döner', async ({ page }) => {
  await open(page)
  const trigger = page.getByRole('button', { name: 'Gider ekle' }).first()
  await trigger.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Gider ekle' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Tutar (TL)')).toBeFocused()
  // Odak modal dışına çıkmaz
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab')
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
})

test('klavye ile gider ekleme (fare kullanmadan)', async ({ page }) => {
  await open(page, 'islemler')
  await page.getByRole('button', { name: 'Gider ekle' }).first().focus()
  await page.keyboard.press('Enter')
  await page.keyboard.type('55,5')
  const dialog = page.getByRole('dialog', { name: 'Gider ekle' })
  await dialog.getByLabel('Açıklama / iş yeri').focus()
  await page.keyboard.type('Klavye Kırtasiye')
  await dialog.getByLabel('Kategori').focus()
  await dialog.getByLabel('Kategori').selectOption({ label: 'Eğitim' })
  // Metin alanında Enter formu gönderir
  await dialog.getByLabel('Açıklama / iş yeri').focus()
  await page.keyboard.press('Enter')
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('row', { name: /Klavye Kırtasiye/ })).toContainText('55,50')
})

test('yedek al, bütün verileri sil (SİL onayı) ve yedekten geri yükle', async ({ page }) => {
  await open(page)
  await addExpense(page, { amount: '999,99', description: 'Yedeklenecek', category: 'Sağlık' })
  await expect(page.getByRole('dialog')).toBeHidden()
  await open(page, 'yedekleme')
  await expect(page.getByText('Tarayıcı verilerini silmek kayıtlarınızı da siler')).toBeVisible()

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'JSON yedeği indir' }).click()])
  const file = await download.path()
  const json = JSON.parse(fs.readFileSync(file, 'utf8'))
  expect(json.format).toBe('harcama-atlasi-yedek')
  expect(json.data.transactions).toHaveLength(1)

  await page.getByRole('button', { name: 'Verileri sil…' }).click()
  const wipe = page.getByRole('dialog', { name: 'Bütün veriler silinsin mi?' })
  await expect(wipe.getByRole('button', { name: 'Kalıcı olarak sil' })).toBeDisabled()
  await wipe.getByLabel('Onay').fill('sil')
  await wipe.getByRole('button', { name: 'Kalıcı olarak sil' }).click()
  await expect(wipe).toBeHidden()
  await open(page, 'islemler')
  await expect(page.getByRole('row', { name: /Yedeklenecek/ })).toHaveCount(0)

  await open(page, 'yedekleme')
  await page.locator('#restore-file').setInputFiles(file)
  const preview = page.getByRole('dialog', { name: 'Yedeği geri yükle' })
  await expect(preview.getByRole('row', { name: /İşlem/ })).toContainText('1')
  await preview.getByRole('button', { name: 'Birleştir' }).last().click()
  await expect(preview).toBeHidden()
  await open(page, 'islemler')
  await expect(page.getByRole('row', { name: /Yedeklenecek/ })).toContainText('999,99')
})

test('bozuk yedek dosyası reddedilir, veri değişmez', async ({ page }) => {
  await open(page, 'yedekleme')
  // Not: Türkçe karakterli test klasörü yolu dosya seçiciye aktarılırken sorun çıkardığı için ASCII geçici klasör
  const bad = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ha-')), 'bozuk.json')
  fs.writeFileSync(bad, JSON.stringify({ format: 'harcama-atlasi-yedek', backupVersion: 1, data: { transactions: [{ id: 1 }] } }))
  await page.locator('#restore-file').setInputFiles(bad)
  await expect(page.getByText('Yedek dosyasının yapısı bozuk veya eksik.')).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Yedeği geri yükle' })).toHaveCount(0)
})

test('demo modu gerçek verilerle karışmaz', async ({ page }) => {
  await open(page)
  await addExpense(page, { amount: '12', description: 'Gerçek Kayıt', category: 'Market' })
  await expect(page.getByRole('dialog')).toBeHidden()
  await open(page, 'ayarlar')
  await page.getByRole('switch', { name: 'Demo modu' }).click()
  await expect(page.getByText(/Demo modu: gösterilen kayıtlar örnektir/)).toBeVisible()
  await open(page, 'islemler')
  await expect(page.getByRole('row', { name: /Gerçek Kayıt/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Demo modunu kapat' }).click()
  await open(page, 'islemler')
  await expect(page.getByRole('row', { name: /Gerçek Kayıt/ })).toHaveCount(1)
})

test('CSV dışa aktarma formül enjeksiyonuna karşı korunur', async ({ page }) => {
  await open(page, 'islemler')
  await addExpense(page, { amount: '5', description: '=1+2 Deneme', category: 'Market' })
  await expect(page.getByRole('dialog')).toBeHidden()
  await page.getByRole('button', { name: /^Filtreler(,|$)/ }).click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('dialog', { name: 'Filtreler' }).getByRole('button', { name: 'CSV indir' }).click()])
  const text = fs.readFileSync((await download.path())!, 'utf8')
  expect(text).toContain("'=1+2 Deneme")
})
