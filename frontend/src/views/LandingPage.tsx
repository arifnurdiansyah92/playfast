'use client'

import { useEffect, useState } from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardMedia from '@mui/material/CardMedia'
import CardActionArea from '@mui/material/CardActionArea'
import Collapse from '@mui/material/Collapse'
import Container from '@mui/material/Container'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Skeleton from '@mui/material/Skeleton'

import { storeApi, formatIDR, gameHeaderImage, handleImageError } from '@/lib/api'
import type { Game } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import LandingPromoBanner from '@/components/LandingPromoBanner'

/* ── Brand palette ─────────────────────────────────── */
const gold = '#c9a84c'
const goldLight = '#dfc06a'
const goldGlow = 'rgba(201,168,76,0.18)'
const dark = '#0c0e12'
const darkCard = 'rgba(22,25,32,0.7)'
const darkCardBorder = 'rgba(60,63,72,0.45)'
const textPrimary = '#e8eaed'
const textSecondary = '#9aa0a6'

const LandingPage = () => {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [games, setGames] = useState<Game[]>([])
  const [gamesLoading, setGamesLoading] = useState(true)
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [plans, setPlans] = useState<{ plan: string; label: string; price: number; duration_days: number }[]>([])
  const [plansLoading, setPlansLoading] = useState(true)

  useEffect(() => {
    storeApi.getFeaturedGames().then(featured => {
      if (featured.length > 0) {
        setGames(featured.slice(0, 8))
        setGamesLoading(false)
      } else {
        return storeApi.getGames({ page: 1 }).then(data => {
          setGames(data.games.slice(0, 8))
          setGamesLoading(false)
        })
      }
    }).catch(() => {
      storeApi.getGames({ page: 1 }).then(data => {
        setGames(data.games.slice(0, 8))
        setGamesLoading(false)
      }).catch(() => setGamesLoading(false))
    })
  }, [])

  useEffect(() => {
    storeApi.getSubscriptionPlans()
      .then(data => { setPlans(data.plans); setPlansLoading(false) })
      .catch(() => setPlansLoading(false))
  }, [])

  useEffect(() => {
    if (!loading && user) {
      router.replace('/store')
    }
  }, [loading, user, router])

  const features = [
    { icon: 'tabler-bolt', title: 'Akses Instan', desc: 'Dapatkan kredensial Steam dan kode guard langsung setelah pembelian' },
    { icon: 'tabler-shield-lock', title: 'Kode Steam Guard', desc: 'Kode 2FA otomatis — nggak perlu nunggu seller bales' },
    { icon: 'tabler-crown', title: 'Subscribe = Semua Game', desc: 'Satu langganan Premium = akses ke 300+ game di katalog. Game baru otomatis nambah' },
    { icon: 'tabler-currency-dollar', title: 'Mulai Rp 50K/Bulan', desc: 'Premium bulanan terjangkau, atau hemat lebih banyak via paket tahunan / lifetime' },
  ]

  const steps = [
    { num: '1', icon: 'tabler-search', title: 'Cari Game', desc: 'Cari game yang kamu mau dari katalog kami' },
    { num: '2', icon: 'tabler-user-plus', title: 'Daftar & Bayar', desc: 'Buat akun dan selesaikan pembayaran' },
    { num: '3', icon: 'tabler-key', title: 'Dapat Akses Login', desc: 'Terima username, password & kode guard Steam secara instan' },
    { num: '4', icon: 'tabler-device-gamepad-2', title: 'Main Offline', desc: 'Login, download, masuk offline mode, dan nikmati' },
  ]

  const faqs = [
    {
      q: 'Bagaimana cara kerja Playfast?',
      a: 'Playfast menyediakan kredensial akun Steam yang sudah terinstall game yang kamu inginkan. Setelah pembelian, kamu akan menerima username, password, dan kode Steam Guard otomatis. Tinggal login ke Steam, download game-nya, masuk offline mode, dan langsung main.'
    },
    {
      q: 'Ini langganan atau beli putus?',
      a: 'Dua-duanya ada! Kamu bisa beli satuan per game (bayar sekali, akses selamanya), atau pilih Playfast Premium — subscription bulanan/tahunan yang membuka akses ke semua game di katalog. Pilih yang paling cocok buat kamu.'
    },
    {
      q: 'Apa itu kode Steam Guard dan kenapa dibutuhkan?',
      a: 'Steam Guard adalah sistem autentikasi dua faktor dari Steam. Saat kamu login dari perangkat baru, Steam meminta kode verifikasi. Playfast otomatis generate kode ini buat kamu jadi nggak perlu nunggu seller kirim manual.'
    },
    {
      q: 'Bisa main game online multiplayer?',
      a: 'Playfast dirancang utamanya untuk gaming offline/single-player. Karena akun digunakan bersama, main online mungkin terbatas. Kami sarankan pakai Playfast untuk game story-driven dan single-player supaya pengalaman mainnya maksimal.'
    },
    {
      q: 'Gimana kalau akses saya bermasalah?',
      a: 'Kalau kamu mengalami masalah dengan akses, kamu bisa generate kode Steam Guard baru dari halaman Play kapan saja. Kalau ada masalah di level akun, sistem kami akan memberitahu kamu dan kami akan segera menyelesaikannya.'
    },
  ]

  /* Shared card style */
  const cardSx = {
    bgcolor: darkCard,
    backdropFilter: 'blur(12px)',
    border: `1px solid ${darkCardBorder}`,
    transition: 'all 0.3s ease',
    '&:hover': {
      transform: 'translateY(-4px)',
      borderColor: 'rgba(201,168,76,0.4)',
      boxShadow: `0 8px 40px rgba(0,0,0,0.35)`,
    },
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: `linear-gradient(180deg, ${dark} 0%, #111318 30%, #14161c 60%, ${dark} 100%)`,
        color: textPrimary,
      }}
    >
      {/* ── Ambient glow ── */}
      <Box
        sx={{
          position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden',
          '&::before': {
            content: '""', position: 'absolute', top: '-25%', left: '50%',
            transform: 'translateX(-50%)', width: '120%', height: '50%', borderRadius: '50%',
            background: `radial-gradient(ellipse, ${goldGlow} 0%, transparent 70%)`,
            animation: 'heroGlow 8s ease-in-out infinite alternate',
          },
          '@keyframes heroGlow': {
            '0%': { opacity: 0.5, transform: 'translateX(-50%) scale(1)' },
            '100%': { opacity: 1, transform: 'translateX(-50%) scale(1.08)' },
          },
        }}
      />

      <Box sx={{ position: 'relative', zIndex: 1 }}>

        {/* ════════════════════ NAV ════════════════════ */}
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
              sx={{
                bgcolor: gold, color: dark, fontWeight: 700,
                '&:hover': { bgcolor: goldLight },
              }}
            >
              Daftar
            </Button>
          </Box>
        </Box>

        {/* ════════════════════ HERO ════════════════════ */}
        <Container maxWidth='lg' sx={{ pt: { xs: 8, md: 14 }, pb: 10, textAlign: 'center' }}>
          <Box sx={{ animation: 'fadeInUp 0.8s ease-out', '@keyframes fadeInUp': { '0%': { opacity: 0, transform: 'translateY(24px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } } }}>
            {/* Icon */}
            <Box component='img' src='/images/brand/icon.png' alt='' sx={{ width: { xs: 72, md: 88 }, height: 'auto', mx: 'auto', mb: 3, filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.5))' }} />

            {/* Promo eyebrow — only shown when lifetime plan is configured */}
            {(() => {
              const lifetime = plans.find(p => p.plan === 'lifetime')

              if (!lifetime || lifetime.price <= 0) return null

              return (
                <Box
                  sx={{
                    display: 'inline-flex', alignItems: 'center', gap: 1,
                    px: 1.75, py: 0.6, mb: 2.5, borderRadius: 999,
                    background: `linear-gradient(135deg, ${gold} 0%, #a67b1a 100%)`,
                    boxShadow: `0 4px 14px rgba(201,168,76,0.4)`,
                  }}
                >
                  <Box sx={{ width: 7, height: 7, borderRadius: 4, bgcolor: dark }} />
                  <Typography variant='caption' sx={{ color: dark, fontWeight: 700, letterSpacing: '0.2em', fontSize: '0.7rem' }}>
                    PROMO LIFETIME · {formatIDR(lifetime.price)}
                  </Typography>
                </Box>
              )
            })()}

            <Typography
              variant='h2'
              sx={{
                fontWeight: 800, mb: 2.5,
                fontSize: { xs: '2.2rem', sm: '2.8rem', md: '3.5rem' },
                lineHeight: 1.15, letterSpacing: '-0.02em',
              }}
            >
              Subscribe Sekali,{' '}
              <Box
                component='span'
                sx={{
                  background: `linear-gradient(135deg, ${goldLight} 0%, ${gold} 100%)`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Main Semua
              </Box>{' '}
              Game Steam
            </Typography>

            <Typography
              variant='h6'
              sx={{
                color: textSecondary, mb: 2, maxWidth: 620, mx: 'auto',
                fontWeight: 400, lineHeight: 1.7, fontSize: { xs: '1rem', md: '1.15rem' },
              }}
            >
              Akses 300+ game Steam dengan satu langganan Premium — tanpa beli satu-satu. Kode Steam Guard otomatis 24/7, tanpa ribet.
            </Typography>

            {/* Social proof */}
            <Typography variant='body2' sx={{ color: gold, mb: 5, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75 }}>
              <i className='tabler-users' style={{ fontSize: 18 }} />
              Dipercaya 500+ gamer di seluruh Indonesia
            </Typography>

            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button
                component={Link} href='/subscribe' variant='contained' size='large'
                startIcon={<i className='tabler-crown' />}
                sx={{
                  px: 4, py: 1.5, fontSize: '1rem', fontWeight: 700,
                  bgcolor: gold, color: dark,
                  boxShadow: `0 4px 24px rgba(201,168,76,0.3)`,
                  '&:hover': { bgcolor: goldLight, boxShadow: `0 6px 32px rgba(201,168,76,0.4)` },
                }}
              >
                Lihat Paket Premium
              </Button>
              <Button
                component={Link} href='/store' variant='text' size='large'
                endIcon={<i className='tabler-arrow-right' style={{ fontSize: 16 }} />}
                sx={{
                  px: 3, py: 1.5, fontSize: '0.95rem', fontWeight: 600,
                  color: textSecondary,
                  '&:hover': { color: gold, bgcolor: 'transparent' },
                }}
              >
                atau beli satuan dari Rp 50K
              </Button>
            </Box>
          </Box>

          {/* Stats */}
          <Box
            sx={{
              display: 'flex', justifyContent: 'center', gap: { xs: 3, md: 6 }, mt: 8, flexWrap: 'wrap',
              animation: 'fadeInUp 0.8s ease-out 0.3s both',
            }}
          >
            {[
              { label: 'Game di Katalog', value: '300+' },
              { label: 'Premium', value: 'Mulai 50K/bln' },
              { label: 'Kode Guard', value: 'Instan' },
            ].map(s => (
              <Box key={s.label} sx={{ textAlign: 'center', minWidth: 100 }}>
                <Typography variant='h4' sx={{ fontWeight: 800, background: `linear-gradient(135deg, ${goldLight} 0%, ${gold} 100%)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  {s.value}
                </Typography>
                <Typography variant='body2' sx={{ color: textSecondary, mt: 0.5 }}>{s.label}</Typography>
              </Box>
            ))}
          </Box>
        </Container>

        {/* ════════════════════ FEATURES ════════════════════ */}
        <Container maxWidth='lg' sx={{ pb: 10 }}>
          <Grid container spacing={3}>
            {features.map((f, idx) => (
              <Grid size={{ xs: 12, sm: 6, md: 3 }} key={f.title}>
                <Card sx={{ ...cardSx, height: '100%', animation: `fadeInUp 0.6s ease-out ${0.1 * idx}s both` }}>
                  <CardContent sx={{ textAlign: 'center', py: 4, px: 3 }}>
                    <Box sx={{
                      width: 60, height: 60, borderRadius: '50%', mx: 'auto', mb: 2.5,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: `linear-gradient(135deg, rgba(201,168,76,0.15) 0%, rgba(201,168,76,0.04) 100%)`,
                      border: `1px solid rgba(201,168,76,0.25)`,
                    }}>
                      <i className={f.icon} style={{ fontSize: 28, color: gold }} />
                    </Box>
                    <Typography variant='subtitle1' sx={{ fontWeight: 700, mb: 1 }}>{f.title}</Typography>
                    <Typography variant='body2' sx={{ color: textSecondary, lineHeight: 1.6 }}>{f.desc}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>

        {/* ════════════════════ HOW IT WORKS ════════════════════ */}
        <Box sx={{ py: 10, bgcolor: 'rgba(0,0,0,0.2)' }}>
          <Container maxWidth='md'>
            <Typography variant='h4' sx={{ fontWeight: 700, textAlign: 'center', mb: 1 }}>
              Cara Mainnya
            </Typography>
            <Typography variant='body1' sx={{ textAlign: 'center', color: textSecondary, mb: 6 }}>
              Mulai main dalam empat langkah mudah
            </Typography>

            {/* Steps with connector lines */}
            <Box sx={{ position: 'relative' }}>
              {/* Vertical connector line (visible on md+) */}
              <Box
                sx={{
                  display: { xs: 'none', md: 'block' },
                  position: 'absolute',
                  top: 36, left: '50%', transform: 'translateX(-50%)',
                  width: 2, height: 'calc(100% - 72px)',
                  background: `linear-gradient(180deg, ${gold} 0%, rgba(201,168,76,0.1) 100%)`,
                }}
              />

              <Grid container spacing={4}>
                {steps.map((s, idx) => {
                  const isEven = idx % 2 === 0

                  return (
                    <Grid size={{ xs: 12 }} key={s.num}>
                      <Box
                        sx={{
                          display: 'flex',
                          flexDirection: { xs: 'row', md: isEven ? 'row' : 'row-reverse' },
                          alignItems: 'center',
                          gap: { xs: 2.5, md: 4 },
                        }}
                      >
                        {/* Content side */}
                        <Box sx={{ flex: 1, textAlign: { xs: 'left', md: isEven ? 'right' : 'left' } }}>
                          <Typography variant='overline' sx={{ color: gold, fontWeight: 700, letterSpacing: 2 }}>
                            Langkah {s.num}
                          </Typography>
                          <Typography variant='h6' sx={{ fontWeight: 700, mb: 0.5 }}>
                            {s.title}
                          </Typography>
                          <Typography variant='body2' sx={{ color: textSecondary, lineHeight: 1.7 }}>
                            {s.desc}
                          </Typography>
                        </Box>

                        {/* Circle node */}
                        <Box sx={{
                          position: 'relative', zIndex: 2,
                          minWidth: 56, width: 56, height: 56, borderRadius: '50%',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: `linear-gradient(135deg, ${gold} 0%, ${goldLight} 100%)`,
                          boxShadow: `0 4px 20px rgba(201,168,76,0.35)`,
                        }}>
                          <i className={s.icon} style={{ fontSize: 26, color: dark }} />
                        </Box>

                        {/* Spacer (mirror side, only visible on md+) */}
                        <Box sx={{ flex: 1, display: { xs: 'none', md: 'block' } }} />
                      </Box>
                    </Grid>
                  )
                })}
              </Grid>
            </Box>
          </Container>
        </Box>

        {/* ════════════════════ FEATURED GAMES ════════════════════ */}
        {(gamesLoading || games.length > 0) && (
          <Container maxWidth='lg' sx={{ py: 10 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
              <Box>
                <Typography variant='h4' sx={{ fontWeight: 700 }}>Game Pilihan</Typography>
                <Typography variant='body2' sx={{ color: textSecondary, mt: 0.5 }}>Judul populer yang tersedia sekarang</Typography>
              </Box>
              <Button
                component={Link} href='/store' variant='text'
                endIcon={<i className='tabler-arrow-right' />}
                sx={{ display: { xs: 'none', sm: 'inline-flex' }, color: gold, '&:hover': { color: goldLight } }}
              >
                Lihat Semua
              </Button>
            </Box>
            <Grid container spacing={3}>
              {gamesLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                  <Grid size={{ xs: 12, sm: 6, md: 3 }} key={i}>
                    <Card sx={{ bgcolor: darkCard, border: `1px solid ${darkCardBorder}` }}>
                      <Skeleton variant='rectangular' height={140} />
                      <CardContent>
                        <Skeleton width='70%' height={24} />
                        <Skeleton width='40%' height={28} sx={{ mt: 1 }} />
                      </CardContent>
                    </Card>
                  </Grid>
                ))
                : games.map(game => (
                  <Grid size={{ xs: 12, sm: 6, md: 3 }} key={game.id}>
                    <Card sx={{ ...cardSx, '&:hover': { ...cardSx['&:hover'], borderColor: gold } }}>
                      <CardActionArea onClick={() => router.push(`/game/${game.appid}`)}>
                        <Box sx={{ position: 'relative' }}>
                          <CardMedia
                            component='img' height={130}
                            image={game.header_image || gameHeaderImage(game.appid)}
                            alt={game.name} onError={handleImageError} sx={{ objectFit: 'cover' }}
                          />
                          <Chip
                            label='Lifetime Access'
                            size='small'
                            sx={{
                              position: 'absolute', top: 8, right: 8,
                              bgcolor: 'rgba(0,0,0,0.7)', color: gold,
                              fontWeight: 600, fontSize: '0.65rem', height: 22,
                              backdropFilter: 'blur(4px)',
                              border: `1px solid rgba(201,168,76,0.3)`,
                            }}
                            icon={<i className='tabler-infinity' style={{ fontSize: 13, color: gold, marginLeft: 6 }} />}
                          />
                        </Box>
                        <CardContent sx={{ p: 2 }}>
                          <Typography variant='subtitle2' noWrap sx={{ fontWeight: 600, mb: 1 }}>{game.name}</Typography>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant='h6' sx={{ fontWeight: 700, color: gold }}>{formatIDR(game.price)}</Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <i className='tabler-shield-lock' style={{ fontSize: 14, color: textSecondary }} />
                              <Typography variant='caption' sx={{ color: textSecondary, fontSize: '0.65rem' }}>Instant Guard</Typography>
                            </Box>
                          </Box>
                        </CardContent>
                      </CardActionArea>
                    </Card>
                  </Grid>
                ))}
            </Grid>
            <Box sx={{ textAlign: 'center', mt: 4, display: { xs: 'block', sm: 'none' } }}>
              <Button component={Link} href='/store' variant='outlined' endIcon={<i className='tabler-arrow-right' />} sx={{ borderColor: gold, color: gold }}>
                Lihat Semua Game
              </Button>
            </Box>
          </Container>
        )}

        {/* ════════════════════ PRICING / SUBSCRIBE ════════════════════ */}
        <Box sx={{ py: 10, bgcolor: 'rgba(0,0,0,0.2)' }}>
          <Container maxWidth='lg'>
            <Typography variant='h4' sx={{ fontWeight: 700, textAlign: 'center', mb: 1 }}>
              Pilih Paket Premium-mu
            </Typography>
            <Typography variant='body1' sx={{ textAlign: 'center', color: textSecondary, mb: 6 }}>
              Subscribe sekali, akses semua game di katalog. Kalau cuma butuh satu game, beli satuan tetap tersedia di akhir.
            </Typography>

            <Grid container spacing={3} justifyContent='center'>
              {/* Subscription plan cards (lead with these — premium-first) */}
              {plansLoading
                ? [1, 2, 3].map(i => (
                  <Grid size={{ xs: 12, sm: 6, md: 3 }} key={i}>
                    <Card sx={{ ...cardSx, height: '100%' }}>
                      <CardContent sx={{ py: 4, px: 3 }}>
                        <Skeleton width='60%' height={28} sx={{ mx: 'auto', mb: 2 }} />
                        <Skeleton width='50%' height={40} sx={{ mx: 'auto', mb: 1 }} />
                        <Skeleton width='40%' height={20} sx={{ mx: 'auto', mb: 3 }} />
                        <Skeleton variant='rounded' height={44} />
                      </CardContent>
                    </Card>
                  </Grid>
                ))
                : plans.map(plan => {
                  const isBest = plan.plan === 'yearly'

                  const monthlyEquiv = plan.plan === 'monthly'
                    ? plan.price
                    : plan.plan === '3monthly'
                      ? Math.round(plan.price / 3)
                      : Math.round(plan.price / 12)

                  return (
                    <Grid size={{ xs: 12, sm: 6, md: 3 }} key={plan.plan}>
                      <Card sx={{
                        ...cardSx, height: '100%', display: 'flex', flexDirection: 'column',
                        position: 'relative',
                        ...(isBest ? { borderColor: `rgba(201,168,76,0.5)`, boxShadow: `0 0 30px rgba(201,168,76,0.1)` } : {}),
                      }}>
                        {isBest && (
                          <Chip
                            label='Best Value'
                            size='small'
                            sx={{
                              position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                              bgcolor: gold, color: dark, fontWeight: 700, fontSize: '0.7rem',
                            }}
                          />
                        )}
                        <CardContent sx={{ textAlign: 'center', py: 4, px: 3, display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
                          <Box sx={{
                            width: 48, height: 48, borderRadius: '50%', mx: 'auto', mb: 2,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: `linear-gradient(135deg, rgba(201,168,76,0.15) 0%, rgba(201,168,76,0.04) 100%)`,
                            border: `1px solid rgba(201,168,76,0.25)`,
                          }}>
                            <i className='tabler-crown' style={{ fontSize: 24, color: gold }} />
                          </Box>
                          <Typography variant='h6' sx={{ fontWeight: 700, mb: 1 }}>{plan.label}</Typography>
                          <Typography variant='h4' sx={{ fontWeight: 800, color: gold, mb: 0.5 }}>
                            {formatIDR(plan.price)}
                          </Typography>
                          <Typography variant='body2' sx={{ color: textSecondary, mb: 2 }}>
                            {plan.plan !== 'monthly' && `${formatIDR(monthlyEquiv)}/bulan · `}{plan.duration_days} hari
                          </Typography>
                          <Box sx={{ textAlign: 'left', mb: 3 }}>
                            {['Akses semua game di katalog', 'Kode Steam Guard otomatis', 'Game baru otomatis tersedia'].map(t => (
                              <Box key={t} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                <i className='tabler-check' style={{ fontSize: 16, color: gold }} />
                                <Typography variant='body2' sx={{ color: textSecondary }}>{t}</Typography>
                              </Box>
                            ))}
                          </Box>
                          <Box sx={{ flexGrow: 1 }} />
                          <Button
                            component={Link} href='/register?redirect=/subscribe' fullWidth size='large'
                            variant={isBest ? 'contained' : 'outlined'}
                            sx={isBest
                              ? { fontWeight: 700, bgcolor: gold, color: dark, '&:hover': { bgcolor: goldLight } }
                              : { fontWeight: 700, borderColor: `rgba(201,168,76,0.35)`, color: textPrimary, '&:hover': { borderColor: gold, bgcolor: goldGlow } }
                            }
                          >
                            Subscribe
                          </Button>
                        </CardContent>
                      </Card>
                    </Grid>
                  )
                })}
            </Grid>

            {/* Per-game option — explicitly secondary, below the Premium tier */}
            <Box sx={{ mt: 6, display: 'flex', justifyContent: 'center' }}>
              <Card
                sx={{
                  ...cardSx,
                  maxWidth: 560, width: '100%',
                  borderStyle: 'dashed',
                  borderColor: 'rgba(154,160,166,0.3)',
                }}
              >
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2.5, px: 3, flexWrap: 'wrap' }}>
                  <Box
                    sx={{
                      width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      bgcolor: 'rgba(154,160,166,0.1)',
                    }}
                  >
                    <i className='tabler-shopping-cart' style={{ fontSize: 20, color: textSecondary }} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 200 }}>
                    <Typography variant='subtitle2' sx={{ fontWeight: 700, color: textPrimary }}>
                      Cuma butuh satu game?
                    </Typography>
                    <Typography variant='caption' sx={{ color: textSecondary, display: 'block' }}>
                      Beli satuan mulai Rp 50K, bayar sekali — akses selamanya untuk game itu saja.
                    </Typography>
                  </Box>
                  <Button
                    component={Link} href='/store'
                    variant='outlined' size='small'
                    endIcon={<i className='tabler-arrow-right' style={{ fontSize: 14 }} />}
                    sx={{
                      fontWeight: 600,
                      borderColor: 'rgba(154,160,166,0.4)', color: textSecondary,
                      '&:hover': { borderColor: gold, color: gold, bgcolor: 'transparent' },
                    }}
                  >
                    Lihat Toko
                  </Button>
                </CardContent>
              </Card>
            </Box>
          </Container>
        </Box>

        {/* ════════════════════ TESTIMONIALS ════════════════════ */}
        <Container maxWidth='lg' sx={{ py: 10 }}>
          <Typography variant='h4' sx={{ fontWeight: 700, textAlign: 'center', mb: 1 }}>Kata Mereka</Typography>
          <Typography variant='body1' sx={{ textAlign: 'center', color: textSecondary, mb: 6 }}>
            Pengalaman gamer yang sudah menggunakan Playfast
          </Typography>
          <Grid container spacing={3}>
            {[
              { name: 'Riski', city: 'Jakarta', text: 'Gila sih, baru bayar langsung dapat akses. Kode Steam Guard-nya instan, nggak perlu nunggu balesan seller kayak biasa. Lima menit udah bisa download game-nya. Mantap banget!' },
              { name: 'Dian', city: 'Surabaya', text: 'Harganya jauh lebih murah dibanding beli langsung di Steam. Satu game AAA cuma Rp 50-100 ribu, padahal harga aslinya bisa ratusan ribu. Worth it banget buat yang mau main game single-player.' },
              { name: 'Fadli', city: 'Bandung', text: 'Awalnya ragu soal kode Steam Guard, takut ribet. Ternyata gampang banget, tinggal klik generate terus copy-paste. Prosesnya smooth, nggak pernah gagal. Recommended!' },
            ].map((t, idx) => (
              <Grid size={{ xs: 12, md: 4 }} key={t.name}>
                <Card sx={{ ...cardSx, height: '100%', animation: `fadeInUp 0.6s ease-out ${0.15 * idx}s both` }}>
                  <CardContent sx={{ p: 3 }}>
                    <Box sx={{ display: 'flex', gap: 0.5, mb: 2 }}>
                      {[1, 2, 3, 4, 5].map(star => (
                        <i key={star} className='tabler-star-filled' style={{ fontSize: 18, color: gold }} />
                      ))}
                    </Box>
                    <Typography variant='body2' sx={{ color: '#c7d5e0', lineHeight: 1.7, mb: 3, fontStyle: 'italic' }}>
                      &ldquo;{t.text}&rdquo;
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Box sx={{
                        width: 40, height: 40, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: `linear-gradient(135deg, rgba(201,168,76,0.2) 0%, rgba(201,168,76,0.05) 100%)`,
                        border: `1px solid rgba(201,168,76,0.25)`,
                      }}>
                        <i className='tabler-user' style={{ fontSize: 20, color: gold }} />
                      </Box>
                      <Box>
                        <Typography variant='subtitle2' sx={{ fontWeight: 700 }}>{t.name}</Typography>
                        <Typography variant='caption' sx={{ color: textSecondary }}>{t.city}</Typography>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>

        {/* ════════════════════ FAQ ════════════════════ */}
        <Box sx={{ py: 10, bgcolor: 'rgba(0,0,0,0.2)' }}>
          <Container maxWidth='md'>
            <Typography variant='h4' sx={{ fontWeight: 700, textAlign: 'center', mb: 1 }}>
              Pertanyaan yang Sering Ditanyakan
            </Typography>
            <Typography variant='body1' sx={{ textAlign: 'center', color: textSecondary, mb: 5 }}>
              Semua yang perlu kamu tahu tentang Playfast
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {faqs.map((faq, idx) => (
                <Card
                  key={idx}
                  sx={{
                    bgcolor: darkCard, border: '1px solid',
                    borderColor: openFaq === idx ? `rgba(201,168,76,0.4)` : darkCardBorder,
                    cursor: 'pointer', transition: 'all 0.2s ease',
                    '&:hover': { borderColor: 'rgba(201,168,76,0.25)' },
                  }}
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                >
                  <CardContent sx={{ py: 2, px: 3, '&:last-child': { pb: openFaq === idx ? 2 : undefined } }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
                      <Typography variant='subtitle1' sx={{ fontWeight: 600 }}>{faq.q}</Typography>
                      <i
                        className={openFaq === idx ? 'tabler-chevron-up' : 'tabler-chevron-down'}
                        style={{ fontSize: 20, color: textSecondary, flexShrink: 0 }}
                      />
                    </Box>
                    <Collapse in={openFaq === idx}>
                      <Typography variant='body2' sx={{ color: textSecondary, mt: 1.5, lineHeight: 1.7 }}>{faq.a}</Typography>
                    </Collapse>
                  </CardContent>
                </Card>
              ))}
            </Box>
          </Container>
        </Box>

        {/* ════════════════════ CTA ════════════════════ */}
        <Box
          sx={{
            py: 10, textAlign: 'center',
            background: `linear-gradient(180deg, transparent 0%, rgba(201,168,76,0.04) 50%, rgba(201,168,76,0.08) 100%)`,
            borderTop: `1px solid ${darkCardBorder}`,
          }}
        >
          <Container maxWidth='sm'>
            <Box component='img' src='/images/brand/icon.png' alt='' sx={{ width: 56, height: 'auto', mx: 'auto', mb: 2, filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.4))' }} />
            <Typography variant='h4' sx={{ fontWeight: 700, mb: 2 }}>Siap Main?</Typography>
            <Typography sx={{ color: textSecondary, mb: 4, lineHeight: 1.7 }}>
              Buat akun gratis dan mulai main dalam hitungan menit. Beli satuan atau subscribe untuk akses semua game.
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button
                component={Link} href='/register' variant='contained' size='large'
                sx={{
                  px: 5, py: 1.5, fontSize: '1rem', fontWeight: 700,
                  bgcolor: gold, color: dark,
                  boxShadow: `0 4px 24px rgba(201,168,76,0.3)`,
                  '&:hover': { bgcolor: goldLight, boxShadow: `0 6px 32px rgba(201,168,76,0.4)` },
                }}
              >
                Daftar Gratis
              </Button>
              <Button
                component={Link} href='/register?redirect=/subscribe' variant='outlined' size='large'
                sx={{
                  px: 4, py: 1.5, fontSize: '1rem', fontWeight: 700,
                  borderColor: 'rgba(201,168,76,0.35)', color: textPrimary,
                  '&:hover': { borderColor: gold, bgcolor: goldGlow },
                }}
                startIcon={<i className='tabler-crown' />}
              >
                Lihat Paket Premium
              </Button>
            </Box>
          </Container>
        </Box>

        {/* ════════════════════ FOOTER ════════════════════ */}
        <Box sx={{ py: 4, textAlign: 'center', borderTop: `1px solid ${darkCardBorder}` }}>
          <Box component='img' src='/images/brand/logo-horizontal.png' alt='Playfast' sx={{ height: 36, mx: 'auto', mb: 2, opacity: 0.7 }} />
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 3, mb: 2, flexWrap: 'wrap' }}>
            {[
              { label: 'Syarat & Ketentuan', href: '/syarat-ketentuan' },
              { label: 'Kebijakan Privasi', href: '/kebijakan-privasi' },
              { label: 'Bantuan', href: '/bantuan' },
            ].map(link => (
              <Typography
                key={link.href} component={Link} href={link.href} variant='body2'
                sx={{ color: textSecondary, textDecoration: 'none', '&:hover': { color: gold } }}
              >
                {link.label}
              </Typography>
            ))}
          </Box>
          <Typography variant='body2' sx={{ color: 'rgba(255,255,255,0.25)' }}>
            {`\u00A9 2026 Playfast. Tidak berafiliasi dengan Valve atau Steam.`}
          </Typography>
        </Box>
      </Box>

      {!loading && !user && <LandingPromoBanner />}
    </Box>
  )
}

export default LandingPage
