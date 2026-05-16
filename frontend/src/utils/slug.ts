export function toSlug(input: string): string {
  if (!input) return ''

  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')
}

export function gameSlug(appid: number, name: string | null | undefined): string {
  const tail = toSlug(name || '')

  return tail ? `${appid}-${tail}` : String(appid)
}

export function parseAppid(slug: string): number | null {
  const m = slug.match(/^(\d+)(?:-|$)/)

  if (!m) return null
  const n = parseInt(m[1], 10)

  return Number.isFinite(n) ? n : null
}
