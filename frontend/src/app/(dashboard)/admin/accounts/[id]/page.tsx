import type { Metadata } from 'next'

import AdminAccountDetailPage from '@/views/admin/AdminAccountDetailPage'

export const metadata: Metadata = {
  title: 'Account Actions - Playfast Admin'
}

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params

  return <AdminAccountDetailPage accountId={id} />
}
