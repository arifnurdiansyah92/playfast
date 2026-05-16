import type { MetadataRoute } from 'next'

import { gameSlug } from '@/utils/slug'

const BASE = 'https://playfast.id'

const STATIC_PATHS = [
  '',
  '/katalog',
  '/reviews',
  '/bantuan',
  '/creator',
  '/syarat-ketentuan',
  '/kebijakan-privasi'
] as const

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map(p => ({
    url: `${BASE}${p}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: p === '' ? 1 : 0.7
  }))

  try {
    const apiUrl = process.env.INTERNAL_API_URL || 'http://localhost:5000'
    const res = await fetch(`${apiUrl}/api/store/games/catalog`, { next: { revalidate: 3600 } })

    if (!res.ok) return staticEntries

    const { games } = (await res.json()) as { games: { appid: number; name: string; release_date: string | null }[] }

    const gameEntries: MetadataRoute.Sitemap = games.flatMap(g => {
      const slug = gameSlug(g.appid, g.name)
      const lastMod = g.release_date ? new Date(g.release_date) : now

      return [
        {
          url: `${BASE}/game/${slug}`,
          lastModified: lastMod,
          changeFrequency: 'weekly' as const,
          priority: 0.6
        },
        {
          url: `${BASE}/cara-main/${slug}`,
          lastModified: lastMod,
          changeFrequency: 'weekly' as const,
          priority: 0.7
        }
      ]
    })

    return [...staticEntries, ...gameEntries]
  } catch {
    return staticEntries
  }
}
