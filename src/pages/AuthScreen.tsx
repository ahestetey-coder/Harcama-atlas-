import { ArrowLeft, Eye, EyeOff, KeyRound, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { Logo } from '../components/AppShell'
import { Button, Field, Input, Spinner } from '../components/ui/primitives'
import { UserFacingError } from '../data/repository'
import { cn } from '../lib/cn'
import { useAuth } from '../state/auth'

type Mode = 'signin' | 'signup' | 'reset'

function errText(e: unknown): string {
  return e instanceof UserFacingError ? e.message : 'Bir sorun oluştu. Bağlantınızı kontrol edip tekrar deneyin.'
}

/** Hesap sunucusu yanıt verene kadar gösterilen ekran. */
export function AuthSplash() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="flex flex-col items-center gap-4">
        <Logo />
        <Spinner className="size-6" />
      </div>
    </div>
  )
}

function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-[400px]">
        <Logo className="mb-8 justify-center" />
        <div className="rounded-3xl border border-line bg-surface p-6 shadow-card sm:p-8">{children}</div>
        <p className="mt-6 flex items-start justify-center gap-1.5 px-2 text-center text-[12px] leading-relaxed text-subtle">
          <ShieldCheck className="mt-px size-3.5 shrink-0" />
          Harcamalarınız bu cihazda saklanır. Yalnızca paylaşıma açtığınız gruptaki harcamalar üyelerinizle paylaşılır.
        </p>
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
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
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
          setInfo(`Hesabınız oluşturuldu. ${email.trim()} adresine gelen bağlantıya tıklayıp hesabınızı doğrulayın, sonra giriş yapın.`)
          setMode('signin')
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

  if (mode === 'reset') {
    return (
      <AuthFrame>
        <button type="button" onClick={() => go('signin')} className="-ml-1 mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">
          <ArrowLeft className="size-4" /> Girişe dön
        </button>
        <h1 className="font-display text-xl font-semibold text-ink">Şifrenizi mi unuttunuz?</h1>
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
      </AuthFrame>
    )
  }

  const signup = mode === 'signup'
  return (
    <AuthFrame>
      <h1 className="font-display text-xl font-semibold text-ink">{signup ? 'Hesap oluşturun' : 'Tekrar hoş geldiniz'}</h1>
      <p className="mt-1.5 text-sm text-muted">{signup ? 'Birkaç saniyede kayıt olun, harcamalarınızı takip etmeye başlayın.' : 'Devam etmek için hesabınıza giriş yapın.'}</p>

      <div role="tablist" aria-label="Giriş veya kayıt" className="mt-6 grid grid-cols-2 rounded-2xl bg-surface-2 p-1">
        {(['signin', 'signup'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => go(m)}
            className={cn('rounded-xl py-2 text-sm font-semibold transition-colors', mode === m ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink')}
          >
            {m === 'signin' ? 'Giriş yap' : 'Kayıt ol'}
          </button>
        ))}
      </div>

      {auth.googleEnabled && (
        <>
          <Button type="button" size="lg" className="mt-5 w-full" onClick={google} loading={busy === 'google'} icon={<GoogleIcon />}>
            Google ile devam et
          </Button>
          <div className="my-5 flex items-center gap-3 text-[12px] font-medium text-subtle" aria-hidden>
            <span className="h-px flex-1 bg-line" /> veya e-posta ile <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}

      <form onSubmit={submit} className={cn('flex flex-col gap-4', !auth.googleEnabled && 'mt-5')}>
        {signup && (
          <Field label="Adınız" htmlFor={`${uid}-name`} hint="Grup üyeleriniz sizi bu adla görür.">
            <Input id={`${uid}-name`} autoComplete="given-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} required />
          </Field>
        )}
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
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy === 'form'} icon={<LockKeyhole className="size-4" />}>
          {signup ? 'Kayıt ol' : 'Giriş yap'}
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-muted">
        {signup ? 'Zaten hesabınız var mı? ' : 'Hesabınız yok mu? '}
        <button type="button" onClick={() => go(signup ? 'signin' : 'signup')} className="font-semibold text-accent hover:underline">
          {signup ? 'Giriş yapın' : 'Kayıt olun'}
        </button>
      </p>
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
      <h1 className="font-display text-xl font-semibold text-ink">Yeni şifre belirleyin</h1>
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

function Messages({ error, info }: { error?: string; info?: string }) {
  return (
    <>
      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-[13px] font-medium text-danger">
          {error}
        </p>
      )}
      {info && (
        <p role="status" className="rounded-xl bg-accent-soft px-3 py-2 text-[13px] font-medium text-accent">
          {info}
        </p>
      )}
    </>
  )
}
