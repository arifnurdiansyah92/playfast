import type { Metadata } from 'next'

import AdminSettingsPage from '@/views/admin/AdminSettingsPage'

export const metadata: Metadata = {
  title: 'Settings - Playfast Admin'
}

export default function Page() {
  return <AdminSettingsPage />
}
