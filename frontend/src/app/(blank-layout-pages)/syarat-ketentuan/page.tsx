import type { Metadata } from 'next'

import TermsPage from '@/views/TermsPage'

export const metadata: Metadata = {
  title: 'Syarat dan Ketentuan Layanan',
  description:
    'Syarat dan ketentuan penggunaan layanan Playfast — game-sharing platform Steam untuk pengguna di Indonesia.',
  alternates: { canonical: '/syarat-ketentuan' },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Syarat dan Ketentuan Layanan',
    description:
      'Syarat dan ketentuan penggunaan layanan Playfast — game-sharing platform Steam untuk pengguna di Indonesia.',
    url: 'https://playfast.id/syarat-ketentuan',
    type: 'website'
  },
  twitter: {
    title: 'Syarat dan Ketentuan Layanan',
    description:
      'Syarat dan ketentuan penggunaan layanan Playfast — game-sharing platform Steam untuk pengguna di Indonesia.'
  }
}

const TermsRoute = () => {
  return <TermsPage />
}

export default TermsRoute
