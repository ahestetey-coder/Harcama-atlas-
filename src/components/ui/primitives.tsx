import { Loader2 } from 'lucide-react'
import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary:
    'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-[0_8px_20px_-10px_rgb(5_150_105/0.8)] hover:brightness-110 active:brightness-95 disabled:from-surface-3 disabled:to-surface-3 disabled:text-subtle disabled:shadow-none',
  secondary: 'bg-surface border border-line-strong text-ink hover:bg-surface-2 active:bg-surface-3 disabled:text-subtle',
  ghost: 'text-muted hover:text-ink hover:bg-surface-2 active:bg-surface-3 disabled:text-subtle',
  danger: 'bg-danger text-white hover:brightness-110 active:brightness-95 disabled:opacity-50',
  soft: 'bg-accent-soft text-accent-strong hover:brightness-105 disabled:opacity-50 dark:text-accent',
}
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-5 text-[15px] gap-2 rounded-xl',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-[background-color,filter,transform,box-shadow,color] duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  )
})

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: 'sm' | 'md' }>(function IconButton(
  { label, className, children, size = 'md', type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-xl text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-ink active:bg-surface-3 disabled:opacity-40',
        size === 'sm' ? 'size-8' : 'size-10',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
})

export function Card({ className, children, as: As = 'section', ...rest }: { className?: string; children: ReactNode; as?: 'section' | 'div' | 'article' } & Record<string, unknown>) {
  return (
    <As className={cn('card', className)} {...rest}>
      {children}
    </As>
  )
}

export function Badge({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'accent' | 'warning' | 'danger' | 'info' | 'teal'; children: ReactNode; className?: string }) {
  const tones = {
    neutral: 'bg-surface-2 text-muted',
    accent: 'bg-accent-soft text-accent-strong dark:text-accent',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
    info: 'bg-info-soft text-info',
    teal: 'bg-teal-soft text-teal',
  }
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium leading-5', tones[tone], className)}>{children}</span>
}

const fieldBase =
  'w-full rounded-xl border border-line-strong bg-surface px-3 text-base text-ink placeholder:text-subtle transition-[border-color,box-shadow] duration-150 focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft disabled:opacity-60 aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger-soft sm:text-sm'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(fieldBase, 'h-11 sm:h-10', className)} {...rest} />
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        fieldBase,
        "h-11 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22 fill=%22%238a93a3%22><path d=%22M5.5 7.5 10 12l4.5-4.5%22 stroke=%22%238a93a3%22 stroke-width=%221.6%22 fill=%22none%22 stroke-linecap=%22round%22/></svg>')] bg-[length:18px] bg-[right_10px_center] bg-no-repeat pr-9 sm:h-10",
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  )
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(fieldBase, 'min-h-20 py-2', className)} {...rest} />
})

export function Field({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
  optional,
}: {
  label: ReactNode
  hint?: ReactNode
  error?: string
  children: ReactNode
  className?: string
  htmlFor?: string
  optional?: boolean
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-muted">
        {label}
        {optional && <span className="ml-1 font-normal text-subtle">(isteğe bağlı)</span>}
      </label>
      {children}
      {error ? (
        <p className="text-[12.5px] font-medium text-danger" role="alert" id={htmlFor ? `${htmlFor}-error` : undefined}>
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12.5px] text-subtle">{hint}</p>
      ) : null}
    </div>
  )
}

export function Checkbox({ label, checked, onChange, className, disabled, description, ...rest }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; className?: string; disabled?: boolean; description?: ReactNode } & Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'checked'>) {
  const id = useId()
  return (
    <div className={cn('flex items-start gap-2.5', className)}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-[18px] shrink-0 cursor-pointer rounded-md accent-emerald-600"
        {...rest}
      />
      <label htmlFor={id} className="cursor-pointer text-sm leading-snug text-ink">
        {label}
        {description && <span className="mt-0.5 block text-[12.5px] text-subtle">{description}</span>}
      </label>
    </div>
  )
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-50',
        checked ? 'bg-gradient-to-r from-emerald-500 to-teal-500' : 'bg-surface-3',
      )}
    >
      <span className={cn('inline-block size-5 rounded-full bg-white shadow transition-transform duration-200', checked ? 'translate-x-[22px]' : 'translate-x-0.5')} />
    </button>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T
  onChange: (v: T) => void
  options: Array<{ value: T; label: ReactNode; icon?: ReactNode }>
  label: string
  className?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-xl border border-line bg-surface-2 p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all duration-150',
            value === o.value ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink',
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-5 animate-spin text-accent', className)} aria-label="Yükleniyor" />
}

export function EmptyState({ icon, title, children, action, className }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <div className="relative mb-4">
        <div className="absolute inset-0 -z-10 scale-150 rounded-full bg-gradient-to-br from-emerald-400/20 to-cyan-400/10 blur-2xl" />
        <div className="grid size-14 place-items-center rounded-2xl border border-line bg-surface text-accent shadow-card">{icon}</div>
      </div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {children && <div className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted">{children}</div>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}

export function Alert({ tone = 'info', title, children, icon, className, action }: { tone?: 'info' | 'warning' | 'danger' | 'accent'; title?: ReactNode; children?: ReactNode; icon?: ReactNode; className?: string; action?: ReactNode }) {
  const tones = {
    info: 'border-info/25 bg-info-soft',
    warning: 'border-warning/30 bg-warning-soft',
    danger: 'border-danger/30 bg-danger-soft',
    accent: 'border-accent/25 bg-accent-soft',
  }
  const iconTone = { info: 'text-info', warning: 'text-warning', danger: 'text-danger', accent: 'text-accent' }
  return (
    <div className={cn('flex gap-3 rounded-2xl border px-4 py-3 text-sm', tones[tone], className)} role={tone === 'danger' ? 'alert' : undefined}>
      {icon && <div className={cn('mt-0.5 shrink-0 [&>svg]:size-[18px]', iconTone[tone])}>{icon}</div>}
      <div className="min-w-0 flex-1 leading-relaxed text-ink">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title ? 'mt-0.5' : '', 'text-muted')}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden />
}
