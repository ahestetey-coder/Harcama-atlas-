import { chromium } from '@playwright/test'
const [out, path, t, n] = process.argv.slice(2)
const [w, h] = n === 'm' ? [390, 844] : [1440, 900]
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const p = await b.newPage({ viewport: { width: w, height: h }, colorScheme: t === 'koyu' ? 'dark' : 'light' })
const errs = []; p.on('pageerror', (e) => errs.push(e.message))
await p.goto(`http://localhost:4321${path}?tema=${t}`); await p.waitForTimeout(2000)
const H = await p.evaluate(() => document.documentElement.scrollHeight)
let i = 0
for (let y = 0; y < H; y += h - 60) {
  await p.evaluate((y) => scrollTo({ top: y, behavior: 'instant' }), y); await p.waitForTimeout(1300)
  await p.screenshot({ path: `${out}/v-${String(i++).padStart(2, '0')}.png` })
}
console.log(H, i, await p.evaluate(() => document.querySelectorAll('.reveal:not(.in)').length), errs)
await b.close()
