/** Tarayıcıda dosya indirir; içerik hiçbir sunucuya gönderilmez. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function readFileAsText(file: File): Promise<string> {
  return file.text()
}
