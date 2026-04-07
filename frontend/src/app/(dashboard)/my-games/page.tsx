import type { Metadata } from 'next'

import MyGamesPage from '@views/my-games/MyGamesPage'

export const metadata: Metadata = {
  title: 'Game Saya - Playfast',
  description: 'View your purchased games'
}

export default function MyGamesRoute() {
  return <MyGamesPage />
}
