import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CATEGORY_COLORS, CycleSelect } from '../components/common'
import { ConfirmDialog, Modal } from '../components/ui/Modal'
import { Button, Card, EmptyState, Field, IconButton, Input } from '../components/ui/primitives'
import { setGroupCycle } from '../cloud/sync'
import { toUserMessage } from '../data/repository'
import type { SpendGroup } from '../domain/types'
import { cn } from '../lib/cn'
import { useStartNew } from '../lib/useStartNew'
import { useCloud, useMembers } from '../state/cloud'
import { useGroups, useRepo, useTransactions } from '../state/data'
import { useUi } from '../state/ui'

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
      toast(g.archived ? `“${g.name}” yeniden etkin.` : `“${g.name}” arşivlendi. Mevcut kayıtlar korunur; yeni kayıtlarda seçilemez.`)
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
          {usage.get(g.id) ?? 0} işlem
          {g.cycleStartDay ? ` · ${g.cycleStartDay}. gün döngüsü` : ''}
          {g.cloudId ? ' · paylaşılan' : ''}
        </div>
      </div>
      <IconButton label={`${g.name} düzenle`} size="sm" onClick={() => setEdit(g)}>
        <Pencil className="size-4" />
      </IconButton>
      <IconButton label={g.archived ? `${g.name} arşivden çıkar` : `${g.name} arşivle`} size="sm" onClick={() => toggleArchive(g)}>
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
        <p className="min-w-0 flex-1 text-[13px] text-muted">
          Gruplar kategoriden ayrıdır: bir market alışverişi hem “Market” kategorisinde hem “Ortak” grubunda olabilir. Panelde ve işlemler listesinde gruba göre filtreleyebilirsiniz.
          <span className="num"> Grupsuz işlem: {ungrouped}.</span>
        </p>
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEdit('new')}>
          Grup ekle
        </Button>
      </div>
      {active.length === 0 ? (
        <Card>
          <EmptyState icon={<Plus className="size-6" />} title="Henüz grup yok">
            “Bireysel”, “Ortak” veya “İş” gibi gruplar ekleyerek harcamalarınızı kategoriden bağımsız ayırabilirsiniz.
          </EmptyState>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul>{active.map(renderRow)}</ul>
        </Card>
      )}
      {archived.length > 0 && (
        <>
          <h2 className="mb-2 mt-6 px-1 text-sm font-semibold text-muted">Arşivdeki gruplar</h2>
          <Card className="overflow-hidden opacity-80">
            <ul>{archived.map(renderRow)}</ul>
          </Card>
        </>
      )}
      <GroupEditor value={edit} onClose={() => setEdit(null)} />
      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title={`“${del?.name}” grubu silinsin mi?`}
        confirmLabel="Sil"
        danger
        onConfirm={async () => {
          if (!del) return
          try {
            const n = await repo.deleteGroup(del.id)
            toast(`“${del.name}” silindi.${n ? ` ${n} işlem grupsuz kaldı.` : ''}`)
            setDel(null)
          } catch (e) {
            toast(toUserMessage(e), { kind: 'error' })
          }
        }}
      >
        {delCount > 0 ? (
          <p>
            Bu grupta <strong className="text-ink">{delCount} işlem</strong> var. İşlemler silinmez, yalnızca grupsuz kalır.
          </p>
        ) : (
          'Bu grup hiçbir işlemde kullanılmıyor.'
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
      toast(group ? 'Grup güncellendi.' : 'Grup eklendi.')
      onClose()
    } catch (e) {
      setError(toUserMessage(e))
    }
  }
  return (
    <Modal
      open={!!value}
      onOpenChange={(o) => !o && onClose()}
      title={group ? 'Grubu düzenle' : 'Yeni grup'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button variant="primary" onClick={save}>
            Kaydet
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
        <Field label="Ad" htmlFor="group-name" error={error} hint="Ör. Bireysel, Ortak, İş, Ev, Tatil">
          <Input id="group-name" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium text-muted">Renk</legend>
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
          label="Ay döngüsü"
          htmlFor="group-cycle"
          hint={
            !canSetCycle
              ? `Bu paylaşılan grubun döngüsünü yalnızca grup yöneticisi${ownerName ? ` (${ownerName})` : ''} değiştirebilir.`
              : group?.cloudId
                ? 'Gruptaki bütün üyelerin panelinde bu döngü kullanılır.'
                : 'Panelde bu grup seçiliyken aylar bu güne göre hesaplanır.'
          }
        >
          <CycleSelect id="group-cycle" value={cycle} onChange={setCycle} inheritLabel="Kişisel ayarı kullan" disabled={!canSetCycle} />
        </Field>
      </form>
    </Modal>
  )
}
