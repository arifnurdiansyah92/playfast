import type { Metadata } from 'next'

import AdminUserDetailPage from '@/views/admin/AdminUserDetailPage'

export const metadata: Metadata = { title: 'User Profile - Playfast Admin' }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  return <AdminUserDetailPage userId={Number(id)} />
}
