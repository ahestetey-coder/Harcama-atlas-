import type { APIRoute } from 'astro'
import { publishedPosts } from '../lib/blog'

/** Arama motorlarına açık sayfalar. Giriş, ödeme ve hesap sayfaları noindex olduğu için yoktur. */
const STATIC = ['/', '/fiyatlar/', '/nasil-kullanilir/', '/test/', '/blog/', '/yasal/kvkk/', '/yasal/gizlilik/', '/yasal/cerez/', '/yasal/kullanim-kosullari/', '/yasal/on-bilgilendirme/', '/yasal/mesafeli-satis/', '/yasal/iptal-iade/']

export const GET: APIRoute = async ({ site }) => {
  const base = site!.href.replace(/\/$/, '')
  const posts = await publishedPosts()
  const urls = [
    ...STATIC.map((p) => `<url><loc>${base}${p}</loc></url>`),
    ...posts.map((p) => `<url><loc>${base}/blog/${p.id}/</loc><lastmod>${(p.data.updated ?? p.data.date).toISOString().slice(0, 10)}</lastmod></url>`),
  ]
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } })
}
