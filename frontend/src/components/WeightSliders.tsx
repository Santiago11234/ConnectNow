'use client'
import { FEATURES } from '@/lib/scoring'

interface Props {
  weights: Record<string, number>
  onChange: (weights: Record<string, number>) => void
}

export function WeightSliders({ weights, onChange }: Props) {
  const total = Object.values(weights).reduce((s, v) => s + v, 0) || 1

  return (
    <div>
      {FEATURES.map(({ key, label }) => {
        const raw = Math.round((weights[key] ?? 0) * 100)
        const share = Math.round(((weights[key] ?? 0) / total) * 100)
        return (
          <div key={key} className="weight-row">
            <div className="weight-head">
              <span>{label}</span>
              <span className="mono">{share}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={raw}
              aria-label={`${label} weight`}
              onChange={e => onChange({ ...weights, [key]: Number(e.target.value) / 100 })}
              style={{ width: '100%', background: `linear-gradient(to right, var(--accent) ${raw}%, var(--bg-active) ${raw}%)` }}
            />
          </div>
        )
      })}
    </div>
  )
}
