import { MotionConfig } from 'motion/react'
import { lazy, Suspense, useEffect } from 'react'
import { createHashRouter, Navigate, Outlet, RouterProvider, useLocation } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { TransactionFormHost } from './components/TransactionForm'
import { Spinner } from './components/ui/primitives'
import DashboardPage from './pages/DashboardPage'
import { AuthScreen, AuthSplash, NewPasswordScreen } from './pages/AuthScreen'
import { AuthProvider, useAuth } from './state/auth'
import { CloudProvider } from './state/cloud'
import { DataProvider } from './state/data'
import { PlanProvider } from './state/plan'
import { ThemeProvider } from './state/theme'
import { UiProvider } from './state/ui'
import { UpdatePrompt } from './components/UpdatePrompt'

const loaders = {
  transactions: () => import('./pages/TransactionsPage'),
  import: () => import('./pages/import/ImportPage'),
  categories: () => import('./pages/CategoriesPage'),
  history: () => import('./pages/ImportHistoryPage'),
  backup: () => import('./pages/BackupPage'),
  settings: () => import('./pages/SettingsPage'),
  members: () => import('./pages/MembersPage'),
  join: () => import('./pages/JoinPage'),
  admin: () => import('./pages/AdminPage'),
  research: () => import('./pages/ResearchAdminPage'),
  budget: () => import('./pages/BudgetPage'),
  plans: () => import('./pages/PlansPage'),
  goals: () => import('./pages/GoalsPage'),
  reports: () => import('./pages/ReportsPage'),
  assets: () => import('./pages/AssetsPage'),
  debts: () => import('./pages/DebtsPage'),
  journey: () => import('./pages/JourneyPage'),
  scenarios: () => import('./pages/ScenariosPage'),
  learning: () => import('./pages/LearningPage'),
  coach: () => import('./pages/CoachPage'),
}
const TransactionsPage = lazy(loaders.transactions)
const ImportPage = lazy(loaders.import)
const CategoriesPage = lazy(loaders.categories)
const ImportHistoryPage = lazy(loaders.history)
const BackupPage = lazy(loaders.backup)
const SettingsPage = lazy(loaders.settings)
const MembersPage = lazy(loaders.members)
const JoinPage = lazy(loaders.join)
const AdminPage = lazy(loaders.admin)
const ResearchAdminPage = lazy(loaders.research)
const BudgetPage = lazy(loaders.budget)
const PlansPage = lazy(loaders.plans)
const GoalsPage = lazy(loaders.goals)
const ReportsPage = lazy(loaders.reports)
const AssetsPage = lazy(loaders.assets)
const DebtsPage = lazy(loaders.debts)
const JourneyPage = lazy(loaders.journey)
const ScenariosPage = lazy(loaders.scenarios)
const LearningPage = lazy(loaders.learning)
const CoachPage = lazy(loaders.coach)

/** Uygulama açıldıktan sonra boşta kalınca bütün sayfalar önceden yüklenir; geçişte bekleme olmaz. */
function usePrefetchPages() {
  useEffect(() => {
    const run = () => {
      for (const load of Object.values(loaders)) void load().catch(() => {})
    }
    // Safari'de requestIdleCallback yok
    if (typeof window.requestIdleCallback !== 'function') {
      const t = setTimeout(run, 1200)
      return () => clearTimeout(t)
    }
    const id = window.requestIdleCallback(run, { timeout: 2500 })
    return () => window.cancelIdleCallback(id)
  }, [])
}

function Layout() {
  usePrefetchPages()
  return (
    <AppShell>
      <Suspense
        fallback={
          <div className="grid min-h-[40vh] place-items-center">
            <Spinner className="size-7" />
          </div>
        }
      >
        <Outlet />
      </Suspense>
      <TransactionFormHost />
      <UpdatePrompt />
    </AppShell>
  )
}

function NotFound() {
  return (
    <div className="py-20 text-center">
      <h1 className="text-2xl font-bold">Sayfa bulunamadı</h1>
      <a href="#/" className="mt-4 inline-block text-accent hover:underline">
        Panele dön
      </a>
    </div>
  )
}

/** Eski "Varlıklarım" bağlantıları Yatırımlarım'a gider. */
/** Düzenli ödemeler artık Borçlarım sayfasının bir bölümü. */
function OldPaymentsRoute() {
  const { search } = useLocation()
  const p = new URLSearchParams(search)
  p.set('bolum', 'odemeler')
  return <Navigate to={`/borclar?${p.toString()}`} replace />
}

function OldAssetsRoute() {
  const { search } = useLocation()
  return <Navigate to={`/yatirimlar${search}`} replace />
}

const router = createHashRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <DashboardPage /> },
      { path: '/islemler', element: <TransactionsPage /> },
      { path: '/ice-aktar', element: <ImportPage /> },
      { path: '/kategoriler', element: <CategoriesPage /> },
      { path: '/aktarimlar', element: <ImportHistoryPage /> },
      { path: '/yedekleme', element: <BackupPage /> },
      { path: '/uyeler', element: <MembersPage /> },
      { path: '/katil', element: <JoinPage /> },
      { path: '/ayarlar', element: <SettingsPage /> },
      { path: '/yonetim', element: <AdminPage /> },
      { path: '/yonetim/arastirma', element: <ResearchAdminPage /> },
      { path: '/butce', element: <BudgetPage /> },
      { path: '/paketler', element: <PlansPage /> },
      { path: '/odemeler', element: <OldPaymentsRoute /> },
      { path: '/hedefler', element: <GoalsPage /> },
      { path: '/raporlar', element: <ReportsPage /> },
      { path: '/yatirimlar', element: <AssetsPage /> },
      { path: '/varliklar', element: <OldAssetsRoute /> },
      { path: '/borclar', element: <DebtsPage /> },
      { path: '/yolculuk', element: <JourneyPage /> },
      { path: '/senaryolar', element: <ScenariosPage /> },
      { path: '/ogren', element: <LearningPage /> },
      { path: '/koc', element: <CoachPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
])

/** Hesapla giriş açıksa oturum açılmadan uygulama gösterilmez; her hesabın kayıtları ayrıdır. */
function AuthGate() {
  const auth = useAuth()
  if (!auth.ready) return <AuthSplash />
  if (auth.enabled && !auth.user) return <AuthScreen />
  if (auth.recovery) return <NewPasswordScreen />
  return (
    <DataProvider key={auth.user?.id ?? 'local'} userId={auth.user?.id}>
      <UiProvider>
        <CloudProvider>
          <PlanProvider>
            <RouterProvider router={router} />
          </PlanProvider>
        </CloudProvider>
      </UiProvider>
    </DataProvider>
  )
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
      </ThemeProvider>
    </MotionConfig>
  )
}
