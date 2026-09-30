import { useMemo, useState } from 'react'
import { Alert, Button, Card, Field, Select } from '../../components/ui/primitives'
import { mappingProblems, guessMapping, type ColumnMapping } from '../../import/mapping'
import { cellText } from '../../import/sheet'
import type { SheetTable } from '../../import/types'
import { cn } from '../../lib/cn'

const colLetter = (i: number) => {
  let s = ''
  let n = i + 1
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

export function MappingStep({
  tables,
  sheetIndex,
  initial,
  notes,
  fileKind,
  onConfirm,
  onCancel,
}: {
  tables: SheetTable[]
  sheetIndex: number
  initial: ColumnMapping
  notes: string[]
  fileKind: 'csv' | 'xlsx'
  onConfirm: (table: SheetTable, m: ColumnMapping) => void
  onCancel: () => void
}) {
  const [sheet, setSheet] = useState(sheetIndex)
  const [m, setM] = useState<ColumnMapping>(initial)
  const table = tables[sheet]
  const width = useMemo(() => Math.max(1, ...table.rows.slice(0, 40).map((r) => r.length)), [table])
  const headers = (table.rows[m.headerRow] ?? []).map((c, i) => cellText(c) || `Sütun ${colLetter(i)}`)
  const cols = Array.from({ length: width }, (_, i) => ({ i, label: `${colLetter(i)} · ${headers[i] ?? ''}`.trim() }))
  const problems = mappingProblems(m)
  const set = <K extends keyof ColumnMapping>(k: K, v: ColumnMapping[K]) => setM((p) => ({ ...p, [k]: v }))
  const colSelect = (k: 'date' | 'description' | 'amount' | 'debit' | 'credit' | 'category' | 'currency', label: string, optional = false) => (
    <Field label={label} htmlFor={`map-${k}`} optional={optional}>
      <Select id={`map-${k}`} value={m[k] === null ? '' : String(m[k])} onChange={(e) => set(k, e.target.value === '' ? null : Number(e.target.value))}>
        <option value="">{optional ? 'Yok' : 'Seçin…'}</option>
        {cols.map((c) => (
          <option key={c.i} value={c.i}>
            {c.label}
          </option>
        ))}
      </Select>
    </Field>
  )
  const used = new Map<number, string>()
  const mark = (i: number | null, name: string) => i !== null && used.set(i, name)
  mark(m.date, 'Tarih')
  mark(m.description, 'Açıklama')
  if (m.amountMode === 'single') mark(m.amount, 'Tutar')
  else {
    mark(m.debit, 'Borç')
    mark(m.credit, 'Alacak')
  }
  mark(m.category, 'Kategori')
  mark(m.currency, 'Para birimi')
  const preview = table.rows.slice(m.headerRow, m.headerRow + 9)

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_1fr]">
      <Card className="p-5">
        <h2 className="font-display text-base font-semibold">Sütunları eşleştirin</h2>
        <p className="mt-1 text-[13px] text-muted">Tahminlerimizi kontrol edin. Formül veya makro çalıştırılmaz; yalnızca hücre değerleri okunur.</p>
        <div className="mt-4 flex flex-col gap-3.5">
          {fileKind === 'xlsx' && tables.length > 1 && (
            <Field label="Excel sayfası" htmlFor="map-sheet">
              <Select
                id="map-sheet"
                value={sheet}
                onChange={(e) => {
                  const i = Number(e.target.value)
                  setSheet(i)
                  setM(guessMapping(tables[i]))
                }}
              >
                {tables.map((t, i) => (
                  <option key={t.name + i} value={i}>
                    {t.name} ({t.rows.length} satır)
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Başlık satırı" htmlFor="map-header" hint="Sütun adlarının bulunduğu satır; altındaki satırlar işlem olarak okunur.">
            <Select id="map-header" value={m.headerRow} onChange={(e) => set('headerRow', Number(e.target.value))}>
              {table.rows.slice(0, 30).map((r, i) => (
                <option key={i} value={i}>
                  {i + 1}. satır: {r.map(cellText).filter(Boolean).join(' | ').slice(0, 48) || '(boş)'}
                </option>
              ))}
            </Select>
          </Field>
          {colSelect('date', 'Tarih sütunu')}
          {colSelect('description', 'Açıklama sütunu')}
          <Field label="Tutar düzeni" htmlFor="map-mode">
            <Select id="map-mode" value={m.amountMode} onChange={(e) => set('amountMode', e.target.value as ColumnMapping['amountMode'])}>
              <option value="single">Tek tutar sütunu</option>
              <option value="debitCredit">Ayrı borç ve alacak sütunları</option>
            </Select>
          </Field>
          {m.amountMode === 'single' ? (
            <>
              {colSelect('amount', 'Tutar sütunu')}
              <Field label="Giderler nasıl görünüyor?" htmlFor="map-sign">
                <Select id="map-sign" value={m.expenseSign} onChange={(e) => set('expenseSign', e.target.value as ColumnMapping['expenseSign'])}>
                  <option value="positive">Pozitif (kart ekstresi: harcama 150,00)</option>
                  <option value="negative">Eksi (hesap dökümü: harcama −150,00)</option>
                </Select>
              </Field>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {colSelect('debit', 'Borç (giden)')}
              {colSelect('credit', 'Alacak (gelen)')}
            </div>
          )}
          <Field label="Dosya türü" htmlFor="map-kind" hint="Hesaba gelen para (maaş vb.) gider takibinde iade sayılmaz; varsayılan olarak hariç tutulur.">
            <Select id="map-kind" value={m.statementKind} onChange={(e) => set('statementKind', e.target.value as ColumnMapping['statementKind'])}>
              <option value="card">Kredi kartı ekstresi</option>
              <option value="account">Banka hesap hareketleri</option>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tarih biçimi" htmlFor="map-date-order">
              <Select id="map-date-order" value={m.dateOrder} onChange={(e) => set('dateOrder', e.target.value as ColumnMapping['dateOrder'])}>
                <option value="dmy">GG.AA.YYYY</option>
                <option value="mdy">AA/GG/YYYY</option>
              </Select>
            </Field>
            <Field label="Sayı biçimi" htmlFor="map-num">
              <Select id="map-num" value={m.numberFormat} onChange={(e) => set('numberFormat', e.target.value as ColumnMapping['numberFormat'])}>
                <option value="tr">1.234,56</option>
                <option value="en">1,234.56</option>
                <option value="auto">Belirsiz: sor</option>
              </Select>
            </Field>
          </div>
          {colSelect('category', 'Kategori sütunu', true)}
          {colSelect('currency', 'Para birimi sütunu', true)}
        </div>
      </Card>
      <div className="flex min-w-0 flex-col gap-4">
        {notes.map((n) => (
          <Alert key={n} tone="info">
            {n}
          </Alert>
        ))}
        {m.numberFormat === 'auto' && <Alert tone="warning">Sayı biçimi dosyadan anlaşılamadı. “1.234” gibi belirsiz tutarlar incelemede size sorulacak.</Alert>}
        <Card className="min-w-0 overflow-hidden">
          <div className="border-b border-line px-4 py-3 text-sm font-semibold">Önizleme (ilk satırlar)</div>
          <div className="scrollbar-thin overflow-x-auto">
            <table className="min-w-full text-[12.5px]">
              <thead>
                <tr>
                  {cols.map((c) => (
                    <th key={c.i} className={cn('whitespace-nowrap border-b border-line px-3 py-2 text-left font-medium', used.has(c.i) ? 'bg-accent-soft text-accent-strong dark:text-accent' : 'text-subtle')}>
                      {colLetter(c.i)} {used.has(c.i) && `→ ${used.get(c.i)}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((r, ri) => (
                  <tr key={ri} className={cn(ri === 0 && 'font-semibold')}>
                    {cols.map((c) => (
                      <td key={c.i} className="num max-w-[220px] truncate whitespace-nowrap border-b border-line px-3 py-1.5 text-muted">
                        {cellText(r[c.i] ?? null)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        {problems.length > 0 && (
          <Alert tone="warning" title="Eksik eşleştirme">
            {problems.join(' ')}
          </Alert>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Vazgeç
          </Button>
          <Button variant="primary" disabled={problems.length > 0} onClick={() => onConfirm(table, m)}>
            İşlemleri çıkar ve incele
          </Button>
        </div>
      </div>
    </div>
  )
}
