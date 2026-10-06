import { Capacitor } from '@capacitor/core'

/** Android / iOS uygulaması içinde mi çalışıyoruz (web veya PWA değil)? */
export const isNativeApp = Capacitor.isNativePlatform()

/** Durum çubuğu yazılarını temaya uydurur. Web'de hiçbir şey yapmaz. */
export function syncNativeTheme(theme: 'light' | 'dark') {
  if (!isNativeApp) return
  void import('@capacitor/status-bar').then(({ StatusBar, Style }) =>
    StatusBar.setStyle({ style: theme === 'dark' ? Style.Dark : Style.Light }).catch(() => {}),
  )
}
