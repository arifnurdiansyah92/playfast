'use client'

import { useEffect } from 'react'

import { useAuth } from '@/contexts/AuthContext'

declare global {
  interface Window {
    Tawk_API?: any
    Tawk_LoadStart?: Date
  }
}

/**
 * Push the signed-in user's identity into the Tawk.to widget so the
 * pre-chat form is pre-filled (and effectively skipped). Anonymous
 * visitors still get the pre-chat form configured in the dashboard.
 *
 * Note: identity is currently unsigned — anyone could spoof someone
 * else's email from devtools. Add HMAC via `Tawk_API.visitor.hash` if
 * we ever need verified identities on the operator side.
 */
export default function TawkIdentity() {
  const { user } = useAuth()

  useEffect(() => {
    if (typeof window === 'undefined' || !user) return

    const name = user.email.split('@')[0] || user.email
    const attrs = { name, email: user.email }

    window.Tawk_API = window.Tawk_API || {}

    // Pre-fill so the widget consumes it on its next chat start — covers
    // the case where the widget hasn't booted yet.
    window.Tawk_API.visitor = attrs

    const push = () => {
      try {
        window.Tawk_API.setAttributes?.(attrs, () => {})
      } catch {
        /* Tawk errors must never break the app. */
      }
    }

    if (typeof window.Tawk_API.setAttributes === 'function') {
      push()
    } else {
      // Chain onLoad so we don't clobber a callback from another script.
      const prevOnLoad = window.Tawk_API.onLoad

      window.Tawk_API.onLoad = function () {
        if (typeof prevOnLoad === 'function') prevOnLoad()
        push()
      }
    }
  }, [user])

  return null
}
