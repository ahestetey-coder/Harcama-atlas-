import { tt } from '../lib/i18n'
/** Supabase hata mesajlarını kullanıcıya anlaşılır Türkçeye çevirir. */
export function cloudErrorMessage(e: unknown): string {
  const msg = String((e as { message?: string })?.message ?? e ?? '')
  if (/Invalid login credentials/i.test(msg)) return tt('E-posta veya parola hatalı.')
  if (/Email not confirmed/i.test(msg)) return tt('E-posta adresiniz henüz doğrulanmadı. Gelen kutunuzdaki bağlantıya tıklayın.')
  if (/User already registered/i.test(msg)) return tt('Bu e-posta ile zaten hesap var; giriş yapın.')
  if (/Password should be at least/i.test(msg)) return tt('Parola en az 6 karakter olmalı.')
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return tt('Buluta ulaşılamadı. İnternet bağlantınızı veya bulut adresini kontrol edin.')
  if (/Invalid API key|No API key/i.test(msg)) return tt('Bulut anahtarı geçersiz. Ayarlardaki anahtarı kontrol edin.')
  if (/relation .* does not exist|function .* does not exist|Could not find the function/i.test(msg))
    return tt('Bulut veritabanı kurulmamış. Kurulum rehberindeki SQL dosyasını Supabase panelinde çalıştırın.')
  // Veritabanı fonksiyonlarımızın kendi Türkçe mesajları
  if (/Davet|üye|Giriş|Yetkiniz|grup|işlem/i.test(msg)) return msg.replace(/^.*?:\s*/, '')
  return tt('Bulut işlemi başarısız oldu. Biraz sonra tekrar deneyin.')
}
