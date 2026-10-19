/** Topoğrafik kontur halkaları: aynı tohumla her derlemede aynı çizgiler çıkar. */
export function contourPaths(opts: { cx: number; cy: number; rings: number; r0: number; step: number; seed: number; sx?: number }): string[] {
  const { cx, cy, rings, r0, step, seed, sx = 1.35 } = opts
  const out: string[] = []
  for (let i = 0; i < rings; i++) {
    const R = r0 + i * step
    const pts: string[] = []
    for (let k = 0; k <= 72; k++) {
      const t = (k / 72) * Math.PI * 2
      const w = 1 + 0.11 * Math.sin(3 * t + seed + i * 0.35) + 0.06 * Math.sin(5 * t + seed * 2 - i * 0.2) + 0.035 * Math.sin(8 * t + seed * 3)
      const x = cx + Math.cos(t) * R * w * sx
      const y = cy + Math.sin(t) * R * w
      pts.push(`${k ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`)
    }
    out.push(pts.join('') + 'Z')
  }
  return out
}
