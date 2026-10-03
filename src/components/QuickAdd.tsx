import { ArrowLeftRight, Camera, FileSpreadsheet, FolderPlus, Image as ImageIcon, Receipt, Tag, Undo2, UserPlus } from 'lucide-react'
import { motion } from 'motion/react'
import { useRef, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '../lib/cn'
import { ACCEPT } from '../pages/import/acceptTypes'
import { useUi } from '../state/ui'
import { Modal } from './ui/Modal'

interface Action {
  key: string
  label: string
  hint: string
  icon: ReactNode
  tone: string
  run: () => void
}

/**
 * "+" menüsü: tek yerden bütün ekleme işlemleri (gider, iade, transfer, ekstre, ekran görüntüsü,
 * kamera, kategori, grup, üye daveti). Dosya seçimi dokunuşla doğrudan açılır (mobilde kullanıcı
 * hareketi gerekir); seçilen dosya İçe aktar sayfasında okunur.
 */
export function QuickAddSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { openTransactionForm, setPendingImport } = useUi()
  const navigate = useNavigate()
  const statement = useRef<HTMLInputElement>(null)
  const image = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)

  const close = () => onOpenChange(false)
  const form = (type: 'expense' | 'refund' | 'transfer') => () => {
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
    setPendingImport(f)
    navigate('/ice-aktar')
  }

  const record: Action[] = [
    { key: 'expense', label: 'Gider', hint: 'Elle harcama', icon: <Receipt />, tone: 'from-emerald-500 to-teal-600', run: form('expense') },
    { key: 'refund', label: 'İade', hint: 'Geri ödeme', icon: <Undo2 />, tone: 'from-sky-500 to-blue-600', run: form('refund') },
    { key: 'transfer', label: 'Kart ödemesi', hint: 'Transfer', icon: <ArrowLeftRight />, tone: 'from-slate-500 to-slate-700', run: form('transfer') },
  ]
  const files: Action[] = [
    { key: 'statement', label: 'Ekstre yükle', hint: 'PDF, CSV, Excel', icon: <FileSpreadsheet />, tone: 'from-violet-500 to-purple-600', run: () => statement.current?.click() },
    { key: 'image', label: 'Ekran görüntüsü', hint: 'Galeriden seç', icon: <ImageIcon />, tone: 'from-pink-500 to-rose-600', run: () => image.current?.click() },
    { key: 'camera', label: 'Fotoğraf çek', hint: 'Fiş veya ekstre', icon: <Camera />, tone: 'from-amber-500 to-orange-600', run: () => camera.current?.click() },
  ]
  const more: Action[] = [
    { key: 'category', label: 'Kategori', hint: 'Yeni kategori', icon: <Tag />, tone: 'from-teal-500 to-cyan-600', run: go('/kategoriler?yeni=1') },
    { key: 'group', label: 'Grup', hint: 'Bireysel, Ortak…', icon: <FolderPlus />, tone: 'from-indigo-500 to-blue-700', run: go('/kategoriler?bolum=groups&yeni=1') },
    { key: 'member', label: 'Üye davet et', hint: 'Ortak gider', icon: <UserPlus />, tone: 'from-fuchsia-500 to-pink-600', run: go('/uyeler') },
  ]

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Ne eklemek istersiniz?" size="md">
      <input ref={statement} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-label="Ekstre dosyası seçin" onChange={onFile} />
      <input ref={image} type="file" accept="image/png,image/jpeg" className="sr-only" tabIndex={-1} aria-label="Ekran görüntüsü seçin" onChange={onFile} />
      <input ref={camera} type="file" accept="image/jpeg,image/png" capture="environment" className="sr-only" tabIndex={-1} aria-label="Fotoğraf çekin" onChange={onFile} />
      <div className="flex flex-col gap-5 pb-1">
        <Section title="Kayıt" actions={record} offset={0} />
        <Section title="Belge ile ekle" actions={files} offset={3} note="Belgeler cihazınızda okunur; hiçbir sunucuya gönderilmez." />
        <Section title="Diğer" actions={more} offset={6} />
      </div>
    </Modal>
  )
}

function Section({ title, actions, offset, note }: { title: string; actions: Action[]; offset: number; note?: string }) {
  return (
    <section aria-label={title}>
      <h3 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-subtle">{title}</h3>
      <div className="grid grid-cols-3 gap-2">
        {actions.map((a, i) => (
          <motion.button
            key={a.key}
            type="button"
            onClick={a.run}
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.03 * (offset + i), duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            whileTap={{ scale: 0.95 }}
            className="flex min-h-[96px] flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-surface-2 px-2 py-3 text-center transition-colors hover:border-line-strong hover:bg-surface-3"
          >
            <span className={cn('grid size-10 place-items-center rounded-xl bg-gradient-to-br text-white shadow-card [&>svg]:size-5', a.tone)}>{a.icon}</span>
            <span className="text-[13px] font-semibold leading-tight text-ink">{a.label}</span>
            <span className="-mt-1.5 text-[11px] leading-tight text-subtle">{a.hint}</span>
          </motion.button>
        ))}
      </div>
      {note && <p className="mt-2 text-[11.5px] text-subtle">{note}</p>}
    </section>
  )
}
