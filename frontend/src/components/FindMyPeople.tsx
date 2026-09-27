'use client'
import { useMemo, useState, useEffect } from 'react'
import { api, type ExplainData, type Participant } from '@/lib/api'
import { topMatches, type Match, type Mode, type PersonMeta } from '@/lib/scoring'
import { reasonFor, rowStats } from '@/lib/ego'
import { currentUserIndex } from '@/lib/session'
import { EgoView } from './EgoView'

interface Props {
  people: Participant[]
  meta: PersonMeta[]
  visible: boolean[]
  decoded: Record<string, Float32Array[]>
  weights: Record<string, number>
  mode: Mode
  onSelect: (id: string) => void
}

const TOP_N = 24

export function FindMyPeople({ people, meta, visible, decoded, weights, mode, onSelect }: Props) {
  const [active, setActive] = useState(-1)
  const [explains, setExplains] = useState<Record<string, ExplainData>>({})

  // This view belongs to the signed-in user; there is no one else to pick.
  const meIdx = useMemo(() => currentUserIndex(people), [people])

  const matches = useMemo<Match[]>(
    () => (meIdx >= 0 ? topMatches(meIdx, decoded, weights, mode, meta, visible, TOP_N) : []),
    [meIdx, decoded, weights, mode, meta, visible],
  )

  // Explanation for whichever match is focused, cached per pair.
  useEffect(() => {
    const myId = people[meIdx]?.id
    const otherId = people[active]?.id
    if (!myId || !otherId) return
    const key = `${myId}|${otherId}`
    if (explains[key]) return
    let cancelled = false
    api.explain(myId, otherId)
      .then(d => { if (!cancelled) setExplains(prev => ({ ...prev, [key]: d })) })
      .catch(() => { /* breakdown still shown without prose */ })
    return () => { cancelled = true }
  }, [meIdx, active, people, explains])

  const mePerson = people[meIdx]
  const activePerson = people[active]
  const explain = mePerson && activePerson ? explains[`${mePerson.id}|${activePerson.id}`] : undefined

  const stats = useMemo(() => rowStats(decoded, meIdx, visible), [decoded, meIdx, visible])

  const activeReason = useMemo(() => {
    const m = matches.find(x => x.idx === active)
    if (!m || !mePerson || !activePerson) return null
    return reasonFor(m.parts, weights, mePerson, activePerson, stats)
  }, [matches, active, mePerson, activePerson, weights, stats])

  return (
    <div className="ego">
      <div className="ego-main">
        <div className="ego-head">
          {mePerson ? (
            <>
              <span className="ego-head-name">{mePerson.name}</span>
              <span className="faint">{mePerson.school} · {mePerson.major} · {mePerson.year}</span>
              <span className="faint">
                top {matches.length} matches, placed by the signal that drove each one
              </span>
            </>
          ) : (
            <span className="faint">Signed-in participant not found in this dataset</span>
          )}
        </div>

        {meIdx >= 0 && (
          <EgoView
            meIdx={meIdx}
            people={people}
            matches={matches}
            weights={weights}
            activeIdx={active}
            visible={visible}
            decoded={decoded}
            onSelect={idx => { setActive(idx); const p = people[idx]; if (p) onSelect(p.id) }}
            onHover={idx => { if (idx >= 0) setActive(idx) }}
          />
        )}
      </div>

      <div className="ego-detail">
        {!activePerson && <div className="empty-state">Hover or click a match to see why</div>}
        {activePerson && (
          <>
            <div className="section-label">{activePerson.name}</div>
            <div className="faint" style={{ marginBottom: 8 }}>
              {activePerson.school} · {activePerson.major} · {activePerson.year}
            </div>
            {activeReason && (
              <>
                <div className="ego-reason-label">{activeReason.reason.label}</div>
                {activeReason.evidence.length > 0 && (
                  <div className="chip-row">
                    {activeReason.evidence.map(e => <span key={e} className="cn-chip">{e}</span>)}
                  </div>
                )}
              </>
            )}
            {explain ? (
              <>
                <p className="note-body">{explain.explanation}</p>
                {explain.icebreaker && (
                  <div className="icebreaker-block">&ldquo;{explain.icebreaker}&rdquo;</div>
                )}
              </>
            ) : (
              <div className="faint">Loading explanation…</div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
