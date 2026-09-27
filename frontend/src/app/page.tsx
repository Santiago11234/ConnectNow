'use client'
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { api, type MatrixData, type LayoutData, type Participant } from '@/lib/api'
import { decodeMatrix } from '@/lib/matrix'
import { Constellation } from '@/components/Constellation'
import { WeightSliders } from '@/components/WeightSliders'
import { RightSidebar } from '@/components/RightSidebar'
import { CommandPalette } from '@/components/CommandPalette'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'

type Tab = 'constellation' | 'findpeople' | 'bridges'

export interface SelectedPair {
  idA: string
  idB: string
  nameA: string
  nameB: string
}

export default function Workspace() {
  const [matrixData, setMatrixData] = useState<MatrixData | null>(null)
  const [layout, setLayout] = useState<LayoutData | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [weights, setWeights] = useState<Record<string, number>>({
    university: 0.20, grade: 0.10, internships: 0.20, interests: 0.35, network: 0.15,
  })
  const [decoded, setDecoded] = useState<Record<string, Float32Array[]>>({})
  const [tab, setTab] = useState<Tab>('constellation')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [healthStatus, setHealthStatus] = useState<string>('connecting')
  const [participantCount, setParticipantCount] = useState(0)

  const [selectedPair, setSelectedPair] = useState<SelectedPair | null>(null)
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null)

  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)
  const [palOpen, setPalOpen] = useState(false)
  const [personSearch, setPersonSearch] = useState('')

  // Find my people state
  const [fmpSearch, setFmpSearch] = useState('')
  const [fmpSelected, setFmpSelected] = useState<string>('')
  const [fmpMatches, setFmpMatches] = useState<{ participant: { id: string; name: string }; score: number; explanation?: string; icebreaker?: string; shared_facts?: string[] }[]>([])
  const [fmpLoading, setFmpLoading] = useState(false)

  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.health()
      .then(h => { setHealthStatus('connected'); setParticipantCount(h.participants) })
      .catch(() => setHealthStatus('offline'))

    Promise.all([api.matrix(), api.layout(), api.participants()])
      .then(([m, l, p]) => {
        setMatrixData(m)
        setWeights(m.weights)
        setLayout(l)
        setParticipants(p)
        const dec: Record<string, Float32Array[]> = {}
        for (const [name, raw] of Object.entries(m.matrices)) {
          dec[name] = decodeMatrix(raw)
        }
        setDecoded(dec)
        setParticipantCount(m.participants.length)
      })
      .catch(e => setLoadError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  // Keyboard: Cmd/Ctrl+K palette, Esc
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setPalOpen(p => !p)
      }
      if (e.key === 'Escape') {
        setPalOpen(false)
        setSelectedPair(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handlePersonSelect = useCallback((id: string) => {
    setSelectedPerson(id)
    if (!rightOpen) setRightOpen(true)
  }, [rightOpen])

  const filteredPeople = useMemo(() => {
    const src = matrixData?.participants ?? []
    const q = personSearch.trim().toLowerCase()
    return q ? src.filter(p => p.name.toLowerCase().includes(q)) : src
  }, [matrixData, personSearch])

  // Find my people logic
  const findMatches = useCallback(async () => {
    if (!fmpSelected || !matrixData) return
    setFmpLoading(true)
    setFmpMatches([])

    const allParts = matrixData.participants
    const myIdx = allParts.findIndex(p => p.id === fmpSelected)
    if (myIdx < 0) { setFmpLoading(false); return }

    const total = Object.values(weights).reduce((s, v) => s + v, 0)
    const scores = allParts.map((_, j) => {
      if (j === myIdx) return 0
      let score = 0
      for (const [feat, w] of Object.entries(weights)) {
        const mat = matrixData.matrices[feat]
        const val = (mat?.[myIdx]?.[j] ?? 0) / 255
        score += (w / total) * val
      }
      return score
    })

    const top10 = allParts
      .map((p, idx) => ({ participant: p, score: scores[idx] ?? 0 }))
      .filter(x => x.participant.id !== fmpSelected)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)

    setFmpMatches(top10)
    setFmpLoading(false)

    for (const match of top10.slice(0, 3)) {
      try {
        const explain = await api.explain(fmpSelected, match.participant.id)
        setFmpMatches(prev => prev.map(m =>
          m.participant.id === match.participant.id
            ? { ...m, explanation: explain.explanation, icebreaker: explain.icebreaker, shared_facts: explain.shared_facts }
            : m
        ))
      } catch { /* ignore */ }
    }
  }, [fmpSelected, matrixData, weights])

  const fmpFiltered = useMemo(() => {
    const q = fmpSearch.trim().toLowerCase()
    const src = matrixData?.participants ?? []
    return q ? src.filter(p => p.name.toLowerCase().includes(q)).slice(0, 10) : src.slice(0, 10)
  }, [fmpSearch, matrixData])

  const selectedPersonData = useMemo(() =>
    participants.find(p => p.id === selectedPerson) ?? null,
  [participants, selectedPerson])

  if (loading || loadError) {
    return (
      <>
        <div className="workspace-body">
          <aside className="sidebar">
            <div className="sidebar-section" style={{ padding: '8px 12px' }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>ConnectNow</span>
            </div>
          </aside>
          <main className="center-pane">
            <div className="tab-bar">
              {(['Constellation', 'Find my people', 'Bridges'] as const).map(label => (
                <span key={label} className="tab-item" style={{ color: 'var(--text-faint)' }}>{label}</span>
              ))}
            </div>
            <div className="pane-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
              {loading ? (
                <span style={{ fontSize: 13, color: 'var(--text-faint)' }}>
                  Loading&hellip; first load computes embeddings, may take 30s
                </span>
              ) : (
                <>
                  <span style={{ fontSize: 13, color: 'var(--danger)' }}>Backend offline</span>
                  <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-faint)' }}>
                    cd backend &amp;&amp; uvicorn main:app --port 8000
                  </code>
                </>
              )}
            </div>
          </main>
          <aside className="right-sidebar">
            <div className="right-sidebar-header">Details</div>
            <div className="right-sidebar-content">
              <div className="empty-state" style={{ height: 80 }}>No selection</div>
            </div>
          </aside>
        </div>
        <div className="status-bar">
          {loading ? <span>connecting&hellip;</span> : <span style={{ color: 'var(--danger)' }}>backend offline</span>}
        </div>
      </>
    )
  }

  return (
    <>
      <div className="workspace-body">
        {/* Left sidebar */}
        <aside className={`sidebar ${leftOpen ? '' : 'collapsed'}`}>
          <div className="sidebar-section" style={{ padding: '8px 8px 8px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', flex: 1 }}>ConnectNow</span>
            <button className="collapse-toggle" onClick={() => setLeftOpen(false)} title="Collapse sidebar">
              <ChevronLeft size={14} />
            </button>
          </div>

          <div className="sidebar-section">
            <div style={{ position: 'relative' }}>
              <input
                ref={searchRef}
                className="cn-input"
                style={{ paddingLeft: 28 }}
                placeholder="Search people"
                value={personSearch}
                onChange={e => setPersonSearch(e.target.value)}
              />
              <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', pointerEvents: 'none' }} />
            </div>
          </div>

          <div className="sidebar-scroll">
            <ul className="people-list">
              {filteredPeople.slice(0, 200).map(p => (
                <li
                  key={p.id}
                  className={`people-list-item ${selectedPerson === p.id ? 'active' : ''}`}
                  onClick={() => handlePersonSelect(p.id)}
                  title={p.name}
                >
                  {p.name}
                </li>
              ))}
            </ul>

            {/* Weights section */}
            <div className="sidebar-section" style={{ marginTop: 4 }}>
              <WeightSliders weights={weights} onChange={setWeights} />
            </div>

          </div>
        </aside>

        {/* Collapsed left toggle */}
        {!leftOpen && (
          <button
            className="collapse-toggle"
            style={{ position: 'absolute', left: 4, top: '50%', zIndex: 10, transform: 'translateY(-50%)', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', width: 20, height: 28 }}
            onClick={() => setLeftOpen(true)}
            title="Expand sidebar"
          >
            <ChevronRight size={14} />
          </button>
        )}

        {/* Center pane */}
        <main className="center-pane">
          <div className="tab-bar">
            {(['constellation', 'findpeople', 'bridges'] as Tab[]).map(t => (
              <button
                key={t}
                className={`tab-item ${tab === t ? 'active' : ''}`}
                onClick={() => setTab(t)}
              >
                {t === 'constellation' ? 'Constellation' :
                 t === 'findpeople' ? 'Find my people' :
                 'Bridges'}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <button
              className="cn-btn"
              style={{ height: 24, fontSize: 11, padding: '0 8px' }}
              onClick={() => setPalOpen(true)}
            >
              <kbd style={{ fontSize: 11, fontFamily: 'var(--font-mono)', opacity: 0.7 }}>⌘K</kbd>
            </button>
          </div>

          <div className="pane-content">
            {tab === 'constellation' && layout && (
              <Constellation
                layout={layout}
                selectedId={selectedPerson ?? undefined}
                onSelect={handlePersonSelect}
              />
            )}
            {tab === 'findpeople' && matrixData && (
              <FindMyPeople
                search={fmpSearch}
                onSearch={setFmpSearch}
                filtered={fmpFiltered}
                selected={fmpSelected}
                onSelect={setFmpSelected}
                onFind={findMatches}
                loading={fmpLoading}
                matches={fmpMatches}
              />
            )}
            {tab === 'bridges' && layout && (
              <BridgesView layout={layout} onSelect={handlePersonSelect} />
            )}
          </div>
        </main>

        {/* Right sidebar */}
        {rightOpen && (
          <aside className="right-sidebar">
            <div className="right-sidebar-header">
              <span style={{ flex: 1 }}>
                {selectedPair ? `${selectedPair.nameA} × ${selectedPair.nameB}` :
                 selectedPersonData ? selectedPersonData.name :
                 'Details'}
              </span>
              <button className="collapse-toggle" onClick={() => setRightOpen(false)}>
                <ChevronRight size={14} />
              </button>
            </div>
            <div className="right-sidebar-content">
              <RightSidebar
                pair={selectedPair}
                person={selectedPersonData}
                decoded={decoded}
                matrixData={matrixData}
              />
            </div>
          </aside>
        )}

        {!rightOpen && (
          <button
            className="collapse-toggle"
            style={{ position: 'absolute', right: 4, top: '50%', zIndex: 10, transform: 'translateY(-50%)', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', width: 20, height: 28 }}
            onClick={() => setRightOpen(true)}
            title="Expand details"
          >
            <ChevronLeft size={14} />
          </button>
        )}
      </div>

      {/* Status bar */}
      <div className="status-bar">
        <span>{participantCount > 0 ? `${participantCount} participants` : 'loading'}</span>
        <span>{selectedPair ? `${selectedPair.nameA} × ${selectedPair.nameB}` : selectedPersonData?.name ?? 'no selection'}</span>
        <span style={{ color: healthStatus === 'connected' ? 'var(--accent)' : healthStatus === 'offline' ? 'var(--danger)' : 'var(--text-faint)' }}>
          backend: {healthStatus}
        </span>
      </div>

      {/* Command palette */}
      {palOpen && (
        <CommandPalette
          participants={matrixData?.participants ?? []}
          tabs={['constellation', 'findpeople', 'bridges']}
          onSelectPerson={id => {
            handlePersonSelect(id)
            setPalOpen(false)
          }}
          onSelectTab={t => {
            setTab(t as Tab)
            setPalOpen(false)
          }}
          onClose={() => setPalOpen(false)}
        />
      )}
    </>
  )
}

// ── Find my people inline pane ─────────────────────────────────────
function FindMyPeople({
  search, onSearch, filtered, selected, onSelect, onFind, loading, matches
}: {
  search: string
  onSearch: (s: string) => void
  filtered: { id: string; name: string }[]
  selected: string
  onSelect: (id: string) => void
  onFind: () => void
  loading: boolean
  matches: { participant: { id: string; name: string }; score: number; explanation?: string; icebreaker?: string; shared_facts?: string[] }[]
}) {
  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Picker */}
      <div style={{ width: 240, borderRight: '1px solid var(--border)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Pick yourself</div>
        <input
          className="cn-input"
          placeholder="Search name..."
          value={search}
          onChange={e => onSearch(e.target.value)}
        />
        <ul className="people-list" style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.map(p => (
            <li
              key={p.id}
              className={`people-list-item ${selected === p.id ? 'active' : ''}`}
              onClick={() => onSelect(p.id)}
            >
              {p.name}
            </li>
          ))}
        </ul>
        {selected && (
          <button
            className="cn-btn primary"
            style={{ width: '100%', height: 28 }}
            onClick={onFind}
            disabled={loading}
          >
            {loading ? 'Finding…' : 'Find top 10 matches'}
          </button>
        )}
      </div>

      {/* Results */}
      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        {matches.length === 0 && !loading && (
          <div className="empty-state">Select yourself and click find</div>
        )}
        {matches.map((m, idx) => (
          <div key={m.participant.id} style={{ borderBottom: '1px solid var(--border)', padding: '10px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)', minWidth: 20 }}>#{idx + 1}</span>
              <span style={{ fontSize: 13, color: 'var(--text)' }}>{m.participant.name}</span>
              <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent)' }}>
                {(m.score * 100).toFixed(0)}%
              </span>
            </div>
            {m.shared_facts && m.shared_facts.length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
                {m.shared_facts.slice(0, 4).map(f => (
                  <span key={f} className="cn-chip">{f}</span>
                ))}
              </div>
            )}
            {m.explanation && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0' }}>{m.explanation}</p>
            )}
            {m.icebreaker && (
              <div className="icebreaker-block" style={{ marginTop: 4 }}>
                &ldquo;{m.icebreaker}&rdquo;
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Bridges view ───────────────────────────────────────────────────
function BridgesView({ layout, onSelect }: { layout: LayoutData; onSelect: (id: string) => void }) {
  const sorted = useMemo(() => {
    return layout.participants
      .map((p, idx) => ({ ...p, bridge: layout.bridge_scores[idx] ?? 0 }))
      .sort((a, b) => b.bridge - a.bridge)
      .slice(0, 50)
  }, [layout])

  const maxBridge = sorted[0]?.bridge ?? 1

  return (
    <div style={{ padding: 16, overflow: 'auto', height: '100%' }}>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
        Top 50 bridge participants — high betweenness across interest clusters
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-faint)', fontWeight: 400 }}>#</th>
            <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-faint)', fontWeight: 400 }}>Name</th>
            <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-faint)', fontWeight: 400 }}>School</th>
            <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-faint)', fontWeight: 400 }}>Bridge score</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => (
            <tr
              key={p.id}
              style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
              onClick={() => onSelect(p.id)}
            >
              <td style={{ padding: '4px 8px', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>{i + 1}</td>
              <td style={{ padding: '4px 8px', color: 'var(--text)' }}>{p.name}</td>
              <td style={{ padding: '4px 8px', color: 'var(--text-muted)' }}>{p.school}</td>
              <td style={{ padding: '4px 8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 2, background: 'var(--bg-active)', borderRadius: 1 }}>
                    <div style={{ height: 2, background: 'var(--accent)', borderRadius: 1, width: `${(p.bridge / maxBridge) * 100}%` }} />
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', minWidth: 32 }}>
                    {p.bridge.toFixed(3)}
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
