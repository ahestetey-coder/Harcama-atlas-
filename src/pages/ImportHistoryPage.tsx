import { FileSpreadsheet, FileText, History, Image as ImageIcon, ListOrdered, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/AppShell'
import { ConfirmDialog } from '../components/ui/Modal'
import { Badge, Button, Card, EmptyState } from '../components/ui/primitives'
import { toUserMessage } from '../data/repository'
import { formatKurus } from '../domain/money'
import type { ImportRecord } from '../domain/types'
import { useImports, useRepo } from '../state/data'
import { useUi } from '../state/ui'
import { tt, ttf } from '../lib/i18n'

const KIND_ICON = { pdf: FileText, csv: FileSpreadsheet, xlsx: FileSpreadsheet, image: ImageIcon }
const KIND_LABEL = { pdf: 'PDF', csv: 'CSV', xlsx: 'Excel', image: tt('Görsel') }

export default function ImportHistoryPage() {
  const imports = useImports()
  const repo = useRepo()
  const { toast, openImport } = useUi()
  const navigate = useNavigate()
  const [undo, setUndo] = useState<{ rec: ImportRecord; count: number; edited: number } | null>(null)
  const [busy, setBusy] = useState(false)

  const askUndo = async (rec: ImportRecord) => {
    const impact = await repo.importImpact(rec.id)
    setUndo({ rec, ...impact })
  }

  return (
    <div>
      <PageHeader title={tt('Aktarım geçmişi')} subtitle={tt('Tümüyle geri alınabilir.')} />
      <Card className="overflow-hidden">
        {!imports ? null : imports.length === 0 ? (
          <EmptyState icon={<History className="size-6" />} title={tt('Henüz aktarım yok')} action={<Button variant="primary" onClick={() => openImport()}>{tt('Dosya içe aktar')}</Button>}>
            {tt('İçe aktardığınız her dosya burada listelenir.')}
          </EmptyState>
        ) : (
          <ul>
            {imports.map((r) => {
              const Icon = KIND_ICON[r.fileKind]
              const d = new Date(r.importedAt)
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3.5 last:border-b-0 sm:flex-nowrap">
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted">
                    <Icon className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{r.fileName}</span>
                      <Badge>{KIND_LABEL[r.fileKind]}</Badge>
                      {r.status === 'undone' && <Badge tone="danger">{tt('Geri alındı')}</Badge>}
                    </div>
                    <div className="num mt-0.5 text-[12.5px] text-subtle">
                      {d.toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })} · {r.transactionCount} {tt('işlem · gider')} {formatKurus(r.totalExpenseKurus)}
                      {r.totalRefundKurus > 0 && ttf(' · iade {0}', formatKurus(r.totalRefundKurus))}
                      {r.skippedCount > 0 && ttf(' · {0} satır alınmadı', r.skippedCount)}
                      {r.accountAlias && ` · ${r.accountAlias}`}
                    </div>
                  </div>
                  {r.status === 'active' && (
                    <div className="flex gap-2">
                      <Button size="sm" icon={<ListOrdered className="size-4" />} onClick={() => navigate(`/islemler?aktarim=${r.id}`)}>
                        {tt('İşlemler')}
                      </Button>
                      <Button size="sm" variant="ghost" className="text-danger" icon={<Undo2 className="size-4" />} onClick={() => askUndo(r)}>
                        {tt('Geri al')}
                      </Button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Card>
      <ConfirmDialog
        open={!!undo}
        onOpenChange={(o) => !o && setUndo(null)}
        title={tt('Aktarım geri alınsın mı?')}
        confirmLabel={ttf('{0} işlemi sil', undo?.count ?? 0)}
        danger
        loading={busy}
        onConfirm={async () => {
          if (!undo) return
          setBusy(true)
          try {
            const n = await repo.undoImport(undo.rec.id)
            toast(ttf('Aktarım geri alındı; {0} işlem silindi.', n))
            setUndo(null)
          } catch (e) {
            toast(toUserMessage(e), { kind: 'error' })
          } finally {
            setBusy(false)
          }
        }}
      >
        “{undo?.rec.fileName}{tt('” ile gelen')} {undo?.count} {tt('işlem silinecek.')}
        {undo && undo.edited > 0 && <p className="mt-2 font-medium text-warning">{ttf('Düzenlediğiniz {0} işlem de silinecek.', undo.edited)}</p>}
      </ConfirmDialog>
    </div>
  )
}
