import { describe, expect, it } from 'vitest'
import { ASSUMPTIONS } from './assumptions'

const byId = (id: string) => ASSUMPTIONS.find((a) => a.id === id)

describe('varsayımlar ve kaynaklar', () => {
  it('bütçe varsayımları var ve her birinin kaynağı dolu', () => {
    for (const id of ['budget-split', 'housing', 'dti', 'consumer-debt', 'saving-floors', 'emergency', 'tuik-hba-2025', 'card-min', 'income-conservative', 'payday']) {
      const a = byId(id)
      expect(a, id).toBeDefined()
      expect(a!.title.trim(), id).not.toBe('')
      expect(a!.value.trim(), id).not.toBe('')
      expect(a!.source.trim(), id).not.toBe('')
      expect(a!.reason.trim(), id).not.toBe('')
    }
  })

  it('kimlikler tekil', () => {
    expect(new Set(ASSUMPTIONS.map((a) => a.id)).size).toBe(ASSUMPTIONS.length)
  })

  it('kaynak bağlantıları', () => {
    expect(byId('budget-split')!.source).toContain('Warren')
    expect(byId('housing')!.source).toContain('https://www.huduser.gov/portal/pdredge/pdr_edge_featd_article_092214.html')
    expect(byId('dti')!.source).toContain('https://selling-guide.fanniemae.com/sel/b3-6-02/debt-income-ratios')
    expect(byId('emergency')!.source).toContain('federalreserve.gov')
    expect(byId('emergency')!.source).toContain('finra.org')
    expect(byId('card-min')!.source).toContain('https://www.sozcu.com.tr/kredi-kartinda-bu-siniri-asanlar-daha-fazla-odeme-yapacak-p342271')
    expect(byId('card-min')!.source).toContain('BDDK')
  })

  it('TÜİK kaydı yayın tarihini, iki aynayı ve doğrulama notunu taşır', () => {
    const t = byId('tuik-hba-2025')!
    expect(t.source).toContain('Hanehalkı Tüketim Harcaması, 2025')
    expect(t.source).toContain('2 Haziran 2026')
    expect(t.source).toContain('birincil bülten doğrulanmalı')
    expect(t.source).toContain('https://www.cnbce.com/veriler/tuik-son-tabloyu-acikladi-konut-kira-ulastirma-hangi-kaleme-ne-kadar-harcadik-h30893')
    expect(t.source).toContain('https://www.dunya.com/kose-yazisi/kazanc-kira-mutfak-ve-yola-gidiyor/827124')
    expect(t.value).toContain('Market %17,3')
    expect(t.value).toContain('Akaryakıt %10,25')
    expect(t.value).toContain('0,8')
    expect(t.reason).toContain('yarı yarıya')
  })

  it('değerler sabitlerden okunur', () => {
    expect(byId('housing')!.value).toContain('%30')
    expect(byId('dti')!.value).toContain('%36')
    expect(byId('consumer-debt')!.value).toContain('%20')
    expect(byId('emergency')!.value).toContain('3–6 ay')
    expect(byId('emergency')!.value).toContain('6–9 ay')
    expect(byId('card-min')!.value).toContain('%20')
  })
})
