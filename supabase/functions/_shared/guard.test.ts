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
