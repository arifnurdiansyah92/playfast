import type { Metadata } from 'next'

import AdminReviewsPage from '@/views/admin/AdminReviewsPage'

export const metadata: Metadata = { title: 'Reviews - Playfast Admin' }

export default function Page() {
  return <AdminReviewsPage />
}
