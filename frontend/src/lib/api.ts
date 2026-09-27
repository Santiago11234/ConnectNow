const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export interface Participant {
  id: string
  name: string
  school: string
  major: string
  year: string
  grad_year: number
  gpa_band?: string
  team_id?: string
  is_synthetic: boolean
  internships: { company: string; role: string; industry?: string; year: number }[]
  skills: string[]
  dev_groups: string[]
  hackathons: string[]
  involvement: string[]
  answers: Record<string, string>
  teammates: string[]
  friends: string[]
  interest_tags: string[]
}

export interface MatrixData {
  participants: { id: string; name: string }[]
  matrices: Record<string, number[][]>
  weights: Record<string, number>
}

export interface LayoutData {
  order: number[]
  coords: [number, number][]
  cluster_ids: number[]
  cluster_labels: Record<string, string>
  bridge_scores: number[]
  participants: { id: string; name: string; school: string; team_id?: string }[]
}

export interface ExplainData {
  participant_a: { id: string; name: string; school: string; major: string; year: string; interests: string }
  participant_b: { id: string; name: string; school: string; major: string; year: string; interests: string }
  composite_score: number
  feature_scores: Record<string, number>
  explanation: string
  icebreaker: string
  shared_facts: string[]
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, options)
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}

export const api = {
  health: () => apiFetch<{ status: string; participants: number }>('/health'),
  participants: () => apiFetch<Participant[]>('/participants'),
  matrix: () => apiFetch<MatrixData>('/matrix'),
  layout: () => apiFetch<LayoutData>('/layout'),
  recomputeLayout: (weights: Record<string, number>) =>
    apiFetch<LayoutData>('/layout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(weights),
    }),
  explain: (a: string, b: string) => apiFetch<ExplainData>(`/explain?a=${a}&b=${b}`),
  createParticipant: (data: Record<string, unknown>) =>
    apiFetch<Participant>('/participants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
}
