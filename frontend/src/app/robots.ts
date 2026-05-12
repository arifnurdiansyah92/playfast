import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin/',
          '/api/',
          '/play/',
          '/orders',
          '/order/',
          '/profile',
          '/my-games',
          '/subscription/',
          '/subscribe',
          '/promos',
          '/referrals',
          '/request-game'
        ]
      }
    ],
    sitemap: 'https://playfast.id/sitemap.xml'
  }
}
