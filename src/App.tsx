import { MotionConfig } from 'motion/react'
import { lazy, Suspense, useEffect } from 'react'
import { createHashRouter, Outlet, RouterProvider } from 'react-router-dom'
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
  budget: () => import('./pages/BudgetPage'),
  plans: () => import('./pages/PlansPage'),
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
const BudgetPage = lazy(loaders.budget)
const PlansPage = lazy(loaders.plans)

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
      { path: '/butce', element: <BudgetPage /> },
      { path: '/paketler', element: <PlansPage /> },
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
