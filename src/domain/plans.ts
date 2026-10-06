/**
 * Paketler: Ücretsiz, Plus, Plus+. Mevcut bütün özellikler ücretsizdir; Plus ve Plus+ yeni
 * özellikler ekler. Bir özelliğin hangi paketle açıldığı yalnızca burada tanımlanır.
 */
export type Plan = 'free' | 'plus' | 'plusplus'

export const PLAN_ORDER: Plan[] = ['free', 'plus', 'plusplus']

export const PLAN_LABEL: Record<Plan, string> = {
  free: 'Ücretsiz',
  plus: 'Plus',
  plusplus: 'Plus+',
}

export type Feature =
  | 'advancedBudget'
  | 'installments'
  | 'subscriptions'
  | 'goals'
  | 'reports'
  | 'assets'
  | 'advancedSplit'
  | 'journey'
  | 'scenarios'
  | 'aiCoach'
  | 'learning'

export const FEATURE_PLAN: Record<Feature, Plan> = {
  advancedBudget: 'plus',
  installments: 'plus',
  subscriptions: 'plus',
  goals: 'plus',
  reports: 'plus',
  assets: 'plus',
  advancedSplit: 'plus',
  journey: 'plusplus',
  scenarios: 'plusplus',
  aiCoach: 'plusplus',
  learning: 'plusplus',
}

/** Paket, istenen paketi kapsıyor mu (Plus+ ⊃ Plus ⊃ Ücretsiz)? */
export function planIncludes(plan: Plan, required: Plan): boolean {
  return PLAN_ORDER.indexOf(plan) >= PLAN_ORDER.indexOf(required)
}

export function hasFeature(plan: Plan, feature: Feature): boolean {
  return planIncludes(plan, FEATURE_PLAN[feature])
}

export function isPlan(v: unknown): v is Plan {
  return v === 'free' || v === 'plus' || v === 'plusplus'
}
