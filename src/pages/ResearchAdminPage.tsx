import { Activity, ArrowLeft, BookOpenCheck, CalendarClock, CheckCircle2, FilePlus2, Gauge, History, Lock, Pencil, Plus, RefreshCw, ShieldCheck, Trash2, Users, XCircle } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/AppShell'
import { TopicView } from '../components/Report'
import { ConfirmDialog, Modal } from '../components/ui/Modal'
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Segmented, Select, Skeleton, Switch, Textarea } from '../components/ui/primitives'
import { cloudErrorMessage } from '../cloud/errors'
import {
  AREA_LABEL,
  CONTENT_LABEL,
  GROUP_LABEL,
  KIND_LABEL,
  normalizeHandle,
  REPORT_KIND_LABEL,
  research,
  SECTION_KEYS,
  SECTION_TITLE,
  sourceHealth,
  TERMS_LABEL,
  type AgentSettings,
  type CalendarEntry,
  type ContentType,
  type Expert,
  type ExpertArea,
  type Report,
  type ReportChecks,
  type ReportKind,
  type ReportRevision,
  type ReportStatus,
  type ReportTopic,
  type ResearchSource,
  type SourceGroup,
  type SourceKind,
  type TermsStatus,
} from '../cloud/research'
import { cn } from '../lib/cn'
import { useIsAdmin } from '../state/admin'
import { useAuth } from '../state/auth'
import { useUi } from '../state/ui'

type Tab = 'raporlar' | 'kaynaklar' | 'uzmanlar' | 'takvim' | 'olcumler'

const STATUS: Record<ReportStatus, { label: string; tone: 'neutral' | 'accent' | 'warning' | 'danger' }> = {
  taslak: { label: 'Onay bekliyor', tone: 'warning' },
  yayinda: { label: 'Yayında', tone: 'accent' },
  reddedildi: { label: 'Reddedildi', tone: 'danger' },
  geri_cekildi: { label: 'Geri çekildi', tone: 'neutral' },
}

const dt = (iso: string | null, time = true) =>
  iso ? new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}) }) : '—'

function ago(iso: string | null): string {
  if (!iso) return 'hiç'
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000)
  if (m < 1) return 'az önce'
  if (m < 60) return `${m} dk önce`
  if (m < 1440) return `${Math.floor(m / 60)} sa önce`
  return `${Math.floor(m / 1440)} gün önce`
}

export default function ResearchAdminPage() {
  const auth = useAuth()
  const admin = useIsAdmin()
  if (!auth.enabled || !admin) {
    return (
      <div>
        <PageHeader title="Araştırma ajanı" />
        <Card>
          <EmptyState icon={<Lock className="size-6" />} title="Bu sayfa yalnızca yöneticiye açık">
            Ortak ekonomi araştırma ajanını yalnızca yönetici hesabı yönetir.
          </EmptyState>
        </Card>
      </div>
    )
  }
  return <Console />
}

function Console() {
  const [tab, setTab] = useState<Tab>('raporlar')
  return (
    <div>
      <PageHeader
        title="Araştırma ajanı"
        subtitle="Ortak ekonomi raporları: kaynaklar, uzmanlar, editör onayı ve ölçümler"
        actions={
          <Link to="/yonetim" className="inline-flex items-center gap-1 text-[13px] font-medium text-muted hover:text-ink">
            <ArrowLeft className="size-4" /> Yönetici paneli
          </Link>
        }
      />
      <Segmented<Tab>
        label="Bölüm"
        value={tab}
        onChange={setTab}
        className="no-scrollbar mb-4 max-sm:w-full max-sm:overflow-x-auto"
        options={[
          { value: 'raporlar', label: 'Raporlar', icon: <BookOpenCheck className="size-3.5" /> },
          { value: 'kaynaklar', label: 'Kaynaklar', icon: <Activity className="size-3.5" /> },
          { value: 'uzmanlar', label: 'Uzmanlar', icon: <Users className="size-3.5" /> },
          { value: 'takvim', label: 'Takvim', icon: <CalendarClock className="size-3.5" /> },
          { value: 'olcumler', label: 'Ölçümler', icon: <Gauge className="size-3.5" /> },
        ]}
      />
      {tab === 'raporlar' && <ReportsTab />}
      {tab === 'kaynaklar' && <SourcesTab />}
      {tab === 'uzmanlar' && <ExpertsTab />}
      {tab === 'takvim' && <CalendarTab />}
      {tab === 'olcumler' && <MetricsTab />}
    </div>
  )
}

/** Yükle-yenile kalıbı; tablo kurulmamışsa kurulum uyarısı. */
function useLoad<T>(fn: (c: NonNullable<ReturnType<typeof useAuth>['backend']>['client']) => Promise<T>) {
  const { backend } = useAuth()
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string>()
  const load = useCallback(async () => {
    if (!backend) return
    try {
      setData(await fn(backend.client))
      setError(undefined)
    } catch (e) {
      setError(cloudErrorMessage(e))
    }
    // fn her çağrıda yeni olabilir; yalnızca istemci değişince yeniden kur
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend])
  useEffect(() => {
    void load()
  }, [load])
  return { data, error, load, client: backend?.client }
}

function useRun() {
  const { toast } = useUi()
  const [busy, setBusy] = useState(false)
  const run = async (fn: () => Promise<unknown>, ok?: string, after?: () => unknown) => {
    setBusy(true)
    try {
      await fn()
      if (ok) toast(ok)
      await after?.()
      return true
    } catch (e) {
      toast(e instanceof Error && !('code' in e) ? e.message : cloudErrorMessage(e), { kind: 'error' })
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, run }
}

function SetupAlert({ error }: { error: string }) {
  return (
    <Alert tone="warning" title="Araştırma tabloları alınamadı">
      {error} Kurulum dosyasını (arastirma-ajani.sql) Supabase SQL Editor'de çalıştırdığınızdan emin olun.
    </Alert>
  )
}

// ---------- Raporlar ----------

function ChecksSummary({ c }: { c: ReportChecks | Record<string, never> }) {
  if (!('ok' in c)) return <Badge>Denetlenmedi</Badge>
  return c.ok ? (
    <Badge tone="accent">
      <CheckCircle2 className="size-3" /> Denetim temiz
    </Badge>
  ) : (
    <Badge tone="danger">
      <XCircle className="size-3" /> {c.issues.length} sorun
    </Badge>
  )
}

function ReportsTab() {
  const { data, error, load, client } = useLoad((c) => research.reports(c))
  const { busy, run } = useRun()
  const [kind, setKind] = useState<ReportKind>('gunluk')
  const [open, setOpen] = useState<Report | null>(null)
  if (error) return <SetupAlert error={error} />
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4 sm:p-5">
        <h2 className="font-display text-base font-semibold">Yeni taslak</h2>
        <p className="mt-1 text-[13px] text-muted">
          Günlük taslak her sabah, haftalık pazartesi, aylık ayın 1'inde kendiliğinden yazılır. Hiçbir taslak sizin onayınız olmadan yayınlanmaz; yayından önce kaynak, tarih, rakam ve yönlendirme dili otomatik denetlenir.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select aria-label="Rapor türü" value={kind} onChange={(e) => setKind(e.target.value as ReportKind)} className="w-44">
            {(['gunluk', 'haftalik', 'aylik', 'acil'] as const).map((k) => (
              <option key={k} value={k}>
                {REPORT_KIND_LABEL[k]}
              </option>
            ))}
          </Select>
          <Button
            variant="primary"
            icon={<FilePlus2 className="size-4" />}
            loading={busy}
            onClick={() =>
              client &&
              void run(async () => {
                const r = await research.generate(client, kind)
                if (r.skipped) throw new Error(r.skipped)
              }, 'Taslak yazıldı.', load)
            }
          >
            Taslak oluştur
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {!data ? (
          <div className="space-y-3 p-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : data.length === 0 ? (
          <EmptyState icon={<BookOpenCheck className="size-6" />} title="Henüz rapor yok">
            Kaynakları açıp toplama çalıştıktan sonra taslaklar burada görünür.
          </EmptyState>
        ) : (
          <ul aria-label="Raporlar">
            {data.map((r) => (
              <li key={r.id} className="border-b border-line last:border-0">
                <button type="button" onClick={() => setOpen(r)} className="flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-surface-2 sm:flex-row sm:items-center sm:gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{r.title}</span>
                    <span className="text-[12px] text-subtle">
                      {r.topics.length} konu · {dt(r.created_at)} · sürüm {r.version} · {r.created_by === 'otomatik' ? 'otomatik' : 'elle'}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                    <ChecksSummary c={r.checks} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {open && client && (
        <ReportEditor
          key={open.id}
          report={open}
          onClose={() => setOpen(null)}
          onChanged={async () => {
            await load()
            const fresh = (await research.reports(client)).find((x) => x.id === open.id)
            if (fresh) setOpen(fresh)
          }}
        />
      )}
    </div>
  )
}

type DraftTopic = { title: string; sections: ReportTopic['sections']; remove: boolean }

function ReportEditor({ report, onClose, onChanged }: { report: Report; onClose: () => void; onChanged: () => Promise<void> }) {
  const { backend } = useAuth()
  const client = backend!.client
  const { busy, run } = useRun()
  const [topics, setTopics] = useState<DraftTopic[]>(() => report.topics.map((t) => ({ title: t.title, sections: structuredClone(t.sections), remove: false })))
  const [note, setNote] = useState('')
  const [statusNote, setStatusNote] = useState('')
  const [revisions, setRevisions] = useState<ReportRevision[] | null>(null)
  const [preview, setPreview] = useState(report.status !== 'taslak')
  const dirty = useMemo(() => JSON.stringify(topics) !== JSON.stringify(report.topics.map((t) => ({ title: t.title, sections: t.sections, remove: false }))), [topics, report])
  const checks = 'ok' in report.checks ? report.checks : null
  const editable = report.status === 'taslak' || report.status === 'yayinda'

  useEffect(() => {
    research.revisions(client, report.id).then(setRevisions, () => setRevisions([]))
  }, [client, report.id, report.version])

  const setSection = (ti: number, key: (typeof SECTION_KEYS)[number], patch: Partial<{ text: string; refs: number[] }>) =>
    setTopics((all) => all.map((t, i) => (i === ti ? { ...t, sections: { ...t.sections, [key]: { ...t.sections[key], ...patch } } } : t)))

  return (
    <Modal
      open
      onOpenChange={(o) => !o && !busy && onClose()}
      title={report.title}
      description={
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge tone={STATUS[report.status].tone}>{STATUS[report.status].label}</Badge>
          <ChecksSummary c={report.checks} />
          <span className="text-[12px] text-subtle">sürüm {report.version}</span>
        </span>
      }
      size="xl"
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          {report.status === 'taslak' && (
            <Button variant="ghost" disabled={busy} onClick={() => void run(() => research.setStatus(client, report.id, 'reddedildi', statusNote), 'Taslak reddedildi.', onChanged)}>
              Reddet
            </Button>
          )}
          {report.status === 'yayinda' && (
            <Button variant="ghost" disabled={busy} onClick={() => void run(() => research.setStatus(client, report.id, 'geri_cekildi', statusNote), 'Rapor yayından kaldırıldı.', onChanged)}>
              Yayından kaldır
            </Button>
          )}
          {(report.status === 'reddedildi' || report.status === 'geri_cekildi') && (
            <Button disabled={busy} onClick={() => void run(() => research.setStatus(client, report.id, 'taslak', ''), 'Taslağa alındı.', onChanged)}>
              Taslağa al
            </Button>
          )}
          {editable && (
            <Button disabled={!dirty || busy} loading={busy} onClick={() => void run(() => research.saveEdit(client, report.id, topics, note).then(() => setNote('')), 'Kaydedildi ve yeniden denetlendi.', onChanged)}>
              Kaydet ve denetle
            </Button>
          )}
          {report.status === 'taslak' && (
            <Button variant="primary" icon={<ShieldCheck className="size-4" />} disabled={busy || dirty || !checks?.ok} onClick={() => void run(() => research.publish(client, report.id), 'Rapor yayınlandı; Plus+ kullanıcıları görüyor.', onChanged)}>
              Onayla ve yayınla
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {checks && !checks.ok && (
          <Alert tone="danger" title="Yayın öncesi denetimde sorun var">
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12.5px]">
              {checks.issues.slice(0, 20).map((i, k) => (
                <li key={k}>
                  {i.topic >= 0 ? `Konu ${i.topic + 1}` : 'Rapor'}
                  {i.section ? ` · ${SECTION_TITLE[i.section]}` : ''}: {i.detail}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[12px]">Metni düzeltip "Kaydet ve denetle" deyin. Kaynakta olmayan rakamı silin ya da doğru kaynak numarasını ekleyin; uzman kaynağı yoksa uzman bölümüne hazır cümleyi yazın.</p>
          </Alert>
        )}
        {report.status_note && <Alert tone="info">Not: {report.status_note}</Alert>}
        <Segmented<'duzenle' | 'onizle'>
          label="Görünüm"
          value={preview ? 'onizle' : 'duzenle'}
          onChange={(v) => setPreview(v === 'onizle')}
          options={[
            { value: 'duzenle', label: 'Düzenle', icon: <Pencil className="size-3.5" /> },
            { value: 'onizle', label: 'Kullanıcının göreceği', icon: <BookOpenCheck className="size-3.5" /> },
          ]}
        />
        {preview ? (
          <div className="flex flex-col gap-2">
            {topics
              .map((t, i) => ({ t, i }))
              .filter(({ t }) => !t.remove)
              .map(({ t, i }) => (
                <TopicView key={i} idx={i} reportId={report.id} t={{ ...report.topics[i], title: t.title, sections: t.sections }} open={i === 0} />
              ))}
          </div>
        ) : (
          topics.map((t, ti) => (
            <Card key={ti} className={cn('p-4', t.remove && 'opacity-50')}>
              <div className="flex items-center gap-2">
                <Input aria-label={`Konu ${ti + 1} başlığı`} value={t.title} disabled={!editable} onChange={(e) => setTopics((all) => all.map((x, i) => (i === ti ? { ...x, title: e.target.value } : x)))} className="flex-1 font-semibold" />
                {editable && (
                  <Button size="sm" variant="ghost" onClick={() => setTopics((all) => all.map((x, i) => (i === ti ? { ...x, remove: !x.remove } : x)))}>
                    {t.remove ? 'Geri al' : 'Konuyu çıkar'}
                  </Button>
                )}
              </div>
              {!t.remove && (
                <div className="mt-3 grid gap-3">
                  {SECTION_KEYS.map((k, si) => (
                    <div key={k} className="grid gap-1 sm:grid-cols-[1fr_110px] sm:gap-2">
                      <Field label={`${si + 1}. ${SECTION_TITLE[k]}`}>
                        <Textarea rows={2} value={t.sections[k]?.text ?? ''} disabled={!editable} onChange={(e) => setSection(ti, k, { text: e.target.value })} />
                      </Field>
                      <Field label="Kaynak no">
                        <Input
                          inputMode="numeric"
                          value={(t.sections[k]?.refs ?? []).join(', ')}
                          disabled={!editable}
                          onChange={(e) =>
                            setSection(ti, k, {
                              refs: e.target.value
                                .split(/[^\d]+/)
                                .filter(Boolean)
                                .map(Number),
                            })
                          }
                        />
                      </Field>
                    </div>
                  ))}
                  <div>
                    <div className="text-[13px] font-medium text-muted">7. Kaynaklar (toplanan maddelerden; değiştirilemez)</div>
                    <ul className="mt-1 flex flex-col gap-1 text-[12.5px]">
                      {report.topics[ti].sources.map((s) => (
                        <li key={s.n} className="rounded-lg bg-surface-2 px-2.5 py-1.5">
                          <span className="font-semibold">[{s.n}]</span> {CONTENT_LABEL[s.type]}
                          {s.personal !== undefined && (s.personal ? ' · kişisel görüş' : ' · kurum adına')} · {s.author ? `${s.author}, ` : ''}
                          {s.institution} · {dt(s.publishedAt)} ·{' '}
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                            {s.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </Card>
          ))
        )}
        {editable && !preview && (
          <Field label="Değişiklik notu" optional hint={report.status === 'yayinda' ? 'Yayındaki rapor düzeltilirse düzeltme olarak kaydedilir ve ölçümlerde sayılır.' : undefined}>
            <Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="ör. Rakam kaynağıyla düzeltildi" />
          </Field>
        )}
        {(report.status === 'taslak' || report.status === 'yayinda') && (
          <Field label={report.status === 'taslak' ? 'Ret gerekçesi' : 'Yayından kaldırma gerekçesi'} optional>
            <Input value={statusNote} maxLength={300} onChange={(e) => setStatusNote(e.target.value)} />
          </Field>
        )}
        <div>
          <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
            <History className="size-4" /> Değişiklik geçmişi
          </h3>
          <ul className="mt-1 text-[12.5px] text-muted">
            {(revisions ?? []).map((v) => (
              <li key={v.id} className="border-b border-line py-1.5 last:border-0">
                Sürüm {v.version} · {dt(v.edited_at)} · {v.edited_by ? 'editör' : 'otomatik'}
                {v.after_publish && <Badge tone="warning" className="ml-1">Yayından sonra düzeltme</Badge>}
                {v.note ? ` · ${v.note}` : ''} · {v.checks?.ok ? 'denetim temiz' : `${v.checks?.issues?.length ?? 0} sorun`}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  )
}

// ---------- Kaynaklar ----------

type SourceForm = Partial<ResearchSource>

function SourcesTab() {
  const { data, error, load, client } = useLoad(async (c) => ({ sources: await research.sources(c), experts: await research.experts(c) }))
  const { busy, run } = useRun()
  const [edit, setEdit] = useState<SourceForm | null>(null)
  const [del, setDel] = useState<ResearchSource | null>(null)
  if (error) return <SetupAlert error={error} />
  const groups: SourceGroup[] = ['tr_resmi', 'global_resmi', 'haber_uzman', 'piyasa']
  return (
    <div className="flex flex-col gap-4">
      <Alert tone="info">
        Ajan yalnızca açık ve kullanım koşulları "uygun" işaretlenmiş kaynakları okur. Önce RSS, indirilebilir veri ve resmî API tercih edilir; X hesapları yalnızca X API erişim izniyle okunur. Piyasa fiyatı yalnızca resmî veya lisanslı fiyat kaynağından alınır, haber sayfalarındaki fiyatlar kullanılmaz.
      </Alert>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEdit({ kind: 'rss', grp: 'haber_uzman', default_type: 'haber', terms_status: 'inceleniyor', poll_minutes: 60, active: false })}>
          Kaynak ekle
        </Button>
        <Button icon={<RefreshCw className={cn('size-4', busy && 'animate-spin')} />} disabled={busy} onClick={() => client && void run(async () => {
          const r = await research.collect(client)
          return r
        }, 'Açık kaynaklar kontrol edildi.', load)}>
          Hepsini şimdi kontrol et
        </Button>
      </div>
      {!data ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        groups.map((g) => {
          const list = data.sources.filter((s) => s.grp === g)
          return (
            <Card key={g} className="overflow-hidden">
              <h2 className="border-b border-line px-4 py-2.5 font-display text-[15px] font-semibold">
                {GROUP_LABEL[g]} <span className="text-[12px] font-normal text-subtle">({list.length})</span>
              </h2>
              {list.length === 0 ? (
                <p className="px-4 py-3 text-[13px] text-subtle">Bu grupta kaynak yok.</p>
              ) : (
                <ul>
                  {list.map((s) => {
                    const h = sourceHealth(s)
                    const expert = data.experts.find((e) => e.id === s.expert_id)
                    return (
                      <li key={s.id} className="flex flex-col gap-2 border-b border-line px-4 py-3 last:border-0 sm:flex-row sm:items-start">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium text-ink">{s.label || s.value}</span>
                            <Badge>{KIND_LABEL[s.kind]}</Badge>
                            <Badge tone={h.tone}>{h.label}</Badge>
                            <Badge tone={s.terms_status === 'izinli' ? 'teal' : s.terms_status === 'izinsiz' ? 'danger' : 'warning'}>{TERMS_LABEL[s.terms_status]}</Badge>
                            {expert && <Badge tone="accent">{expert.name}</Badge>}
                          </div>
                          <div className="truncate text-[12px] text-subtle">{s.kind === 'x' ? `@${s.value}` : s.value}</div>
                          <div className="mt-0.5 text-[12px] text-muted">
                            Son başarılı kontrol: {ago(s.last_ok_at)} · Son madde: {ago(s.last_item_at)} · {s.items_total} madde · her {s.poll_minutes} dk · varsayılan tür {CONTENT_LABEL[s.default_type]}
                          </div>
                          {s.last_error && (!s.last_ok_at || (s.last_error_at ?? '') > s.last_ok_at) && <div className="mt-0.5 text-[12px] text-danger">Hata ({ago(s.last_error_at)}): {s.last_error}</div>}
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Switch
                            label={`${s.label || s.value} açık`}
                            checked={s.active}
                            disabled={busy}
                            onChange={(v) => client && void run(() => research.saveSource(client, { id: s.id, active: v }), v ? (s.terms_status === 'izinli' ? 'Kaynak açıldı.' : 'Açıldı; koşullar uygun işaretlenene kadar okunmaz.') : 'Kaynak kapatıldı.', load)}
                          />
                          <Button size="sm" variant="ghost" disabled={busy || !s.active || s.terms_status !== 'izinli'} onClick={() => client && void run(() => research.collect(client, s.id), 'Kaynak kontrol edildi.', load)}>
                            Kontrol et
                          </Button>
                          <Button size="sm" variant="ghost" aria-label="Kaynağı düzenle" icon={<Pencil className="size-4" />} onClick={() => setEdit(s)} />
                          <Button size="sm" variant="ghost" aria-label="Kaynağı sil" icon={<Trash2 className="size-4" />} onClick={() => setDel(s)} />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>
          )
        })
      )}
      {edit && client && data && <SourceModal initial={edit} experts={data.experts} onClose={() => setEdit(null)} onSave={(s) => run(() => research.saveSource(client, s), 'Kaynak kaydedildi.', load).then((ok) => ok && setEdit(null))} busy={busy} />}
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title="Kaynağı sil" confirmLabel="Sil" danger loading={busy} onConfirm={() => client && del && void run(() => research.deleteSource(client, del.id), 'Kaynak silindi.', load).then(() => setDel(null))}>
        {del?.label || del?.value} silinecek. Daha önce toplanan maddeler ve yayınlanmış raporlardaki kaynak bağlantıları kalır.
      </ConfirmDialog>
    </div>
  )
}

function SourceModal({ initial, experts, onClose, onSave, busy }: { initial: SourceForm; experts: Expert[]; onClose: () => void; onSave: (s: SourceForm) => void; busy: boolean }) {
  const [f, setF] = useState<SourceForm>(initial)
  const set = (p: SourceForm) => setF((x) => ({ ...x, ...p }))
  const kinds: SourceKind[] = ['rss', 'x', 'tcmb_kur', 'data', 'api', 'page']
  const priceOk = f.grp !== 'piyasa' || f.kind === 'tcmb_kur' || f.kind === 'api'
  const valueOk = f.kind === 'x' ? /^[a-z0-9_]{1,15}$/.test(normalizeHandle(f.value ?? '')) : /^https:\/\/\S+$/i.test(f.value ?? '')
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={initial.id ? 'Kaynağı düzenle' : 'Kaynak ekle'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!valueOk || !priceOk}
            onClick={() => {
              const { id, kind, value, label, grp, default_type, terms_status, terms_url, terms_note, poll_minutes, expert_id, active } = f
              onSave({
                id,
                kind,
                value: kind === 'x' ? normalizeHandle(value ?? '') : value?.trim(),
                label: label?.trim() || null,
                grp,
                default_type,
                terms_status,
                terms_url: terms_url?.trim() || null,
                terms_note: terms_note?.trim() || null,
                terms_checked_at: terms_status !== initial.terms_status ? new Date().toISOString() : initial.terms_checked_at,
                poll_minutes,
                expert_id: expert_id || null,
                active,
              })
            }}
          >
            Kaydet
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Erişim türü">
          <Select value={f.kind} onChange={(e) => set({ kind: e.target.value as SourceKind })} disabled={!!initial.id}>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
                {k === 'data' || k === 'api' || k === 'page' ? ' (okuyucu henüz yok)' : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Grup" error={priceOk ? undefined : 'Fiyat grubu yalnızca resmî kur dosyası veya lisanslı API olabilir'}>
          <Select value={f.grp} onChange={(e) => set({ grp: e.target.value as SourceGroup })}>
            {(Object.keys(GROUP_LABEL) as SourceGroup[]).map((g) => (
              <option key={g} value={g}>
                {GROUP_LABEL[g]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={f.kind === 'x' ? 'X kullanıcı adı' : 'Adres (https)'} className="sm:col-span-2" error={f.value && !valueOk ? 'Geçerli bir adres girin' : undefined}>
          <Input value={f.value ?? ''} onChange={(e) => set({ value: e.target.value })} placeholder={f.kind === 'x' ? '@kullaniciadi' : 'https://…'} />
        </Field>
        <Field label="Görünen ad" optional>
          <Input value={f.label ?? ''} maxLength={80} onChange={(e) => set({ label: e.target.value })} placeholder="ör. TCMB PPK kararları" />
        </Field>
        <Field label="İçerik türü" hint="Uzmana bağlı kaynaklar uzman yorumu sayılır.">
          <Select value={f.default_type} onChange={(e) => set({ default_type: e.target.value as ContentType })}>
            {(Object.keys(CONTENT_LABEL) as ContentType[]).map((t) => (
              <option key={t} value={t}>
                {CONTENT_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Uzman" optional>
          <Select value={f.expert_id ?? ''} onChange={(e) => set({ expert_id: e.target.value || null })}>
            <option value="">Uzmana bağlı değil</option>
            {experts.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Kontrol sıklığı (dakika)" hint="Planlı yayınların çevresinde 10 dakikaya iner.">
          <Input type="number" min={10} max={10080} value={f.poll_minutes ?? 60} onChange={(e) => set({ poll_minutes: Math.max(10, Math.min(10080, Number(e.target.value) || 60)) })} />
        </Field>
        <Field label="Kullanım koşulları">
          <Select value={f.terms_status} onChange={(e) => set({ terms_status: e.target.value as TermsStatus })}>
            {(Object.keys(TERMS_LABEL) as TermsStatus[]).map((t) => (
              <option key={t} value={t}>
                {TERMS_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Koşullar sayfası" optional>
          <Input value={f.terms_url ?? ''} onChange={(e) => set({ terms_url: e.target.value })} placeholder="https://…" />
        </Field>
        <Field label="Koşullar notu" optional className="sm:col-span-2">
          <Textarea rows={2} maxLength={500} value={f.terms_note ?? ''} onChange={(e) => set({ terms_note: e.target.value })} placeholder="ör. Kaynak gösterilerek kullanılabilir; ticari kullanım sınırı yok" />
        </Field>
      </div>
    </Modal>
  )
}

// ---------- Uzmanlar ----------

function ExpertsTab() {
  const { data, error, load, client } = useLoad(async (c) => ({ experts: await research.experts(c), sources: await research.sources(c) }))
  const { busy, run } = useRun()
  const [edit, setEdit] = useState<Partial<Expert> | null>(null)
  const [del, setDel] = useState<Expert | null>(null)
  if (error) return <SetupAlert error={error} />
  const active = data?.experts.filter((e) => e.active).length ?? 0
  return (
    <div className="flex flex-col gap-4">
      <Alert tone="info">
        Türkiye makro, küresel, BIST, altın/enerji ve kripto alanlarından 8–10 uzman veya araştırma yayını önerilir; seçimi takipçi sayısına değil uzmanlığa göre yapın. Uzmanın X hesabını veya yazı beslemesini Kaynaklar bölümünden ekleyip uzmana bağlayın. Kişisel görüşler raporda "kişisel görüş" diye ayrılır, eski veya kaynaksız görüşler kanıt olarak kullanılmaz.
      </Alert>
      <div className="flex items-center gap-3">
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEdit({ area: 'tr_makro', speaks_for: 'kisisel', active: true })}>
          Uzman ekle
        </Button>
        <span className={cn('text-[13px]', active >= 8 ? 'text-accent' : 'text-muted')}>{active} etkin uzman (hedef 8–10)</span>
      </div>
      <Card className="overflow-hidden">
        {!data ? (
          <Skeleton className="h-32 w-full" />
        ) : data.experts.length === 0 ? (
          <EmptyState icon={<Users className="size-6" />} title="Henüz uzman yok" />
        ) : (
          <ul>
            {data.experts.map((e) => {
              const srcs = data.sources.filter((s) => s.expert_id === e.id)
              return (
                <li key={e.id} className={cn('flex items-start gap-3 border-b border-line px-4 py-3 last:border-0', !e.active && 'opacity-60')}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-ink">{e.name}</span>
                      <Badge>{AREA_LABEL[e.area]}</Badge>
                      <Badge tone={e.speaks_for === 'kurumsal' ? 'teal' : 'neutral'}>{e.speaks_for === 'kurumsal' ? 'Kurum adına' : 'Kişisel görüş'}</Badge>
                    </div>
                    <div className="text-[12px] text-muted">{[e.title, e.institution].filter(Boolean).join(' · ') || '—'}</div>
                    <div className="text-[12px] text-subtle">{srcs.length ? `Kaynaklar: ${srcs.map((s) => (s.kind === 'x' ? `@${s.value}` : s.label || s.value)).join(', ')}` : 'Bağlı kaynak yok; görüşleri toplanmaz'}</div>
                  </div>
                  <Button size="sm" variant="ghost" aria-label="Uzmanı düzenle" icon={<Pencil className="size-4" />} onClick={() => setEdit(e)} />
                  <Button size="sm" variant="ghost" aria-label="Uzmanı sil" icon={<Trash2 className="size-4" />} onClick={() => setDel(e)} />
                </li>
              )
            })}
          </ul>
        )}
      </Card>
      {edit && client && <ExpertModal initial={edit} busy={busy} onClose={() => setEdit(null)} onSave={(e) => run(() => research.saveExpert(client, e), 'Uzman kaydedildi.', load).then((ok) => ok && setEdit(null))} />}
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title="Uzmanı sil" confirmLabel="Sil" danger loading={busy} onConfirm={() => client && del && void run(() => research.deleteExpert(client, del.id), 'Uzman silindi.', load).then(() => setDel(null))}>
        {del?.name} silinecek; bağlı kaynaklar uzmansız kalır.
      </ConfirmDialog>
    </div>
  )
}

function ExpertModal({ initial, busy, onClose, onSave }: { initial: Partial<Expert>; busy: boolean; onClose: () => void; onSave: (e: Partial<Expert>) => void }) {
  const [f, setF] = useState(initial)
  const set = (p: Partial<Expert>) => setF((x) => ({ ...x, ...p }))
  const urlOk = !f.profile_url || /^https:\/\/\S+$/i.test(f.profile_url)
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={initial.id ? 'Uzmanı düzenle' : 'Uzman ekle'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={(f.name ?? '').trim().length < 2 || !urlOk}
            onClick={() =>
              onSave({ id: f.id, name: f.name!.trim(), title: f.title?.trim() || null, institution: f.institution?.trim() || null, area: f.area, speaks_for: f.speaks_for, profile_url: f.profile_url?.trim() || null, note: f.note?.trim() || null, active: f.active })
            }
          >
            Kaydet
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Ad soyad veya yayın adı" className="sm:col-span-2">
          <Input value={f.name ?? ''} maxLength={80} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Unvan" optional>
          <Input value={f.title ?? ''} maxLength={120} onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <Field label="Kurum" optional>
          <Input value={f.institution ?? ''} maxLength={120} onChange={(e) => set({ institution: e.target.value })} />
        </Field>
        <Field label="Alan">
          <Select value={f.area} onChange={(e) => set({ area: e.target.value as ExpertArea })}>
            {(Object.keys(AREA_LABEL) as ExpertArea[]).map((a) => (
              <option key={a} value={a}>
                {AREA_LABEL[a]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Görüşleri" hint="Kurum adına konuşmuyorsa kişisel görüş seçin.">
          <Select value={f.speaks_for} onChange={(e) => set({ speaks_for: e.target.value as Expert['speaks_for'] })}>
            <option value="kisisel">Kişisel görüş</option>
            <option value="kurumsal">Kurum adına</option>
          </Select>
        </Field>
        <Field label="Profil bağlantısı" optional error={urlOk ? undefined : 'https:// ile başlamalı'} className="sm:col-span-2">
          <Input value={f.profile_url ?? ''} onChange={(e) => set({ profile_url: e.target.value })} />
        </Field>
        <Field label="Seçim gerekçesi" optional className="sm:col-span-2">
          <Textarea rows={2} maxLength={500} value={f.note ?? ''} onChange={(e) => set({ note: e.target.value })} placeholder="ör. Para politikası üzerine düzenli, verili analiz yayınlıyor" />
        </Field>
        <div className="sm:col-span-2">
          <Switch label="Etkin" checked={f.active ?? true} onChange={(v) => set({ active: v })} />
          <span className="ml-2 text-[13px] text-muted">Etkin</span>
        </div>
      </div>
    </Modal>
  )
}

// ---------- Takvim ----------

function CalendarTab() {
  const { data, error, load, client } = useLoad(async (c) => ({ cal: await research.calendar(c), sources: await research.sources(c) }))
  const { busy, run } = useRun()
  const [f, setF] = useState<Partial<CalendarEntry> & { local?: string }>({ institution: 'TÜİK' })
  const [now] = useState(() => Date.now())
  if (error) return <SetupAlert error={error} />
  const ok = (f.institution ?? '').trim().length >= 2 && (f.title ?? '').trim().length >= 2 && !!f.local
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4 sm:p-5">
        <h2 className="font-display text-base font-semibold">Yayın takvimi</h2>
        <p className="mt-1 text-[13px] text-muted">Planlı açıklamaları (TÜİK verileri, faiz kararları, ABD istihdam verisi) girin. Bağlı kaynak, açıklamadan 30 dakika önce ile 3 saat sonrası arasında 10 dakikada bir kontrol edilir; raporların "Sonraki işaret" bölümü de bu takvimi kullanır.</p>
        <form
          className="mt-3 grid gap-2 sm:grid-cols-[120px_1fr_200px_110px_180px_auto]"
          onSubmit={(e) => {
            e.preventDefault()
            if (!client || !ok) return
            void run(() => research.saveCalendar(client, { institution: f.institution!.trim(), title: f.title!.trim(), release_at: new Date(f.local!).toISOString(), period: f.period?.trim() || null, source_id: f.source_id || null }), 'Takvime eklendi.', load).then((s) => s && setF({ institution: f.institution }))
          }}
        >
          <Input aria-label="Kurum" value={f.institution ?? ''} onChange={(e) => setF({ ...f, institution: e.target.value })} placeholder="Kurum" />
          <Input aria-label="Açıklama" value={f.title ?? ''} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="ör. Tüketici fiyat endeksi" />
          <Input aria-label="Tarih ve saat" type="datetime-local" value={f.local ?? ''} onChange={(e) => setF({ ...f, local: e.target.value })} />
          <Input aria-label="Dönem" value={f.period ?? ''} onChange={(e) => setF({ ...f, period: e.target.value })} placeholder="2026-09" />
          <Select aria-label="Bağlı kaynak" value={f.source_id ?? ''} onChange={(e) => setF({ ...f, source_id: e.target.value })}>
            <option value="">Kaynak yok</option>
            {data?.sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label || s.value}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="primary" icon={<Plus className="size-4" />} disabled={!ok || busy}>
            Ekle
          </Button>
        </form>
      </Card>
      <Card className="overflow-hidden">
        {!data ? (
          <Skeleton className="h-24 w-full" />
        ) : data.cal.length === 0 ? (
          <EmptyState icon={<CalendarClock className="size-6" />} title="Takvimde kayıt yok" />
        ) : (
          <ul>
            {data.cal.map((c) => (
              <li key={c.id} className={cn('flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0', Date.parse(c.release_at) < now && 'opacity-60')}>
                <span className="w-36 shrink-0 text-[12.5px] text-muted">{dt(c.release_at)}</span>
                <span className="min-w-0 flex-1 text-[13px] text-ink">
                  <b>{c.institution}</b> · {c.title}
                  {c.period ? ` (${c.period})` : ''}
                  {c.source_id && <span className="text-subtle"> · {data.sources.find((s) => s.id === c.source_id)?.label ?? 'kaynak'}</span>}
                </span>
                <Button size="sm" variant="ghost" aria-label="Takvimden sil" icon={<Trash2 className="size-4" />} disabled={busy} onClick={() => client && void run(() => research.deleteCalendar(client, c.id), undefined, load)} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

// ---------- Ölçümler ----------

function Metric({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <Card className="p-4">
      <div className="text-[12.5px] font-medium text-muted">{label}</div>
      <div className={cn('num mt-1.5 font-display text-[24px] font-bold leading-none text-ink', tone === 'bad' && 'text-danger', tone === 'good' && 'text-accent')}>{value}</div>
      {hint && <div className="mt-1 text-[12px] text-subtle">{hint}</div>}
    </Card>
  )
}

function UsageBar({ label, used, max }: { label: string; used: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (used / max) * 100) : 100
  return (
    <div>
      <div className="flex justify-between text-[12.5px]">
        <span className="text-muted">{label}</span>
        <span className="num text-ink">
          {used.toLocaleString('tr-TR')} / {max.toLocaleString('tr-TR')}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2" role="meter" aria-label={label} aria-valuenow={used} aria-valuemin={0} aria-valuemax={max}>
        <div className={cn('h-full rounded-full', pct >= 90 ? 'bg-danger' : pct >= 70 ? 'bg-warning' : 'bg-accent')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function MetricsTab() {
  const { data, error, load, client } = useLoad(async (c) => ({ m: await research.metrics(c), s: await research.settings(c) }))
  const { busy, run } = useRun()
  const [form, setForm] = useState<AgentSettings | null>(null)
  if (error) return <SetupAlert error={error} />
  if (!data) return <Skeleton className="h-60 w-full" />
  const { m, s } = data
  const f = form ?? s
  const pct = (a: number, b: number) => (b > 0 ? `%${((a / b) * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}` : '—')
  const test = m.sonKocTesti
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-muted">Son 30 gün. Kaynak ve rakam ölçümleri, editör düzeltmesinden önceki ilk taslaklar üzerinden hesaplanır.</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Kaynaksız iddia" value={m.kaynaksizIddia} hint={`${m.taslak} taslakta`} tone={m.kaynaksizIddia ? 'bad' : 'good'} />
        <Metric label="Kaynakta olmayan rakam" value={m.kaynaksizRakam} tone={m.kaynaksizRakam ? 'bad' : 'good'} />
        <Metric label="Eski veya hatalı veri oranı" value={pct(m.eskiVeri, m.kaynakSayisi)} hint={`${m.eskiVeri} / ${m.kaynakSayisi} kaynak`} />
        <Metric label="Önemli gelişmeyi yakalama" value={m.yakalamaDakikaMedyan != null ? `${m.yakalamaDakikaMedyan.toLocaleString('tr-TR')} dk` : '—'} hint="Resmî açıklamalarda yayından kayda geçen süre (medyan)" />
        <Metric label="Rapor düzeltme oranı" value={pct(m.duzeltilenRapor, m.yayinlanan)} hint={`${m.duzeltilenRapor} / ${m.yayinlanan} yayınlanan rapor`} />
        <Metric label="Raporda yönlendirme dili" value={m.raporYonlendirme} hint="İlk taslaklarda yakalanan" tone={m.raporYonlendirme ? 'bad' : 'good'} />
        <Metric label="Koçta yakalanan yönlendirme" value={m.kocYenidenYazildi + m.kocEngellendi} hint={`${m.kocYenidenYazildi} yeniden yazıldı, ${m.kocEngellendi} engellendi; kullanıcıya gitmedi`} />
        <Metric
          label="Koç güvenlik testi"
          value={test ? (test.ok ? 'Geçti' : 'Kaldı') : '—'}
          tone={test ? (test.ok ? 'good' : 'bad') : undefined}
          hint={test ? `${dt(test.started_at)} · ${test.stats.vaka ?? 0} örnek sohbet, ilk yanıtta ${test.stats.ilkYanittaYonlendirme ?? 0}, kullanıcıya giden ${test.stats.kullaniciyaGidenYonlendirme ?? 0}` : 'Henüz çalıştırılmadı'}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button icon={<ShieldCheck className="size-4" />} loading={busy} onClick={() => client && void run(() => research.coachEval(client), 'Güvenlik testi tamamlandı.', load)}>
          Koç güvenlik testini çalıştır
        </Button>
        <span className="self-center text-[12.5px] text-subtle">
          Son toplama: {m.sonToplama ? `${dt(m.sonToplama.started_at)} · ${m.sonToplama.stats.kontrol ?? 0} kaynak, ${m.sonToplama.stats.yeni ?? 0} yeni madde, ${m.sonToplama.stats.hata ?? 0} hata` : 'hiç'}
        </span>
      </div>

      <Card className="p-4 sm:p-5">
        <h2 className="font-display text-base font-semibold">Kullanım ve limitler</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <UsageBar label="Bugün kaynak isteği" used={m.bugun.collect ?? 0} max={s.collect_daily_max} />
          <UsageBar label="Bugün piyasa verisi isteği" used={m.bugun.market ?? 0} max={s.market_daily_max} />
          <UsageBar label="Bu ay araştırma yapay zekâ token" used={m.buAy.ai_research ?? 0} max={s.ai_research_monthly_tokens} />
          <UsageBar label="Bu ay koç yapay zekâ token" used={m.buAy.ai_coach ?? 0} max={s.ai_coach_monthly_tokens} />
        </div>
        <form
          className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5"
          onSubmit={(e) => {
            e.preventDefault()
            if (client && form) void run(() => research.saveSettings(client, form), 'Limitler kaydedildi.', async () => {
              setForm(null)
              await load()
            })
          }}
        >
          {(
            [
              ['collect_daily_max', 'Günlük kaynak isteği'],
              ['market_daily_max', 'Günlük piyasa isteği'],
              ['ai_research_monthly_tokens', 'Aylık araştırma token'],
              ['ai_coach_monthly_tokens', 'Aylık koç token'],
              ['coach_daily_limit', 'Kişi başı günlük soru'],
            ] as const
          ).map(([k, label]) => (
            <Field key={k} label={label}>
              <Input type="number" min={0} value={f[k]} onChange={(e) => setForm({ ...f, [k]: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
            </Field>
          ))}
          <div className="sm:col-span-3 lg:col-span-5">
            <Button type="submit" variant="primary" disabled={!form || busy}>
              Limitleri kaydet
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
