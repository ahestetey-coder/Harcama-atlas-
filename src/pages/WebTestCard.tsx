import { ArrowRight, ClipboardCheck, Flag, Link2, Lock, MapPin, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, Card, Field, Input } from '../components/ui/primitives'
import { todayIso } from '../domain/dates'
import { buildJourney, durationLabel, reachDateLabel, testsLeft, type BaseRates, type JourneyFacts, type JourneyProfile } from '../domain/journey'
import { formatKurusCompact } from '../domain/money'
import { LEAD_CODE_RE, quickResult, reachRange, type WebTestLink } from '../domain/quickTest'
import { useAuth } from '../state/auth'
import { useRepo, useSettings } from '../state/data'
import { useUi } from '../state/ui'
import { linkWebTest } from '../state/webTest'
import { LevelRing } from '../components/LevelRing'
import { dateLocale, tt, ttf } from '../lib/i18n'

/** Web'deki Finansal Harita sonucu, uygulamada tekrar: tahmini harita ve "Rotamı netleştir" çağrısı. */
export function WebResultCard({ link, onRefine, locked }: { link: WebTestLink; onRefine?: () => void; locked?: boolean }) {
  const r = useMemo(() => quickResult(link.answers), [link.answers])
  const j = r.journey
  const range = reachRange(r)
  return (
    <Card className="relative overflow-hidden p-5 sm:p-6" aria-label={tt('Web testindeki haritan')}>
      <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-accent/10 blur-3xl" aria-hidden />
      <div className="relative flex flex-wrap items-center gap-2">
        <Badge tone="info">{ttf('{0} · tahmini', link.source === 'app' ? tt('Finansal Harita testinden') : tt('Web testinden'))}</Badge>
        <span className="text-[12px] text-subtle">{new Date(link.createdAt).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long' })} · {link.code}</span>
      </div>
      <div className="relative mt-3">
        <p className="text-[13px] text-muted">{ttf('{0}finansal arketipin', link.name ? `${link.name.split(' ')[0]}, ` : '')}</p>
        <h2 className="font-display text-3xl font-extrabold tracking-tight text-ink">{r.archetype.name}</h2>
        <Badge tone="accent" className="mt-2">
          <MapPin className="size-3.5" /> {tt('Konumun:')} {r.place.name}
        </Badge>
      </div>
      <div className="relative mt-4 flex flex-wrap items-center gap-5">
        <LevelRing position={j.position} total={j.stages.length} level={j.level} />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] text-muted">{tt('Özgürlük yılın')}</div>
          <div className="num bg-gradient-to-r from-emerald-500 to-cyan-500 bg-clip-text font-display text-4xl font-extrabold tracking-tight text-transparent">{range ?? tt('Henüz görünmüyor')}</div>
          <p className="mt-1 text-[13px] text-muted">{tt('Aralık geniş, çünkü rakamlar testteki aralıklardan tahmin edildi.')}</p>
        </div>
      </div>
      <div className="relative mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-[13px]">
        <div>
          <div className="text-muted">{r.nextStep ? ttf('İlk adım · {0}', r.nextStep.title) : tt('Hedef birikim')}</div>
          <div className="num text-[16px] font-semibold text-ink">{formatKurusCompact(r.nextStep?.kurus ?? r.goalKurus)}</div>
        </div>
        <div>
          <div className="text-muted">{tt('Sıradaki durak')}</div>
          <div className="text-[16px] font-semibold text-ink">{j.current?.title ?? tt('Rota tamam')}</div>
        </div>
      </div>
      <div className="relative mt-4 rounded-2xl bg-accent-soft p-4">
        <div className="font-semibold text-ink">{tt('Rakamlarını netleştir, haritan keskinleşsin')}</div>
        <ul className="mt-2 flex flex-col gap-1.5 text-[13.5px] text-ink">
          {[tt('Aralık yerine tek bir özgürlük yılı'), tt('Her durak için hedef, kalan koşullar ve sonraki adım'), tt('Seni rotana göre takip eden koç')].map((t) => (
            <li key={t} className="flex items-center gap-2">
              <Lock className="size-3.5 text-accent" /> {t}
            </li>
          ))}
        </ul>
      </div>
      <div className="relative mt-4 flex flex-col gap-2">
        {locked ? (
          <>
            <Link to="/paketler" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 px-5 text-[15px] font-semibold text-white shadow-[0_8px_20px_-10px_rgb(5_150_105/0.8)] hover:brightness-110">
              <Sparkles className="size-4" /> {tt('Plus ile rotamı kur')}
            </Link>
            <p className="text-center text-[12.5px] text-subtle">{tt('Rota kurulumu ve 8 duraklı Yolculuk Plus ve Plus+ paketlerinde. Koç Plus+\'ta.')}</p>
          </>
        ) : (
          <>
            <Button variant="primary" size="lg" onClick={onRefine} icon={<ArrowRight className="size-4" />} className="flex-row-reverse">
              {tt('Rotamı kur · 5 dk')}
            </Button>
            <p className="text-center text-[12.5px] text-subtle">{tt('Cevapların 6 adımlık kuruluma hazır gelir; sen yalnızca gerçek rakamlarını düzeltirsin.')}</p>
          </>
        )}
      </div>
    </Card>
  )
}

/** Web testini farklı e-postayla çözenler için: devam koduyla bağlama. */
export function LinkWebTestCard() {
  const auth = useAuth()
  const repo = useRepo()
  const { toast } = useUi()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  if (!auth.backend) return null
  const link = async () => {
    const c = code.trim().toUpperCase()
    if (!LEAD_CODE_RE.test(c)) return setError(tt('Kod ATL- ile başlar ve 6 karakter içerir (ör. ATL-7KQ2MD).'))
    setError(undefined)
    setBusy(true)
    try {
      const lead = await linkWebTest(repo, auth.backend!, c)
      if (!lead) setError(tt('Bu kodla bir test bulunamadı ya da başka bir hesaba bağlı.'))
      else toast(tt('Web\'deki finansal haritan bağlandı.'))
    } catch (e) {
      setError(e instanceof Error ? e.message : tt('Bağlanamadı, tekrar deneyin.'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card className="mb-4 p-4">
      <details>
        <summary className="flex cursor-pointer items-center gap-2 text-[14px] font-medium text-ink">
          <Link2 className="size-4 text-accent" /> {tt('Web\'de Finansal Harita testini çözdün mü? Testimi bağla')}
        </summary>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field label={tt('Devam kodu')} htmlFor="web-code" error={error} className="min-w-48 flex-1">
            <Input id="web-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder={tt('ATL-XXXXXX')} autoCapitalize="characters" aria-invalid={!!error} />
          </Field>
          <Button variant="soft" onClick={link} loading={busy}>
            {tt('Bağla')}
          </Button>
        </div>
      </details>
    </Card>
  )
}

/**
 * Plus paketinde netleştirilmiş rota özeti: gerçek rakamlarla seviye, özgürlük tarihi ve sıradaki adım.
 * 8 aşamalı Yolculuk paneli ve koç Plus+'ta kalır.
 */
export function RefinedSummary({ profile, facts, rates, onRetake }: { profile: JourneyProfile; facts: JourneyFacts; rates: BaseRates; onRetake: () => void }) {
  const strategy = useSettings()?.coach?.strategy ?? 'avalanche'
  const j = useMemo(() => buildJourney(profile, facts, rates, { strategy }), [profile, facts, rates, strategy])
  const today = todayIso()
  const mid = j.indicators.route.mid
  const left = testsLeft(profile, today)
  const cur = j.current
  return (
    <Card className="relative mb-4 overflow-hidden p-5 sm:p-6" aria-label={tt('Netleşen rotan')}>
      <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-accent/10 blur-3xl" aria-hidden />
      <div className="relative flex flex-wrap items-center gap-2">
        <Badge tone="accent">{tt('Gerçek rakamlarınla')}</Badge>
        <span className="text-[12px] text-subtle">{tt('Rotan netleşti')}</span>
      </div>
      <div className="relative mt-4 flex flex-wrap items-center gap-5">
        <LevelRing position={j.position} total={j.stages.length} level={j.level} />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] text-muted">{tt('Özgürlük tarihin')}</div>
          <div className="num bg-gradient-to-r from-emerald-500 to-cyan-500 bg-clip-text font-display text-4xl font-extrabold tracking-tight text-transparent">{mid === null ? tt('Henüz görünmüyor') : reachDateLabel(mid, today)}</div>
          <p className="mt-1 text-[13px] text-muted">{mid === null ? tt('Bugünkü birikim hızıyla hedefe ulaşılmıyor; sıradaki adım bunu değiştirir.') : ttf('Bugünkü tempoyla yaklaşık {0} sonra (orta getiri varsayımı).', durationLabel(mid))}</p>
        </div>
      </div>
      <div className="relative mt-4 grid grid-cols-1 gap-3 border-t border-line pt-4 text-[13px] sm:grid-cols-2">
        <div>
          <div className="text-muted">{j.nextStep ? ttf('Sıradaki adım · {0}', j.nextStep.title) : tt('Hedef birikim')}</div>
          <div className="num text-[16px] font-semibold text-ink">{formatKurusCompact(j.nextStep?.targetKurus ?? j.indicators.goalKurus)}</div>
        </div>
        <div>
          <div className="text-muted">{tt('Sıradaki durak')}</div>
          <div className="text-[16px] font-semibold text-ink">{cur?.title ?? tt('Rota tamam')}</div>
        </div>
      </div>
      {cur && (
        <p className="relative mt-3 flex items-start gap-2 rounded-xl bg-accent-soft px-3.5 py-2.5 text-[13.5px] text-ink">
          <Flag className="mt-0.5 size-4 shrink-0 text-accent" />
          <span>
            <span className="font-semibold">{tt('Hedef:')}</span> {cur.goal}. <span className="font-semibold">{tt('Sonraki adım:')}</span> {cur.next}.
          </span>
        </p>
      )}
      <div className="relative mt-4">
        <Button size="sm" variant="soft" icon={<ClipboardCheck className="size-4" />} onClick={onRetake} disabled={left === 0}>
          {left === 0 ? tt('Bu ayın test hakları bitti') : ttf('Testi yenile · bu ay {0} hak', left)}
        </Button>
      </div>
    </Card>
  )
}
