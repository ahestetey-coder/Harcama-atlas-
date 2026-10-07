import { ArrowDownUp, ChevronDown, Landmark, Pencil, Plus, RefreshCw, Trash2, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PageHeader } from '../components/AppShell'
import { CategoryDonut, WealthLine } from '../components/charts/Charts'
import { PlanBadge, PlanGate } from '../components/PlanGate'
import { ConfirmDialog, Modal } from '../components/ui/Modal'
import { Alert, Badge, Button, Card, EmptyState, Field, IconButton, Input, Segmented, Select } from '../components/ui/primitives'
import { toUserMessage } from '../data/repository'
import {
  ASSET_KIND_LABEL,
  ASSET_KINDS,
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
  type DebtTerms,
  type HoldingSummary,
} from '../domain/assets'
import { diffDays, formatDate, todayIso } from '../domain/dates'
import { formatKurus, formatKurusPlain, parseUserAmount } from '../domain/money'
import { cn } from '../lib/cn'
import { useInstallmentDebt } from '../state/budget'
import { useAssets, useRepo } from '../state/data'
import { useUi } from '../state/ui'

/** Dağılım renkleri: sabit sırayla (tür → renk), açık ve koyu temada doğrulanmış palet. */
const KIND_COLOR: Record<Exclude<AssetKind, 'debt'>, string> = {
  deposit: 'var(--asset-1)',
  fx: 'var(--asset-2)',
  fund: 'var(--asset-3)',
  gold: 'var(--asset-4)',
  stock: 'var(--asset-5)',
  cash: 'var(--asset-6)',
  other: 'var(--asset-7)',
}

const PRESETS: Partial<Record<AssetKind, { name: string; unit: string }[]>> = {
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
  deposit: [{ name: 'Vadeli mevduat', unit: 'TL' }],
  cash: [{ name: 'Nakit', unit: 'TL' }],
  debt: [
    { name: 'Kredi kartı borcu', unit: 'TL' },
    { name: 'İhtiyaç kredisi', unit: 'TL' },
    { name: 'Konut kredisi', unit: 'TL' },
  ],
}

const STALE_DAYS = 30

type Editing = { kind: AssetKind; asset?: Asset } | null
type Acting = { asset: Asset; mode: 'trade' | 'price' } | null

const signed = (k: number) => `${k > 0 ? '+' : k < 0 ? '−' : ''}${formatKurus(Math.abs(k))}`
const pct = (part: number, whole: number) => (whole > 0 ? `%${((part / whole) * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}` : '')

export default function AssetsPage() {
  const [editing, setEditing] = useState<Editing>(null)
  return (
    <div>
      <PageHeader
        title="Varlıklarım"
        subtitle={
          <span className="inline-flex items-center gap-2">
            <PlanBadge plan="plus" /> Altın, döviz, fon, hisse, mevduat ve borçlar
          </span>
        }
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing({ kind: 'gold' })}>
            Varlık ekle
          </Button>
        }
      />
      <PlanGate
        feature="assets"
        title="Varlıklarım"
        points={[
          'Altın, döviz, fon, hisse ve mevduatlarınızı miktar, alış tarihi ve maliyetiyle kaydedin',
          'Toplam değeri, dağılımı ve borçlar düşülmüş net varlığınızı görün',
          'Yatırdığınız parayı ve yatırım kazancını ayrı ayrı izleyin',
          'Değerler sizin girdiğiniz fiyatlarla hesaplanır; her fiyatın tarihi görünür',
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
  const installmentDebt = useInstallmentDebt()
  const [includeInstallments, setIncludeInstallments] = useState(true)
  const [acting, setActing] = useState<Acting>(null)
  const [del, setDel] = useState<Asset | null>(null)
  const today = todayIso()
  const extraDebt = includeInstallments ? installmentDebt : 0
  const p = useMemo(() => portfolio(assets ?? [], today, extraDebt), [assets, today, extraDebt])
  const history = useMemo(() => valueHistory(assets ?? [], today), [assets, today])
  if (!assets) return null

  const holdings = assets.filter((a) => a.kind !== 'debt' && !a.archived)
  const debts = assets.filter((a) => a.kind === 'debt' && !a.archived)
  const gain = p.unrealizedKurus + p.realizedKurus

  if (assets.length === 0 && installmentDebt === 0)
    return (
      <Card className="p-5">
        <EmptyState icon={<Wallet className="size-6" />} title="Henüz varlık eklenmedi" className="py-6">
          Altın, döviz, fon, hisse veya mevduatınızı ve borçlarınızı ekleyin. Değerleri siz girersiniz; bilgiler yalnızca bu cihazda kalır.
        </EmptyState>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {ASSET_KINDS.filter((k) => k !== 'other').map((k) => (
            <Button key={k} size="sm" variant="soft" onClick={() => onEdit({ kind: k })}>
              {ASSET_KIND_LABEL[k]}
            </Button>
          ))}
          <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => onEdit({ kind: 'debt' })}>
            Borç ekle
          </Button>
        </div>
      </Card>
    )

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="p-5 lg:col-span-2" aria-label="Net varlık">
        <div className="flex flex-wrap gap-x-10 gap-y-4">
          <div>
            <div className="text-[12.5px] text-muted">Net varlık</div>
            <div className="num font-display text-2xl font-semibold">{formatKurus(p.netWorthKurus)}</div>
            <div className="mt-0.5 text-[12px] text-subtle">Varlıklar − borçlar</div>
          </div>
          <Figure label="Toplam varlık" value={formatKurus(p.assetsKurus)} />
          <Figure label="Borçlar" value={formatKurus(p.debtsKurus)} />
          <Figure label="Yatırdığınız (net)" value={formatKurus(p.contributedKurus)} />
          <Figure
            label="Yatırım kazancı / kaybı"
            value={signed(gain)}
            tone={gain > 0 ? 'up' : gain < 0 ? 'down' : undefined}
            sub={p.realizedKurus !== 0 ? `Gerçekleşen ${signed(p.realizedKurus)} · eldeki ${signed(p.unrealizedKurus)}` : p.contributedKurus > 0 ? pct(gain, p.contributedKurus) : undefined}
          />
        </div>
        {p.oldestPriceDate && diffDays(today, p.oldestPriceDate) > STALE_DAYS && (
          <Alert tone="warning" className="mt-4">
            Bazı fiyatlar {STALE_DAYS} günden eski ({formatDate(p.oldestPriceDate)}). Güncel değer için fiyatları güncelleyin.
          </Alert>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="font-display text-base font-semibold">Dağılım</h2>
        {p.allocation.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Değeri olan bir varlık yok.</p>
        ) : (
          <>
            <div className="mt-3">
              <CategoryDonut
                slices={p.allocation.map((a) => ({ id: a.kind, name: ASSET_KIND_LABEL[a.kind], color: KIND_COLOR[a.kind], kurus: a.valueKurus }))}
                total={p.assetsKurus}
                centerLabel="Toplam varlık"
                valueLabel="Değer"
              />
            </div>
            <ul className="mt-3 space-y-1.5" aria-label="Varlık dağılımı">
              {p.allocation.map((a) => (
                <li key={a.kind} className="flex items-center gap-2 text-[13px]">
                  <span className="size-2.5 shrink-0 rounded-sm" style={{ background: KIND_COLOR[a.kind] }} aria-hidden />
                  <span className="flex-1 text-ink">{ASSET_KIND_LABEL[a.kind]}</span>
                  <span className="num w-14 text-right text-muted">{pct(a.valueKurus, p.assetsKurus)}</span>
                  <span className="num w-32 text-right font-medium text-ink">{formatKurus(a.valueKurus)}</span>
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
            <Wallet className="size-5 text-accent" /> Varlıklar
          </h2>
          <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => onEdit({ kind: 'gold' })}>
            Ekle
          </Button>
        </div>
        {holdings.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Henüz varlık yok.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line" aria-label="Varlıklar">
            {ASSET_KINDS.flatMap((k) => holdings.filter((a) => a.kind === k)).map((a) => (
              <HoldingRow key={a.id} asset={a} s={holdingSummary(a, today)} onAct={(mode) => setActing({ asset: a, mode })} onEdit={() => onEdit({ kind: a.kind, asset: a })} onDelete={() => setDel(a)} />
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5 lg:col-span-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <Landmark className="size-5 text-accent" /> Borçlar
          </h2>
          <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => onEdit({ kind: 'debt' })}>
            Borç ekle
          </Button>
        </div>
        <ul className="mt-2 divide-y divide-line" aria-label="Borçlar">
          {installmentDebt > 0 && (
            <li className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
                <div className="font-medium text-ink">Kalan taksitler</div>
                <div className="text-[12px] text-muted">Düzenli ödemeler sayfasındaki taksitlerden otomatik</div>
              </div>
              <label className="flex flex-1 items-center gap-1.5 text-[12.5px] text-muted sm:flex-none">
                <input type="checkbox" className="accent-[var(--accent)]" checked={includeInstallments} onChange={(e) => setIncludeInstallments(e.target.checked)} />
                Net varlığa kat
              </label>
              <span className="num w-32 text-right font-semibold">{formatKurus(installmentDebt)}</span>
            </li>
          )}
          {debts.map((a) => (
            <HoldingRow key={a.id} asset={a} s={holdingSummary(a, today)} onAct={(mode) => setActing({ asset: a, mode })} onEdit={() => onEdit({ kind: 'debt', asset: a })} onDelete={() => setDel(a)} />
          ))}
          {installmentDebt === 0 && debts.length === 0 && <li className="py-2 text-sm text-muted">Kayıtlı borç yok.</li>}
        </ul>
      </Card>

      <p className="text-[12.5px] text-subtle lg:col-span-2">
        Değerler sizin girdiğiniz fiyatlarla hesaplanır; otomatik piyasa fiyatı kullanılmaz. Bu sayfa yatırım tavsiyesi vermez. Bilgiler yalnızca bu cihazda tutulur.
      </p>

      <ActionDialog acting={acting} onClose={() => setActing(null)} />
      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title={del?.kind === 'debt' ? 'Borç silinsin mi?' : 'Varlık silinsin mi?'}
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

function Figure({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'up' | 'down' }) {
  return (
    <div>
      <div className="text-[12.5px] text-muted">{label}</div>
      <div className={cn('num font-display text-lg font-semibold', tone === 'up' && 'text-accent', tone === 'down' && 'text-danger')}>{value}</div>
      {sub && <div className="num mt-0.5 text-[12px] text-subtle">{sub}</div>}
    </div>
  )
}

function priceSourceLabel(s: HoldingSummary['price'], balance: boolean): string {
  if (!s) return 'Fiyat yok'
  if (s.source === 'manual') return `${balance ? 'Bakiye' : 'Fiyat'} elle girildi · ${formatDate(s.date)}`
  return `${balance ? 'Son hareket' : 'İşlem fiyatı'} · ${formatDate(s.date)}`
}

function HoldingRow({ asset, s, onAct, onEdit, onDelete }: { asset: Asset; s: HoldingSummary; onAct: (m: 'trade' | 'price') => void; onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const balance = isBalanceKind(asset.kind)
  const debt = asset.kind === 'debt'
  const stale = s.price && s.quantity > 0 && diffDays(todayIso(), s.price.date) > STALE_DAYS
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium text-ink">{asset.name}</span>
            <Badge tone={debt ? 'danger' : 'neutral'}>{ASSET_KIND_LABEL[asset.kind]}</Badge>
            {stale && <Badge tone="warning">Fiyat eski</Badge>}
          </div>
          <div className="text-[12px] text-muted">
            {!balance && s.price && `${formatQuantity(s.quantity)} ${asset.unit} × ${formatUnitPrice(s.price.unitPriceKurus)} · `}
            {debt && asset.debtTerms ? (
              <>
                Aylık %{asset.debtTerms.monthlyRatePct.toLocaleString('tr-TR')} faiz
                {asset.debtTerms.minPaymentKurus ? ` · aylık ödeme ${formatKurus(asset.debtTerms.minPaymentKurus)}` : ''}
                {' · '}
              </>
            ) : null}
            {priceSourceLabel(s.price, balance)}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="num font-semibold">{formatKurus(s.valueKurus)}</div>
          {!debt && s.quantity > 0 && (
            <div className={cn('num text-[12px]', s.unrealizedKurus > 0 ? 'text-accent' : s.unrealizedKurus < 0 ? 'text-danger' : 'text-muted')}>
              {signed(s.unrealizedKurus)} {pct(s.unrealizedKurus, s.costKurus)}
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="soft" icon={<RefreshCw className="size-3.5" />} onClick={() => onAct('price')} disabled={s.quantity <= 0}>
          <span className="sm:hidden">Güncelle</span>
          <span className="hidden sm:inline">{balance ? 'Bakiyeyi güncelle' : 'Fiyatı güncelle'}</span>
        </Button>
        <Button size="sm" variant="ghost" icon={<ArrowDownUp className="size-3.5" />} onClick={() => onAct('trade')}>
          <span className="sm:hidden">{debt ? 'Ödeme' : 'İşlem'}</span>
          <span className="hidden sm:inline">{debt ? 'Ödeme / ek borç' : balance ? 'Para yatır / çek' : 'Alış / satış'}</span>
        </Button>
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
      text: balance ? `Bakiye güncellendi: ${formatKurus(Math.round(v.unitPriceKurus * quantityOn(asset, v.date)))}` : `Fiyat: ${formatUnitPrice(v.unitPriceKurus)} (elle)`,
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

function ActionDialog({ acting, onClose }: { acting: Acting; onClose: () => void }) {
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

function AssetEditor({ editing, onClose }: { editing: Editing; onClose: () => void }) {
  const repo = useRepo()
  const { toast } = useUi()
  const [f, setF] = useState({ kind: 'gold' as AssetKind, name: '', unit: 'gram', qty: '', price: '', amount: '', date: todayIso(), rate: '', minPay: '' })
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [shown, setShown] = useState<Editing>(null)
  if (editing !== shown) {
    setShown(editing)
    if (editing) {
      const a = editing.asset
      const t = a?.debtTerms
      setF({
        kind: editing.kind,
        name: a?.name ?? '',
        unit: a?.unit ?? DEFAULT_UNIT[editing.kind],
        qty: '',
        price: '',
        amount: '',
        date: todayIso(),
        rate: t ? String(t.monthlyRatePct).replace('.', ',') : '',
        minPay: t?.minPaymentKurus ? formatKurusPlain(t.minPaymentKurus) : '',
      })
      setError(undefined)
    }
  }
  const isNew = !editing?.asset
  const debt = f.kind === 'debt'
  const balance = isBalanceKind(f.kind)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }))

  const save = async () => {
    setError(undefined)
    if (!f.name.trim()) return setError('Bir ad girin.')
    let first: { date: string; quantity: number; unitPriceKurus: number } | undefined
    if (isNew) {
      if (balance) {
        const amt = parseUserAmount(f.amount)
        if (!amt.ok || amt.kurus <= 0) return setError('Geçerli bir tutar girin.')
        first = { date: f.date, quantity: amt.kurus / 100, unitPriceKurus: 100 }
      } else {
        const q = parseQuantity(f.qty)
        const p = parsePriceKurus(f.price)
        if (q === null) return setError('Geçerli bir miktar girin.')
        if (p === null) return setError('Geçerli bir alış fiyatı girin.')
        first = { date: f.date, quantity: q, unitPriceKurus: p }
      }
    }
    let debtTerms: DebtTerms | null | undefined
    if (debt) {
      const rate = f.rate.trim() ? Number(f.rate.trim().replace(',', '.')) : null
      if (rate !== null && (!Number.isFinite(rate) || rate < 0 || rate > 100)) return setError('Aylık faiz oranı 0 ile 100 arasında olmalı.')
      let minPay: number | null = null
      if (f.minPay.trim()) {
        const m = parseUserAmount(f.minPay)
        if (!m.ok || m.kurus <= 0) return setError('Aylık ödeme için geçerli bir tutar girin.')
        minPay = m.kurus
      }
      debtTerms = rate === null && minPay === null ? null : { monthlyRatePct: rate ?? 0, minPaymentKurus: minPay }
    }
    setBusy(true)
    try {
      await repo.saveAsset({ id: editing?.asset?.id, kind: f.kind, name: f.name, unit: balance ? 'TL' : f.unit, debtTerms }, first)
      toast(isNew ? `${f.name.trim()} eklendi.` : 'Kaydedildi.')
      onClose()
    } catch (e) {
      setError(toUserMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const presets = PRESETS[f.kind] ?? []
  return (
    <Modal
      open={!!editing}
      onOpenChange={(o) => !o && onClose()}
      title={isNew ? (debt ? 'Borç ekle' : 'Varlık ekle') : debt ? 'Borcu düzenle' : 'Varlığı düzenle'}
      size="sm"
      footer={
        <Button variant="primary" loading={busy} onClick={() => void save()}>
          Kaydet
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        {isNew && !debt && (
          <Field label="Tür" htmlFor="asset-kind">
            <Select
              id="asset-kind"
              value={f.kind}
              onChange={(e) => {
                const k = e.target.value as AssetKind
                setF((p) => ({ ...p, kind: k, unit: DEFAULT_UNIT[k], name: '' }))
              }}
            >
              {ASSET_KINDS.map((k) => (
                <option key={k} value={k}>
                  {ASSET_KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {isNew && presets.length > 0 && (
          <div className="flex flex-wrap gap-1.5" aria-label="Hazır seçenekler">
            {presets.map((p) => (
              <Button key={p.name} size="sm" variant={f.name === p.name ? 'soft' : 'ghost'} onClick={() => setF((x) => ({ ...x, name: p.name, unit: p.unit }))}>
                {p.name}
              </Button>
            ))}
          </div>
        )}
        <Field label="Ad" htmlFor="asset-name">
          <Input id="asset-name" value={f.name} maxLength={60} onChange={(e) => set('name', e.target.value)} placeholder={debt ? 'Örn. Taşıt kredisi' : f.kind === 'fund' ? 'Örn. fon kodu veya adı' : f.kind === 'stock' ? 'Örn. hisse kodu' : ''} />
        </Field>
        {!balance && (
          <Field label="Birim" htmlFor="asset-unit" hint="Fiyatı hangi birim için gireceğiniz (gram, adet, USD, pay…)">
            <Input id="asset-unit" value={f.unit} maxLength={16} onChange={(e) => set('unit', e.target.value)} />
          </Field>
        )}
        {isNew &&
          (balance ? (
            <Field label={debt ? 'Kalan borç (TL)' : 'Tutar (TL)'} htmlFor="asset-amount">
              <Input id="asset-amount" inputMode="decimal" value={f.amount} onChange={(e) => set('amount', e.target.value)} placeholder="0,00" />
            </Field>
          ) : (
            <>
              <Field label={`Miktar (${f.unit || 'birim'})`} htmlFor="asset-first-qty">
                <Input id="asset-first-qty" inputMode="decimal" value={f.qty} onChange={(e) => set('qty', e.target.value)} placeholder="0" />
              </Field>
              <Field label="Birim alış fiyatı (TL)" htmlFor="asset-first-price">
                <Input id="asset-first-price" inputMode="decimal" value={f.price} onChange={(e) => set('price', e.target.value)} placeholder="0,00" />
              </Field>
            </>
          ))}
        {debt && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Aylık faiz (%)" htmlFor="debt-rate" hint="Örn. kartta 4,25">
              <Input id="debt-rate" inputMode="decimal" value={f.rate} onChange={(e) => set('rate', e.target.value)} placeholder="0" />
            </Field>
            <Field label="Aylık ödeme (TL)" htmlFor="debt-min" hint="Asgari ödeme veya taksit">
              <Input id="debt-min" inputMode="decimal" value={f.minPay} onChange={(e) => set('minPay', e.target.value)} placeholder="0,00" />
            </Field>
          </div>
        )}
        {isNew && (
          <Field label={debt ? 'Tarih' : balance ? 'Yatırma tarihi' : 'Alış tarihi'} htmlFor="asset-first-date">
            <Input id="asset-first-date" type="date" value={f.date} max={todayIso()} onChange={(e) => set('date', e.target.value)} />
          </Field>
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
