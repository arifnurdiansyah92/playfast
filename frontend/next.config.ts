import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  basePath: process.env.BASEPATH,
  redirects: async () => {
    return []
  },
  async rewrites() {
    const apiUrl = process.env.INTERNAL_API_URL || 'http://localhost:5000'

    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`
      }
    ]
  }
}

export default nextConfig
