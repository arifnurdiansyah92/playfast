import type { Metadata } from 'next'

import GameDetailPage from '@views/game/GameDetailPage'

interface Props {
  params: Promise<{ appid: string }>
}

const formatRp = (n: number) => `Rp ${n.toLocaleString('id-ID')}`

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { appid } = await params
  const apiUrl = process.env.INTERNAL_API_URL || 'http://localhost:5000'

  try {
    const res = await fetch(`${apiUrl}/api/store/games/${appid}`, { next: { revalidate: 3600 } })

    if (!res.ok) throw new Error('Not found')

    const { game } = await res.json()
    const priceText = game.price > 0 ? ` — ${formatRp(game.price)}` : ''
    const title = `Main ${game.name} di Steam${priceText}`

    const baseDescription = `Main ${game.name} di Steam dengan akses instan via Playfast. Kode Steam Guard otomatis, login langsung tanpa nunggu seller.${game.price > 0 ? ` Mulai ${formatRp(game.price)}.` : ''}`

    const description =
      game.description && game.description.length > baseDescription.length
        ? game.description.slice(0, 160)
        : baseDescription

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
      title: 'Detail Game',
      description: 'Lihat detail game di Playfast',
    }
  }
}

export default async function GameDetailRoute(props: Props) {
  const { appid } = await props.params
  const apiUrl = process.env.INTERNAL_API_URL || 'http://localhost:5000'

  let ldJson: string | null = null

  try {
    const res = await fetch(`${apiUrl}/api/store/games/${appid}`, { next: { revalidate: 3600 } })

    if (res.ok) {
      const { game } = await res.json()

      const payload = {
        '@context': 'https://schema.org',
        '@type': 'VideoGame',
        name: game.name,
        image: game.header_image || `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/header.jpg`,
        url: `https://playfast.id/game/${game.appid}`,
        ...(game.description && { description: game.description }),
        ...(game.genres && {
          genre: String(game.genres)
            .split(',')
            .map((g: string) => g.trim())
            .filter(Boolean),
        }),
        offers: {
          '@type': 'Offer',
          priceCurrency: 'IDR',
          price: game.price,
          availability: 'https://schema.org/InStock',
          url: `https://playfast.id/game/${game.appid}`,
        },
      }

      ldJson = JSON.stringify(payload)
    }
  } catch {
    /* graceful — skip JSON-LD on fetch failure */
  }

  return (
    <>
      {ldJson && <script type='application/ld+json' dangerouslySetInnerHTML={{ __html: ldJson }} />}
      <GameDetailPage appid={appid} />
    </>
  )
}
