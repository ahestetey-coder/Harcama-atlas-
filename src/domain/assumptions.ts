/**
 * Özgürlük Rotası'nın bütün varsayımları tek yerde. Her sabitin yanında kaynağı ve kısa gerekçesi
 * var; "Varsayımlar ve kaynaklar" bölümü (Öğren sayfası) bu listeden üretilir. Hesaplar eğitim ve
 * benzetim amaçlıdır, kişiye özel yatırım tavsiyesi değildir.
 */

export interface Assumption {
  id: string
  title: string
  /** Uygulamada kullanılan değer, okunur biçimde. */
  value: string
  source: string
  reason: string
}

// ---------- Güvenli çekim oranı ----------

/**
 * Emeklilik (çekim) süresine göre önerilen yıllık çekim oranı (%).
 * ABD verisiyle 30 yıllık süre için %4 (Bengen 1994; Cooley, Hubbard ve Walz 1998). Pfau (2010)
 * ABD dışı piyasalarda güvenli oranın daha düşük çıktığını gösterdi; Türkiye için temkinli düzeltme.
 */
export const SWR_TABLE: Array<{ maxYears: number; pct: number }> = [
  { maxYears: 30, pct: 3.5 },
  { maxYears: 44, pct: 3.25 },
  { maxYears: Infinity, pct: 3.0 },
]

/** ABD verisiyle 30 yıllık klasik oran (yalnızca karşılaştırma için gösterilir). */
export const CLASSIC_SWR_PCT = 4

export function recommendedWithdrawalPct(retirementYears: number): number {
  const y = Math.max(0, retirementYears)
  return SWR_TABLE.find((r) => y <= r.maxYears)!.pct
}

// ---------- Acil durum fonu, borç ve birikim eşikleri ----------

/** Acil durum fonu (ay): düzenli gelirde 3, bakmakla yükümlü kişi varsa ya da gelir değişkense 6, düzensizse 9. */
export const EMERGENCY_MONTHS = { regular: 3, variableOrDependents: 6, irregular: 9 } as const
export const STARTER_MONTHS = 1
/** Borç ödemeleri / gelir üst sınırı. */
export const DTI_LIMIT = 0.36
/** Birikim oranı hedefi (gelirin payı). */
export const SAVING_RATE_TARGET = 0.2

// ---------- Gelire göre bütçe (dört kova) ----------

/** 50/30/20: ihtiyaçlar (zorunlu sabitler dahil) %50, istekler %30, birikim %20 (Warren ve Tyagi 2005). */
export const NEEDS_SHARE = 0.5
/** İsteklere en fazla gelirin bu payı ayrılır. */
export const WANTS_SHARE = 0.3
/** En az birikim oranı (ürün kuralı). */
export const MIN_SAVING_RATE = 0.1
/** Gelir dar ise birikime bu oranla başlanır (ürün kuralı). */
export const LOW_INCOME_SAVING_RATE = 0.05
/** İsteklere korunan en düşük pay (ürün kuralı). */
export const WANTS_FLOOR = 0.1
/** Konut gideri / gelir üst sınırı (HUD; brüt gelir tanımı, nette daha sıkı). */
export const HOUSING_LIMIT = 0.3
/** Kart ve tüketici kredisi ödemeleri / gelir üst sınırı (uygulama kuralı; birincil kaynak yok). */
export const CONSUMER_DEBT_LIMIT = 0.2
/** Girilmemiş kart asgari ödemesi için alt sınır: bakiyenin %20'si (limit ≤ 50.000 TL; doğrulanmalı). */
export const CARD_MIN_RATE = 0.2
/** Acil durum fonu aralığı (ay). Tek gelir, bakmakla yükümlü kişi veya değişken gelirde 6–9; düzensizde 9. */
export const EMERGENCY_RANGE = { regular: [3, 6], singleOrDependents: [6, 9], irregular: [9, 9] } as const

export type TuikGroup =
  | 'housing'
  | 'transport'
  | 'food'
  | 'restaurants'
  | 'furnishings'
  | 'clothing'
  | 'communication'
  | 'personalCare'
  | 'alcoholTobacco'
  | 'recreation'
  | 'health'
  | 'education'
  | 'insuranceFinance'

/**
 * TÜİK Hanehalkı Bütçe Araştırması, "Hanehalkı Tüketim Harcaması, 2025" (yayım 2 Haziran 2026,
 * COICOP 2018): harcama grubunun toplam tüketim harcaması içindeki payı, baz puan (% × 100).
 * Toplam 10010 (yuvarlama). Birincil bülten açılamadı; değerler aynı rakamları veren iki habere
 * dayanır (cnbce.com h30893, dunya.com 827124). Yayından önce bültenle karşılaştırılmalı.
 */
export const TUIK_HBA_2025_BP: Record<TuikGroup, number> = {
  housing: 2930,
  transport: 2050,
  food: 1730,
  restaurants: 690,
  furnishings: 530,
  clothing: 430,
  communication: 360,
  personalCare: 330,
  alcoholTobacco: 250,
  recreation: 230,
  health: 220,
  education: 180,
  insuranceFinance: 80,
}
/** Hedef birikimde tüketime kalan pay (1 − SAVING_RATE_TARGET). */
export const CONSUMPTION_AT_TARGET = 0.8

// ---------- Hedef seviyeleri ----------

/** Lean FI: hedef harcamanın %70'i; Fat FI: %150'si. */
export const LEAN_FACTOR = 0.7
export const FAT_FACTOR = 1.5

/** Paranın yetmesi gereken varsayılan yaş. */
export const DEFAULT_LIFE_AGE = 90
/** Hedef yaş verilmemişse kullanılan varsayılan. */
export const DEFAULT_TARGET_AGE = 55

/** TL nominal hedef için varsayılan yıllık enflasyon (%); kullanıcı değiştirebilir. */
export const DEFAULT_INFLATION_PCT = 25

// ---------- Getiri ve oynaklık ----------

/**
 * Uzun dönem küresel reel getiri ve oynaklık (yaklaşık, yıllık): Dimson, Marsh ve Staunton,
 * küresel uzun dönem veri seti (1900 sonrası). Hisse: reel ~%5, oynaklık ~%17; tahvil: reel ~%1,7,
 * oynaklık ~%10. Hisse ile tahvil arasındaki ilişki 0,2 varsayıldı.
 */
export const EQUITY_REAL_PCT = 5.0
export const EQUITY_VOL_PCT = 17
export const BOND_REAL_PCT = 1.7
export const BOND_VOL_PCT = 10
export const EQUITY_BOND_CORRELATION = 0.2

export type RiskLevel = 0 | 1 | 2 | 3

export interface RiskProfile {
  level: RiskLevel
  label: string
  /** Hisse ağırlığı (0..1); kalanı tahvil ve mevduat. */
  equity: number
  /** Beklenen yıllık reel getiri (%). */
  realReturnPct: number
  /** Yıllık oynaklık (standart sapma, %). */
  volatilityPct: number
}

function mix(level: RiskLevel, label: string, equity: number): RiskProfile {
  const e = equity
  const b = 1 - e
  const r = e * EQUITY_REAL_PCT + b * BOND_REAL_PCT
  const v = Math.sqrt((e * EQUITY_VOL_PCT) ** 2 + (b * BOND_VOL_PCT) ** 2 + 2 * e * b * EQUITY_VOL_PCT * BOND_VOL_PCT * EQUITY_BOND_CORRELATION)
  return { level, label, equity, realReturnPct: Math.round(r * 100) / 100, volatilityPct: Math.round(v * 10) / 10 }
}

/** Hisse/tahvil oranına göre ağırlıklı ortalama getiri ve oynaklık. */
export const RISK_PROFILES: RiskProfile[] = [mix(0, 'Temkinli', 0.3), mix(1, 'Dengeli', 0.5), mix(2, 'Büyüme', 0.7), mix(3, 'Atak', 0.9)]

// ---------- Monte Carlo ----------

export const MC_RUNS = 1000
export const MC_SEED = 20261008

/** Kaynaklı liste: Öğren sayfasındaki "Varsayımlar ve kaynaklar" bölümü. */
export const ASSUMPTIONS: Assumption[] = [
  {
    id: 'swr',
    title: 'Güvenli çekim oranı',
    value: `Çekim süresi 30 yıl ve altı %3,5; 31–44 yıl %3,25; 45 yıl ve üzeri %3,0 (ABD'de 30 yıl için klasik değer %${CLASSIC_SWR_PCT}). Testte değiştirebilirsiniz.`,
    source:
      'Bengen, W. P. (1994), "Determining Withdrawal Rates Using Historical Data", Journal of Financial Planning; Cooley, Hubbard ve Walz (1998), "Retirement Savings: Choosing a Withdrawal Rate That Is Sustainable" (Trinity çalışması); Pfau, W. D. (2010), "An International Perspective on Safe Withdrawal Rates", Journal of Financial Planning.',
    reason: "Klasik %4 ABD verisinden çıkar. Pfau'nun uluslararası bulgusu ABD dışında güvenli oranın daha düşük olduğunu gösteriyor; Türkiye için temkinli düzeltme yapıldı. Çekim süresi uzadıkça oran düşer.",
  },
  {
    id: 'capital',
    title: 'Hedef sermaye',
    value: '(Hedef yıllık gider − emeklilikte garantili ve pasif gelir) ÷ çekim oranı',
    source: 'Güvenli çekim oranı çalışmalarının doğrudan sonucu (Bengen 1994).',
    reason: 'Birikimden her yıl bu oranda çekim, varsayılan süre boyunca tarihsel olarak çoğu dönemde yetmiştir.',
  },
  {
    id: 'levels',
    title: 'Lean, FI ve Fat seviyeleri',
    value: `Lean: hedefin %${LEAN_FACTOR * 100}'i (Finansal güvence), FI: hedefin kendisi (Finansal bağımsızlık), Fat: %${FAT_FACTOR * 100}'i (Finansal özgürlük).`,
    source: 'Finansal bağımsızlık topluluğunda yaygın kullanılan kademeler; akademik bir standart değildir.',
    reason: 'Tek bir rakam yerine sade, hedeflenen ve rahat yaşam için üç ara durak gösterir.',
  },
  {
    id: 'emergency',
    title: 'Acil durum fonu',
    value: `Önce ${STARTER_MONTHS} aylık zorunlu gider (başlangıç fonu), sonra ${EMERGENCY_RANGE.regular[0]}–${EMERGENCY_RANGE.regular[1]} ay. Tek gelir, bakmakla yükümlü kişi ya da değişken gelirde ${EMERGENCY_RANGE.singleOrDependents[0]}–${EMERGENCY_RANGE.singleOrDependents[1]} ay; düzensiz gelirde ${EMERGENCY_RANGE.irregular[0]} ay. Yalnızca mevduat ve nakit sayılır.`,
    source:
      "Federal Reserve, FEDS Notes (2018), \"Assessing Families' Liquid Savings Using the Survey of Consumer Finances\": https://www.federalreserve.gov/econres/notes/feds-notes/assessing-families-liquid-savings-using-the-survey-of-consumer-finances-20181119.htm; FINRA: https://www.finra.org/investors/insights/how-avoid-bad-financial-luck-friday-13th. 6–9 ay ve düzensiz gelirde 9 ay ürün kuralıdır.",
    reason: 'Beklenmedik bir gider ya da gelir kesintisinin yeni borca dönmesini önler. Zorunlu gider: sabit giderler ve ihtiyaçlar.',
  },
  {
    id: 'dti',
    title: 'Borç ödemesi / gelir sınırı',
    value: `%${DTI_LIMIT * 100} (konut kredisi dahil bütün borç ödemeleri; kira sayılmaz)`,
    source: 'Fannie Mae Selling Guide, B3-6-02 "Debt-to-Income Ratios": https://selling-guide.fanniemae.com/sel/b3-6-02/debt-income-ratios',
    reason: 'Aylık borç ödemeleri bu oranı aştığında bütçe kırılganlaşır. Eşik brüt gelir üzerinden tanımlıdır; net gelire uygulamak daha sıkıdır.',
  },
  {
    id: 'saving',
    title: 'Birikim oranı hedefi',
    value: `Gelirin en az %${SAVING_RATE_TARGET * 100}'si`,
    source: 'Warren, E. ve Tyagi, A. W. (2005), All Your Worth (50/30/20 kuralı).',
    reason: 'Gelirin yarısı ihtiyaçlara, %30 isteklere, en az %20 birikime.',
  },
  {
    id: 'budget-split',
    title: 'Gelirin dağılımı (50/30/20)',
    value: `Zorunlu sabitler ve ihtiyaçlar %${NEEDS_SHARE * 100} (bilgi için), istekler en fazla %${Math.round(WANTS_SHARE * 100)}, birikim ve borç kapatma en az %${SAVING_RATE_TARGET * 100}. Sıra: önce %${LOW_INCOME_SAVING_RATE * 100} birikim, %${WANTS_FLOOR * 100} istek, birikim %${MIN_SAVING_RATE * 100}'a, sonra %${SAVING_RATE_TARGET * 100}'ye; kalan isteklere, artan birikime.`,
    source: 'Warren, E. ve Tyagi, A. W. (2005), All Your Worth: The Ultimate Lifetime Money Plan; https://foxnews.com/story/running-in-circles.amp',
    reason: 'İhtiyaçlar bir tahmindir ve kısılmaz; gelir yetmezse önce istek ve birikim küçülür.',
  },
  {
    id: 'housing',
    title: 'Konut gideri / gelir sınırı',
    value: `%${Math.round(HOUSING_LIMIT * 100)} (kira ve aidat ya da konut kredisi taksiti)`,
    source: 'ABD Konut ve Kentsel Gelişim Bakanlığı (HUD), PD&R Edge: https://www.huduser.gov/portal/pdredge/pdr_edge_featd_article_092214.html',
    reason: 'Tanım brüt gelir üzerindedir; burada net gelire uygulandığı için daha sıkıdır.',
  },
  {
    id: 'consumer-debt',
    title: 'Kart ve tüketici kredisi ödemeleri',
    value: `Gelirin en fazla %${CONSUMER_DEBT_LIMIT * 100}'si. Aşarsa %${WANTS_FLOOR * 100}'un üstündeki istekler borca ayrılır.`,
    source: 'Uygulama kuralı (onaylı ürün planı); birincil bir kaynak bulunamadı.',
    reason: 'Kart, KMH ve ihtiyaç kredisi yüksek faizlidir; ödemeleri büyüdükçe yeni borç riski artar.',
  },
  {
    id: 'saving-floors',
    title: 'Birikim ve istek tabanları',
    value: `Birikim en az %${MIN_SAVING_RATE * 100}; gelir dar ise %${LOW_INCOME_SAVING_RATE * 100} ile başlanır. İsteklere en az %${WANTS_FLOOR * 100} ayrılır.`,
    source: 'Ürün kuralı; akademik kaynağı yok.',
    reason: 'Gelir dar olsa da birikime küçük bir payla başlanır; isteklere hiç pay bırakmayan bütçe uzun sürmez.',
  },
  {
    id: 'tuik-hba-2025',
    title: 'Kategori başlangıç payları (TÜİK 2025)',
    value: `İhtiyaçlar: Market %${(TUIK_HBA_2025_BP.food / 100).toLocaleString('tr-TR')}, Akaryakıt %${(TUIK_HBA_2025_BP.transport / 200).toLocaleString('tr-TR')}, Ulaşım %${(TUIK_HBA_2025_BP.transport / 200).toLocaleString('tr-TR')}, Faturalar %${(TUIK_HBA_2025_BP.communication / 100).toLocaleString('tr-TR')}, Sağlık %${(TUIK_HBA_2025_BP.health / 100).toLocaleString('tr-TR')}, Eğitim %${(TUIK_HBA_2025_BP.education / 100).toLocaleString('tr-TR')}. İstekler: Restoran/Kafe %${(TUIK_HBA_2025_BP.restaurants / 100).toLocaleString('tr-TR')}, Giyim %${(TUIK_HBA_2025_BP.clothing / 100).toLocaleString('tr-TR')}, Eğlence %${(TUIK_HBA_2025_BP.recreation / 100).toLocaleString('tr-TR')}, Diğer %${((TUIK_HBA_2025_BP.furnishings + TUIK_HBA_2025_BP.personalCare + TUIK_HBA_2025_BP.alcoholTobacco) / 100).toLocaleString('tr-TR')} (mobilya, kişisel bakım, alkol ve tütün). Konut ve kira (%${(TUIK_HBA_2025_BP.housing / 100).toLocaleString('tr-TR')}) ile sigorta ve finansal hizmetler (%${(TUIK_HBA_2025_BP.insuranceFinance / 100).toLocaleString('tr-TR')}) dışarıda. İhtiyaçların başlangıcı: gelir × ihtiyaç payı × ${CONSUMPTION_AT_TARGET.toLocaleString('tr-TR')}.`,
    source:
      'TÜİK Hanehalkı Bütçe Araştırması, "Hanehalkı Tüketim Harcaması, 2025" (yayım 2 Haziran 2026, COICOP 2018). Birincil bülten (veriportali.tuik.gov.tr) açılamadı; birincil bülten doğrulanmalı. Rakamlar 2025 değerleri birebir aynı olan iki kaynaktan: https://www.cnbce.com/veriler/tuik-son-tabloyu-acikladi-konut-kira-ulastirma-hangi-kaleme-ne-kadar-harcadik-h30893; https://www.dunya.com/kose-yazisi/kazanc-kira-mutfak-ve-yola-gidiyor/827124',
    reason: `Harcama geçmişiniz yokken kategori limitleri bu paylarla başlar ve üç dönemde sizin harcamanıza geçer. Ulaştırmanın Akaryakıt ile Ulaşım arasında yarı yarıya bölünmesi varsayımdır; ${CONSUMPTION_AT_TARGET.toLocaleString('tr-TR')} katsayısı 1 − birikim hedefi (%${SAVING_RATE_TARGET * 100}). Konut grubu yükletilmiş kira içerdiği için dışarıda.`,
  },
  {
    id: 'card-min',
    title: 'Kart asgari ödemesi tahmini',
    value: `Girilmemiş kart asgari ödemesi bakiyenin en az %${CARD_MIN_RATE * 100}'si sayılır. Toplam kart limiti 50.000 TL'ye kadar %20, üstünde %40; limit bilinmediği için %40 kademesi uygulanmaz.`,
    source: 'Sözcü, 4 Ağustos 2026: https://www.sozcu.com.tr/kredi-kartinda-bu-siniri-asanlar-daha-fazla-odeme-yapacak-p342271. Yayından önce BDDK kart yönetmeliğiyle doğrulanmalı.',
    reason: 'Asgari ödeme girilmemişse kart yükü olduğundan düşük görünmesin diye alt sınır kullanılır.',
  },
  {
    id: 'income-conservative',
    title: 'Gelir tabanı',
    value: 'Maaş ve düzenli gelirler esas alınır. Düzensiz gelir: son 3 dönemin en düşüğü (en az 2 dönem kayıt gerekir; gelir olmayan dönem 0 sayılır). Yıllık gelir ilk ödemeden itibaren ayda 1/12 sayılır. Tek seferlik gelir yalnızca birikim ve borç kapatmaya gider.',
    source: 'Temkinli varsayım (ürün kuralı).',
    reason: 'Bütçe gelmesi kesin olmayan gelire dayanmaz; fazla gelir harcamaya değil birikime gider.',
  },
  {
    id: 'payday',
    title: 'Maaş günü ve hafta sonu',
    value: 'Maaş günü hafta sonuna denk gelirse önceki iş günü yatar; o gelir yine yeni ayınıza sayılır. Resmî tatiller hesaba katılmaz.',
    source: 'Basitleştirici varsayım.',
    reason: 'Erken yatan maaş, ait olduğu dönemin bütçesini besler.',
  },
  {
    id: 'returns',
    title: 'Reel getiri ve oynaklık',
    value: RISK_PROFILES.map((p) => `${p.label} (%${Math.round(p.equity * 100)} hisse): reel %${p.realReturnPct.toLocaleString('tr-TR')}, oynaklık %${p.volatilityPct.toLocaleString('tr-TR')}`).join('; '),
    source: `Dimson, Marsh ve Staunton, küresel uzun dönem getiri verileri (Global Investment Returns Yearbook): hisse reel ~%${EQUITY_REAL_PCT.toLocaleString('tr-TR')}, tahvil reel ~%${BOND_REAL_PCT.toLocaleString('tr-TR')}.`,
    reason:
      'Profilin hisse/tahvil oranına göre ağırlıklı ortalama. Bütün tutarlar bugünün parasıyladır: plan birimi TL ise reel hesap TÜİK TÜFE ile enflasyondan arındırılmış TL varsayar; USD ya da altın planında hedef o birimde sabittir.',
  },
  {
    id: 'risk',
    title: 'Risk toleransı ve risk kapasitesi',
    value: 'Nihai profil, toleransla kapasitenin düşük olanıdır.',
    source: 'Grable, J. ve Lytton, R. H. (1999), "Financial Risk Tolerance Revisited: The Development of a Risk Assessment Instrument", Financial Services Review. Testteki sorular bu ölçekten uyarlanmıştır, birebir kopya değildir.',
    reason: 'Tolerans ne kadar dalgalanmaya katlanmak istediğinizi, kapasite (süre, gelir düzeni, acil fon, borç yükü) ne kadarına katlanabileceğinizi gösterir; planlama literatüründe ikisi ayrı ölçülür.',
  },
  {
    id: 'debt',
    title: 'Borç kapatma sırası',
    value: 'Varsayılan önce en yüksek faiz; isterseniz önce en küçük borç.',
    source: 'Önce en yüksek faiz toplam faizi en aza indirir. Önce en küçük borcun motivasyon etkisi: Gal, D. ve McShane, B. B. (2012), "Can Small Victories Help Win the War?", Journal of Marketing Research.',
    reason: 'Bir borç kapandığında onun taksiti sıradaki borca, bütün borçlar bitince birikime eklenir.',
  },
  {
    id: 'coast',
    title: 'Coast FI eşiği',
    value: 'Hedef sermaye ÷ (1 + reel getiri)^(hedef yaşa kalan yıl)',
    source: 'Akademik kaynağı yok; finansal bağımsızlık topluluğunda kullanılan bir kavram. Burada yalnızca bileşik getiri hesabı olarak gösterilir.',
    reason: 'Bu tutar bugün birikmişse, hiç eklemeseniz de beklenen getiriyle hedef yaşta hedefe ulaşılır.',
  },
  {
    id: 'montecarlo',
    title: 'Başarı olasılığı (Monte Carlo)',
    value: `${MC_RUNS.toLocaleString('tr-TR')} senaryo, yıllık adım, sabit tohumlu rastgele sayı; getiriler normal dağılımlı. Başarı: paranın yetmesi gereken yaşa kadar birikimin tükenmemesi.`,
    source: 'Milevsky, M. A. ve Robinson, C. (2000), "Self-Annuitization and Ruin in Retirement", North American Actuarial Journal.',
    reason: 'Tek bir ortalama getiri yerine birikim ve çekim dönemlerini birlikte birçok olası getiri sırasıyla dener. Sonuç varsayıma dayalı bir benzetimdir; gerçek olasılık değildir.',
  },
  {
    id: 'inflation',
    title: 'Enflasyon ve gelecekteki hedef',
    value: `TL nominal hedef için varsayılan yıllık enflasyon %${DEFAULT_INFLATION_PCT} (testte değiştirilebilir). USD ve gram altın karşılığı güncel kurla hesaplanır.`,
    source: 'Kullanıcı varsayımı; geçmiş enflasyon için TÜİK TÜFE.',
    reason: 'Hedef bugünün parasıyla hesaplanır; gelecekteki TL tutarı yalnızca fikir vermek için bu varsayımla büyütülür.',
  },
  {
    id: 'income',
    title: 'Emeklilikteki gelirler',
    value: 'SGK/BES aylığı, kira ve pasif gelir ile yarı zamanlı iş geliri hedef yaştan itibaren başlar ve bugünün parasıyla sabit kalır.',
    source: 'Basitleştirici varsayım.',
    reason: 'Bu gelirler birikimden çekilmesi gereken tutarı azaltır. Emin değilseniz 0 girmek daha temkinlidir.',
  },
]
