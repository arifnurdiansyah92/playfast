import type { Metadata } from 'next'

import GameDetailPage from '@views/game/GameDetailPage'

export const metadata: Metadata = {
  title: 'Game Detail - Playfast',
  description: 'View game details'
}

export default async function GameDetailRoute(props: { params: Promise<{ appid: string }> }) {
  const params = await props.params

  return <GameDetailPage appid={params.appid} />
}
