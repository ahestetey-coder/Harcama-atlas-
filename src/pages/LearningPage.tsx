import { BookOpen, ChevronDown, Newspaper } from 'lucide-react'
import { PageHeader } from '../components/AppShell'
import { PlanBadge, PlanGate } from '../components/PlanGate'
import { Alert, Badge, Card } from '../components/ui/primitives'

interface Topic {
  id: string
  title: string
  summary: string
  points: string[]
  inApp?: string
}

/** Genel bilgilendirme metinleri. Belirli bir ürünü önermez, alım-satım tavsiyesi içermez. */
const TOPICS: Topic[] = [
  {
    id: 'risk',
    title: 'Risk',
    summary: 'Bir birikimin değerinin beklediğinizden farklı, özellikle daha düşük çıkma ihtimali.',
    points: [
      'Getirisi yüksek görünen araçlarda değer dalgalanması da genellikle daha büyüktür.',
      'Paraya ne zaman ihtiyaç duyacağınız, ne kadar dalgalanmaya katlanabileceğinizi belirler. Yakın zamanda gereken para için dalgalanma daha çok sorun yaratır.',
      'Geçmişteki getiri gelecekteki getiriyi garanti etmez.',
    ],
    inApp: 'Gelecek senaryolarında temkinli, orta ve olumlu varsayımları yan yana görerek belirsizliğin etkisini inceleyebilirsiniz.',
  },
  {
    id: 'liquidity',
    title: 'Likidite',
    summary: 'Bir varlığı, değer kaybetmeden ve hızla nakde çevirebilme kolaylığı.',
    points: [
      'Vadesiz hesap ve nakit en likit varlıklardır; vadeli mevduat, fon veya altında bozdurma süresi ve maliyeti olabilir.',
      'Acil durum birikiminin kolay ulaşılabilir olması, beklenmedik bir giderde borçlanma ihtiyacını azaltır.',
      'Likit olmayan bir varlığı acele satmak, düşük fiyatı kabul etmek anlamına gelebilir.',
    ],
    inApp: 'Yolculuğum sayfasındaki finansal güvence göstergesi yalnızca hızlı kullanılabilir birikimi (mevduat, nakit, döviz, altın, fon) sayar.',
  },
  {
    id: 'fees',
    title: 'Masraf ve vergiler',
    summary: 'Alım-satım komisyonu, yönetim ücreti, kur farkı ve vergiler getiriyi doğrudan azaltır.',
    points: [
      'Yıllık küçük bir yönetim ücreti bile uzun sürede birikimin önemli bir kısmını götürebilir.',
      'Alış ve satış fiyatı arasındaki fark (makas) da bir maliyettir.',
      'Bir ürünü karşılaştırırken getiriyi masraflar ve vergiler düşüldükten sonra değerlendirmek gerekir.',
    ],
    inApp: 'Varlıklarım sayfasında alış ve satışları gerçek ödediğiniz fiyatla girerseniz kâr/zarar hesabı masrafları da yansıtır.',
  },
  {
    id: 'diversification',
    title: 'Çeşitlendirme',
    summary: 'Birikimi tek bir araca bağlamak yerine farklı davranan araçlara dağıtmak.',
    points: [
      'Farklı varlıklar aynı anda aynı yönde hareket etmeyebilir; bu, toplam dalgalanmayı azaltabilir.',
      'Çeşitlendirme kaybı önlemez, yalnızca tek bir aracın etkisini sınırlar.',
      'Aynı türden çok sayıda araç (ör. aynı sektördeki hisseler) gerçek bir çeşitlendirme sağlamayabilir.',
    ],
    inApp: 'Varlıklarım sayfasındaki dağılım listesi, birikiminizin türlere göre nasıl dağıldığını gösterir.',
  },
  {
    id: 'inflation',
    title: 'Enflasyon ve reel getiri',
    summary: 'Reel getiri, fiyat artışları düşüldükten sonra kalan gerçek kazançtır.',
    points: [
      'Nominal olarak artan bir birikim, fiyatlar daha hızlı artıyorsa satın alma gücü kaybedebilir.',
      'Uzun vadeli hedefleri bugünün parasıyla düşünmek, hedefin gerçekte ne kadar uzakta olduğunu daha iyi gösterir.',
    ],
    inApp: 'Senaryolar sayfasındaki "Bugünün parasıyla" görünümü sonuçları enflasyondan arındırılmış olarak gösterir.',
  },
  {
    id: 'emergency',
    title: 'Acil durum birikimi',
    summary: 'Gelir kesildiğinde veya beklenmedik bir gider çıktığında başvurulan, kolay ulaşılır birikim.',
    points: [
      'Sık kullanılan bir ölçü, zorunlu giderlerin birkaç aylık tutarıdır; gelir düzensizse daha uzun süre düşünülebilir.',
      'Bu birikim getiri için değil güvence için tutulur; bu yüzden likidite öndedir.',
    ],
    inApp: 'Yolculuğum rotasında acil durum aşaması, zorunlu giderlerinizin 3 aylık tutarını ölçüt alır.',
  },
]

export default function LearningPage() {
  return (
    <div>
      <PageHeader
        title="Finansal bilgi"
        subtitle={
          <span className="inline-flex items-center gap-2">
            <PlanBadge plan="plusplus" /> Temel kavramlar ve ekonomi gündemi
          </span>
        }
      />
      <PlanGate
        feature="learning"
        title="Finansal bilgi ve ekonomi gündemi"
        points={['Risk, likidite, masraf ve çeşitlendirme gibi temel kavramlar', 'Kaynağı ve tarihi belli ekonomi haberleri', 'Haber, yorum ve tahmin ayrı gösterilir']}
      >
        <div className="flex flex-col gap-4">
          <Alert tone="info">Bu sayfa genel bilgilendirme içindir; yatırım tavsiyesi değildir ve belirli bir ürünün alınmasını veya satılmasını önermez.</Alert>

          <section aria-label="Temel kavramlar">
            <h2 className="mb-2 flex items-center gap-2 font-display text-base font-semibold">
              <BookOpen className="size-5 text-accent" /> Temel kavramlar
            </h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {TOPICS.map((t) => (
                <Card key={t.id} className="p-0">
                  <details className="group p-5">
                    <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
                      <span>
                        <span className="block font-semibold text-ink">{t.title}</span>
                        <span className="mt-1 block text-[13px] text-muted">{t.summary}</span>
                      </span>
                      <ChevronDown className="mt-0.5 size-5 shrink-0 text-subtle transition-transform group-open:rotate-180" aria-hidden />
                    </summary>
                    <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[13px] text-muted">
                      {t.points.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                    {t.inApp && <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-[12.5px] text-muted">{t.inApp}</p>}
                  </details>
                </Card>
              ))}
            </div>
          </section>

          <section aria-label="Ekonomi gündemi">
            <h2 className="mb-2 flex items-center gap-2 font-display text-base font-semibold">
              <Newspaper className="size-5 text-accent" /> Ekonomi gündemi
            </h2>
            <Card className="p-5">
              <p className="text-sm text-muted">
                Henüz bir haber kaynağı bağlı değil, bu yüzden burada haber gösterilmiyor. Kaynak bağlandığında her haber kaynağı ve yayın tarihiyle birlikte görünecek; uygulama kendi başına haber yazmaz.
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-[12.5px] text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <Badge tone="neutral">Haber</Badge> olanı aktarır
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Badge tone="accent">Yorum</Badge> bir kişinin görüşüdür
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Badge tone="warning">Tahmin</Badge> gerçekleşmeyebilir
                </span>
              </div>
            </Card>
          </section>
        </div>
      </PlanGate>
    </div>
  )
}
