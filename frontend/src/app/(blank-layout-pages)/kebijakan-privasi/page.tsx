import type { Metadata } from 'next'

import PrivacyPage from '@/views/PrivacyPage'

export const metadata: Metadata = {
  title: 'Kebijakan Privasi',
  description:
    'Kebijakan privasi Playfast — bagaimana kami mengumpulkan, menyimpan, dan melindungi data pengguna sesuai standar Indonesia.',
  alternates: { canonical: '/kebijakan-privasi' },
  openGraph: {
    title: 'Kebijakan Privasi',
    description:
      'Kebijakan privasi Playfast — bagaimana kami mengumpulkan, menyimpan, dan melindungi data pengguna sesuai standar Indonesia.',
    url: 'https://playfast.id/kebijakan-privasi',
    type: 'website'
  },
  twitter: {
    title: 'Kebijakan Privasi',
    description:
      'Kebijakan privasi Playfast — bagaimana kami mengumpulkan, menyimpan, dan melindungi data pengguna sesuai standar Indonesia.'
  }
}

const PrivacyRoute = () => {
  return <PrivacyPage />
}

export default PrivacyRoute
