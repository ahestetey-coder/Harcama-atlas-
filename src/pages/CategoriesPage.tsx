import { Archive, ArchiveRestore, FlaskConical, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/AppShell'
import { CATEGORY_COLORS, CATEGORY_ICONS, CategoryIcon } from '../components/common'
import { ConfirmDialog, Modal } from '../components/ui/Modal'
import { Alert, Badge, Button, Card, EmptyState, Field, IconButton, Input, Segmented, Select, Switch } from '../components/ui/primitives'
import { toUserMessage } from '../data/repository'
import { normalizeText } from '../domain/normalize'
import { evaluateRules, findRuleConflicts, PRIORITY, validateRulePattern } from '../domain/rules'
import type { Category, Rule, RuleMatchMode } from '../domain/types'
import { cn } from '../lib/cn'
import { useCategories, useRepo, useRules, useTransactions } from '../state/data'
import { useUi } from '../state/ui'
import { GroupsTab } from './GroupsTab'

export default function CategoriesPage() {
  const [params, setParams] = useSearchParams()
  const tab = (['categories', 'groups', 'rules'] as const).find((t) => t === params.get('bolum')) ?? 'categories'
  const setTab = (t: 'categories' | 'groups' | 'rules') => setParams(t === 'categories' ? {} : { bolum: t }, { replace: true })
  return (
    <div>
      <PageHeader title="Kategoriler ve gruplar" subtitle="Kurallar yalnızca içe aktarmada öneri üretir; sizin seçtiğiniz kategoriyi asla ezmez." />
      <Segmented
        label="Bölüm"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'categories', label: 'Kategoriler' },
          { value: 'groups', label: 'Harcama grupları' },
          { value: 'rules', label: 'Eşleştirme kuralları' },
        ]}
        className="mb-4 max-w-full overflow-x-auto"
      />
      {tab === 'categories' ? <CategoriesTab /> : tab === 'groups' ? <GroupsTab /> : <RulesTab />}
    </div>
  )
}

function CategoriesTab() {
  const categories = useCategories()
  const txs = useTransactions()
  const rules = useRules()
  const repo = useRepo()
  const { toast } = useUi()
  const [edit, setEdit] = useState<Category | 'new' | null>(null)
  const [del, setDel] = useState<Category | null>(null)
  const [target, setTarget] = useState('')
  const usage = useMemo(() => {
    const m = new Map<string, { tx: number; rules: number }>()
    for (const t of txs ?? []) if (t.categoryId) m.set(t.categoryId, { tx: (m.get(t.categoryId)?.tx ?? 0) + 1, rules: m.get(t.categoryId)?.rules ?? 0 })
    for (const r of rules ?? []) m.set(r.categoryId, { tx: m.get(r.categoryId)?.tx ?? 0, rules: (m.get(r.categoryId)?.rules ?? 0) + 1 })
    return m
  }, [txs, rules])

  if (!categories) return null
  const active = categories.filter((c) => !c.archived)
  const archived = categories.filter((c) => c.archived)
  const delUsage = del ? (usage.get(del.id) ?? { tx: 0, rules: 0 }) : { tx: 0, rules: 0 }
  const needsTarget = delUsage.tx + delUsage.rules > 0

  const toggleArchive = async (c: Category) => {
    try {
      await repo.updateCategory(c.id, { archived: !c.archived })
      toast(c.archived ? `“${c.name}” yeniden etkin.` : `“${c.name}” arşivlendi. Mevcut kayıtlar korunur; yeni kayıtlarda seçilemez.`)
    } catch (e) {
      toast(toUserMessage(e), { kind: 'error' })
    }
  }

  const renderRow = (c: Category) => {
    const u = usage.get(c.id) ?? { tx: 0, rules: 0 }
    return (
      <li key={c.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
        <CategoryIcon category={c} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{c.name}</span>
            {c.system && <Badge>Sistem</Badge>}
          </div>
          <div className="num text-[12.5px] text-subtle">
            {u.tx} işlem · {u.rules} kural
          </div>
        </div>
        <IconButton label={`${c.name} düzenle`} size="sm" onClick={() => setEdit(c)}>
          <Pencil className="size-4" />
        </IconButton>
        {!c.system && (
          <IconButton label={c.archived ? `${c.name} arşivden çıkar` : `${c.name} arşivle`} size="sm" onClick={() => toggleArchive(c)}>
            {c.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
          </IconButton>
        )}
        {!c.system && (
          <IconButton
            label={`${c.name} sil`}
            size="sm"
            className="hover:text-danger"
            onClick={() => {
              setTarget('')
              setDel(c)
            }}
          >
            <Trash2 className="size-4" />
          </IconButton>
        )}
      </li>
    )
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEdit('new')}>
          Kategori ekle
        </Button>
      </div>
      <Card className="overflow-hidden">
        <ul>{active.map(renderRow)}</ul>
      </Card>
      {archived.length > 0 && (
        <>
          <h2 className="mb-2 mt-6 px-1 text-sm font-semibold text-muted">Arşivdeki kategoriler</h2>
          <Card className="overflow-hidden opacity-80">
            <ul>{archived.map(renderRow)}</ul>
          </Card>
        </>
      )}
      <CategoryEditor value={edit} onClose={() => setEdit(null)} />
      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title={`“${del?.name}” silinsin mi?`}
        confirmLabel={needsTarget ? 'Taşı ve sil' : 'Sil'}
        danger
        confirmDisabled={needsTarget && !target}
        onConfirm={async () => {
          if (!del) return
          try {
            await repo.deleteCategory(del.id, target || undefined)
            toast(`“${del.name}” silindi.${needsTarget ? ` Kayıtları “${categories.find((c) => c.id === target)?.name}” kategorisine taşındı.` : ''}`)
            setDel(null)
          } catch (e) {
            toast(toUserMessage(e), { kind: 'error' })
          }
        }}
      >
        {needsTarget ? (
          <>
            <p>
              Bu kategoride <strong className="text-ink">{delUsage.tx} işlem</strong> ve <strong className="text-ink">{delUsage.rules} kural</strong> var. Kayıtlar sahipsiz kalmasın diye taşınacakları kategoriyi seçin. Silmek yerine arşivlemeyi de düşünebilirsiniz.
            </p>
            <Field label="Taşınacak kategori" htmlFor="del-target" className="mt-3">
              <Select id="del-target" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Seçin…</option>
                {categories
                  .filter((c) => c.id !== del?.id && !c.archived)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </Select>
            </Field>
          </>
        ) : (
          'Bu kategori hiçbir işlemde veya kuralda kullanılmıyor.'
        )}
      </ConfirmDialog>
    </>
  )
}

function CategoryEditor({ value, onClose }: { value: Category | 'new' | null; onClose: () => void }) {
  const repo = useRepo()
  const { toast } = useUi()
  const cat = value && value !== 'new' ? value : null
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('shapes')
  const [color, setColor] = useState(CATEGORY_COLORS[0])
  const [error, setError] = useState<string>()
  const [lastKey, setLastKey] = useState<string | null>(null)
  const key = value === 'new' ? 'new' : (value?.id ?? null)
  if (key !== lastKey) {
    setLastKey(key)
    setName(cat?.name ?? '')
    setIcon(cat?.icon ?? 'shapes')
    setColor(cat?.color ?? CATEGORY_COLORS[0])
    setError(undefined)
  }
  const save = async () => {
    try {
      if (cat) await repo.updateCategory(cat.id, { name, icon, color })
      else await repo.addCategory({ name, icon, color })
      toast(cat ? 'Kategori güncellendi.' : 'Kategori eklendi.')
      onClose()
    } catch (e) {
      setError(toUserMessage(e))
    }
  }
  return (
    <Modal
      open={!!value}
      onOpenChange={(o) => !o && onClose()}
      title={cat ? 'Kategoriyi düzenle' : 'Yeni kategori'}
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
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
          <CategoryIcon category={{ icon, color }} size="lg" />
          <span className="font-semibold">{name || 'Kategori adı'}</span>
        </div>
        <Field label="Ad" htmlFor="cat-name" error={error}>
          <Input id="cat-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium text-muted">İkon</legend>
          <div className="grid grid-cols-8 gap-1.5">
            {Object.entries(CATEGORY_ICONS).map(([k, Icon]) => (
              <button
                key={k}
                type="button"
                aria-label={k}
                aria-pressed={icon === k}
                onClick={() => setIcon(k)}
                className={cn('grid aspect-square place-items-center rounded-xl border transition-colors', icon === k ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:bg-surface-2')}
              >
                <Icon className="size-[18px]" />
              </button>
            ))}
          </div>
        </fieldset>
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
      </div>
    </Modal>
  )
}

const MODE_LABEL: Record<RuleMatchMode, string> = { word: 'Tam kelime/ifade', prefix: 'Kelime başı', contains: 'İçinde geçer' }
const ORIGIN_LABEL: Record<Rule['origin'], string> = { default: 'Hazır', user: 'Sizin', learned: 'Öğrenilmiş' }

function RulesTab() {
  const rules = useRules()
  const categories = useCategories()
  const repo = useRepo()
  const { toast } = useUi()
  const [edit, setEdit] = useState<Rule | 'new' | null>(null)
  const [test, setTest] = useState('')
  const [q, setQ] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const catMap = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories])
  const conflicts = useMemo(() => findRuleConflicts(rules ?? []), [rules])
  const conflictIds = useMemo(() => new Set(conflicts.flatMap((c) => [c.a.id, c.b.id])), [conflicts])
  const evaluation = useMemo(() => (test.trim() && rules ? evaluateRules(rules, normalizeText(test)) : null), [test, rules])
  if (!rules || !categories) return null
  const sorted = [...rules]
    .filter((r) => (!q || normalizeText(r.pattern).includes(normalizeText(q))) && (!catFilter || r.categoryId === catFilter))
    .sort((a, b) => b.priority - a.priority || (catMap.get(a.categoryId)?.name ?? '').localeCompare(catMap.get(b.categoryId)?.name ?? '', 'tr') || a.pattern.localeCompare(b.pattern, 'tr'))

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap gap-2">
          <Input placeholder="Kural ara…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs flex-1" aria-label="Kural ara" />
          <Select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="w-auto" aria-label="Kategoriye göre süz">
            <option value="">Tüm kategoriler</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Button variant="primary" className="ml-auto" icon={<Plus className="size-4" />} onClick={() => setEdit('new')}>
            Kural ekle
          </Button>
        </div>
        {conflicts.length > 0 && (
          <Alert tone="warning" icon={<TriangleAlert />} title={`${conflicts.length} olası çakışma`} className="mb-3">
            <ul className="mt-1 space-y-0.5">
              {conflicts.slice(0, 5).map((c, i) => (
                <li key={i}>
                  “{c.a.pattern}” → {catMap.get(c.a.categoryId)?.name} / “{c.b.pattern}” → {catMap.get(c.b.categoryId)?.name}: {c.reason}
                </li>
              ))}
            </ul>
            <p className="mt-1">Çakışmada öncelik değeri büyük olan, eşitse daha uzun (özgül) ifade, o da eşitse eski kural kazanır.</p>
          </Alert>
        )}
        <Card className="overflow-hidden">
          {sorted.length === 0 ? (
            <EmptyState icon={<FlaskConical className="size-6" />} title="Kural bulunamadı" />
          ) : (
            <ul>
              {sorted.map((r) => {
                const c = catMap.get(r.categoryId)
                return (
                  <li key={r.id} className={cn('flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0', !r.enabled && 'opacity-55')}>
                    <CategoryIcon category={c} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[13px] font-semibold">{r.pattern}</span>
                        <span className="text-[12.5px] text-subtle">→ {c?.name ?? '?'}</span>
                        {conflictIds.has(r.id) && <Badge tone="warning">Çakışma</Badge>}
                      </div>
                      <div className="num text-[12px] text-subtle">
                        {MODE_LABEL[r.matchMode]} · öncelik {r.priority} · {ORIGIN_LABEL[r.origin]}
                      </div>
                    </div>
                    <Switch
                      checked={r.enabled}
                      label={`${r.pattern} kuralı ${r.enabled ? 'açık' : 'kapalı'}`}
                      onChange={async (v) => {
                        try {
                          await repo.saveRule({ ...r, enabled: v })
                        } catch (e) {
                          toast(toUserMessage(e), { kind: 'error' })
                        }
                      }}
                    />
                    <IconButton label={`${r.pattern} kuralını düzenle`} size="sm" onClick={() => setEdit(r)}>
                      <Pencil className="size-4" />
                    </IconButton>
                    <IconButton
                      label={`${r.pattern} kuralını sil`}
                      size="sm"
                      className="hover:text-danger"
                      onClick={async () => {
                        await repo.deleteRule(r.id)
                        toast('Kural silindi.', { action: { label: 'Geri al', onClick: () => void repo.db.rules.put(r) } })
                      }}
                    >
                      <Trash2 className="size-4" />
                    </IconButton>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>
      <div>
        <Card className="sticky top-4 p-5">
          <h2 className="font-display text-base font-semibold">Kural deneme</h2>
          <p className="mt-1 text-[13px] text-muted">Bir açıklama yazın; hangi kuralların eşleştiğini ve hangisinin kazandığını görün.</p>
          <Input className="mt-3" placeholder="Ör. MİGROS KANGURU KADIKÖY" value={test} onChange={(e) => setTest(e.target.value)} aria-label="Denenecek açıklama" />
          {evaluation && (
            <div className="mt-3 text-[13px]">
              <p className="font-mono text-[11.5px] text-subtle">Normalize: {normalizeText(test)}</p>
              {evaluation.winner ? (
                <ol className="mt-2 space-y-1.5">
                  {evaluation.matches.map((m, i) => (
                    <li key={m.rule.id} className={cn('flex items-center gap-2 rounded-xl px-2 py-1.5', i === 0 ? 'bg-accent-soft' : 'bg-surface-2')}>
                      <span className="num w-4 text-subtle">{i + 1}</span>
                      <CategoryIcon category={catMap.get(m.rule.categoryId)} size="sm" />
                      <span className="min-w-0 flex-1 truncate">
                        “{m.rule.pattern}” → {catMap.get(m.rule.categoryId)?.name}
                      </span>
                      <span className="num text-[11.5px] text-subtle">{m.rule.priority}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-2 rounded-xl bg-warning-soft px-3 py-2 text-warning">Eşleşen kural yok: içe aktarmada “Kategori seçilmeli” olarak gösterilir.</p>
              )}
              {evaluation.conflict && <p className="mt-2 text-warning">Farklı kategorilere giden kurallar eşleşti; ilk sıradaki uygulanır.</p>}
            </div>
          )}
        </Card>
      </div>
      <RuleEditor value={edit} onClose={() => setEdit(null)} categories={categories} />
    </div>
  )
}

function RuleEditor({ value, onClose, categories }: { value: Rule | 'new' | null; onClose: () => void; categories: Category[] }) {
  const repo = useRepo()
  const { toast } = useUi()
  const rule = value && value !== 'new' ? value : null
  const [pattern, setPattern] = useState('')
  const [mode, setMode] = useState<RuleMatchMode>('word')
  const [categoryId, setCategoryId] = useState('')
  const [priority, setPriority] = useState(String(PRIORITY.user))
  const [error, setError] = useState<string>()
  const [lastKey, setLastKey] = useState<string | null>(null)
  const key = value === 'new' ? 'new' : (value?.id ?? null)
  if (key !== lastKey) {
    setLastKey(key)
    setPattern(rule?.pattern ?? '')
    setMode(rule?.matchMode ?? 'word')
    setCategoryId(rule?.categoryId ?? '')
    setPriority(String(rule?.priority ?? PRIORITY.user))
    setError(undefined)
  }
  const patternError = pattern.trim() ? validateRulePattern(pattern, mode) : null
  const save = async () => {
    if (!categoryId) return setError('Kategori seçin.')
    const p = Number(priority)
    if (!Number.isFinite(p) || p < 0 || p > 1000) return setError('Öncelik 0–1000 arasında olmalı.')
    try {
      await repo.saveRule({ id: rule?.id, pattern, matchMode: mode, categoryId, priority: p, enabled: rule?.enabled ?? true })
      toast(rule ? 'Kural güncellendi.' : 'Kural eklendi.')
      onClose()
    } catch (e) {
      setError(toUserMessage(e))
    }
  }
  return (
    <Modal
      open={!!value}
      onOpenChange={(o) => !o && onClose()}
      title={rule ? 'Kuralı düzenle' : 'Yeni kural'}
      description="Açıklamalar Türkçe harf, büyük/küçük harf ve boşluk açısından normalize edilerek karşılaştırılır."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button variant="primary" onClick={save} disabled={!!patternError || !pattern.trim()}>
            Kaydet
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Eşleşecek ifade" htmlFor="rule-pattern" error={patternError ?? undefined} hint={pattern ? `Normalize: ${normalizeText(pattern)}` : 'Ör. PETROL OFİSİ'}>
          <Input id="rule-pattern" value={pattern} maxLength={80} onChange={(e) => setPattern(e.target.value)} autoFocus />
        </Field>
        <Field label="Eşleşme türü" htmlFor="rule-mode" hint="Kısa ifadeler için “Tam kelime” kullanın; “BİM” böylece “BİMEKS” ile eşleşmez.">
          <Select id="rule-mode" value={mode} onChange={(e) => setMode(e.target.value as RuleMatchMode)}>
            <option value="word">Tam kelime/ifade (önerilen)</option>
            <option value="prefix">Kelime başı (en az 4 harf)</option>
            <option value="contains">İçinde geçer (en az 5 harf)</option>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kategori" htmlFor="rule-cat">
            <Select id="rule-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Seçin…</option>
              {categories
                .filter((c) => !c.archived)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Öncelik" htmlFor="rule-pri" hint={`Hazır: ${PRIORITY.default}, sizin: ${PRIORITY.user}, öğrenilmiş: ${PRIORITY.learned}`}>
            <Input id="rule-pri" inputMode="numeric" value={priority} onChange={(e) => setPriority(e.target.value.replace(/[^\d]/g, ''))} className="num" />
          </Field>
        </div>
        {error && <p className="text-sm font-medium text-danger">{error}</p>}
      </div>
    </Modal>
  )
}
