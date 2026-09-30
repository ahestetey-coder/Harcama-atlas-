import { Crop, RotateCw, ScanText, Sparkles, X } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { Alert, Button, Card, Checkbox } from '../../components/ui/primitives'
import { prepareImage, type ImageAdjustments } from '../../import/image'

/** Görsel hazırlama: döndürme, kırpma ve iyileştirme; sonuç OCR'a gider. */
export function ImageStep({ bitmap, onRun, onCancel }: { bitmap: ImageBitmap; onRun: (adj: ImageAdjustments) => void; onCancel: () => void }) {
  const [adj, setAdj] = useState<ImageAdjustments>({ rotation: 0, crop: null, enhance: true })
  const [cropMode, setCropMode] = useState(false)
  const srcCanvas = useRef<HTMLCanvasElement>(null)
  const previewCanvas = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const [sel, setSel] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  // Kaynak görsel (kırpma için)
  useEffect(() => {
    const c = srcCanvas.current
    if (!c) return
    c.width = bitmap.width
    c.height = bitmap.height
    c.getContext('2d')!.drawImage(bitmap, 0, 0)
  }, [bitmap, cropMode])

  // OCR'a gidecek görüntünün önizlemesi
  useEffect(() => {
    const out = prepareImage(bitmap, adj)
    const c = previewCanvas.current
    if (!c) return
    const maxW = 900
    const scale = Math.min(1, maxW / out.width)
    c.width = Math.round(out.width * scale)
    c.height = Math.round(out.height * scale)
    c.getContext('2d')!.drawImage(out, 0, 0, c.width, c.height)
  }, [bitmap, adj, cropMode])

  const toImageCoords = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * bitmap.width, y: ((e.clientY - r.top) / r.height) * bitmap.height }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
      <Card className="overflow-hidden p-3">
        {cropMode ? (
          <div>
            <p className="mb-2 px-1 text-[13px] text-muted">İşlemlerin bulunduğu alanı sürükleyerek seçin.</p>
            <div className="relative">
              <canvas
                ref={srcCanvas}
                className="block h-auto max-h-[70vh] w-full touch-none rounded-xl object-contain"
                aria-label="Kırpılacak görsel"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId)
                  drag.current = toImageCoords(e)
                  setSel(null)
                }}
                onPointerMove={(e) => {
                  if (!drag.current) return
                  const p = toImageCoords(e)
                  const s = drag.current
                  setSel({ x: Math.max(0, Math.min(s.x, p.x)), y: Math.max(0, Math.min(s.y, p.y)), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) })
                }}
                onPointerUp={() => {
                  drag.current = null
                }}
              />
              {sel && (
                <div
                  className="pointer-events-none absolute border-2 border-emerald-400 bg-emerald-400/10"
                  style={{ left: `${(sel.x / bitmap.width) * 100}%`, top: `${(sel.y / bitmap.height) * 100}%`, width: `${(sel.w / bitmap.width) * 100}%`, height: `${(sel.h / bitmap.height) * 100}%` }}
                />
              )}
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCropMode(false)}>
                Vazgeç
              </Button>
              <Button
                variant="primary"
                disabled={!sel || sel.w < 20 || sel.h < 20}
                onClick={() => {
                  setAdj((a) => ({ ...a, crop: sel }))
                  setCropMode(false)
                }}
              >
                Kırpmayı uygula
              </Button>
            </div>
          </div>
        ) : (
          <canvas ref={previewCanvas} className="mx-auto block h-auto max-h-[70vh] max-w-full rounded-xl" aria-label="OCR'a gönderilecek görüntünün önizlemesi" />
        )}
      </Card>
      <Card className="flex flex-col gap-4 p-5">
        <div>
          <h2 className="font-display text-base font-semibold">Görseli hazırlayın</h2>
          <p className="mt-1 text-[13px] text-muted">OCR bu cihazda çalışır; görsel hiçbir sunucuya gönderilmez.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon={<RotateCw className="size-4" />} onClick={() => setAdj((a) => ({ ...a, rotation: (a.rotation + 90) % 360 }))}>
            Döndür
          </Button>
          <Button icon={<Crop className="size-4" />} onClick={() => setCropMode(true)}>
            Kırp
          </Button>
          {adj.crop && (
            <Button variant="ghost" icon={<X className="size-4" />} onClick={() => setAdj((a) => ({ ...a, crop: null }))}>
              Kırpmayı kaldır
            </Button>
          )}
        </div>
        <Checkbox
          label={
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="size-4 text-accent" /> Görüntüyü iyileştir
            </span>
          }
          description="Gri tonlama, kontrast ve küçük görsellerde büyütme. Koyu temalı ekran görüntüleri tersine çevrilir."
          checked={adj.enhance}
          onChange={(v) => setAdj((a) => ({ ...a, enhance: v }))}
        />
        <Alert tone="info">OCR kalitesi ile satırların doğru ayrıştırılması ayrı şeylerdir. Okunamayan tarih veya tutar uydurulmaz; incelemede size sorulur.</Alert>
        <div className="mt-auto flex flex-col gap-2">
          <Button variant="primary" size="lg" icon={<ScanText className="size-5" />} onClick={() => onRun(adj)} disabled={cropMode}>
            Metni oku
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Başka dosya seç
          </Button>
        </div>
      </Card>
    </div>
  )
}
