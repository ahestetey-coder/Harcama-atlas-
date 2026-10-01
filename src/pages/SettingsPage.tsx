import { CloudOff, Download, FlaskConical, Monitor, Moon, Repeat, RotateCcw, ScanText, Sun, Target } from 'lucide-react'
import { useEffect, useState } from 'react'
import { PageHeader } from '../components/AppShell'
import { CycleSelect } from '../components/common'
import { ConfirmDialog } from '../components/ui/Modal'
import { Alert, Badge, Button, Card, Field, Input, Segmented, Select, Switch } from '../components/ui/primitives'
import { APP_CONFIG } from '../config/app'
import { toUserMessage } from '../data/repository'
import { formatKurusPlain, parseUserAmount } from '../domain/money'
import { PAYMENT_LABEL, type PaymentMethod, type ThemePreference } from '../domain/types'
import { downloadOcrAssets, ocrAssetInfo, ocrCacheStatus } from '../import/ocr'
import { useData, useSettings } from '../state/data'
import { useTheme } from '../state/theme'
import { useUi } from '../state/ui'

export default function SettingsPage() {
  const { preference, setPreference } = useTheme()
  const { repo, isDemo, setDemo } = useData()
  const settings = useSettings()
  const { toast } = useUi()
  const [budget, setBudget] = useState('')
  const [budgetErr, setBudgetErr] = useState<string>()
  const [resetOpen, setResetOpen] = useState(false)
  const [ocr, setOcr] = useState<{ status: Awaited<ReturnType<typeof ocrCacheStatus>>; bytes?: number } | null>(null)
  const [dl, setDl] = useState<{ done: number; total: number } | null>(null)

  useEffect(() => {
    if (settings) setBudget(settings.monthlyBudgetKurus ? formatKurusPlain(settings.monthlyBudgetKurus) : '')
  }, [settings])

  const refreshOcr = async () => {
    const [status, info] = await Promise.all([ocrCacheStatus(), ocrAssetInfo()])
    setOcr({ status, bytes: info?.totalBytes })
  }
  useEffect(() => {
    void refreshOcr()
  }, [])

  const saveBudget = async () => {
    let k: number | null = null
    if (budget.trim()) {
      const p = parseUserAmount(budget)
      if (!p.ok || p.kurus <= 0) return setBudgetErr('Geçerli bir tutar girin.')
      k = p.kurus
    }
    setBudgetErr(undefined)
    await repo.saveSettings({ monthlyBudgetKurus: k })
    toast(k ? 'Bütçe kaydedildi.' : 'Bütçe kaldırıldı.')
  }

  const ocrLabel = { ready: 'Çevrimdışı kullanıma hazır', partial: 'Kısmen indirildi', missing: 'Henüz indirilmedi', unsupported: 'Bu tarayıcıda önbellek durumu görülemiyor' }

  return (
    <div>
      <PageHeader title="Ayarlar" subtitle={`${APP_CONFIG.name} · sürüm 1.0`} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-display text-base font-semibold">Görünüm</h2>
          <p className="mt-1 text-sm text-muted">Tema seçiminiz bu cihazda hatırlanır.</p>
          <Segmented<ThemePreference>
            label="Tema"
            value={preference}
            onChange={setPreference}
            className="mt-4 w-full"
            options={[
              { value: 'system', label: 'Sistem', icon: <Monitor className="size-4" /> },
              { value: 'light', label: 'Açık', icon: <Sun className="size-4" /> },
              { value: 'dark', label: 'Koyu', icon: <Moon className="size-4" /> },
            ]}
          />
        </Card>

        <Card className="p-5">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <Target className="size-5 text-accent" /> Bütçe ve varsayılanlar
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Aylık bütçe (TL)" htmlFor="set-budget" optional error={budgetErr}>
              <Input id="set-budget" className="num" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} onBlur={saveBudget} placeholder="Ör. 30.000" />
            </Field>
            <Field label="Varsayılan ödeme aracı" htmlFor="set-pay" optional>
              <Select
                id="set-pay"
                value={settings?.defaultPaymentMethod ?? ''}
                onChange={async (e) => {
                  await repo.saveSettings({ defaultPaymentMethod: (e.target.value || undefined) as PaymentMethod | undefined })
                  toast('Kaydedildi.')
                }}
              >
                <option value="">Belirtilmedi</option>
                {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((p) => (
                  <option key={p} value={p}>
                    {PAYMENT_LABEL[p]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <Repeat className="size-5 text-accent" /> Ay döngüsü
          </h2>
          <p className="mt-1 text-sm text-muted">
            Ayınız hangi gün başlıyor? Ör. maaşınız ayın 15’inde yatıyorsa 15 seçin; panel 15’inden sonraki ayın 14’üne kadar olan harcamaları bir ay olarak gösterir.
          </p>
          <Field label="Kişisel ay döngünüz" htmlFor="set-cycle" className="mt-4">
            <CycleSelect
              id="set-cycle"
              value={settings?.cycleStartDay ?? 1}
              onChange={async (d) => {
                await repo.saveSettings({ cycleStartDay: d && d > 1 ? d : undefined })
                toast(d && d > 1 ? `Ay döngünüz her ayın ${d}’i olarak ayarlandı.` : 'Takvim ayına dönüldü.')
              }}
            />
          </Field>
          <p className="mt-2 text-[12.5px] text-subtle">Gruplar kendi döngüsünü kullanabilir (Kategoriler ve gruplar › Harcama grupları). Paylaşılan grubun döngüsünü grup yöneticisi belirler.</p>
        </Card>

        <Card className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 font-display text-base font-semibold">
                <FlaskConical className="size-5 text-accent" /> Demo modu
              </h2>
              <p className="mt-1 text-sm text-muted">Örnek verilerle uygulamayı deneyin. Demo verileri ayrı bir veritabanında tutulur; gerçek kayıtlarınıza karışmaz ve demo modundayken gerçek verileriniz değişmez.</p>
            </div>
            <Switch checked={isDemo} onChange={setDemo} label="Demo modu" />
          </div>
          {isDemo && (
            <Button size="sm" className="mt-3" icon={<RotateCcw className="size-4" />} onClick={() => setResetOpen(true)}>
              Demo verisini sıfırla
            </Button>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <ScanText className="size-5 text-accent" /> Çevrimdışı OCR
          </h2>
          <p className="mt-1 text-sm text-muted">
            Görsel ve taranmış PDF okumak için yerel OCR motoru (Tesseract) ve Türkçe/İngilizce dil dosyaları kullanılır. Dosyalar uygulamayla birlikte sunulur; belgeleriniz hiçbir sunucuya gönderilmez.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <Badge tone={ocr?.status === 'ready' ? 'accent' : 'warning'}>{ocr ? ocrLabel[ocr.status] : 'Kontrol ediliyor…'}</Badge>
            {ocr?.bytes && <span className="num text-muted">İndirme boyutu ≈ {(ocr.bytes / 1048576).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB</span>}
          </div>
          {ocr?.status !== 'ready' && ocr?.status !== 'unsupported' && (
            <Button
              size="sm"
              className="mt-3"
              icon={<Download className="size-4" />}
              loading={!!dl}
              onClick={async () => {
                try {
                  setDl({ done: 0, total: 1 })
                  await downloadOcrAssets((done, total) => setDl({ done, total }))
                  toast('OCR dosyaları indirildi; görsel okuma artık çevrimdışı çalışır.')
                } catch (e) {
                  toast(e instanceof Error ? e.message : toUserMessage(e), { kind: 'error' })
                } finally {
                  setDl(null)
                  void refreshOcr()
                }
              }}
            >
              {dl ? `İndiriliyor ${dl.done}/${dl.total}` : 'Çevrimdışı kullanım için indir'}
            </Button>
          )}
          <p className="mt-2 text-[12.5px] text-subtle">İndirilmediyse ilk OCR kullanımında otomatik olarak indirilir (internet gerekir).</p>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <CloudOff className="size-5 text-accent" /> Senkronizasyon ve gizlilik
          </h2>
          <Alert tone="info" className="mt-3" title="Bu sürümde cihazlar arasında otomatik senkronizasyon yoktur">
            Kayıtlarınız yalnızca şu an kullandığınız tarayıcıda saklanır. Telefonda girdiğiniz bir gider bilgisayarınızda görünmez. Verileri başka bir cihaza taşımak için “Yedekleme ve veri” sayfasından JSON yedeği alıp diğer cihazda geri
            yükleyin.
          </Alert>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
            <li>Hesap, sunucu veya API anahtarı gerekmez; yapay zekâ servisi kullanılmaz.</li>
            <li>PDF, Excel, CSV ve görseller cihazınızda okunur; içerikleri uzak sunuculara gönderilmez ve kalıcı saklanmaz.</li>
            <li>Tam kart numarası, CVV veya banka parolası istenmez. PDF parolası yalnızca o okuma için kullanılır.</li>
            <li>Uygulama ilk açılıştan sonra çevrimdışı çalışır.</li>
          </ul>
        </Card>
      </div>
      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Demo verisi sıfırlansın mı?"
        confirmLabel="Sıfırla"
        onConfirm={async () => {
          const { resetDemoData } = await import('../data/demo')
          try {
            await resetDemoData(repo)
            toast('Demo verisi yeniden oluşturuldu.')
          } catch (e) {
            toast(toUserMessage(e), { kind: 'error' })
          }
          setResetOpen(false)
        }}
      >
        Demo veritabanı silinip örnek verilerle yeniden doldurulur. Gerçek verilerinize dokunulmaz.
      </ConfirmDialog>
    </div>
  )
}
