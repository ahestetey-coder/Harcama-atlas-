import { AnimatePresence, motion } from 'motion/react'
import { BookOpen, Bot, ChartColumn, CreditCard, Database, FlaskConical, History, LayoutDashboard, ListOrdered, LogOut, Menu, Mountain, Moon, PiggyBank, Plus, Receipt, Settings, ShieldCheck, Sparkles, Sun, Tags, Target, TrendingUp, Users, Wallet, type LucideIcon } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { APP_CONFIG } from '../config/app'
import { cn } from '../lib/cn'
import { useAuth } from '../state/auth'
import { useIsAdmin } from '../state/admin'
import { useFollowCurrentPeriod } from '../state/cycle'
import { useLivePriceSync } from '../state/livePrices'
import { usePlan } from '../state/plan'
import { useTheme } from '../state/theme'
import { useData } from '../state/data'
import { useUi } from '../state/ui'
import { ImportSheet } from './ImportSheet'
import { QuickAddSheet } from './QuickAdd'
import { Modal } from './ui/Modal'
import { Alert, Button, IconButton } from './ui/primitives'

interface NavItem {
  to: string
  label: string
  /** Alt menü ve dar alanlar için kısa ad. */
  short?: string
  icon: LucideIcon
  end?: boolean
  /** Menüdeki simge kutusunun rengi. */
  tone: string
}

const ITEMS = {
  home: { to: '/', label: 'Özet', icon: LayoutDashboard, end: true, tone: 'from-emerald-500 to-teal-600' },
  txs: { to: '/islemler', label: 'İşlemler', icon: ListOrdered, tone: 'from-sky-500 to-blue-600' },
  categories: { to: '/kategoriler', label: 'Kategoriler ve gruplar', short: 'Kategoriler', icon: Tags, tone: 'from-teal-500 to-cyan-600' },
  budget: { to: '/butce', label: 'Bütçe planı', short: 'Bütçe', icon: Target, tone: 'from-amber-500 to-orange-600' },
  goals: { to: '/hedefler', label: 'Birikim hedefleri', short: 'Hedefler', icon: PiggyBank, tone: 'from-pink-500 to-rose-600' },
  reports: { to: '/raporlar', label: 'Raporlar', icon: ChartColumn, tone: 'from-indigo-500 to-blue-700' },
  assets: { to: '/yatirimlar', label: 'Yatırımlarım', short: 'Yatırım', icon: Wallet, tone: 'from-emerald-600 to-green-700' },
  debts: { to: '/borclar', label: 'Borçlar ve ödemeler', short: 'Borçlar', icon: CreditCard, tone: 'from-rose-500 to-red-600' },
  coach: { to: '/koc', label: 'Koçum', short: 'Koç', icon: Bot, tone: 'from-cyan-500 to-emerald-500' },
  journey: { to: '/yolculuk', label: 'Finansal yolculuğum', short: 'Yolculuğum', icon: Mountain, tone: 'from-orange-500 to-red-600' },
  scenarios: { to: '/senaryolar', label: 'Gelecek senaryoları', short: 'Senaryolar', icon: TrendingUp, tone: 'from-fuchsia-500 to-purple-600' },
  learning: { to: '/ogren', label: 'Finansal bilgi', short: 'Bilgi', icon: BookOpen, tone: 'from-yellow-500 to-amber-600' },
  members: { to: '/uyeler', label: 'Üyeler ve paylaşım', short: 'Üyeler', icon: Users, tone: 'from-fuchsia-500 to-pink-600' },
  history: { to: '/aktarimlar', label: 'Aktarım geçmişi', short: 'Aktarımlar', icon: History, tone: 'from-slate-500 to-slate-700' },
  backup: { to: '/yedekleme', label: 'Yedekleme ve veri', short: 'Yedekleme', icon: Database, tone: 'from-slate-500 to-slate-700' },
  settings: { to: '/ayarlar', label: 'Ayarlar', icon: Settings, tone: 'from-slate-500 to-slate-700' },
  plans: { to: '/paketler', label: 'Paketler', icon: Sparkles, tone: 'from-amber-400 to-pink-500' },
  admin: { to: '/yonetim', label: 'Yönetici paneli', short: 'Yönetim', icon: ShieldCheck, tone: 'from-rose-500 to-red-700' },
} satisfies Record<string, NavItem>

/** Kenar menüsü ve "Menü" penceresindeki bölümler. */
const SECTIONS: Array<{ title: string; items: NavItem[] }> = [
  { title: 'Günlük', items: [ITEMS.home, ITEMS.txs, ITEMS.categories] },
  { title: 'Planlama', items: [ITEMS.budget, ITEMS.debts, ITEMS.goals, ITEMS.reports] },
  { title: 'Yatırım ve gelecek', items: [ITEMS.journey, ITEMS.assets, ITEMS.coach, ITEMS.scenarios, ITEMS.learning] },
  { title: 'Hesap ve veri', items: [ITEMS.members, ITEMS.history, ITEMS.backup, ITEMS.settings, ITEMS.plans] },
]
/** Mobil alt menüdeki sekmeler ("+" düğmesinin solu ve sağı). */
const DOCK_LEFT: NavItem[] = [ITEMS.home, ITEMS.txs, ITEMS.budget]
const DOCK_RIGHT: NavItem[] = [ITEMS.assets, ITEMS.coach]
const DOCK_PATHS = [...DOCK_LEFT, ...DOCK_RIGHT].map((n) => n.to)

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
  const { openTransactionForm, importOpen, formState } = useUi()
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  useFollowCurrentPeriod()
  // Varlık fiyatları hangi sayfada olunursa olsun kendiliğinden güncellenir
  useLivePriceSync(usePlan().has('assets') && !isDemo)
  const admin = useIsAdmin()
  const sections: typeof SECTIONS = admin ? [...SECTIONS.slice(0, -1), { ...SECTIONS[SECTIONS.length - 1], items: [...SECTIONS[SECTIONS.length - 1].items, ITEMS.admin] }] : SECTIONS
  const inMenu = !DOCK_PATHS.some((p) => (p === '/' ? location.pathname === '/' : location.pathname.startsWith(p)))
  // Alttan bir pencere açıkken sayfa hafifçe geriye çekilir (mobil)
  const depth = addOpen || moreOpen || importOpen || formState.open

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
          <Button variant="primary" size="lg" className="flex-1" icon={<Plus className="size-5" />} onClick={() => setAddOpen(true)}>
            Yeni ekle
          </Button>
          <IconButton label="Gider ekle" className="size-12 rounded-xl border border-line bg-surface shadow-card" onClick={() => openTransactionForm()}>
            <Receipt className="size-5" />
          </IconButton>
        </div>
        <nav aria-label="Ana menü" className="-mx-1 mt-5 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1 pb-2">
          {sections.map((sec) => (
            <div key={sec.title} className="flex flex-col gap-0.5">
              <div className="px-3 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-subtle">{sec.title}</div>
              {sec.items.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  className={({ isActive }) =>
                    cn(
                      'relative flex shrink-0 items-center gap-3 rounded-xl px-3 py-2 text-[14px] font-medium transition-colors duration-150',
                      isActive ? 'text-ink' : 'text-muted hover:bg-surface-2 hover:text-ink',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.span layoutId="nav-active" className="absolute inset-0 rounded-xl border border-line bg-surface shadow-card" transition={{ type: 'spring', stiffness: 480, damping: 36 }} />
                      )}
                      <span className={cn('relative grid size-7 place-items-center rounded-lg transition-colors', isActive ? cn('bg-gradient-to-br text-white shadow-card', n.tone) : 'text-muted')}>
                        <n.icon className="size-[17px]" />
                      </span>
                      <span className="relative">{n.label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="shrink-0 space-y-3 pt-3">
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

      <main id="main" className={cn('app-depth mx-auto w-full max-w-[1180px] px-4 pb-36 pt-4 sm:px-6 lg:px-8 lg:pb-12 lg:pt-7', depth && 'app-depth-on')}>
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

      {/* Mobil alt menü: yüzen çubuk */}
      <nav aria-label="Alt menü" className="hide-on-kb pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] lg:hidden">
        <div className="dock pointer-events-auto relative mx-auto grid max-w-md grid-cols-7 items-end rounded-[26px] border border-line-strong px-1 pb-1 pt-1.5 shadow-float">
          {DOCK_LEFT.map((n) => (
            <MobileTab key={n.to} item={n} />
          ))}
          <div className="flex justify-center">
            <motion.button
              type="button"
              onClick={() => setAddOpen(true)}
              aria-label="Ekle"
              aria-haspopup="dialog"
              whileTap={{ scale: 0.9 }}
              animate={{ rotate: addOpen ? 45 : 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 26 }}
              className="plus-glow relative -mt-7 grid size-[52px] place-items-center rounded-[18px] bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 text-white ring-4 ring-bg"
            >
              <Plus className="size-7" strokeWidth={2.4} />
            </motion.button>
          </div>
          {DOCK_RIGHT.map((n) => (
            <MobileTab key={n.to} item={n} />
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            className={cn('pressable relative flex flex-col items-center gap-0.5 rounded-2xl pb-1 pt-1.5 text-[10.5px] font-medium', inMenu ? 'text-accent' : 'text-muted')}
          >
            {inMenu && <TabIndicator />}
            <Menu className="relative size-[21px]" />
            <span className="relative">Menü</span>
          </button>
        </div>
      </nav>
      <QuickAddSheet open={addOpen} onOpenChange={setAddOpen} />
      <ImportSheet />
      <Modal open={moreOpen} onOpenChange={setMoreOpen} title="Menü" size="md">
        <div className="flex flex-col gap-5 pb-2">
          {sections.map((sec, si) => (
            <section key={sec.title} aria-label={sec.title}>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-subtle">{sec.title}</h3>
              <div className="grid grid-cols-3 gap-2">
                {sec.items.map((n, i) => (
                  <MenuTile key={n.to} item={n} delay={0.025 * (si * 4 + i)} onGo={() => setMoreOpen(false)} />
                ))}
              </div>
            </section>
          ))}
          <AccountBox />
        </div>
      </Modal>
    </div>
  )
}

/** "Menü" penceresinde bir sayfa kutusu. */
function MenuTile({ item, delay, onGo }: { item: NavItem; delay: number; onGo: () => void }) {
  const navigate = useNavigate()
  const location = useLocation()
  const active = item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
      whileTap={{ scale: 0.95 }}
      onClick={() => {
        onGo()
        navigate(item.to)
      }}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-2xl border px-1.5 py-3 text-center transition-colors',
        active ? 'border-accent/40 bg-accent-soft' : 'border-line bg-surface-2 hover:border-line-strong hover:bg-surface-3',
      )}
    >
      <span className={cn('grid size-10 place-items-center rounded-xl bg-gradient-to-br text-white shadow-card', item.tone)}>
        <item.icon className="size-5" />
      </span>
      <span className="text-[12.5px] font-semibold leading-tight text-ink">{item.label}</span>
    </motion.button>
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

function MobileTab({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) => cn('pressable relative flex flex-col items-center gap-0.5 rounded-2xl pb-1 pt-1.5 text-[10.5px] font-medium transition-colors', isActive ? 'text-accent' : 'text-muted')}
    >
      {({ isActive }) => (
        <>
          {isActive && <TabIndicator />}
          <motion.span className="relative" animate={{ y: isActive ? -1 : 0, scale: isActive ? 1.08 : 1 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }}>
            <item.icon className="size-[21px]" strokeWidth={isActive ? 2.3 : 2} />
          </motion.span>
          <span className={cn('relative max-w-full truncate', isActive && 'font-semibold')}>{item.short ?? item.label}</span>
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

/** Alt menüde etkin sekmenin arkasındaki parlak zemin; sekmeler arasında kayarak geçer. */
function TabIndicator() {
  return (
    <motion.span
      layoutId="tab-active"
      className="absolute inset-x-0.5 inset-y-0 rounded-2xl bg-accent-soft"
      transition={{ type: 'spring', stiffness: 520, damping: 38 }}
      aria-hidden
    />
  )
}
