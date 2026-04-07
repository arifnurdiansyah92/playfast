import type { Metadata } from 'next'

import PrivacyPage from '@/views/PrivacyPage'

export const metadata: Metadata = {
  title: 'Kebijakan Privasi - Playfast',
  description: 'Kebijakan Privasi layanan Playfast.',
}

const PrivacyRoute = () => {
  return <PrivacyPage />
}

export default PrivacyRoute
