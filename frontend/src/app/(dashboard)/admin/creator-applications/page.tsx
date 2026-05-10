import type { Metadata } from 'next'

import AdminCreatorApplicationsPage from '@/views/admin/AdminCreatorApplicationsPage'

export const metadata: Metadata = { title: 'Creator Applications - Playfast Admin' }

export default function Page() {
  return <AdminCreatorApplicationsPage />
}
