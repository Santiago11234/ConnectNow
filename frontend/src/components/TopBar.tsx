'use client'
import { Network, Search, MonitorUp } from 'lucide-react'

export type Tab = 'findpeople' | 'constellation'

export const TAB_LABELS: Record<Tab, string> = {
  findpeople: 'My people',
  constellation: 'Constellation',
}

interface Props {
  tab: Tab
  onTab: (t: Tab) => void
  onSearch: () => void
  participantCount: number
  synthetic: boolean
  presentation: boolean
  onPresentation: () => void
}

export function TopBar({ tab, onTab, onSearch, participantCount, synthetic, presentation, onPresentation }: Props) {
  return (
    <header className="top-bar">
      <div className="top-brand">
        <span className="top-brand-mark"><Network size={14} strokeWidth={1.5} /></span>
        ConnectNow
      </div>
      <nav className="top-tabs">
        {(Object.keys(TAB_LABELS) as Tab[]).map(t => (
          <button key={t} className={`top-tab ${tab === t ? 'active' : ''}`} onClick={() => onTab(t)}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </nav>
      <button className="top-search" onClick={onSearch}>
        <Search size={14} strokeWidth={1.5} />
        <span>Search participants, teams, tabs</span>
        <kbd className="mono">⌘K</kbd>
      </button>
      <div className="top-meta">
        <span><span className="mono" style={{ color: 'var(--text)' }}>{participantCount}</span> participants{synthetic ? ' · synthetic demo' : ''}</span>
        <button
          className={`collapse-toggle ${presentation ? 'on' : ''}`}
          onClick={onPresentation}
          title="Presentation mode (larger text)"
        >
          <MonitorUp size={16} strokeWidth={1.5} />
        </button>
      </div>
    </header>
  )
}
