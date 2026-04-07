import type { Metadata } from 'next'

import LandingPage from '@/views/LandingPage'

export const metadata: Metadata = {
  title: 'Playfast - Instant Steam Game Access',
  description: 'Get instant access to thousands of Steam games. Pay once, play forever. Instant Steam Guard codes.'
}

export default function Home() {
  return <LandingPage />
}
