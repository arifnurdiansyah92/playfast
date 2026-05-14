import type { Metadata } from 'next'

import AdminRevenueSharingPage from '@/views/admin/AdminRevenueSharingPage'

export const metadata: Metadata = { title: 'Revenue Sharing - Playfast Admin' }

export default function Page() {
  return <AdminRevenueSharingPage />
}
