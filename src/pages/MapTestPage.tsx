import { ArrowRight, Lock, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/AppShell'
import { PlanBadge } from '../components/PlanGate'
import { Button } from '../components/ui/primitives'
import { newLeadCode, type QuickResult } from '../domain/quickTest'
import { useRepo, useSettings } from '../state/data'
import { usePlan } from '../state/plan'
import FreedomMapPage from './FreedomMapPage'

/**
 * Uygulama içi Finansal Harita testi (#/finansal-harita): her pakette açık. Web testiyle aynı 10 soru
 * ve sonuç; iletişim adımı yok, cevaplar cihazdaki ayarlara yazılır. Sonuçtan rota kurulumuna geçilir.
 */
export default function MapTestPage() {
  const repo = useRepo()
  const settings = useSettings()
  return (
    <div>
      <PageHeader title="Finansal Harita testi" subtitle="10 soru · 2 dakika · Ücretsiz" />
      <FreedomMapPage
        inApp={{
          name: settings?.webTest?.name,
          onSave: async (answers) => {
            const now = new Date().toISOString()
            await repo.saveSettings({ webTest: { code: newLeadCode(), answers, name: settings?.webTest?.name, createdAt: now, linkedAt: now, source: 'app' } })
          },
          renderNext: (r) => <NextStep result={r} />,
        }}
      />
    </div>
  )
}

/** Sonucun altındaki sonraki adım: paketi olan rota kurulumuna geçer, olmayan paketleri görür. */
function NextStep({ result }: { result: QuickResult }) {
  const { has } = usePlan()
  const navigate = useNavigate()
  const canSetup = has('webRefine')
  const stage = result.journey.current?.title
  return (
    <div className="hero-gradient relative overflow-hidden rounded-[1.25rem] p-5 text-white shadow-card sm:p-6">
      <div className="text-[12px] font-medium uppercase tracking-[0.14em] text-white/70">Sıradaki adım</div>
      <h2 className="mt-1 font-display text-2xl font-bold sm:text-3xl">Rotanı gerçek rakamlarınla kur</h2>
      <p className="mt-2 text-[14px] leading-relaxed text-white/80">
        Haritan şimdilik aralıklarla çizildi. Rota kurulumunda 6 adımda gerçek rakamlarını girersin; aralık yerine tek bir özgürlük yılı çıkar{stage ? ` ve ${stage} durağından itibaren` : ','} Finansal özgürlük sayfan bu rakamlarla kurulur.
      </p>
      {canSetup ? (
        <Button size="lg" className="mt-5 flex-row-reverse bg-white text-[#0b1323] hover:bg-white/90" icon={<ArrowRight className="size-4" />} onClick={() => navigate('/yolculuk?kur=1')}>
          Rotamı kur · 5 dk
        </Button>
      ) : (
        <>
          <ul className="mt-4 flex flex-col gap-3 text-[14px]">
            <li className="flex items-start gap-3 rounded-xl bg-white/10 p-3">
              <PlanBadge plan="plus" />
              <span>Rota kurulumu, kesin özgürlük yılı ve borçsuzluk tarihi</span>
            </li>
            <li className="flex items-start gap-3 rounded-xl bg-white/10 p-3">
              <PlanBadge plan="plusplus" />
              <span>8 duraklı tam rota, gelecek senaryoları, özgürlük yaşı ve seni takip eden koç</span>
            </li>
          </ul>
          <Button size="lg" className="mt-5 bg-white text-[#0b1323] hover:bg-white/90" icon={<Sparkles className="size-4" />} onClick={() => navigate('/paketler')}>
            Paketleri gör
          </Button>
          <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-white/70">
            <Lock className="size-3.5" /> Sonucun kaydedildi; paketini seçince rota kurulumu buradan devam eder.
          </p>
        </>
      )}
    </div>
  )
}
