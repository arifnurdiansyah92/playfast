import type { Metadata } from 'next'

import GameDetailPage from '@views/game/GameDetailPage'

interface Props {
  params: Promise<{ appid: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { appid } = await params
  const apiUrl = process.env.INTERNAL_API_URL || 'http://localhost:5000'

  try {
    const res = await fetch(`${apiUrl}/api/store/games/${appid}`, { next: { revalidate: 3600 } })

    if (!res.ok) throw new Error('Not found')

    const { game } = await res.json()
    const title = `${game.name} - Playfast`
    const description = game.description || `Dapatkan akses ${game.name} di Playfast. Kode Steam Guard otomatis, akses selamanya.`
    const image = `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/header.jpg`

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        images: [{ url: image, width: 460, height: 215 }],
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [image],
      },
    }
  } catch {
    return {
      title: 'Detail Game - Playfast',
      description: 'Lihat detail game di Playfast',
    }
  }
}

export default async function GameDetailRoute(props: Props) {
  const params = await props.params

  return <GameDetailPage appid={params.appid} />
}
