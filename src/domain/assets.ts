import type { IsoDate } from './types'

/** Plus "Varlıklarım": elle girilen varlıklar ve borçlar. Döviz fiyatı TCMB kurundan, diğerleri kullanıcıdan gelir. */
export type AssetKind = 'deposit' | 'fx' | 'fund' | 'gold' | 'stock' | 'cash' | 'other' | 'debt'

/** Sabit sıra: dağılım grafiğinde renk bu sıraya göre verilir (sıralamaya göre değil). */
export const ASSET_KINDS: Exclude<AssetKind, 'debt'>[] = ['deposit', 'fx', 'fund', 'gold', 'stock', 'cash', 'other']

export const ASSET_KIND_LABEL: Record<AssetKind, string> = {
  deposit: 'Mevduat',
  fx: 'Döviz',
  fund: 'Fon',
  gold: 'Altın',
  stock: 'Hisse',
  cash: 'Nakit',
  other: 'Diğer',
  debt: 'Borç',
}

/** Varsayılan birimler (kullanıcı değiştirebilir). */
export const DEFAULT_UNIT: Record<AssetKind, string> = {
  deposit: 'TL',
  fx: 'USD',
  fund: 'pay',
  gold: 'gram',
  stock: 'lot',
  cash: 'TL',
  other: 'adet',
  debt: 'TL',
}

/** Bakiye gibi takip edilen türler: miktar TL, değer "güncel bakiye" olarak girilir. */
export const isBalanceKind = (k: AssetKind) => k === 'deposit' || k === 'cash' || k === 'debt'

export interface AssetTrade {
  id: string
  date: IsoDate
  side: 'buy' | 'sell'
  quantity: number
  /** Birim fiyat (kuruş; fon gibi küçük fiyatlar için kesirli olabilir). */
  unitPriceKurus: number
}

export interface AssetValuation {
  date: IsoDate
  unitPriceKurus: number
  /** Elle girilen ya da TCMB gösterge kurundan otomatik alınan fiyat. */
  source: ValuationSource
}

export type ValuationSource = 'manual' | 'tcmb'

export interface Asset {
  id: string
  kind: AssetKind
  name: string
  unit: string
  trades: AssetTrade[]
  valuations: AssetValuation[]
  note?: string
  /** Yalnızca borçlarda: aylık faiz ve aylık asgari ödeme/taksit (koçun borç planı için). */
  debtTerms?: DebtTerms
  archived: boolean
  createdAt: string
  updatedAt: string
}

export interface DebtTerms {
  /** Aylık faiz oranı (%), ör. kredi kartında 4,25. */
  monthlyRatePct: number
  /** Aylık asgari ödeme veya taksit (kuruş); bilinmiyorsa null. */
  minPaymentKurus: number | null
}

export interface PriceInfo {
  unitPriceKurus: number
  date: IsoDate
  source: ValuationSource | 'trade'
}

export interface HoldingSummary {
  quantity: number
  /** Eldeki miktarın ortalama maliyetle toplam maliyeti. */
  costKurus: number
  valueKurus: number
  /** Gerçekleşmemiş kâr/zarar: güncel değer − eldeki maliyet. */
  unrealizedKurus: number
  /** Gerçekleşen kâr/zarar: satışlar − satılanın ortalama maliyeti. */
  realizedKurus: number
  /** Net yatırılan: alışlar − satış gelirleri. */
  contributedKurus: number
  price: PriceInfo | null
}

const sortTrades = (t: AssetTrade[]) => t.slice().sort((a, b) => a.date.localeCompare(b.date) || (a.side === b.side ? 0 : a.side === 'buy' ? -1 : 1))

/** Belirli bir tarihteki (dahil) son bilinen fiyat: elle girilen değer, yoksa son alış/satış fiyatı. */
export function priceAt(asset: Asset, date: IsoDate): PriceInfo | null {
  let best: PriceInfo | null = null
  for (const v of asset.valuations) if (v.date <= date && (!best || v.date >= best.date)) best = { unitPriceKurus: v.unitPriceKurus, date: v.date, source: v.source }
  for (const t of asset.trades) if (t.date <= date && (!best || t.date > best.date)) best = { unitPriceKurus: t.unitPriceKurus, date: t.date, source: 'trade' }
  return best
}

/** Ortalama maliyet yöntemiyle özet. */
export function holdingSummary(asset: Asset, today: IsoDate): HoldingSummary {
  let qty = 0
  let cost = 0
  let realized = 0
  let contributed = 0
  for (const t of sortTrades(asset.trades)) {
    if (t.date > today) continue
    const amount = t.quantity * t.unitPriceKurus
    if (t.side === 'buy') {
      qty += t.quantity
      cost += amount
      contributed += amount
    } else {
      const q = Math.min(t.quantity, qty)
      const avg = qty > 0 ? cost / qty : 0
      realized += q * (t.unitPriceKurus - avg)
      cost -= q * avg
      qty -= q
      contributed -= q * t.unitPriceKurus
    }
  }
  if (qty < 1e-9) {
    qty = 0
    cost = 0
  }
  const price = priceAt(asset, today)
  const value = price ? Math.round(qty * price.unitPriceKurus) : Math.round(cost)
  return {
    quantity: qty,
    costKurus: Math.round(cost),
    valueKurus: value,
    unrealizedKurus: value - Math.round(cost),
    realizedKurus: Math.round(realized),
    contributedKurus: Math.round(contributed),
    price,
  }
}

/** Eldeki miktar (satış doğrulaması için). */
export function quantityAt(asset: Asset, date: IsoDate): number {
  return asset.trades.reduce((q, t) => (t.date <= date ? q + (t.side === 'buy' ? t.quantity : -t.quantity) : q), 0)
}

export interface Allocation {
  kind: Exclude<AssetKind, 'debt'>
  valueKurus: number
  share: number
}

export interface Portfolio {
  assetsKurus: number
  debtsKurus: number
  netWorthKurus: number
  contributedKurus: number
  unrealizedKurus: number
  realizedKurus: number
  allocation: Allocation[]
  /** En eski fiyat tarihi (değerlerin ne kadar güncel olduğu). */
  oldestPriceDate: IsoDate | null
}

export function portfolio(assets: Asset[], today: IsoDate, extraDebtKurus = 0): Portfolio {
  const byKind = new Map<AssetKind, number>()
  let assetsTotal = 0
  let debts = extraDebtKurus
  let contributed = 0
  let unrealized = 0
  let realized = 0
  let oldest: IsoDate | null = null
  for (const a of assets) {
    if (a.archived) continue
    const s = holdingSummary(a, today)
    if (a.kind === 'debt') {
      debts += s.valueKurus
      continue
    }
    assetsTotal += s.valueKurus
    byKind.set(a.kind, (byKind.get(a.kind) ?? 0) + s.valueKurus)
    contributed += s.contributedKurus
    realized += s.realizedKurus
    // Mevduat/nakit faizi de kazanç sayılır (bakiye − yatırılan)
    unrealized += s.unrealizedKurus
    if (s.quantity > 0 && s.price && (!oldest || s.price.date < oldest)) oldest = s.price.date
  }
  const allocation = ASSET_KINDS.map((kind) => ({ kind, valueKurus: byKind.get(kind) ?? 0, share: assetsTotal > 0 ? (byKind.get(kind) ?? 0) / assetsTotal : 0 })).filter((x) => x.valueKurus > 0)
  return { assetsKurus: assetsTotal, debtsKurus: debts, netWorthKurus: assetsTotal - debts, contributedKurus: contributed, unrealizedKurus: unrealized, realizedKurus: realized, allocation, oldestPriceDate: oldest }
}

export interface HistoryPoint {
  date: IsoDate
  valueKurus: number
  contributedKurus: number
}

/**
 * Zaman içindeki değer: yalnızca kullanıcının işlem veya fiyat girdiği günler için, o güne kadar
 * bilinen son fiyatlarla hesaplanır. Ara günler için değer uydurulmaz. Borçlar dahil değildir.
 */
export function valueHistory(assets: Asset[], today: IsoDate): HistoryPoint[] {
  const list = assets.filter((a) => !a.archived && a.kind !== 'debt')
  const dates = new Set<IsoDate>()
  for (const a of list) {
    for (const t of a.trades) if (t.date <= today) dates.add(t.date)
    for (const v of a.valuations) if (v.date <= today) dates.add(v.date)
  }
  return [...dates].sort().map((date) => {
    let value = 0
    let contributed = 0
    for (const a of list) {
      const s = holdingSummary(a, date)
      value += s.valueKurus
      contributed += s.contributedKurus
    }
    return { date, valueKurus: value, contributedKurus: contributed }
  })
}

/** Türkçe miktar: "1,25", "1.250,5", "0.5" → sayı (en çok 6 ondalık). */
export function parseQuantity(input: string): number | null {
  let s = input.trim().replace(/\s/g, '')
  if (!s) return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  if (!/^\d+(\.\d+)?$/.test(s)) return null
  const n = Number(s)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 1e6) / 1e6
}

export function formatQuantity(n: number): string {
  return n.toLocaleString('tr-TR', { maximumFractionDigits: 6 })
}

/** Birim fiyat: 2 haneden küçük fiyatlarda (fon) daha çok ondalık gösterilir. */
export function formatUnitPrice(kurus: number): string {
  const tl = kurus / 100
  return `${tl.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: tl < 10 ? 6 : 2 })} ₺`
}

// ---------- Otomatik döviz fiyatı (TCMB gösterge kuru) ----------

export interface MarketRate {
  /** ISO döviz kodu (USD, EUR…). */
  code: string
  /** 1 birimin TL karşılığı. */
  valueTl: number
}

/** Otomatik fiyatı alınabilen varlıklarda döviz kodu: yalnızca döviz türünde ve birimi kod olanlar. */
export function autoPriceCode(asset: Pick<Asset, 'kind' | 'unit'>): string | null {
  if (asset.kind !== 'fx') return null
  const code = asset.unit.trim().toUpperCase()
  return /^[A-Z]{3}$/.test(code) ? code : null
}

export interface RateUpdate {
  assetId: string
  valuation: AssetValuation
}

/**
 * Kurlarla yazılacak fiyatlar. Aynı gün elle girilmiş fiyatın üzerine yazılmaz; aynı fiyat
 * zaten kayıtlıysa da tekrar yazılmaz. Arşivlenmiş ya da kur listesinde olmayanlar atlanır.
 */
export function rateUpdates(assets: Asset[], rates: MarketRate[], date: IsoDate): RateUpdate[] {
  const byCode = new Map(rates.map((r) => [r.code.toUpperCase(), r.valueTl]))
  const out: RateUpdate[] = []
  for (const a of assets) {
    if (a.archived) continue
    const code = autoPriceCode(a)
    const tl = code ? byCode.get(code) : undefined
    if (!tl || !Number.isFinite(tl) || tl <= 0) continue
    const unitPriceKurus = Math.round(tl * 100 * 1e4) / 1e4
    const same = a.valuations.find((v) => v.date === date)
    if (same && (same.source === 'manual' || same.unitPriceKurus === unitPriceKurus)) continue
    out.push({ assetId: a.id, valuation: { date, unitPriceKurus, source: 'tcmb' } })
  }
  return out
}
