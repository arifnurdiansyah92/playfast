import type { Metadata } from 'next'
import AdminRedeemPage from '@/views/admin/AdminRedeemPage'

export const metadata: Metadata = { title: 'Redeem Codes - Playfast Admin' }

export default function Page() {
  return <AdminRedeemPage />
}
