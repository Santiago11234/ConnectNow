'use client'
import { useMemo } from 'react'
import { WeightSliders } from '@/components/WeightSliders'
import type { Filters, Mode } from '@/lib/scoring'
import type { Participant } from '@/lib/api'

const MODES: { key: Mode; label: string }[] = [
  { key: 'similar', label: 'Similar' },
  { key: 'complementary', label: 'Complementary' },
  { key: 'serendipity', label: 'Serendipity' },
]

interface Props {
  mode: Mode
  onMode: (m: Mode) => void
  weights: Record<string, number>
  onWeights: (w: Record<string, number>) => void
  filters: Filters
  onFilters: (f: Filters) => void
  participants: Participant[]
  shownCount: number
}

function FilterSelect({ value, all, options, onChange }: { value: string; all: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <select className={`filter-select ${value ? 'selected' : ''}`} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">{all}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

export function ControlPanel({ mode, onMode, weights, onWeights, filters, onFilters, participants, shownCount }: Props) {
  const opts = useMemo(() => {
    const uniq = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort()
    return {
      schools: uniq(participants.map(p => p.school)),
      years: uniq(participants.map(p => p.year)),
      teams: uniq(participants.map(p => p.team_id)),
    }
  }, [participants])

  const active = filters.school || filters.year || filters.team

  return (
    <aside className="sidebar">
      <div className="sidebar-scroll">
        <section className="panel-section">
          <div className="section-label">Mode</div>
          <div className="mode-toggle">
            {MODES.map(m => (
              <button key={m.key} className={`mode-toggle-btn ${mode === m.key ? 'active' : ''}`} onClick={() => onMode(m.key)}>
                {m.label}
              </button>
            ))}
          </div>
          <p className="panel-hint">
            {mode === 'similar' && 'Weighted blend of every signal.'}
            {mode === 'complementary' && 'Shared interests, different internship backgrounds.'}
            {mode === 'serendipity' && 'Similar people with no mutual friends, on other teams.'}
          </p>
        </section>

        <section className="panel-section">
          <div className="section-label">Similarity weights</div>
          <WeightSliders weights={weights} onChange={onWeights} />
        </section>

        <section className="panel-section">
          <div className="section-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
            Filters
            {active && <button className="link-btn" onClick={() => onFilters({ school: '', year: '', team: '' })}>Clear</button>}
          </div>
          <div className="filter-row">
            <FilterSelect value={filters.school} all="All schools" options={opts.schools} onChange={school => onFilters({ ...filters, school })} />
            <FilterSelect value={filters.year} all="All years" options={opts.years} onChange={year => onFilters({ ...filters, year })} />
            <FilterSelect value={filters.team} all="All teams" options={opts.teams} onChange={team => onFilters({ ...filters, team })} />
          </div>
        </section>
      </div>
      <div className="panel-footer">
        <span className="mono">{shownCount}</span> of <span className="mono">{participants.length}</span> shown.
        Drag a slider to re-blend in real time; click any person to see why they match.
      </div>
    </aside>
  )
}
