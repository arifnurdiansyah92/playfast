import type { Metadata } from 'next'

import ContactPage from '@/views/ContactPage'

export const metadata: Metadata = {
  title: 'Bantuan & FAQ Playfast',
  description:
    'Punya pertanyaan? Cek pusat bantuan Playfast — panduan cara main, troubleshooting Steam Guard, refund policy, dan kontak support.',
  alternates: { canonical: '/bantuan' },
  openGraph: {
    title: 'Bantuan & FAQ Playfast',
    description:
      'Punya pertanyaan? Cek pusat bantuan Playfast — panduan cara main, troubleshooting Steam Guard, refund policy, dan kontak support.',
    url: 'https://playfast.id/bantuan',
    type: 'website'
  },
  twitter: {
    title: 'Bantuan & FAQ Playfast',
    description:
      'Punya pertanyaan? Cek pusat bantuan Playfast — panduan cara main, troubleshooting Steam Guard, refund policy, dan kontak support.'
  }
}

const ContactRoute = () => {
  return <ContactPage />
}

export default ContactRoute
