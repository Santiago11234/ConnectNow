// Canvas drawing for the constellation view. The sky + glow treatment is
// deliberately confined to this canvas; all surrounding chrome stays flat.

export const CLUSTER_COLORS = [
  '#5ec8e5', '#e879a6', '#6ee7a0', '#f5c542', '#f59e5b',
  '#9d8cf5', '#7aa2f7', '#f87171', '#c4a7f5', '#94e2d5',
]

export const clusterColor = (c: number) => CLUSTER_COLORS[c % CLUSTER_COLORS.length] ?? '#9d8cf5'

const SKY = '#07080d'

// Deterministic PRNG so the starfield does not shimmer between redraws.
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function renderSky(w: number, h: number, dpr: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w * dpr; c.height = h * dpr
  const ctx = c.getContext('2d')!
  ctx.scale(dpr, dpr)
  ctx.fillStyle = SKY
  ctx.fillRect(0, 0, w, h)
  const rand = mulberry32(7)

  // Faint nebula haze
  for (let i = 0; i < 5; i++) {
    const x = rand() * w, y = rand() * h, r = (0.25 + rand() * 0.35) * Math.max(w, h)
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, `rgba(${90 + rand() * 40},${60 + rand() * 30},${150 + rand() * 50},0.07)`)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }

  // Background stars
  const count = Math.round((w * h) / 1800)
  for (let i = 0; i < count; i++) {
    const r = rand() < 0.94 ? 0.3 + rand() * 0.6 : 0.9 + rand() * 0.8
    ctx.globalAlpha = 0.15 + rand() * 0.6
    ctx.fillStyle = rand() < 0.2 ? '#cfe0ff' : '#ffffff'
    ctx.beginPath(); ctx.arc(rand() * w, rand() * h, r, 0, Math.PI * 2); ctx.fill()
  }

  // A handful of bright stars with a soft halo
  for (let i = 0; i < 8; i++) {
    const x = rand() * w, y = rand() * h
    const g = ctx.createRadialGradient(x, y, 0, x, y, 14)
    g.addColorStop(0, 'rgba(170,205,255,0.55)')
    g.addColorStop(1, 'rgba(170,205,255,0)')
    ctx.globalAlpha = 0.6 + rand() * 0.4
    ctx.fillStyle = g
    ctx.fillRect(x - 14, y - 14, 28, 28)
    ctx.fillStyle = '#ffffff'
    ctx.beginPath(); ctx.arc(x, y, 1.3, 0, Math.PI * 2); ctx.fill()
  }
  ctx.globalAlpha = 1
  return c
}

export interface SkyScene {
  coords: [number, number][]
  clusterIds: number[]
  clusterLabels: Record<string, string>
  bridge: number[]
  visible: boolean[]
  intraEdges: [number, number][]
  bridgeEdges: [number, number][]
  bridgeNodes: Set<number>
  selected: number
  matches: number[]
  hover: number
  selectedName: string
}

export type Project = (i: number) => [number, number]

export function drawScene(ctx: CanvasRenderingContext2D, s: SkyScene, project: Project, zoom: number) {
  const line = (a: number, b: number) => {
    const [ax, ay] = project(a), [bx, by] = project(b)
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke()
  }

  // Constellation lines within clusters
  ctx.lineWidth = 0.8
  for (const [a, b] of s.intraEdges) {
    if (!s.visible[a] || !s.visible[b]) continue
    ctx.strokeStyle = clusterColor(s.clusterIds[a] ?? 0)
    ctx.globalAlpha = 0.3
    line(a, b)
  }
  // Bridge network across clusters
  ctx.strokeStyle = '#a9c4ff'
  ctx.globalAlpha = 0.14
  for (const [a, b] of s.bridgeEdges) line(a, b)

  // Selected person's matches
  if (s.selected >= 0) {
    s.matches.forEach((m, rank) => {
      ctx.strokeStyle = '#b9a8ff'
      ctx.globalAlpha = rank < 3 ? 0.9 : 0.4
      ctx.lineWidth = rank < 3 ? 1.4 : 0.8
      ctx.setLineDash(rank < 3 ? [] : [3, 3])
      line(s.selected, m)
    })
    ctx.setLineDash([])
  }
  ctx.globalAlpha = 1

  // Nodes
  const matchSet = new Set(s.matches)
  const dim = s.selected >= 0
  s.coords.forEach((_, i) => {
    const [x, y] = project(i)
    const isBridge = s.bridgeNodes.has(i)
    const color = isBridge ? '#dbe7ff' : clusterColor(s.clusterIds[i] ?? 0)
    const r = (2.4 + (s.bridge[i] ?? 0) * 4) * Math.max(1, Math.sqrt(zoom))
    const focus = i === s.selected || matchSet.has(i) || i === s.hover
    ctx.globalAlpha = !s.visible[i] ? 0.08 : dim && !focus ? 0.6 : 1
    ctx.shadowColor = isBridge ? '#7aa2ff' : color
    ctx.shadowBlur = s.visible[i] ? (focus || isBridge ? 16 : 10) : 0
    ctx.fillStyle = color
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
  })
  ctx.shadowBlur = 0
  ctx.globalAlpha = 1

  drawClusterLabels(ctx, s, project)
  if (s.selected >= 0) drawSelection(ctx, s, project)
}

function drawClusterLabels(ctx: CanvasRenderingContext2D, s: SkyScene, project: Project) {
  const pts: Record<number, [number, number][]> = {}
  s.coords.forEach((_, i) => { (pts[s.clusterIds[i] ?? 0] ??= []).push(project(i)) })
  ctx.font = '500 11px Inter, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.letterSpacing = '0.14em'
  // Anchor each label just above the dense core of its cluster (15th percentile y),
  // then nudge labels upward until they stop overlapping.
  const placed: { x: number; y: number; w: number }[] = []
  const labels = Object.entries(pts)
    .filter(([, p]) => p.length >= 5)
    .map(([c, p]) => {
      const ys = p.map(q => q[1]).sort((a, b) => a - b)
      const xs = p.map(q => q[0]).sort((a, b) => a - b)
      const text = (s.clusterLabels[c] ?? `Group ${Number(c) + 1}`).toUpperCase()
      return { text, x: xs[Math.floor(xs.length / 2)] ?? 0, y: (ys[Math.floor(ys.length * 0.15)] ?? 0) - 16, w: ctx.measureText(text).width }
    })
    .sort((a, b) => a.y - b.y)
  for (const l of labels) {
    while (placed.some(p => Math.abs(p.x - l.x) < (p.w + l.w) / 2 + 8 && Math.abs(p.y - l.y) < 16)) l.y -= 16
    placed.push(l)
    ctx.fillStyle = 'rgba(225,228,240,0.7)'
    ctx.fillText(l.text, l.x, l.y)
  }
  ctx.letterSpacing = '0px'
}

function drawSelection(ctx: CanvasRenderingContext2D, s: SkyScene, project: Project) {
  const [x, y] = project(s.selected)
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'
  ctx.lineWidth = 1.2
  ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke()
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'
  ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.stroke()
  ctx.textAlign = 'center'
  ctx.font = '500 13px Inter, system-ui, sans-serif'
  const bw = Math.max(ctx.measureText(s.selectedName).width, 150) + 16
  ctx.fillStyle = 'rgba(22,22,22,0.88)'
  ctx.strokeStyle = '#303030'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.rect(x - bw / 2, y - 50, bw, 38); ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#ffffff'
  ctx.fillText(s.selectedName, x, y - 34)
  ctx.font = '11px Inter, system-ui, sans-serif'
  ctx.fillStyle = 'rgba(225,228,240,0.6)'
  ctx.fillText(`top ${Math.min(3, s.matches.length)} matches highlighted`, x, y - 20)
}
