import { BookOpen, ChevronDown, Newspaper, Scale } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { ASSUMPTIONS } from "../domain/assumptions";
import { PageHeader } from "../components/AppShell";
import { useState } from "react";
import { ReportMeta, ReportView } from "../components/Report";
import { REPORT_KIND_LABEL, type ReportKind } from "../cloud/research";
import { PlanBadge, PlanGate } from "../components/PlanGate";
import { useReports } from "../state/coach";
import { Alert, Badge, Card, More, Segmented } from "../components/ui/primitives";
import { tt, ttf } from '../lib/i18n'

interface Topic {
  id: string;
  title: string;
  summary: string;
  points: string[];
  inApp?: string;
}

/** Genel bilgilendirme metinleri. Belirli bir ürünü önermez, alım-satım tavsiyesi içermez. */
const TOPICS: Topic[] = [
  {
    id: "risk",
    title: tt('Risk'),
    summary:
      tt('Bir birikimin değerinin beklediğinizden farklı, özellikle daha düşük çıkma ihtimali.'),
    points: [
      tt('Getirisi yüksek görünen araçlarda değer dalgalanması da genellikle daha büyüktür.'),
      tt('Paraya ne zaman ihtiyaç duyacağınız, ne kadar dalgalanmaya katlanabileceğinizi belirler. Yakın zamanda gereken para için dalgalanma daha çok sorun yaratır.'),
      tt('Geçmişteki getiri gelecekteki getiriyi garanti etmez.'),
    ],
    inApp:
      tt('Gelecek senaryolarında temkinli, orta ve olumlu varsayımları yan yana görerek belirsizliğin etkisini inceleyebilirsiniz.'),
  },
  {
    id: "liquidity",
    title: tt('Likidite'),
    summary:
      tt('Bir varlığı, değer kaybetmeden ve hızla nakde çevirebilme kolaylığı.'),
    points: [
      tt('Vadesiz hesap ve nakit en likit varlıklardır; vadeli mevduat, fon veya altında bozdurma süresi ve maliyeti olabilir.'),
      tt('Acil durum birikiminin kolay ulaşılabilir olması, beklenmedik bir giderde borçlanma ihtiyacını azaltır.'),
      tt('Likit olmayan bir varlığı acele satmak, düşük fiyatı kabul etmek anlamına gelebilir.'),
    ],
    inApp:
      tt('Yolculuğum sayfasındaki finansal güvence göstergesi yalnızca hızlı kullanılabilir birikimi (mevduat, nakit, döviz, altın, fon) sayar.'),
  },
  {
    id: "fees",
    title: tt('Masraf ve vergiler'),
    summary:
      tt('Alım-satım komisyonu, yönetim ücreti, kur farkı ve vergiler getiriyi doğrudan azaltır.'),
    points: [
      tt('Yıllık küçük bir yönetim ücreti bile uzun sürede birikimin önemli bir kısmını götürebilir.'),
      tt('Alış ve satış fiyatı arasındaki fark (makas) da bir maliyettir.'),
      tt('Bir ürünü karşılaştırırken getiriyi masraflar ve vergiler düşüldükten sonra değerlendirmek gerekir.'),
    ],
    inApp:
      tt('Yatırımlarım sayfasında alış ve satışları gerçek ödediğiniz fiyatla girerseniz kâr/zarar hesabı masrafları da yansıtır.'),
  },
  {
    id: "diversification",
    title: tt('Çeşitlendirme'),
    summary:
      tt('Birikimi tek bir araca bağlamak yerine farklı davranan araçlara dağıtmak.'),
    points: [
      tt('Farklı varlıklar aynı anda aynı yönde hareket etmeyebilir; bu, toplam dalgalanmayı azaltabilir.'),
      tt('Çeşitlendirme kaybı önlemez, yalnızca tek bir aracın etkisini sınırlar.'),
      tt('Aynı türden çok sayıda araç (ör. aynı sektördeki hisseler) gerçek bir çeşitlendirme sağlamayabilir.'),
    ],
    inApp:
      tt('Yatırımlarım sayfasındaki dağılım listesi, birikiminizin türlere göre nasıl dağıldığını gösterir.'),
  },
  {
    id: "inflation",
    title: tt('Enflasyon ve reel getiri'),
    summary:
      tt('Reel getiri, fiyat artışları düşüldükten sonra kalan gerçek kazançtır.'),
    points: [
      tt('Nominal olarak artan bir birikim, fiyatlar daha hızlı artıyorsa satın alma gücü kaybedebilir.'),
      tt('Uzun vadeli hedefleri bugünün parasıyla düşünmek, hedefin gerçekte ne kadar uzakta olduğunu daha iyi gösterir.'),
    ],
    inApp:
      tt('Senaryolar sayfasındaki "Bugünün parasıyla" görünümü sonuçları enflasyondan arındırılmış olarak gösterir.'),
  },
  {
    id: "emergency",
    title: tt('Acil durum birikimi'),
    summary:
      tt('Gelir kesildiğinde veya beklenmedik bir gider çıktığında başvurulan, kolay ulaşılır birikim.'),
    points: [
      tt('Sık kullanılan bir ölçü, zorunlu giderlerin birkaç aylık tutarıdır; gelir düzensizse daha uzun süre düşünülebilir.'),
      tt('Bu birikim getiri için değil güvence için tutulur; bu yüzden likidite öndedir.'),
    ],
    inApp:
      tt('Yolculuğum rotasında acil durum aşaması, zorunlu giderlerinizin 3 aylık tutarını ölçüt alır.'),
  },
];

export default function LearningPage() {
  const reports = useReports(20);
  const [kind, setKind] = useState<ReportKind | "hepsi">("hepsi");
  const news = reports?.filter((r) => kind === "hepsi" || r.kind === kind) ?? null;
  return (
    <div>
      <PageHeader
        title={tt('Finansal bilgi')}
        subtitle={
          <span className="inline-flex items-center gap-2">
            <PlanBadge plan="plusplus" /> {tt('Temel kavramlar ve ekonomi gündemi')}
          </span>
        }
      />
      <PlanGate
        feature="learning"
        title={tt('Finansal bilgi ve ekonomi gündemi')}
        points={[
          tt('Risk, likidite, masraf ve çeşitlendirme gibi temel kavramlar'),
          tt('Editör onaylı günlük, haftalık ve aylık ekonomi raporları'),
          tt('Her bilginin kaynağı ve tarihi'),
        ]}
      >
        <div className="flex flex-col gap-4">
          <Alert tone="info">
            {tt('Genel bilgidir; yatırım tavsiyesi değildir.')}
          </Alert>

          <section aria-label={tt('Temel kavramlar')}>
            <h2 className="mb-2 flex items-center gap-2 font-display text-base font-semibold">
              <BookOpen className="size-5 text-accent" /> {tt('Temel kavramlar')}
            </h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {TOPICS.map((t) => (
                <Card key={t.id} className="p-0">
                  <details className="group p-5">
                    <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
                      <span>
                        <span className="block font-semibold text-ink">
                          {t.title}
                        </span>
                        <span className="mt-1 block text-[13px] text-muted">
                          {t.summary}
                        </span>
                      </span>
                      <ChevronDown
                        className="mt-0.5 size-5 shrink-0 text-subtle transition-transform group-open:rotate-180"
                        aria-hidden
                      />
                    </summary>
                    <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[13px] text-muted">
                      {t.points.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                    {t.inApp && (
                      <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-[12.5px] text-muted">
                        {t.inApp}
                      </p>
                    )}
                  </details>
                </Card>
              ))}
            </div>
          </section>

          <Assumptions />

          <section aria-label={tt('Ekonomi gündemi')}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-display text-base font-semibold">
                <Newspaper className="size-5 text-accent" /> {tt('Ekonomi gündemi')}
              </h2>
              <Segmented<ReportKind | "hepsi">
                label={tt('Rapor türü')}
                value={kind}
                onChange={setKind}
                className="no-scrollbar max-sm:w-full max-sm:overflow-x-auto"
                options={[
                  { value: "hepsi", label: tt('Tümü') },
                  ...(["gunluk", "haftalik", "aylik", "acil"] as const).map(
                    (k) => ({ value: k, label: REPORT_KIND_LABEL[k] }),
                  ),
                ]}
              />
            </div>
            <p className="text-[12.5px] text-muted">
              {tt('Editör onayından sonra yayınlanır.')}
            </p>
            <More className="mb-3">
              {tt('Raporlar herkese aynıdır; seçilmiş resmî kurumlar, haber kaynakları ve uzmanlardan derlenir. Her cümlenin kaynağı numarasıyla gösterilir.')}
              <span className="mt-2 flex flex-wrap gap-2 text-[12.5px]">
                <span className="inline-flex items-center gap-1.5">
                  <Badge tone="teal">{tt('Resmî veri')}</Badge> {tt('kurumun açıkladığı')}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Badge tone="neutral">{tt('Haber')}</Badge> {tt('olanı aktarır')}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Badge tone="accent">{tt('Uzman yorumu')}</Badge> {tt('bir kişinin görüşüdür')}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Badge tone="warning">{tt('Tahmin')}</Badge> {tt('gerçekleşmeyebilir')}
                </span>
              </span>
            </More>
            {news && news.length > 0 ? (
              <div className="flex flex-col gap-3">
                {news.map((r, i) => (
                  <Card key={r.id} className="p-4 sm:p-5">
                    <div className="mb-1 font-semibold text-ink">{r.title}</div>
                    <ReportMeta r={r} />
                    <ReportView r={r} className="mt-3" openFirst={i === 0} />
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-5">
                <p className="text-sm text-muted">
                  {news ? tt('Henüz yayınlanmış rapor yok.') : tt('Yükleniyor…')}
                </p>
              </Card>
            )}
          </section>
        </div>
      </PlanGate>
    </div>
  );
}

/** Özgürlük Rotası'nın varsayımları ve kaynakları (src/domain/assumptions.ts). */
function Assumptions() {
  const { hash } = useLocation();
  useEffect(() => {
    if (hash === "#varsayimlar")
      document.getElementById("varsayimlar")?.scrollIntoView({ block: "start" });
  }, [hash]);
  return (
    <section id="varsayimlar" aria-label={tt('Varsayımlar ve kaynaklar')} className="scroll-mt-20">
      <h2 className="mb-1 flex items-center gap-2 font-display text-base font-semibold">
        <Scale className="size-5 text-accent" /> {tt('Varsayımlar ve kaynaklar')}
      </h2>
      <p className="mb-3 text-[12.5px] text-muted">
        {tt('Rotadaki hesaplar bu varsayımlara dayanır.')}
      </p>
      <Card className="p-0">
        <ul className="divide-y divide-line">
          {ASSUMPTIONS.map((a) => (
            <li key={a.id} className="p-4">
              <div className="font-semibold text-ink">{a.title}</div>
              <p className="mt-1 text-[13px] text-ink">{a.value}</p>
              <p className="mt-1 text-[12.5px] text-muted">{a.reason}</p>
              <p className="mt-1 text-[12px] text-subtle">{ttf('Kaynak: {0}', a.source)}</p>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
