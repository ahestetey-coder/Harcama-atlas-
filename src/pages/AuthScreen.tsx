import { AnimatePresence, motion, type Variants } from 'motion/react'
import { ArrowLeft, ChartPie, Eye, EyeOff, FileUp, KeyRound, LockKeyhole, Mail, ShieldCheck, Users } from 'lucide-react'
import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { Logo } from '../components/AppShell'
import { Button, Field, Input, Spinner } from '../components/ui/primitives'
import { UserFacingError } from '../data/repository'
import { cn } from '../lib/cn'
import { useAuth } from '../state/auth'
import { APP_CONFIG } from '../config/app'

type Mode = 'signin' | 'signup' | 'reset'

const EASE = [0.2, 0.8, 0.2, 1] as const

function errText(e: unknown): string {
  return e instanceof UserFacingError ? e.message : 'Bir sorun oluştu. Bağlantınızı kontrol edip tekrar deneyin.'
}

/** Hesap sunucusu yanıt verene kadar gösterilen ekran. */
export function AuthSplash() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3, ease: EASE }} className="flex flex-col items-center gap-4">
        <Logo />
        <Spinner className="size-6" />
      </motion.div>
    </div>
  )
}

/** Yavaşça süzülen renkli ışık lekeleri (hareket azaltma tercihinde durur). */
function AuroraBackground() {
  const blobs = [
    { className: 'left-[-10%] top-[-15%] size-[42rem] bg-emerald-400/25 dark:bg-emerald-500/20', x: [0, 60, -20, 0], y: [0, 40, 80, 0], d: 22 },
    { className: 'right-[-15%] top-[10%] size-[36rem] bg-cyan-400/20 dark:bg-cyan-500/15', x: [0, -50, 30, 0], y: [0, 60, -30, 0], d: 26 },
    { className: 'bottom-[-20%] left-[25%] size-[38rem] bg-teal-300/20 dark:bg-teal-600/15', x: [0, 40, -50, 0], y: [0, -50, 20, 0], d: 30 },
  ]
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      {blobs.map((b, i) => (
        <motion.div
          key={i}
          className={cn('absolute rounded-full blur-3xl', b.className)}
          animate={{ x: b.x, y: b.y }}
          transition={{ duration: b.d, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgb(15_23_42/0.06)_1px,transparent_0)] [background-size:24px_24px] dark:bg-[radial-gradient(circle_at_1px_1px,rgb(255_255_255/0.05)_1px,transparent_0)]" />
    </div>
  )
}

const DONUT = [
  { pct: 38, color: '#10b981', label: 'Market', start: 0 },
  { pct: 24, color: '#06b6d4', label: 'Faturalar', start: 38 },
  { pct: 18, color: '#f59e0b', label: 'Akaryakıt', start: 62 },
  { pct: 20, color: '#8b5cf6', label: 'Diğer', start: 80 },
]

/** Masaüstünde formun yanındaki tanıtım paneli: canlanan halka grafik ve süzülen kartlar. */
function HeroPanel() {
  const r = 52
  const c = 2 * Math.PI * r
  return (
    <div className="relative hidden overflow-hidden rounded-[2rem] bg-[#0b1220] p-10 text-white shadow-2xl lg:flex lg:flex-col">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(600px_400px_at_80%_0%,rgb(16_185_129/0.28),transparent_60%),radial-gradient(500px_400px_at_0%_100%,rgb(6_182_212/0.22),transparent_60%)]" />
      <motion.div
        aria-hidden
        className="absolute -right-24 -top-24 size-72 rounded-full border border-white/10"
        animate={{ rotate: 360 }}
        transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
      >
        <span className="absolute left-1/2 top-0 size-2 -translate-x-1/2 rounded-full bg-emerald-300 shadow-[0_0_16px_4px_rgb(110_231_183/0.6)]" />
      </motion.div>

      <div className="relative">
        <motion.h2 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.5, ease: EASE }} className="font-display text-[2rem] font-bold leading-tight tracking-tight">
          Harcamalarınız,
          <br />
          <span className="bg-gradient-to-r from-emerald-300 via-teal-200 to-cyan-300 bg-clip-text text-transparent">tek bakışta.</span>
        </motion.h2>
        <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.5, ease: EASE }} className="mt-3 max-w-sm text-[15px] leading-relaxed text-white/70">
          Ekstrenizi yükleyin, giderleriniz kategorilere ayrılsın; ortak harcamaları ailenizle birlikte takip edin.
        </motion.p>
      </div>

      <div className="relative mt-10 flex flex-1 items-center justify-center">
        {/* Halka grafik */}
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3, duration: 0.6, ease: EASE }} className="relative">
          <svg viewBox="0 0 140 140" className="size-56 -rotate-90">
            <circle cx="70" cy="70" r={r} fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="14" />
            {DONUT.map((s, i) => {
              const len = (s.pct / 100) * c
              const dashOffset = -(s.start / 100) * c
              return (
                <motion.circle
                  key={s.label}
                  cx="70"
                  cy="70"
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="14"
                  strokeLinecap="butt"
                  strokeDashoffset={dashOffset}
                  initial={{ strokeDasharray: `0 ${c}` }}
                  animate={{ strokeDasharray: `${Math.max(0, len - 2)} ${c}` }}
                  transition={{ delay: 0.5 + i * 0.18, duration: 0.7, ease: EASE }}
                />
              )
            })}
          </svg>
          <div className="absolute inset-0 grid place-items-center text-center">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-white/50">Eylül</div>
              <div className="font-display text-2xl font-bold">12.480 ₺</div>
            </div>
          </div>
        </motion.div>

        {/* Süzülen kartlar */}
        <FloatCard className="left-0 top-2" delay={0.9} float={[0, -10, 0]}>
          <span className="grid size-8 place-items-center rounded-xl bg-emerald-400/15 text-emerald-300">
            <FileUp className="size-4" />
          </span>
          <div>
            <div className="text-[12.5px] font-semibold">Ekstre okundu</div>
            <div className="text-[11.5px] text-white/60">46 işlem · 3 iade</div>
          </div>
        </FloatCard>
        <FloatCard className="bottom-6 right-0" delay={1.1} float={[0, 10, 0]}>
          <span className="grid size-8 place-items-center rounded-xl bg-violet-400/15 text-violet-300">
            <Users className="size-4" />
          </span>
          <div>
            <div className="text-[12.5px] font-semibold">Ayşe ortak gider ekledi</div>
            <div className="text-[11.5px] text-white/60">Elektrik faturası · 450 ₺</div>
          </div>
        </FloatCard>
        <FloatCard className="bottom-0 left-4" delay={1.3} float={[0, -8, 0]}>
          <span className="grid size-8 place-items-center rounded-xl bg-cyan-400/15 text-cyan-300">
            <ChartPie className="size-4" />
          </span>
          <div>
            <div className="text-[12.5px] font-semibold">Market %38</div>
            <div className="text-[11.5px] text-white/60">Geçen aya göre −%6</div>
          </div>
        </FloatCard>
      </div>

      <ul className="relative mt-8 flex flex-wrap gap-2 text-[12.5px] text-white/75">
        {['PDF ve fotoğraftan okuma', 'Kişisel ve ortak gruplar', 'Veriler cihazınızda'].map((t, i) => (
          <motion.li
            key={t}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.4 + i * 0.1, duration: 0.4, ease: EASE }}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 backdrop-blur"
          >
            {t}
          </motion.li>
        ))}
      </ul>
    </div>
  )
}

function FloatCard({ children, className, delay, float }: { children: ReactNode; className: string; delay: number; float: number[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: EASE }}
      className={cn('absolute', className)}
    >
      <motion.div
        animate={{ y: float }}
        transition={{ delay: delay + 0.5, duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.07] px-3 py-2.5 shadow-xl backdrop-blur-md"
      >
        {children}
      </motion.div>
    </motion.div>
  )
}

function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-dvh">
      <AuroraBackground />
      <div className="relative mx-auto grid min-h-dvh max-w-6xl items-center gap-10 px-4 py-10 lg:grid-cols-[1.1fr_1fr] lg:px-8">
        <HeroPanel />
        <div className="mx-auto w-full max-w-[420px]">
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}>
            <Logo className="mb-8 justify-center lg:justify-start" />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.45, ease: EASE, delay: 0.05 }}
            className="relative rounded-3xl border border-line bg-surface/85 p-6 shadow-[0_24px_60px_-20px_rgb(15_23_42/0.25)] backdrop-blur-xl sm:p-8"
          >
            {/* Kartın üst kenarında ışıltı */}
            <div aria-hidden className="absolute inset-x-8 -top-px h-px bg-gradient-to-r from-transparent via-emerald-400/70 to-transparent" />
            {children}
          </motion.div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.4 }}
            className="mt-6 flex items-start justify-center gap-1.5 px-2 text-center text-[12px] leading-relaxed text-subtle"
          >
            <ShieldCheck className="mt-px size-3.5 shrink-0" />
            <span>
              Harcamalarınız bu cihazda saklanır. Yalnızca paylaşıma açtığınız gruptaki harcamalar üyelerinizle paylaşılır.{' '}
              <a href={APP_CONFIG.privacyUrl} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
                Gizlilik politikası
              </a>
            </span>
          </motion.p>
        </div>
      </div>
    </div>
  )
}

function PasswordInput({ id, value, onChange, autoComplete }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input id={id} type={show ? 'text' : 'password'} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} required minLength={6} className="pr-11" />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Şifreyi gizle' : 'Şifreyi göster'}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center text-subtle hover:text-ink"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={show ? 'off' : 'on'} initial={{ opacity: 0, rotate: -30, scale: 0.8 }} animate={{ opacity: 1, rotate: 0, scale: 1 }} exit={{ opacity: 0, rotate: 30, scale: 0.8 }} transition={{ duration: 0.15 }}>
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </motion.span>
        </AnimatePresence>
      </button>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

const panel: Variants = {
  initial: { opacity: 0, x: 16 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.25, ease: EASE } },
  exit: { opacity: 0, x: -16, transition: { duration: 0.15 } },
}

/** Giriş, kayıt ve şifre sıfırlama ekranı. */
export function AuthScreen() {
  const auth = useAuth()
  const [mode, setMode] = useState<Mode>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<'form' | 'google' | null>(null)
  const [error, setError] = useState<string>()
  const [info, setInfo] = useState<string>()
  const uid = useId()

  const go = (m: Mode) => {
    setMode(m)
    setError(undefined)
    setInfo(undefined)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy('form')
    setError(undefined)
    setInfo(undefined)
    try {
      if (mode === 'signin') await auth.signIn(email, password)
      else if (mode === 'signup') {
        if (!(await auth.signUp(name, email, password))) {
          setMode('signin')
          setInfo(`Hesabınız oluşturuldu. ${email.trim()} adresine gelen bağlantıya tıklayıp hesabınızı doğrulayın, sonra giriş yapın.`)
        }
      } else {
        await auth.sendPasswordReset(email)
        setInfo('Şifre yenileme bağlantısı gönderildi. E-postanızdaki bağlantıyı bu cihazda açın.')
      }
    } catch (err) {
      setError(errText(err))
    } finally {
      setBusy(null)
    }
  }

  const google = async () => {
    setBusy('google')
    setError(undefined)
    try {
      await auth.signInWithGoogle()
    } catch (err) {
      setError(errText(err))
      setBusy(null)
    }
  }

  const signup = mode === 'signup'
  return (
    <AuthFrame>
      <AnimatePresence mode="wait" initial={false}>
        {mode === 'reset' ? (
          <motion.div key="reset" variants={panel} initial="initial" animate="animate" exit="exit">
            <button type="button" onClick={() => go('signin')} className="group -ml-1 mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">
              <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" /> Girişe dön
            </button>
            <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Şifrenizi mi unuttunuz?</h1>
            <p className="mt-1.5 text-sm text-muted">E-posta adresinizi yazın, yeni şifre belirlemeniz için bir bağlantı gönderelim.</p>
            <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
              <Field label="E-posta" htmlFor={`${uid}-email`}>
                <Input id={`${uid}-email`} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </Field>
              <Messages error={error} info={info} />
              <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy === 'form'} icon={<Mail className="size-4" />}>
                Bağlantı gönder
              </Button>
            </form>
          </motion.div>
        ) : (
          <motion.div key="main" variants={panel} initial="initial" animate="animate" exit="exit">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={mode} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
                <h1 className="font-display text-2xl font-bold tracking-tight text-ink">{signup ? 'Hesap oluşturun' : 'Tekrar hoş geldiniz'}</h1>
                <p className="mt-1.5 text-sm text-muted">{signup ? 'Birkaç saniyede kayıt olun, harcamalarınızı takip etmeye başlayın.' : 'Devam etmek için hesabınıza giriş yapın.'}</p>
              </motion.div>
            </AnimatePresence>

            <div role="tablist" aria-label="Giriş veya kayıt" className="relative mt-6 grid grid-cols-2 rounded-2xl bg-surface-2 p-1">
              {(['signin', 'signup'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => go(m)}
                  className={cn('relative rounded-xl py-2 text-sm font-semibold transition-colors duration-200', mode === m ? 'text-ink' : 'text-muted hover:text-ink')}
                >
                  {mode === m && <motion.span layoutId="auth-tab" className="absolute inset-0 rounded-xl bg-surface shadow-card" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                  <span className="relative">{m === 'signin' ? 'Giriş yap' : 'Kayıt ol'}</span>
                </button>
              ))}
            </div>

            {auth.googleEnabled && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }}>
                <Button type="button" size="lg" className="mt-5 w-full transition-transform hover:-translate-y-px" onClick={google} loading={busy === 'google'} icon={<GoogleIcon />}>
                  Google ile devam et
                </Button>
                <div className="my-5 flex items-center gap-3 text-[12px] font-medium text-subtle" aria-hidden>
                  <span className="h-px flex-1 bg-line" /> veya e-posta ile <span className="h-px flex-1 bg-line" />
                </div>
              </motion.div>
            )}

            <form onSubmit={submit} className={cn('flex flex-col gap-4', !auth.googleEnabled && 'mt-5')}>
              <AnimatePresence initial={false}>
                {signup && (
                  <motion.div
                    key="name"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.22, ease: EASE }}
                    className="-m-1 overflow-hidden p-1"
                  >
                    <Field label="Adınız" htmlFor={`${uid}-name`} hint="Grup üyeleriniz sizi bu adla görür.">
                      <Input id={`${uid}-name`} autoComplete="given-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} required />
                    </Field>
                  </motion.div>
                )}
              </AnimatePresence>
              <Field label="E-posta" htmlFor={`${uid}-email`}>
                <Input id={`${uid}-email`} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </Field>
              <Field label="Şifre" htmlFor={`${uid}-password`} hint={signup ? 'En az 6 karakter. Banka şifrenizi kullanmayın.' : undefined}>
                <PasswordInput id={`${uid}-password`} value={password} onChange={setPassword} autoComplete={signup ? 'new-password' : 'current-password'} />
              </Field>
              {!signup && (
                <button type="button" onClick={() => go('reset')} className="-mt-2 self-end text-[13px] font-medium text-accent hover:underline">
                  Şifremi unuttum
                </button>
              )}
              <Messages error={error} info={info} />
              <Button type="submit" variant="primary" size="lg" className="w-full transition-transform hover:-translate-y-px" loading={busy === 'form'} icon={<LockKeyhole className="size-4" />}>
                {signup ? 'Kayıt ol' : 'Giriş yap'}
              </Button>
            </form>
            <p className="mt-5 text-center text-sm text-muted">
              {signup ? 'Zaten hesabınız var mı? ' : 'Hesabınız yok mu? '}
              <button type="button" onClick={() => go(signup ? 'signin' : 'signup')} className="font-semibold text-accent hover:underline">
                {signup ? 'Giriş yapın' : 'Kayıt olun'}
              </button>
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthFrame>
  )
}

/** Şifre yenileme bağlantısıyla gelindiğinde yeni şifre ister. */
export function NewPasswordScreen() {
  const auth = useAuth()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      await auth.updatePassword(password)
    } catch (err) {
      setError(errText(err))
      setBusy(false)
    }
  }
  return (
    <AuthFrame>
      <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Yeni şifre belirleyin</h1>
      <p className="mt-1.5 text-sm text-muted">{auth.user?.email} hesabı için yeni bir şifre yazın.</p>
      <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
        <Field label="Yeni şifre" htmlFor="new-password" hint="En az 6 karakter.">
          <PasswordInput id="new-password" value={password} onChange={setPassword} autoComplete="new-password" />
        </Field>
        <Messages error={error} />
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} icon={<KeyRound className="size-4" />}>
          Şifreyi kaydet
        </Button>
      </form>
    </AuthFrame>
  )
}

/** Hata mesajı hafifçe sallanarak, bilgi mesajı süzülerek gelir. */
function Messages({ error, info }: { error?: string; info?: string }) {
  return (
    <AnimatePresence initial={false}>
      {error && (
        <motion.p
          key={error}
          role="alert"
          initial={{ opacity: 0, x: 0 }}
          animate={{ opacity: 1, x: [0, -6, 6, -4, 4, 0] }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          className="rounded-xl bg-danger-soft px-3 py-2 text-[13px] font-medium text-danger"
        >
          {error}
        </motion.p>
      )}
      {info && (
        <motion.p key="info" role="status" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="rounded-xl bg-accent-soft px-3 py-2 text-[13px] font-medium text-accent">
          {info}
        </motion.p>
      )}
    </AnimatePresence>
  )
}
