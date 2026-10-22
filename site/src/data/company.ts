/**
 * Yasal metinlerde geçen şirket ve iletişim bilgileri.
 * Boş alanlar sayfada sarı "doldurulacak" etiketiyle görünür; şirket kurulunca buradan doldurulur.
 */
export const COMPANY = {
  /** Ticaret unvanı (ör. Harcama Atlası Yazılım A.Ş.) */
  unvan: '',
  /** Açık adres */
  adres: '',
  mersis: '',
  vergiDairesi: '',
  vergiNo: '',
  /** Kayıtlı elektronik posta (KEP) adresi */
  kep: '',
  /** Destek ve KVKK başvuruları için e-posta */
  eposta: '',
  telefon: '',
}

/** Metinlerin son güncellenme tarihi */
export const LEGAL_UPDATED = '22 Ekim 2026'

/** Hukuki inceleme tamamlanınca false yapılır; taslak uyarısı kalkar. */
export const LEGAL_DRAFT = true
