import { normalizeText, tokenize } from './normalize'
import type { Rule, RuleMatchMode } from './types'

export const MIN_PREFIX_LEN = 4
export const MIN_CONTAINS_LEN = 5

export interface RuleMatch {
  rule: Rule
  /** Eşleşen normalize ifade. */
  matched: string
  /** Özgüllük: daha uzun ifade daha özgüldür. */
  specificity: number
}

export interface RuleEvaluation {
  winner: RuleMatch | null
  matches: RuleMatch[]
  /** Farklı kategorilere işaret eden eşleşmeler varsa true. */
  conflict: boolean
}

export function validateRulePattern(pattern: string, mode: RuleMatchMode): string | null {
  const n = normalizeText(pattern)
  if (!n) return 'Eşleşme ifadesi boş olamaz.'
  const compact = n.replace(/ /g, '')
  if (mode === 'prefix' && compact.length < MIN_PREFIX_LEN) return `"Kelime başı" eşleşmesi için en az ${MIN_PREFIX_LEN} harf gerekir.`
  if (mode === 'contains' && compact.length < MIN_CONTAINS_LEN)
    return `"İçinde geçer" eşleşmesi için en az ${MIN_CONTAINS_LEN} harf gerekir; kısa ifadeler başka iş yeri adlarının içinde yanlış eşleşebilir.`
  return null
}

/**
 * Bir kuralın normalize açıklamayla eşleşip eşleşmediğini denetler.
 * - word: ifade, açıklamada ardışık tam kelimeler olarak geçmeli ("BIM" → "BIM A S" evet, "BIMEKS" hayır).
 * - prefix: son kelime, açıklamadaki bir kelimenin başı olabilir ("MIGROS" → "MIGROSJET").
 * - contains: ifade boşluksuz olarak herhangi bir yerde geçebilir (yalnızca uzun ifadeler).
 */
export function ruleMatches(rule: Pick<Rule, 'pattern' | 'matchMode'>, normalizedDescription: string): string | null {
  const pattern = normalizeText(rule.pattern)
  if (!pattern || !normalizedDescription) return null
  if (validateRulePattern(rule.pattern, rule.matchMode)) return null
  const pTokens = tokenize(pattern)
  const dTokens = tokenize(normalizedDescription)
  if (rule.matchMode === 'contains') {
    return normalizedDescription.replace(/ /g, '').includes(pattern.replace(/ /g, '')) ? pattern : null
  }
  for (let i = 0; i + pTokens.length <= dTokens.length; i++) {
    let ok = true
    for (let j = 0; j < pTokens.length; j++) {
      const d = dTokens[i + j]
      const p = pTokens[j]
      const last = j === pTokens.length - 1
      if (d === p) continue
      if (rule.matchMode === 'prefix' && last && d.startsWith(p)) continue
      ok = false
      break
    }
    if (ok) return pattern
  }
  return null
}

/**
 * Kuralları öncelik sırasıyla değerlendirir.
 * Sıra: öncelik (büyük önce) → özgüllük (uzun ifade önce) → eski kural önce.
 */
export function evaluateRules(rules: Rule[], normalizedDescription: string): RuleEvaluation {
  const matches: RuleMatch[] = []
  for (const rule of rules) {
    if (!rule.enabled) continue
    const matched = ruleMatches(rule, normalizedDescription)
    if (matched) matches.push({ rule, matched, specificity: matched.replace(/ /g, '').length })
  }
  matches.sort(compareMatches)
  const winner = matches[0] ?? null
  const conflict = !!winner && matches.some((m) => m.rule.categoryId !== winner.rule.categoryId)
  return { winner, matches, conflict }
}

export function compareMatches(a: RuleMatch, b: RuleMatch): number {
  if (b.rule.priority !== a.rule.priority) return b.rule.priority - a.rule.priority
  if (b.specificity !== a.specificity) return b.specificity - a.specificity
  return a.rule.createdAt.localeCompare(b.rule.createdAt)
}

export interface RuleConflict {
  a: Rule
  b: Rule
  reason: string
}

/**
 * Kurallar arasındaki olası çakışmaları bulur: aynı/kapsayan ifadeler farklı kategorilere gidiyorsa.
 */
export function findRuleConflicts(rules: Rule[]): RuleConflict[] {
  const out: RuleConflict[] = []
  const active = rules.filter((r) => r.enabled)
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i]
      const b = active[j]
      if (a.categoryId === b.categoryId) continue
      const na = normalizeText(a.pattern)
      const nb = normalizeText(b.pattern)
      if (!na || !nb) continue
      if (na === nb) {
        out.push({ a, b, reason: 'Aynı ifade iki farklı kategoriye yönlendiriyor.' })
      } else if (ruleMatches(a, nb)) {
        out.push({ a, b, reason: `"${b.pattern}" içeren açıklamalar "${a.pattern}" kuralıyla da eşleşir.` })
      } else if (ruleMatches(b, na)) {
        out.push({ a: b, b: a, reason: `"${a.pattern}" içeren açıklamalar "${b.pattern}" kuralıyla da eşleşir.` })
      }
    }
  }
  return out
}

export const PRIORITY = {
  default: 50,
  user: 70,
  learned: 90,
} as const
