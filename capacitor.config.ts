import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Mobil uygulama (Android / iOS) ayarları.
 * appId mağazada yayınlandıktan sonra değiştirilemez.
 */
const config: CapacitorConfig = {
  appId: 'com.harcamaatlasi.app',
  appName: 'Harcama Atlası',
  webDir: 'dist',
  backgroundColor: '#0b1220',
  android: { allowMixedContent: false },
  ios: { contentInset: 'never', scrollEnabled: true },
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: '#0b1220', showSpinner: false },
    Keyboard: { resizeOnFullScreen: true },
    LocalNotifications: { smallIcon: 'ic_stat_notify', iconColor: '#10b981' },
  },
}

export default config
