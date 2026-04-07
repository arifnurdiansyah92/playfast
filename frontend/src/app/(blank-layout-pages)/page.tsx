import type { Metadata } from 'next'

import LandingPage from '@/views/LandingPage'

export const metadata: Metadata = {
  title: 'Playfast - Akses Game Steam Instan',
  description: 'Akses ribuan game Steam secara instan. Kode Steam Guard otomatis.'
}

export default function Home() {
  return <LandingPage />
}
