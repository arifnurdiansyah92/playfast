import type { Metadata } from 'next'

import RequestGamePage from '@/views/RequestGamePage'

export const metadata: Metadata = { title: 'Request Game - Playfast' }

export default function Page() {
  return <RequestGamePage />
}
