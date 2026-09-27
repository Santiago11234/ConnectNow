'use client'
import { useEffect, useState } from 'react'
import { api, type ExplainData } from '@/lib/api'
import { FEATURES, type Match } from '@/lib/scoring'

interface Props {
  meId: string
  otherId: string
  match: Match
  shortlisted: boolean
  onShortlist: () => void
  onFullExplanation: () => void
}

export function MatchDetail({ meId, otherId, match, shortlisted, onShortlist, onFullExplanation }: Props) {
  const key = `${meId}|${otherId}`
  const [result, setResult] = useState<{ key: string; data: ExplainData | null }>({ key: '', data: null })

  useEffect(() => {
    let live = true
    api.explain(meId, otherId)
      .then(d => { if (live) setResult({ key, data: d }) })
      .catch(() => { if (live) setResult({ key, data: null }) })
    return () => { live = false }
  }, [meId, otherId, key])

  const data = result.key === key ? result.data : null
  const state = result.key !== key ? 'loading' : data ? 'ready' : 'error'

  return (
    <>
      <div className="breakdown">
        {FEATURES.map(({ key, label }) => {
          const v = match.parts[key] ?? 0
          return (
            <div key={key} className="score-bar-row">
              <span className="score-bar-label">{label}</span>
              <div className="score-bar-track"><div className="score-bar-fill" style={{ width: `${v * 100}%` }} /></div>
              <span className="score-bar-value">{v.toFixed(2)}</span>
            </div>
          )
        })}
      </div>

      <div className="note-block">
        <div className="note-title">Why this match</div>
        {state === 'loading' && <p className="note-body faint">Writing explanation…</p>}
        {state === 'error' && <p className="note-body faint">Explanation unavailable. The score breakdown above is exact.</p>}
        {data && <p className="note-body">{data.explanation}</p>}
      </div>

      {data?.icebreaker && (
        <div className="note-block icebreaker">
          <div className="note-title">Suggested icebreaker</div>
          <p className="note-body">&ldquo;{data.icebreaker}&rdquo;</p>
        </div>
      )}

      <div className="action-row">
        <button className="cn-btn primary" onClick={onFullExplanation}>View full explanation</button>
        <button className={`cn-btn ${shortlisted ? 'on' : ''}`} onClick={onShortlist}>
          {shortlisted ? 'Shortlisted' : 'Shortlist'}
        </button>
      </div>
    </>
  )
}
