import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CATEGORY_COLORS, CycleSelect } from '../components/common'
import { ConfirmDialog, Modal } from '../components/ui/Modal'
import { Button, Card, EmptyState, Field, IconButton, Input, More } from '../components/ui/primitives'
import { setGroupCycle } from '../cloud/sync'
import { toUserMessage } from '../data/repository'
import type { SpendGroup } from '../domain/types'
import { cn } from '../lib/cn'
import { useStartNew } from '../lib/useStartNew'
import { useCloud, useMembers } from '../state/cloud'
import { useGroups, useRepo, useTransactions } from '../state/data'
import { useUi } from '../state/ui'
import { tt, ttf } from '../lib/i18n'

/**
 * Harcama grupları: kategoriden bağımsız ikinci gruplama (Bireysel, Ortak, İş…).
 * Bir işlem bir kategoriye ve isteğe bağlı olarak bir gruba ait olur.
 */
export function GroupsTab() {
  const groups = useGroups()
  const txs = useTransactions()
  const repo = useRepo()
  const { toast } = useUi()
  const [edit, setEdit] = useState<SpendGroup | 'new' | null>(null)
  useStartNew(() => setEdit('new'))
  const [del, setDel] = useState<SpendGroup | null>(null)
  const usage = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of txs ?? []) if (t.groupId) m.set(t.groupId, (m.get(t.groupId) ?? 0) + 1)
    return m
  }, [txs])

  if (!groups) return null
  const active = groups.filter((g) => !g.archived)
  const archived = groups.filter((g) => g.archived)
  const ungrouped = (txs ?? []).filter((t) => !t.groupId).length

  const toggleArchive = async (g: SpendGroup) => {
    try {
      await repo.updateGroup(g.id, { archived: !g.archived })
      toast(g.archived ? ttf('“{0}” yeniden etkin.', g.name) : ttf('“{0}” arşivlendi. Mevcut kayıtlar korunur; yeni kayıtlarda seçilemez.', g.name))
    } catch (e) {
      toast(toUserMessage(e), { kind: 'error' })
    }
  }

  const renderRow = (g: SpendGroup) => (
    <li key={g.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
      <span className="size-4 shrink-0 rounded-full" style={{ backgroundColor: g.color }} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{g.name}</div>
        <div className="num text-[12.5px] text-subtle">
          {ttf('{0} işlem {1}{2}', usage.get(g.id) ?? 0, g.cycleStartDay ? ttf(' · {0}. gün döngüsü', g.cycleStartDay) : '', g.cloudId ? tt(' · paylaşılan') : '')}
        </div>
      </div>
      <IconButton label={ttf('{0} düzenle', g.name)} size="sm" onClick={() => setEdit(g)}>
        <Pencil className="size-4" />
      </IconButton>
      <IconButton label={g.archived ? ttf('{0} arşivden çıkar', g.name) : ttf('{0} arşivle', g.name)} size="sm" onClick={() => toggleArchive(g)}>
        {g.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
      </IconButton>
      <IconButton label={`${g.name} sil`} size="sm" className="hover:text-danger" onClick={() => setDel(g)}>
        <Trash2 className="size-4" />
      </IconButton>
    </li>
  )

  const delCount = del ? (usage.get(del.id) ?? 0) : 0

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 text-[13px] text-muted">
          <p>
            {tt('Gruplar kategoriden ayrıdır.')}<span className="num"> {ttf('Grupsuz işlem: {0}.', ungrouped)}</span>
          </p>
          <More>{tt('Bir market alışverişi hem “Market” kategorisinde hem “Ortak” grubunda olabilir. Panelde ve işlemlerde gruba göre filtreleyebilirsiniz.')}</More>
        </div>
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEdit('new')}>
          {tt('Grup ekle')}
        </Button>
      </div>
      {active.length === 0 ? (
        <Card>
          <EmptyState icon={<Plus className="size-6" />} title={tt('Henüz grup yok')}>
            {tt('Harcamalarınızı “Ortak” veya “İş” gibi ayırın.')}
          </EmptyState>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul>{active.map(renderRow)}</ul>
        </Card>
      )}
      {archived.length > 0 && (
        <>
          <h2 className="mb-2 mt-6 px-1 text-sm font-semibold text-muted">{tt('Arşivdeki gruplar')}</h2>
          <Card className="overflow-hidden opacity-80">
            <ul>{archived.map(renderRow)}</ul>
          </Card>
        </>
      )}
      <GroupEditor value={edit} onClose={() => setEdit(null)} />
      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title={ttf('“{0}” grubu silinsin mi?', del?.name)}
        confirmLabel={tt('Sil')}
        danger
        onConfirm={async () => {
          if (!del) return
          try {
            const n = await repo.deleteGroup(del.id)
            toast(ttf('“{0}” silindi.{1}', del.name, n ? ttf(' {0} işlem grupsuz kaldı.', n) : ''))
            setDel(null)
          } catch (e) {
            toast(toUserMessage(e), { kind: 'error' })
          }
        }}
      >
        {delCount > 0 ? (
          <p>
            {tt('Bu grupta')} <strong className="text-ink">{ttf('{0} işlem', delCount)}</strong> {tt('var. İşlemler silinmez, yalnızca grupsuz kalır.')}
          </p>
        ) : (
          tt('Bu grup hiçbir işlemde kullanılmıyor.')
        )}
      </ConfirmDialog>
    </>
  )
}

function GroupEditor({ value, onClose }: { value: SpendGroup | 'new' | null; onClose: () => void }) {
  const repo = useRepo()
  const cloud = useCloud()
  const { map, selfId } = useMembers()
  const { toast } = useUi()
  const group = value && value !== 'new' ? value : null
  const [name, setName] = useState('')
  const [color, setColor] = useState(CATEGORY_COLORS[4])
  const [cycle, setCycle] = useState<number | null>(null)
  const [error, setError] = useState<string>()
  const [lastKey, setLastKey] = useState<string | null>(null)
  const key = value === 'new' ? 'new' : (value?.id ?? null)
  if (key !== lastKey) {
    setLastKey(key)
    setName(group?.name ?? '')
    setColor(group?.color ?? CATEGORY_COLORS[4])
    setCycle(group?.cycleStartDay ?? null)
    setError(undefined)
  }
  // Paylaşılan grubun döngüsünü yalnızca grubu paylaşıma açan (yönetici) değiştirebilir
  const owner = group?.cloudId && group.cloudOwnerId ? group.cloudOwnerId : null
  const canSetCycle = !owner || owner === selfId
  const ownerName = owner ? map.get(owner)?.name : undefined
  const save = async () => {
    try {
      if (group) await repo.updateGroup(group.id, { name, color })
      const saved = group ?? (await repo.addGroup({ name, color }))
      if (canSetCycle && (cycle ?? null) !== (saved.cycleStartDay ?? null)) await setGroupCycle(repo, cloud.backend, saved.id, cycle)
      toast(group ? tt('Grup güncellendi.') : tt('Grup eklendi.'))
      onClose()
    } catch (e) {
      setError(toUserMessage(e))
    }
  }
  return (
    <Modal
      open={!!value}
      onOpenChange={(o) => !o && onClose()}
      title={group ? tt('Grubu düzenle') : tt('Yeni grup')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tt('Vazgeç')}
          </Button>
          <Button variant="primary" onClick={save}>
            {tt('Kaydet')}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <Field label={tt('Ad')} htmlFor="group-name" error={error} hint={tt('Ör. Ortak, İş, Tatil')}>
          <Input id="group-name" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium text-muted">{tt('Renk')}</legend>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Renk ${c}`}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                className={cn('size-8 rounded-full ring-offset-2 ring-offset-surface transition-transform hover:scale-110', color === c && 'ring-2 ring-ink')}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </fieldset>
        <Field
          label={tt('Ay döngüsü')}
          htmlFor="group-cycle"
          hint={
            !canSetCycle
              ? ttf('Yalnızca grup yöneticisi{0} değiştirebilir.', ownerName ? ` (${ownerName})` : '')
              : group?.cloudId
                ? tt('Bütün üyeler için geçerlidir.')
                : tt('Bu grubun ayı bu gün başlar.')
          }
        >
          <CycleSelect id="group-cycle" value={cycle} onChange={setCycle} inheritLabel={tt('Kişisel ayarı kullan')} disabled={!canSetCycle} />
        </Field>
      </form>
    </Modal>
  )
}
