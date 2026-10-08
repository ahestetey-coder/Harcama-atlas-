import { ArrowDownUp, Banknote, Bitcoin, ChartCandlestick, ChartPie, Check, ChevronDown, Coins, DollarSign, Gem, Globe, Landmark, Package, Pencil, Sparkles, Plus, RefreshCw, Trash2, Wallet } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { PageHeader } from '../components/AppShell'
import { CategoryDonut, WealthLine } from '../components/charts/Charts'
import { PlanBadge, PlanGate } from '../components/PlanGate'
import { ConfirmDialog, Modal } from '../components/ui/Modal'
import { Alert, Badge, Button, Card, EmptyState, Field, IconButton, Input, Segmented, Select } from '../components/ui/primitives'
import { toUserMessage } from '../data/repository'
import {
  ASSET_KIND_LABEL,
  ASSET_KINDS,
  autoPriceCode,
  autoQuote,
  COMMODITIES,
  defaultMarket,
  hasAutoPrice,
  needsPrice,
  normalizeSymbol,
  SYMBOL_KINDS,
  QUOTE_MARKET_LABEL,
  DEFAULT_UNIT,
  formatQuantity,
  formatUnitPrice,
  holdingSummary,
  isBalanceKind,
  parseQuantity,
  portfolio,
  priceAt,
  valueHistory,
  type Asset,
  type AssetKind,
  type AssetQuote,
  type QuoteMarket,
  type DebtTerms,
  type DebtType,
  type DebtPayMode,
  type DebtPlan,
  debtPlanStatus,
  INSTALLMENT_DEBT,
  DEBT_TYPE_LABEL,
  DEBT_TYPES,
  debtTypeOf,
  type HoldingSummary,
} from '../domain/assets'
import { formatDate, todayIso } from '../domain/dates'
import { formatKurus, formatKurusPlain, parseUserAmount } from '../domain/money'
import { cn } from '../lib/cn'
import { useAssets, useRepo } from '../state/data'
import { useUi } from '../state/ui'
import { useStartNew } from '../lib/useStartNew'
import { useAuth } from '../state/auth'
import { searchSymbols, type SymbolSuggestion } from '../cloud/rates'
import { refreshPricesNow, useLiveState, type LiveState } from '../state/livePrices'

/** Dağılım renkleri: sabit sırayla (tür → renk), açık ve koyu temada doğrulanmış palet. */
const KIND_COLOR: Record<Exclude<AssetKind, 'debt'>, string> = {
  deposit: 'var(--asset-1)',
  fx: 'var(--asset-2)',
  fund: 'var(--asset-3)',
  gold: 'var(--asset-4)',
  commodity: 'var(--asset-4)',
  stock: 'var(--asset-5)',
  cash: 'var(--asset-6)',
  foreign: 'var(--asset-7)',
  crypto: 'var(--asset-8)',
  other: 'var(--asset-other)',
}

const PRESETS: Partial<Record<AssetKind, { name: string; unit: string; symbol?: string }[]>> = {
  gold: [
    { name: 'Gram altın', unit: 'gram' },
    { name: 'Çeyrek altın', unit: 'adet' },
    { name: 'Yarım altın', unit: 'adet' },
    { name: 'Tam altın', unit: 'adet' },
    { name: 'Cumhuriyet altını', unit: 'adet' },
  ],
  fx: [
    { name: 'Dolar', unit: 'USD' },
    { name: 'Euro', unit: 'EUR' },
    { name: 'Sterlin', unit: 'GBP' },
  ],
  crypto: [
    { name: 'Bitcoin', unit: 'adet', symbol: 'BTC' },
    { name: 'Ethereum', unit: 'adet', symbol: 'ETH' },
    { name: 'Solana', unit: 'adet', symbol: 'SOL' },
  ],
  deposit: [{ name: 'Vadeli mevduat', unit: 'TL' }],
  cash: [{ name: 'Nakit', unit: 'TL' }],
}

const STALE_DAYS = 30

/** Ekleme panelindeki tür kutuları: simge ve kısa ad. */
const KIND_TILE: Record<Exclude<AssetKind, 'debt'>, { icon: ReactNode; label: string }> = {
  gold: { icon: <Coins />, label: 'Altın' },
  fx: { icon: <DollarSign />, label: 'Döviz' },
  deposit: { icon: <Landmark />, label: 'Mevduat' },
  fund: { icon: <ChartPie />, label: 'Fon' },
  stock: { icon: <ChartCandlestick />, label: 'BIST hisse' },
  foreign: { icon: <Globe />, label: 'Yabancı hisse' },
  crypto: { icon: <Bitcoin />, label: 'Kripto' },
  commodity: { icon: <Gem />, label: 'Emtia' },
  cash: { icon: <Banknote />, label: 'Nakit' },
  other: { icon: <Package />, label: 'Diğer' },
}
const TILE_ORDER: Exclude<AssetKind, 'debt'>[] = ['gold', 'fx', 'deposit', 'fund', 'stock', 'foreign', 'crypto', 'commodity', 'cash', 'other']

/** Fiyatı kendiliğinden güncellenen türler için kısa not. */
const AUTO_NOTE: Partial<Record<AssetKind, string>> = {
  gold: 'Gram, çeyrek, yarım, tam ve ayar altının fiyatı ons ve kurdan kendiliğinden güncellenir.',
  fx: 'Kur her gün TCMB’den kendiliğinden güncellenir.',
  fund: 'Fon fiyatı TEFAS’tan kendiliğinden güncellenir.',
  stock: 'Fiyat Borsa İstanbul’dan kendiliğinden güncellenir.',
  foreign: 'Fiyat yabancı borsadan kendiliğinden güncellenir ve TL’ye çevrilir.',
  crypto: 'Fiyat Binance’ten kendiliğinden güncellenir ve TL’ye çevrilir.',
  commodity: 'Listeden seçilen emtianın fiyatı kendiliğinden güncellenir.',
}
const SOURCE_TEXT: Partial<Record<AssetKind, string>> = { stock: 'Borsa İstanbul', foreign: 'Yabancı borsa', fund: 'TEFAS', crypto: 'Kripto (USDT)' }
const SYMBOL_PLACEHOLDER: Partial<Record<AssetKind, string>> = { stock: 'Örn. THYAO', foreign: 'Örn. AAPL, SPY, SAP.DE', fund: 'Örn. TTE', crypto: 'Örn. BTC' }
const NAME_PLACEHOLDER: Partial<Record<AssetKind, string>> = { stock: 'Örn. Aselsan', foreign: 'Örn. Apple, S&P 500', fund: 'Örn. İş Portföy teknoloji', crypto: 'Örn. Bitcoin' }

export type Editing = { kind: AssetKind; asset?: Asset; debtType?: DebtType } | null
export type Acting = { asset: Asset; mode: 'trade' | 'price' } | null

const signedWith = (fmt: (k: number) => string) => (k: number) => `${k > 0 ? '+' : k < 0 ? '−' : ''}${fmt(Math.abs(k))}`
const signed = signedWith(formatKurus)
const usdFormat = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'USD' })
const usdCompact = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })

/** Piyasa fiyatının kaynağı (satırda gösterilir). */
function providerOf(market: QuoteMarket): string {
  return market === 'crypto' ? 'Binance' : market === 'tefas' ? 'TEFAS' : 'Yahoo Finance'
}

/** Kullanıcının elle güncellemesi gereken varlıklar (otomatik fiyat yoksa ya da alınamıyorsa). */
const needsManual = (a: Asset, live: LiveState) => !hasAutoPrice(a) || !!live.failed[a.id]
const pct = (part: number, whole: number) => (whole > 0 ? `%${((part / whole) * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}` : '')

export default function AssetsPage() {
  const [editing, setEditing] = useState<Editing>(null)
  useStartNew(() => setEditing({ kind: 'gold' }))
  return (
    <div>
      <PageHeader
        title="Yatırımlarım"
        subtitle={
          <span className="inline-flex items-center gap-2">
            <PlanBadge plan="plus" /> Aylık gelir ve giderden bağımsız yatırım paneli
          </span>
        }
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing({ kind: 'gold' })}>
            Yatırım ekle
          </Button>
        }
      />
      <PlanGate
        feature="assets"
        title="Yatırımlarım"
        points={[
          'Altın, döviz, fon, hisse, kripto, emtia ve mevduatlarınızı miktar, alış tarihi ve maliyetiyle kaydedin',
          'Toplam değeri ve dağılımı görün',
          'Yatırdığınız parayı ve yatırım kazancını ayrı ayrı izleyin',
          'Döviz, hisse, ETF, fon, kripto ve gram altın güncel fiyatla otomatik güncellenir; kâr/zarar anında görünür',
          'Toplam varlığınızı TL ya da USD olarak görün',
        ]}
      >
        <AssetsContent onEdit={setEditing} />
        <AssetEditor editing={editing} onClose={() => setEditing(null)} />
      </PlanGate>
    </div>
  )
}

function AssetsContent({ onEdit }: { onEdit: (e: Editing) => void }) {
  const assets = useAssets()
  const repo = useRepo()
  const { toast } = useUi()
  const [acting, setActing] = useState<Acting>(null)
  const [del, setDel] = useState<Asset | null>(null)
  const [ccy, setCcy] = useState<'TRY' | 'USD'>('TRY')
  const live = useLiveState()
  const { backend, user } = useAuth()
  const signedIn = !!(backend && user)
  const today = todayIso()
  const p = useMemo(() => portfolio((assets ?? []).filter((a) => a.kind !== 'debt'), today), [assets, today])
  const history = useMemo(() => valueHistory(assets ?? [], today), [assets, today])
  if (!assets) return null

  const holdings = assets.filter((a) => a.kind !== 'debt' && !a.archived)
  const gain = p.unrealizedKurus + p.realizedKurus
  const staleList = holdings.flatMap((a) => {
    const h = holdingSummary(a, today)
    return needsPrice(a, h, today, STALE_DAYS) && h.price ? [{ asset: a, date: h.price.date }] : []
  })
  const usd = live.usd ?? usdFromAssets(assets)
  const inUsd = ccy === 'USD' && !!usd
  const money = inUsd ? (k: number) => usdFormat.format(k / 100 / usd.valueTl) : formatKurus
  const moneyCompact = inUsd ? (k: number) => usdCompact.format(k / 100 / usd.valueTl) : undefined
  const signedM = signedWith(money)
  const hasCommodity = holdings.some((a) => a.kind === 'commodity')
  const sliceLabel = (k: AssetKind) => (k === 'gold' && hasCommodity ? 'Altın ve emtia' : ASSET_KIND_LABEL[k])

  if (holdings.length === 0)
    return (
      <Card className="p-5">
        <EmptyState icon={<Wallet className="size-6" />} title="Henüz yatırım eklenmedi" className="py-6">
          Altın, döviz, fon, hisse, kripto, emtia veya mevduatınızı ekleyin. Güncel fiyatlar kendiliğinden gelir; bilgiler yalnızca bu cihazda kalır. Borçlarınızı Borçlarım sayfasında izlersiniz.
        </EmptyState>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {ASSET_KINDS.filter((k) => k !== 'other').map((k) => (
            <Button key={k} size="sm" variant="soft" onClick={() => onEdit({ kind: k })}>
              {ASSET_KIND_LABEL[k]}
            </Button>
          ))}
        </div>
      </Card>
    )

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="p-5 lg:col-span-2" aria-label="Yatırım özeti">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base font-semibold">Özet</h2>
          {usd && (
          <Segmented
            label="Para birimi"
            value={inUsd ? 'USD' : 'TRY'}
            onChange={setCcy}
            options={[
              { value: 'TRY', label: '₺ TL' },
              { value: 'USD', label: '$ USD' },
            ]}
          />
          )}
        </div>
        <div className="flex flex-wrap gap-x-10 gap-y-4">
          <div>
            <div className="text-[12.5px] text-muted">Toplam yatırım</div>
            <div className="num font-display text-2xl font-semibold">{money(p.assetsKurus)}</div>
            <div className="mt-0.5 text-[12px] text-subtle">Güncel değer</div>
          </div>
          <Figure label="Yatırdığınız (net)" value={money(p.contributedKurus)} />
          <Figure
            label="Yatırım kazancı / kaybı"
            value={signedM(gain)}
            tone={gain > 0 ? 'up' : gain < 0 ? 'down' : undefined}
            sub={p.realizedKurus !== 0 ? `Gerçekleşen ${signedM(p.realizedKurus)} · eldeki ${signedM(p.unrealizedKurus)}` : p.contributedKurus > 0 ? pct(gain, p.contributedKurus) : undefined}
          />
        </div>
        {inUsd && usd && (
          <p className="mt-3 text-[12px] text-subtle">
            Tutarlar TCMB kuruyla ({usd.valueTl.toLocaleString('tr-TR', { maximumFractionDigits: 4 })} ₺ · {formatDate(usd.date)}) dolara çevrildi. Kazanç TL bazında hesaplanıp bugünkü kurla gösterilir.
          </p>
        )}
        {staleList.length > 0 && (
          <Alert tone="warning" className="mt-4">
            <span className="font-medium">Fiyatı {STALE_DAYS} günden eski olan varlıklar:</span>{' '}
            {staleList.map((x, i) => (
              <span key={x.asset.id}>
                {i > 0 && ', '}
                {x.asset.name} ({formatDate(x.date)})
              </span>
            ))}
            . Toplam değer bu eski fiyatlarla hesaplanıyor.{' '}
            {!signedIn
              ? 'Giriş yaptığınızda bu fiyatlar kendiliğinden güncellenir.'
              : staleList.some((x) => needsManual(x.asset, live))
                ? 'Otomatik fiyatı bulunamayanlar için satırdaki "Güncelle" ile bugünkü fiyatı girin ya da düzenleyip sembol ekleyin.'
                : 'Fiyatlar kendiliğinden güncelleniyor.'}
          </Alert>
        )}
        <LivePrices live={live} assets={assets} signedIn={signedIn} />
      </Card>

      <Card className="p-5">
        <h2 className="font-display text-base font-semibold">Dağılım</h2>
        {p.allocation.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Değeri olan bir varlık yok.</p>
        ) : (
          <>
            <div className="mt-3">
              <CategoryDonut
                slices={p.allocation.map((a) => ({ id: a.kind, name: sliceLabel(a.kind), color: KIND_COLOR[a.kind], kurus: a.valueKurus }))}
                total={p.assetsKurus}
                centerLabel="Toplam varlık"
                valueLabel="Değer"
                format={money}
                formatCompact={moneyCompact}
              />
            </div>
            <ul className="mt-3 space-y-1.5" aria-label="Varlık dağılımı">
              {p.allocation.map((a) => (
                <li key={a.kind} className="flex items-center gap-2 text-[13px]">
                  <span className="size-2.5 shrink-0 rounded-sm" style={{ background: KIND_COLOR[a.kind] }} aria-hidden />
                  <span className="flex-1 text-ink">{sliceLabel(a.kind)}</span>
                  <span className="num w-14 text-right text-muted">{pct(a.valueKurus, p.assetsKurus)}</span>
                  <span className="num w-32 text-right font-medium text-ink">{money(a.valueKurus)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="font-display text-base font-semibold">Zaman içinde değer</h2>
        {history.length < 2 ? (
          <p className="mt-2 text-sm text-muted">Grafik, en az iki farklı günde işlem veya fiyat girildiğinde oluşur. Yalnızca girdiğiniz tarihler gösterilir; aradaki günler için değer üretilmez.</p>
        ) : (
          <>
            <p className="mt-0.5 text-[12.5px] text-muted">Yalnızca işlem veya fiyat girdiğiniz günler. Borçlar dahil değil.</p>
            <WealthLine points={history} />
          </>
        )}
      </Card>

      <Card className="p-5 lg:col-span-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <Wallet className="size-5 text-accent" /> Yatırımlar
          </h2>
          <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => onEdit({ kind: 'gold' })}>
            Ekle
          </Button>
        </div>
        {holdings.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Henüz yatırım yok.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line" aria-label="Varlıklar">
            {ASSET_KINDS.flatMap((k) => holdings.filter((a) => a.kind === k)).map((a) => (
              <HoldingRow key={a.id} asset={a} s={holdingSummary(a, today)} money={money} failed={live.failed[a.id]} manualPrice={!signedIn || needsManual(a, live)} onAct={(mode) => setActing({ asset: a, mode })} onEdit={() => onEdit({ kind: a.kind, asset: a })} onDelete={() => setDel(a)} />
            ))}
          </ul>
        )}
      </Card>

      <p className="text-[12.5px] text-subtle lg:col-span-2">
        Fiyatlar uygulama açılınca ve açık kaldıkça 15 dakikada bir kendiliğinden güncellenir. Döviz TCMB gösterge kurundan; Borsa İstanbul, yabancı hisse ve ETF'ler, altın (ons fiyatı × kur) ve emtialar Yahoo Finance'ten; kripto Binance'ten (USDT paritesi × kur); fonlar TEFAS'tan alınır. Fiyatlar gecikmeli olabilir. Fiyat isteği yalnızca sembolleri içerir; miktar ve maliyetleriniz gönderilmez. Bu sayfa yatırım tavsiyesi vermez. Bilgiler yalnızca bu cihazda tutulur. Borçlar bu sayfada değil, Borçlarım'da izlenir.
      </p>

      <ActionDialog acting={acting} onClose={() => setActing(null)} />
      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title="Yatırım silinsin mi?"
        confirmLabel="Sil"
        danger
        onConfirm={async () => {
          if (!del) return
          try {
            await repo.deleteAsset(del.id)
            toast(`${del.name} silindi.`)
          } catch (e) {
            toast(toUserMessage(e), { kind: 'error' })
          }
          setDel(null)
        }}
      >
        <p>{del?.name} ve bütün işlem ve fiyat kayıtları silinir.</p>
      </ConfirmDialog>
    </div>
  )
}

/** Döviz varlığının son TCMB fiyatından USD kuru (çevrimdışıyken USD görünümü için). */
function usdFromAssets(assets: Asset[]): LiveState['usd'] {
  let best: LiveState['usd'] = null
  for (const a of assets)
    if (autoPriceCode(a) === 'USD') for (const v of a.valuations) if (v.source === 'tcmb' && (!best || v.date > best.date)) best = { valueTl: v.unitPriceKurus / 100, date: v.date }
  return best
}

function LivePrices({ live, assets, signedIn }: { live: LiveState; assets: Asset[]; signedIn: boolean }) {
  const { toast } = useUi()
  const failedCount = Object.keys(live.failed).length
  const autoCount = assets.filter(hasAutoPrice).length
  const linked = assets.filter((a) => live.linked[a.id] && a.quote?.symbol === live.linked[a.id])
  const time = live.at ? new Date(live.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : null
  const refresh = async () => {
    const n = await refreshPricesNow()
    if (n !== null) toast(n ? `${n} varlığın fiyatı güncellendi.` : 'Fiyatlar zaten güncel.')
  }
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-surface-2 px-3 py-2.5 text-[12.5px]" aria-label="Güncel fiyatlar">
      <RefreshCw className={cn('size-4 shrink-0 text-accent', live.busy && 'animate-spin')} aria-hidden />
      <div className="min-w-0 flex-1 text-muted">
        {!signedIn ? (
          'Güncel fiyatları otomatik almak için hesabınızla giriş yapın.'
        ) : live.error ? (
          <span className="text-danger">{live.error}</span>
        ) : live.busy ? (
          'Güncel fiyatlar alınıyor…'
        ) : autoCount === 0 ? (
          'Döviz, altın, emtia, hisse, ETF, fon ve kriptonun fiyatı kendiliğinden güncellenir. Hisse ve fonda adını yazmanız yeterli; sembol otomatik eşlenir.'
        ) : (
          <>
            <span className="font-medium text-ink">Fiyatlar otomatik güncelleniyor</span>
            {time ? ` · son ${time}` : ''}.
            {linked.length > 0 && <span> Sembolü eşlenen: {linked.map((a) => `${a.name} → ${a.quote!.symbol}`).join(', ')}.</span>}
            {failedCount > 0 && <span className="text-warning"> {failedCount} varlığın fiyatı alınamadı.</span>}
          </>
        )}
      </div>
      {signedIn && autoCount > 0 && (
        <Button size="sm" variant="ghost" onClick={() => void refresh()} disabled={live.busy}>
          Şimdi yenile
        </Button>
      )}
    </div>
  )
}

function Figure({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'up' | 'down' }) {
  return (
    <div>
      <div className="text-[12.5px] text-muted">{label}</div>
      <div className={cn('num font-display text-lg font-semibold', tone === 'up' && 'text-accent', tone === 'down' && 'text-danger')}>{value}</div>
      {sub && <div className="num mt-0.5 text-[12px] text-subtle">{sub}</div>}
    </div>
  )
}

function priceSourceLabel(asset: Asset, s: HoldingSummary['price'], balance: boolean): string {
  if (!s) return 'Fiyat yok'
  if (s.source === 'piyasa') {
    const q = autoQuote(asset)
    return `${q ? providerOf(q.market) : 'Piyasa'} · ${formatDate(s.date)}`
  }
  if (s.source === 'manual') return `${balance ? 'Bakiye' : 'Fiyat'} elle girildi · ${formatDate(s.date)}`
  if (s.source === 'tcmb') return `TCMB kuru · ${formatDate(s.date)}`
  return `${balance ? 'Son hareket' : 'İşlem fiyatı'} · ${formatDate(s.date)}`
}

export function HoldingRow({
  asset,
  s,
  money = formatKurus,
  failed,
  manualPrice = true,
  onAct,
  onEdit,
  onDelete,
}: {
  asset: Asset
  s: HoldingSummary
  money?: (k: number) => string
  failed?: string
  /** Fiyat kendiliğinden gelmiyorsa "Güncelle" düğmesi gösterilir. */
  manualPrice?: boolean
  onAct: (m: 'trade' | 'price') => void
  onEdit: () => void
  onDelete: () => void
}) {
  const quote = autoQuote(asset)
  const [open, setOpen] = useState(false)
  const balance = isBalanceKind(asset.kind)
  const debt = asset.kind === 'debt'
  const stale = needsPrice(asset, s, todayIso(), STALE_DAYS)
  const plan = debt ? debtPlanStatus(asset.debtPlan, todayIso()) : null
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium text-ink">{asset.name}</span>
            <Badge tone={debt ? 'danger' : 'neutral'}>{ASSET_KIND_LABEL[asset.kind]}</Badge>
            {quote && quote.market !== 'gold' && quote.market !== 'commodity' && (
              <span className="num text-[11.5px] font-medium text-subtle">
                {quote.symbol} · {QUOTE_MARKET_LABEL[quote.market]}
              </span>
            )}
            {(s.price?.source === 'tcmb' || s.price?.source === 'piyasa') && <Badge tone="accent">Otomatik</Badge>}
            {failed && (
              <span title={failed}>
                <Badge tone="warning">Fiyat alınamadı</Badge>
              </span>
            )}
            {stale && <Badge tone="warning">Fiyat eski</Badge>}
          </div>
          <div className="text-[12px] text-muted">
            {!balance && s.price && `${formatQuantity(s.quantity)} ${asset.unit} × ${formatUnitPrice(s.price.unitPriceKurus)} · `}
            {plan ? (
              <>
                {plan.remaining > 0 ? `${plan.remaining} taksit kaldı · ${formatKurus(asset.debtPlan!.installmentKurus!)}/ay · sıradaki ${formatDate(plan.next!)}` : 'Bütün taksitler ödendi'}
                {asset.debtTerms?.monthlyRatePct ? ` · aylık %${asset.debtTerms.monthlyRatePct.toLocaleString('tr-TR')} faiz` : ''}
              </>
            ) : debt && asset.debtPlan?.dueDate ? (
              <>
                Ödeme tarihi {formatDate(asset.debtPlan.dueDate)}
                {asset.debtTerms?.monthlyRatePct ? ` · aylık %${asset.debtTerms.monthlyRatePct.toLocaleString('tr-TR')} faiz` : ''}
                {' · '}
              </>
            ) : debt && asset.debtTerms ? (
              <>
                Aylık %{asset.debtTerms.monthlyRatePct.toLocaleString('tr-TR')} faiz
                {asset.debtTerms.minPaymentKurus ? ` · aylık ödeme ${formatKurus(asset.debtTerms.minPaymentKurus)}` : ''}
                {' · '}
              </>
            ) : null}
            {!plan && priceSourceLabel(asset, s.price, balance)}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="num font-semibold">{money(s.valueKurus)}</div>
          {!debt && s.quantity > 0 && (
            <div className={cn('num text-[12px]', s.unrealizedKurus > 0 ? 'text-accent' : s.unrealizedKurus < 0 ? 'text-danger' : 'text-muted')}>
              {s.unrealizedKurus > 0 ? 'Kâr ' : s.unrealizedKurus < 0 ? 'Zarar ' : ''}
              {signedWith(money)(s.unrealizedKurus)} {pct(s.unrealizedKurus, s.costKurus)}
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {manualPrice && !plan && (
          <Button size="sm" variant="soft" icon={<RefreshCw className="size-3.5" />} onClick={() => onAct('price')} disabled={s.quantity <= 0}>
            <span className="sm:hidden">Güncelle</span>
            <span className="hidden sm:inline">{balance ? 'Bakiyeyi güncelle' : 'Fiyatı güncelle'}</span>
          </Button>
        )}
        {!plan && (
          <Button size="sm" variant="ghost" icon={<ArrowDownUp className="size-3.5" />} onClick={() => onAct('trade')}>
            <span className="sm:hidden">{debt ? 'Ödeme' : 'İşlem'}</span>
            <span className="hidden sm:inline">{debt ? 'Ödeme / ek borç' : balance ? 'Para yatır / çek' : 'Alış / satış'}</span>
          </Button>
        )}
        <span className="flex-1" />
        <IconButton label={`${asset.name} geçmişi`} size="sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
        </IconButton>
        <IconButton label={`${asset.name} düzenle`} size="sm" onClick={onEdit}>
          <Pencil className="size-4" />
        </IconButton>
        <IconButton label={`${asset.name} sil`} size="sm" onClick={onDelete}>
          <Trash2 className="size-4" />
        </IconButton>
      </div>
      {open && <AssetHistory asset={asset} s={s} />}
    </li>
  )
}

function AssetHistory({ asset, s }: { asset: Asset; s: HoldingSummary }) {
  const repo = useRepo()
  const { toast } = useUi()
  const balance = isBalanceKind(asset.kind)
  const rows = [
    ...asset.trades.map((t) => ({ key: `t${t.id}`, date: t.date, text: tradeText(asset, t), onDelete: () => repo.removeAssetTrade(asset.id, t.id) })),
    ...asset.valuations.map((v) => ({
      key: `v${v.date}`,
      date: v.date,
      text: balance ? `Bakiye güncellendi: ${formatKurus(Math.round(v.unitPriceKurus * quantityOn(asset, v.date)))}` : `Fiyat: ${formatUnitPrice(v.unitPriceKurus)} (${v.source === 'tcmb' ? 'TCMB kuru' : v.source === 'piyasa' ? 'piyasa' : 'elle'})`,
      onDelete: () => repo.removeAssetValuation(asset.id, v.date),
    })),
  ].sort((a, b) => b.date.localeCompare(a.date))
  return (
    <div className="mt-2 rounded-xl bg-surface-2 px-3 py-2">
      {!balance && s.quantity > 0 && (
        <div className="mb-1 flex flex-wrap gap-x-4 text-[12px] text-muted">
          <span>Ortalama maliyet {formatUnitPrice(s.costKurus / s.quantity)}</span>
          <span>Eldeki maliyet {formatKurus(s.costKurus)}</span>
          {s.realizedKurus !== 0 && <span>Gerçekleşen {signed(s.realizedKurus)}</span>}
        </div>
      )}
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-2 py-1.5 text-[12.5px]">
            <span className="num w-20 shrink-0 text-muted">{formatDate(r.date)}</span>
            <span className="min-w-0 flex-1 text-ink">{r.text}</span>
            <IconButton
              label="Kaydı sil"
              size="sm"
              onClick={() =>
                void r.onDelete().catch((e: unknown) => {
                  toast(toUserMessage(e), { kind: 'error' })
                })
              }
            >
              <Trash2 className="size-3.5" />
            </IconButton>
          </li>
        ))}
      </ul>
    </div>
  )
}

function quantityOn(asset: Asset, date: string): number {
  return asset.trades.reduce((q, t) => (t.date <= date ? q + (t.side === 'buy' ? t.quantity : -t.quantity) : q), 0)
}

function tradeText(asset: Asset, t: Asset['trades'][number]): string {
  const amount = formatKurus(Math.round(t.quantity * t.unitPriceKurus))
  if (asset.kind === 'debt') return t.side === 'buy' ? `Borç eklendi: ${amount}` : `Ödeme: ${amount}`
  if (isBalanceKind(asset.kind)) return t.side === 'buy' ? `Yatırıldı: ${amount}` : `Çekildi: ${amount}`
  return `${t.side === 'buy' ? 'Alış' : 'Satış'}: ${formatQuantity(t.quantity)} ${asset.unit} × ${formatUnitPrice(t.unitPriceKurus)} = ${amount}`
}

/** Birim fiyat girdisi: "41,25" gibi; fon fiyatları için 6 ondalığa kadar. */
function parsePriceKurus(input: string): number | null {
  const q = parseQuantity(input)
  return q === null ? null : Math.round(q * 100 * 1e4) / 1e4
}

export function ActionDialog({ acting, onClose }: { acting: Acting; onClose: () => void }) {
  const repo = useRepo()
  const { toast } = useUi()
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [qty, setQty] = useState('')
  const [price, setPrice] = useState('')
  const [date, setDate] = useState(todayIso())
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [shown, setShown] = useState<Acting>(null)
  if (acting !== shown) {
    setShown(acting)
    if (acting) {
      setSide('buy')
      setQty('')
      setPrice('')
      setDate(todayIso())
      setError(undefined)
    }
  }
  const asset = acting?.asset
  const balance = asset ? isBalanceKind(asset.kind) : false
  const debt = asset?.kind === 'debt'

  const save = async () => {
    if (!acting || !asset) return
    setError(undefined)
    try {
      setBusy(true)
      const cur = priceAt(asset, date)?.unitPriceKurus ?? 100
      if (acting.mode === 'price') {
        if (balance) {
          const amt = parseUserAmount(price)
          if (!amt.ok || amt.kurus < 0) return setError('Geçerli bir tutar girin.')
          const held = quantityOn(asset, date)
          if (held <= 0) return setError('Bu tarihte bakiye yok.')
          await repo.setAssetValuation(asset.id, { date, unitPriceKurus: amt.kurus / held })
        } else {
          const p = parsePriceKurus(price)
          if (p === null) return setError('Geçerli bir fiyat girin.')
          await repo.setAssetValuation(asset.id, { date, unitPriceKurus: p })
        }
        toast(`${asset.name} güncellendi.`)
      } else if (balance) {
        const amt = parseUserAmount(qty)
        if (!amt.ok || amt.kurus <= 0) return setError('Geçerli bir tutar girin.')
        // Bakiye türlerinde işlem güncel birim değerden yapılır; böylece yeni para kazanç gibi görünmez
        await repo.addAssetTrade(asset.id, { date, side, quantity: amt.kurus / cur, unitPriceKurus: cur })
        toast('Kaydedildi.')
      } else {
        const q = parseQuantity(qty)
        const p = parsePriceKurus(price)
        if (q === null) return setError('Geçerli bir miktar girin.')
        if (p === null) return setError('Geçerli bir birim fiyat girin.')
        await repo.addAssetTrade(asset.id, { date, side, quantity: q, unitPriceKurus: p })
        toast(side === 'buy' ? 'Alış kaydedildi.' : 'Satış kaydedildi.')
      }
      onClose()
    } catch (e) {
      setError(toUserMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const title = !acting ? '' : acting.mode === 'price' ? (balance ? 'Bakiyeyi güncelle' : 'Fiyatı güncelle') : debt ? 'Ödeme veya ek borç' : balance ? 'Para yatır veya çek' : 'Alış veya satış ekle'
  return (
    <Modal
      open={!!acting}
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description={asset?.name}
      size="sm"
      footer={
        <Button variant="primary" loading={busy} onClick={() => void save()}>
          Kaydet
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        {acting?.mode === 'trade' && (
          <Segmented
            label="İşlem türü"
            value={side}
            onChange={setSide}
            options={debt ? [{ value: 'sell', label: 'Ödeme' }, { value: 'buy', label: 'Ek borç' }] : balance ? [{ value: 'buy', label: 'Yatır' }, { value: 'sell', label: 'Çek' }] : [{ value: 'buy', label: 'Alış' }, { value: 'sell', label: 'Satış' }]}
          />
        )}
        {acting?.mode === 'price' ? (
          <Field
            label={balance ? (debt ? 'Güncel borç (TL)' : 'Güncel bakiye (TL)') : `Güncel birim fiyat (TL / ${asset?.unit})`}
            htmlFor="asset-price"
            error={error}
            hint={balance ? undefined : 'Kendi kaynağınızdan (banka, kuyumcu, aracı kurum) bakıp girin.'}
          >
            <Input id="asset-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" autoFocus />
          </Field>
        ) : balance ? (
          <Field label="Tutar (TL)" htmlFor="asset-qty" error={error}>
            <Input id="asset-qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0,00" autoFocus />
          </Field>
        ) : (
          <>
            <Field label={`Miktar (${asset?.unit ?? ''})`} htmlFor="asset-qty">
              <Input id="asset-qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" autoFocus />
            </Field>
            <Field label="Birim fiyat (TL)" htmlFor="asset-unit-price" error={error}>
              <Input id="asset-unit-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" />
            </Field>
          </>
        )}
        <Field label="Tarih" htmlFor="asset-date">
          <Input id="asset-date" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

export function AssetEditor({ editing, onClose }: { editing: Editing; onClose: () => void }) {
  const repo = useRepo()
  const { toast } = useUi()
  const [f, setF] = useState({ kind: 'gold' as AssetKind, name: '', unit: 'gram', qty: '', price: '', amount: '', date: todayIso(), rate: '', minPay: '', market: 'bist' as QuoteMarket, symbol: '', debtType: 'card' as DebtType, payMode: 'once' as DebtPayMode, dueDate: '', instAmount: '', instCount: '' })
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [shown, setShown] = useState<Editing>(null)
  if (editing !== shown) {
    setShown(editing)
    if (editing) {
      const a = editing.asset
      const t = a?.debtTerms
      const plan = a ? debtPlanStatus(a.debtPlan, todayIso()) : null
      setF({
        kind: editing.kind,
        name: a?.name ?? (editing.kind === 'debt' ? DEBT_TYPE_LABEL[editing.debtType ?? 'card'] : ''),
        unit: a?.unit ?? DEFAULT_UNIT[editing.kind],
        qty: '',
        price: '',
        amount: '',
        date: todayIso(),
        rate: t ? String(t.monthlyRatePct).replace('.', ',') : '',
        minPay: t?.minPaymentKurus ? formatKurusPlain(t.minPaymentKurus) : '',
        market: a?.quote?.market ?? defaultMarket(editing.kind),
        symbol: a?.quote?.symbol ?? '',
        debtType: a ? debtTypeOf(a) : (editing.debtType ?? 'card'),
        payMode: a?.debtPlan?.mode ?? (editing.debtType && INSTALLMENT_DEBT.includes(editing.debtType) ? 'monthly' : 'once'),
        dueDate: plan?.next ?? a?.debtPlan?.dueDate ?? '',
        instAmount: a?.debtPlan?.installmentKurus ? formatKurusPlain(a.debtPlan.installmentKurus) : '',
        instCount: plan ? String(plan.remaining) : '',
      })
      setError(undefined)
    }
  }
  const isNew = !editing?.asset
  const debt = f.kind === 'debt'
  const monthly = debt && f.payMode === 'monthly'
  const balance = isBalanceKind(f.kind)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }))
  const pick = (sg: SymbolSuggestion) => setF((p) => ({ ...p, symbol: sg.symbol, name: tidyName(sg.name).slice(0, 60) }))

  const save = async () => {
    setError(undefined)
    if (!f.name.trim()) return setError('Bir ad girin.')
    let first: { date: string; quantity: number; unitPriceKurus: number } | undefined
    let debtPlan: DebtPlan | undefined
    let instKurus: number | null = null
    if (debt && monthly) {
      const amt = parseUserAmount(f.instAmount)
      if (!amt.ok || amt.kurus <= 0) return setError('Geçerli bir taksit tutarı girin.')
      const n = Number(f.instCount)
      if (!Number.isInteger(n) || n < 1 || n > 600) return setError('Kalan taksit sayısı 1 ile 600 arasında olmalı.')
      if (!f.dueDate) return setError('Sıradaki taksit tarihini girin.')
      instKurus = amt.kurus
      debtPlan = { mode: 'monthly', dueDate: f.dueDate, installmentKurus: amt.kurus, installments: n }
      if (isNew) first = { date: todayIso(), quantity: (amt.kurus * n) / 100, unitPriceKurus: 100 }
    } else if (debt) debtPlan = { mode: 'once', dueDate: f.dueDate || undefined }
    if (isNew && !(debt && monthly)) {
      if (balance) {
        const amt = parseUserAmount(f.amount)
        if (!amt.ok || amt.kurus <= 0) return setError('Geçerli bir tutar girin.')
        first = { date: debt ? todayIso() : f.date, quantity: amt.kurus / 100, unitPriceKurus: 100 }
      } else {
        const q = parseQuantity(f.qty)
        const p = parsePriceKurus(f.price)
        if (q === null) return setError('Geçerli bir miktar girin.')
        if (p === null) return setError('Geçerli bir alış fiyatı girin.')
        first = { date: f.date, quantity: q, unitPriceKurus: p }
      }
    }
    let quote: AssetQuote | null | undefined
    if (SYMBOL_KINDS.includes(f.kind)) {
      if (!f.symbol.trim()) quote = null
      else {
        const sym = normalizeSymbol(f.symbol)
        if (!sym) return setError('Sembol yalnızca harf, rakam, nokta ve tire içerebilir (ör. THYAO, AAPL, BTC).')
        quote = { market: f.market, symbol: sym }
      }
    }
    if (f.kind === 'commodity') {
      const c = COMMODITIES.find((x) => x.symbol === f.symbol)
      quote = c ? { market: 'commodity', symbol: c.symbol } : null
    }
    // Mevduatta faiz girilmez; eski kayıtlardaki oran da kaldırılır
    const interestRatePct = f.kind === 'deposit' ? null : undefined
    let debtTerms: DebtTerms | null | undefined
    if (debt) {
      const rate = f.rate.trim() ? Number(f.rate.trim().replace(',', '.')) : null
      if (rate !== null && (!Number.isFinite(rate) || rate < 0 || rate > 100)) return setError('Aylık faiz oranı 0 ile 100 arasında olmalı.')
      let minPay: number | null = null
      if (!monthly && f.minPay.trim()) {
        const m = parseUserAmount(f.minPay)
        if (!m.ok || m.kurus <= 0) return setError('Aylık ödeme için geçerli bir tutar girin.')
        minPay = m.kurus
      }
      if (instKurus) minPay = instKurus
      debtTerms = rate === null && minPay === null ? null : { monthlyRatePct: rate ?? 0, minPaymentKurus: minPay }
    }
    setBusy(true)
    try {
      await repo.saveAsset({ id: editing?.asset?.id, kind: f.kind, name: f.name, unit: balance ? 'TL' : f.unit, debtTerms, quote, interestRatePct, debtType: debt ? f.debtType : undefined, debtPlan: debt ? debtPlan : undefined }, first)
      toast(isNew ? `${f.name.trim()} eklendi.` : 'Kaydedildi.')
      onClose()
    } catch (e) {
      setError(toUserMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const presets = PRESETS[f.kind] ?? []
  const q = parseQuantity(f.qty)
  const pr = parsePriceKurus(f.price)
  const cost = q !== null && pr !== null && q > 0 ? Math.round(q * pr) : null
  const ia = parseUserAmount(f.instAmount)
  const instTotal = monthly && ia.ok && ia.kurus > 0 && Number(f.instCount) > 0 ? ia.kurus * Number(f.instCount) : null
  return (
    <Modal
      open={!!editing}
      onOpenChange={(o) => !o && onClose()}
      title={isNew ? (debt ? 'Borç ekle' : 'Yatırım ekle') : debt ? 'Borcu düzenle' : 'Yatırımı düzenle'}
      size="sm"
      footer={
        <Button variant="primary" loading={busy} onClick={() => void save()}>
          Kaydet
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        {isNew && !debt && (
          <div role="radiogroup" aria-label="Tür" className="grid grid-cols-5 gap-1.5">
            {TILE_ORDER.map((k) => {
              const on = f.kind === k
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={ASSET_KIND_LABEL[k]}
                  onClick={() => setF((p) => ({ ...p, kind: k, unit: DEFAULT_UNIT[k], name: '', symbol: '', market: k === 'commodity' ? 'commodity' : defaultMarket(k) }))}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-2xl border px-1 py-2.5 text-[11.5px] font-medium leading-tight transition-colors [&_svg]:size-5',
                    on ? 'border-accent bg-accent-soft text-accent-strong dark:text-accent' : 'border-line text-muted hover:border-border-strong hover:text-ink',
                  )}
                >
                  {KIND_TILE[k].icon}
                  <span className="text-center">{KIND_TILE[k].label}</span>
                </button>
              )
            })}
          </div>
        )}
        {debt && (
          <Field label="Borç türü" htmlFor="debt-type">
            <Select
              id="debt-type"
              value={f.debtType}
              onChange={(e) => {
                const t = e.target.value as DebtType
                setF((p) => ({ ...p, debtType: t, payMode: isNew ? (INSTALLMENT_DEBT.includes(t) ? 'monthly' : 'once') : p.payMode, name: !p.name || DEBT_TYPES.some((x) => DEBT_TYPE_LABEL[x] === p.name) ? DEBT_TYPE_LABEL[t] : p.name }))
              }}
            >
              {DEBT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {DEBT_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {isNew && presets.length > 0 && (
          <div className="flex flex-wrap gap-1.5" aria-label="Hazır seçenekler">
            {presets.map((p) => {
              const on = f.name === p.name
              return (
                <button
                  key={p.name}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setF((x) => ({ ...x, name: p.name, unit: p.unit, symbol: p.symbol ?? x.symbol }))}
                  className={cn('inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors', on ? 'border-accent bg-accent text-white' : 'border-line bg-surface-2 text-ink hover:border-border-strong')}
                >
                  {on && <Check className="size-3.5" />}
                  {p.name}
                </button>
              )
            })}
          </div>
        )}
        {f.kind === 'commodity' && (
          <Field label="Emtia" htmlFor="asset-commodity" hint="Güncel fiyat dünya vadeli fiyatından (USD × TCMB kuru) hesaplanır">
            <Select
              id="asset-commodity"
              value={f.symbol}
              disabled={!isNew}
              onChange={(e) => {
                const c = COMMODITIES.find((x) => x.symbol === e.target.value)
                setF((p) => (c ? { ...p, symbol: c.symbol, name: c.name, unit: c.unit } : { ...p, symbol: '' }))
              }}
            >
              <option value="">Diğer (fiyatı elle girerim)</option>
              {COMMODITIES.map((c) => (
                <option key={c.symbol} value={c.symbol}>
                  {c.name} ({c.unit})
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Ad" htmlFor="asset-name" hint={SYMBOL_KINDS.includes(f.kind) ? 'Yazdıkça öneriler çıkar; seçince sembol de dolar' : undefined}>
          {SYMBOL_KINDS.includes(f.kind) ? (
            <SuggestInput id="asset-name" value={f.name} maxLength={60} market={f.market} minChars={2} placeholder={NAME_PLACEHOLDER[f.kind]} onChange={(v) => set('name', v)} onPick={pick} />
          ) : (
            <Input id="asset-name" value={f.name} maxLength={60} onChange={(e) => set('name', e.target.value)} placeholder={debt ? 'Örn. X Bankası kartı' : ''} />
          )}
        </Field>
        {SYMBOL_KINDS.includes(f.kind) && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kaynak" htmlFor="asset-market">
              <Input id="asset-market" value={SOURCE_TEXT[f.kind] ?? ''} readOnly disabled />
            </Field>
            <Field label={f.kind === 'fund' ? 'Fon kodu' : 'Sembol'} htmlFor="asset-symbol" hint="Güncel fiyat için; boş bırakırsanız fiyatı siz girersiniz">
              <SuggestInput
                id="asset-symbol"
                value={f.symbol}
                maxLength={15}
                market={f.market}
                minChars={1}
                upper
                placeholder={SYMBOL_PLACEHOLDER[f.kind]}
                onChange={(v) => set('symbol', v)}
                onPick={pick}
              />
            </Field>
          </div>
        )}
        {f.kind === 'gold' && (
          <Segmented
            label="Birim"
            value={f.unit === 'adet' ? 'adet' : 'gram'}
            onChange={(u) => set('unit', u)}
            options={[
              { value: 'gram', label: 'Gram' },
              { value: 'adet', label: 'Adet' },
            ]}
          />
        )}
        {(f.kind === 'other' || f.kind === 'fx' || (f.kind === 'commodity' && !f.symbol)) && (
          <Field label={f.kind === 'fx' ? 'Döviz kodu' : 'Birim'} htmlFor="asset-unit" hint={f.kind === 'fx' ? 'USD, EUR, GBP gibi; kur kendiliğinden gelir' : 'Fiyatı hangi birim için gireceğiniz (gram, adet, pay…)'}>
            <Input id="asset-unit" value={f.unit} maxLength={16} onChange={(e) => set('unit', f.kind === 'fx' ? e.target.value.toUpperCase() : e.target.value)} />
          </Field>
        )}
        {debt && (
          <Segmented
            label="Ödeme şekli"
            value={f.payMode}
            onChange={(m) => set('payMode', m)}
            options={[
              { value: 'once', label: 'Tek seferde' },
              { value: 'monthly', label: 'Aylık taksit' },
            ]}
          />
        )}
        {monthly && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Taksit tutarı (TL)" htmlFor="debt-inst">
                <Input id="debt-inst" inputMode="decimal" value={f.instAmount} onChange={(e) => set('instAmount', e.target.value)} placeholder="0,00" />
              </Field>
              <Field label="Kalan taksit sayısı" htmlFor="debt-count">
                <Input id="debt-count" inputMode="numeric" value={f.instCount} onChange={(e) => set('instCount', e.target.value.replace(/\D/g, ''))} placeholder="Örn. 12" />
              </Field>
            </div>
            <Field label="Sıradaki taksit tarihi" htmlFor="debt-due">
              <Input id="debt-due" type="date" value={f.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
            </Field>
            {instTotal !== null && (
              <div className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2 text-[13px]" aria-label="Kalan borç">
                <span className="text-muted">Kalan borç</span>
                <span className="num font-semibold text-ink">{formatKurus(instTotal)}</span>
              </div>
            )}
            <p className="-mt-1 text-[12px] text-subtle">Taksitler düzenli ödemelere eklenir; ödeme günü gelen taksit aylık özete gider olarak yansır ve kalan borç kendiliğinden azalır.</p>
          </>
        )}
        {debt && !monthly && (
          <Field label="Ödeme tarihi" htmlFor="debt-due" optional>
            <Input id="debt-due" type="date" value={f.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
          </Field>
        )}
        {isNew &&
          !monthly &&
          (balance ? (
            <Field label={debt ? 'Borç tutarı (TL)' : 'Tutar (TL)'} htmlFor="asset-amount">
              <Input id="asset-amount" inputMode="decimal" value={f.amount} onChange={(e) => set('amount', e.target.value)} placeholder="0,00" />
            </Field>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label={`Miktar (${f.unit || 'birim'})`} htmlFor="asset-first-qty">
                  <Input id="asset-first-qty" inputMode="decimal" value={f.qty} onChange={(e) => set('qty', e.target.value)} placeholder="0" />
                </Field>
                <Field label="Birim alış fiyatı (TL)" htmlFor="asset-first-price">
                  <Input id="asset-first-price" inputMode="decimal" value={f.price} onChange={(e) => set('price', e.target.value)} placeholder="0,00" />
                </Field>
              </div>
              {(f.kind === 'crypto' || f.kind === 'foreign') && <p className="-mt-1 text-[12px] text-subtle">Dövizle aldıysanız alış günündeki kurla TL karşılığını girin.</p>}
              {cost !== null && (
                <div className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2 text-[13px]" aria-label="Toplam maliyet">
                  <span className="text-muted">Toplam maliyet</span>
                  <span className="num font-semibold text-ink">{formatKurus(cost)}</span>
                </div>
              )}
            </>
          ))}
        {debt && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Aylık faiz (%)" htmlFor="debt-rate" optional>
              <Input id="debt-rate" inputMode="decimal" value={f.rate} onChange={(e) => set('rate', e.target.value)} placeholder="Örn. 4,25" />
            </Field>
            {!monthly && (
              <Field label="Asgari ödeme (TL)" htmlFor="debt-min" optional>
                <Input id="debt-min" inputMode="decimal" value={f.minPay} onChange={(e) => set('minPay', e.target.value)} placeholder="0,00" />
              </Field>
            )}
          </div>
        )}
        {isNew && !debt && (
          <Field label={debt ? 'Tarih' : balance ? 'Yatırma tarihi' : 'Alış tarihi'} htmlFor="asset-first-date">
            <Input id="asset-first-date" type="date" value={f.date} max={todayIso()} onChange={(e) => set('date', e.target.value)} />
          </Field>
        )}
        {AUTO_NOTE[f.kind] && !(f.kind === 'commodity' && !f.symbol) && (
          <p className="flex items-start gap-2 rounded-xl bg-accent-soft px-3 py-2 text-[12.5px] text-accent-strong dark:text-accent">
            <Sparkles className="mt-0.5 size-3.5 shrink-0" /> {AUTO_NOTE[f.kind]}
          </p>
        )}
        {error && (
          <p className="text-[12.5px] font-medium text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}

/** Büyük harfli uzun fon/şirket adlarını okunur hale getirir ("İŞ PORTFÖY BIST" → "İş Portföy BIST"). */
function tidyName(name: string): string {
  if (name !== name.toLocaleUpperCase('tr')) return name
  return name
    .toLocaleLowerCase('tr')
    .replace(/(^|[\s(/-])(\p{L})/gu, (_, a: string, b: string) => a + b.toLocaleUpperCase('tr'))
    .replace(/\b(Bist|Abd|Tl|Usd|Eur|Etf|Byf|Ab)\b/g, (w) => w.toLocaleUpperCase('tr'))
}

/**
 * Yazarken öneri gösteren alan (sembol ya da ad). Öneriler giriş yapılmışsa sunucudan gelir; istek yalnızca
 * arama metnini taşır. Ok tuşları ve Enter ile seçilir, Esc kapatır.
 */
function SuggestInput({
  id,
  value,
  onChange,
  onPick,
  market,
  minChars,
  maxLength,
  placeholder,
  upper,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  onPick: (s: SymbolSuggestion) => void
  market: QuoteMarket
  minChars: number
  maxLength: number
  placeholder?: string
  upper?: boolean
}) {
  const { backend, user } = useAuth()
  const client = backend && user ? backend.client : null
  const [items, setItems] = useState<SymbolSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [query, setQuery] = useState<string | null>(null)
  const listId = `${id}-oneriler`

  useEffect(() => {
    if (!client || query === null) return
    const q = query.trim()
    if (q.length < minChars) return
    let stale = false
    const t = setTimeout(() => {
      void searchSymbols(client, market, q).then((list) => {
        if (stale) return
        setItems(list)
        setActive(-1)
        setOpen(list.length > 0)
      })
    }, 250)
    return () => {
      stale = true
      clearTimeout(t)
    }
  }, [client, market, query, minChars])

  const choose = (sg: SymbolSuggestion) => {
    onPick(sg)
    setOpen(false)
    setItems([])
    setQuery(null)
  }
  const shown = open && items.length > 0 && (query ?? '').trim().length >= minChars

  return (
    <div className="relative">
      <Input
        id={id}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        autoComplete="off"
        autoCapitalize={upper ? 'characters' : undefined}
        role="combobox"
        aria-expanded={shown}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
        onChange={(e) => {
          const v = upper ? e.target.value.toUpperCase() : e.target.value
          onChange(v)
          setQuery(v)
          if (v.trim().length < minChars) setOpen(false)
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!shown) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((i) => Math.min(items.length - 1, i + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((i) => Math.max(0, i - 1))
          } else if (e.key === 'Enter' && active >= 0) {
            e.preventDefault()
            choose(items[active])
          } else if (e.key === 'Escape') {
            e.stopPropagation()
            setOpen(false)
          }
        }}
      />
      {shown && (
        <ul id={listId} role="listbox" aria-label="Öneriler" className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-xl border border-line bg-surface py-1 shadow-float">
          {items.map((sg, i) => (
            <li
              key={`${sg.symbol}-${i}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={cn('flex cursor-pointer items-baseline gap-2 px-3 py-2 text-[13px]', i === active ? 'bg-surface-2' : 'hover:bg-surface-2')}
              onMouseDown={(e) => {
                e.preventDefault()
                choose(sg)
              }}
            >
              <span className="num w-16 shrink-0 font-semibold text-ink">{sg.symbol}</span>
              <span className="min-w-0 flex-1 truncate text-muted">{tidyName(sg.name)}</span>
              {sg.exchange && <span className="shrink-0 text-[11px] text-subtle">{sg.exchange}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
