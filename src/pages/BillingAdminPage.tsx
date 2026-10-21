import { ArrowLeft, BadgePercent, CreditCard, Link2, Lock, Plus, RefreshCw, Tags, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/AppShell'
import { Alert, Badge, Button, Card, Checkbox, EmptyState, Field, Input, Segmented, Skeleton, Switch } from '../components/ui/primitives'
import { listUsers } from '../cloud/admin'
import {
  addCoupon,
  BillingNotInstalledError,
  deleteCoupon,
  loadBillingAdmin,
  PERIOD_LABEL,
  PLAN_LABEL,
  savePrice,
  saveSettings,
  setCouponActive,
  syncPaddle,
  type BillingSettings,
  type Coupon,
  type WebPeriod,
  type WebPlan,
  type WebPrice,
  type WebSubscription,
  type WebhookEvent,
} from '../cloud/billing'
import { cloudErrorMessage } from '../cloud/errors'
import { formatKurus, formatKurusPlain, parseUserAmount } from '../domain/money'
import { cn } from '../lib/cn'
import { useIsAdmin } from '../state/admin'
import { useAuth } from '../state/auth'
import { useUi } from '../state/ui'

/**
 * Web satışları (Paddle): fiyatlar, kampanya kodları, abonelikler ve bağlantı. Kaydedilen her değişiklik
 * ha-billing fonksiyonuyla Paddle'a kendiliğinden aktarılır. Uygulamada web ödemesine bağlantı yoktur;
 * bu sayfa yalnızca yöneticiye açıktır.
 */
type Tab = 'fiyatlar' | 'kodlar' | 'abonelikler' | 'baglanti'
type Data = Awaited<ReturnType<typeof loadBillingAdmin>>

export default function BillingAdminPage() {
  const auth = useAuth()
  const admin = useIsAdmin()
  if (!auth.enabled || !admin) {
    return (
      <div>
        <PageHeader title="Web satışları" />
        <Card>
          <EmptyState icon={<Lock className="size-6" />} title="Bu sayfa yalnızca yöneticiye açık" />
        </Card>
      </div>
    )
  }
  return <Console />
}

function Console() {
  const { backend } = useAuth()
  const { toast } = useUi()
  const client = backend!.client
  const [tab, setTab] = useState<Tab>('fiyatlar')
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  const load = useCallback(async () => {
    try {
      setData(await loadBillingAdmin(client))
      setError(null)
    } catch (e) {
      setError(e instanceof BillingNotInstalledError ? e.message : cloudErrorMessage(e))
    }
  }, [client])
  useEffect(() => void load(), [load])

  /** Kaydettikten sonra Paddle'a aktarır; bağlantı yoksa kayıt yine durur, uyarı gösterilir. */
  const sync = useCallback(
    async (quiet = false) => {
      setSyncing(true)
      try {
        await syncPaddle(client)
        if (!quiet) toast("Paddle'a aktarıldı.")
      } catch (e) {
        toast(`Kaydedildi, Paddle'a aktarılamadı: ${(e as Error).message}`, { kind: 'error', duration: 8000 })
      } finally {
        setSyncing(false)
        await load()
      }
    },
    [client, load, toast],
  )

  return (
    <div>
      <PageHeader
        title="Web satışları"
        subtitle="Sitedeki abonelik fiyatları, kampanya kodları ve Paddle bağlantısı"
        actions={
          <Link to="/yonetim" className="inline-flex items-center gap-1 text-[13px] font-medium text-muted hover:text-ink">
            <ArrowLeft className="size-4" /> Yönetici paneli
          </Link>
        }
      />
      {error ? (
        <Alert tone="danger" title="Web satışları açılamadı">
          {error}
        </Alert>
      ) : !data ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <>
          <SyncBar settings={data.settings} syncing={syncing} onSync={() => void sync()} />
          <Segmented<Tab>
            label="Bölüm"
            value={tab}
            onChange={setTab}
            className="no-scrollbar mb-4 max-sm:w-full max-sm:overflow-x-auto"
            options={[
              { value: 'fiyatlar', label: 'Fiyatlar', icon: <Tags className="size-3.5" /> },
              { value: 'kodlar', label: 'Kampanya kodları', icon: <BadgePercent className="size-3.5" /> },
              { value: 'abonelikler', label: 'Abonelikler', icon: <CreditCard className="size-3.5" /> },
              { value: 'baglanti', label: 'Bağlantı', icon: <Link2 className="size-3.5" /> },
            ]}
          />
          {tab === 'fiyatlar' && <PricesTab prices={data.prices} onSaved={() => sync(true)} />}
          {tab === 'kodlar' && <CouponsTab coupons={data.coupons} onSaved={() => sync(true)} />}
          {tab === 'abonelikler' && <SubscriptionsTab subs={data.subscriptions} events={data.events} />}
          {tab === 'baglanti' && data.settings && <ConnectionTab settings={data.settings} onSaved={() => sync()} />}
        </>
      )}
    </div>
  )
}

function SyncBar({ settings, syncing, onSync }: { settings: BillingSettings | null; syncing: boolean; onSync: () => void }) {
  const env = settings?.environment === 'production' ? 'Canlı' : 'Deneme (sandbox)'
  return (
    <Alert
      tone={settings?.sync_error ? 'danger' : 'info'}
      className="mb-4"
      title={settings?.sync_error ? "Paddle'a son aktarım başarısız" : `Ortam: ${env}`}
      action={
        <Button size="sm" icon={<RefreshCw className={cn('size-4', syncing && 'animate-spin')} />} onClick={onSync} disabled={syncing}>
          Şimdi aktar
        </Button>
      }
    >
      {settings?.sync_error ?? (settings?.synced_at ? `Son aktarım: ${new Date(settings.synced_at).toLocaleString('tr-TR')}` : "Henüz Paddle'a aktarılmadı. Önce Bağlantı bölümünü doldurun.")}
    </Alert>
  )
}

function PricesTab({ prices, onSaved }: { prices: WebPrice[]; onSaved: () => Promise<void> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {prices.map((p) => (
        <PriceCard key={`${p.plan}:${p.period}`} price={p} onSaved={onSaved} />
      ))}
      <p className="text-[12.5px] text-subtle sm:col-span-2">
        Fiyatlar KDV dahildir. Değişiklik yeni abonelere uygulanır; mevcut aboneler eski fiyattan devam eder. Deneme süresi yalnızca ilk abonelikte anlamlıdır.
      </p>
    </div>
  )
}

function PriceCard({ price, onSaved }: { price: WebPrice; onSaved: () => Promise<void> }) {
  const { backend } = useAuth()
  const { toast } = useUi()
  const [amount, setAmount] = useState(formatKurusPlain(price.amount_kurus))
  const [trial, setTrial] = useState(String(price.trial_days))
  const [active, setActive] = useState(price.active)
  const [busy, setBusy] = useState(false)
  const parsed = parseUserAmount(amount)
  const trialN = Number(trial)
  const err = !parsed.ok || parsed.kurus < 2700 ? 'En az 27 TL olmalı' : !Number.isInteger(trialN) || trialN < 0 || trialN > 30 ? 'Deneme 0–30 gün olmalı' : null
  const dirty = parsed.ok && (parsed.kurus !== price.amount_kurus || trialN !== price.trial_days || active !== price.active)
  const id = `${price.plan}-${price.period}`
  const save = async () => {
    if (err || !parsed.ok) return
    setBusy(true)
    try {
      await savePrice(backend!.client, { plan: price.plan, period: price.period, amount_kurus: parsed.kurus, trial_days: trialN, active })
      await onSaved()
    } catch (e) {
      toast(cloudErrorMessage(e), { kind: 'error' })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-display text-base font-semibold">
          {PLAN_LABEL[price.plan]} · {PERIOD_LABEL[price.period]}
        </h3>
        {price.paddle_price_id ? <Badge tone="accent">Paddle'da</Badge> : <Badge tone="warning">Aktarılmadı</Badge>}
      </div>
      <div className="grid grid-cols-[1fr_7rem] gap-3">
        <Field label="Fiyat (TL)" htmlFor={`${id}-a`} error={err ?? undefined}>
          <Input id={`${id}-a`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Deneme (gün)" htmlFor={`${id}-t`}>
          <Input id={`${id}-t`} inputMode="numeric" value={trial} onChange={(e) => setTrial(e.target.value.replace(/\D/g, ''))} />
        </Field>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <Switch checked={active} onChange={setActive} label="Satışta" />
        <Button size="sm" variant="primary" onClick={() => void save()} disabled={!dirty || !!err || busy} loading={busy}>
          Kaydet
        </Button>
      </div>
    </Card>
  )
}

const EMPTY = { code: '', percent: '20', plans: ['plus', 'plusplus'] as WebPlan[], periods: ['monthly', 'yearly'] as WebPeriod[], recur: '', limit: '', expires: '', note: '' }

function CouponsTab({ coupons, onSaved }: { coupons: Coupon[]; onSaved: () => Promise<void> }) {
  const { backend } = useAuth()
  const { toast } = useUi()
  const client = backend!.client
  const [f, setF] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const code = f.code.trim().toUpperCase()
  const pct = Number(f.percent)
  const err = !/^[A-Z0-9]{3,20}$/.test(code)
    ? 'Kod 3–20 harf ya da rakam olmalı (Türkçe karakter ve boşluk yok)'
    : coupons.some((c) => c.code === code)
      ? 'Bu kod zaten var'
      : !Number.isInteger(pct) || pct < 1 || pct > 100
        ? 'İndirim %1–100 olmalı'
        : !f.plans.length || !f.periods.length
          ? 'En az bir paket ve dönem seçin'
          : null
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
      await onSaved()
    } catch (e) {
      toast(cloudErrorMessage(e), { kind: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <Card className="overflow-hidden">
        {coupons.length === 0 ? (
          <EmptyState icon={<BadgePercent className="size-6" />} title="Henüz kampanya kodu yok">
            Sağdaki formla ilk kodu ekleyin. Kod, sitedeki ödeme sayfasında kullanılır.
          </EmptyState>
        ) : (
          <ul aria-label="Kampanya kodları" className="divide-y divide-line">
            {coupons.map((c) => (
              <li key={c.code} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="num font-display text-[15px] font-bold tracking-wide">{c.code}</span>
                    <Badge tone="accent">%{c.percent_off}</Badge>
                    {!c.paddle_discount_id && <Badge tone="warning">Aktarılmadı</Badge>}
                    {c.expires_at && new Date(c.expires_at) < new Date() && <Badge tone="danger">Süresi doldu</Badge>}
                  </div>
                  <p className="mt-1 text-[12.5px] text-muted">
                    {c.plans.map((p) => PLAN_LABEL[p]).join(', ')} · {c.periods.map((p) => PERIOD_LABEL[p]).join(', ')}
                    {' · '}
                    {c.recur_intervals === null ? 'abonelik boyunca' : c.recur_intervals === 1 ? 'yalnızca ilk ödeme' : `ilk ${c.recur_intervals} ödeme`}
                    {c.usage_limit ? ` · en çok ${c.usage_limit} kullanım` : ''}
                    {c.expires_at ? ` · ${new Date(c.expires_at).toLocaleDateString('tr-TR')} tarihine kadar` : ''}
                    {c.note ? ` · ${c.note}` : ''}
                  </p>
                </div>
                <Switch checked={c.active} onChange={(v) => void run(() => setCouponActive(client, c.code, v))} label={`${c.code} etkin`} disabled={busy} />
                {!c.paddle_discount_id && (
                  <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} aria-label={`${c.code} sil`} onClick={() => void run(() => deleteCoupon(client, c.code))} disabled={busy} />
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="mb-3 font-display text-base font-semibold">Yeni kod</h3>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (err) return
            void run(async () => {
              await addCoupon(client, {
                code,
                percent_off: pct,
                plans: f.plans,
                periods: f.periods,
                recur_intervals: f.recur ? Number(f.recur) : null,
                usage_limit: f.limit ? Number(f.limit) : null,
                expires_at: f.expires ? new Date(`${f.expires}T23:59:59+03:00`).toISOString() : null,
                active: true,
                note: f.note.trim() || null,
              })
              setF(EMPTY)
            })
          }}
        >
          <div className="grid grid-cols-[1fr_6rem] gap-3">
            <Field label="Kod" htmlFor="k-code">
              <Input id="k-code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="YAZ20" autoCapitalize="characters" />
            </Field>
            <Field label="İndirim %" htmlFor="k-pct">
              <Input id="k-pct" inputMode="numeric" value={f.percent} onChange={(e) => setF({ ...f, percent: e.target.value.replace(/\D/g, '') })} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {(['plus', 'plusplus'] as WebPlan[]).map((p) => (
              <Checkbox key={p} label={PLAN_LABEL[p]} checked={f.plans.includes(p)} onChange={() => setF({ ...f, plans: toggle(f.plans, p) })} />
            ))}
            {(['monthly', 'yearly'] as WebPeriod[]).map((p) => (
              <Checkbox key={p} label={PERIOD_LABEL[p]} checked={f.periods.includes(p)} onChange={() => setF({ ...f, periods: toggle(f.periods, p) })} />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kaç ödemede" htmlFor="k-rec" optional hint="Boş: abonelik boyunca">
              <Input id="k-rec" inputMode="numeric" value={f.recur} onChange={(e) => setF({ ...f, recur: e.target.value.replace(/\D/g, '').slice(0, 2) })} />
            </Field>
            <Field label="Kullanım sınırı" htmlFor="k-lim" optional>
              <Input id="k-lim" inputMode="numeric" value={f.limit} onChange={(e) => setF({ ...f, limit: e.target.value.replace(/\D/g, '').slice(0, 6) })} />
            </Field>
          </div>
          <Field label="Son gün" htmlFor="k-exp" optional>
            <Input id="k-exp" type="date" value={f.expires} onChange={(e) => setF({ ...f, expires: e.target.value })} />
          </Field>
          <Field label="Not" htmlFor="k-note" optional>
            <Input id="k-note" maxLength={200} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Ör. Instagram kampanyası" />
          </Field>
          {f.code && err && <p className="text-[12.5px] font-medium text-danger">{err}</p>}
          <Button type="submit" variant="primary" icon={<Plus className="size-4" />} disabled={!!err || busy} loading={busy}>
            Kodu ekle
          </Button>
        </form>
      </Card>
    </div>
  )
}

const STATUS: Record<WebSubscription['status'], { label: string; tone: 'accent' | 'info' | 'warning' | 'danger' | 'neutral' }> = {
  active: { label: 'Etkin', tone: 'accent' },
  trialing: { label: 'Deneme', tone: 'info' },
  past_due: { label: 'Ödeme alınamadı', tone: 'danger' },
  paused: { label: 'Duraklatıldı', tone: 'warning' },
  canceled: { label: 'Bitti', tone: 'neutral' },
}

function SubscriptionsTab({ subs, events }: { subs: WebSubscription[]; events: WebhookEvent[] }) {
  const { backend } = useAuth()
  const [emails, setEmails] = useState<Record<string, string>>({})
  useEffect(() => {
    listUsers(backend!.client)
      .then((u) => setEmails(Object.fromEntries(u.map((x) => [x.id, x.email ?? x.full_name ?? '']))))
      .catch(() => setEmails({}))
  }, [backend])
  const live = subs.filter((s) => s.status !== 'canceled')
  const mrr = useMemo(() => live.filter((s) => s.status === 'active').reduce((n, s) => n + (s.amount_kurus ?? 0) / (s.period === 'yearly' ? 12 : 1), 0), [live])
  const failed = events.filter((e) => e.error && !e.processed_at).length
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Etkin" value={String(live.filter((s) => s.status === 'active').length)} />
        <Stat label="Denemede" value={String(live.filter((s) => s.status === 'trialing').length)} />
        <Stat label="Aylık gelir (yaklaşık)" value={formatKurus(Math.round(mrr))} />
        <Stat label="İşlenemeyen bildirim" value={String(failed)} danger={failed > 0} />
      </div>
      <Card className="overflow-hidden">
        {subs.length === 0 ? (
          <EmptyState icon={<CreditCard className="size-6" />} title="Henüz web aboneliği yok" />
        ) : (
          <ul aria-label="Abonelikler" className="divide-y divide-line">
            {subs.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4 text-[13.5px]">
                <span className="min-w-0 flex-1 truncate font-medium">{(s.user_id && emails[s.user_id]) || (s.user_id ? `${s.user_id.slice(0, 8)}…` : 'Silinmiş hesap')}</span>
                <span>
                  {PLAN_LABEL[s.plan]} · {PERIOD_LABEL[s.period]}
                </span>
                <span className="num text-muted">{s.amount_kurus ? formatKurus(s.amount_kurus) : ''}</span>
                <Badge tone={STATUS[s.status].tone}>{s.cancel_at && s.status !== 'canceled' ? 'İptal edildi' : STATUS[s.status].label}</Badge>
                <span className="text-[12px] text-subtle">
                  {s.status === 'trialing' && s.trial_end ? `Deneme ${new Date(s.trial_end).toLocaleDateString('tr-TR')}` : s.current_period_end ? `Dönem sonu ${new Date(s.current_period_end).toLocaleDateString('tr-TR')}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {events.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-2 font-display text-base font-semibold">Son Paddle bildirimleri</h3>
          <ul className="flex flex-col gap-1 text-[12.5px]">
            {events.slice(0, 15).map((e) => (
              <li key={e.event_id} className="flex flex-wrap gap-x-3">
                <span className="num text-subtle">{new Date(e.received_at).toLocaleString('tr-TR')}</span>
                <span>{e.event_type}</span>
                {e.error ? <span className="text-danger">{e.error}</span> : <span className="text-accent">işlendi</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <Card className="p-4">
      <div className="text-[12.5px] text-muted">{label}</div>
      <div className={cn('num mt-1 font-display text-xl font-bold', danger && 'text-danger')}>{value}</div>
    </Card>
  )
}

function ConnectionTab({ settings, onSaved }: { settings: BillingSettings; onSaved: () => Promise<void> }) {
  const { backend } = useAuth()
  const { toast } = useUi()
  const [env, setEnv] = useState(settings.environment)
  const [token, setToken] = useState(settings.client_token ?? '')
  const [confirmLive, setConfirmLive] = useState(false)
  const [busy, setBusy] = useState(false)
  const t = token.trim()
  const tokenErr = t && !/^(test|live)_[A-Za-z0-9]{10,}$/.test(t) ? 'İstemci anahtarı test_ ya da live_ ile başlar' : t && (env === 'sandbox') !== t.startsWith('test_') ? 'Deneme ortamında test_, canlıda live_ anahtarı kullanılır' : null
  const switchingLive = env === 'production' && settings.environment !== 'production'
  return (
    <Card className="flex max-w-2xl flex-col gap-4 p-4 sm:p-5">
      <Segmented<BillingSettings['environment']>
        label="Ortam"
        value={env}
        onChange={setEnv}
        options={[
          { value: 'sandbox', label: 'Deneme (sandbox)' },
          { value: 'production', label: 'Canlı' },
        ]}
      />
      <Field label="Paddle istemci anahtarı (client-side token)" htmlFor="pd-token" error={tokenErr ?? undefined} hint="Paddle > Developer tools > Authentication. Herkese açık bir anahtardır; gizli API anahtarı buraya yazılmaz.">
        <Input id="pd-token" value={token} onChange={(e) => setToken(e.target.value)} placeholder="test_…" autoComplete="off" spellCheck={false} />
      </Field>
      <Alert tone="info">
        Gizli API anahtarı uygulamaya ya da bu sayfaya yazılmaz: Supabase &gt; Edge Functions &gt; Secrets bölümüne <code>PADDLE_API_KEY</code> adıyla eklenir. Kaydedince ürünler, fiyatlar, kodlar ve bildirim adresi Paddle'da kendiliğinden oluşturulur.
      </Alert>
      {switchingLive && (
        <Checkbox
          checked={confirmLive}
          onChange={setConfirmLive}
          label="Canlıya geçiyorum: gerçek ödeme alınacak. Şirket bilgileri Paddle'da onaylandı ve PADDLE_API_KEY canlı anahtarla değiştirildi."
        />
      )}
      <Button
        variant="primary"
        className="self-start"
        loading={busy}
        disabled={busy || !!tokenErr || !t || (switchingLive && !confirmLive)}
        onClick={async () => {
          setBusy(true)
          try {
            await saveSettings(backend!.client, { environment: env, client_token: t })
            await onSaved()
          } catch (e) {
            toast(cloudErrorMessage(e), { kind: 'error' })
          } finally {
            setBusy(false)
          }
        }}
      >
        Kaydet ve Paddle'a bağla
      </Button>
    </Card>
  )
}
