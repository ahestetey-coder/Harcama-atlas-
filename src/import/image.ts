import { IMPORT_LIMITS } from '../config/app'
import { ImportError } from './sheet'

export interface ImageAdjustments {
  /** 0, 90, 180, 270 */
  rotation: number
  /** Doğal piksel cinsinden kırpma (döndürme öncesi görüntüye göre). */
  crop: { x: number; y: number; w: number; h: number } | null
  enhance: boolean
}

export async function loadImage(file: Blob): Promise<ImageBitmap> {
  try {
    const bmp = await createImageBitmap(file)
    if (bmp.width * bmp.height > IMPORT_LIMITS.maxImagePixels) {
      bmp.close()
      throw new ImportError('Görsel çok büyük (piksel sayısı). Daha küçük bir ekran görüntüsü deneyin.')
    }
    return bmp
  } catch (e) {
    if (e instanceof ImportError) throw e
    throw new ImportError('Görsel açılamadı. Dosya bozuk veya desteklenmeyen biçimde olabilir.')
  }
}

/**
 * Kırpma, döndürme ve isteğe bağlı iyileştirme (gri tonlama + kontrast germe,
 * küçük görsellerde büyütme) uygular. Sonuç OCR'a verilir.
 */
export function prepareImage(bmp: ImageBitmap, adj: ImageAdjustments): HTMLCanvasElement {
  const crop = adj.crop ?? { x: 0, y: 0, w: bmp.width, h: bmp.height }
  const baseW = Math.max(1, Math.round(crop.w))
  const scale = adj.enhance && baseW < 1400 ? Math.min(3, 1800 / baseW) : 1
  const w = Math.round(crop.w * scale)
  const h = Math.round(crop.h * scale)
  const rot = ((adj.rotation % 360) + 360) % 360
  const canvas = document.createElement('canvas')
  canvas.width = rot === 90 || rot === 270 ? h : w
  canvas.height = rot === 90 || rot === 270 ? w : h
  const ctx = canvas.getContext('2d', { willReadFrequently: adj.enhance })!
  ctx.imageSmoothingQuality = 'high'
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((rot * Math.PI) / 180)
  ctx.drawImage(bmp, crop.x, crop.y, crop.w, crop.h, -w / 2, -h / 2, w, h)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  if (adj.enhance) enhanceCanvas(ctx, canvas.width, canvas.height)
  return canvas
}

function enhanceCanvas(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  const hist = new Uint32Array(256)
  let darkBgVotes = 0
  for (let i = 0; i < d.length; i += 4) {
    const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])
    d[i] = g
    hist[g]++
  }
  // Yüzde 2 ve 98 dilimlerine göre kontrast germe
  const total = w * h
  let acc = 0
  let lo = 0
  let hi = 255
  for (let v = 0; v < 256; v++) {
    acc += hist[v]
    if (acc < total * 0.02) lo = v
    if (acc < total * 0.98) hi = v
  }
  for (let v = 0; v < 128; v++) darkBgVotes += hist[v]
  const invert = darkBgVotes > total * 0.6 // koyu temalı ekran görüntüsü
  const range = Math.max(1, hi - lo)
  for (let i = 0; i < d.length; i += 4) {
    let v = ((d[i] - lo) * 255) / range
    v = Math.max(0, Math.min(255, v))
    if (invert) v = 255 - v
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.putImageData(img, 0, 0)
}
