import type { Metadata } from 'next'

import SubscribePage from '@views/SubscribePage'

export const metadata: Metadata = {
  title: 'Subscribe - Playfast Premium',
  description: 'Subscribe to Playfast Premium for unlimited access to all games.',
}

export default function SubscribeRoute() {
  return <SubscribePage />
}
