import type { Metadata } from 'next'

import CreatorLandingPage from '@/views/CreatorLandingPage'

export const metadata: Metadata = {
  title: 'Playfast Creator Program — Affiliate untuk Konten Kreator',
  description:
    'Gabung program affiliate Playfast. Dapatkan 20% komisi dari setiap pembelian via link kamu. Cocok untuk gaming creator dan reviewer Indonesia.',
  alternates: { canonical: '/creator' },
  openGraph: {
    title: 'Playfast Creator Program — Affiliate untuk Konten Kreator',
    description:
      'Gabung program affiliate Playfast. Dapatkan 20% komisi dari setiap pembelian via link kamu. Cocok untuk gaming creator dan reviewer Indonesia.',
    url: 'https://playfast.id/creator',
    type: 'website'
  },
  twitter: {
    title: 'Playfast Creator Program — Affiliate untuk Konten Kreator',
    description:
      'Gabung program affiliate Playfast. Dapatkan 20% komisi dari setiap pembelian via link kamu. Cocok untuk gaming creator dan reviewer Indonesia.'
  }
}

const CreatorRoute = () => {
  return <CreatorLandingPage />
}

export default CreatorRoute
