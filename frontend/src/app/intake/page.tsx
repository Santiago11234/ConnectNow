'use client'
import { useState } from 'react'
import { api } from '@/lib/api'

const YEARS = ['Freshman', 'Sophomore', 'Junior', 'Senior', "Master's", 'PhD']

const QUESTIONS = [
  'What topics or technologies are you most excited about?',
  'What do you want to build this weekend?',
  "What's your favorite tool or technology, and why?",
  'Tell us a fun fact about yourself.',
]

interface FormState {
  name: string
  email: string
  school: string
  major: string
  year: string
  grad_year: number
  answers: Record<string, string>
  skills_raw: string
  consent: boolean
}

export default function IntakePage() {
  const [form, setForm] = useState<FormState>({
    name: '', email: '', school: '', major: '', year: 'Junior', grad_year: 2027,
    answers: Object.fromEntries(QUESTIONS.map(q => [q, ''])),
    skills_raw: '',
    consent: false,
  })
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!form.consent) { setError('Check the consent box to continue.'); return }
    if (!form.name || !form.school || !form.major) { setError('Name, school, and major are required.'); return }
    try {
      await api.createParticipant({
        name: form.name,
        email: form.email || undefined,
        school: form.school,
        major: form.major,
        year: form.year,
        grad_year: form.grad_year,
        answers: form.answers,
        skills: form.skills_raw.split(',').map(s => s.trim()).filter(Boolean),
        internships: [],
        friends: [],
        consent: true,
      })
      setSubmitted(true)
    } catch (e) {
      setError(String(e))
    }
  }

  const field = (label: string, required: boolean, el: React.ReactNode) => (
    <div style={{ marginBottom: 12 }}>
      <label className="cn-label">{label}{required && <span style={{ color: 'var(--danger)', marginLeft: 2 }}>*</span>}</label>
      {el}
    </div>
  )

  if (submitted) {
    return (
      <div className="workspace-body">
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text)' }}>Profile submitted</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Go to{' '}
            <a href="/" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
              Find my people
            </a>{' '}
            to see your matches.
          </div>
        </div>
        <div className="status-bar"><span>intake complete</span></div>
      </div>
    )
  }

  return (
    <>
      <div className="workspace-body">
        <div className="center-pane">
          <div className="tab-bar">
            <span className="tab-item active">Join</span>
          </div>
          <div className="pane-content" style={{ overflow: 'auto' }}>
            <div style={{ maxWidth: 480, padding: '16px 24px' }}>
              <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 16 }}>
                Your answers help surface the best connections for you. All data is opt-in and used only for this event.
              </p>

              {field('Name', true,
                <input className="cn-input" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} />
              )}
              {field('Email (optional, never shown publicly)', false,
                <input className="cn-input" type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} />
              )}
              {field('School', true,
                <input className="cn-input" value={form.school} onChange={e => setForm(f => ({...f, school: e.target.value}))} />
              )}
              {field('Major', true,
                <input className="cn-input" value={form.major} onChange={e => setForm(f => ({...f, major: e.target.value}))} />
              )}
              {field('Year', false,
                <select
                  value={form.year}
                  onChange={e => setForm(f => ({...f, year: e.target.value}))}
                  className="cn-input"
                  style={{ cursor: 'pointer' }}
                >
                  {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              )}
              {field('Skills (comma-separated)', false,
                <input className="cn-input" value={form.skills_raw} onChange={e => setForm(f => ({...f, skills_raw: e.target.value}))} placeholder="Python, React, C++" />
              )}

              <div className="divider" />

              {QUESTIONS.map(question => (
                <div key={question} style={{ marginBottom: 12 }}>
                  <label className="cn-label">{question}</label>
                  <textarea
                    value={form.answers[question] ?? ''}
                    onChange={e => setForm(f => ({...f, answers: {...f.answers, [question]: e.target.value}}))}
                    rows={3}
                    className="cn-textarea"
                  />
                </div>
              ))}

              <div className="divider" />

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', marginBottom: 12 }}>
                <input
                  type="checkbox"
                  checked={form.consent}
                  onChange={e => setForm(f => ({...f, consent: e.target.checked}))}
                  style={{ marginTop: 2, accentColor: 'var(--accent)' }}
                />
                <span style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  I consent to my profile being used to compute similarity scores and surface connections within ConnectNow. My data is only used for this event and will not be shared externally.
                </span>
              </label>

              {error && (
                <div style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 8 }}>{error}</div>
              )}

              <button className="cn-btn primary" style={{ width: '100%' }} onClick={submit}>
                Submit profile
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="status-bar"><span>intake form</span></div>
    </>
  )
}
