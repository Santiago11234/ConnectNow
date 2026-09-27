'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { api, type MatrixData, type LayoutData, type Participant } from '@/lib/api'
import { decodeMatrix } from '@/lib/matrix'
import { NO_FILTERS, passesFilters, topMatches, type Filters, type Mode, type PersonMeta } from '@/lib/scoring'
import { TopBar, TAB_LABELS, type Tab } from '@/components/TopBar'
import { ControlPanel } from '@/components/ControlPanel'
import { Constellation } from '@/components/Constellation'
import { FindMyPeople } from '@/components/FindMyPeople'
import { ParticipantPanel } from '@/components/ParticipantPanel'
import { RightSidebar } from '@/components/RightSidebar'
import { CommandPalette } from '@/components/CommandPalette'
import { ChevronLeft } from 'lucide-react'

export interface SelectedPair { idA: string; idB: string; nameA: string; nameB: string }

interface Data { matrix: MatrixData; layout: LayoutData; people: Participant[]; decoded: Record<string, Float32Array[]> }

export default function Workspace() {
  const [data, setData] = useState<Data | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [weights, setWeights] = useState<Record<string, number>>({ interests: 0.4, internships: 0.2, university: 0.15, network: 0.15, grade: 0.1 })
  const [mode, setMode] = useState<Mode>('similar')
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [tab, setTab] = useState<Tab>('findpeople')
  const [selected, setSelected] = useState(-1)
  const [activeMatch, setActiveMatch] = useState(-1)
  const [pair, setPair] = useState<SelectedPair | null>(null)
  const [shortlist, setShortlist] = useState<Set<string>>(new Set())
  const [palOpen, setPalOpen] = useState(false)
  const [presentation, setPresentation] = useState(false)

  useEffect(() => {
    Promise.all([api.matrix(), api.layout(), api.participants()])
      .then(([matrix, layout, all]) => {
        const byId = new Map(all.map(p => [p.id, p]))
        const people = matrix.participants.map(p => byId.get(p.id)).filter((p): p is Participant => !!p)
        const decoded: Record<string, Float32Array[]> = {}
        for (const [name, raw] of Object.entries(matrix.matrices)) decoded[name] = decodeMatrix(raw)
        setWeights(matrix.weights)
        setData({ matrix, layout, people, decoded })
      })
      .catch(e => setLoadError(String(e)))
  }, [])

  useEffect(() => { document.body.classList.toggle('presentation', presentation) }, [presentation])

  const meta = useMemo<PersonMeta[]>(() => (data?.people ?? []).map(p => ({ id: p.id, school: p.school, year: p.year, teamId: p.team_id })), [data])
  const visible = useMemo(() => meta.map(m => passesFilters(m, filters)), [meta, filters])
  const shownCount = useMemo(() => visible.filter(Boolean).length, [visible])

  const matches = useMemo(() => (data && selected >= 0
    ? topMatches(selected, data.decoded, weights, mode, meta, visible, 5) : []), [data, selected, weights, mode, meta, visible])

  const selectById = useCallback((id: string) => {
    const idx = data?.people.findIndex(p => p.id === id) ?? -1
    setSelected(idx); setActiveMatch(-1); setPair(null)
  }, [data])

  const openPair = useCallback((a: number, b: number) => {
    const pa = data?.people[a], pb = data?.people[b]
    if (pa && pb) setPair({ idA: pa.id, idB: pb.id, nameA: pa.name, nameB: pb.name })
  }, [data])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setPalOpen(p => !p); return }
      if (e.key === 'Escape') { setPalOpen(false); if (pair) setPair(null); else setSelected(-1) }
      const target = e.target as HTMLElement
      if (!matches.length || target.tagName === 'INPUT' || target.tagName === 'SELECT') return
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const cur = Math.max(0, matches.findIndex(m => m.idx === activeMatch))
        const next = e.key === 'ArrowDown' ? Math.min(matches.length - 1, cur + 1) : Math.max(0, cur - 1)
        setActiveMatch(matches[next]?.idx ?? -1)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [pair, matches, activeMatch])

  const person = data?.people[selected]
  const synthetic = data?.people.some(p => p.is_synthetic) ?? false

  return (
    <>
      <TopBar tab={tab} onTab={setTab} onSearch={() => setPalOpen(true)} participantCount={data?.people.length ?? 0}
        synthetic={synthetic} presentation={presentation} onPresentation={() => setPresentation(p => !p)} />
      <div className="workspace-body">
        <ControlPanel mode={mode} onMode={setMode} weights={weights} onWeights={setWeights} filters={filters}
          onFilters={setFilters} participants={data?.people ?? []} shownCount={shownCount} />

        <main className="center-pane">
          <div className="pane-content">
            {!data && (
              <div className="loading-state" style={{ flexDirection: 'column', gap: 8 }}>
                {loadError ? <>
                  <span style={{ color: 'var(--danger)' }}>Backend offline</span>
                  <code className="mono faint">cd backend &amp;&amp; uvicorn main:app --port 8000</code>
                </> : 'Loading… first load computes embeddings, may take 30s'}
              </div>
            )}
            {data && tab === 'constellation' && (
              <Constellation layout={data.layout} visible={visible} selectedIdx={selected}
                matchIdxs={matches.map(m => m.idx)} onSelect={selectById} />
            )}
            {data && tab === 'findpeople' && (
              <FindMyPeople people={data.people} meta={meta} visible={visible} decoded={data.decoded}
                weights={weights} mode={mode} onSelect={selectById} />
            )}
          </div>
        </main>

        {/* My people carries its own detail pane, so the shared sidebar would
            just be a second empty column next to it. */}
        <aside className="right-sidebar" hidden={tab === 'findpeople'}>
          <div className="right-sidebar-content">
            {pair && data ? (
              <>
                <button className="link-btn" style={{ marginBottom: 8 }} onClick={() => setPair(null)}>
                  <ChevronLeft size={14} strokeWidth={1.5} /> Back
                </button>
                <div className="section-label">{pair.nameA} × {pair.nameB}</div>
                <RightSidebar pair={pair} person={null} decoded={data.decoded} matrixData={data.matrix} />
              </>
            ) : person && data ? (
              <ParticipantPanel person={person} matches={matches} people={data.people} activeIdx={activeMatch}
                onActive={setActiveMatch} mode={mode} shortlist={shortlist}
                onShortlist={id => setShortlist(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })}
                onFullExplanation={otherId => { const b = data.people.findIndex(p => p.id === otherId); openPair(selected, b) }} />
            ) : (
              <div className="empty-state" style={{ height: 120 }}>Click a star, or press ⌘K to find a person</div>
            )}
          </div>
        </aside>
      </div>

      <div className="status-bar">
        <span>{shownCount} of {data?.people.length ?? 0} shown</span>
        <span>mode: {mode}</span>
        <span>{pair ? `${pair.nameA} × ${pair.nameB}` : person?.name ?? 'no selection'}</span>
        <span>{shortlist.size} shortlisted</span>
        <span style={{ color: loadError ? 'var(--danger)' : data ? 'var(--text-muted)' : 'var(--text-faint)' }}>
          backend: {loadError ? 'offline' : data ? 'connected' : 'connecting'}
        </span>
      </div>

      {palOpen && (
        <CommandPalette participants={data?.matrix.participants ?? []} tabs={Object.keys(TAB_LABELS)}
          onSelectPerson={id => { selectById(id); setPalOpen(false) }}
          onSelectTab={t => { setTab(t as Tab); setPalOpen(false) }} onClose={() => setPalOpen(false)} />
      )}
    </>
  )
}
