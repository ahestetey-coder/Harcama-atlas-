import { Download, FileJson, HardDrive, ShieldAlert, Trash2, TriangleAlert, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { PageHeader } from '../components/AppShell'
import { ConfirmDialog, Modal } from '../components/ui/Modal'
import { Alert, Button, Card, Field, Input, Segmented } from '../components/ui/primitives'
import { backupFileName, parseBackup, type Backup } from '../data/backup'
import { toUserMessage, type RestoreMode } from '../data/repository'
import { downloadBlob } from '../lib/download'
import { useData } from '../state/data'
import { useUi } from '../state/ui'

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
      toast(`Yedek indirildi: ${b.data.transactions.length} işlem, ${b.data.categories.length} kategori, ${b.data.rules.length} kural.`)
    } catch (e) {
      toast(toUserMessage(e), { kind: 'error' })
    }
  }

  const onFile = async (f: File | undefined) => {
    if (!f) return
    setParseError(null)
    if (f.size > 50 * 1024 * 1024) return setParseError({ message: 'Dosya çok büyük (50 MB sınırı).' })
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
          ? `Geri yüklendi: ${rep.added.transactions} işlem, ${rep.added.categories} kategori, ${rep.added.rules} kural.`
          : `Birleştirildi: ${rep.added.transactions} yeni işlem eklendi, ${rep.skipped.transactions} mevcut işlem korundu.`,
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
      toast(isDemo ? 'Demo verileri silindi.' : 'Bütün veriler silindi. Başlangıç kategorileri ve kuralları yeniden oluşturuldu.')
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
      <PageHeader title="Yedekleme ve veri" subtitle={isDemo ? 'Demo modundasınız: bu sayfadaki işlemler yalnızca demo verisini etkiler.' : 'Kayıtlarınız yalnızca bu tarayıcıda. Düzenli yedek almanızı öneririz.'} />

      <Alert tone="warning" icon={<ShieldAlert />} title="Tarayıcı verilerini silmek kayıtlarınızı da siler" className="mb-4">
        Veriler bu tarayıcının depolama alanında (IndexedDB) tutulur; bir sunucuda kopyası yoktur. Tarayıcı geçmişini/site verilerini temizlemek, gizli pencere kullanmak, tarayıcıyı kaldırmak veya cihazın depolama alanını boşaltması kayıtların
        kalıcı olarak kaybolmasına yol açabilir. Önemli verileriniz için düzenli olarak JSON yedeği indirin ve güvenli bir yerde saklayın.
      </Alert>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <Download className="size-5 text-accent" /> Yedek al
          </h2>
          <p className="mt-1 text-sm text-muted">İşlemler, kategoriler, kurallar, aktarım geçmişi ve ayarları içeren tam JSON yedeği.</p>
          {counts && (
            <dl className="num mt-4 grid grid-cols-4 gap-2 rounded-2xl bg-surface-2 p-3 text-center">
              {(
                [
                  ['İşlem', counts.transactions],
                  ['Kategori', counts.categories],
                  ['Kural', counts.rules],
                  ['Aktarım', counts.imports],
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
            JSON yedeği indir
          </Button>
        </Card>

        <Card className="p-5">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <Upload className="size-5 text-accent" /> Yedekten geri yükle
          </h2>
          <p className="mt-1 text-sm text-muted">Dosya önce doğrulanır; etkisi gösterilmeden hiçbir veri değişmez.</p>
          <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" id="restore-file" onChange={(e) => onFile(e.target.files?.[0])} />
          <Button className="mt-4" icon={<Upload className="size-4" />} onClick={() => fileRef.current?.click()}>
            Yedek dosyası seç
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
            <HardDrive className="size-5 text-accent" /> Depolama
          </h2>
          <p className="num mt-2 text-sm text-muted">
            Kullanılan: {mb(storage?.usage)} / tarayıcının ayırdığı: {mb(storage?.quota)}
          </p>
          <p className="mt-1 text-sm text-muted">
            Kalıcı depolama: {storage?.persisted ? 'verildi (tarayıcı alan açmak için kendiliğinden silmez)' : 'verilmedi (alan azalınca tarayıcı silebilir)'}
          </p>
          {!storage?.persisted && 'storage' in navigator && (
            <Button
              size="sm"
              className="mt-3"
              onClick={async () => {
                const ok = await navigator.storage.persist?.()
                setStorage((s) => ({ ...s, persisted: !!ok }))
                toast(ok ? 'Kalıcı depolama izni verildi.' : 'Tarayıcı kalıcı depolama iznini vermedi. Düzenli yedek almaya devam edin.', { kind: ok ? 'success' : 'info' })
              }}
            >
              Kalıcı depolama iste
            </Button>
          )}
        </Card>

        <Card className="border-danger/25 p-5">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold text-danger">
            <Trash2 className="size-5" /> {isDemo ? 'Demo verilerini sil' : 'Bütün verileri sil'}
          </h2>
          <p className="mt-1 text-sm text-muted">İşlemler, özel kategoriler, kurallar, aktarım geçmişi ve ayarlar silinir. Bu işlem geri alınamaz; önce yedek almanız önerilir.</p>
          <Button variant="danger" className="mt-4" icon={<Trash2 className="size-4" />} onClick={() => setWipeOpen(true)}>
            Verileri sil…
          </Button>
        </Card>
      </div>

      <Modal
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title="Yedeği geri yükle"
        description={pending?.fileName}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Vazgeç
            </Button>
            <Button variant={mode === 'replace' ? 'danger' : 'primary'} onClick={restore} loading={restoring}>
              {mode === 'replace' ? 'Mevcut verileri değiştir' : 'Birleştir'}
            </Button>
          </>
        }
      >
        {b && counts && (
          <div className="flex flex-col gap-4 text-sm">
            <p className="text-muted">
              Yedek tarihi: {new Date(b.exportedAt).toLocaleString('tr-TR')} · şema sürümü {b.schemaVersion}
            </p>
            <table className="num w-full text-left">
              <thead className="text-[12px] text-subtle">
                <tr>
                  <th className="py-1 font-medium"></th>
                  <th className="py-1 font-medium">Şu an</th>
                  <th className="py-1 font-medium">Yedekte</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ['İşlem', counts.transactions, b.data.transactions.length],
                    ['Kategori', counts.categories, b.data.categories.length],
                    ['Kural', counts.rules, b.data.rules.length],
                    ['Aktarım', counts.imports, b.data.imports.length],
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
              label="Geri yükleme türü"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'merge', label: 'Birleştir' },
                { value: 'replace', label: 'Değiştir' },
              ]}
              className="w-full"
            />
            {mode === 'merge' ? (
              <Alert tone="info">Yedekteki kayıtlardan yalnızca burada olmayanlar eklenir. Aynı kimlikli mevcut kayıtlar korunur, üzerine yazılmaz.</Alert>
            ) : (
              <Alert tone="danger" icon={<TriangleAlert />} title={`Mevcut ${counts.transactions} işlem silinecek`}>
                Bütün mevcut veriler silinip yerine yedek yüklenecek. Emin değilseniz önce mevcut verilerin yedeğini alın.
                <button type="button" onClick={exportBackup} className="mt-1 block font-semibold text-accent hover:underline">
                  Önce mevcut verilerin yedeğini indir
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
        title={isDemo ? 'Demo verileri silinsin mi?' : 'Bütün veriler silinsin mi?'}
        confirmLabel="Kalıcı olarak sil"
        danger
        confirmDisabled={wipeText.trim().toLocaleUpperCase('tr-TR') !== 'SİL'}
        onConfirm={wipe}
      >
        <p>
          {counts?.transactions ?? 0} işlem ve bütün ayarlar silinecek. Onaylamak için aşağıya <strong className="text-ink">SİL</strong> yazın.
        </p>
        <Field label="Onay" htmlFor="wipe-confirm" className="mt-3">
          <Input id="wipe-confirm" value={wipeText} onChange={(e) => setWipeText(e.target.value)} autoComplete="off" />
        </Field>
      </ConfirmDialog>
    </div>
  )
}
