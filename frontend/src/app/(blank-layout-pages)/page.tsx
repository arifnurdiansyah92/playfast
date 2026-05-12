import type { Metadata } from 'next'

import LandingPage from '@/views/LandingPage'

export const metadata: Metadata = {
  title: 'Akses Game Steam Instan — Mulai Rp 50K',
  description:
    'Akses 300+ game Steam dengan harga mulai Rp 50K. Kode Steam Guard otomatis 24/7 — login langsung, no nunggu seller. Coba Premium hari ini.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Akses Game Steam Instan — Mulai Rp 50K',
    description:
      'Akses 300+ game Steam dengan harga mulai Rp 50K. Kode Steam Guard otomatis 24/7 — login langsung, no nunggu seller. Coba Premium hari ini.',
    url: 'https://playfast.id',
    type: 'website'
  },
  twitter: {
    title: 'Akses Game Steam Instan — Mulai Rp 50K',
    description:
      'Akses 300+ game Steam dengan harga mulai Rp 50K. Kode Steam Guard otomatis 24/7 — login langsung, no nunggu seller. Coba Premium hari ini.'
  }
}

export default function Home() {
  return <LandingPage />
}
