import type { Metadata } from 'next'

import PlayPage from '@views/play/PlayPage'

export const metadata: Metadata = {
  // Server-side fallback. PlayPage updates document.title to "Main <game name>"
  // once the order's game data loads client-side — better tracking signal
  // than a static title.
  title: 'Main',
  description: 'Kredensial Steam dan kode Steam Guard untuk game kamu.'
}

export default async function PlayRoute(props: { params: Promise<{ orderId: string }> }) {
  const params = await props.params

  return <PlayPage orderId={params.orderId} />
}
