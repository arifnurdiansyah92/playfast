import type { Metadata } from 'next'

import PlayPage from '@views/play/PlayPage'

export const metadata: Metadata = {
  title: 'Play - Playfast',
  description: 'Access your game credentials'
}

export default async function PlayRoute(props: { params: Promise<{ orderId: string }> }) {
  const params = await props.params

  return <PlayPage orderId={params.orderId} />
}
