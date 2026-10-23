import { describe, expect, it } from 'vitest'
import { deviceLang } from './i18n'

describe('deviceLang', () => {
  it('Türkçe cihaz dilinde Türkçe açılır', () => {
    expect(deviceLang(['tr-TR'], 'Europe/Berlin')).toBe('tr')
    expect(deviceLang(['en-US', 'tr'], 'America/New_York')).toBe('tr')
  })
  it('Türkiye veya Kıbrıs bölgesinde Türkçe açılır', () => {
    expect(deviceLang(['en-US'], 'Europe/Istanbul')).toBe('tr')
    expect(deviceLang(['en-TR'], 'UTC')).toBe('tr')
    expect(deviceLang(['en-GB'], 'Asia/Nicosia')).toBe('tr')
  })
  it('Türkçe konuşulmayan yerlerde İngilizce açılır', () => {
    expect(deviceLang(['en-US'], 'America/New_York')).toBe('en')
    expect(deviceLang(['de-DE'], 'Europe/Berlin')).toBe('en')
  })
})
