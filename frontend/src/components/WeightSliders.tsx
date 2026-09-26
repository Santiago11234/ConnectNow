'use client'
import { useRef, useCallback } from 'react'

const FEATURES = [
  { key: 'interests', label: 'Interests' },
  { key: 'university', label: 'University' },
  { key: 'internships', label: 'Internships' },
  { key: 'network', label: 'Network' },
  { key: 'grade', label: 'Year' },
]

interface Props {
  weights: Record<string, number>
  onChange: (weights: Record<string, number>) => void
}

function NativeSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="range"
      min={0}
      max={100}
      step={5}
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      style={{
        flex: 1,
        height: 2,
        appearance: 'none',
        background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${value}%, var(--bg-active) ${value}%, var(--bg-active) 100%)`,
        borderRadius: 1,
        outline: 'none',
        cursor: 'pointer',
      }}
    />
  )
}

export function WeightSliders({ weights, onChange }: Props) {
  const update = (key: string, pct: number) => {
    onChange({ ...weights, [key]: pct / 100 })
  }

  return (
    <div>
      <div className="section-label">Signal weights</div>
      {FEATURES.map(({ key, label }) => {
        const pct = Math.round((weights[key] ?? 0.2) * 100)
        return (
          <div key={key} className="cn-slider-row">
            <span className="cn-slider-label">{label}</span>
            <NativeSlider value={pct} onChange={v => update(key, v)} />
            <span className="cn-slider-value">{pct}</span>
          </div>
        )
      })}
    </div>
  )
}
