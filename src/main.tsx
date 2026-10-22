import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { initLang } from './lib/i18n'
import { installViewportVars } from './lib/viewport'

installViewportVars()

// Dil sözlüğü uygulama modüllerinden önce yüklenir; modül düzeyindeki metinler de seçili dille hesaplanır.
void initLang().then(async () => {
  const { default: App } = await import('./App')
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
