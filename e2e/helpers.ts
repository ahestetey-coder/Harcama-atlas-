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
  // Sayfa geçiş animasyonu bitene kadar bekle (çıkan sayfanın öğeleriyle karışmasın); süresiz süs animasyonları sayılmaz
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity))
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

/** İşlemler sayfasındaki özet kutuları: işlem sayısı ve (isteğe bağlı) net gider. */
export async function expectTxTotals(page: Page, count: number, gider?: string) {
  await expect(page.getByRole('group', { name: 'İşlem', exact: true }).locator('div').nth(1)).toHaveText(String(count))
  if (gider) await expect(page.getByRole('group', { name: 'Gider', exact: true }).locator('div').nth(1)).toHaveText(gider)
}

/** İşlemler sayfasında filtre penceresini açıp kategori seçer (boşsa "Tümü"). */
export async function filterCategory(page: Page, label: string | null) {
  await page.getByRole('button', { name: /^Filtreler(,|$)/ }).click()
  const dlg = page.getByRole('dialog', { name: 'Filtreler' })
  if (label) await dlg.getByLabel('Kategori', { exact: true }).selectOption({ label })
  else await dlg.getByLabel('Kategori', { exact: true }).selectOption({ index: 0 })
  await dlg.getByRole('button', { name: /^Göster/ }).click()
  await expect(dlg).toBeHidden()
}

/** 10 soruyu ve iki ara durağı aynı cevaplarla geçer (web ve uygulama içi test aynı). */
export async function answerQuestions(page: Page) {
  await page.getByRole('button', { name: 'Özgürlük rotamı çıkar' }).click()

  await page.getByRole('button', { name: 'Çalışmasam da geçinebilmek' }).click()
  await expect(page.getByRole('heading', { name: 'Ayda ne kadar pasif gelir seni özgür hissettirir?' })).toBeVisible()
  await page.getByRole('button', { name: 'Devam' }).click()
  // Ara durak 1
  await expect(page.getByRole('heading', { name: 'Zirven belirdi.' })).toBeVisible()
  await page.getByRole('button', { name: 'Konumumu bul' }).click()

  await page.getByRole('button', { name: '50.000 – 100.000 TL' }).click()
  await page.getByRole('button', { name: "Gelirimin %10–20'si" }).click()
  await page.getByRole('button', { name: 'Kredi taksitlerim var, rahat ödüyorum' }).click()
  await page.getByRole('button', { name: '1 – 3 ay' }).click()
  // Ara durak 2: cevaplara göre ipucu
  await expect(page.getByRole('heading', { name: 'Yarıyı geçtin.' })).toBeVisible()
  await expect(page.getByText('İlk ipucun: İyi bir tempon var.')).toBeVisible()
  await page.getByRole('button', { name: 'Son 4 soru' }).click()

  await page.getByRole('button', { name: '100.000 – 500.000 TL' }).click()
  await page.getByRole('button', { name: 'Altın' }).click()
  await page.getByRole('button', { name: 'Devam' }).click()
  await page.getByRole('button', { name: 'Ara sıra, para artarsa' }).click()
  await page.getByRole('button', { name: 'Sakin kalıp beklerim' }).click()
}

/**
 * Rotayı kurar: rota yoksa Finansal Harita testi çözülür, sonra 6 adımlık rota kurulumu doldurulur.
 * Gider yalnızca kira/konut satırına yazılır; testten tahmin edilen birikim sıfırlanır (uygulamada kayıt yoksa).
 */
export async function takeFreedomTest(page: Page, o: { income: string; essential: string; age?: string; years?: string }) {
  const t = page.getByRole('region', { name: 'Rota kurulumu' })
  const start = page.getByRole('link', { name: 'Özgürlük rotamı çıkar' })
  await expect(start.or(t)).toBeVisible()
  if (await start.isVisible()) {
    await start.click()
    await answerQuestions(page)
    await page.getByRole('button', { name: /Rotamı kur · 5 dk/ }).click()
  }
  const next = () => t.getByRole('button', { name: 'Onayla ve devam' }).click()
  await expect(t.getByRole('heading', { name: 'Gelirin' })).toBeVisible()
  await t.getByLabel('Aylık net ana gelir').fill(o.income)
  await t.getByLabel('Aylık ek gelir').fill('')
  await t.getByLabel('Çalışmadan gelen aylık gelir').fill('')
  await next()
  await expect(t.getByRole('heading', { name: 'Giderlerin' })).toBeVisible()
  // Liste boş başlar: + ile tür seçilir, tutar yazılır (testi yenilerken son satırlar dolu gelir)
  const rent = t.getByLabel('Kira / konut', { exact: true })
  if (!(await rent.count())) {
    await t.getByRole('button', { name: 'Gider ekle' }).click()
    await t.getByRole('group', { name: 'Gider kategorisi' }).getByRole('button', { name: 'Kira / konut' }).click()
  }
  await rent.fill(o.essential)
  await next()
  await expect(t.getByRole('heading', { name: 'Borçların' })).toBeVisible()
  await next()
  await expect(t.getByRole('heading', { name: 'Birikimin' })).toBeVisible()
  // Yatırımlarım'da kayıt varsa rota o kayıtlarla işlenir
  const useApp = t.getByRole('button', { name: 'Rotamı bu birikim verilerimle işle' })
  if (await useApp.count()) await useApp.click()
  for (const l of ['Acil durum fonu', 'Döviz', 'Altın', 'Hisse ve fon', 'Kripto', 'BES', 'Her ay düzenli yatırıma ayırdığın']) {
    const f = t.getByLabel(l, { exact: true })
    if (await f.count()) await f.fill('')
  }
  await next()
  await expect(t.getByRole('heading', { name: 'Hedefin' })).toBeVisible()
  await t.getByLabel('Yaşın').fill(o.age ?? '32')
  await t.getByLabel('Kaç yılda varmak istersin?').fill(o.years ?? '23')
  await next()
  await next()
  await expect(t.getByRole('heading', { name: 'Özgürlük hedefin' })).toBeVisible()
  await t.getByRole('button', { name: 'Rotamı hesapla' }).click()
  const fin = page.getByRole('region', { name: 'Netleşen haritan' })
  await fin.getByRole('button', { name: /Finansal özgürlük sayfama git|Rotamı gör/ }).click()
  await expect(t).toBeHidden()
}
