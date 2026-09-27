'use client'
import { useRef, useEffect, useState, useCallback } from 'react'
import type { LayoutData } from '@/lib/api'
import { Search } from 'lucide-react'

interface Props {
  layout: LayoutData
  selectedId?: string
  onSelect: (id: string) => void
}

const CLUSTER_COLORS = [
  '#7b6fc4', '#4e8dc4', '#4ea89c', '#7aab60',
  '#b09040', '#b06040', '#a05060', '#7060a0',
]

interface VP { zoom: number; panX: number; panY: number }

export function Constellation({ layout, selectedId, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const vpRef = useRef<VP>({ zoom: 1, panX: 0, panY: 0 })
  const [vp, setVpState] = useState<VP>({ zoom: 1, panX: 0, panY: 0 })
  const [search, setSearch] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const dragRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null)

  const setVp = useCallback((updater: (prev: VP) => VP) => {
    setVpState(prev => { const next = updater(prev); vpRef.current = next; return next })
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container || !layout.coords.length) return
    const dpr = window.devicePixelRatio || 1
    const w = container.offsetWidth, h = container.offsetHeight
    if (w === 0 || h === 0) return
    canvas.width = w * dpr; canvas.height = h * dpr
    canvas.style.width = `${w}px`; canvas.style.height = `${h}px`
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#161616'
    ctx.fillRect(0, 0, w, h)

    const { zoom, panX, panY } = vpRef.current
    const pad = 32

    // Transform: world coords [0,1] → screen pixels, with zoom/pan
    const toX = (x: number) => panX + (pad + x * (w - 2 * pad)) * zoom
    const toY = (y: number) => panY + (pad + y * (h - 2 * pad)) * zoom

    const searchMatch = search.trim().toLowerCase()
    const matchIdx = searchMatch
      ? layout.participants.findIndex(p => p.name.toLowerCase().includes(searchMatch))
      : -1

    // Draw connection lines for matched participant
    if (matchIdx >= 0) {
      const matchCoord = layout.coords[matchIdx]
      if (matchCoord) {
        const top10 = layout.participants
          .map((_, i) => i)
          .filter(i => i !== matchIdx)
          .sort((a, b) => (layout.bridge_scores[b] ?? 0) - (layout.bridge_scores[a] ?? 0))
          .slice(0, 10)
        const [mx, my] = matchCoord
        top10.forEach(idx => {
          const coord = layout.coords[idx]; if (!coord) return
          ctx.strokeStyle = 'rgba(139,114,240,0.2)'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(toX(mx), toY(my))
          ctx.lineTo(toX(coord[0]), toY(coord[1]))
          ctx.stroke()
        })
      }
    }

    // Draw dots
    layout.participants.forEach((p, idx) => {
      const coord = layout.coords[idx]; if (!coord) return
      const cluster = layout.cluster_ids[idx] ?? 0
      const bridge = layout.bridge_scores[idx] ?? 0
      const baseRadius = 2.5 + bridge * 6
      const radius = baseRadius * Math.max(1, zoom * 0.6)
      const isMatch = idx === matchIdx
      const isSelected = p.id === selectedId

      ctx.beginPath()
      ctx.arc(toX(coord[0]), toY(coord[1]), radius, 0, Math.PI * 2)
      ctx.fillStyle = (isMatch || isSelected) ? '#8b72f0' : (CLUSTER_COLORS[cluster % CLUSTER_COLORS.length] ?? '#7b6fc4')
      ctx.globalAlpha = (isMatch || isSelected) ? 1 : 0.65
      ctx.fill()
      ctx.globalAlpha = 1

      // Show name label at high zoom
      if ((zoom > 3 && isSelected) || (zoom > 5 && isMatch) || (zoom > 6)) {
        ctx.font = `${10 / zoom * 2}px Inter, system-ui`
        ctx.fillStyle = isMatch || isSelected ? '#dadada' : '#9a9a9a'
        ctx.textAlign = 'center'
        ctx.fillText(p.name.split(' ')[0] ?? '', toX(coord[0]), toY(coord[1]) - radius - 2)
      }
    })

    // Cluster centroid labels (drawn at fixed screen size, unaffected by zoom)
    const centroids: Record<number, [number, number, number]> = {}
    layout.participants.forEach((_, idx) => {
      const cluster = layout.cluster_ids[idx] ?? 0
      const coord = layout.coords[idx]; if (!coord) return
      if (!centroids[cluster]) centroids[cluster] = [0, 0, 0]
      const c = centroids[cluster]!
      c[0] += coord[0]; c[1] += coord[1]; c[2] += 1
    })
    ctx.font = '11px Inter, system-ui, sans-serif'
    ctx.textAlign = 'center'
    Object.entries(centroids).forEach(([cid, [sx, sy, count]]) => {
      ctx.fillStyle = '#9a9a9a'
      ctx.fillText(layout.cluster_labels[cid] ?? `Group ${parseInt(cid) + 1}`, toX(sx / count), toY(sy / count) - 12)
    })

    if (zoom > 1.05) {
      ctx.font = '11px monospace'
      ctx.textAlign = 'left'
      ctx.fillStyle = 'rgba(139,114,240,0.7)'
      ctx.fillText(`${zoom.toFixed(1)}×  drag to pan · dbl-click to reset`, 8, h - 8)
    }
  }, [layout, selectedId, search, vp]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    draw()
    const ro = new ResizeObserver(draw)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [draw])

  // Wheel zoom centered on cursor
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      setVp(prev => {
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
        const newZoom = Math.max(1, Math.min(20, prev.zoom * factor))
        const scale = newZoom / prev.zoom
        return { zoom: newZoom, panX: mx - (mx - prev.panX) * scale, panY: my - (my - prev.panY) * scale }
      })
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [setVp])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current; if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    dragRef.current = { sx: e.clientX - rect.left, sy: e.clientY - rect.top, px: vpRef.current.panX, py: vpRef.current.panY }
    setIsDragging(false)
  }, [])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current) return
    const canvas = canvasRef.current; if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left, y = e.clientY - rect.top
    const dx = x - dragRef.current.sx, dy = y - dragRef.current.sy
    if (Math.hypot(dx, dy) > 3) {
      setIsDragging(true)
      setVp(prev => ({ ...prev, panX: dragRef.current!.px + dx, panY: dragRef.current!.py + dy }))
    }
  }, [setVp])

  const onMouseUp = useCallback(() => { dragRef.current = null; setIsDragging(false) }, [])

  const onClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragRef.current) return
    const canvas = canvasRef.current; if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    const { zoom, panX, panY } = vpRef.current
    const w = rect.width, h = rect.height
    const pad = 32
    let closest = -1, minDist = 16
    layout.participants.forEach((_, idx) => {
      const coord = layout.coords[idx]; if (!coord) return
      const cx = panX + (pad + coord[0] * (w - 2 * pad)) * zoom
      const cy = panY + (pad + coord[1] * (h - 2 * pad)) * zoom
      const d = Math.hypot(mx - cx, my - cy)
      if (d < minDist) { minDist = d; closest = idx }
    })
    if (closest >= 0) { const p = layout.participants[closest]; if (p) onSelect(p.id) }
  }, [layout, onSelect])

  const onDblClick = useCallback(() => {
    setVp(() => ({ zoom: 1, panX: 0, panY: 0 }))
  }, [setVp])

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 10, display: 'flex', alignItems: 'center' }}>
        <div style={{ position: 'relative' }}>
          <input className="cn-input" style={{ width: 180, paddingLeft: 28, opacity: 0.9 }}
            placeholder="Search participant" value={search} onChange={e => setSearch(e.target.value)} />
          <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', pointerEvents: 'none' }} />
        </div>
      </div>
      <canvas ref={canvasRef}
        style={{ display: 'block', cursor: isDragging ? 'grabbing' : 'crosshair', width: '100%', height: '100%' }}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp} onClick={onClick} onDoubleClick={onDblClick}
      />
    </div>
  )
}
