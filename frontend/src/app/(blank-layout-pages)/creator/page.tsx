import type { Metadata } from 'next'

import CreatorLandingPage from '@/views/CreatorLandingPage'

export const metadata: Metadata = {
  title: 'Jadi Playfast Creator — 10% Revenue Share',
  description:
    'Bantu audience kamu akses game AAA original mulai Rp 50 ribu. Dapat promo code personal, 10% revenue share, lifetime attribution. Apply gratis.',
}

const CreatorRoute = () => {
  return <CreatorLandingPage />
}

export default CreatorRoute
