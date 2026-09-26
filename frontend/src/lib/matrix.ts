// Decode uint8 matrix row from the API and combine with weights client-side
export function decodeMatrix(raw: number[][]): Float32Array[] {
  return raw.map(row => new Float32Array(row.map(v => v / 255)))
}

export function combineMatrices(
  matrices: Record<string, Float32Array[]>,
  weights: Record<string, number>
): Float32Array[] {
  const names = Object.keys(weights)
  const total = names.reduce((s, k) => s + (weights[k] ?? 0), 0)
  if (total === 0) return matrices[names[0]] ?? []

  const n = matrices[names[0]]?.length ?? 0
  return Array.from({ length: n }, (_, i) => {
    const row = new Float32Array(n)
    for (const name of names) {
      const w = (weights[name] ?? 0) / total
      const srcRow = matrices[name]?.[i]
      if (srcRow) {
        for (let j = 0; j < n; j++) {
          row[j] += w * (srcRow[j] ?? 0)
        }
      }
    }
    return row
  })
}

// Single-hue sequential ramp: --bg-panel (#1e1e1e) → --accent (#8b72f0)
// Low similarity = dark panel color; high similarity = accent purple
const RAMP: [number, number, number][] = [
  [30,  30,  30],   // 0.0  --bg-panel
  [36,  33,  48],   // 0.1
  [44,  38,  68],   // 0.2
  [54,  45,  92],   // 0.3
  [65,  53, 116],   // 0.4
  [77,  62, 138],   // 0.5
  [90,  72, 156],   // 0.6
  [105, 84, 176],   // 0.7
  [120, 97, 196],   // 0.8
  [139,114, 240],   // 1.0  --accent
]

export function accentRampColor(t: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, t))
  const idx = clamped * (RAMP.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.min(lo + 1, RAMP.length - 1)
  const frac = idx - lo
  const loColor = RAMP[lo]!
  const hiColor = RAMP[hi]!
  return [
    Math.round(loColor[0] + frac * (hiColor[0] - loColor[0])),
    Math.round(loColor[1] + frac * (hiColor[1] - loColor[1])),
    Math.round(loColor[2] + frac * (hiColor[2] - loColor[2])),
  ]
}

/** @deprecated use accentRampColor */
export const viridisColor = accentRampColor
