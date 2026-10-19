import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  site: 'https://harcamaatlasi.pages.dev',
  i18n: { defaultLocale: 'tr', locales: ['tr', 'en'], routing: { prefixDefaultLocale: false } },
  vite: { plugins: [tailwindcss()] },
})
