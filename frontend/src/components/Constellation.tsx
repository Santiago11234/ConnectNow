'use client'
import { useRef, useEffect, useState, useCallback } from 'react'
import type { LayoutData } from '@/lib/api'
import { Search } from 'lucide-react'

interface Props {
  layout: LayoutData
  selectedId?: string
  onSelect: (id: string) => void
}

// Muted categorical palette — max 8 hues, ~60% saturation on dark
const CLUSTER_COLORS = [
  '#7b6fc4', // muted purple (near accent but distinct)
  '#4e8dc4', // slate blue
  '#4ea89c', // teal
  '#7aab60', // muted green
  '#b09040', // muted amber
  '#b06040', // muted orange-brown
  '#a05060', // muted rose
  '#7060a0', // violet-slate
]

export function Constellation({ layout, selectedId, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState('')

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container || !layout.coords.length) return
    const dpr = window.devicePixelRatio || 1
    const w = container.offsetWidth
    const h = container.offsetHeight
    if (w === 0 || h === 0) return
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)

    // Background = --bg #161616
    ctx.fillStyle = '#161616'
    ctx.fillRect(0, 0, w, h)

    const pad = 32
    const toX = (x: number) => pad + x * (w - 2 * pad)
    const toY = (y: number) => pad + y * (h - 2 * pad)

    const searchMatch = search.trim().toLowerCase()
    const matchIdx = searchMatch
      ? layout.participants.findIndex(p => p.name.toLowerCase().includes(searchMatch))
      : -1

    // Edges for matched participant
    if (matchIdx >= 0) {
      const bridges = layout.bridge_scores
      const topConnections = layout.participants
        .map((_, idx) => idx)
        .filter(idx => idx !== matchIdx)
        .sort((a, b) => (bridges[b] ?? 0) - (bridges[a] ?? 0))
        .slice(0, 10)

      const matchCoord = layout.coords[matchIdx]
      if (matchCoord) {
        const [mx, my] = matchCoord
        topConnections.forEach(idx => {
          const coord = layout.coords[idx]
          if (!coord) return
          const [cx, cy] = coord
          ctx.strokeStyle = 'rgba(139,114,240,0.25)'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(toX(mx), toY(my))
          ctx.lineTo(toX(cx), toY(cy))
          ctx.stroke()
        })
      }
    }

    // Dots
    layout.participants.forEach((p, idx) => {
      const coord = layout.coords[idx]
      if (!coord) return
      const [x, y] = coord
      const cluster = layout.cluster_ids[idx] ?? 0
      const bridge = layout.bridge_scores[idx] ?? 0
      const radius = 2.5 + bridge * 6
      const isMatch = idx === matchIdx
      const isSelected = p.id === selectedId

      ctx.beginPath()
      ctx.arc(toX(x), toY(y), radius, 0, Math.PI * 2)

      if (isMatch || isSelected) {
        ctx.fillStyle = '#8b72f0'  // --accent
        ctx.globalAlpha = 1
      } else {
        ctx.fillStyle = CLUSTER_COLORS[cluster % CLUSTER_COLORS.length] ?? '#7b6fc4'
        ctx.globalAlpha = 0.65
      }
      ctx.fill()
      ctx.globalAlpha = 1
    })

    // Cluster labels — 12px --text-muted font
    const centroids: Record<number, [number, number, number]> = {}
    layout.participants.forEach((_, idx) => {
      const cluster = layout.cluster_ids[idx] ?? 0
      const coord = layout.coords[idx]
      if (!coord) return
      const [x, y] = coord
      if (!centroids[cluster]) centroids[cluster] = [0, 0, 0]
      const c = centroids[cluster]!
      c[0] += x; c[1] += y; c[2] += 1
    })

    ctx.font = '12px Inter, system-ui, sans-serif'
    ctx.textAlign = 'center'
    Object.entries(centroids).forEach(([cid, [sx, sy, count]]) => {
      const label = layout.cluster_labels[cid] ?? `Group ${parseInt(cid) + 1}`
      ctx.fillStyle = '#9a9a9a'  // --text-muted
      ctx.fillText(label, toX(sx / count), toY(sy / count) - 10)
    })
  }, [layout, selectedId, search])

  useEffect(() => {
    draw()
    const observer = new ResizeObserver(draw)
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [draw])

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const pad = 32
    const w = rect.width
    const h = rect.height
    let closest = -1
    let minDist = 16
    layout.participants.forEach((_, idx) => {
      const coord = layout.coords[idx]
      if (!coord) return
      const [x, y] = coord
      const cx = pad + x * (w - 2 * pad)
      const cy = pad + y * (h - 2 * pad)
      const d = Math.hypot(mx - cx, my - cy)
      if (d < minDist) { minDist = d; closest = idx }
    })
    if (closest >= 0) {
      const p = layout.participants[closest]
      if (p) onSelect(p.id)
    }
  }, [layout, onSelect])

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      {/* Search overlay */}
      <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 10, display: 'flex', alignItems: 'center', gap: 0 }}>
        <div style={{ position: 'relative' }}>
          <input
            className="cn-input"
            style={{ width: 180, paddingLeft: 28, opacity: 0.9 }}
            placeholder="Search participant"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', pointerEvents: 'none' }} />
        </div>
      </div>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', cursor: 'crosshair', width: '100%', height: '100%' }}
        onClick={handleClick}
      />
    </div>
  )
}
