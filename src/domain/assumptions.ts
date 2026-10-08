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
    value: `${EMERGENCY_MONTHS.regular} ay (düzenli gelir), ${EMERGENCY_MONTHS.variableOrDependents} ay (değişken gelir ya da bakmakla yükümlü kişi), ${EMERGENCY_MONTHS.irregular} ay (düzensiz gelir) zorunlu gider.`,
    source: 'Yaygın finansal planlama standardı.',
    reason: 'Beklenmedik bir gider ya da gelir kesintisinin yeni borca dönmesini önler.',
  },
  {
    id: 'dti',
    title: 'Borç ödemesi / gelir sınırı',
    value: `%${DTI_LIMIT * 100}`,
    source: 'Kredi değerlendirmesinde yaygın kullanılan eşik.',
    reason: 'Aylık borç ödemeleri bu oranı aştığında bütçe kırılganlaşır.',
  },
  {
    id: 'saving',
    title: 'Birikim oranı hedefi',
    value: `Gelirin en az %${SAVING_RATE_TARGET * 100}'si`,
    source: 'Warren, E. ve Tyagi, A. W. (2005), All Your Worth (50/30/20 kuralı).',
    reason: 'Gelirin yarısı ihtiyaçlara, %30 isteklere, en az %20 birikime.',
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
