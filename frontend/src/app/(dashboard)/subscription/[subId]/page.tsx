import type { Metadata } from 'next'

import SubscriptionConfirmPage from '@/views/SubscriptionConfirmPage'

export const metadata: Metadata = {
  title: 'Subscription - Playfast',
}

export default async function Page(props: { params: Promise<{ subId: string }> }) {
  const { subId } = await props.params

  return <SubscriptionConfirmPage subId={subId} />
}
