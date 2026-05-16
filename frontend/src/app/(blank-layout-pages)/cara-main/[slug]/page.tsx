import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Container from '@mui/material/Container'
import Divider from '@mui/material/Divider'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'

import { gameSlug, parseAppid } from '@/utils/slug'

interface Props {
  params: Promise<{ slug: string }>
}

interface Game {
  appid: number
  name: string
  description: string | null
  header_image: string | null
  genres: string | null
  price: number
  original_price: number | null
  release_date: string | null
}

const BASE = 'https://playfast.id'
const PLAY_GUIDE_BASE = '/cara-main'

const formatRp = (n: number) => `Rp ${n.toLocaleString('id-ID')}`

async function fetchGame(appid: number): Promise<Game | null> {
  const apiUrl = process.env.INTERNAL_API_URL || 'http://localhost:5000'

  try {
    const res = await fetch(`${apiUrl}/api/store/games/${appid}`, { next: { revalidate: 3600 } })

    if (!res.ok) return null
    const data = await res.json()

    return data?.game ?? null
  } catch {
    return null
  }
}

async function fetchCatalog(): Promise<Game[]> {
  const apiUrl = process.env.INTERNAL_API_URL || 'http://localhost:5000'

  try {
    const res = await fetch(`${apiUrl}/api/store/games/catalog`, { next: { revalidate: 3600 } })

    if (!res.ok) return []
    const data = await res.json()

    return (data?.games ?? []) as Game[]
  } catch {
    return []
  }
}

function primaryGenre(genres: string | null): string {
  if (!genres) return 'game'
  const first = genres.split(',')[0]?.trim()

  return first || 'game'
}

function isSingleplayerGenre(genres: string | null): boolean {
  if (!genres) return false
  const lower = genres.toLowerCase()

  return /\b(rpg|adventure|strategy|simulation|indie|casual|puzzle)\b/.test(lower)
}

function isMmoGenre(genres: string | null): boolean {
  if (!genres) return false

  return /massively multiplayer|\bmmo\b/i.test(genres)
}

function hasMultiplayer(genres: string | null): boolean {
  if (!genres) return false

  return /multiplayer/i.test(genres) || isMmoGenre(genres)
}

function compatibilityCopy(g: Game): string {
  const name = g.name
  const genre = primaryGenre(g.genres)

  if (isMmoGenre(g.genres)) {
    return `${name} adalah game MMO/online. Karena Playfast butuh akses Steam dalam offline mode (akun digunakan bersama), game online seperti ini kemungkinan besar tidak bisa dimainkan via Playfast. Cek katalog kami untuk alternatif single-player di genre yang sama.`
  }

  if (hasMultiplayer(g.genres) && !isSingleplayerGenre(g.genres)) {
    return `${name} punya komponen multiplayer online. Di Playfast, kamu bisa main story/campaign-nya di offline mode — fitur multiplayer online tidak tersedia karena akun digunakan bersama. Cocok kalau kamu fokus pengalaman solo.`
  }

  if (isSingleplayerGenre(g.genres)) {
    return `${name} adalah game ${genre.toLowerCase()} yang dirancang untuk dimainkan solo. Sangat cocok dengan Playfast — semua progress story tersimpan di akun Steam dan bisa kamu mainkan kapan saja di offline mode tanpa konflik dengan pengguna lain.`
  }

  return `${name} bisa dimainkan via Playfast di offline mode. Cocok untuk pengalaman single-player tanpa gangguan, semua progress tersimpan di Steam Cloud.`
}

function computeSavings(g: Game) {
  if (!g.original_price || g.original_price <= 0 || g.original_price <= g.price) {
    return { savings: 0, pct: 0, hasSavings: false }
  }

  const savings = g.original_price - g.price
  const pct = Math.round((savings / g.original_price) * 100)

  return { savings, pct, hasSavings: true }
}

function genreList(genres: string | null): string[] {
  if (!genres) return []

  return genres
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

function relatedGames(all: Game[], current: Game, limit = 4): Game[] {
  const currentGenres = new Set(genreList(current.genres).map(g => g.toLowerCase()))

  if (currentGenres.size === 0) {
    return all.filter(g => g.appid !== current.appid).slice(0, limit)
  }

  const scored = all
    .filter(g => g.appid !== current.appid)
    .map(g => {
      const overlap = genreList(g.genres).filter(x => currentGenres.has(x.toLowerCase())).length

      return { g, overlap }
    })
    .filter(x => x.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)

  return scored.slice(0, limit).map(s => s.g)
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const appid = parseAppid(slug)

  if (!appid) return { title: 'Cara Main Game Steam Murah', description: 'Panduan main game Steam murah di Indonesia via Playfast.' }

  const game = await fetchGame(appid)

  if (!game) return { title: 'Cara Main Game Steam Murah', description: 'Panduan main game Steam murah di Indonesia via Playfast.' }

  const canonical = gameSlug(appid, game.name)
  const priceLine = game.price > 0 ? ` — Mulai ${formatRp(game.price)}` : ''
  const title = `Cara Main ${game.name} Murah di Indonesia${priceLine}`

  const description = `Panduan main ${game.name} di Steam dengan harga murah lewat Playfast. Akses dari ${formatRp(game.price)}, kode Steam Guard otomatis, login langsung tanpa nunggu seller.`

  const image = game.header_image || `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/header.jpg`

  return {
    title,
    description,
    alternates: { canonical: `${PLAY_GUIDE_BASE}/${canonical}` },
    openGraph: {
      title,
      description,
      url: `${BASE}${PLAY_GUIDE_BASE}/${canonical}`,
      type: 'article',
      images: [{ url: image, width: 460, height: 215 }]
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image]
    }
  }
}

const gold = '#c9a84c'
const goldLight = '#dfc06a'
const dark = '#0d0f14'
const darkCard = 'rgba(255,255,255,0.03)'
const darkCardBorder = 'rgba(255,255,255,0.08)'
const textPrimary = '#f0f3f6'
const textSecondary = '#8b95a3'

export default async function CaraMainPage(props: Props) {
  const { slug } = await props.params
  const appid = parseAppid(slug)

  if (!appid) notFound()

  const [game, catalog] = await Promise.all([fetchGame(appid), fetchCatalog()])

  if (!game) notFound()

  const canonical = gameSlug(appid, game.name)
  const buyHref = `/game/${canonical}`
  const { savings, pct, hasSavings } = computeSavings(game)
  const genres = genreList(game.genres)
  const related = relatedGames(catalog, game)
  const releaseYear = game.release_date ? new Date(game.release_date).getFullYear() : null
  const compat = compatibilityCopy(game)
  const headerImage = game.header_image || `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/header.jpg`

  const aboveFold = hasSavings
    ? `Main ${game.name} di Steam tanpa beli akun lewat Playfast — akses dari ${formatRp(game.price)} (${pct}% lebih murah dari harga Steam ${formatRp(game.original_price as number)}). Kode Steam Guard otomatis 24/7, login langsung tanpa nunggu seller.`
    : `Main ${game.name} di Steam lewat Playfast — akses dari ${formatRp(game.price)}. Kode Steam Guard otomatis 24/7, login langsung tanpa nunggu seller.`

  const steps = [
    { name: `Cari ${game.name} di katalog Playfast`, text: `Buka /katalog Playfast atau ketik nama game di kolom pencarian, lalu pilih ${game.name}.` },
    { name: 'Beli satuan atau subscribe Premium', text: `Beli akses ${game.name} satu kali (lifetime access) atau aktifkan Playfast Premium mulai Rp 50.000/bulan untuk akses semua game di katalog.` },
    { name: 'Terima kredensial akun secara instan', text: 'Setelah pembayaran dikonfirmasi, kamu akan menerima username, password, dan kode Steam Guard otomatis di akun Playfast kamu.' },
    { name: `Login Steam → download → offline mode → main ${game.name}`, text: 'Login ke Steam dengan kredensial yang diberikan, download game-nya, masuk Steam → Go Offline, dan langsung main tanpa gangguan.' }
  ]

  const baseFaqs: { q: string; a: string }[] = [
    {
      q: `Apakah saya beli akun Steam ${game.name} atau hanya akses?`,
      a: `Kamu beli akses ke akun Steam yang sudah memiliki ${game.name}. Akun digunakan bersama dengan pengguna Playfast lainnya, dan dimainkan dalam offline mode supaya progress kamu tetap aman.`
    },
    {
      q: `Berapa harga main ${game.name} via Playfast?`,
      a: hasSavings
        ? `Harga akses ${game.name} di Playfast mulai ${formatRp(game.price)} (lifetime). Harga Steam Indonesia sekitar ${formatRp(game.original_price as number)}, jadi kamu hemat sekitar ${formatRp(savings)} atau ${pct}%.`
        : `Harga akses ${game.name} di Playfast mulai ${formatRp(game.price)} untuk lifetime access. Kamu juga bisa pakai Playfast Premium (mulai Rp 50.000/bulan) untuk akses ke semua game di katalog kami.`
    },
    {
      q: 'Apakah cara ini legal dan aman?',
      a: 'Playfast membeli game secara legal via Steam dan membagikan akses ke pengguna sesuai aturan akun bersama di offline mode. Kami tidak menjual akun, tidak menggunakan cheat, dan tidak melanggar ToS Steam selama dipakai sesuai panduan.'
    },
    {
      q: `Bagaimana cara generate kode Steam Guard untuk ${game.name}?`,
      a: 'Setelah pembelian, buka halaman "Game Saya" di dashboard Playfast, pilih game-nya, dan klik "Generate Kode Steam Guard". Kode berlaku sekitar 30 detik — pakai segera untuk login. Bisa generate ulang kapan saja kalau expired.'
    }
  ]

  if (isMmoGenre(game.genres) || hasMultiplayer(game.genres)) {
    baseFaqs.push({
      q: `Bisa main ${game.name} online multiplayer di Playfast?`,
      a: `${game.name} punya komponen multiplayer online. Karena akun Steam digunakan bersama dan dimainkan di offline mode, fitur multiplayer online tidak tersedia di Playfast. Cocok kalau kamu fokus story/campaign solo.`
    })
  } else {
    baseFaqs.push({
      q: `Bisa main ${game.name} offline di Playfast?`,
      a: `Ya — ${game.name} adalah game single-player dan justru direkomendasikan dimainkan via Steam offline mode di Playfast. Progress tersimpan di Steam Cloud akun, jadi tetap aman.`
    })
  }

  const howToLd = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: `Cara main ${game.name} murah di Indonesia via Playfast`,
    description: `Panduan 4 langkah untuk main ${game.name} di Steam dengan akses murah lewat Playfast.`,
    totalTime: 'PT10M',
    estimatedCost: { '@type': 'MonetaryAmount', currency: 'IDR', value: game.price },
    step: steps.map((s, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: s.name,
      text: s.text,
      url: `${BASE}${PLAY_GUIDE_BASE}/${canonical}#step-${i + 1}`
    }))
  }

  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: baseFaqs.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a }
    }))
  }

  const productLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `Akses Steam ${game.name} via Playfast`,
    image: headerImage,
    description: `Akses akun Steam ${game.name} untuk dimainkan di offline mode dengan kode Steam Guard otomatis.`,
    brand: { '@type': 'Brand', name: 'Playfast' },
    offers: {
      '@type': 'Offer',
      url: `${BASE}${buyHref}`,
      priceCurrency: 'IDR',
      price: game.price,
      availability: 'https://schema.org/InStock'
    }
  }

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Beranda', item: BASE },
      { '@type': 'ListItem', position: 2, name: 'Katalog', item: `${BASE}/katalog` },
      { '@type': 'ListItem', position: 3, name: 'Cara Main', item: `${BASE}${PLAY_GUIDE_BASE}` },
      { '@type': 'ListItem', position: 4, name: game.name, item: `${BASE}${PLAY_GUIDE_BASE}/${canonical}` }
    ]
  }

  return (
    <Box sx={{ minHeight: '100vh', background: `linear-gradient(180deg, ${dark} 0%, #111318 100%)`, color: textPrimary }}>
      <script type='application/ld+json' dangerouslySetInnerHTML={{ __html: JSON.stringify(howToLd) }} />
      <script type='application/ld+json' dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <script type='application/ld+json' dangerouslySetInnerHTML={{ __html: JSON.stringify(productLd) }} />
      <script type='application/ld+json' dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      <Container maxWidth='lg' sx={{ py: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
          <Link href='/'>
            <Box component='img' src='/images/brand/wordmark.png' alt='Playfast' sx={{ height: 28 }} />
          </Link>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Button component={Link} href='/katalog' size='small' sx={{ color: textSecondary, fontWeight: 600, '&:hover': { color: gold } }}>
              Katalog
            </Button>
            <Button component={Link} href='/subscribe' variant='contained' size='small' sx={{ bgcolor: gold, color: dark, fontWeight: 700, '&:hover': { bgcolor: goldLight } }}>
              Premium
            </Button>
          </Box>
        </Box>

        <Box sx={{ fontSize: 13, color: textSecondary, mb: 2 }}>
          <Link href='/' style={{ color: textSecondary, textDecoration: 'none' }}>Beranda</Link>
          <span> › </span>
          <Link href='/katalog' style={{ color: textSecondary, textDecoration: 'none' }}>Katalog</Link>
          <span> › </span>
          <span>Cara Main {game.name}</span>
        </Box>
      </Container>

      <Container maxWidth='lg' sx={{ pb: 8 }}>
        <Grid container spacing={4}>
          <Grid size={{ xs: 12, md: 7 }}>
            <Typography component='h1' variant='h3' sx={{ fontWeight: 800, mb: 2, lineHeight: 1.2 }}>
              Cara Main {game.name} Murah di Indonesia
              {game.price > 0 && (
                <Box component='span' sx={{ display: 'block', fontSize: '0.55em', color: gold, fontWeight: 700, mt: 1 }}>
                  Mulai {formatRp(game.price)}
                </Box>
              )}
            </Typography>

            <Typography sx={{ color: textSecondary, fontSize: '1.05rem', lineHeight: 1.7, mb: 3 }}>
              {aboveFold}
            </Typography>

            {genres.length > 0 && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 3 }}>
                {genres.map(g => (
                  <Chip key={g} label={g} size='small' sx={{ bgcolor: 'rgba(201,168,76,0.12)', color: gold, fontWeight: 600 }} />
                ))}
                {releaseYear && (
                  <Chip label={`Rilis ${releaseYear}`} size='small' sx={{ bgcolor: darkCard, color: textSecondary, border: `1px solid ${darkCardBorder}` }} />
                )}
              </Box>
            )}

            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 4 }}>
              <Button component={Link} href={buyHref} variant='contained' size='large' sx={{ bgcolor: gold, color: dark, fontWeight: 700, px: 4, '&:hover': { bgcolor: goldLight } }}>
                Beli Akses {game.name}
              </Button>
              <Button component={Link} href='/subscribe' variant='outlined' size='large' sx={{ borderColor: 'rgba(201,168,76,0.4)', color: textPrimary, fontWeight: 600, '&:hover': { borderColor: gold } }}>
                Lihat Paket Premium
              </Button>
            </Box>
          </Grid>

          <Grid size={{ xs: 12, md: 5 }}>
            <Card sx={{ bgcolor: darkCard, border: `1px solid ${darkCardBorder}`, overflow: 'hidden' }}>
              <Box component='img' src={headerImage} alt={`${game.name} header`} sx={{ width: '100%', display: 'block' }} />
              <CardContent>
                <Typography variant='subtitle2' sx={{ color: textSecondary, mb: 1 }}>Harga di Playfast</Typography>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, mb: 2 }}>
                  <Typography variant='h4' sx={{ color: gold, fontWeight: 800 }}>{formatRp(game.price)}</Typography>
                  {hasSavings && (
                    <Typography sx={{ color: textSecondary, textDecoration: 'line-through', fontSize: '0.95rem' }}>
                      {formatRp(game.original_price as number)}
                    </Typography>
                  )}
                </Box>
                {hasSavings && (
                  <Chip label={`Hemat ${pct}% dari harga Steam`} size='small' sx={{ bgcolor: 'rgba(62,207,142,0.15)', color: '#3ecf8e', fontWeight: 700, mb: 1 }} />
                )}
                <Typography variant='body2' sx={{ color: textSecondary, lineHeight: 1.6, mt: 1 }}>
                  Lifetime access — bayar sekali, main kapan saja. Atau pakai Playfast Premium mulai Rp 50.000/bulan untuk semua game.
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <Divider sx={{ my: 6, borderColor: darkCardBorder }} />

        <Box sx={{ mb: 6 }}>
          <Typography component='h2' variant='h4' sx={{ fontWeight: 700, mb: 1 }}>
            4 Langkah Main {game.name} via Playfast
          </Typography>
          <Typography sx={{ color: textSecondary, mb: 4 }}>
            Total waktu setup sekitar 10 menit dari pembayaran sampai main.
          </Typography>

          <Grid container spacing={2}>
            {steps.map((s, i) => (
              <Grid size={{ xs: 12, sm: 6 }} key={i} id={`step-${i + 1}`}>
                <Card sx={{ bgcolor: darkCard, border: `1px solid ${darkCardBorder}`, height: '100%' }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                      <Box sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: gold, color: dark, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                        {i + 1}
                      </Box>
                      <Typography variant='subtitle1' sx={{ fontWeight: 700 }}>{s.name}</Typography>
                    </Box>
                    <Typography variant='body2' sx={{ color: textSecondary, lineHeight: 1.7 }}>{s.text}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>

        <Box sx={{ mb: 6 }}>
          <Typography component='h2' variant='h4' sx={{ fontWeight: 700, mb: 2 }}>
            Apakah {game.name} Cocok dengan Playfast?
          </Typography>
          <Card sx={{ bgcolor: darkCard, border: `1px solid ${darkCardBorder}` }}>
            <CardContent>
              <Typography sx={{ color: textPrimary, lineHeight: 1.8 }}>{compat}</Typography>
            </CardContent>
          </Card>
        </Box>

        {game.description && (
          <Box sx={{ mb: 6 }}>
            <Typography component='h2' variant='h4' sx={{ fontWeight: 700, mb: 2 }}>
              Tentang {game.name}
            </Typography>
            <Typography sx={{ color: textSecondary, lineHeight: 1.8, whiteSpace: 'pre-line' }}>
              {game.description.length > 800 ? `${game.description.slice(0, 800)}…` : game.description}
            </Typography>
          </Box>
        )}

        <Box sx={{ mb: 6 }}>
          <Typography component='h2' variant='h4' sx={{ fontWeight: 700, mb: 3 }}>
            Pertanyaan Umum tentang Playfast + {game.name}
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {baseFaqs.map((f, i) => (
              <Card key={i} sx={{ bgcolor: darkCard, border: `1px solid ${darkCardBorder}` }}>
                <CardContent>
                  <Typography component='h3' variant='subtitle1' sx={{ fontWeight: 700, mb: 1 }}>{f.q}</Typography>
                  <Typography variant='body2' sx={{ color: textSecondary, lineHeight: 1.7 }}>{f.a}</Typography>
                </CardContent>
              </Card>
            ))}
          </Box>
        </Box>

        {related.length > 0 && (
          <Box sx={{ mb: 6 }}>
            <Typography component='h2' variant='h4' sx={{ fontWeight: 700, mb: 1 }}>
              Game Lain di Genre yang Sama
            </Typography>
            <Typography sx={{ color: textSecondary, mb: 3 }}>
              Kalau {game.name} cocok untuk kamu, coba juga panduan game-game ini:
            </Typography>
            <Grid container spacing={2}>
              {related.map(r => {
                const rSlug = gameSlug(r.appid, r.name)

                return (
                  <Grid size={{ xs: 12, sm: 6, md: 3 }} key={r.appid}>
                    <Card component={Link} href={`${PLAY_GUIDE_BASE}/${rSlug}`} sx={{ bgcolor: darkCard, border: `1px solid ${darkCardBorder}`, textDecoration: 'none', display: 'block', transition: 'border-color .2s', '&:hover': { borderColor: gold } }}>
                      <Box component='img' src={r.header_image || `https://cdn.akamai.steamstatic.com/steam/apps/${r.appid}/header.jpg`} alt={r.name} sx={{ width: '100%', display: 'block', aspectRatio: '460/215', objectFit: 'cover' }} />
                      <CardContent>
                        <Typography variant='subtitle2' sx={{ fontWeight: 700, color: textPrimary, mb: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          Cara Main {r.name}
                        </Typography>
                        <Typography variant='body2' sx={{ color: gold, fontWeight: 700 }}>Mulai {formatRp(r.price)}</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                )
              })}
            </Grid>
          </Box>
        )}

        <Card sx={{ bgcolor: 'rgba(201,168,76,0.06)', border: `1px solid rgba(201,168,76,0.3)`, textAlign: 'center', py: 4 }}>
          <CardContent>
            <Typography variant='h5' sx={{ fontWeight: 700, mb: 1 }}>Siap main {game.name}?</Typography>
            <Typography sx={{ color: textSecondary, mb: 3 }}>
              Beli akses sekali atau subscribe Premium untuk akses ke semua game di katalog.
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button component={Link} href={buyHref} variant='contained' size='large' sx={{ bgcolor: gold, color: dark, fontWeight: 700, '&:hover': { bgcolor: goldLight } }}>
                Beli Akses {game.name}
              </Button>
              <Button component={Link} href='/subscribe' variant='outlined' size='large' sx={{ borderColor: gold, color: textPrimary, fontWeight: 600 }}>
                Subscribe Premium
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Container>

      <Box sx={{ py: 4, textAlign: 'center', borderTop: `1px solid ${darkCardBorder}` }}>
        <Typography variant='body2' sx={{ color: textSecondary }}>
          © {new Date().getFullYear()} Playfast — Akses Game Steam Indonesia
        </Typography>
      </Box>
    </Box>
  )
}
