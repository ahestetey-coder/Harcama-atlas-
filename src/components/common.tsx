import {
  ArrowLeftRight,
  Baby,
  BookOpen,
  Briefcase,
  Bus,
  Car,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Coffee,
  Droplet,
  Dumbbell,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  Landmark,
  Music,
  PawPrint,
  PiggyBank,
  Pill,
  Plane,
  Receipt,
  Repeat,
  Shapes,
  Shirt,
  ShoppingCart,
  Smartphone,
  Sparkles,
  UtensilsCrossed,
  Wifi,
  Wrench,
  Zap,
  CircleHelp,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { addMonths, currentMonth, MONTH_NAMES, monthLabel, parseMonthKey } from '../domain/dates'
import { formatKurus } from '../domain/money'
import type { Category, MonthKey, TxType } from '../domain/types'
import { cn } from '../lib/cn'
import { Modal } from './ui/Modal'
import { IconButton } from './ui/primitives'

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  'shopping-cart': ShoppingCart,
  fuel: Fuel,
  coffee: Coffee,
  utensils: UtensilsCrossed,
  bus: Bus,
  car: Car,
  plane: Plane,
  receipt: Receipt,
  zap: Zap,
  droplet: Droplet,
  wifi: Wifi,
  smartphone: Smartphone,
  home: House,
  wrench: Wrench,
  'heart-pulse': HeartPulse,
  pill: Pill,
  'graduation-cap': GraduationCap,
  book: BookOpen,
  shirt: Shirt,
  baby: Baby,
  'paw-print': PawPrint,
  clapperboard: Clapperboard,
  gamepad: Gamepad2,
  music: Music,
  dumbbell: Dumbbell,
  repeat: Repeat,
  gift: Gift,
  briefcase: Briefcase,
  landmark: Landmark,
  'piggy-bank': PiggyBank,
  sparkles: Sparkles,
  shapes: Shapes,
}

export const CATEGORY_COLORS = ['#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#fb7185', '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#64748b', '#94a3b8']

export function CategoryIcon({ category, size = 'md', className }: { category?: Pick<Category, 'icon' | 'color'> | null; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const Icon = category ? (CATEGORY_ICONS[category.icon] ?? Shapes) : CircleHelp
  const color = category?.color ?? '#94a3b8'
  const dims = { sm: 'size-7 rounded-lg [&>svg]:size-3.5', md: 'size-9 rounded-xl [&>svg]:size-[18px]', lg: 'size-11 rounded-2xl [&>svg]:size-5' }
  return (
    <span
      className={cn('inline-grid shrink-0 place-items-center', dims[size], className)}
      style={{ backgroundColor: `${color}1f`, color, boxShadow: `inset 0 0 0 1px ${color}33` }}
      aria-hidden
    >
      <Icon strokeWidth={2} />
    </span>
  )
}

export function TransferIcon({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <span className={cn('inline-grid shrink-0 place-items-center bg-surface-2 text-muted', size === 'sm' ? 'size-7 rounded-lg [&>svg]:size-3.5' : 'size-9 rounded-xl [&>svg]:size-[18px]')} aria-hidden>
      <ArrowLeftRight />
    </span>
  )
}

/** İşlem türüne göre işaretli ve renkli tutar. */
export function Money({ kurus, type = 'expense', className, plain }: { kurus: number; type?: TxType; className?: string; plain?: boolean }) {
  const text = formatKurus(Math.abs(kurus))
  if (plain) return <span className={cn('num', className)}>{kurus < 0 ? '−' : ''}{text}</span>
  if (type === 'refund')
    return (
      <span className={cn('num text-accent', className)}>
        <span className="sr-only">İade: </span>+{text}
      </span>
    )
  if (type === 'transfer')
    return (
      <span className={cn('num text-subtle', className)}>
        <span className="sr-only">Transfer: </span>
        {text}
      </span>
    )
  return (
    <span className={cn('num text-ink', className)}>
      <span aria-hidden>−</span>
      <span className="sr-only">Gider: </span>
      {text}
    </span>
  )
}

export function MonthSwitcher({ month, onChange, compact }: { month: MonthKey; onChange: (m: MonthKey) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(() => parseMonthKey(month).year)
  const cur = currentMonth()
  return (
    <div className="flex items-center gap-0.5 rounded-2xl border border-line bg-surface p-1 shadow-card">
      <IconButton label="Önceki ay" size="sm" onClick={() => onChange(addMonths(month, -1))}>
        <ChevronLeft className="size-[18px]" />
      </IconButton>
      <button
        type="button"
        onClick={() => {
          setYear(parseMonthKey(month).year)
          setOpen(true)
        }}
        className={cn('num rounded-lg px-2 py-1 text-center font-display text-[14.5px] font-semibold text-ink transition-colors hover:bg-surface-2', compact ? 'min-w-[112px]' : 'min-w-[132px]')}
        aria-label={`Ay seç, seçili: ${monthLabel(month)}`}
      >
        {monthLabel(month)}
      </button>
      <IconButton label="Sonraki ay" size="sm" onClick={() => onChange(addMonths(month, 1))}>
        <ChevronRight className="size-[18px]" />
      </IconButton>
      <Modal open={open} onOpenChange={setOpen} title="Ay seçin" size="sm">
        <div className="mb-3 flex items-center justify-between">
          <IconButton label="Önceki yıl" onClick={() => setYear((y) => y - 1)}>
            <ChevronLeft className="size-5" />
          </IconButton>
          <span className="num font-display text-lg font-semibold">{year}</span>
          <IconButton label="Sonraki yıl" onClick={() => setYear((y) => y + 1)}>
            <ChevronRight className="size-5" />
          </IconButton>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {MONTH_NAMES.map((name, i) => {
            const key = `${year}-${String(i + 1).padStart(2, '0')}`
            const selected = key === month
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  onChange(key)
                  setOpen(false)
                }}
                className={cn(
                  'rounded-xl border px-2 py-2.5 text-sm font-medium transition-colors',
                  selected ? 'border-transparent bg-gradient-to-br from-emerald-500 to-teal-600 text-white' : 'border-line hover:bg-surface-2',
                  key === cur && !selected && 'border-accent/50 text-accent',
                )}
                aria-current={selected ? 'date' : undefined}
              >
                {name}
              </button>
            )
          })}
        </div>
        <button type="button" className="mt-4 w-full rounded-xl py-2 text-sm font-medium text-accent hover:bg-accent-soft" onClick={() => { onChange(cur); setOpen(false) }}>
          Bu aya dön
        </button>
      </Modal>
    </div>
  )
}
