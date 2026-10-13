import { CloudOff, Download, FlaskConical, Monitor, Moon, Repeat, RotateCcw, ScanText, Sun, Target } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AccountCard } from '../components/AccountCard'
import { RecurringIncomeCard } from '../components/RecurringIncomeCard'
import { Link } from 'react-router-dom'
import { PLAN_LABEL } from '../domain/plans'
import { usePlan } from '../state/plan'
import { PageHeader } from '../components/AppShell'
import { CycleSelect } from '../components/common'
import { ConfirmDialog } from '../components/ui/Modal'
import { Badge, Button, Card, Field, Input, More, Segmented, Select, Switch } from '../components/ui/primitives'
import { APP_CONFIG } from '../config/app'
import { toUserMessage } from '../data/repository'
import { personalCycleDay, primarySalary } from '../domain/income'
import { formatKurus, formatKurusPlain, parseUserAmount } from '../domain/money'
import { PAYMENT_LABEL, type PaymentMethod, type ThemePreference } from '../domain/types'
import { downloadOcrAssets, ocrAssetInfo, ocrCacheStatus } from '../import/ocr'
import { useBudgetSetup } from '../state/budget'
import { useData, useSettings } from '../state/data'
import { useTheme } from '../state/theme'
import { useUi } from '../state/ui'

export default function SettingsPage() {
  const { preference, setPreference } = useTheme()
  const { repo, isDemo, setDemo } = useData()
  const settings = useSettings()
  const budgetSetup = useBudgetSetup()
  const { toast } = useUi()
  const [budget, setBudget] = useState('')
  const [budgetErr, setBudgetErr] = useState<string>()
  const [resetOpen, setResetOpen] = useState(false)
  const [ocr, setOcr] = useState<{ status: Awaited<ReturnType<typeof ocrCacheStatus>>; bytes?: number } | null>(null)
  const [dl, setDl] = useState<{ done: number; total: number } | null>(null)
  // Ay döngüsü maaş gününe bağlanabilir (yalnızca birincil maaş varsa)
  const hasSalary = !!primarySalary(settings?.recurringIncomes)
  const followSalary = hasSalary && settings?.cycleSource === 'salary'

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
    await repo.saveSettings({ monthlyBudgetKurus: k, budgetMode: 'manual' })
    toast(k ? 'Bütçe kaydedildi.' : 'Bütçe kaldırıldı.')
  }

  const ocrLabel = { ready: 'Çevrimdışı kullanıma hazır', partial: 'Kısmen indirildi', missing: 'Henüz indirilmedi', unsupported: 'Bu tarayıcıda önbellek durumu görülemiyor' }

  return (
    <div>
      <PageHeader title="Ayarlar" subtitle={`${APP_CONFIG.name} · sürüm 1.0`} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AccountCard />
        <PlanCard />
        <Card className="p-5">
          <h2 className="font-display text-base font-semibold">Görünüm</h2>
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
            {budgetSetup?.mode === 'auto' && budgetSetup.auto ? (
              <div className="text-sm">
                <div className="font-medium text-ink">Aylık bütçe</div>
                <p className="mt-1 text-muted">
                  Koç belirliyor: <span className="num font-semibold text-ink">{formatKurus(budgetSetup.auto.totalKurus)}</span>.{' '}
                  <Link to="/butce" className="font-medium text-accent hover:underline">
                    Bütçe sayfasından değiştirin
                  </Link>
                </p>
              </div>
            ) : (
              <Field label="Aylık bütçe (TL)" htmlFor="set-budget" optional error={budgetErr}>
                <Input id="set-budget" className="num" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} onBlur={saveBudget} placeholder="Ör. 30.000" />
              </Field>
            )}
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

        <RecurringIncomeCard />

        <Card className="p-5">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <Repeat className="size-5 text-accent" /> Ay döngüsü
          </h2>
          <p className="mt-1 text-sm text-muted">Ayınız hangi gün başlıyor?</p>
          <More>
            Maaşınız ayın 15’inde yatıyorsa 15 seçin; ay, 15’inden sonraki ayın 14’üne kadar sayılır. Maaş hafta sonuna denk gelirse önceki iş günü yatar; ayınız maaş
            gününde başlıyorsa o gelir yine yeni ayınıza sayılır.
          </More>
          {hasSalary && (
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-ink" aria-hidden>
                Maaş gününe göre
              </span>
              <Switch
                label="Maaş gününe göre"
                checked={followSalary}
                onChange={async (on) => {
                  await repo.saveSettings({ cycleSource: on ? 'salary' : 'manual' })
                  const d = personalCycleDay({ ...settings, cycleSource: on ? 'salary' : 'manual' })
                  toast(on ? `Ayınız artık her ayın ${d}. gününde başlıyor.` : d > 1 ? `Ay döngünüz her ayın ${d}’i olarak ayarlandı.` : 'Takvim ayına dönüldü.')
                }}
              />
            </div>
          )}
          <Field label="Kişisel ay döngünüz" htmlFor="set-cycle" className="mt-4">
            <CycleSelect
              id="set-cycle"
              value={followSalary ? personalCycleDay(settings ?? {}) : (settings?.cycleStartDay ?? 1)}
              disabled={followSalary}
              onChange={async (d) => {
                await repo.saveSettings({ cycleStartDay: d && d > 1 ? d : undefined, cycleSource: 'manual' })
                toast(d && d > 1 ? `Ay döngünüz her ayın ${d}’i olarak ayarlandı.` : 'Takvim ayına dönüldü.')
              }}
            />
          </Field>
          <p className="mt-2 text-[12.5px] text-subtle">Gruplar kendi döngüsünü kullanabilir.</p>
        </Card>

        <Card className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 font-display text-base font-semibold">
                <FlaskConical className="size-5 text-accent" /> Demo modu
              </h2>
              <p className="mt-1 text-sm text-muted">Örnek verilerle deneyin; gerçek kayıtlarınız etkilenmez.</p>
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
          <p className="mt-1 text-sm text-muted">Belgeleri internetsiz okumak için.</p>
          <More>
            Görsel ve taranmış PDF’ler cihazınızda okunur (Tesseract, Türkçe/İngilizce); belgeleriniz sunucuya gönderilmez. İndirmezseniz ilk kullanımda otomatik
            indirilir (internet gerekir).
          </More>
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
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <CloudOff className="size-5 text-accent" /> Senkronizasyon ve gizlilik
          </h2>
          <p className="mt-1 text-sm text-muted">Kayıtlarınız bu cihazda kalır; yalnızca ortak grup harcamaları paylaşılır.</p>
          <More label="Gizlilik ayrıntıları">
            <ul className="list-disc space-y-1 pl-5">
              <li>Başka cihaza taşımak için “Yedekleme ve veri” sayfasından yedek alın.</li>
              <li>Reklam veya izleme kullanılmaz. Koçun yapay zekâ sohbeti yalnızca izin verirseniz, özet bilgilerle çalışır.</li>
              <li>PDF, Excel, CSV ve görseller cihazınızda okunur, sunucuya gönderilmez.</li>
              <li>Kart numarası, CVV veya banka parolası istenmez.</li>
              <li>İlk açılıştan sonra çevrimdışı çalışır.</li>
            </ul>
          </More>
          <a href={APP_CONFIG.privacyUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-[13px] font-medium text-accent hover:underline">
            Gizlilik politikasının tamamı
          </a>
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

function PlanCard() {
  const { plan, preview } = usePlan()
  return (
    <Card className="p-5">
      <h2 className="font-display text-base font-semibold">Paket</h2>
      <p className="mt-1 text-sm text-muted">
        Kullandığınız paket: <strong className="text-ink">{PLAN_LABEL[plan]}</strong>
        {preview ? ' (önizleme)' : ''}
      </p>
      <Link to="/paketler" className="mt-3 inline-block text-[13px] font-medium text-accent hover:underline">
        Paketleri karşılaştır
      </Link>
    </Card>
  )
}
