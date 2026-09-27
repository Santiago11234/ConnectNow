// Ego view: you at the centre, your matches grouped by WHY they matched you.
//
// The constellation groups everyone by overall similarity, which in practice
// means it groups by school. This view answers a different question - for one
// person, what is the actual reason each match surfaced? Every match is filed
// under the single signal that contributed most to its score, so the position
// of a dot on screen IS the explanation.

import type { Participant } from './api'
import type { Match } from './scoring'

export interface Reason {
  key: string
  label: string
  /** Shown on the rim. Kept short - this is a label, not a sentence. */
  short: string
}

// `gnn` is deliberately absent: a learned embedding is not a human-readable
// reason. Matches it drives land in UNEXPLAINED instead, which is the more
// interesting story anyway - the model paired you with someone who shares no
// obvious attribute.
export const REASONS: Reason[] = [
  { key: 'university', label: 'Same school', short: 'School' },
  { key: 'dev_groups', label: 'Shared dev group', short: 'Dev groups' },
  { key: 'interests', label: 'Shared interests', short: 'Interests' },
  { key: 'campus', label: 'Campus life', short: 'Campus life' },
  { key: 'internships', label: 'Internship overlap', short: 'Internships' },
  { key: 'network', label: 'Mutual friends', short: 'Network' },
  { key: 'grade', label: 'Same year', short: 'Year' },
]

export const UNEXPLAINED: Reason = {
  key: 'unexplained',
  label: 'No shared attribute - the model still rates this a strong match',
  short: 'Hidden affinity',
}

export const ALL_REASONS = [...REASONS, UNEXPLAINED]

/** A match must own at least this share of the explainable score before we
 *  claim it as the reason. Below it, nothing really explains the pairing. */
const DOMINANCE_FLOOR = 0.28

/**
 * Per-signal mean and spread across everyone this person could match with.
 *
 * Needed because the raw signals are on wildly different scales. Interest
 * cosine sits around 0.6 for almost every pair, while dev_groups is 0 for the
 * ~88% of pairs sharing no club. Ranking by raw weighted value therefore hands
 * nearly every match to `interests` and the view collapses to two sectors.
 * Comparing each value to that signal's own distribution asks the right
 * question instead: is this pair unusual FOR THIS SIGNAL?
 */
export interface RowStats { mean: Record<string, number>; sd: Record<string, number> }

export function rowStats(
  decoded: Record<string, Float32Array[]>,
  meIdx: number,
  visible: boolean[],
): RowStats {
  const mean: Record<string, number> = {}
  const sd: Record<string, number> = {}
  for (const { key } of REASONS) {
    const row = decoded[key]?.[meIdx]
    if (!row) { mean[key] = 0; sd[key] = 1; continue }
    let n = 0, sum = 0, sumSq = 0
    for (let j = 0; j < row.length; j++) {
      if (j === meIdx || !visible[j]) continue
      const v = row[j] ?? 0
      n++; sum += v; sumSq += v * v
    }
    const m = n ? sum / n : 0
    mean[key] = m
    sd[key] = Math.max(Math.sqrt(Math.max(sumSq / Math.max(n, 1) - m * m, 0)), 1e-3)
  }
  return { mean, sd }
}

export interface EgoNode {
  idx: number
  person: Participant
  score: number
  reason: Reason
  /** Concrete evidence for the reason, e.g. "Robotics Club". Never invented -
   *  every entry is an actual intersection of the two profiles. */
  evidence: string[]
  x: number
  y: number
  r: number
}

export interface EgoSector {
  reason: Reason
  count: number
  /** Mid-angle in radians, for drawing the rim label. */
  angle: number
  a0: number
  a1: number
}

export interface EgoLayout {
  nodes: EgoNode[]
  sectors: EgoSector[]
}

function shared(a: string[] | undefined, b: string[] | undefined): string[] {
  if (!a?.length || !b?.length) return []
  const setB = new Set(b)
  return a.filter(v => setB.has(v))
}

/** Concrete, checkable evidence for why this pair landed in this sector. */
export function evidenceFor(key: string, me: Participant, other: Participant): string[] {
  switch (key) {
    case 'university': {
      const out: string[] = []
      if (me.school === other.school) out.push(me.school)
      if (me.major === other.major) out.push(me.major)
      return out
    }
    case 'dev_groups':
      return shared(me.dev_groups, other.dev_groups).map(g =>
        me.school === other.school ? `${g} · ${me.school}` : `${g} (different schools)`,
      )
    case 'interests':
      return shared(me.interest_tags, other.interest_tags).slice(0, 3)
    case 'campus':
      return [...shared(me.hackathons, other.hackathons), ...shared(me.involvement, other.involvement)].slice(0, 3)
    case 'internships': {
      const companies = shared(
        me.internships?.map(i => i.company),
        other.internships?.map(i => i.company),
      )
      const industries = shared(
        me.internships?.map(i => i.industry ?? '').filter(Boolean),
        other.internships?.map(i => i.industry ?? '').filter(Boolean),
      )
      return [...new Set([...companies, ...industries])].slice(0, 3)
    }
    case 'network': {
      const n = shared(me.friends, other.friends).length
      return n ? [`${n} mutual connection${n > 1 ? 's' : ''}`] : []
    }
    case 'grade':
      return me.year === other.year ? [me.year] : []
    default:
      return []
  }
}

/** Which signal actually drove this match? Scored by how far above its own
 *  baseline each signal sits, weighted, explicit signals only, and it must
 *  clear DOMINANCE_FLOOR to count. */
export function reasonFor(
  parts: Record<string, number>,
  weights: Record<string, number>,
  me: Participant,
  other: Participant,
  stats?: RowStats,
): { reason: Reason; evidence: string[] } {
  let best: Reason | null = null
  let bestContribution = 0
  let explainable = 0

  for (const reason of REASONS) {
    const value = parts[reason.key] ?? 0
    // Only positive deviations count - being averagely similar on a signal is
    // not a reason for anything.
    const lift = stats
      ? Math.max(0, (value - (stats.mean[reason.key] ?? 0)) / (stats.sd[reason.key] ?? 1))
      : value
    const contribution = (weights[reason.key] ?? 0) * lift
    explainable += contribution
    if (contribution > bestContribution) {
      bestContribution = contribution
      best = reason
    }
  }

  if (best && explainable > 0 && bestContribution / explainable >= DOMINANCE_FLOOR) {
    const evidence = evidenceFor(best.key, me, other)
    // Guard against claiming a reason we cannot actually point at: a high
    // `interests` cosine with zero overlapping tags explains nothing concrete.
    if (evidence.length) return { reason: best, evidence }
  }
  return { reason: UNEXPLAINED, evidence: [] }
}

const TAU = Math.PI * 2

/**
 * Radial layout. Sector = reason, so angle encodes WHY. Radius encodes how
 * strong the match is, with the best matches nearest the centre.
 */
export function buildEgoLayout(
  matches: Match[],
  people: Participant[],
  weights: Record<string, number>,
  meIdx: number,
  rInner: number,
  rOuter: number,
  stats?: RowStats,
): EgoLayout {
  const me = people[meIdx]
  if (!me) return { nodes: [], sectors: [] }

  const classified = matches
    .map(m => {
      const other = people[m.idx]
      if (!other) return null
      const { reason, evidence } = reasonFor(m.parts, weights, me, other, stats)
      return { m, other, reason, evidence }
    })
    .filter((v): v is NonNullable<typeof v> => v !== null)

  const byReason = new Map<string, typeof classified>()
  for (const c of classified) {
    const list = byReason.get(c.reason.key)
    if (list) list.push(c)
    else byReason.set(c.reason.key, [c])
  }

  // Only non-empty sectors get screen space, sized by how many matches they hold.
  const active = ALL_REASONS.filter(r => byReason.has(r.key))
  const total = classified.length || 1
  const GAP = 0.06

  // Rank, not raw score: the top-N scores sit in a narrow band, so scaling by
  // value alone parks every dot on the same ring.
  const rankOf = new Map<number, number>()
  classified
    .slice()
    .sort((a, b) => b.m.score - a.m.score)
    .forEach((c, i) => rankOf.set(c.m.idx, i))
  const maxRank = Math.max(classified.length - 1, 1)

  const nodes: EgoNode[] = []
  const sectors: EgoSector[] = []
  let cursor = -Math.PI / 2 // start at 12 o'clock

  for (const reason of active) {
    const members = (byReason.get(reason.key) ?? []).slice().sort((a, b) => b.m.score - a.m.score)
    const width = (members.length / total) * TAU
    const a0 = cursor + GAP / 2
    const a1 = cursor + width - GAP / 2
    sectors.push({ reason, count: members.length, angle: (a0 + a1) / 2, a0, a1 })

    members.forEach((c, i) => {
      // Spread evenly across the wedge; a single member sits mid-wedge.
      const t = members.length === 1 ? 0.5 : i / (members.length - 1)
      const angle = a0 + t * Math.max(a1 - a0, 0)
      // Strong match -> small radius -> drawn near the centre.
      const strength = 1 - (rankOf.get(c.m.idx) ?? maxRank) / maxRank
      const radius = rOuter - strength * (rOuter - rInner)
      nodes.push({
        idx: c.m.idx,
        person: c.other,
        score: c.m.score,
        reason: c.reason,
        evidence: c.evidence,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        r: 4 + strength * 4,
      })
    })
    cursor += width
  }

  return { nodes, sectors }
}
