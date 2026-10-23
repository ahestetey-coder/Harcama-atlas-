import { useMemo, useState } from 'react'
import { Alert, Button, Card, Field, Select } from '../../components/ui/primitives'
import { mappingProblems, guessMapping, type ColumnMapping } from '../../import/mapping'
import { cellText } from '../../import/sheet'
import type { SheetTable } from '../../import/types'
import { cn } from '../../lib/cn'
import { tt, ttf } from '../../lib/i18n'

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
  const headers = (table.rows[m.headerRow] ?? []).map((c, i) => cellText(c) || ttf('Sütun {0}', colLetter(i)))
  const cols = Array.from({ length: width }, (_, i) => ({ i, label: `${colLetter(i)} · ${headers[i] ?? ''}`.trim() }))
  const problems = mappingProblems(m)
  const set = <K extends keyof ColumnMapping>(k: K, v: ColumnMapping[K]) => setM((p) => ({ ...p, [k]: v }))
  const colSelect = (k: 'date' | 'description' | 'amount' | 'debit' | 'credit' | 'category' | 'currency', label: string, optional = false) => (
    <Field label={label} htmlFor={`map-${k}`} optional={optional}>
      <Select id={`map-${k}`} value={m[k] === null ? '' : String(m[k])} onChange={(e) => set(k, e.target.value === '' ? null : Number(e.target.value))}>
        <option value="">{optional ? tt('Yok') : tt('Seçin…')}</option>
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
  mark(m.date, tt('Tarih'))
  mark(m.description, tt('Açıklama'))
  if (m.amountMode === 'single') mark(m.amount, tt('Tutar'))
  else {
    mark(m.debit, tt('Borç'))
    mark(m.credit, tt('Alacak'))
  }
  mark(m.category, tt('Kategori'))
  mark(m.currency, tt('Para birimi'))
  const preview = table.rows.slice(m.headerRow, m.headerRow + 9)

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_1fr]">
      <Card className="p-5">
        <h2 className="font-display text-base font-semibold">{tt('Sütunları eşleştirin')}</h2>
        <p className="mt-1 text-[13px] text-muted">{tt('Tahminlerimizi kontrol edin.')}</p>
        <div className="mt-4 flex flex-col gap-3.5">
          {fileKind === 'xlsx' && tables.length > 1 && (
            <Field label={tt('Excel sayfası')} htmlFor="map-sheet">
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
                    {ttf('{0} ({1} satır)', t.name, t.rows.length)}</option>
                ))}
              </Select>
            </Field>
          )}
          <Field label={tt('Başlık satırı')} htmlFor="map-header" hint={tt('Sütun adlarının olduğu satır.')}>
            <Select id="map-header" value={m.headerRow} onChange={(e) => set('headerRow', Number(e.target.value))}>
              {table.rows.slice(0, 30).map((r, i) => (
                <option key={i} value={i}>
                  {ttf('{0}. satır: {1}', i + 1, r.map(cellText).filter(Boolean).join(' | ').slice(0, 48) || tt('(boş)'))}
                </option>
              ))}
            </Select>
          </Field>
          {colSelect('date', tt('Tarih sütunu'))}
          {colSelect('description', tt('Açıklama sütunu'))}
          <Field label={tt('Tutar düzeni')} htmlFor="map-mode">
            <Select id="map-mode" value={m.amountMode} onChange={(e) => set('amountMode', e.target.value as ColumnMapping['amountMode'])}>
              <option value="single">{tt('Tek tutar sütunu')}</option>
              <option value="debitCredit">{tt('Ayrı borç ve alacak sütunları')}</option>
            </Select>
          </Field>
          {m.amountMode === 'single' ? (
            <>
              {colSelect('amount', tt('Tutar sütunu'))}
              <Field label={tt('Giderler nasıl görünüyor?')} htmlFor="map-sign">
                <Select id="map-sign" value={m.expenseSign} onChange={(e) => set('expenseSign', e.target.value as ColumnMapping['expenseSign'])}>
                  <option value="positive">{tt('Pozitif (kart ekstresi: harcama 150,00)')}</option>
                  <option value="negative">{tt('Eksi (hesap dökümü: harcama −150,00)')}</option>
                </Select>
              </Field>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {colSelect('debit', tt('Borç (giden)'))}
              {colSelect('credit', tt('Alacak (gelen)'))}
            </div>
          )}
          <Field label={tt('Dosya türü')} htmlFor="map-kind" hint={tt('Hesaba gelen para hariç tutulur.')}>
            <Select id="map-kind" value={m.statementKind} onChange={(e) => set('statementKind', e.target.value as ColumnMapping['statementKind'])}>
              <option value="card">{tt('Kredi kartı ekstresi')}</option>
              <option value="account">{tt('Banka hesap hareketleri')}</option>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={tt('Tarih biçimi')} htmlFor="map-date-order">
              <Select id="map-date-order" value={m.dateOrder} onChange={(e) => set('dateOrder', e.target.value as ColumnMapping['dateOrder'])}>
                <option value="dmy">{tt('GG.AA.YYYY')}</option>
                <option value="mdy">{tt('AA/GG/YYYY')}</option>
              </Select>
            </Field>
            <Field label={tt('Sayı biçimi')} htmlFor="map-num">
              <Select id="map-num" value={m.numberFormat} onChange={(e) => set('numberFormat', e.target.value as ColumnMapping['numberFormat'])}>
                <option value="tr">1.234,56</option>
                <option value="en">1,234.56</option>
                <option value="auto">{tt('Belirsiz: sor')}</option>
              </Select>
            </Field>
          </div>
          {colSelect('category', tt('Kategori sütunu'), true)}
          {colSelect('currency', tt('Para birimi sütunu'), true)}
        </div>
      </Card>
      <div className="flex min-w-0 flex-col gap-4">
        {notes.map((n) => (
          <Alert key={n} tone="info">
            {n}
          </Alert>
        ))}
        {m.numberFormat === 'auto' && <Alert tone="warning">{tt('Sayı biçimi anlaşılamadı. Belirsiz tutarlar incelemede sorulacak.')}</Alert>}
        <Card className="min-w-0 overflow-hidden">
          <div className="border-b border-line px-4 py-3 text-sm font-semibold">{tt('Önizleme (ilk satırlar)')}</div>
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
          <Alert tone="warning" title={tt('Eksik eşleştirme')}>
            {problems.join(' ')}
          </Alert>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            {tt('Vazgeç')}
          </Button>
          <Button variant="primary" disabled={problems.length > 0} onClick={() => onConfirm(table, m)}>
            {tt('İşlemleri çıkar ve incele')}
          </Button>
        </div>
      </div>
    </div>
  )
}
