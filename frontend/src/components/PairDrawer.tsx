'use client'
import { useEffect, useState, startTransition } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { api, type ExplainData } from '@/lib/api'

interface Props {
  open: boolean
  onClose: () => void
  idA: string
  idB: string
  nameA: string
  nameB: string
}

const FEATURE_COLORS: Record<string, string> = {
  interests: 'bg-violet-500',
  university: 'bg-blue-500',
  internships: 'bg-green-500',
  network: 'bg-orange-500',
  grade: 'bg-pink-500',
}

export function PairDrawer({ open, onClose, idA, idB, nameA, nameB }: Props) {
  const [data, setData] = useState<ExplainData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !idA || !idB) return
    startTransition(() => {
      setLoading(true)
      setData(null)
    })
    api.explain(idA, idB)
      .then(result => startTransition(() => setData(result)))
      .catch(console.error)
      .finally(() => startTransition(() => setLoading(false)))
  }, [open, idA, idB])

  return (
    <Sheet open={open} onOpenChange={o => { if (!o) onClose() }}>
      <SheetContent className="bg-gray-900 border-gray-700 text-gray-100 w-[420px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-white">
            {nameA} × {nameB}
          </SheetTitle>
        </SheetHeader>

        {loading && <div className="text-gray-400 mt-8 text-center">Loading explanation...</div>}

        {data && (
          <div className="mt-6 space-y-6">
            {/* Composite score */}
            <div className="text-center">
              <div className="text-4xl font-bold text-violet-400">
                {(data.composite_score * 100).toFixed(0)}%
              </div>
              <div className="text-sm text-gray-400">connection strength</div>
            </div>

            {/* Feature breakdown */}
            <div>
              <div className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-3">Signal Breakdown</div>
              <div className="space-y-2">
                {Object.entries(data.feature_scores).map(([feature, score]) => (
                  <div key={feature} className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${FEATURE_COLORS[feature] ?? 'bg-gray-500'}`} />
                    <span className="text-xs text-gray-300 w-20 capitalize">{feature}</span>
                    <div className="flex-1 bg-gray-800 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${FEATURE_COLORS[feature] ?? 'bg-gray-500'}`}
                        style={{ width: `${score * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 w-8 text-right">{(score * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Shared facts */}
            {data.shared_facts.length > 0 && (
              <div>
                <div className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">Shared Facts</div>
                <div className="flex flex-wrap gap-2">
                  {data.shared_facts.map(fact => (
                    <Badge key={fact} variant="outline" className="border-gray-600 text-gray-300 text-xs">
                      {fact}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Explanation */}
            <div>
              <div className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">Why They&apos;d Connect</div>
              <p className="text-sm text-gray-200 leading-relaxed">{data.explanation}</p>
            </div>

            {/* Icebreaker */}
            <div className="bg-violet-950 border border-violet-800 rounded-lg p-4">
              <div className="text-xs text-violet-400 font-semibold uppercase tracking-wider mb-1">Icebreaker</div>
              <p className="text-sm text-violet-200 italic">&ldquo;{data.icebreaker}&rdquo;</p>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
