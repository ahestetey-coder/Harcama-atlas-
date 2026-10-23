import { describe, expect, it } from 'vitest'
import { articleNotifications, parseMarkdown, visibleArticles, type ArticleMeta } from './gundem'

const art = (slug: string, publishAt: string): ArticleMeta => ({
  slug,
  videoId: slug,
  channel: 'Kanal',
  category: 'piyasa-notu',
  publishAt,
  title: { tr: `Başlık ${slug}`, en: `Title ${slug}` },
  summary: { tr: 'Özet', en: 'Summary' },
})

describe('gundem', () => {
  const now = new Date('2026-10-23T06:00:00Z')
  const list = [art('a', '2026-10-23T05:00:00Z'), art('b', '2026-10-23T05:30:00Z'), art('c', '2026-10-23T06:30:00Z')]

  it('yayına girmemiş yazıyı göstermez, yeniden eskiye sıralar', () => {
    expect(visibleArticles(list, now).map((a) => a.slug)).toEqual(['b', 'a'])
  })

  it('ilk açılışta geçmişi bildirmez, gelecektekini saatine kurar', () => {
    const n = articleNotifications(list, 'en', now, null)
    expect(n.map((x) => x.key)).toEqual(['gundem:c'])
    expect(n[0].at.toISOString()).toBe('2026-10-23T06:30:00.000Z')
    expect(n[0].body).toBe('Title c')
    expect(n[0].route).toBe('/gundem/c')
  })

  it('son görülmeden sonra yayına girenleri hemen bildirir', () => {
    const n = articleNotifications(list, 'tr', now, Date.parse('2026-10-23T05:15:00Z'))
    expect(n.map((x) => x.key)).toEqual(['gundem:b', 'gundem:c'])
    expect(n[0].at.getTime()).toBe(now.getTime() + 2000)
  })

  it('markdown: başlık, madde, tablo, görsel, kalın', () => {
    const md = [
      '## Kısaca',
      '- **Altın** destekte',
      '- Dolar yatay',
      '',
      '![kapak](https://cdn.example.com/1.jpg)',
      '![kötü](javascript:alert(1))',
      '',
      '| Varlık | Görünüm |',
      '|---|---|',
      '| Altın | Pozitif |',
      '',
      'Bir paragraf',
      'devamı.',
    ].join('\n')
    const b = parseMarkdown(md)
    expect(b.map((x) => x.type)).toEqual(['h', 'ul', 'img', 'table', 'p'])
    expect(b[1]).toMatchObject({ items: [[{ text: 'Altın', bold: true }, { text: ' destekte' }], [{ text: 'Dolar yatay' }]] })
    expect(b[3]).toMatchObject({ head: ['Varlık', 'Görünüm'], rows: [['Altın', 'Pozitif']] })
    expect(b[4]).toMatchObject({ parts: [{ text: 'Bir paragraf devamı.' }] })
  })
})
