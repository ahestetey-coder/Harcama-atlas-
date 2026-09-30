import { PRIORITY } from '../domain/rules'
import type { Category, Member, Rule, RuleMatchMode, SpendGroup } from '../domain/types'

export const OTHER_CATEGORY_ID = 'cat-diger'

type SeedCategory = Pick<Category, 'id' | 'name' | 'icon' | 'color'> & { system?: boolean }

export const DEFAULT_CATEGORIES: SeedCategory[] = [
  { id: 'cat-market', name: 'Market', icon: 'shopping-cart', color: '#059669' },
  { id: 'cat-akaryakit', name: 'Akaryakıt', icon: 'fuel', color: '#d97706' },
  { id: 'cat-restoran', name: 'Restoran/Kafe', icon: 'coffee', color: '#db2777' },
  { id: 'cat-ulasim', name: 'Ulaşım', icon: 'bus', color: '#2563eb' },
  { id: 'cat-faturalar', name: 'Faturalar', icon: 'receipt', color: '#0891b2' },
  { id: 'cat-kira', name: 'Kira/Ev', icon: 'home', color: '#7c3aed' },
  { id: 'cat-saglik', name: 'Sağlık', icon: 'heart-pulse', color: '#dc2626' },
  { id: 'cat-egitim', name: 'Eğitim', icon: 'graduation-cap', color: '#65a30d' },
  { id: 'cat-giyim', name: 'Giyim', icon: 'shirt', color: '#c026d3' },
  { id: 'cat-bebek', name: 'Bebek/Çocuk', icon: 'baby', color: '#f43f5e' },
  { id: 'cat-eglence', name: 'Eğlence', icon: 'clapperboard', color: '#4f46e5' },
  { id: 'cat-abonelik', name: 'Abonelikler', icon: 'repeat', color: '#0d9488' },
  { id: 'cat-banka', name: 'Banka Ücreti/Faiz', icon: 'landmark', color: '#475569' },
  { id: OTHER_CATEGORY_ID, name: 'Diğer', icon: 'shapes', color: '#94a3b8', system: true },
]

export const DEFAULT_GROUPS: Pick<SpendGroup, 'id' | 'name' | 'color'>[] = [
  { id: 'grp-bireysel', name: 'Bireysel', color: '#2563eb' },
  { id: 'grp-ortak', name: 'Ortak', color: '#059669' },
]

export function buildDefaultGroups(now: string): SpendGroup[] {
  return DEFAULT_GROUPS.map((g, i) => ({ ...g, archived: false, order: i, createdAt: now, updatedAt: now }))
}

/** Bu cihazın sahibi. Kimliği rastgeledir; davetle katılınca davet edenin verdiği kimliğe geçer. */
export function buildSelfMember(now: string, name = 'Ben'): Member {
  return { id: crypto.randomUUID(), name, color: '#0f766e', groupIds: DEFAULT_GROUPS.map((g) => g.id), createdAt: now, updatedAt: now }
}

type SeedRule = [pattern: string, categoryId: string, mode?: RuleMatchMode]

const SEED_RULES: SeedRule[] = [
  ['SHELL', 'cat-akaryakit'],
  ['OPET', 'cat-akaryakit'],
  ['PETROL OFİSİ', 'cat-akaryakit'],
  ['AYTEMİZ', 'cat-akaryakit'],
  ['LUKOIL', 'cat-akaryakit'],
  ['BP', 'cat-akaryakit'],
  ['TOTALENERGIES', 'cat-akaryakit'],
  ['MİGROS', 'cat-market', 'prefix'],
  ['BİM', 'cat-market'],
  ['A101', 'cat-market'],
  ['ŞOK', 'cat-market'],
  ['CARREFOURSA', 'cat-market'],
  ['MACROCENTER', 'cat-market'],
  ['HAKMAR', 'cat-market'],
  ['FİLE MARKET', 'cat-market'],
  ['GETİR', 'cat-market'],
  ['STARBUCKS', 'cat-restoran'],
  ['KAHVE DÜNYASI', 'cat-restoran'],
  ['BURGER KING', 'cat-restoran'],
  ['MCDONALDS', 'cat-restoran'],
  ['SİMİT SARAYI', 'cat-restoran'],
  ['YEMEKSEPETİ', 'cat-restoran'],
  ['RESTORAN', 'cat-restoran', 'prefix'],
  ['RESTAURANT', 'cat-restoran', 'prefix'],
  ['CAFE', 'cat-restoran'],
  ['İSTANBULKART', 'cat-ulasim'],
  ['UBER', 'cat-ulasim'],
  ['BİTAKSİ', 'cat-ulasim'],
  ['MARTI', 'cat-ulasim'],
  ['TCDD', 'cat-ulasim'],
  ['PEGASUS', 'cat-ulasim'],
  ['TÜRK HAVA YOLLARI', 'cat-ulasim'],
  ['OTOPARK', 'cat-ulasim', 'prefix'],
  ['HGS', 'cat-ulasim'],
  ['ENERJİSA', 'cat-faturalar'],
  ['İGDAŞ', 'cat-faturalar'],
  ['İSKİ', 'cat-faturalar'],
  ['BAŞKENTGAZ', 'cat-faturalar'],
  ['TURKCELL', 'cat-faturalar'],
  ['VODAFONE', 'cat-faturalar'],
  ['TÜRK TELEKOM', 'cat-faturalar'],
  ['SUPERONLINE', 'cat-faturalar'],
  ['AİDAT', 'cat-kira'],
  ['KİRA', 'cat-kira'],
  ['IKEA', 'cat-kira'],
  ['KOÇTAŞ', 'cat-kira'],
  ['ENGLISH HOME', 'cat-kira'],
  ['ECZANE', 'cat-saglik', 'prefix'],
  ['HASTANE', 'cat-saglik', 'prefix'],
  ['ACIBADEM', 'cat-saglik'],
  ['MEDICAL PARK', 'cat-saglik'],
  ['KIRTASİYE', 'cat-egitim', 'prefix'],
  ['UDEMY', 'cat-egitim'],
  ['LC WAIKIKI', 'cat-giyim'],
  ['DEFACTO', 'cat-giyim'],
  ['KOTON', 'cat-giyim'],
  ['ZARA', 'cat-giyim'],
  ['BOYNER', 'cat-giyim'],
  ['EBEBEK', 'cat-bebek'],
  ['JOKER', 'cat-bebek'],
  ['TOYZZ SHOP', 'cat-bebek'],
  ['CİNEMAXİMUM', 'cat-eglence'],
  ['SİNEMA', 'cat-eglence', 'prefix'],
  ['BİLETİX', 'cat-eglence'],
  ['PASSO', 'cat-eglence'],
  ['STEAM', 'cat-eglence'],
  ['NETFLIX', 'cat-abonelik'],
  ['SPOTIFY', 'cat-abonelik'],
  ['YOUTUBE PREMIUM', 'cat-abonelik'],
  ['DISNEY PLUS', 'cat-abonelik'],
  ['AMAZON PRIME', 'cat-abonelik'],
  ['APPLE COM BILL', 'cat-abonelik'],
  ['EXXEN', 'cat-abonelik'],
  ['FAİZ', 'cat-banka'],
  ['BSMV', 'cat-banka'],
  ['KKDF', 'cat-banka'],
  ['YILLIK ÜCRET', 'cat-banka'],
  ['KART ÜCRETİ', 'cat-banka'],
  // v3 ile eklenenler (gerçek bir döküm örneğinde sık görülen ifadeler). Yeni kural eklerken sona ekleyin.
  ['TP İSTASYON', 'cat-akaryakit'],
  ['PETROL', 'cat-akaryakit', 'prefix'],
  ['LOKANTA', 'cat-restoran', 'prefix'],
  ['YEMEK SALONU', 'cat-restoran'],
  ['PİDE', 'cat-restoran', 'prefix'],
  ['KEBAP', 'cat-restoran', 'prefix'],
  ['KANTİN', 'cat-restoran', 'prefix'],
  ['GIDA', 'cat-market'],
  ['FİLE', 'cat-market'],
  ['İŞLEM ÜCRETİ', 'cat-banka'],
  ['KOMİSYON', 'cat-banka'],
  ['AMAZONPRIME', 'cat-abonelik', 'contains'],
  ['FATURA', 'cat-faturalar'],
  ['FAT ABONE', 'cat-faturalar'],
]

/** v2 şemasına kadar tohumlanan varsayılan kural sayısı; sonrakiler geçişle eklenir. */
export const RULES_BEFORE_V3 = 78

export function buildDefaultCategories(now: string): Category[] {
  return DEFAULT_CATEGORIES.map((c, i) => ({ ...c, archived: false, order: i, system: c.system ?? false, createdAt: now, updatedAt: now }))
}

export function buildDefaultRules(now: string): Rule[] {
  return SEED_RULES.map(([pattern, categoryId, mode], i) => ({
    id: `rule-default-${String(i + 1).padStart(3, '0')}`,
    pattern,
    matchMode: mode ?? 'word',
    categoryId,
    priority: PRIORITY.default,
    enabled: true,
    origin: 'default',
    createdAt: now,
    updatedAt: now,
  }))
}
