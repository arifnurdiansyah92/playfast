import type { Metadata } from 'next'

import AdminGameRequestsPage from '@/views/admin/AdminGameRequestsPage'

export const metadata: Metadata = { title: 'Game Requests - Playfast Admin' }

export default function Page() {
  return <AdminGameRequestsPage />
}
