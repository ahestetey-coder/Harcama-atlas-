import { ArrowRight, CalendarCheck, Check, ChartLine as LineChart, Lock, PiggyBank, Sparkles, Unlink } from 'lucide-react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/AppShell'
import { PlanBadge } from '../components/PlanGate'
import { newLeadCode, type QuickResult } from '../domain/quickTest'
import { useRepo, useSettings } from '../state/data'
import { usePlan } from '../state/plan'
import { useReducedMotion } from '../lib/hooks'
import FreedomMapPage, { UnlockStrip } from './FreedomMapPage'

/**
 * Uygulama içi Finansal Harita testi (#/finansal-harita): her pakette açık. Web testiyle aynı 10 soru
 * ve sonuç; iletişim adımı yok, cevaplar cihazdaki ayarlara yazılır. Sonuçtan rota kurulumuna geçilir.
 */
export default function MapTestPage() {
  const repo = useRepo()
  const settings = useSettings()
  // Ayarlar yüklenmeden çizilmez: kayıtlı sonuç varsa sayfa doğrudan sonuçla açılır
  if (!settings) return null
  const saved = settings.webTest?.answers
  return (
    <div>
      <PageHeader title="Finansal Harita testi" subtitle={saved ? 'Kayıtlı sonucun · istersen testi yeniden çöz' : '10 soru · 2 dakika · Ücretsiz'} />
      <FreedomMapPage
        inApp={{
          initial: saved,
          name: settings.webTest?.name,
          onSave: async (answers) => {
            const now = new Date().toISOString()
            await repo.saveSettings({ webTest: { code: newLeadCode(), answers, name: settings.webTest?.name, createdAt: now, linkedAt: now, source: 'app' } })
          },
          renderNext: (r) => <NextStep result={r} />,
          renderTeaser: () => <Teaser />,
        }}
      />
    </div>
  )
}

/** Sonucun hemen altındaki şerit: paketi olan rota kurulumuna, olmayan Plus'a yönlenir. */
function Teaser() {
  const { has } = usePlan()
  const navigate = useNavigate()
  if (has('webRefine'))
    return <UnlockStrip title="Bu yıl bir tahmin." text="Rota kurulumunda gerçek rakamlarınla kesin yılını ve aylık planını çıkar." cta="Rotamı kur" onClick={() => navigate('/yolculuk?kur=1')} />
  return (
    <UnlockStrip
      title="Bu yıl bir tahmin."
      badge={<PlanBadge plan="plus" />}
      text="Plus ile gerçek rakamlarınla kesin özgürlük yılın, borçsuzluk tarihin ve aylık yatırım planın çıkar."
      cta="Plus ile kesinleştir"
      onClick={() => navigate('/paketler')}
    />
  )
}

/** Sonucun altındaki sonraki adım: paketi olan rota kurulumuna geçer, olmayan kilitli önizlemeyi ve paketleri görür. */
function NextStep({ result }: { result: QuickResult }) {
  const { has } = usePlan()
  const navigate = useNavigate()
  const reduced = useReducedMotion()
  const canSetup = has('webRefine')
  const stage = result.journey.current?.title
  const locked: Array<[ReactNode, string, string]> = [
    [<CalendarCheck key="y" className="size-4" />, 'Kesin özgürlük yılın', '20••'],
    [<Unlink key="d" className="size-4" />, 'Borçsuzluk tarihin', '•• / 20••'],
    [<PiggyBank key="p" className="size-4" />, 'Aylık yatırım planın', '•••• ₺'],
    [<LineChart key="s" className="size-4" />, 'Yıl yıl simülasyonun', '▁▂▃▅▇'],
  ]
  return (
    <div className="hero-gradient relative overflow-hidden rounded-[1.25rem] p-5 text-white shadow-card sm:p-6">
      <div className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-amber-400/20 blur-3xl" aria-hidden />
      <div className="relative text-[12px] font-medium uppercase tracking-[0.14em] text-white/70">Sıradaki adım</div>
      <h2 className="relative mt-1 font-display text-2xl font-bold sm:text-3xl">Rotanı gerçek rakamlarınla kur</h2>
      <p className="relative mt-2 text-[14px] leading-relaxed text-white/80">
        Haritan şimdilik aralıklarla çizildi. Rota kurulumunda 6 adımda gerçek rakamlarını girersin{stage ? `; ${stage} durağından itibaren` : ';'} gelirin, giderin, borcun ve yatırımın bilimsel oranlara göre yönlendirilir.
      </p>
      {canSetup ? (
        <button type="button" onClick={() => navigate('/yolculuk?kur=1')} className="relative mt-5 inline-flex h-12 items-center gap-2 rounded-xl bg-white px-5 text-[15px] font-semibold text-[#0b1323] hover:bg-white/90">
          Rotamı kur · 5 dk <ArrowRight className="size-4" />
        </button>
      ) : (
        <>
          <ul className="relative mt-4 grid grid-cols-2 gap-2.5" aria-label="Plus ile açılanlar">
            {locked.map(([icon, label, mask], i) => (
              <motion.li
                key={label}
                initial={reduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: reduced ? 0 : 0.08 * i }}
                className="relative rounded-xl border border-white/15 bg-white/10 p-3"
              >
                <div className="flex items-center gap-1.5 text-[12px] text-white/75">
                  {icon} {label}
                </div>
                <div className="num mt-1 select-none font-display text-xl font-bold tracking-widest text-white/90 blur-[3px]" aria-hidden>
                  {mask}
                </div>
                <Lock className="absolute right-3 top-3 size-3.5 text-amber-300" />
              </motion.li>
            ))}
          </ul>
          <div className="relative mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div className="rounded-xl border-2 border-emerald-400/70 bg-white/10 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <PlanBadge plan="plus" />
                <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">Önerilen</span>
              </div>
              <ul className="mt-2 flex flex-col gap-1 text-[13px] text-white/90">
                {['6 adımda rota kurulumu', 'Kesin özgürlük yılı ve borçsuzluk tarihi', 'Finansal Yolculuğum: 8 duraklı rota ve simülasyon', 'Aylık paranın yolu, yatırım ve borç takibi'].map((t) => (
                  <li key={t} className="flex items-start gap-1.5">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-300" /> {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-white/20 bg-white/5 p-3.5">
              <PlanBadge plan="plusplus" />
              <ul className="mt-2 flex flex-col gap-1 text-[13px] text-white/90">
                {["Plus'taki her şey", 'Rotana göre seni takip eden koç', 'Gelecek senaryoları', 'Finansal bilgi ve gündem'].map((t) => (
                  <li key={t} className="flex items-start gap-1.5">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-violet-300" /> {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/paketler')}
            className="relative mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 px-5 text-[15px] font-semibold text-[#0b1323] shadow-[0_12px_26px_-12px_rgb(251_146_60/0.9)] hover:brightness-110 sm:w-auto"
          >
            <Sparkles className="size-4" /> Paketleri gör ve rotamı aç
          </button>
          <p className="relative mt-2 flex items-center gap-1.5 text-[12.5px] text-white/75">
            <Lock className="size-3.5" /> Sonucun kaydedildi; paketini seçince rota kurulumu buradan devam eder.
          </p>
        </>
      )}
    </div>
  )
}
