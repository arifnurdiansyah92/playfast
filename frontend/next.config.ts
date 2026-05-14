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
      },
      {
        // Tripay calls this exact URL — proxy to the Flask handler so the
        // signed POST body reaches backend untouched.
        source: '/callback/tripay',
        destination: `${apiUrl}/api/store/callback/tripay`
      },
      {
        // User-uploaded files (review photos, etc.) live on the backend
        // disk; without this rewrite images render as 404 in the browser.
        source: '/uploads/:path*',
        destination: `${apiUrl}/uploads/:path*`
      }
    ]
  }
}

export default nextConfig
