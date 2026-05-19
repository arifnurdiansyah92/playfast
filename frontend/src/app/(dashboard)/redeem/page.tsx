import type { Metadata } from 'next'

import RedeemPage from '@/views/redeem/RedeemPage'

export const metadata: Metadata = {
  title: 'Tukar Kode Redeem - Playfast',
  description: 'Tukar kode giveaway Playfast untuk akses langsung ke game atau subscription.',
}

export default function Page() {
  return <RedeemPage />
}
