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

interface Tooltip {
  x: number
  y: number
  nameA: string
  nameB: string
  score: number
}

export function Heatmap({ compositeMatrix, order, participants, clusterIds, onCellClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<Tooltip | null>(null)
  const n = order.length

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container || compositeMatrix.length === 0 || n === 0) return
    const dpr = window.devicePixelRatio || 1
    const size = Math.min(container.offsetWidth, container.offsetHeight)
    if (size === 0) return
    canvas.style.width = `${size}px`
    canvas.style.height = `${size}px`
    canvas.width = size * dpr
    canvas.height = size * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)

    const cellSize = size / n
    const imageData = ctx.createImageData(size, size)
    const data = imageData.data

    for (let row = 0; row < n; row++) {
      const i = order[row]
      if (i === undefined) continue
      const matRow = compositeMatrix[i]
      if (!matRow) continue
      for (let col = 0; col < n; col++) {
        const j = order[col]
        if (j === undefined) continue
        const score = matRow[j] ?? 0
        const [r, g, b] = accentRampColor(score)
        const px = (row * size + col) * 4
        data[px] = r
        data[px + 1] = g
        data[px + 2] = b
        data[px + 3] = 255
      }
    }
    ctx.putImageData(imageData, 0, 0)

    // Cluster boundaries — 1px --border (#303030)
    ctx.strokeStyle = '#303030'
    ctx.lineWidth = 1
    let prevCluster = clusterIds[order[0] ?? 0]
    for (let row = 1; row < n; row++) {
      const orderIdx = order[row]
      if (orderIdx === undefined) continue
      const cluster = clusterIds[orderIdx]
      if (cluster !== prevCluster) {
        const pos = row * cellSize
        ctx.beginPath(); ctx.moveTo(pos, 0); ctx.lineTo(pos, size); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(0, pos); ctx.lineTo(size, pos); ctx.stroke()
        prevCluster = cluster
      }
    }
  }, [compositeMatrix, order, clusterIds, n])

  useEffect(() => {
    draw()
    const observer = new ResizeObserver(draw)
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [draw])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas || n === 0) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const cellSize = rect.width / n
    const col = Math.floor(x / cellSize)
    const row = Math.floor(y / cellSize)
    if (col < 0 || col >= n || row < 0 || row >= n) { setTooltip(null); return }
    const i = order[row]
    const j = order[col]
    if (i === undefined || j === undefined) { setTooltip(null); return }
    const score = compositeMatrix[i]?.[j] ?? 0
    setTooltip({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      nameA: participants[i]?.name ?? '',
      nameB: participants[j]?.name ?? '',
      score,
    })
  }, [compositeMatrix, order, participants, n])

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas || n === 0) return
    const rect = canvas.getBoundingClientRect()
    const cellSize = rect.width / n
    const col = Math.floor((e.clientX - rect.left) / cellSize)
    const row = Math.floor((e.clientY - rect.top) / cellSize)
    if (col >= 0 && col < n && row >= 0 && row < n && row !== col) {
      const i = order[row]
      const j = order[col]
      if (i !== undefined && j !== undefined) {
        onCellClick(i, j)
      }
    }
  }, [order, onCellClick, n])

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ cursor: 'crosshair', display: 'block' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
        onClick={handleClick}
      />
      {tooltip && (
        <div
          className="cn-tooltip"
          style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}
        >
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
