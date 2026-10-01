import { MotionConfig } from 'motion/react'
import { lazy, Suspense } from 'react'
import { createHashRouter, Outlet, RouterProvider } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { TransactionFormHost } from './components/TransactionForm'
import { Spinner } from './components/ui/primitives'
import DashboardPage from './pages/DashboardPage'
import { AuthScreen, AuthSplash, NewPasswordScreen } from './pages/AuthScreen'
import { AuthProvider, useAuth } from './state/auth'
import { CloudProvider } from './state/cloud'
import { DataProvider } from './state/data'
import { ThemeProvider } from './state/theme'
import { UiProvider } from './state/ui'
import { UpdatePrompt } from './components/UpdatePrompt'

const TransactionsPage = lazy(() => import('./pages/TransactionsPage'))
const ImportPage = lazy(() => import('./pages/import/ImportPage'))
const CategoriesPage = lazy(() => import('./pages/CategoriesPage'))
const ImportHistoryPage = lazy(() => import('./pages/ImportHistoryPage'))
const BackupPage = lazy(() => import('./pages/BackupPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const MembersPage = lazy(() => import('./pages/MembersPage'))
const JoinPage = lazy(() => import('./pages/JoinPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))

function Layout() {
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
          <RouterProvider router={router} />
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
