'use client'

import { useEffect, useMemo, useState } from 'react'

import Link from 'next/link'

import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardMedia from '@mui/material/CardMedia'
import Container from '@mui/material/Container'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Skeleton from '@mui/material/Skeleton'
import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'

import { formatIDR, gameHeaderImage, handleImageError } from '@/lib/api'
import type { Game } from '@/lib/api'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || ''

const gold = '#c9a84c'
const goldLight = '#dfc06a'
const goldGlow = 'rgba(201,168,76,0.18)'
const dark = '#0c0e12'
const darkCard = 'rgba(22,25,32,0.7)'
const darkCardBorder = 'rgba(60,63,72,0.45)'
const textPrimary = '#e8eaed'
const textSecondary = '#9aa0a6'

interface Tier {
  label: string
  min: number
}

const TIERS: Tier[] = [
  { label: '> Rp 500K', min: 500_000 },
  { label: '> Rp 200K', min: 200_000 },
  { label: '> Rp 100K', min: 100_000 },
  { label: '> Rp 50K', min: 50_000 },
]

const CatalogShowcasePage = () => {
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch(`${API_BASE}/api/store/games/catalog`)
      .then(r => r.json())
      .then(data => {
        setGames(data.games)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    return search
      ? games.filter(g => g.name.toLowerCase().includes(search.toLowerCase()))
      : games
  }, [search, games])

  // Stats follow the visible list: when search filters down, totals update too.
  const totalGames = filtered.length
  const totalValue = useMemo(
    () => filtered.reduce((sum, g) => sum + (g.original_price || 0), 0),
    [filtered]
  )
  const tiers = useMemo(
    () => TIERS
      .map(t => ({ label: t.label, count: filtered.filter(g => (g.original_price || 0) >= t.min).length }))
      .filter(t => t.count > 0),
    [filtered]
  )

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: `linear-gradient(180deg, ${dark} 0%, #111318 30%, #14161c 60%, ${dark} 100%)`,
        color: textPrimary,
      }}
    >
      {/* Ambient glow */}
      <Box
        sx={{
          position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden',
          '&::before': {
            content: '""', position: 'absolute', top: '-25%', left: '50%',
            transform: 'translateX(-50%)', width: '120%', height: '50%', borderRadius: '50%',
            background: `radial-gradient(ellipse, ${goldGlow} 0%, transparent 70%)`,
          },
        }}
      />

      <Box sx={{ position: 'relative', zIndex: 1 }}>
        {/* Nav */}
        <Box
          sx={{
            py: 2, px: 3,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            maxWidth: 1200, mx: 'auto',
          }}
        >
          <Box component='img' src='/images/brand/wordmark.png' alt='Playfast' sx={{ height: { xs: 28, md: 34 } }} />
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Button component={Link} href='/login' variant='text' sx={{ color: textSecondary, fontWeight: 600, '&:hover': { color: gold } }}>
              Masuk
            </Button>
            <Button
              component={Link} href='/register' variant='contained' size='small'
              sx={{ bgcolor: gold, color: dark, fontWeight: 700, '&:hover': { bgcolor: goldLight } }}
            >
              Daftar
            </Button>
          </Box>
        </Box>

        {/* Hero stats */}
        <Container maxWidth='lg' sx={{ pt: { xs: 6, md: 10 }, pb: 6, textAlign: 'center' }}>
          <Typography
            variant='h3'
            sx={{
              fontWeight: 800, mb: 1,
              fontSize: { xs: '1.8rem', sm: '2.4rem', md: '3rem' },
            }}
          >
            Katalog Game{' '}
            <Box
              component='span'
              sx={{
                background: `linear-gradient(135deg, ${goldLight} 0%, ${gold} 100%)`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Playfast
            </Box>
          </Typography>
          <Typography variant='body1' sx={{ color: textSecondary, mb: 5, maxWidth: 600, mx: 'auto' }}>
            Semua game yang tersedia di platform kami. Beli satuan atau subscribe untuk akses semuanya.
          </Typography>

          {/* Stat cards */}
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 3, flexWrap: 'wrap', mb: 4 }}>
              {[1, 2, 3].map(i => <Skeleton key={i} variant='rounded' width={180} height={100} />)}
            </Box>
          ) : (
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: { xs: 2, md: 3 }, flexWrap: 'wrap', mb: 4 }}>
              <Card sx={{ bgcolor: darkCard, border: `1px solid ${darkCardBorder}`, minWidth: 160 }}>
                <CardContent sx={{ textAlign: 'center', py: 3 }}>
                  <Typography variant='h3' sx={{ fontWeight: 800, color: gold }}>{totalGames}</Typography>
                  <Typography variant='body2' sx={{ color: textSecondary, mt: 0.5 }}>Total Game</Typography>
                </CardContent>
              </Card>
              <Card sx={{ bgcolor: darkCard, border: `1px solid ${darkCardBorder}`, minWidth: 200 }}>
                <CardContent sx={{ textAlign: 'center', py: 3 }}>
                  <Typography variant='h3' sx={{ fontWeight: 800, color: gold }}>{formatIDR(totalValue)}</Typography>
                  <Typography variant='body2' sx={{ color: textSecondary, mt: 0.5 }}>Nilai Asli di Steam</Typography>
                </CardContent>
              </Card>
            </Box>
          )}

          {/* Price tier breakdown */}
          {!loading && tiers.length > 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
              {tiers.map(tier => (
                <Chip
                  key={tier.label}
                  label={`${tier.label}: ${tier.count} game`}
                  sx={{
                    bgcolor: 'rgba(201,168,76,0.1)',
                    color: gold,
                    border: `1px solid rgba(201,168,76,0.25)`,
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    height: 36,
                  }}
                />
              ))}
            </Box>
          )}
        </Container>

        {/* Search */}
        <Container maxWidth='lg' sx={{ pb: 4 }}>
          <Box sx={{ maxWidth: 400, mx: 'auto' }}>
            <TextField
              fullWidth
              placeholder='Cari game...'
              value={search}
              onChange={e => setSearch(e.target.value)}
              size='small'
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position='start'>
                      <i className='tabler-search' style={{ color: textSecondary }} />
                    </InputAdornment>
                  ),
                  sx: {
                    bgcolor: darkCard,
                    border: `1px solid ${darkCardBorder}`,
                    color: textPrimary,
                    '& input::placeholder': { color: textSecondary },
                  },
                }
              }}
            />
          </Box>
        </Container>

        {/* Game grid */}
        <Container maxWidth='lg' sx={{ pb: 10 }}>
          {loading ? (
            <Grid container spacing={2}>
              {Array.from({ length: 12 }).map((_, i) => (
                <Grid size={{ xs: 6, sm: 4, md: 3 }} key={i}>
                  <Card sx={{ bgcolor: darkCard, border: `1px solid ${darkCardBorder}` }}>
                    <Skeleton variant='rectangular' height={100} />
                    <CardContent sx={{ p: 1.5 }}>
                      <Skeleton width='80%' height={18} />
                      <Skeleton width='40%' height={22} sx={{ mt: 0.5 }} />
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          ) : (
            <>
              {search && (
                <Typography variant='body2' sx={{ color: textSecondary, mb: 2 }}>
                  {filtered.length} game ditemukan
                </Typography>
              )}
              <Grid container spacing={2}>
                {filtered.map(game => (
                  <Grid size={{ xs: 6, sm: 4, md: 3 }} key={game.id}>
                    <Card
                      sx={{
                        bgcolor: darkCard,
                        border: `1px solid ${darkCardBorder}`,
                        transition: 'all 0.2s ease',
                        '&:hover': {
                          borderColor: 'rgba(201,168,76,0.4)',
                          transform: 'translateY(-2px)',
                        },
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                    >
                      <CardMedia
                        component='img'
                        height={100}
                        image={game.header_image || gameHeaderImage(game.appid)}
                        alt={game.name}
                        onError={handleImageError}
                        sx={{ objectFit: 'cover' }}
                      />
                      <CardContent sx={{ p: 1.5, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                        <Typography
                          variant='body2'
                          sx={{
                            fontWeight: 600, color: textPrimary, mb: 0.5,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            fontSize: '0.8rem',
                          }}
                        >
                          {game.name}
                        </Typography>
                        {(game.genres || game.release_date) && (
                          <Typography variant='caption' sx={{ color: textSecondary, fontSize: '0.65rem', mb: 0.5, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {game.release_date ? new Date(game.release_date).getFullYear() : ''}
                            {game.release_date && game.genres ? ' · ' : ''}
                            {game.genres}
                          </Typography>
                        )}
                        <Box sx={{ flexGrow: 1 }} />
                        {game.original_price ? (
                          <Box>
                            <Typography variant='caption' sx={{ color: textSecondary, textDecoration: 'line-through', fontSize: '0.7rem' }}>
                              {formatIDR(game.original_price)}
                            </Typography>
                            <Typography variant='subtitle2' sx={{ fontWeight: 700, color: gold, fontSize: '0.85rem' }}>
                              {formatIDR(game.price)}
                            </Typography>
                          </Box>
                        ) : (
                          <Typography variant='subtitle2' sx={{ fontWeight: 700, color: gold, fontSize: '0.85rem' }}>
                            {formatIDR(game.price)}
                          </Typography>
                        )}
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </>
          )}
        </Container>

        {/* CTA */}
        <Box sx={{ py: 8, textAlign: 'center', borderTop: `1px solid ${darkCardBorder}`, background: `linear-gradient(180deg, transparent 0%, rgba(201,168,76,0.04) 50%, rgba(201,168,76,0.08) 100%)` }}>
          <Container maxWidth='sm'>
            <Typography variant='h4' sx={{ fontWeight: 700, mb: 2 }}>Mau Main Semua?</Typography>
            <Typography sx={{ color: textSecondary, mb: 4, lineHeight: 1.7 }}>
              Subscribe Playfast Premium dan dapatkan akses ke seluruh katalog game di atas.
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button
                component={Link} href='/register' variant='contained' size='large'
                sx={{
                  px: 4, py: 1.5, fontSize: '1rem', fontWeight: 700,
                  bgcolor: gold, color: dark,
                  boxShadow: `0 4px 24px rgba(201,168,76,0.3)`,
                  '&:hover': { bgcolor: goldLight },
                }}
              >
                Daftar & Subscribe
              </Button>
              <Button
                component={Link} href='/store' variant='outlined' size='large'
                sx={{
                  px: 4, py: 1.5, fontSize: '1rem', fontWeight: 700,
                  borderColor: 'rgba(201,168,76,0.35)', color: textPrimary,
                  '&:hover': { borderColor: gold, bgcolor: goldGlow },
                }}
              >
                Beli Satuan
              </Button>
            </Box>
          </Container>
        </Box>

        {/* Footer */}
        <Box sx={{ py: 4, textAlign: 'center', borderTop: `1px solid ${darkCardBorder}` }}>
          <Typography variant='body2' sx={{ color: 'rgba(255,255,255,0.25)' }}>
            {'\u00A9 2026 Playfast. Tidak berafiliasi dengan Valve atau Steam.'}
          </Typography>
        </Box>
      </Box>
    </Box>
  )
}

export default CatalogShowcasePage
