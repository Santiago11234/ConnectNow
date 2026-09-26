'use client'
import { useEffect, useState, startTransition } from 'react'
import { api, type ExplainData, type Participant, type MatrixData } from '@/lib/api'
import type { SelectedPair } from '@/app/page'

interface Props {
  pair: SelectedPair | null
  person: Participant | null
  decoded: Record<string, Float32Array[]>
  matrixData: MatrixData | null
}

const FEATURES = ['interests', 'university', 'internships', 'network', 'grade']

export function RightSidebar({ pair, person, decoded, matrixData }: Props) {
  const [explainData, setExplainData] = useState<ExplainData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!pair) { setExplainData(null); return }
    startTransition(() => { setLoading(true); setExplainData(null) })
    api.explain(pair.idA, pair.idB)
      .then(d => startTransition(() => setExplainData(d)))
      .catch(console.error)
      .finally(() => startTransition(() => setLoading(false)))
  }, [pair])

  if (!pair && !person) {
    return <div className="empty-state" style={{ height: 120 }}>Select a person or cell</div>
  }

  // Person view — show top matches and profile properties
  if (person && !pair) {
    const personIdx = matrixData?.participants.findIndex(p => p.id === person.id) ?? -1
    const topMatches = personIdx >= 0 && matrixData
      ? matrixData.participants
          .map((p, idx) => {
            if (idx === personIdx) return null
            let score = 0
            const weights = matrixData.weights
            const total = Object.values(weights).reduce((s, v) => s + v, 0)
            for (const [feat, w] of Object.entries(weights)) {
              const mat = matrixData.matrices[feat]
              score += (w / total) * ((mat?.[personIdx]?.[idx] ?? 0) / 255)
            }
            return { id: p.id, name: p.name, score }
          })
          .filter(Boolean)
          .sort((a, b) => (b?.score ?? 0) - (a?.score ?? 0))
          .slice(0, 5) as { id: string; name: string; score: number }[]
      : []

    return (
      <div>
        <div className="section-label">Profile</div>
        <table className="prop-table">
          <tbody>
            <tr><td>School</td><td>{person.school}</td></tr>
            <tr><td>Major</td><td>{person.major}</td></tr>
            <tr><td>Year</td><td>{person.year}</td></tr>
            {person.internships.length > 0 && (
              <tr>
                <td>Internships</td>
                <td>{person.internships.map(i => i.company).join(', ')}</td>
              </tr>
            )}
            {person.interest_tags.length > 0 && (
              <tr>
                <td>Tags</td>
                <td>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {person.interest_tags.slice(0, 6).map(t => (
                      <span key={t} className="cn-chip">{t}</span>
                    ))}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {topMatches.length > 0 && (
          <>
            <div className="divider" />
            <div className="section-label">Top matches</div>
            {topMatches.map((m, i) => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 28 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)', minWidth: 16 }}>{i + 1}</span>
                <span style={{ fontSize: 12, color: 'var(--text)', flex: 1 }}>{m.name}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>
                  {(m.score * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    )
  }

  // Pair view
  return (
    <div>
      {loading && (
        <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: '8px 0' }}>
          Loading explanation&hellip;
        </div>
      )}

      {explainData && (
        <>
          {/* Composite score */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '4px 0 12px' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 500, color: 'var(--text)' }}>
              {(explainData.composite_score * 100).toFixed(0)}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>/ 100 connection score</span>
          </div>

          {/* Profiles */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            {[explainData.participant_a, explainData.participant_b].map(p => (
              <div key={p.id} style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px' }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 4 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.school}</div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{p.major} · {p.year}</div>
              </div>
            ))}
          </div>

          <div className="divider" />

          {/* Feature breakdown */}
          <div className="section-label">Signal breakdown</div>
          <div style={{ marginBottom: 12 }}>
            {FEATURES.filter(f => f in explainData.feature_scores).map(feature => {
              const score = explainData.feature_scores[feature] ?? 0
              return (
                <div key={feature} className="score-bar-row">
                  <span className="score-bar-label">{feature}</span>
                  <div className="score-bar-track">
                    <div className="score-bar-fill" style={{ width: `${score * 100}%` }} />
                  </div>
                  <span className="score-bar-value">{(score * 100).toFixed(0)}</span>
                </div>
              )
            })}
          </div>

          {/* Shared facts */}
          {explainData.shared_facts.length > 0 && (
            <>
              <div className="divider" />
              <div className="section-label">Shared</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                {explainData.shared_facts.map(f => (
                  <span key={f} className="cn-chip">{f}</span>
                ))}
              </div>
            </>
          )}

          <div className="divider" />

          {/* Explanation */}
          <div className="section-label">Why they connect</div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 12 }}>
            {explainData.explanation}
          </p>

          {/* Icebreaker */}
          {explainData.icebreaker && (
            <>
              <div className="section-label">Icebreaker</div>
              <div className="icebreaker-block">
                &ldquo;{explainData.icebreaker}&rdquo;
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
