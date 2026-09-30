import { addMonths, currentMonth, dayOf, daysInMonth, parseMonthKey, todayIso, toIsoDate } from '../domain/dates'
import { normalizeText } from '../domain/normalize'
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
  ['İSTANBULKART DOLUM', 'cat-ulasim', 200, 500, 2],
  ['BİTAKSİ', 'cat-ulasim', 140, 420, 1],
  ['ENERJİSA ELEKTRİK', 'cat-faturalar', 650, 1350, 1],
  ['İGDAŞ DOĞALGAZ', 'cat-faturalar', 300, 1900, 1],
  ['TURKCELL FATURA', 'cat-faturalar', 390, 390, 1],
  ['ECZANE YAŞAM', 'cat-saglik', 90, 640, 1],
  ['DEFACTO', 'cat-giyim', 350, 1600, 1],
  ['EBEBEK', 'cat-bebek', 250, 1200, 1],
  ['CİNEMAXİMUM', 'cat-eglence', 280, 560, 1],
  ['NETFLIX.COM', 'cat-abonelik', 229.99, 229.99, 1],
  ['SPOTIFY', 'cat-abonelik', 99.99, 99.99, 1],
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
      accountAlias: 'Demo Kart',
      createdAt: now,
      updatedAt: now,
      ...extra,
    })
  }
  for (let back = 3; back >= 0; back--) {
    const month = addMonths(cur, -back)
    const { year, month: m } = parseMonthKey(month)
    const lastDay = back === 0 ? dayOf(today) : daysInMonth(year, m)
    add(toIsoDate(year, m, 1), 18500, 'KİRA ÖDEMESİ', 'cat-kira', 'expense', { paymentMethod: 'debit', accountAlias: undefined })
    for (const [desc, cat, min, max, avg] of MERCHANTS) {
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
      add(toIsoDate(year, m, 12), 1000, `TEKNOSA ATAŞEHİR (${inst}/12 TAKSİT)`, 'cat-diger', 'expense', { installment: { current: inst, total: 12, purchaseTotalKurus: 1200000 } })
      add(toIsoDate(year, m, Math.min(lastDay, 10)), 9500 + rand() * 3000, 'ÖDEMENİZ İÇİN TEŞEKKÜR EDERİZ', null, 'transfer')
    }
    if (back === 0 && lastDay >= 22) add(toIsoDate(year, m, 22), 189.9, 'EBEBEK İADE', 'cat-bebek', 'refund')
    if (back === 1) add(toIsoDate(year, m, Math.min(lastDay, 18)), 449.9, 'DEFACTO İADE', 'cat-giyim', 'refund')
  }
  await repo.db.transaction('rw', repo.db.transactions, repo.db.settings, async () => {
    await repo.db.transactions.bulkAdd(txs)
    await repo.db.settings.put({ id: 'settings', monthlyBudgetKurus: 4500000, updatedAt: now })
  })
}

export async function resetDemoData(repo: AtlasRepository): Promise<void> {
  if (!repo.isDemo) throw new Error('Yalnızca demo verisi sıfırlanabilir.')
  await repo.clearAll()
  await seedDemoData(repo)
}
