'use client'
import { MatchDetail } from '@/components/MatchDetail'
import type { Participant } from '@/lib/api'
import { initials, type Match, type Mode } from '@/lib/scoring'

interface Props {
  person: Participant
  matches: Match[]
  people: Participant[]
  activeIdx: number
  onActive: (idx: number) => void
  mode: Mode
  shortlist: Set<string>
  onShortlist: (id: string) => void
  onFullExplanation: (otherId: string) => void
  /** True when viewing someone other than the signed-in user, whose ranked
   *  matches are not ours to display. */
  matchesPrivate?: boolean
}

const MODE_LABEL: Record<Mode, string> = { similar: 'Top matches', complementary: 'Complementary teammates', serendipity: 'Serendipitous strangers' }

export function ParticipantPanel({ person, matches, people, activeIdx, onActive, mode, shortlist, onShortlist, onFullExplanation, matchesPrivate }: Props) {
  const tags = person.interest_tags.length ? person.interest_tags : person.skills
  const active = matches.find(m => m.idx === activeIdx) ?? matches[0]
  const activePerson = active ? people[active.idx] : undefined

  return (
    <div>
      <div className="section-label">Selected participant</div>
      <div className="person-head">
        <div className="avatar">{initials(person.name)}</div>
        <div style={{ minWidth: 0 }}>
          <div className="person-name">{person.name}</div>
          <div className="person-sub">{person.school} · {person.major} · {person.year}</div>
        </div>
      </div>
      {tags.length > 0 && (
        <div className="chip-row">
          {tags.slice(0, 5).map(t => <span key={t} className="cn-chip">{t}</span>)}
        </div>
      )}

      <div className="divider" />
      {matchesPrivate ? (
        <>
          <div className="section-label">Matches</div>
          <div className="faint private-note">
            Private to {person.name.split(' ')[0]}. You can only see your own matches.
          </div>
        </>
      ) : (
      <>
      <div className="section-label">{MODE_LABEL[mode]}</div>
      {matches.length === 0 && <div className="empty-state" style={{ height: 40 }}>No matches under current filters</div>}
      <ul className="match-list">
        {matches.map(m => {
          const p = people[m.idx]
          if (!p) return null
          return (
            <li key={p.id} className={`match-row ${m === active ? 'active' : ''}`} onClick={() => onActive(m.idx)}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="match-name">{p.name}{shortlist.has(p.id) && <span className="match-flag">shortlisted</span>}</div>
                <div className="match-sub">{p.school} · {p.major}</div>
              </div>
              <span className="match-score mono">{m.score.toFixed(2)}</span>
            </li>
          )
        })}
      </ul>

      {active && activePerson && (
        <>
          <div className="divider" />
          <div className="section-label">Breakdown · {activePerson.name}</div>
          <MatchDetail
            meId={person.id}
            otherId={activePerson.id}
            match={active}
            shortlisted={shortlist.has(activePerson.id)}
            onShortlist={() => onShortlist(activePerson.id)}
            onFullExplanation={() => onFullExplanation(activePerson.id)}
          />
        </>
      )}
      </>
      )}
    </div>
  )
}
