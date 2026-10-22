import { getCollection } from 'astro:content'

/** Yayımlanmış yazılar, en yeni önce */
export async function publishedPosts() {
  const posts = await getCollection('blog', (p) => !p.data.draft)
  return posts.sort((a, b) => b.data.date.getTime() - a.data.date.getTime())
}

export const formatPostDate = (d: Date) => new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }).format(d)

/** Yaklaşık okuma süresi (dakika), dakikada 200 kelime */
export const readingMinutes = (body = '') => Math.max(1, Math.round(body.split(/\s+/).filter(Boolean).length / 200))
