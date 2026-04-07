import type { Metadata } from 'next'

import ContactPage from '@/views/ContactPage'

export const metadata: Metadata = {
  title: 'Bantuan - Playfast',
  description: 'Pusat bantuan dan FAQ Playfast.',
}

const ContactRoute = () => {
  return <ContactPage />
}

export default ContactRoute
