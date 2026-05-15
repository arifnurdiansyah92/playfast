import type { Metadata } from 'next'

import AdminEmailLogsPage from '@/views/admin/AdminEmailLogsPage'

export const metadata: Metadata = { title: 'Email Logs - Playfast Admin' }

export default function Page() {
  return <AdminEmailLogsPage />
}
