import { redirect } from 'next/navigation'
import type { Metadata } from 'next'

import GameDetailPage from '@views/game/GameDetailPage'
import { gameSlug, parseAppid } from '@/utils/slug'

interface Props {
  params: Promise<{ slug: string }>
}

const formatRp = (n: number) => `Rp ${n.toLocaleString('id-ID')}`

async function fetchGame(appid: number) {
  const apiUrl = process.env.INTERNAL_API_URL || 'http://localhost:5000'

  try {
    const res = await fetch(`${apiUrl}/api/store/games/${appid}`, { next: { revalidate: 3600 } })

    if (!res.ok) return null
    const data = await res.json()

    return data?.game ?? null
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const appid = parseAppid(slug)

  if (!appid) return { title: 'Detail Game', description: 'Lihat detail game di Playfast' }

  const game = await fetchGame(appid)

  if (!game) return { title: 'Detail Game', description: 'Lihat detail game di Playfast' }

  const canonicalSlug = gameSlug(appid, game.name)
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
    alternates: { canonical: `/game/${canonicalSlug}` },
    openGraph: {
      title,
      description,
      url: `https://playfast.id/game/${canonicalSlug}`,
      images: [{ url: image, width: 460, height: 215 }],
      type: 'website'
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image]
    }
  }
}

export default async function GameDetailRoute(props: Props) {
  const { slug } = await props.params
  const appid = parseAppid(slug)

  if (!appid) redirect('/katalog')

  const game = await fetchGame(appid)

  if (!game) redirect('/katalog')

  const canonical = gameSlug(appid, game.name)

  if (slug !== canonical) redirect(`/game/${canonical}`)

  const payload = {
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: game.name,
    image: game.header_image || `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/header.jpg`,
    url: `https://playfast.id/game/${canonical}`,
    ...(game.description && { description: game.description }),
    ...(game.genres && {
      genre: String(game.genres)
        .split(',')
        .map((g: string) => g.trim())
        .filter(Boolean)
    }),
    offers: {
      '@type': 'Offer',
      priceCurrency: 'IDR',
      price: game.price,
      availability: 'https://schema.org/InStock',
      url: `https://playfast.id/game/${canonical}`
    }
  }

  return (
    <>
      <script type='application/ld+json' dangerouslySetInnerHTML={{ __html: JSON.stringify(payload) }} />
      <GameDetailPage appid={String(appid)} />
    </>
  )
}
