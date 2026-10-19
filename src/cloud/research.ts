import type { SupabaseClient } from '@supabase/supabase-js'
import type { ContentType, ReportChecks, ReportKind, ReportTopic, SourceGroup, SourceKind } from '../../supabase/functions/_shared/research.ts'

export type { ContentType, ReportChecks, ReportKind, ReportTopic, SourceGroup, SourceKind }
export { CONTENT_LABEL, SECTION_KEYS, SECTION_TITLE, NO_OPINION } from '../../supabase/functions/_shared/research.ts'

export type ReportStatus = 'taslak' | 'yayinda' | 'reddedildi' | 'geri_cekildi'

export interface Report {
  id: string
  kind: ReportKind
  title: string
  window_start: string
  window_end: string
  status: ReportStatus
  topics: ReportTopic[]
  checks: ReportChecks | Record<string, never>
  version: number
  created_by: string
  created_at: string
  updated_at: string
  published_at: string | null
  status_note: string | null
}

export interface ReportRevision {
  id: string
  version: number
  edited_by: string | null
  edited_at: string
  note: string | null
  after_publish: boolean
  checks: ReportChecks
}

export type TermsStatus = 'inceleniyor' | 'izinli' | 'izinsiz'

export interface ResearchSource {
  id: string
  kind: SourceKind
  value: string
  label: string | null
  active: boolean
  grp: SourceGroup
  default_type: ContentType
  terms_status: TermsStatus
  terms_url: string | null
  terms_note: string | null
  terms_checked_at: string | null
  poll_minutes: number
  expert_id: string | null
  last_checked_at: string | null
  last_ok_at: string | null
  last_error: string | null
  last_error_at: string | null
  last_item_at: string | null
  items_total: number
}

export type ExpertArea = 'tr_makro' | 'global' | 'bist' | 'emtia' | 'kripto' | 'diger'

export interface Expert {
  id: string
  name: string
  title: string | null
  institution: string | null
  area: ExpertArea
  speaks_for: 'kisisel' | 'kurumsal'
  profile_url: string | null
  note: string | null
  active: boolean
}

export interface CalendarEntry {
  id: string
  institution: string
  title: string
  release_at: string
  period: string | null
  source_id: string | null
}

export interface AgentSettings {
  collect_daily_max: number
  market_daily_max: number
  ai_research_monthly_tokens: number
  ai_coach_monthly_tokens: number
  coach_daily_limit: number
}

export interface ResearchMetrics {
  taslak: number
  yayinlanan: number
  kaynaksizIddia: number
  kaynaksizRakam: number
  eskiVeri: number
  kaynakSayisi: number
  raporYonlendirme: number
  yakalamaDakikaMedyan: number | null
  duzeltilenRapor: number
  kocYenidenYazildi: number
  kocEngellendi: number
  sonKocTesti: { started_at: string; ok: boolean; stats: { vaka?: number; ilkYanittaYonlendirme?: number; kullaniciyaGidenYonlendirme?: number } } | null
  sonToplama: { started_at: string; ok: boolean; stats: { kontrol?: number; yeni?: number; hata?: number }; error: string | null } | null
  bugun: Partial<Record<string, number>>
  buAy: Partial<Record<string, number>>
}

export const REPORT_KIND_LABEL: Record<ReportKind, string> = { gunluk: 'Günlük', haftalik: 'Haftalık', aylik: 'Aylık', acil: 'Acil bülten' }
export const GROUP_LABEL: Record<SourceGroup, string> = { tr_resmi: 'Türkiye resmî', global_resmi: 'Küresel resmî', haber_uzman: 'Haber ve uzman', piyasa: 'Piyasa fiyatı' }
export const KIND_LABEL: Record<SourceKind, string> = { rss: 'RSS', x: 'X hesabı', tcmb_kur: 'TCMB kur dosyası', data: 'İndirilebilir veri', api: 'Resmî API', page: 'Açık sayfa' }
export const TERMS_LABEL: Record<TermsStatus, string> = { inceleniyor: 'Koşullar inceleniyor', izinli: 'Koşullar uygun', izinsiz: 'Kullanım izni yok' }
export const AREA_LABEL: Record<ExpertArea, string> = { tr_makro: 'Türkiye makro', global: 'Küresel', bist: 'BIST', emtia: 'Altın ve enerji', kripto: 'Kripto', diger: 'Diğer' }

const REPORT_COLS = 'id, kind, title, window_start, window_end, status, topics, checks, version, created_by, created_at, updated_at, published_at, status_note'

/** Yayınlanmış raporlar (herkes). Tablo kurulmamışsa boş liste. */
export async function listPublishedReports(client: SupabaseClient, limit = 10): Promise<Report[]> {
  const { data, error } = await client.from('ha_reports').select(REPORT_COLS).eq('status', 'yayinda').order('published_at', { ascending: false }).limit(limit)
  if (error) return []
  return (data ?? []) as Report[]
}

// ---------- Yönetici ----------

async function rows<T>(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await p
  if (error) throw error
  return (data ?? []) as T[]
}

async function done(p: PromiseLike<{ error: unknown }>): Promise<void> {
  const { error } = await p
  if (error) throw error
}

async function invoke<T>(client: SupabaseClient, name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.functions.invoke(name, { body })
  if (error) {
    let msg = 'Sunucu fonksiyonu yanıt vermedi. Kurulu ve sırları eklenmiş mi?'
    try {
      const b = await (error as { context?: Response }).context?.json()
      if (b?.error) msg = b.error
    } catch {
      /* yok say */
    }
    throw new Error(msg)
  }
  return data as T
}

export const research = {
  reports: (c: SupabaseClient, limit = 40) => rows<Report>(c.from('ha_reports').select(REPORT_COLS).order('created_at', { ascending: false }).limit(limit)),
  revisions: (c: SupabaseClient, reportId: string) =>
    rows<ReportRevision>(c.from('ha_report_revisions').select('id, version, edited_by, edited_at, note, after_publish, checks').eq('report_id', reportId).order('version', { ascending: false })),
  publish: (c: SupabaseClient, id: string) => done(c.rpc('ha_admin_report_publish', { p_id: id })),
  setStatus: (c: SupabaseClient, id: string, status: 'reddedildi' | 'geri_cekildi' | 'taslak', note: string) => done(c.rpc('ha_admin_report_set_status', { p_id: id, p_status: status, p_note: note })),
  saveEdit: (c: SupabaseClient, id: string, topics: Array<{ title: string; sections: ReportTopic['sections']; remove?: boolean }>, note: string) =>
    invoke<{ ok: boolean; checks: ReportChecks; version: number }>(c, 'research-report', { action: 'save', id, topics, note }),
  generate: (c: SupabaseClient, kind: ReportKind, eventKey?: string) => invoke<{ ok: boolean; id?: string; skipped?: string; checks?: ReportChecks }>(c, 'research-report', { action: 'generate', kind, eventKey }),
  collect: (c: SupabaseClient, sourceId?: string) => invoke<{ ok: boolean; kontrol: number; yeni: number; hata: number }>(c, 'research-collect', { sourceId }),
  coachEval: (c: SupabaseClient) => invoke<{ ok: boolean; vaka: number; ilkYanittaYonlendirme: number; kullaniciyaGidenYonlendirme: number }>(c, 'coach-eval', {}),

  sources: (c: SupabaseClient) => rows<ResearchSource>(c.from('ha_news_sources').select('*').order('grp').order('created_at')),
  saveSource: (c: SupabaseClient, s: Partial<ResearchSource> & { id?: string }) => {
    const { id, ...rest } = s
    return done(id ? c.from('ha_news_sources').update(rest).eq('id', id) : c.from('ha_news_sources').insert(rest))
  },
  deleteSource: (c: SupabaseClient, id: string) => done(c.from('ha_news_sources').delete().eq('id', id)),

  experts: (c: SupabaseClient) => rows<Expert>(c.from('ha_experts').select('*').order('area').order('name')),
  saveExpert: (c: SupabaseClient, e: Partial<Expert> & { id?: string }) => {
    const { id, ...rest } = e
    return done(id ? c.from('ha_experts').update(rest).eq('id', id) : c.from('ha_experts').insert(rest))
  },
  deleteExpert: (c: SupabaseClient, id: string) => done(c.from('ha_experts').delete().eq('id', id)),

  calendar: (c: SupabaseClient) =>
    rows<CalendarEntry>(c.from('ha_release_calendar').select('*').gte('release_at', new Date(Date.now() - 7 * 86400000).toISOString()).order('release_at').limit(100)),
  saveCalendar: (c: SupabaseClient, e: Partial<CalendarEntry> & { id?: string }) => {
    const { id, ...rest } = e
    return done(id ? c.from('ha_release_calendar').update(rest).eq('id', id) : c.from('ha_release_calendar').insert(rest))
  },
  deleteCalendar: (c: SupabaseClient, id: string) => done(c.from('ha_release_calendar').delete().eq('id', id)),

  settings: async (c: SupabaseClient): Promise<AgentSettings> => {
    const { data, error } = await c.from('ha_agent_settings').select('*').eq('id', 1).single()
    if (error) throw error
    return data as AgentSettings
  },
  saveSettings: (c: SupabaseClient, s: Partial<AgentSettings>) => done(c.from('ha_agent_settings').update({ ...s, updated_at: new Date().toISOString() }).eq('id', 1)),
  metrics: async (c: SupabaseClient): Promise<ResearchMetrics> => {
    const { data, error } = await c.rpc('ha_admin_research_metrics')
    if (error) throw error
    return data as ResearchMetrics
  },
}

/** X kullanıcı adını sadeleştirir (@, bağlantı). */
export function normalizeHandle(v: string): string {
  return v
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?(x|twitter)\.com\//i, '')
    .replace(/^@/, '')
    .split(/[/?#]/)[0]
    .toLowerCase()
}

/** Kaynağın sağlık durumu: veri gecikmesi ve hata. */
export function sourceHealth(s: ResearchSource, now = Date.now()): { tone: 'accent' | 'warning' | 'danger' | 'neutral'; label: string } {
  if (!s.active) return { tone: 'neutral', label: 'Kapalı' }
  if (s.terms_status !== 'izinli') return { tone: 'warning', label: 'Koşullar onaylanmadı, okunmuyor' }
  if (s.last_error && (!s.last_ok_at || (s.last_error_at && s.last_error_at > s.last_ok_at))) return { tone: 'danger', label: 'Hata' }
  if (!s.last_ok_at) return { tone: 'neutral', label: 'Henüz kontrol edilmedi' }
  if (now - Date.parse(s.last_ok_at) > 3 * s.poll_minutes * 60000) return { tone: 'warning', label: 'Gecikmeli' }
  return { tone: 'accent', label: 'Sağlıklı' }
}
