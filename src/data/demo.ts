import { addMonths, currentMonth, dayOf, daysInMonth, parseMonthKey, todayIso, toIsoDate } from '../domain/dates'
import { normalizeText } from '../domain/normalize'
import { tt, ttf } from '../lib/i18n'
import { pick } from '../lib/currency'
import type { Transaction } from '../domain/types'
import type { AtlasRepository } from './repository'

/** Demo modu için örnek veriler. Yalnızca ayrı demo veritabanına yazılır. */
const MERCHANTS: Array<[string, string, number, number, number]> = [
  // açıklama, kategori, min TL, max TL, ayda ortalama adet
  ['MİGROS KADIKÖY', 'cat-market', 180, 1450, 5],
  ['BİM A.Ş. MODA', 'cat-market', 60, 420, 4],
  ['A101 YENİ MAĞAZACILIK', 'cat-market', 45, 260, 3],
  ['SHELL ATAŞEHİR', 'cat-akaryakit', 900, 2100, 2],
  ['OPET KOZYATAĞI', 'cat-akaryakit', 800, 1900, 1],
  ['STARBUCKS BAĞDAT CAD', 'cat-restoran', 95, 260, 4],
  ['KAHVE DÜNYASI', 'cat-restoran', 80, 190, 2],
  ['YEMEKSEPETİ', 'cat-restoran', 240, 780, 3],
  [tt('İSTANBULKART DOLUM'), 'cat-ulasim', 200, 500, 2],
  ['BİTAKSİ', 'cat-ulasim', 140, 420, 1],
  [tt('ENERJİSA ELEKTRİK'), 'cat-faturalar', 650, 1350, 1],
  [tt('İGDAŞ DOĞALGAZ'), 'cat-faturalar', 300, 1900, 1],
  ['TURKCELL FATURA', 'cat-faturalar', 390, 390, 1],
  [tt('ECZANE YAŞAM'), 'cat-saglik', 90, 640, 1],
  ['DEFACTO', 'cat-giyim', 350, 1600, 1],
  ['EBEBEK', 'cat-bebek', 250, 1200, 1],
  ['CİNEMAXİMUM', 'cat-eglence', 280, 560, 1],
  ['NETFLIX.COM', 'cat-abonelik', 229.99, 229.99, 1],
  ['SPOTIFY', 'cat-abonelik', 99.99, 99.99, 1],
]

/** Ana para birimi USD ise ABD'den örnek harcamalar (dolar). */
const MERCHANTS_USD: Array<[string, string, number, number, number]> = [
  ['WHOLE FOODS MARKET', 'cat-market', 18, 140, 5],
  ['TRADER JOES', 'cat-market', 12, 85, 4],
  ['TARGET', 'cat-market', 9, 60, 3],
  ['SHELL OIL', 'cat-akaryakit', 35, 70, 2],
  ['CHEVRON', 'cat-akaryakit', 30, 65, 1],
  ['STARBUCKS', 'cat-restoran', 5, 14, 4],
  ['BLUE BOTTLE COFFEE', 'cat-restoran', 5, 11, 2],
  ['DOORDASH', 'cat-restoran', 22, 58, 3],
  ['MTA METROCARD', 'cat-ulasim', 20, 40, 2],
  ['UBER', 'cat-ulasim', 12, 38, 1],
  ['CON EDISON ELECTRIC', 'cat-faturalar', 70, 140, 1],
  ['NATIONAL GRID GAS', 'cat-faturalar', 30, 120, 1],
  ['VERIZON WIRELESS', 'cat-faturalar', 65, 65, 1],
  ['CVS PHARMACY', 'cat-saglik', 8, 45, 1],
  ['UNIQLO', 'cat-giyim', 25, 120, 1],
  ['BUY BUY BABY', 'cat-bebek', 20, 95, 1],
  ['AMC THEATRES', 'cat-eglence', 18, 40, 1],
  ['NETFLIX.COM', 'cat-abonelik', 15.49, 15.49, 1],
  ['SPOTIFY', 'cat-abonelik', 11.99, 11.99, 1],
]

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

const SHARED_CATEGORIES = new Set(['cat-kira', 'cat-market', 'cat-faturalar', 'cat-bebek'])

export async function seedDemoData(repo: AtlasRepository): Promise<void> {
  const rand = rng(20260930)
  const now = new Date().toISOString()
  const today = todayIso()
  const cur = currentMonth()
  const txs: Transaction[] = []
  const add = (date: string, lira: number, description: string, categoryId: string | null, type: Transaction['type'] = 'expense', extra: Partial<Transaction> = {}) => {
    txs.push({
      id: crypto.randomUUID(),
      date,
      amountKurus: Math.round(lira * 100),
      type,
      description,
      normalizedDescription: normalizeText(description),
      categoryId,
      categorySource: 'manual',
      // Ev giderleri "Ortak", kişisel harcamalar "Bireysel" grubunda
      groupId: type === 'transfer' ? null : SHARED_CATEGORIES.has(categoryId ?? '') ? 'grp-ortak' : 'grp-bireysel',
      source: 'demo',
      paymentMethod: 'credit',
      accountAlias: tt('Demo Kart'),
      createdAt: now,
      updatedAt: now,
      ...extra,
    })
  }
  for (let back = 3; back >= 0; back--) {
    const month = addMonths(cur, -back)
    const { year, month: m } = parseMonthKey(month)
    const lastDay = back === 0 ? dayOf(today) : daysInMonth(year, m)
    add(toIsoDate(year, m, 1), pick(18500, 1850), tt('KİRA ÖDEMESİ'), 'cat-kira', 'expense', { paymentMethod: 'debit', accountAlias: undefined })
    for (const [desc, cat, min, max, avg] of pick(MERCHANTS, MERCHANTS_USD)) {
      const count = Math.max(0, Math.round(avg * (0.6 + rand() * 0.8) * (lastDay / daysInMonth(year, m))))
      for (let i = 0; i < count; i++) {
        const day = 1 + Math.floor(rand() * lastDay)
        const amt = min === max ? min : Math.round((min + rand() * (max - min)) * 100) / 100
        add(toIsoDate(year, m, day), amt, desc, cat)
      }
    }
    if (lastDay >= 12) {
      // 12.000 TL'lik alışverişin yalnızca o ayki taksidi (1.000 TL) gider olarak yazılır.
      const inst = 6 - back
      add(toIsoDate(year, m, 12), pick(1000, 100), pick(ttf('TEKNOSA ATAŞEHİR ({0}/12 TAKSİT)', inst), `BEST BUY (${inst}/12 INSTALLMENT)`), 'cat-diger', 'expense', { installment: { current: inst, total: 12, purchaseTotalKurus: pick(1200000, 120000) } })
      add(toIsoDate(year, m, Math.min(lastDay, 10)), pick(9500 + rand() * 3000, 950 + rand() * 300), tt('ÖDEMENİZ İÇİN TEŞEKKÜR EDERİZ'), null, 'transfer')
    }
    if (back === 0 && lastDay >= 22) add(toIsoDate(year, m, 22), pick(189.9, 18.99), pick(tt('EBEBEK İADE'), 'BUY BUY BABY REFUND'), 'cat-bebek', 'refund')
    if (back === 1) add(toIsoDate(year, m, Math.min(lastDay, 18)), pick(449.9, 44.99), pick(tt('DEFACTO İADE'), 'UNIQLO REFUND'), 'cat-giyim', 'refund')
  }
  await repo.db.transaction('rw', repo.db.transactions, repo.db.settings, async () => {
    await repo.db.transactions.bulkAdd(txs)
    await repo.db.settings.put({ id: 'settings', monthlyBudgetKurus: pick(4500000, 450000), updatedAt: now })
  })
}

export async function resetDemoData(repo: AtlasRepository): Promise<void> {
  if (!repo.isDemo) throw new Error(tt('Yalnızca demo verisi sıfırlanabilir.'))
  await repo.clearAll()
  await seedDemoData(repo)
}
