import type { Metadata } from 'next'

import AdminRefillPriorityPage from '@views/admin/AdminRefillPriorityPage'

export const metadata: Metadata = {
  title: 'Refill Priority - Playfast Admin',
  description: 'Prioritize Steam accounts to acquire by affected user count'
}

export default function AdminRefillPriorityRoute() {
  return <AdminRefillPriorityPage />
}
