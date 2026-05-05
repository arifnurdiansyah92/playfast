import type { Metadata } from 'next'

import AdminEmailBlastPage from '@/views/admin/AdminEmailBlastPage'

export const metadata: Metadata = { title: 'Email Blast - Playfast Admin' }

export default function Page() {
  return <AdminEmailBlastPage />
}
