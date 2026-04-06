import type { Metadata } from 'next'

import MyGamesPage from '@views/my-games/MyGamesPage'

export const metadata: Metadata = {
  title: 'My Games - SDA',
  description: 'View your purchased games'
}

export default function MyGamesRoute() {
  return <MyGamesPage />
}
