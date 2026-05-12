import type { Metadata } from 'next'

import SubscriptionConfirmPage from '@/views/SubscriptionConfirmPage'

export const metadata: Metadata = {
  // SubscriptionConfirmPage rewrites document.title with the plan label
  // client-side — this is the server-side fallback before hydration.
  title: 'Subscription',
}

export default async function Page(props: { params: Promise<{ subId: string }> }) {
  const { subId } = await props.params

  return <SubscriptionConfirmPage subId={subId} />
}
