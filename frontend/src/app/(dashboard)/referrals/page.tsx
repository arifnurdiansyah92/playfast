import type { Metadata } from 'next'

import ReferralsPage from '@/views/referrals/ReferralsPage'

export const metadata: Metadata = { title: 'Referral Saya - Playfast' }

export default function Page() {
  return <ReferralsPage />
}
