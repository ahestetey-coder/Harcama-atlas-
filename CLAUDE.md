# Harcama Atlası

## İki dil kuralı (Türkçe + İngilizce)

Uygulamaya ve web sitesine yapılan her değişiklik ve her yeni ekleme hem Türkçe hem İngilizce yapılır.

- Uygulama: görünen her metin `tt('Türkçe')` / `ttf('… {0}', x)` ile sarılır (`src/lib/i18n.ts`), İngilizcesi `src/i18n/en.json` dosyasına eklenir.
- Web sitesi (`site/`): metinler sayfada `t('Türkçe', 'English')` ile yan yana yazılır (`site/src/lib/i18n.ts`). Yeni sayfa eklenirse `/en` altındaki İngilizce karşılığı da açılır ve `EN_PATHS` listesine yazılır.
- Uygulama ekran görüntüleri sitede iki dilde tutulur: `site/public/screenshots/*.webp` (Türkçe) ve `site/public/screenshots/en/*.webp` (İngilizce), aynı adlarla. Video için `site/public/video/` ve `site/public/video/en/`.

## Dallar

Cloudflare Pages canlı siteyi `web-sitesi` dalından kurar; `main` ve `web-sitesi` aynı tutulur.
