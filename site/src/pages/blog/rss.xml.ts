import type { APIRoute } from 'astro'
import { publishedPosts } from '../../lib/blog'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export const GET: APIRoute = async ({ site }) => {
  const posts = await publishedPosts()
  const base = site!.href.replace(/\/$/, '')
  const items = posts
    .map((p) => {
      const url = `${base}/blog/${p.id}/`
      return `<item><title>${esc(p.data.title)}</title><link>${url}</link><guid>${url}</guid><pubDate>${p.data.date.toUTCString()}</pubDate><description>${esc(p.data.description)}</description></item>`
    })
    .join('')
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Harcama Atlası Blog</title><link>${base}/blog</link><description>Bütçe, borç, birikim ve finansal özgürlük üzerine yazılar.</description><language>tr</language>${items}</channel></rss>`
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } })
}
