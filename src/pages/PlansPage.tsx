import { Check, Clock, FlaskConical, Sparkles } from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/AppShell'
import { PlanBadge } from '../components/PlanGate'
import { Alert, Card, Segmented } from '../components/ui/primitives'
import { PLAN_LABEL, type Feature, type Plan } from '../domain/plans'
import { cn } from '../lib/cn'
import { usePlan } from '../state/plan'

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
    tagline: 'Harcamalarını kaydet, düzenle ve takip et',
    items: [
      { text: 'Ekstreyi PDF, Excel, CSV veya ekran görüntüsünden içe aktarma' },
      { text: 'Kaydetmeden önce inceleme, tekrar uyarısı ve kategori önerileri' },
      { text: 'Aylık panel, kategori dağılımı ve aylık toplam bütçe' },
      { text: 'Kart kesim gününe göre dönem' },
      { text: 'Ortak gruplar, üye daveti ve eşit gider paylaşımı' },
      { text: 'Yedekleme, çevrimdışı kullanım ve hesap silme' },
    ],
  },
  {
    plan: 'plus',
    tagline: 'Bütçeni planla, varlıklarını tek yerde gör',
    items: [
      { text: 'Koçun otomatik bütçesi, kategori limitleri, haftalık bütçe, devir, uyarılar ve ay sonu tahmini', feature: 'advancedBudget' },
      { text: 'Taksitler ve gelecek aylardaki ödeme yükü', feature: 'installments' },
      { text: 'Abonelikler, düzenli ödemeler ve hatırlatmalar', feature: 'subscriptions' },
      { text: 'Birikim hedefleri ve ayrılması gereken aylık tutar', feature: 'goals' },
      { text: 'Kategori, iş yeri ve dönem karşılaştırmalı raporlar', feature: 'reports' },
      { text: 'Yatırımlarım ve Borçlarım: altın, döviz, fon, hisse, kripto, emtia, mevduat; türüne göre borçlar ve kart taksitleri', feature: 'assets' },
      { text: 'Yüzde, ağırlık veya özel tutarla ortak gider paylaşımı', feature: 'advancedSplit' },
    ],
  },
  {
    plan: 'plusplus',
    tagline: 'Finansal özgürlük yolculuğunu oluştur ve ilerlemeni izle',
    items: [
      { text: 'Plus’ın bütün özellikleri' },
      { text: 'Finansal Özgürlük Yolculuğum: mini anket ve animasyonlu hedef rotası', feature: 'journey' },
      { text: 'Gelecek senaryoları: temkinli, orta ve olumlu varsayımlar', feature: 'scenarios' },
      { text: 'Finans koçu: borç kapatma ve yapılandırma planı, yatırıma ayrılacak tutar, kişiye özel mesajlar', feature: 'aiCoach' },
      { text: 'Finansal bilgi ve ekonomi gündemi', feature: 'learning' },
    ],
  },
]

export default function PlansPage() {
  const { plan, purchased, preview, canPreview, setPreview } = usePlan()
  return (
    <div>
      <PageHeader title="Paketler" subtitle="Bugünkü bütün özellikler ücretsiz kalır. Plus ve Plus+ yeni özellikler ekler." />

      {canPreview && (
        <Card className="mb-5 p-5">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <FlaskConical className="size-5 text-accent" /> Önizleme
          </h2>
          <p className="mt-1 text-sm text-muted">
            Ödeme altyapısı hazır olana kadar paketleri buradan deneyebilirsiniz. Bu seçenek yalnızca yönetici hesabında, demo modunda ve yerel kullanımda görünür.
          </p>
          <Segmented<Plan>
            label="Önizleme paketi"
            value={preview ?? 'free'}
            onChange={(p) => setPreview(p)}
            className="mt-4 w-full max-w-md"
            options={[
              { value: 'free', label: 'Ücretsiz' },
              { value: 'plus', label: 'Plus' },
              { value: 'plusplus', label: 'Plus+' },
            ]}
          />
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {PLANS.map((p, i) => {
          const current = plan === p.plan
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
                      {preview ? 'Önizlemede' : 'Kullandığınız paket'}
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
                          {!ready && <span className="ml-1.5 text-[11.5px] font-medium text-subtle">Yakında</span>}
                          {it.feature && READY[it.feature] && (
                            <Link to={READY[it.feature]!} className="ml-1.5 text-[12px] font-medium text-accent hover:underline">
                              Aç
                            </Link>
                          )}
                        </span>
                      </li>
                    )
                  })}
                </ul>
                {p.plan !== 'free' && purchased !== p.plan && (
                  <button
                    type="button"
                    disabled
                    className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 text-sm font-semibold text-subtle"
                  >
                    <Sparkles className="size-4" /> Satın alma yakında
                  </button>
                )}
              </Card>
            </motion.div>
          )
        })}
      </div>
      <Alert tone="info" className="mt-5" title="Ödeme nasıl olacak?">
        Plus ve Plus+ aboneliği, uygulama App Store ve Google Play’de yayımlandığında mağazanın kendi ödeme sistemiyle alınacak. Kart bilgileriniz Harcama Atlası’na hiç
        gelmez.
      </Alert>
    </div>
  )
}
