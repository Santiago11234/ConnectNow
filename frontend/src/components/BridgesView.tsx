'use client'
import { useMemo } from 'react'
import type { LayoutData } from '@/lib/api'

export function BridgesView({ layout, onSelect }: { layout: LayoutData; onSelect: (id: string) => void }) {
  const sorted = useMemo(() => layout.participants
    .map((p, idx) => ({ ...p, bridge: layout.bridge_scores[idx] ?? 0, cluster: layout.cluster_ids[idx] ?? 0 }))
    .sort((a, b) => b.bridge - a.bridge)
    .slice(0, 50), [layout])
  const max = sorted[0]?.bridge || 1

  return (
    <div style={{ padding: 16, overflow: 'auto', height: '100%' }}>
      <div className="panel-hint" style={{ marginBottom: 12 }}>
        Top 50 bridge participants: high betweenness across interest clusters.
      </div>
      <table className="data-table">
        <thead>
          <tr><th>#</th><th>Name</th><th>School</th><th>Cluster</th><th>Bridge score</th></tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => (
            <tr key={p.id} onClick={() => onSelect(p.id)}>
              <td className="mono faint">{i + 1}</td>
              <td>{p.name}</td>
              <td className="muted">{p.school}</td>
              <td className="muted">{layout.cluster_labels[String(p.cluster)] ?? ''}</td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="score-bar-track"><div className="score-bar-fill" style={{ width: `${(p.bridge / max) * 100}%` }} /></div>
                  <span className="mono muted" style={{ minWidth: 40 }}>{p.bridge.toFixed(3)}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
