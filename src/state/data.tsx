import { useLiveQuery } from 'dexie-react-hooks'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createDb, DEMO_DB_NAME, REAL_DB_NAME } from '../data/db'
import { AtlasRepository } from '../data/repository'
import type { Category, ImportRecord, Member, Rule, Settings, SpendGroup, Transaction } from '../domain/types'
import { readPref, writePref } from './prefs'
import { useUi } from './ui'

interface DataCtx {
  repo: AtlasRepository
  isDemo: boolean
  setDemo: (on: boolean) => void
  dbError: string | null
}

const Ctx = createContext<DataCtx | null>(null)

const realRepos = new Map<string, AtlasRepository>()
function getRealRepo(name: string) {
  let r = realRepos.get(name)
  if (!r) realRepos.set(name, (r = new AtlasRepository(createDb(name), false)))
  return r
}

/**
 * Hesapla girişte her hesabın kayıtları ayrı veritabanındadır. Cihazdaki ana veritabanı (girişten
 * önceki kayıtlar dahil) ilk giren hesaba aittir; aynı cihazda başka biri girerse ona boş, ayrı bir
 * veritabanı açılır.
 */
export function realDbNameFor(userId: string | undefined): string {
  if (!userId) return REAL_DB_NAME
  const owner = readPref('dbOwner')
  if (!owner) writePref('dbOwner', userId)
  return !owner || owner === userId ? REAL_DB_NAME : `${REAL_DB_NAME}-${userId}`
}

let demoRepo: AtlasRepository | null = null
function getDemoRepo() {
  demoRepo ??= new AtlasRepository(createDb(DEMO_DB_NAME), true)
  return demoRepo
}

/**
 * Gerçek veriler ve demo verileri ayrı IndexedDB veritabanlarındadır; demo modu açılınca
 * bütün ekranlar demo deposuna bağlanır, gerçek kayıtlara dokunulmaz.
 */
export function DataProvider({ children, userId }: { children: ReactNode; userId?: string }) {
  const [isDemo, setIsDemo] = useState(() => readPref('demo') === '1')
  const [dbError, setDbError] = useState<string | null>(null)
  const realName = useMemo(() => realDbNameFor(userId), [userId])
  const repo = isDemo ? getDemoRepo() : getRealRepo(realName)

  useEffect(() => {
    let alive = true
    repo.db
      .open()
      .then(async () => {
        if (repo.isDemo && (await repo.db.transactions.count()) === 0) {
          const { seedDemoData } = await import('../data/demo')
          await seedDemoData(repo)
        }
        if (alive) setDbError(null)
      })
      .catch((e: { name?: string }) => {
        if (!alive) return
        setDbError(
          e?.name === 'VersionError'
            ? 'Veritabanı daha yeni bir sürümle oluşturulmuş. Sayfayı yenileyin.'
            : 'Tarayıcı veritabanı açılamadı. Gizli pencerede olabilirsiniz veya site verilerine izin verilmiyor olabilir.',
        )
      })
    return () => {
      alive = false
    }
  }, [repo])

  const setDemo = useCallback((on: boolean) => {
    writePref('demo', on ? '1' : null)
    setIsDemo(on)
  }, [])

  const value = useMemo(() => ({ repo, isDemo, setDemo, dbError }), [repo, isDemo, setDemo, dbError])
  return (
    <Ctx.Provider value={value}>
      <LiveProvider repo={repo}>{children}</LiveProvider>
    </Ctx.Provider>
  )
}

interface LiveData {
  transactions?: Transaction[]
  categories?: Category[]
  groups?: SpendGroup[]
  settings?: Settings
  members?: Member[]
}

const LiveCtx = createContext<LiveData>({})

/**
 * Sık kullanılan kayıtlar bir kez okunur ve bütün sayfalar aynı canlı sonucu paylaşır: sayfa
 * değiştirirken veritabanı yeniden okunmaz, sayfa iskelet göstermeden hemen açılır.
 */
function LiveProvider({ repo, children }: { repo: AtlasRepository; children: ReactNode }) {
  const transactions = useLiveQuery(() => repo.allTransactions(), [repo])
  const categories = useLiveQuery(() => repo.db.categories.orderBy('order').toArray(), [repo])
  const groups = useLiveQuery(() => repo.db.groups.orderBy('order').toArray(), [repo])
  const settings = useLiveQuery(() => repo.getSettings(), [repo])
  const members = useLiveQuery(() => repo.db.members.toArray(), [repo])
  const value = useMemo(() => ({ transactions, categories, groups, settings, members }), [transactions, categories, groups, settings, members])
  return <LiveCtx.Provider value={value}>{children}</LiveCtx.Provider>
}

/** Üyeler (canlı, paylaşılan). */
export function useMemberList(): Member[] | undefined {
  return useContext(LiveCtx).members
}

export function useData(): DataCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('DataProvider eksik')
  return c
}

export function useRepo(): AtlasRepository {
  return useData().repo
}

/** Bütün işlemler (tarihe göre yeniden eskiye). Yükleniyorken undefined. */
export function useTransactions(): Transaction[] | undefined {
  return useContext(LiveCtx).transactions
}

export function useCategories(): Category[] | undefined {
  return useContext(LiveCtx).categories
}

export function useGroups(): SpendGroup[] | undefined {
  return useContext(LiveCtx).groups
}

export function useGroupMap(): Map<string, SpendGroup> {
  const groups = useGroups()
  return useMemo(() => new Map((groups ?? []).map((g) => [g.id, g])), [groups])
}

export function useRules(): Rule[] | undefined {
  const repo = useRepo()
  return useLiveQuery(() => repo.db.rules.toArray(), [repo])
}

export function useImports(): ImportRecord[] | undefined {
  const repo = useRepo()
  return useLiveQuery(() => repo.db.imports.orderBy('importedAt').reverse().toArray(), [repo])
}

export function useSettings(): Settings | undefined {
  return useContext(LiveCtx).settings
}

export function useCategoryMap(): Map<string, Category> {
  const cats = useCategories()
  return useMemo(() => new Map((cats ?? []).map((c) => [c.id, c])), [cats])
}

/** Geçerli grup filtresi; silinmiş bir gruba işaret ediyorsa "tümü"ne döner. */
export function useGroupFilter(): [string, (g: string) => void] {
  const { groupFilter, setGroupFilter } = useUi()
  const groups = useGroups()
  const valid = !groupFilter || groupFilter === 'none' || !groups || groups.some((g) => g.id === groupFilter)
  useEffect(() => {
    if (!valid) setGroupFilter('')
  }, [valid, setGroupFilter])
  return [valid ? groupFilter : '', setGroupFilter]
}

/** Hesap silinince bu cihazdaki o hesaba ait yerel kayıtları da siler. */
export async function clearLocalAccountData(userId: string): Promise<void> {
  await getRealRepo(realDbNameFor(userId)).clearAll()
  if (readPref('dbOwner') === userId) writePref('dbOwner', null)
}
