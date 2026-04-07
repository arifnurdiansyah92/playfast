import type { Metadata } from 'next'

import TermsPage from '@/views/TermsPage'

export const metadata: Metadata = {
  title: 'Syarat dan Ketentuan - Playfast',
  description: 'Syarat dan Ketentuan penggunaan layanan Playfast.',
}

const TermsRoute = () => {
  return <TermsPage />
}

export default TermsRoute
