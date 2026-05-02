import { NextRequest, NextResponse } from 'next/server'

// Marketing-friendly /discord URL. Fetches the current invite from the
// backend (admin-configurable in /admin/settings) and 302s the visitor
// to it. If unset, falls back to the homepage so the link is never broken.
export async function GET(request: NextRequest) {
  const apiUrl = process.env.INTERNAL_API_URL || 'http://localhost:5000'

  try {
    const res = await fetch(`${apiUrl}/api/store/site/discord-url`, { cache: 'no-store' })
    if (res.ok) {
      const data = (await res.json()) as { url?: string }
      const target = (data?.url || '').trim()
      if (target.startsWith('http://') || target.startsWith('https://')) {
        return NextResponse.redirect(target, 302)
      }
    }
  } catch {
    /* fall through to homepage */
  }

  return NextResponse.redirect(new URL('/', request.url), 302)
}

// Disable caching — the admin can change the invite URL any time.
export const dynamic = 'force-dynamic'
