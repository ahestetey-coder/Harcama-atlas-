import { describe, expect, it } from 'vitest'
import { REPLY_CASES } from './eval-set'
import { steeringIssues } from './guard'

describe('yatırım yönlendirmesi denetimi', () => {
  for (const c of REPLY_CASES) {
    it(`${c.steering ? 'yakalar' : 'geçirir'}: ${c.text}`, () => {
      expect(steeringIssues(c.text).length > 0).toBe(c.steering)
    })
  }

  it('birden çok cümlede yalnız sorunlu cümleyi gösterir', () => {
    const issues = steeringIssues('Bütçeniz bu ay dengede. Kalan parayla ASELS alın.')
    expect(issues).toHaveLength(1)
    expect(issues[0].sentence).toContain('ASELS')
  })
})

describe('İngilizce yanıt denetimi', () => {
  const steering = [
    'You should buy gold before the end of the year.',
    'Bitcoin will rise sharply next month.',
    'Put 40% of your savings into stocks.',
    'The target price for this fund is 120 TL.',
    'Guaranteed returns with this crypto.',
  ]
  const clean = [
    'Your budget is balanced this month; you have ₺4,000 left.',
    "I can't recommend buying a specific stock; that's a job for a licensed adviser.",
    'An emergency fund usually covers three to six months of expenses.',
  ]
  for (const t of steering) it(`yakalar: ${t}`, () => expect(steeringIssues(t).length).toBeGreaterThan(0))
  for (const t of clean) it(`geçirir: ${t}`, () => expect(steeringIssues(t)).toHaveLength(0))
})
