// Sitenin bağlandığı adresler. Değerler herkese açıktır (uygulamanın derlemesinde de bulunur).
export const APP_URL = import.meta.env.PUBLIC_APP_URL || 'https://ahestetey-coder.github.io/Harcama-atlas-/'
export const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL || 'https://muonkdoiiuxwmcgshyza.supabase.co'
export const SUPABASE_ANON_KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_x_70OrbW4voTr1-sQAc0jQ_WzsFl56d'
/** Mobil uygulamanın bağlantı şeması: telefondan "Uygulamayı aç" bununla açılır. */
export const APP_SCHEME = 'com.harcamaatlasi.app://'
export const AUTH_STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`

/** Ziyaret istatistikleri (PostHog). Anahtar boşsa analitik ve çerez onayı kutusu hiç çalışmaz. */
export const POSTHOG_KEY = import.meta.env.PUBLIC_POSTHOG_KEY || ''
export const POSTHOG_HOST = import.meta.env.PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com'
export const CONSENT_KEY = 'ha-cerez-onayi'
