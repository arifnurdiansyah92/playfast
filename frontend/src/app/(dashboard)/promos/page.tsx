import type { Metadata } from 'next'

import PromosPage from '@/views/promos/PromosPage'

export const metadata: Metadata = { title: 'Promo Saya - Playfast' }

export default function Page() {
  return <PromosPage />
}
