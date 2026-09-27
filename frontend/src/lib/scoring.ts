// Client-side pair scoring. All inputs are the decoded per-feature matrices
// (values in [0,1]) so weight and mode changes never need a round trip.

export type Mode = 'similar' | 'complementary' | 'serendipity'

export const FEATURES = [
  { key: 'gnn', label: 'Learned (GNN)' },
  { key: 'interests', label: 'Interests' },
  { key: 'dev_groups', label: 'Dev groups' },
  { key: 'university', label: 'School' },
  { key: 'network', label: 'Network' },
  { key: 'campus', label: 'Campus life' },
  { key: 'internships', label: 'Internships' },
  { key: 'grade', label: 'Grade level' },
] as const

export type FeatureKey = (typeof FEATURES)[number]['key']

export interface Filters {
  school: string
  year: string
  team: string
}

export const NO_FILTERS: Filters = { school: '', year: '', team: '' }

export interface PersonMeta {
  id: string
  school: string
  year: string
  teamId?: string
}

export function featureScores(decoded: Record<string, Float32Array[]>, i: number, j: number): Record<string, number> {
  const out: Record<string, number> = {}
  for (const { key } of FEATURES) out[key] = decoded[key]?.[i]?.[j] ?? 0
  return out
}

export function composite(parts: Record<string, number>, weights: Record<string, number>): number {
  const total = Object.values(weights).reduce((s, v) => s + v, 0) || 1
  let s = 0
  for (const [k, w] of Object.entries(weights)) s += (w / total) * (parts[k] ?? 0)
  return s
}

// Similar: weighted composite.
// Complementary: shared interests but different internship/industry background.
// Serendipity: similar overall, but no mutual friends and not already teammates.
export function modeScore(
  mode: Mode,
  parts: Record<string, number>,
  weights: Record<string, number>,
  sameTeam: boolean,
): number {
  const sim = composite(parts, weights)
  if (mode === 'complementary') return 0.6 * (parts.interests ?? 0) + 0.4 * (1 - (parts.internships ?? 0))
  if (mode === 'serendipity') return sameTeam ? 0 : sim * (1 - 0.8 * (parts.network ?? 0))
  return sim
}

export function passesFilters(p: PersonMeta | undefined, f: Filters): boolean {
  if (!p) return false
  if (f.school && p.school !== f.school) return false
  if (f.year && p.year !== f.year) return false
  if (f.team && p.teamId !== f.team) return false
  return true
}

export interface Match {
  idx: number
  score: number
  parts: Record<string, number>
}

export function topMatches(
  me: number,
  decoded: Record<string, Float32Array[]>,
  weights: Record<string, number>,
  mode: Mode,
  people: PersonMeta[],
  visible: boolean[],
  k: number,
): Match[] {
  const n = people.length
  const myTeam = people[me]?.teamId
  const out: Match[] = []
  for (let j = 0; j < n; j++) {
    if (j === me || !visible[j]) continue
    const parts = featureScores(decoded, me, j)
    const sameTeam = !!myTeam && people[j]?.teamId === myTeam
    out.push({ idx: j, score: modeScore(mode, parts, weights, sameTeam), parts })
  }
  out.sort((a, b) => b.score - a.score)
  return out.slice(0, k)
}

export function initials(name: string): string {
  return name.split(/\s+/).map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase()
}
