'use client'
import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import type { LayoutData } from '@/lib/api'
import { renderSky, drawScene, clusterColor, type SkyScene } from '@/lib/sky'
import { intraClusterEdges, bridgeNetwork } from '@/lib/skyEdges'

interface Props {
  layout: LayoutData
  visible: boolean[]
  selectedIdx: number
  meIdx: number
  matchIdxs: number[]
  onSelect: (id: string) => void
}

interface VP { zoom: number; panX: number; panY: number }
const PAD = 48

export function Constellation({ layout, visible, selectedIdx, meIdx, matchIdxs, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const skyRef = useRef<{ key: string; canvas: HTMLCanvasElement } | null>(null)
  const [vp, setVp] = useState<VP>({ zoom: 1, panX: 0, panY: 0 })
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [dragging, setDragging] = useState(false)
  const [hover, setHover] = useState<{ idx: number; x: number; y: number } | null>(null)
  const dragRef = useRef<{ sx: number; sy: number; px: number; py: number; moved: boolean } | null>(null)

  const { coords, cluster_ids: clusterIds, bridge_scores: bridge } = layout
  const intra = useMemo(() => intraClusterEdges(coords, clusterIds), [coords, clusterIds])
  const bridges = useMemo(() => bridgeNetwork(coords, clusterIds, bridge), [coords, clusterIds, bridge])

  const project = useCallback((i: number): [number, number] => {
    const c = coords[i] ?? [0, 0]
    return [
      vp.panX + (PAD + c[0] * (size.w - 2 * PAD)) * vp.zoom,
      vp.panY + (PAD + c[1] * (size.h - 2 * PAD)) * vp.zoom,
    ]
  }, [coords, size, vp])

  useEffect(() => {
    const el = containerRef.current; if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.offsetWidth, h: el.offsetHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || size.w === 0 || size.h === 0) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = size.w * dpr; canvas.height = size.h * dpr
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const key = `${size.w}x${size.h}@${dpr}`
    if (skyRef.current?.key !== key) skyRef.current = { key, canvas: renderSky(size.w, size.h, dpr) }
    ctx.drawImage(skyRef.current.canvas, 0, 0, size.w, size.h)
    const scene: SkyScene = {
      coords, clusterIds, clusterLabels: layout.cluster_labels, bridge, visible,
      intraEdges: intra, bridgeEdges: bridges.edges, bridgeNodes: bridges.nodes,
      selected: selectedIdx, matches: matchIdxs, hover: hover?.idx ?? -1,
      selectedName: layout.participants[selectedIdx]?.name ?? '',
      meIdx, meName: layout.participants[meIdx]?.name ?? '',
    }
    drawScene(ctx, scene, project, vp.zoom)
  }, [size, vp, coords, clusterIds, bridge, visible, intra, bridges, selectedIdx, meIdx, matchIdxs, hover, layout, project])

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      setVp(prev => {
        const zoom = Math.max(1, Math.min(12, prev.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)))
        const k = zoom / prev.zoom
        return zoom === 1 ? { zoom, panX: 0, panY: 0 } : { zoom, panX: mx - (mx - prev.panX) * k, panY: my - (my - prev.panY) * k }
      })
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [])

  const nearest = useCallback((mx: number, my: number) => {
    let best = -1, bestD = 14
    coords.forEach((_, i) => {
      const [x, y] = project(i)
      const d = Math.hypot(mx - x, my - y)
      if (d < bestD) { bestD = d; best = i }
    })
    return best
  }, [coords, project])

  const local = (e: React.MouseEvent) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top] as const
  }

  const onMouseMove = (e: React.MouseEvent) => {
    const [x, y] = local(e)
    const d = dragRef.current
    if (d) {
      const dx = x - d.sx, dy = y - d.sy
      if (d.moved || Math.hypot(dx, dy) > 3) {
        if (!d.moved) setDragging(true)
        d.moved = true
        setVp(prev => ({ ...prev, panX: d.px + dx, panY: d.py + dy }))
        return
      }
    }
    const idx = nearest(x, y)
    setHover(idx >= 0 ? { idx, x, y } : null)
  }

  const onMouseUp = (e: React.MouseEvent) => {
    const d = dragRef.current
    dragRef.current = null
    setDragging(false)
    if (d && !d.moved) {
      const [x, y] = local(e)
      const idx = nearest(x, y)
      const p = layout.participants[idx]
      if (p) onSelect(p.id)
    }
  }

  const legend = useMemo(() => {
    const counts: Record<number, number> = {}
    clusterIds.forEach(c => { counts[c] = (counts[c] ?? 0) + 1 })
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [clusterIds])

  const hovered = hover ? layout.participants[hover.idx] : undefined

  return (
    <div ref={containerRef} className="sky-pane">
      <canvas ref={canvasRef} className="sky-canvas" style={{ width: size.w, height: size.h, cursor: dragging ? 'grabbing' : hover ? 'pointer' : 'default' }}
        onMouseDown={e => { const [x, y] = local(e); dragRef.current = { sx: x, sy: y, px: vp.panX, py: vp.panY, moved: false } }}
        onMouseMove={onMouseMove} onMouseUp={onMouseUp}
        onMouseLeave={() => { dragRef.current = null; setDragging(false); setHover(null) }}
        onDoubleClick={() => setVp({ zoom: 1, panX: 0, panY: 0 })}
      />
      {hover && hovered && (
        <div className="cn-tooltip" style={{ left: hover.x + 12, top: hover.y + 12 }}>
          <div style={{ color: 'var(--text)' }}>{hovered.name}</div>
          <div style={{ color: 'var(--text-muted)' }}>
            {hovered.school} · {layout.cluster_labels[String(clusterIds[hover.idx])] ?? ''}
          </div>
        </div>
      )}
      <div className="sky-legend">
        {legend.map(([c, n]) => (
          <span key={c} className="sky-legend-item">
            <span className="sky-legend-dot" style={{ background: clusterColor(Number(c)) }} />
            {layout.cluster_labels[c] ?? `Group ${Number(c) + 1}`} <span className="mono">{n}</span>
          </span>
        ))}
        <span className="sky-legend-note">dot size = bridge score</span>
      </div>
      {vp.zoom > 1.05 && <div className="sky-zoom mono">{vp.zoom.toFixed(1)}x · double-click to reset</div>}
    </div>
  )
}
