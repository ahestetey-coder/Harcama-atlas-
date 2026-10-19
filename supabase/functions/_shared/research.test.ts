import { describe, expect, it } from 'vitest'
import {
  checkReport,
  dedupeKey,
  extractPeriod,
  isDue,
  isHot,
  matchEvent,
  NO_OPINION,
  normalizeUrl,
  numbersIn,
  parseFeed,
  parseTcmbRates,
  primaryOf,
  unsupportedNumbers,
  type ReportTopic,
} from './research'

const RSS = `<?xml version="1.0"?><rss><channel><title>Örnek Kurum Duyuruları</title>
<item><title><![CDATA[Tüketici Fiyat Endeksi, Eylül 2026]]></title><link>https://ornek.test/tufe?utm_source=rss</link>
<pubDate>Mon, 05 Oct 2026 07:00:00 GMT</pubDate><description>&lt;p&gt;Yıllık enflasyon %31,2 oldu.&lt;/p&gt;</description><guid>bulten-123</guid><dc:creator>Basın</dc:creator></item>
<item><title>Bozuk</title><link>javascript:alert(1)</link><pubDate>Mon, 05 Oct 2026 07:00:00 GMT</pubDate></item>
<item><title>Tarihsiz</title><link>https://ornek.test/x</link></item>
</channel></rss>`

const ATOM = `<feed><title>Global</title><entry><title>Rate decision</title><link href="https://global.test/a"/><updated>2026-10-06T18:00:00Z</updated><summary>Rate kept at 4.25 percent</summary><author><name>Board</name></author></entry></feed>`

describe('kaynak okuma', () => {
  it('RSS maddelerini kaynak, yazar, tarih ve metinle okur; güvensiz ve tarihsizleri atlar', () => {
    const f = parseFeed(RSS)
    expect(f.channel).toBe('Örnek Kurum Duyuruları')
    expect(f.entries).toHaveLength(1)
    expect(f.entries[0]).toMatchObject({ title: 'Tüketici Fiyat Endeksi, Eylül 2026', author: 'Basın', guid: 'bulten-123', publishedAt: '2026-10-05T07:00:00.000Z' })
    expect(f.entries[0].text).toBe('Yıllık enflasyon %31,2 oldu.')
  })
  it('göreli bağlantıyı beslemenin adresiyle tamamlar', () => {
    const xml = '<rss><channel><item><title>Karar</title><link>/duyuru/1</link><pubDate>Thu, 01 Oct 2026 11:00:00 GMT</pubDate></item></channel></rss>'
    expect(parseFeed(xml, 'https://kurum.test/rss/a').entries[0].url).toBe('https://kurum.test/duyuru/1')
  })
  it('Atom beslemesini okur', () => {
    const f = parseFeed(ATOM)
    expect(f.entries[0]).toMatchObject({ url: 'https://global.test/a', author: 'Board' })
  })
  it('TCMB gösterge kurlarını birimine bölerek okur', () => {
    const xml = `<Tarih_Date Tarih="07.10.2026" Date="10/07/2026"><Currency CrossOrder="0" Kod="USD" CurrencyCode="USD"><Unit>1</Unit><Isim>ABD DOLARI</Isim><ForexBuying>41.10</ForexBuying><ForexSelling>41.17</ForexSelling></Currency><Currency Kod="JPY" CurrencyCode="JPY"><Unit>100</Unit><Isim>JAPON YENI</Isim><ForexBuying>27.5</ForexBuying><ForexSelling>27.7</ForexSelling></Currency></Tarih_Date>`
    const r = parseTcmbRates(xml)!
    expect(r.date).toBe('2026-10-07')
    expect(r.rates[0]).toEqual({ code: 'USD', name: 'ABD DOLARI', value: 41.17 })
    expect(r.rates[1].value).toBeCloseTo(0.277)
  })
})

describe('tekrar ayıklama ve olaylar', () => {
  it('izleme parametreleri farklı aynı bağlantı aynı anahtarı alır', () => {
    expect(normalizeUrl('https://www.ornek.test/a/?utm_source=x&b=1')).toBe('ornek.test/a?b=1')
    expect(dedupeKey({ url: 'https://ornek.test/a?utm_medium=rss' })).toBe(dedupeKey({ url: 'http://www.ornek.test/a/' }))
    expect(dedupeKey({ url: 'https://ornek.test/a', guid: 'id-1' })).not.toBe(dedupeKey({ url: 'https://ornek.test/a', guid: 'id-2' }))
  })
  it('aynı olayın haberini ilk resmî açıklamaya bağlar', () => {
    const recent = [{ id: 'resmi', title: 'TCMB politika faizini yüzde 40 olarak sabit tuttu', publishedAt: '2026-10-06T11:00:00Z', contentType: 'resmi_veri' as const, eventKey: 'olay1' }]
    const m = matchEvent({ title: 'TCMB faizi sabit tuttu: politika faizi yüzde 40', publishedAt: '2026-10-06T11:20:00Z' }, recent)
    expect(m).toEqual({ eventKey: 'olay1', matchedId: 'resmi' })
    const other = matchEvent({ title: 'Petrol fiyatları haftaya düşüşle başladı', publishedAt: '2026-10-06T12:00:00Z' }, recent)
    expect(other.matchedId).toBeNull()
    const prim = primaryOf([
      { publishedAt: '2026-10-06T10:00:00Z', contentType: 'haber' as const },
      { publishedAt: '2026-10-06T11:00:00Z', contentType: 'resmi_veri' as const },
    ])
    expect(prim?.contentType).toBe('resmi_veri')
  })
  it('dönemi çıkarır', () => {
    expect(extractPeriod('Tüketici Fiyat Endeksi, Eylül 2026')).toBe('2026-09')
    expect(extractPeriod('Employment Situation — September 2026')).toBe('2026-09')
    expect(extractPeriod('2026 yılının 2. çeyreği büyüme')).toBeNull()
    expect(extractPeriod('GSYH, 2. çeyrek 2026')).toBe('2026-Ç2')
    expect(extractPeriod('Faiz kararı')).toBeNull()
  })
})

describe('rakam denetimi', () => {
  it('Türkçe ve İngilizce sayı biçimlerini aynı sayar', () => {
    expect(numbersIn('%31,2 ve 1.250,5 TL ile 4.25')).toEqual(['31.2', '1250.5', '4.25'])
  })
  it('kaynakta olmayan rakamı yakalar; tarih ve yılı muaf tutar', () => {
    expect(unsupportedNumbers('Enflasyon 5 Ekim 2026 itibarıyla %31,2', ['Yıllık enflasyon %31,2 oldu.'])).toEqual([])
    expect(unsupportedNumbers('Enflasyon %33 olabilir', ['Yıllık enflasyon %31,2 oldu.'])).toEqual(['33'])
  })
})

const now = new Date('2026-10-07T06:00:00Z')
function topic(over: Partial<ReportTopic['sections']> = {}): ReportTopic {
  const sec = (text: string, refs = [1]) => ({ text, refs })
  return {
    title: 'Enflasyon',
    eventKey: 'e1',
    sources: [
      { n: 1, itemId: 'i1', title: 'TÜFE Eylül 2026', url: 'https://ornek.test/tufe', author: null, institution: 'Örnek İstatistik', publishedAt: '2026-10-05T07:00:00Z', period: '2026-09', type: 'resmi_veri' },
      { n: 2, itemId: 'i2', title: 'Uzman görüşü', url: 'https://ornek.test/u', author: 'A. Uzman', institution: 'Örnek Üniversite', publishedAt: '2026-10-05T12:00:00Z', period: null, type: 'uzman_yorumu', personal: true },
    ],
    sections: {
      ne_oldu: sec('Yıllık enflasyon %31,2 oldu.'),
      neden_onemli: sec('Fiyat artışı bütçeleri etkiler.'),
      uzmanlar: sec('A. Uzman kira artışının sürdüğünü düşünüyor.', [2]),
      degerlendirme: sec('Veri yavaşlamanın sürdüğünü gösteriyor olabilir.'),
      senaryolar: sec('Kira artışı sürerse düşüş yavaşlayabilir.', []),
      sonraki_isaret: sec('Bir sonraki veri kasım başında açıklanacak.'),
      ...over,
    },
  }
}
const ev = [new Map([[1, 'Yıllık enflasyon %31,2 oldu.'], [2, 'Kira artışı sürüyor']])]

describe('yayın öncesi rapor denetimi', () => {
  it('temiz raporu geçirir', () => {
    const c = checkReport('gunluk', [topic()], ev, now)
    expect(c.issues).toEqual([])
    expect(c.ok).toBe(true)
  })
  it('kaynaksız iddiayı, kaynakta olmayan rakamı, yönlendirmeyi ve kesin dili yakalar', () => {
    const c = checkReport(
      'gunluk',
      [topic({ neden_onemli: { text: 'Önemli.', refs: [] }, degerlendirme: { text: 'Enflasyon %25 olacak, altın alın.', refs: [1] }, senaryolar: { text: 'Kesinlikle düşecek.', refs: [] } })],
      ev,
      now,
    )
    expect(c.ok).toBe(false)
    expect(c.counts.kaynaksiz).toBe(1)
    expect(c.counts.kaynaksizRakam).toBe(1)
    expect(c.counts.yonlendirme).toBeGreaterThanOrEqual(2)
  })
  it('eski veriyi ve eski uzman görüşünü işaretler; uzman yoksa hazır cümleye izin verir', () => {
    const t = topic({ uzmanlar: { text: NO_OPINION, refs: [] } })
    t.sources[0].publishedAt = '2026-09-20T07:00:00Z'
    const c = checkReport('gunluk', [t], ev, now)
    expect(c.issues.map((i) => i.kind)).toEqual(['eski-veri'])
    expect(checkReport('aylik', [t], ev, now).ok).toBe(true)
  })
  it('uzman bölümünde haber kaynağını kabul etmez', () => {
    const c = checkReport('gunluk', [topic({ uzmanlar: { text: 'Uzmanlar ayrışıyor.', refs: [1] } })], ev, now)
    expect(c.issues.some((i) => i.section === 'uzmanlar' && i.kind === 'kaynaksiz')).toBe(true)
  })
})

describe('toplama zamanlaması', () => {
  it('planlı yayın çevresinde sık kontrol eder', () => {
    const t = new Date('2026-10-05T07:05:00Z')
    expect(isHot([{ release_at: '2026-10-05T07:00:00Z' }], t)).toBe(true)
    expect(isHot([{ release_at: '2026-10-05T12:00:00Z' }], t)).toBe(false)
    const s = { poll_minutes: 120, last_checked_at: '2026-10-05T06:50:00Z' }
    expect(isDue(s, false, t)).toBe(false)
    expect(isDue(s, true, t)).toBe(true)
    expect(isDue({ poll_minutes: 60, last_checked_at: null }, false, t)).toBe(true)
  })
})
