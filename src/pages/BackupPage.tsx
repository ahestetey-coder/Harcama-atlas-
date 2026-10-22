import { Download, FileJson, HardDrive, ShieldAlert, Trash2, TriangleAlert, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { PageHeader } from '../components/AppShell'
import { ConfirmDialog, Modal } from '../components/ui/Modal'
import { Alert, Button, Card, Field, Input, More, Segmented } from '../components/ui/primitives'
import { backupFileName, parseBackup, type Backup } from '../data/backup'
import { toUserMessage, type RestoreMode } from '../data/repository'
import { downloadBlob } from '../lib/download'
import { useData } from '../state/data'
import { useUi } from '../state/ui'
import { tt, ttf } from '../lib/i18n'

export default function BackupPage() {
  const { repo, isDemo } = useData()
  const { toast } = useUi()
  const [counts, setCounts] = useState<{ transactions: number; categories: number; rules: number; imports: number } | null>(null)
  const [pending, setPending] = useState<{ backup: Backup; fileName: string } | null>(null)
  const [mode, setMode] = useState<RestoreMode>('merge')
  const [restoring, setRestoring] = useState(false)
  const [parseError, setParseError] = useState<{ message: string; details?: string[] } | null>(null)
  const [wipeOpen, setWipeOpen] = useState(false)
  const [wipeText, setWipeText] = useState('')
  const [storage, setStorage] = useState<{ usage?: number; quota?: number; persisted?: boolean } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const refresh = () => repo.counts().then(setCounts).catch(() => setCounts(null))
  useEffect(() => {
    void refresh()
    void (async () => {
      try {
        const est = await navigator.storage?.estimate?.()
        const persisted = await navigator.storage?.persisted?.()
        setStorage({ usage: est?.usage, quota: est?.quota, persisted })
      } catch {
        setStorage(null)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo])

  const exportBackup = async () => {
    try {
      const b = await repo.exportBackup()
      downloadBlob(new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' }), isDemo ? backupFileName().replace('-yedek-', '-demo-yedek-') : backupFileName())
      toast(ttf('Yedek indirildi: {0} işlem, {1} kategori, {2} kural.', b.data.transactions.length, b.data.categories.length, b.data.rules.length))
    } catch (e) {
      toast(toUserMessage(e), { kind: 'error' })
    }
  }

  const onFile = async (f: File | undefined) => {
    if (!f) return
    setParseError(null)
    if (f.size > 50 * 1024 * 1024) return setParseError({ message: tt('Dosya çok büyük (50 MB sınırı).') })
    const r = parseBackup(await f.text())
    if (fileRef.current) fileRef.current.value = ''
    if (!r.ok) return setParseError({ message: r.message, details: r.details })
    setMode('merge')
    setPending({ backup: r.backup, fileName: f.name })
  }

  const restore = async () => {
    if (!pending) return
    setRestoring(true)
    try {
      const rep = await repo.restoreBackup(pending.backup, mode)
      toast(
        mode === 'replace'
          ? ttf('Geri yüklendi: {0} işlem, {1} kategori, {2} kural.', rep.added.transactions, rep.added.categories, rep.added.rules)
          : ttf('Birleştirildi: {0} yeni işlem eklendi, {1} mevcut işlem korundu.', rep.added.transactions, rep.skipped.transactions),
      )
      setPending(null)
      void refresh()
    } catch (e) {
      toast(toUserMessage(e), { kind: 'error' })
    } finally {
      setRestoring(false)
    }
  }

  const wipe = async () => {
    try {
      await repo.clearAll()
      toast(isDemo ? tt('Demo verileri silindi.') : tt('Bütün veriler silindi. Başlangıç kategorileri ve kuralları yeniden oluşturuldu.'))
      setWipeOpen(false)
      setWipeText('')
      void refresh()
    } catch (e) {
      toast(toUserMessage(e), { kind: 'error' })
    }
  }

  const b = pending?.backup
  const mb = (n?: number) => (n === undefined ? '—' : `${(n / 1048576).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB`)

  return (
    <div>
      <PageHeader title={tt('Yedekleme ve veri')} subtitle={isDemo ? tt('Yalnızca demo verisi etkilenir') : tt('Düzenli yedek almayı unutmayın')} />

      <Alert tone="warning" icon={<ShieldAlert />} title={tt('Tarayıcı verilerini silmek kayıtlarınızı da siler')} className="mb-4">
        {tt('Sunucuda kopyası yoktur; düzenli JSON yedeği indirin.')}
        <More label={tt('Neden?')}>
          {tt('Veriler bu tarayıcıda (IndexedDB) tutulur. Site verilerini temizlemek, gizli pencere, tarayıcıyı kaldırmak veya cihazın yer açması kayıtları kalıcı olarak silebilir.')}
        </More>
      </Alert>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <Download className="size-5 text-accent" /> {tt('Yedek al')}
          </h2>
          <p className="mt-1 text-sm text-muted">{tt('Tüm kayıtlarınız tek bir JSON dosyasında.')}</p>
          {counts && (
            <dl className="num mt-4 grid grid-cols-4 gap-2 rounded-2xl bg-surface-2 p-3 text-center">
              {(
                [
                  [tt('İşlem'), counts.transactions],
                  ['Kategori', counts.categories],
                  ['Kural', counts.rules],
                  [tt('Aktarım'), counts.imports],
                ] as const
              ).map(([l, n]) => (
                <div key={l}>
                  <dt className="text-[11.5px] text-subtle">{l}</dt>
                  <dd className="font-semibold">{n}</dd>
                </div>
              ))}
            </dl>
          )}
          <Button variant="primary" className="mt-4" icon={<FileJson className="size-4" />} onClick={exportBackup}>
            {tt('JSON yedeği indir')}
          </Button>
        </Card>

        <Card className="p-5">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <Upload className="size-5 text-accent" /> {tt('Yedekten geri yükle')}
          </h2>
          <p className="mt-1 text-sm text-muted">{tt('Onaylamadan hiçbir veri değişmez.')}</p>
          <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" id="restore-file" onChange={(e) => onFile(e.target.files?.[0])} />
          <Button className="mt-4" icon={<Upload className="size-4" />} onClick={() => fileRef.current?.click()}>
            {tt('Yedek dosyası seç')}
          </Button>
          {parseError && (
            <Alert tone="danger" icon={<TriangleAlert />} title={parseError.message} className="mt-3">
              {parseError.details && (
                <ul className="mt-1 list-disc pl-4 font-mono text-[11.5px]">
                  {parseError.details.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              )}
            </Alert>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <HardDrive className="size-5 text-accent" /> {tt('Depolama')}
          </h2>
          <p className="num mt-2 text-sm text-muted">
            {ttf('Kullanılan: {0} / tarayıcının ayırdığı: {1}', mb(storage?.usage), mb(storage?.quota))}
          </p>
          <p className="mt-1 text-sm text-muted">
            {ttf('Kalıcı depolama: {0}', storage?.persisted ? 'verildi' : tt('verilmedi (tarayıcı silebilir)'))}
          </p>
          {!storage?.persisted && 'storage' in navigator && (
            <Button
              size="sm"
              className="mt-3"
              onClick={async () => {
                const ok = await navigator.storage.persist?.()
                setStorage((s) => ({ ...s, persisted: !!ok }))
                toast(ok ? tt('Kalıcı depolama izni verildi.') : tt('Tarayıcı kalıcı depolama iznini vermedi. Düzenli yedek almaya devam edin.'), { kind: ok ? 'success' : 'info' })
              }}
            >
              {tt('Kalıcı depolama iste')}
            </Button>
          )}
        </Card>

        <Card className="border-danger/25 p-5">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold text-danger">
            <Trash2 className="size-5" /> {isDemo ? tt('Demo verilerini sil') : tt('Bütün verileri sil')}
          </h2>
          <p className="mt-1 text-sm text-muted">{tt('Geri alınamaz; önce yedek alın.')}</p>
          <Button variant="danger" className="mt-4" icon={<Trash2 className="size-4" />} onClick={() => setWipeOpen(true)}>
            {tt('Verileri sil…')}
          </Button>
        </Card>
      </div>

      <Modal
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title={tt('Yedeği geri yükle')}
        description={pending?.fileName}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              {tt('Vazgeç')}
            </Button>
            <Button variant={mode === 'replace' ? 'danger' : 'primary'} onClick={restore} loading={restoring}>
              {mode === 'replace' ? tt('Mevcut verileri değiştir') : tt('Birleştir')}
            </Button>
          </>
        }
      >
        {b && counts && (
          <div className="flex flex-col gap-4 text-sm">
            <p className="text-muted">
              {ttf('Yedek tarihi: {0} · şema sürümü {1}', new Date(b.exportedAt).toLocaleString('tr-TR'), b.schemaVersion)}
            </p>
            <table className="num w-full text-left">
              <thead className="text-[12px] text-subtle">
                <tr>
                  <th className="py-1 font-medium"></th>
                  <th className="py-1 font-medium">{tt('Şu an')}</th>
                  <th className="py-1 font-medium">{tt('Yedekte')}</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    [tt('İşlem'), counts.transactions, b.data.transactions.length],
                    ['Kategori', counts.categories, b.data.categories.length],
                    ['Kural', counts.rules, b.data.rules.length],
                    [tt('Aktarım'), counts.imports, b.data.imports.length],
                  ] as const
                ).map(([l, a, c]) => (
                  <tr key={l} className="border-t border-line">
                    <td className="py-1.5 text-muted">{l}</td>
                    <td className="py-1.5">{a}</td>
                    <td className="py-1.5 font-semibold">{c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Segmented
              label={tt('Geri yükleme türü')}
              value={mode}
              onChange={setMode}
              options={[
                { value: 'merge', label: tt('Birleştir') },
                { value: 'replace', label: tt('Değiştir') },
              ]}
              className="w-full"
            />
            {mode === 'merge' ? (
              <Alert tone="info">{tt('Yalnızca burada olmayan kayıtlar eklenir, mevcutlar korunur.')}</Alert>
            ) : (
              <Alert tone="danger" icon={<TriangleAlert />} title={ttf('Mevcut {0} işlem silinecek', counts.transactions)}>
                {tt('Bütün mevcut veriler silinip yerine yedek yüklenecek.')}
                <button type="button" onClick={exportBackup} className="mt-1 block font-semibold text-accent hover:underline">
                  {tt('Önce mevcut verilerin yedeğini indir')}
                </button>
              </Alert>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={wipeOpen}
        onOpenChange={(o) => {
          setWipeOpen(o)
          if (!o) setWipeText('')
        }}
        title={isDemo ? tt('Demo verileri silinsin mi?') : tt('Bütün veriler silinsin mi?')}
        confirmLabel={tt('Kalıcı olarak sil')}
        danger
        confirmDisabled={wipeText.trim().toLocaleUpperCase('tr-TR') !== tt('SİL')}
        onConfirm={wipe}
      >
        <p>
          {counts?.transactions ?? 0} {tt('işlem ve bütün ayarlar silinecek. Onaylamak için aşağıya')} <strong className="text-ink">{tt('SİL')}</strong> {tt('yazın.')}
        </p>
        <Field label={tt('Onay')} htmlFor="wipe-confirm" className="mt-3">
          <Input id="wipe-confirm" value={wipeText} onChange={(e) => setWipeText(e.target.value)} autoComplete="off" />
        </Field>
      </ConfirmDialog>
    </div>
  )
}
