import { useLiveQuery } from 'dexie-react-hooks'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createDb, DEMO_DB_NAME, REAL_DB_NAME } from '../data/db'
import { AtlasRepository } from '../data/repository'
import type { Category, ImportRecord, Rule, Settings, Transaction } from '../domain/types'
import { readPref, writePref } from './prefs'

interface DataCtx {
  repo: AtlasRepository
  isDemo: boolean
  setDemo: (on: boolean) => void
  dbError: string | null
}

const Ctx = createContext<DataCtx | null>(null)

const realRepo = new AtlasRepository(createDb(REAL_DB_NAME), false)
let demoRepo: AtlasRepository | null = null
function getDemoRepo() {
  demoRepo ??= new AtlasRepository(createDb(DEMO_DB_NAME), true)
  return demoRepo
}

/**
 * Gerçek veriler ve demo verileri ayrı IndexedDB veritabanlarındadır; demo modu açılınca
 * bütün ekranlar demo deposuna bağlanır, gerçek kayıtlara dokunulmaz.
 */
export function DataProvider({ children }: { children: ReactNode }) {
  const [isDemo, setIsDemo] = useState(() => readPref('demo') === '1')
  const [dbError, setDbError] = useState<string | null>(null)
  const repo = isDemo ? getDemoRepo() : realRepo

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
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
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
  const repo = useRepo()
  return useLiveQuery(() => repo.allTransactions(), [repo])
}

export function useCategories(): Category[] | undefined {
  const repo = useRepo()
  return useLiveQuery(() => repo.db.categories.orderBy('order').toArray(), [repo])
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
  const repo = useRepo()
  return useLiveQuery(() => repo.getSettings(), [repo])
}

export function useCategoryMap(): Map<string, Category> {
  const cats = useCategories()
  return useMemo(() => new Map((cats ?? []).map((c) => [c.id, c])), [cats])
}
