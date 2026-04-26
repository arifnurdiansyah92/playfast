import type { Metadata } from 'next'

import AdminAccountFlagsPage from '@/views/admin/AdminAccountFlagsPage'

export const metadata: Metadata = { title: 'Account Flags - Playfast Admin' }

export default function Page() {
  return <AdminAccountFlagsPage />
}
