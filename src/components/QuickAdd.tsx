import { ArrowDownLeft, ArrowLeftRight, Bot, Camera, CreditCard, FileSpreadsheet, FileUp, FolderPlus, Image as ImageIcon, PiggyBank, Receipt, Repeat, Tag, Target, Undo2, UserPlus, Wallet } from 'lucide-react'
import { motion } from 'motion/react'
import { useRef, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { FEATURE_PLAN, type Feature } from '../domain/plans'
import { cn } from '../lib/cn'
import { ACCEPT } from '../pages/import/acceptTypes'
import { usePlan } from '../state/plan'
import { useUi } from '../state/ui'
import { Modal } from './ui/Modal'

interface Action {
  key: string
  label: string
  icon: ReactNode
  tone: string
  run: () => void
  /** Pakete bağlı özellik: paket yoksa küçük bir etiket gösterilir (sayfa tanıtımı açar). */
  feature?: Feature
}

/**
 * "+" menüsü: tek yerden bütün ekleme işlemleri. Belgeler bulunulan sayfanın üstünde açılan
 * içe aktarma penceresinde okunur. Dosya seçimi dokunuşla doğrudan açılır (mobilde kullanıcı hareketi gerekir).
 */
export function QuickAddSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { openTransactionForm, openImport } = useUi()
  const navigate = useNavigate()
  const statement = useRef<HTMLInputElement>(null)
  const image = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)

  const close = () => onOpenChange(false)
  const form = (type: 'expense' | 'refund' | 'transfer' | 'income') => () => {
    close()
    openTransactionForm(undefined, { type })
  }
  const go = (to: string) => () => {
    close()
    navigate(to)
  }
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    close()
    openImport(f)
  }

  const record: Action[] = [
    { key: 'expense', label: 'Gider', icon: <Receipt />, tone: 'from-emerald-500 to-teal-600', run: form('expense') },
    { key: 'income', label: 'Gelir', icon: <ArrowDownLeft />, tone: 'from-lime-500 to-emerald-600', run: form('income') },
    { key: 'refund', label: 'İade', icon: <Undo2 />, tone: 'from-sky-500 to-blue-600', run: form('refund') },
    { key: 'transfer', label: 'Kart ödemesi', icon: <ArrowLeftRight />, tone: 'from-slate-500 to-slate-700', run: form('transfer') },
  ]
  const files: Action[] = [
    { key: 'statement', label: 'Ekstre yükle', icon: <FileSpreadsheet />, tone: 'from-violet-500 to-purple-600', run: () => statement.current?.click() },
    { key: 'image', label: 'Ekran görüntüsü', icon: <ImageIcon />, tone: 'from-pink-500 to-rose-600', run: () => image.current?.click() },
    { key: 'camera', label: 'Fotoğraf çek', icon: <Camera />, tone: 'from-amber-500 to-orange-600', run: () => camera.current?.click() },
    {
      key: 'import',
      label: 'İçe aktar',
      icon: <FileUp />,
      tone: 'from-indigo-500 to-violet-600',
      run: () => {
        close()
        openImport()
      },
    },
  ]
  const plan: Action[] = [
    { key: 'recurring', label: 'Düzenli ödeme', icon: <Repeat />, tone: 'from-violet-500 to-purple-600', run: go('/odemeler?yeni=1'), feature: 'subscriptions' },
    { key: 'goal', label: 'Birikim hedefi', icon: <PiggyBank />, tone: 'from-pink-500 to-rose-600', run: go('/hedefler?yeni=1'), feature: 'goals' },
    { key: 'asset', label: 'Yatırım', icon: <Wallet />, tone: 'from-emerald-600 to-green-700', run: go('/yatirimlar?yeni=1'), feature: 'assets' },
    { key: 'debt', label: 'Borç', icon: <CreditCard />, tone: 'from-rose-500 to-red-600', run: go('/borclar?yeni=1'), feature: 'assets' },
    { key: 'budget', label: 'Bütçe limiti', icon: <Target />, tone: 'from-amber-500 to-orange-600', run: go('/butce'), feature: 'advancedBudget' },
  ]
  const more: Action[] = [
    { key: 'category', label: 'Kategori', icon: <Tag />, tone: 'from-teal-500 to-cyan-600', run: go('/kategoriler?yeni=1') },
    { key: 'group', label: 'Grup', icon: <FolderPlus />, tone: 'from-indigo-500 to-blue-700', run: go('/kategoriler?bolum=groups&yeni=1') },
    { key: 'member', label: 'Üye davet et', icon: <UserPlus />, tone: 'from-fuchsia-500 to-pink-600', run: go('/uyeler') },
    { key: 'coach', label: 'Koça sor', icon: <Bot />, tone: 'from-cyan-500 to-emerald-500', run: go('/koc'), feature: 'aiCoach' },
  ]

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Ne eklemek istersiniz?" size="md">
      <input ref={statement} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-label="Ekstre dosyası seçin" onChange={onFile} />
      <input ref={image} type="file" accept="image/png,image/jpeg" className="sr-only" tabIndex={-1} aria-label="Ekran görüntüsü seçin" onChange={onFile} />
      <input ref={camera} type="file" accept="image/jpeg,image/png" capture="environment" className="sr-only" tabIndex={-1} aria-label="Fotoğraf çekin" onChange={onFile} />
      <div className="flex flex-col gap-5 pb-1">
        <Section title="Kayıt" actions={record} offset={0} />
        <Section title="Belgeden ekle" actions={files} offset={4} note="Belgeler cihazınızda okunur; hiçbir sunucuya gönderilmez." />
        <Section title="Planla" actions={plan} offset={8} />
        <Section title="Diğer" actions={more} offset={12} />
      </div>
    </Modal>
  )
}

function Section({ title, actions, offset, note }: { title: string; actions: Action[]; offset: number; note?: string }) {
  const { has } = usePlan()
  return (
    <section aria-label={title}>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-subtle">{title}</h3>
      <div className="grid grid-cols-4 gap-2">
        {actions.map((a, i) => {
          const need = a.feature && !has(a.feature) ? FEATURE_PLAN[a.feature] : null
          return (
            <motion.button
              key={a.key}
              type="button"
              onClick={a.run}
              initial={{ opacity: 0, y: 12, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.022 * (offset + i), type: 'spring', stiffness: 420, damping: 28 }}
              whileTap={{ scale: 0.93 }}
              className="relative flex min-h-[86px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-line bg-surface-2 px-1 py-2.5 text-center transition-colors hover:border-line-strong hover:bg-surface-3"
            >
              <span className={cn('grid size-10 place-items-center rounded-xl bg-gradient-to-br text-white shadow-card [&>svg]:size-5', a.tone)}>{a.icon}</span>
              <span className="text-[12px] font-semibold leading-tight text-ink">{a.label}</span>
              {need && (
                <span className={cn('absolute right-1 top-1 rounded-full px-1.5 text-[9.5px] font-bold leading-4 text-white', need === 'plus' ? 'bg-emerald-600' : 'bg-violet-600')}>
                  {need === 'plus' ? 'Plus' : 'Plus+'}
                </span>
              )}
            </motion.button>
          )
        })}
      </div>
      {note && <p className="mt-2 text-[11.5px] text-subtle">{note}</p>}
    </section>
  )
}
