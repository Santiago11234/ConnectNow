// Stand-in for auth. "My people" is a private, per-user view, so it renders
// only for whoever is signed in - there is deliberately no person picker.
//
// TODO: replace with the real session once auth exists. Everything downstream
// reads the resolved index, so swapping this for a real lookup is the only
// change needed.
export const CURRENT_USER_ID = 'v001' // Victoria Liu

export function currentUserIndex(people: { id: string }[]): number {
  return people.findIndex(p => p.id === CURRENT_USER_ID)
}
