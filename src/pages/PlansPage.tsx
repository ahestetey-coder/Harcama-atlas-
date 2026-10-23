import { Check, Clock, FlaskConical, Sparkles } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { chooseTestPlan } from '../cloud/admin'
import { cloudErrorMessage } from '../cloud/errors'
import { APP_CONFIG } from '../config/app'
import { PageHeader } from '../components/AppShell'
import { PlanBadge } from '../components/PlanGate'
import { Alert, Button, Card, More, Segmented } from '../components/ui/primitives'
import { PLAN_LABEL, type Feature, type Plan } from '../domain/plans'
import { cn } from '../lib/cn'
import { useAuth } from '../state/auth'
import { usePlan } from '../state/plan'
import { useUi } from '../state/ui'
import { tt, ttf } from '../lib/i18n'

/** Uygulamada kullanılabilir olan Plus/Plus+ özellikleri. Diğerleri "Yakında" gösterilir. */
const READY: Partial<Record<Feature, string>> = {
  advancedBudget: '/butce',
  installments: '/borclar?bolum=odemeler',
  subscriptions: '/borclar?bolum=odemeler',
  goals: '/hedefler',
  reports: '/raporlar',
  assets: '/yatirimlar',
  advancedSplit: '/',
  journey: '/yolculuk',
  webRefine: '/yolculuk',
  scenarios: '/senaryolar',
  learning: '/ogren',
  aiCoach: '/koc',
}

interface Item {
  text: string
  feature?: Feature
}

const PLANS: Array<{ plan: Plan; tagline: string; items: Item[] }> = [
  {
    plan: 'free',
    tagline: tt('Harcamalarını kaydet, düzenle ve takip et'),
    items: [
      { text: tt('Ekstreyi PDF, Excel, CSV veya ekran görüntüsünden içe aktarma') },
      { text: tt('Kaydetmeden önce inceleme, tekrar uyarısı ve kategori önerileri') },
      { text: tt('Aylık panel, kategori dağılımı ve aylık toplam bütçe') },
      { text: tt('Kart kesim gününe göre dönem') },
      { text: tt('Ortak gruplar, üye daveti ve eşit gider paylaşımı') },
      { text: tt('Yedekleme, çevrimdışı kullanım ve hesap silme') },
    ],
  },
  {
    plan: 'plus',
    tagline: tt('Bütçeni planla, varlıklarını tek yerde gör'),
    items: [
      { text: tt('Koçun otomatik bütçesi, kategori limitleri, haftalık bütçe, devir, uyarılar ve ay sonu tahmini'), feature: 'advancedBudget' },
      { text: tt('Taksitler ve gelecek aylardaki ödeme yükü'), feature: 'installments' },
      { text: tt('Abonelikler, düzenli ödemeler ve hatırlatmalar'), feature: 'subscriptions' },
      { text: tt('Birikim hedefleri ve ayrılması gereken aylık tutar'), feature: 'goals' },
      { text: tt('Kategori, iş yeri ve dönem karşılaştırmalı raporlar'), feature: 'reports' },
      { text: tt('Yatırımlarım ve Borçlarım: altın, döviz, fon, hisse, kripto, emtia, mevduat; türüne göre borçlar ve kart taksitleri'), feature: 'assets' },
      { text: tt('Yüzde, ağırlık veya özel tutarla ortak gider paylaşımı'), feature: 'advancedSplit' },
      { text: tt('Web\'deki Finansal Harita testini gerçek rakamlarınla netleştirme: kesin özgürlük yılı ve sıradaki durak'), feature: 'webRefine' },
      { text: tt('Finansal Özgürlük Yolculuğum: Özgürlük Rotası testi, 8 duraklı rota ve yıl yıl simülasyon'), feature: 'journey' },
    ],
  },
  {
    plan: 'plusplus',
    tagline: tt('Finansal özgürlük yolculuğunu oluştur ve ilerlemeni izle'),
    items: [
      { text: tt('Plus’ın bütün özellikleri') },
      { text: tt('Gelecek senaryoları: temkinli, orta ve olumlu varsayımlar'), feature: 'scenarios' },
      { text: tt('Finans koçu: borç kapatma ve yapılandırma planı, yatırıma ayrılacak tutar, kişiye özel mesajlar'), feature: 'aiCoach' },
      { text: tt('Finansal Gündem: piyasa notları ve finans yazıları'), feature: 'learning' },
    ],
  },
]

export default function PlansPage() {
  const { plan, purchased, preview, canPreview, setPreview, refresh } = usePlan()
  const { backend, user } = useAuth()
  const { toast } = useUi()
  const [busy, setBusy] = useState<Plan | null>(null)
  // Deneme yayınında girişli kişi paketini ödemesiz seçer
  const testBuy = APP_CONFIG.testPurchases && !!backend && !!user
  const choose = async (p: Plan) => {
    if (!backend) return
    setBusy(p)
    try {
      await chooseTestPlan(backend.client, p)
      if (preview) setPreview(null)
      refresh()
      toast(p === 'free' ? tt('Ücretsiz pakete geçtin.') : ttf('{0} açıldı. Deneme sürümünde ücret alınmaz.', PLAN_LABEL[p]))
    } catch (e) {
      toast(cloudErrorMessage(e), { kind: 'error' })
    } finally {
      setBusy(null)
    }
  }
  return (
    <div>
      <PageHeader title={tt('Paketler')} subtitle={tt('Temel özellikler hep ücretsiz')} />

      {canPreview && (
        <Card className="mb-5 p-5">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <FlaskConical className="size-5 text-accent" /> {tt('Önizleme')}
          </h2>
          <p className="mt-1 text-sm text-muted">{tt('Paketleri ödeme olmadan deneyin.')}</p>
          <More label={tt('Kimler görür?')}>{tt('Yalnızca yönetici hesabında, demo modunda ve yerel kullanımda görünür.')}</More>
          <Segmented<Plan>
            label={tt('Önizleme paketi')}
            value={preview ?? 'free'}
            onChange={(p) => setPreview(p)}
            className="mt-4 w-full max-w-md"
            options={[
              { value: 'free', label: tt('Ücretsiz') },
              { value: 'plus', label: tt('Plus') },
              { value: 'plusplus', label: tt('Plus+') },
            ]}
          />
        </Card>
      )}

      <Card className="mb-5 flex flex-wrap items-center justify-between gap-3 p-5" aria-label={tt('Mevcut paketiniz')}>
        <div>
          <div className="text-[13px] text-muted">{tt('Mevcut paketiniz')}</div>
          <div className="mt-0.5 flex items-center gap-2 font-display text-2xl font-bold text-ink">
            {PLAN_LABEL[purchased]}
            {purchased !== 'free' && <PlanBadge plan={purchased} />}
          </div>
          {preview && <p className="mt-1 text-[12.5px] text-muted">{ttf('Şu an {0} önizlemesindesiniz.', PLAN_LABEL[preview])}</p>}
        </div>
        {testBuy && purchased !== 'free' && (
          <Button variant="secondary" loading={busy === 'free'} disabled={busy !== null} onClick={() => choose('free')}>
            {tt('Ücretsize dön')}
          </Button>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {PLANS.map((p, i) => {
          const current = plan === p.plan || purchased === p.plan
          return (
            <motion.div key={p.plan} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, duration: 0.3 }}>
              <Card
                className={cn(
                  'relative flex h-full flex-col p-5',
                  p.plan === 'plus' && 'ring-1 ring-emerald-500/40',
                  p.plan === 'plusplus' && 'ring-1 ring-fuchsia-500/40',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display text-xl font-bold text-ink">{PLAN_LABEL[p.plan]}</h2>
                  {current ? (
                    <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[11.5px] font-semibold text-accent-strong dark:text-accent">
                      {purchased === p.plan ? tt('Mevcut paketiniz') : tt('Önizlemede')}
                    </span>
                  ) : (
                    <PlanBadge plan={p.plan} />
                  )}
                </div>
                <p className="mt-1 text-sm text-muted">{p.tagline}</p>
                <ul className="mt-4 flex-1 space-y-2.5 text-[13.5px]">
                  {p.items.map((it) => {
                    const ready = !it.feature || READY[it.feature]
                    return (
                      <li key={it.text} className="flex gap-2.5">
                        {ready ? <Check className="mt-0.5 size-4 shrink-0 text-accent" /> : <Clock className="mt-0.5 size-4 shrink-0 text-subtle" />}
                        <span className={ready ? 'text-ink' : 'text-muted'}>
                          {it.text}
                          {!ready && <span className="ml-1.5 text-[11.5px] font-medium text-subtle">{tt('Yakında')}</span>}
                          {it.feature && READY[it.feature] && (
                            <Link to={READY[it.feature]!} className="ml-1.5 text-[12px] font-medium text-accent hover:underline">
                              {tt('Aç')}
                            </Link>
                          )}
                        </span>
                      </li>
                    )
                  })}
                </ul>
                {testBuy && purchased !== p.plan ? (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => choose(p.plan)}
                    className={cn(
                      'mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold disabled:opacity-60',
                      p.plan === 'free' ? 'border border-line bg-surface-2 text-ink' : 'bg-accent text-white hover:brightness-105',
                    )}
                  >
                    <Sparkles className="size-4" />
                    {busy === p.plan ? tt('Seçiliyor…') : p.plan === 'free' ? tt('Ücretsize dön') : ttf('{0} seç · deneme sürümünde ücretsiz', PLAN_LABEL[p.plan])}
                  </button>
                ) : (
                  p.plan !== 'free' &&
                  purchased !== p.plan && (
                    <button
                      type="button"
                      disabled
                      className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 text-sm font-semibold text-subtle"
                    >
                      <Sparkles className="size-4" /> {tt('Satın alma yakında')}
                    </button>
                  )
                )}
              </Card>
            </motion.div>
          )
        })}
      </div>
      <Alert tone="info" className="mt-5" title={testBuy ? tt('Deneme sürümü') : tt('Ödeme nasıl olacak?')}>
        {testBuy && tt('Şu an paketler ücretsiz seçilir. Yayında ')}
        {tt('App Store ve Google Play üzerinden alınacak. Kart bilgileriniz bize gelmez.')}
      </Alert>
    </div>
  )
}
