import type { AtlasRepository } from '../data/repository'

/** Supabase proje adresi ve herkese açık (anon) anahtar. Gizli değildir; veriyi RLS kuralları korur. */
export interface CloudConfig {
  url: string
  anonKey: string
}

const KEY = 'cloud-config'

export function envCloudConfig(): CloudConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  return url && anonKey ? { url, anonKey } : null
}

export function validateCloudConfig(c: Partial<CloudConfig>): string | null {
  let u: URL
  try {
    u = new URL((c.url ?? '').trim())
  } catch {
    return 'Proje adresi geçerli bir adres değil (ör. https://abcd.supabase.co).'
  }
  if (u.protocol !== 'https:') return 'Proje adresi https:// ile başlamalı.'
  if (!c.anonKey || c.anonKey.trim().length < 20) return 'Herkese açık (anon) anahtarı yapıştırın.'
  return null
}

export async function readCloudConfig(repo: AtlasRepository): Promise<CloudConfig | null> {
  const e = await repo.db.meta.get(KEY)
  return (e?.value as CloudConfig | undefined) ?? envCloudConfig()
}

export async function writeCloudConfig(repo: AtlasRepository, c: CloudConfig | null): Promise<void> {
  if (c) await repo.db.meta.put({ key: KEY, value: { url: c.url.trim().replace(/\/+$/, ''), anonKey: c.anonKey.trim() } })
  else await repo.db.meta.delete(KEY)
}

/** Davet bağlantısının içeriği. Harcama verisi içermez. */
export interface InvitePayload {
  v: 1
  url: string
  key: string
  code: string
  group: string
  from: string
}

function b64urlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(s: string): string {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

export function buildInviteLink(base: string, p: Omit<InvitePayload, 'v'>): string {
  const root = base.split('#')[0]
  return `${root}#/katil?d=${b64urlEncode(JSON.stringify({ v: 1, ...p }))}`
}

export function parseInvite(d: string | null): InvitePayload | null {
  if (!d) return null
  try {
    const p = JSON.parse(b64urlDecode(d)) as Partial<InvitePayload>
    if (p.v !== 1 || typeof p.code !== 'string' || typeof p.group !== 'string' || typeof p.from !== 'string') return null
    if (validateCloudConfig({ url: p.url, anonKey: p.key })) return null
    return { v: 1, url: p.url!, key: p.key!, code: p.code, group: p.group.slice(0, 60), from: p.from.slice(0, 40) }
  } catch {
    return null
  }
}
