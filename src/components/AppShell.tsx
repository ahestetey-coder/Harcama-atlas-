import { AnimatePresence, motion } from 'motion/react'
import { ChartColumn, Database, FileUp, FlaskConical, History, LayoutDashboard, LayoutGrid, ListOrdered, LogOut, Menu, Moon, PiggyBank, Plus, Repeat, Settings, ShieldCheck, Sparkles, Sun, Tags, Target, Users } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { APP_CONFIG } from '../config/app'
import { cn } from '../lib/cn'
import { useAuth } from '../state/auth'
import { useIsAdmin } from '../state/admin'
import { useFollowCurrentPeriod } from '../state/cycle'
import { useTheme } from '../state/theme'
import { useData } from '../state/data'
import { useUi } from '../state/ui'
import { QuickAddSheet } from './QuickAdd'
import { Modal } from './ui/Modal'
import { Alert, Button, IconButton } from './ui/primitives'

const NAV = [
  { to: '/', label: 'Panel', icon: LayoutDashboard, end: true },
  { to: '/islemler', label: 'İşlemler', icon: ListOrdered },
  { to: '/ice-aktar', label: 'İçe aktar', icon: FileUp },
  { to: '/kategoriler', label: 'Kategoriler ve gruplar', short: 'Kategoriler', icon: Tags },
  { to: '/butce', label: 'Bütçe planı', short: 'Bütçe', icon: Target },
  { to: '/odemeler', label: 'Düzenli ödemeler', short: 'Ödemeler', icon: Repeat },
  { to: '/hedefler', label: 'Birikim hedefleri', short: 'Hedefler', icon: PiggyBank },
  { to: '/raporlar', label: 'Raporlar', icon: ChartColumn },
  { to: '/aktarimlar', label: 'Aktarım geçmişi', short: 'Aktarımlar', icon: History },
  { to: '/uyeler', label: 'Üyeler ve paylaşım', short: 'Üyeler', icon: Users },
  { to: '/yedekleme', label: 'Yedekleme ve veri', short: 'Yedekleme', icon: Database },
  { to: '/ayarlar', label: 'Ayarlar', icon: Settings },
  { to: '/paketler', label: 'Paketler', icon: Sparkles },
]
/** "Daha fazla" menüsündeki sayfalar (alt menüde sekmesi olmayanlar). */
const MORE_PATHS = [...NAV.slice(3).map((n) => n.to), '/yonetim']
const ADMIN_NAV = { to: '/yonetim', label: 'Yönetici paneli', short: 'Yönetim', icon: ShieldCheck, end: false }

export function Logo({ className }: { className?: string }) {
  // Her logo kendi gradyan kimliğini kullanır; gizli bir kopyaya başvurursa mobilde boş görünür.
  const gid = useId().replace(/:/g, '')
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <svg viewBox="0 0 64 64" className="size-9 shrink-0" aria-hidden>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#10b981" />
            <stop offset="1" stopColor="#06b6d4" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="16" fill="#0b1220" />
        <circle cx="32" cy="32" r="18" fill="none" stroke={`url(#${gid})`} strokeWidth="5" />
        <path d="M32 14 A18 18 0 0 1 50 32 L32 32 Z" fill={`url(#${gid})`} />
      </svg>
      <div className="min-w-0 leading-tight">
        <div className="truncate font-display text-[16px] font-bold tracking-tight text-ink">{APP_CONFIG.name}</div>
        <div className="truncate text-[11.5px] text-subtle">Kişisel gider takibi</div>
      </div>
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const { isDemo, setDemo, dbError } = useData()
  const { openTransactionForm } = useUi()
  const location = useLocation()
  const navigate = useNavigate()
  const [moreOpen, setMoreOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  useFollowCurrentPeriod()
  const admin = useIsAdmin()
  const nav = admin ? [...NAV, ADMIN_NAV] : NAV

  return (
    <div className="min-h-dvh lg:pl-[272px]">
      <a href="#main" className="sr-only z-[80] rounded-lg bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        İçeriğe geç
      </a>
      {/* Masaüstü yan menü */}
      <aside className="glass fixed inset-y-0 left-0 z-30 hidden w-[272px] flex-col border-r border-line px-4 py-5 lg:flex">
        <div className="flex items-center justify-between gap-2 pl-2">
          <Logo className="min-w-0" />
          <ThemeToggle />
        </div>
        <div className="mt-6 flex gap-2">
          <Button variant="primary" size="lg" className="flex-1" icon={<Plus className="size-5" />} onClick={() => openTransactionForm()}>
            Gider ekle
          </Button>
          <IconButton label="Diğer ekleme seçenekleri" className="size-12 rounded-xl border border-line bg-surface shadow-card" onClick={() => setAddOpen(true)}>
            <LayoutGrid className="size-5" />
          </IconButton>
        </div>
        <nav aria-label="Ana menü" className="mt-6 flex flex-col gap-0.5">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cn(
                  'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-colors duration-150',
                  isActive ? 'text-ink' : 'text-muted hover:bg-surface-2 hover:text-ink',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span layoutId="nav-active" className="absolute inset-0 rounded-xl border border-line bg-surface shadow-card" transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }} />
                  )}
                  <n.icon className={cn('relative size-[18px]', isActive && 'text-accent')} />
                  <span className="relative">{n.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-3">
          {isDemo && (
            <div className="rounded-2xl border border-warning/30 bg-warning-soft p-3 text-[12.5px] text-ink">
              <div className="flex items-center gap-1.5 font-semibold text-warning">
                <FlaskConical className="size-4" /> Demo modu açık
              </div>
              <p className="mt-1 text-muted">Örnek verileri görüyorsunuz. Gerçek kayıtlarınız ayrı saklanır.</p>
              <button type="button" className="mt-2 font-semibold text-accent hover:underline" onClick={() => setDemo(false)}>
                Demo modunu kapat
              </button>
            </div>
          )}
          <AccountBox />
          <p className="px-2 text-[11.5px] leading-relaxed text-subtle">Veriler bu tarayıcıda saklanır. Yalnızca paylaşıma açtığınız gruptaki harcamalar üyelerle eşitlenir.</p>
        </div>
      </aside>

      {/* Mobil üst çubuk */}
      <header className="glass sticky top-0 z-30 flex items-center justify-between border-b border-line px-4 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] lg:hidden">
        <Logo />
        <div className="flex items-center gap-2">
          {isDemo && (
            <button type="button" onClick={() => setDemo(false)} className="rounded-full bg-warning-soft px-2.5 py-1 text-[12px] font-semibold text-warning">
              Demo · kapat
            </button>
          )}
          <ThemeToggle />
        </div>
      </header>

      {isDemo && (
        <div className="hidden border-b border-warning/25 bg-warning-soft px-6 py-2 text-center text-[13px] text-ink lg:block">
          <FlaskConical className="mr-1.5 inline size-4 text-warning" />
          Demo modu: gösterilen kayıtlar örnektir ve gerçek verilerinize karışmaz.
        </div>
      )}

      <main id="main" className="mx-auto w-full max-w-[1180px] px-4 pb-32 pt-4 sm:px-6 lg:px-8 lg:pb-12 lg:pt-7">
        {dbError && (
          <Alert tone="danger" title="Veritabanı açılamadı" className="mb-4">
            {dbError}
          </Alert>
        )}
        {/* Yeni sayfa beklemeden açılır; yalnızca kısa bir giriş animasyonu (çıkış beklenmez) */}
        <div key={location.pathname} className="page-in">
          {children}
        </div>
      </main>

      {/* Mobil alt gezinme */}
      <nav aria-label="Alt menü" className="glass safe-bottom hide-on-kb fixed inset-x-0 bottom-0 z-40 border-t border-line lg:hidden">
        <div className="relative mx-auto grid max-w-md grid-cols-5 items-end px-2 pt-1.5">
          {[NAV[0], NAV[1]].map((n) => (
            <MobileTab key={n.to} to={n.to} end={n.end} icon={<n.icon className="size-[22px]" />} label={n.short ?? n.label} />
          ))}
          <div className="flex justify-center">
            <motion.button
              type="button"
              onClick={() => setAddOpen(true)}
              aria-label="Ekle"
              aria-haspopup="dialog"
              whileTap={{ scale: 0.92 }}
              animate={{ rotate: addOpen ? 45 : 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 28 }}
              className="-mt-6 grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-[0_12px_28px_-8px_rgb(5_150_105/0.8)] ring-4 ring-bg"
            >
              <Plus className="size-7" />
            </motion.button>
          </div>
          <MobileTab to="/ice-aktar" icon={<FileUp className="size-[22px]" />} label="İçe aktar" />
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={cn(
              'pressable relative flex flex-col items-center gap-0.5 rounded-xl pb-2 pt-1 text-[11px] font-medium',
              MORE_PATHS.some((p) => location.pathname.startsWith(p)) ? 'text-accent' : 'text-muted',
            )}
          >
            {MORE_PATHS.some((p) => location.pathname.startsWith(p)) && <TabIndicator />}
            <Menu className="size-[22px]" />
            Daha fazla
          </button>
        </div>
      </nav>
      <QuickAddSheet open={addOpen} onOpenChange={setAddOpen} />
      <Modal open={moreOpen} onOpenChange={setMoreOpen} title="Menü" size="sm">
        <div className="grid grid-cols-2 gap-2 pb-2">
          {nav.slice(3).map((n) => (
            <button
              key={n.to}
              type="button"
              onClick={() => {
                setMoreOpen(false)
                navigate(n.to)
              }}
              className="pressable flex flex-col items-start gap-3 rounded-2xl border border-line bg-surface-2 p-4 text-left text-sm font-medium text-ink transition-colors hover:border-line-strong"
            >
              <n.icon className="size-5 text-accent" />
              {n.label}
            </button>
          ))}
        </div>
        <AccountBox className="mt-2 mb-2" />
      </Modal>
    </div>
  )
}

/** Açık/koyu tema arasında geçiş (Ayarlar'da "sistem" seçeneği de var). */
function ThemeToggle() {
  const { resolved, setPreference } = useTheme()
  const dark = resolved === 'dark'
  return (
    <button
      type="button"
      onClick={() => setPreference(dark ? 'light' : 'dark')}
      aria-label={dark ? 'Açık temaya geç' : 'Koyu temaya geç'}
      title={dark ? 'Açık tema' : 'Koyu tema'}
      className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-surface text-muted shadow-card transition-colors hover:text-ink"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={dark ? 'moon' : 'sun'}
          initial={{ y: 12, opacity: 0, rotate: -40 }}
          animate={{ y: 0, opacity: 1, rotate: 0 }}
          exit={{ y: -12, opacity: 0, rotate: 40 }}
          transition={{ duration: 0.2 }}
          className="grid place-items-center"
        >
          {dark ? <Moon className="size-[18px]" /> : <Sun className="size-[18px]" />}
        </motion.span>
      </AnimatePresence>
    </button>
  )
}

/** Giriş yapılan hesap ve çıkış düğmesi (hesapla giriş açıksa). */
function AccountBox({ className }: { className?: string }) {
  const auth = useAuth()
  const [confirm, setConfirm] = useState(false)
  if (!auth.enabled || !auth.user) return null
  return (
    <div className={cn('flex items-center gap-2 rounded-2xl border border-line bg-surface-2 py-2 pl-3 pr-1.5', className)}>
      <div className="min-w-0 flex-1 text-[12.5px]">
        <div className="truncate font-semibold text-ink">{auth.user.name ?? 'Hesabım'}</div>
        <div className="truncate text-subtle">{auth.user.email}</div>
      </div>
      <button
        type="button"
        onClick={() => setConfirm(true)}
        className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[12.5px] font-semibold text-muted hover:bg-surface hover:text-ink"
      >
        <LogOut className="size-4" /> Çıkış
      </button>
      <Modal open={confirm} onOpenChange={setConfirm} title="Çıkış yapılsın mı?" size="sm">
        <p className="text-sm text-muted">Kayıtlarınız bu cihazda kalır; aynı hesapla tekrar girdiğinizde kaldığınız yerden devam edersiniz.</p>
        <div className="mt-5 flex justify-end gap-2 pb-1">
          <Button onClick={() => setConfirm(false)}>Vazgeç</Button>
          <Button variant="primary" icon={<LogOut className="size-4" />} onClick={() => void auth.signOut()}>
            Çıkış yap
          </Button>
        </div>
      </Modal>
    </div>
  )
}

function MobileTab({ to, end, icon, label }: { to: string; end?: boolean; icon: ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => cn('pressable relative flex flex-col items-center gap-0.5 rounded-xl pb-2 pt-1 text-[11px] font-medium transition-colors', isActive ? 'text-accent' : 'text-muted')}
    >
      {({ isActive }) => (
        <>
          {isActive && <TabIndicator />}
          {icon}
          {label}
        </>
      )}
    </NavLink>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between lg:mb-7">
      <div className="min-w-0">
        <h1 className="text-[26px] font-bold leading-tight tracking-tight text-ink lg:text-[30px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[13.5px] leading-snug text-muted sm:text-sm">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 max-sm:w-full">{actions}</div>}
    </div>
  )
}

/** Alt menüde etkin sekmenin üstündeki çizgi; sekmeler arasında kayarak geçer. */
function TabIndicator() {
  return (
    <motion.span
      layoutId="tab-active"
      className="absolute -top-1.5 left-1/2 h-[3px] w-7 -translate-x-1/2 rounded-full bg-accent"
      transition={{ type: 'spring', stiffness: 520, damping: 38 }}
      aria-hidden
    />
  )
}
