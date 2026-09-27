'use client'
import { useRef, useEffect, useState, useMemo, useCallback } from 'react'
import type { Participant } from '@/lib/api'
import type { Match } from '@/lib/scoring'
import { buildEgoLayout, rowStats, type EgoNode } from '@/lib/ego'
import { renderSky } from '@/lib/sky'

interface Props {
  meIdx: number
  people: Participant[]
  matches: Match[]
  weights: Record<string, number>
  activeIdx: number
  visible: boolean[]
  decoded: Record<string, Float32Array[]>
  sentIds: Set<string>
  onSelect: (idx: number) => void
  onHover: (idx: number) => void
}

// Same starfield treatment as the constellation so the two views read as one
// system. Nodes are white here rather than cluster-coloured: on this screen
// the meaning is carried by WHICH SECTOR a dot sits in, so colouring by
// cluster as well would be a second, competing encoding.
const NODE = '#ffffff'
const RIM = 'rgba(225,228,240,0.7)'
const HAIR = 'rgba(225,228,240,0.16)'

export function EgoView({ meIdx, people, matches, weights, activeIdx, visible, decoded, sentIds, onSelect, onHover }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [hover, setHover] = useState<{ node: EgoNode; x: number; y: number } | null>(null)
  const skyRef = useRef<{ key: string; canvas: HTMLCanvasElement } | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.offsetWidth, h: el.offsetHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const rOuter = Math.max(60, Math.min(size.w, size.h) / 2 - 96)
  const rInner = Math.max(40, rOuter * 0.28)

  const stats = useMemo(() => rowStats(decoded, meIdx, visible), [decoded, meIdx, visible])

  const layout = useMemo(
    () => buildEgoLayout(matches, people, weights, meIdx, rInner, rOuter, stats),
    [matches, people, weights, meIdx, rInner, rOuter, stats],
  )

  const hitTest = useCallback(
    (mx: number, my: number): EgoNode | null => {
      const cx = size.w / 2
      const cy = size.h / 2
      for (const n of layout.nodes) {
        const dx = mx - (cx + n.x)
        const dy = my - (cy + n.y)
        if (dx * dx + dy * dy <= (n.r + 5) * (n.r + 5)) return n
      }
      return null
    },
    [layout, size],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !size.w || !size.h) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = size.w * dpr
    canvas.height = size.h * dpr
    canvas.style.width = `${size.w}px`
    canvas.style.height = `${size.h}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // Starfield backdrop, cached so it does not shimmer between redraws.
    const key = `${size.w}x${size.h}x${dpr}`
    if (skyRef.current?.key !== key) {
      skyRef.current = { key, canvas: renderSky(size.w, size.h, dpr) }
    }
    ctx.drawImage(skyRef.current.canvas, 0, 0, size.w, size.h)

    const cx = size.w / 2
    const cy = size.h / 2
    const me = people[meIdx]
    if (!me) return

    // Range rings - nearer the centre is a stronger match.
    ctx.strokeStyle = HAIR
    ctx.lineWidth = 1
    for (const t of [0.34, 0.67, 1]) {
      ctx.beginPath()
      ctx.arc(cx, cy, rInner + (rOuter - rInner) * t, 0, Math.PI * 2)
      ctx.stroke()
    }

    // Sector dividers + rim labels
    for (const sec of layout.sectors) {
      for (const a of [sec.a0, sec.a1]) {
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(a) * (rInner - 8), cy + Math.sin(a) * (rInner - 8))
        ctx.lineTo(cx + Math.cos(a) * (rOuter + 18), cy + Math.sin(a) * (rOuter + 18))
        ctx.strokeStyle = HAIR
        ctx.stroke()
      }
      const rawX = cx + Math.cos(sec.angle) * (rOuter + 36)
      const ly = cy + Math.sin(sec.angle) * (rOuter + 36)
      ctx.textAlign = Math.cos(sec.angle) > 0.2 ? 'left' : Math.cos(sec.angle) < -0.2 ? 'right' : 'center'
      // Keep the label inside the canvas - a rim label clipped by the pane
      // edge reads as a rendering bug.
      ctx.font = '500 11px Inter, system-ui, sans-serif'
      ctx.letterSpacing = '0.14em'
      const halfW = ctx.measureText(sec.reason.short.toUpperCase()).width
      const minX = ctx.textAlign === 'right' ? halfW + 10 : ctx.textAlign === 'center' ? halfW / 2 + 10 : 10
      const maxX = ctx.textAlign === 'left' ? size.w - halfW - 10 : ctx.textAlign === 'center' ? size.w - halfW / 2 - 10 : size.w - 10
      const lx = Math.min(Math.max(rawX, minX), Math.max(minX, maxX))
      ctx.textBaseline = 'middle'
      ctx.font = '500 11px Inter, system-ui, sans-serif'
      ctx.letterSpacing = '0.14em'
      ctx.fillStyle = RIM
      ctx.fillText(sec.reason.short.toUpperCase(), lx, ly)
      ctx.letterSpacing = '0px'
      ctx.font = '11px ui-monospace, Menlo, monospace'
      ctx.fillStyle = 'rgba(225,228,240,0.45)'
      ctx.fillText(String(sec.count), lx, ly + 14)
    }

    // Spokes from centre to each match
    for (const n of layout.nodes) {
      const focus = n.idx === activeIdx
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + n.x, cy + n.y)
      ctx.strokeStyle = focus ? 'rgba(255,255,255,0.85)' : 'rgba(225,228,240,0.18)'
      ctx.lineWidth = focus ? 1.4 : 0.8
      ctx.setLineDash(focus ? [] : [3, 3])
      ctx.stroke()
    }
    ctx.setLineDash([])

    // Match nodes - all white, sized by match strength
    for (const n of layout.nodes) {
      const focus = n.idx === activeIdx
      ctx.shadowColor = '#aac6ff'
      ctx.shadowBlur = focus ? 18 : 10
      ctx.fillStyle = NODE
      ctx.globalAlpha = focus ? 1 : 0.85
      ctx.beginPath()
      ctx.arc(cx + n.x, cy + n.y, n.r, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
      if (focus) {
        ctx.globalAlpha = 1
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.arc(cx + n.x, cy + n.y, n.r + 5, 0, Math.PI * 2)
        ctx.stroke()
      }
      // Already reached out to - accent ring, the one place accent is used
      // on this canvas so it reads as "you did something here".
      if (sentIds.has(n.person.id)) {
        ctx.globalAlpha = 1
        ctx.strokeStyle = '#8b72f0'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(cx + n.x, cy + n.y, n.r + 5, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
    ctx.globalAlpha = 1
    ctx.shadowBlur = 0

    // Centre node - you
    ctx.shadowColor = '#ffffff'
    ctx.shadowBlur = 24
    ctx.fillStyle = NODE
    ctx.beginPath()
    ctx.arc(cx, cy, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(cx, cy, 15, 0, Math.PI * 2)
    ctx.stroke()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = '500 13px Inter, system-ui, sans-serif'
    ctx.fillStyle = '#ffffff'
    ctx.fillText(me.name, cx, cy + 32)
    ctx.font = '11px Inter, system-ui, sans-serif'
    ctx.fillStyle = 'rgba(225,228,240,0.6)'
    ctx.fillText('you', cx, cy + 48)
  }, [layout, size, people, meIdx, activeIdx, rInner, rOuter, sentIds])

  return (
    <div className="ego-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="ego-canvas"
        onMouseMove={e => {
          const rect = e.currentTarget.getBoundingClientRect()
          const mx = e.clientX - rect.left
          const my = e.clientY - rect.top
          const n = hitTest(mx, my)
          setHover(n ? { node: n, x: mx, y: my } : null)
          onHover(n ? n.idx : -1)
        }}
        onMouseLeave={() => { setHover(null); onHover(-1) }}
        onClick={e => {
          const rect = e.currentTarget.getBoundingClientRect()
          const n = hitTest(e.clientX - rect.left, e.clientY - rect.top)
          if (n) onSelect(n.idx)
        }}
      />
      {hover && (
        <div className="ego-tip" style={{ left: hover.x + 12, top: hover.y + 12 }}>
          <div className="ego-tip-name">{hover.node.person.name}</div>
          <div className="faint">{hover.node.person.school} · {hover.node.person.major}</div>
          <div className="ego-tip-reason">{hover.node.reason.label}</div>
          {hover.node.evidence.length > 0 && (
            <div className="faint">{hover.node.evidence.join(' · ')}</div>
          )}
          <div className="mono faint">match {hover.node.score.toFixed(2)}</div>
        </div>
      )}
    </div>
  )
}
