'use client'

import { useQuery } from '@tanstack/react-query'

import { storeApi } from '@/lib/api'

// Hard fallback used until /api/store/payment-config responds, or if the call
// fails. Mirrors SiteSetting.DEFAULTS["manual_whatsapp_number"] in the backend
// so the link still works when the admin hasn't customised the number.
export const WHATSAPP_FALLBACK = '6282240708329'

/**
 * Returns the admin-configured WhatsApp number (digits only, no '+'), with a
 * stable fallback so callers can use the value unconditionally:
 *
 *     const wa = useWhatsappNumber()
 *     <a href={`https://wa.me/${wa}`}>Chat</a>
 *
 * Cached across pages by react-query so we only hit the API once per session.
 */
export function useWhatsappNumber(): string {
  const { data } = useQuery({
    queryKey: ['payment-config'],
    queryFn: () => storeApi.getPaymentConfig(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const raw = data?.whatsapp_number?.replace(/\D/g, '')

  return raw && raw.length > 0 ? raw : WHATSAPP_FALLBACK
}

/**
 * Human-readable format for an Indonesian WhatsApp number:
 *   "6282240708329" -> "+62 822-4070-8329"
 * Falls back to "+<digits>" for non-Indonesian numbers.
 */
export function formatWhatsappDisplay(digits: string): string {
  const d = (digits || '').replace(/\D/g, '')

  if (!d) return ''
  if (!d.startsWith('62')) return `+${d}`
  const rest = d.slice(2)

  if (rest.length >= 7) {
    return `+62 ${rest.slice(0, 3)}-${rest.slice(3, 7)}-${rest.slice(7)}`
  }

  return `+62 ${rest}`
}
