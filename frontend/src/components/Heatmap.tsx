'use client'
import { useRef, useEffect, useCallback, useState } from 'react'
import { accentRampColor } from '@/lib/matrix'

interface Props {
  compositeMatrix: Float32Array[]
  order: number[]
  participants: { id: string; name: string }[]
  clusterIds: number[]
  clusterLabels: Record<string, string>
  onCellClick: (idxA: number, idxB: number) => void
}

interface VP { zoom: number; panX: number; panY: number }
type Tooltip = { x: number; y: number; nameA: string; nameB: string; score: number }

export function Heatmap({ compositeMatrix, order, participants, clusterIds, onCellClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const offscreenRef = useRef<HTMLCanvasElement | null>(null)
  const vpRef = useRef<VP>({ zoom: 1, panX: 0, panY: 0 })
  const [vp, setVpState] = useState<VP>({ zoom: 1, panX: 0, panY: 0 })
  const [tooltip, setTooltip] = useState<Tooltip | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null)
  const n = order.length

  const setVp = useCallback((updater: (prev: VP) => VP) => {
    setVpState(prev => {
      const next = updater(prev)
      vpRef.current = next
      return next
    })
  }, [])

  // Pre-render the reordered NxN heat map to an offscreen canvas (1px per cell).
  // Only recomputes when matrix data changes, not on pan/zoom.
  useEffect(() => {
    if (compositeMatrix.length === 0 || n === 0) return
    const off = document.createElement('canvas')
    off.width = n; off.height = n
    const ctx = off.getContext('2d')!
    const img = ctx.createImageData(n, n)
    const d = img.data
    for (let row = 0; row < n; row++) {
      const i = order[row]; if (i === undefined) continue
      const matRow = compositeMatrix[i]; if (!matRow) continue
      for (let col = 0; col < n; col++) {
        const j = order[col]; if (j === undefined) continue
        const [r, g, b] = accentRampColor(matRow[j] ?? 0)
        const px = (row * n + col) * 4
        d[px] = r; d[px + 1] = g; d[px + 2] = b; d[px + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
    offscreenRef.current = off
    // Center at zoom=1
    const c = containerRef.current
    if (c) {
      const size = Math.min(c.offsetWidth, c.offsetHeight)
      const next = { zoom: 1, panX: (c.offsetWidth - size) / 2, panY: (c.offsetHeight - size) / 2 }
      vpRef.current = next
      setVpState(next)
    }
  }, [compositeMatrix, order, n])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    const off = offscreenRef.current
    if (!canvas || !container || !off) return
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
    const displaySize = Math.min(w, h) * zoom
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(off, panX, panY, displaySize, displaySize)

    // Cluster boundary lines in screen space
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx.lineWidth = 1
    const cellPx = displaySize / n
    let prev = clusterIds[order[0] ?? 0]
    for (let row = 1; row < n; row++) {
      const idx = order[row]; if (idx === undefined) continue
      const c = clusterIds[idx]
      if (c !== prev) {
        const p = row * cellPx
        ctx.beginPath(); ctx.moveTo(panX, panY + p); ctx.lineTo(panX + displaySize, panY + p); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(panX + p, panY); ctx.lineTo(panX + p, panY + displaySize); ctx.stroke()
        prev = c
      }
    }

    if (zoom > 1.05) {
      ctx.font = '11px monospace'
      ctx.fillStyle = 'rgba(139,114,240,0.7)'
      ctx.fillText(`${zoom.toFixed(1)}×  drag to pan · dbl-click to reset`, 8, h - 8)
    } else {
      ctx.font = '11px monospace'
      ctx.fillStyle = 'rgba(154,154,154,0.5)'
      ctx.fillText('scroll to zoom · click cell for details', 8, h - 8)
    }
  }, [clusterIds, order, n])

  useEffect(() => {
    draw()
    const ro = new ResizeObserver(draw)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [draw])

  useEffect(() => { draw() }, [vp, draw])

  const cellAt = useCallback((sx: number, sy: number) => {
    const c = containerRef.current; if (!c) return null
    const { zoom, panX, panY } = vpRef.current
    const displaySize = Math.min(c.offsetWidth, c.offsetHeight) * zoom
    const col = Math.floor(((sx - panX) / displaySize) * n)
    const row = Math.floor(((sy - panY) / displaySize) * n)
    return (col >= 0 && col < n && row >= 0 && row < n) ? { row, col } : null
  }, [n])

  // Wheel zoom centered on cursor
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      setVp(prev => {
        const c = containerRef.current; if (!c) return prev
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
        const newZoom = Math.max(1, Math.min(24, prev.zoom * factor))
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

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current; if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left, y = e.clientY - rect.top
    if (dragRef.current) {
      const dx = x - dragRef.current.sx, dy = y - dragRef.current.sy
      if (Math.hypot(dx, dy) > 3) {
        setIsDragging(true)
        setVp(prev => ({ ...prev, panX: dragRef.current!.px + dx, panY: dragRef.current!.py + dy }))
        setTooltip(null); return
      }
    }
    const cell = cellAt(x, y)
    if (!cell) { setTooltip(null); return }
    const i = order[cell.row], j = order[cell.col]
    if (i === undefined || j === undefined) { setTooltip(null); return }
    setTooltip({ x, y, nameA: participants[i]?.name ?? '', nameB: participants[j]?.name ?? '', score: compositeMatrix[i]?.[j] ?? 0 })
  }, [cellAt, order, participants, compositeMatrix, setVp])

  const onMouseUp = useCallback(() => { dragRef.current = null; setIsDragging(false) }, [])

  const onClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragRef.current) return
    const canvas = canvasRef.current; if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const cell = cellAt(e.clientX - rect.left, e.clientY - rect.top)
    if (!cell || cell.row === cell.col) return
    const i = order[cell.row], j = order[cell.col]
    if (i !== undefined && j !== undefined) onCellClick(i, j)
  }, [cellAt, order, onCellClick])

  const onDblClick = useCallback(() => {
    const c = containerRef.current; if (!c) return
    const size = Math.min(c.offsetWidth, c.offsetHeight)
    setVp(() => ({ zoom: 1, panX: (c.offsetWidth - size) / 2, panY: (c.offsetHeight - size) / 2 }))
  }, [setVp])

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <canvas ref={canvasRef}
        style={{ display: 'block', cursor: isDragging ? 'grabbing' : 'crosshair' }}
        onMouseMove={onMouseMove} onMouseLeave={() => { setTooltip(null); dragRef.current = null }}
        onMouseDown={onMouseDown} onMouseUp={onMouseUp} onClick={onClick} onDoubleClick={onDblClick}
      />
      {tooltip && (
        <div className="cn-tooltip" style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}>
          <span>{tooltip.nameA}</span>
          <span style={{ color: 'var(--text-faint)', margin: '0 4px' }}>&times;</span>
          <span>{tooltip.nameB}</span>
          <span style={{ marginLeft: 8, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
            {(tooltip.score * 100).toFixed(0)}
          </span>
        </div>
      )}
    </div>
  )
}
