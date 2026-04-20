import type { Metadata } from 'next'
import AdminReferralsPage from '@/views/admin/AdminReferralsPage'

export const metadata: Metadata = { title: 'Referrals - Playfast Admin' }

export default function Page() { return <AdminReferralsPage /> }
