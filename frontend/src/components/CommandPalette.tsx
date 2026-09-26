'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

interface Props {
  participants: { id: string; name: string }[]
  tabs: string[]
  onSelectPerson: (id: string) => void
  onSelectTab: (tab: string) => void
  onClose: () => void
}

type Item =
  | { type: 'person'; id: string; label: string }
  | { type: 'tab'; id: string; label: string }

const TAB_LABELS: Record<string, string> = {
  heatmap: 'Heat map',
  constellation: 'Constellation',
  findpeople: 'Find my people',
  bridges: 'Bridges',
}

export function CommandPalette({ participants, tabs, onSelectPerson, onSelectTab, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const items: Item[] = (() => {
    const q = query.trim().toLowerCase()
    const results: Item[] = []

    // tabs first
    for (const t of tabs) {
      const label = TAB_LABELS[t] ?? t
      if (!q || label.toLowerCase().includes(q)) {
        results.push({ type: 'tab', id: t, label })
      }
    }

    // people
    for (const p of participants) {
      if (!q || p.name.toLowerCase().includes(q)) {
        results.push({ type: 'person', id: p.id, label: p.name })
        if (results.length >= 20) break
      }
    }

    return results
  })()

  const select = useCallback((item: Item) => {
    if (item.type === 'person') onSelectPerson(item.id)
    else onSelectTab(item.id)
  }, [onSelectPerson, onSelectTab])

  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocused(f => Math.min(f + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocused(f => Math.max(f - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); const item = items[focused]; if (item) select(item) }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }, [items, focused, select, onClose])

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette-box" onClick={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Go to person or tab…"
          value={query}
          onChange={e => { setQuery(e.target.value); setFocused(0) }}
          onKeyDown={handleKey}
        />
        <ul className="palette-list">
          {items.map((item, i) => (
            <li
              key={item.id}
              className={`palette-item ${i === focused ? 'focused' : ''}`}
              onMouseEnter={() => setFocused(i)}
              onClick={() => select(item)}
            >
              <span>{item.label}</span>
              <span className="palette-item-type">{item.type}</span>
            </li>
          ))}
          {items.length === 0 && (
            <li className="palette-item" style={{ color: 'var(--text-faint)', cursor: 'default' }}>No results</li>
          )}
        </ul>
      </div>
    </div>
  )
}
