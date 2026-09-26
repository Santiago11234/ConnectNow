// Redirects to the main workspace (explore is now the root)
import { redirect } from 'next/navigation'

export default function ExplorePage() {
  redirect('/')
}
