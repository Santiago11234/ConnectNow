// Intros the signed-in user has sent. Demo-scale persistence: this lives in
// the browser only, so it survives a refresh but reaches nobody. Moving it to
// the backend means a `connections` table and a POST /connect - deliberately
// not done yet, since nothing here should imply a message was really
// delivered to another person.
//
// Exposed as an external store rather than state-loaded-in-an-effect:
// localStorage is not available during SSR, so reading it in an initializer
// would desync hydration, and reading it in an effect is a cascading render.

import { CURRENT_USER_ID } from './session'

export interface Intro {
  toId: string
  toName: string
  message: string
  sentAt: string
}

export type IntroMap = Record<string, Intro>

const KEY = `connectnow:intros:${CURRENT_USER_ID}`
const EMPTY: IntroMap = {}

let cache: IntroMap | null = null
const listeners = new Set<() => void>()

function read(): IntroMap {
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as IntroMap) : EMPTY
  } catch {
    // Private windows and blocked site data both throw here.
    return EMPTY
  }
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** Must return a stable reference between calls or React re-renders forever. */
export function getSnapshot(): IntroMap {
  if (cache === null) cache = read()
  return cache
}

export function getServerSnapshot(): IntroMap {
  return EMPTY
}

export function saveIntro(intro: Intro): void {
  const next = { ...getSnapshot(), [intro.toId]: intro }
  cache = next
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Keep the in-memory value so the UI still updates this session.
  }
  listeners.forEach(fn => fn())
}

/** Opening line for the composer. Built from facts already on screen - the
 *  LLM icebreaker when we have one, the shared evidence otherwise. */
export function draftMessage(
  myName: string,
  theirName: string,
  evidence: string[],
  icebreaker?: string,
): string {
  const first = theirName.split(' ')[0] ?? theirName
  const common = evidence.length ? ` I saw we both have ${evidence.slice(0, 2).join(' and ')}.` : ''
  const ask = icebreaker ? ` ${icebreaker}` : ' Want to find each other at the venue?'
  return `Hi ${first} - I'm ${myName}.${common}${ask}`
}
