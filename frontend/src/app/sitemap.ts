import type { MetadataRoute } from 'next'

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

    const { games } = (await res.json()) as { games: { appid: number }[] }

    return [
      ...staticEntries,
      ...games.map(g => ({
        url: `${BASE}/game/${g.appid}`,
        lastModified: now,
        changeFrequency: 'weekly' as const,
        priority: 0.6
      }))
    ]
  } catch {
    return staticEntries
  }
}
