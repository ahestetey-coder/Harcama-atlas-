import { cn } from '../lib/cn'

/** Kaydırıcı: etiket, anlık değer ve isteğe bağlı açıklama. */
export function Slider({ id, label, value, min, max, step = 1, onChange, display, hint, disabled }: { id: string; label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; display: (v: number) => string; hint?: string; disabled?: boolean }) {
  return (
    <div className={cn('flex flex-col gap-1.5', disabled && 'opacity-50')}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-[13px] font-medium text-muted">
          {label}
        </label>
        <span className="num text-[13.5px] font-semibold text-ink" aria-hidden>
          {display(value)}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={display(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer accent-[var(--accent)]"
      />
      {hint && <p className="text-[12px] text-subtle">{hint}</p>}
    </div>
  )
}
