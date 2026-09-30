import { expect, type Page } from '@playwright/test'
import path from 'node:path'

export const SAMPLES = path.resolve('public/ornek-dosyalar')
export const sample = (name: string) => path.join(SAMPLES, name)

/** Uygulamayı temiz bir IndexedDB ile açar (her test kendi tarayıcı bağlamındadır). */
export async function open(page: Page, route = '') {
  await page.goto('./#/' + route)
  await expect(page.getByRole('navigation', { name: /Ana menü|Alt menü/ }).first()).toBeVisible()
  await expect(page.locator('main h1')).toHaveCount(1)
  await page.waitForLoadState('networkidle')
  // Sayfa geçiş animasyonu bitene kadar bekle (çıkan sayfanın öğeleriyle karışmasın)
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))
}

/** Uygulama dışındaki bir adrese giden istekleri yakalar (gizlilik kontrolü). */
export function trackExternalRequests(page: Page): string[] {
  const external: string[] = []
  page.on('request', (r) => {
    const u = new URL(r.url())
    if (!['localhost', '127.0.0.1'].includes(u.hostname) && !u.protocol.startsWith('blob') && !u.protocol.startsWith('data')) external.push(r.url())
  })
  return external
}

export async function addExpense(page: Page, o: { amount: string; description: string; category?: string; date?: string; group?: string }) {
  await page.getByRole('button', { name: 'Gider ekle' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Gider ekle' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Tutar (TL)').fill(o.amount)
  if (o.date) await dialog.getByLabel('Tarih').fill(o.date)
  await dialog.getByLabel('Açıklama / iş yeri').fill(o.description)
  if (o.category) await dialog.getByLabel('Kategori').selectOption({ label: o.category })
  if (o.group) await dialog.getByRole('radiogroup', { name: 'Harcama grubu' }).getByRole('radio', { name: o.group }).click()
  await dialog.getByRole('button', { name: 'Kaydet', exact: true }).click()
  return dialog
}

export async function uploadImport(page: Page, file: string) {
  await open(page, 'ice-aktar')
  await page.getByLabel('İçe aktarılacak dosyayı seçin').setInputFiles(sample(file))
}
