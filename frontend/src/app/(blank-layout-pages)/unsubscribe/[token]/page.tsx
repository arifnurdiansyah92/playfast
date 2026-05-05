import type { Metadata } from 'next'

import UnsubscribePage from '@views/UnsubscribePage'

export const metadata: Metadata = {
  title: 'Berhenti Berlangganan - Playfast',
}

interface Props {
  params: Promise<{ token: string }>
}

export default async function Page(props: Props) {
  const { token } = await props.params

  return <UnsubscribePage token={token} />
}
