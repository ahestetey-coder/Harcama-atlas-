import { AnimatePresence, motion } from 'motion/react'
import { Pencil, Trash2 } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { formatDate } from '../domain/dates'
import { formatKurus } from '../domain/money'
import { isReadOnlyTx, PAYMENT_LABEL, SOURCE_LABEL, TX_TYPE_LABEL, type Category, type Member, type SpendGroup, type Transaction } from '../domain/types'
import { cn } from '../lib/cn'
import { useMembers } from '../state/cloud'
import { useGroupMap } from '../state/data'
import { useUi } from '../state/ui'
import { CategoryIcon, GroupBadge, IncomeIcon, Money, TransferIcon } from './common'
import { Badge, IconButton } from './ui/primitives'

interface Props {
  transactions: Transaction[]
  categories: Map<string, Category>
  selectable?: boolean
  selected?: Set<string>
  onToggle?: (id: string) => void
  onToggleAll?: (on: boolean) => void
  onEdit?: (t: Transaction) => void
  onDelete?: (t: Transaction) => void
  compact?: boolean
  /** "Tümü" görünümü: üyelerin ortak giderleri toplamlara girmez; bu satırlar işaretlenir. */
  markUncounted?: boolean
  /** Görüntülenecek en fazla satır (performans). */
  limit?: number
}

function TxMeta({ t, group, member, uncounted }: { t: Transaction; group?: SpendGroup; member?: Pick<Member, 'name' | 'color'>; uncounted?: boolean }) {
  return (
    <>
      {member && (
        <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11.5px] font-medium text-muted" title={`${member.name} ekledi`}>
          <span className="size-2 rounded-full" style={{ background: member.color }} aria-hidden />
          {member.name}
        </span>
      )}
      <GroupBadge group={group} />
      {uncounted && t.source === 'shared' && <Badge tone="warning">Toplama girmez</Badge>}
      {t.type !== 'expense' && t.source !== 'settlement' && <Badge tone={t.type === 'refund' ? 'accent' : t.type === 'income' ? 'teal' : 'neutral'}>{TX_TYPE_LABEL[t.type]}</Badge>}
      {t.installment && (
        <Badge tone="info" className="num">
          Taksit {t.installment.current}/{t.installment.total || '?'}
        </Badge>
      )}
      {t.foreign && (
        <Badge tone="teal" className="num">
          {(t.foreign.amountMinor / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {t.foreign.currency}
        </Badge>
      )}
      {t.source !== 'manual' && t.source !== 'demo' && t.source !== 'shared' && <Badge tone={t.source === 'settlement' ? 'accent' : undefined}>{t.source === 'planned' && t.type === 'income' ? 'Düzenli gelir' : SOURCE_LABEL[t.source]}</Badge>}
    </>
  )
}

export function TransactionList({ transactions, categories, selectable, selected, onToggle, onToggleAll, onEdit, onDelete, compact, markUncounted, limit = 500 }: Props) {
  const { highlightId, setHighlightId } = useUi()
  const groups = useGroupMap()
  const { map: members, selfId } = useMembers()
  // Ortak gruptaki her işlemde ekleyen kişi görünür; üyeden gelen işlemlerde her zaman
  const memberOf = (t: Transaction): Pick<Member, 'name' | 'color'> | undefined => {
    if (t.memberId && t.memberId !== selfId) return members.get(t.memberId) ?? { name: 'Grup üyesi', color: '#94a3b8' }
    if (t.groupId && groups.get(t.groupId)?.cloudId) return { name: 'Siz', color: (selfId && members.get(selfId)?.color) || '#94a3b8' }
    return undefined
  }
  const shown = transactions.slice(0, limit)
  const allSelected = selectable && shown.length > 0 && shown.every((t) => selected?.has(t.id))
  const flashRef = useRef<string | null>(null)
  useEffect(() => {
    if (!highlightId) return
    flashRef.current = highlightId
    const h = window.setTimeout(() => setHighlightId(null), 1200)
    return () => window.clearTimeout(h)
  }, [highlightId, setHighlightId])

  return (
    <div>
      {/* Masaüstü tablo */}
      <div className={cn('hidden', !compact && 'lg:block')}>
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-[12px] font-medium uppercase tracking-wide text-subtle">
              {selectable && (
                <th className="w-10 border-b border-line py-2.5 pl-4">
                  <input
                    type="checkbox"
                    aria-label="Görünen tüm işlemleri seç"
                    checked={!!allSelected}
                    onChange={(e) => onToggleAll?.(e.target.checked)}
                    className="size-4 accent-emerald-600"
                  />
                </th>
              )}
              <th className="border-b border-line py-2.5 pl-4 font-medium">Tarih</th>
              <th className="border-b border-line py-2.5 pl-3 font-medium">Açıklama</th>
              <th className="border-b border-line py-2.5 pl-3 font-medium">Kategori</th>
              <th className="border-b border-line py-2.5 pl-3 font-medium">Ödeme</th>
              <th className="border-b border-line py-2.5 pr-3 text-right font-medium">Tutar</th>
              {(onEdit || onDelete) && <th className="w-24 border-b border-line py-2.5 pr-3"><span className="sr-only">İşlemler</span></th>}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {shown.map((t) => {
                const cat = t.categoryId ? categories.get(t.categoryId) : undefined
                return (
                  <motion.tr
                    key={t.id}
                    layout="position"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className={cn('group transition-colors hover:bg-surface-2/70', selected?.has(t.id) && 'bg-accent-soft/60', highlightId === t.id && 'row-flash')}
                  >
                    {selectable && (
                      <td className="border-b border-line py-2.5 pl-4">
                        <input type="checkbox" aria-label={`${t.description} seç`} checked={!!selected?.has(t.id)} onChange={() => onToggle?.(t.id)} className="size-4 accent-emerald-600" />
                      </td>
                    )}
                    <td className="num whitespace-nowrap border-b border-line py-2.5 pl-4 text-muted">{formatDate(t.date)}</td>
                    <td className="max-w-[340px] border-b border-line py-2.5 pl-3">
                      <div className="truncate font-medium text-ink" title={t.description}>
                        {t.description}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-1 empty:hidden">
                        <TxMeta t={t} group={t.groupId ? groups.get(t.groupId) : undefined} member={memberOf(t)} uncounted={markUncounted} />
                      </div>
                    </td>
                    <td className="border-b border-line py-2.5 pl-3">
                      {(t.type === 'transfer' || t.type === 'income') && !cat ? (
                        <span className="text-subtle">—</span>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <CategoryIcon category={cat} size="sm" />
                          <span className={cn('truncate', !cat && 'text-warning')}>{cat?.name ?? 'Kategorisiz'}</span>
                        </span>
                      )}
                    </td>
                    <td className="border-b border-line py-2.5 pl-3 text-muted">
                      {t.paymentMethod ? PAYMENT_LABEL[t.paymentMethod] : <span className="text-subtle">—</span>}
                      {t.accountAlias && <div className="text-[12px] text-subtle">{t.accountAlias}</div>}
                    </td>
                    <td className="whitespace-nowrap border-b border-line py-2.5 pr-3 text-right font-semibold">
                      <Money kurus={t.amountKurus} type={t.type} />
                    </td>
                    {(onEdit || onDelete) && (
                      <td className="border-b border-line py-1.5 pr-3 text-right">
                        <div className="inline-flex opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                          {onEdit && (
                            <IconButton label={`${t.description} düzenle`} size="sm" onClick={() => onEdit(t)}>
                              <Pencil className="size-4" />
                            </IconButton>
                          )}
                          {onDelete && !isReadOnlyTx(t) && (
                            <IconButton label={`${t.description} sil`} size="sm" onClick={() => onDelete(t)} className="hover:text-danger">
                              <Trash2 className="size-4" />
                            </IconButton>
                          )}
                        </div>
                      </td>
                    )}
                  </motion.tr>
                )
              })}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      {/* Mobil / kompakt kart listesi */}
      <ul className={cn('flex flex-col', !compact && 'lg:hidden')}>
        <AnimatePresence initial={false}>
          {shown.map((t) => {
            const cat = t.categoryId ? categories.get(t.categoryId) : undefined
            return (
              <motion.li
                key={t.id}
                layout="position"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
                className={cn('border-b border-line last:border-b-0', highlightId === t.id && 'row-flash')}
              >
                <div className={cn('flex items-center gap-2.5 py-3', compact ? 'px-0' : 'px-3 sm:px-4', selected?.has(t.id) && 'bg-accent-soft/60')}>
                  {selectable && (
                    <input type="checkbox" aria-label={`${t.description} seç`} checked={!!selected?.has(t.id)} onChange={() => onToggle?.(t.id)} className="size-[18px] shrink-0 accent-emerald-600" />
                  )}
                  {t.type === 'transfer' && !cat ? <TransferIcon /> : t.type === 'income' && !cat ? <IncomeIcon /> : <CategoryIcon category={cat} />}
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left disabled:cursor-default"
                    onClick={() => onEdit?.(t)}
                    disabled={!onEdit}
                    aria-label={onEdit ? `${t.description}, ${formatKurus(t.amountKurus)}, düzenle` : undefined}
                  >
                    <div className="line-clamp-2 text-[14px] leading-snug [overflow-wrap:break-word] font-medium text-ink">{t.description}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-subtle">
                      <span className="num whitespace-nowrap">{formatDate(t.date)}</span>
                      <span className={cn('whitespace-nowrap font-medium', cat || t.type === 'transfer' || t.type === 'income' ? 'text-muted' : 'text-warning')}>{cat?.name ?? (t.type === 'transfer' ? 'Transfer' : t.type === 'income' ? 'Gelir' : 'Kategorisiz')}</span>
                      <TxMeta t={t} group={t.groupId ? groups.get(t.groupId) : undefined} member={memberOf(t)} uncounted={markUncounted} />
                    </div>
                  </button>
                  <div className="shrink-0 text-right text-[14px] font-semibold">
                    <Money kurus={t.amountKurus} type={t.type} />
                  </div>
                  {onDelete && !compact && !isReadOnlyTx(t) && (
                    <IconButton label={`${t.description} sil`} size="sm" onClick={() => onDelete(t)} className="-mr-1 hover:text-danger">
                      <Trash2 className="size-4" />
                    </IconButton>
                  )}
                </div>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ul>
      {transactions.length > limit && (
        <p className="px-4 py-3 text-center text-[13px] text-subtle">
          İlk {limit} işlem gösteriliyor ({transactions.length} işlem). Filtreleri daraltın.
        </p>
      )}
    </div>
  )
}
