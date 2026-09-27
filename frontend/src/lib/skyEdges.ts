// Decorative-but-honest edges for the constellation: every line is either a
// nearest neighbour inside a cluster or a link between top bridge people.

const d2 = (a: [number, number], b: [number, number]) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2

export function intraClusterEdges(coords: [number, number][], clusterIds: number[]): [number, number][] {
  const edges: [number, number][] = []
  const seen = new Set<string>()
  coords.forEach((ci, i) => {
    let best = -1, bestD = Infinity
    coords.forEach((cj, j) => {
      if (i === j || clusterIds[i] !== clusterIds[j]) return
      const d = d2(ci, cj)
      if (d < bestD) { bestD = d; best = j }
    })
    if (best < 0) return
    const key = i < best ? `${i}-${best}` : `${best}-${i}`
    if (!seen.has(key)) { seen.add(key); edges.push([i, best]) }
  })
  return edges
}

export function bridgeNetwork(
  coords: [number, number][],
  clusterIds: number[],
  bridge: number[],
  k = 14,
): { nodes: Set<number>; edges: [number, number][] } {
  const top = bridge.map((b, i) => [b, i] as const).sort((a, b) => b[0] - a[0]).slice(0, k).map(([, i]) => i)
  const edges: [number, number][] = []
  const seen = new Set<string>()
  for (const i of top) {
    const ci = coords[i]; if (!ci) continue
    const nearest = top
      .filter(j => j !== i && clusterIds[j] !== clusterIds[i])
      .map(j => [d2(ci, coords[j] ?? ci), j] as const)
      .sort((a, b) => a[0] - b[0])
      .slice(0, 2)
    for (const [, j] of nearest) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`
      if (!seen.has(key)) { seen.add(key); edges.push([i, j]) }
    }
  }
  return { nodes: new Set(top), edges }
}
