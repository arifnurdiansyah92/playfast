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
import Skeleton from '@mui/material/Skeleton'

import { storeApi, formatIDR } from '@/lib/api'
import type { Game } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

const LandingPage = () => {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [games, setGames] = useState<Game[]>([])
  const [gamesLoading, setGamesLoading] = useState(true)
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  useEffect(() => {
    storeApi.getGames({ page: 1 }).then(data => {
      setGames(data.games.slice(0, 8))
      setGamesLoading(false)
    }).catch(() => setGamesLoading(false))
  }, [])

  // If already logged in, redirect to store
  useEffect(() => {
    if (!loading && user) {
      router.replace('/store')
    }
  }, [loading, user, router])

  const features = [
    { icon: 'tabler-bolt', title: 'Instant Access', desc: 'Get your Steam credentials and guard code immediately after purchase' },
    { icon: 'tabler-shield-lock', title: 'Steam Guard Codes', desc: 'Auto-generated 2FA codes — no waiting for seller to respond' },
    { icon: 'tabler-infinity', title: 'Play Forever', desc: 'Pay once, access forever. No subscriptions or rental timers' },
    { icon: 'tabler-currency-dollar', title: 'Best Prices', desc: 'Starting from Rp 50.000 per game — fraction of the original price' },
  ]

  const steps = [
    { num: '1', title: 'Browse Games', desc: 'Find the game you want from our catalog' },
    { num: '2', title: 'Create Account & Pay', desc: 'Register and complete payment' },
    { num: '3', title: 'Get Credentials', desc: 'Receive Steam username, password & guard code instantly' },
    { num: '4', title: 'Play Offline', desc: 'Login, download, go offline, and enjoy' },
  ]

  const faqs = [
    {
      q: 'How does Playfast work?',
      a: 'Playfast provides you with Steam account credentials that have the game you want already installed. After purchase, you receive a username, password, and auto-generated Steam Guard code. Simply log in to Steam, download the game, switch to offline mode, and play.'
    },
    {
      q: 'Is this a subscription or a one-time purchase?',
      a: 'It is a one-time purchase. Once you buy access to a game, you can use the credentials and generate Steam Guard codes indefinitely. There are no recurring fees or rental timers.'
    },
    {
      q: 'What is a Steam Guard code and why do I need it?',
      a: 'Steam Guard is Steam\'s two-factor authentication system. When you log in from a new device, Steam requires a verification code. Playfast automatically generates these codes for you so you never have to wait for a seller to provide one manually.'
    },
    {
      q: 'Can I play online multiplayer games?',
      a: 'Playfast is designed primarily for offline/single-player gaming. Since accounts are shared, online play may be limited. We recommend using Playfast for story-driven and single-player games for the best experience.'
    },
    {
      q: 'What happens if my access stops working?',
      a: 'If you experience any issues with your access, you can generate a new Steam Guard code from your Play page at any time. If an account-level issue occurs, our system will notify you and we will work to resolve it promptly.'
    },
  ]

  return (
    <Box sx={{ minHeight: '100vh', background: 'linear-gradient(180deg, #0a0e17 0%, #101926 20%, #1b2838 50%, #1b2838 100%)' }}>

      {/* Animated background glow */}
      <Box
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: 'none',
          zIndex: 0,
          overflow: 'hidden',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: '-30%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '140%',
            height: '60%',
            borderRadius: '50%',
            background: 'radial-gradient(ellipse, rgba(102,192,244,0.06) 0%, transparent 70%)',
            animation: 'heroGlow 8s ease-in-out infinite alternate',
          },
          '@keyframes heroGlow': {
            '0%': { opacity: 0.6, transform: 'translateX(-50%) scale(1)' },
            '100%': { opacity: 1, transform: 'translateX(-50%) scale(1.1)' },
          },
        }}
      />

      {/* Content wrapper */}
      <Box sx={{ position: 'relative', zIndex: 1 }}>

        {/* Nav */}
        <Box
          sx={{
            py: 2,
            px: 3,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            maxWidth: 1200,
            mx: 'auto',
            backdropFilter: 'blur(8px)',
          }}
        >
          <Typography variant='h5' sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
            <i className='tabler-brand-steam' style={{ fontSize: 28, color: 'var(--mui-palette-primary-main)' }} />
            Playfast
          </Typography>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Button component={Link} href='/login' variant='text' sx={{ color: '#c7d5e0' }}>
              Sign In
            </Button>
            <Button component={Link} href='/register' variant='contained' size='small'>
              Get Started
            </Button>
          </Box>
        </Box>

        {/* Hero */}
        <Container maxWidth='lg' sx={{ pt: { xs: 8, md: 14 }, pb: 10, textAlign: 'center' }}>
          <Box
            sx={{
              animation: 'fadeInUp 0.8s ease-out',
              '@keyframes fadeInUp': {
                '0%': { opacity: 0, transform: 'translateY(24px)' },
                '100%': { opacity: 1, transform: 'translateY(0)' },
              },
            }}
          >
            <Typography
              variant='h2'
              sx={{
                fontWeight: 800,
                mb: 2.5,
                fontSize: { xs: '2.2rem', sm: '2.8rem', md: '3.5rem' },
                lineHeight: 1.15,
                letterSpacing: '-0.02em',
              }}
            >
              Play Any Steam Game,{' '}
              <Box
                component='span'
                sx={{
                  color: 'primary.main',
                  background: 'linear-gradient(135deg, #66c0f4 0%, #4fa3d7 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Instantly
              </Box>
            </Typography>
            <Typography
              variant='h6'
              sx={{
                color: '#8f98a0',
                mb: 2,
                maxWidth: 620,
                mx: 'auto',
                fontWeight: 400,
                lineHeight: 1.7,
                fontSize: { xs: '1rem', md: '1.15rem' },
              }}
            >
              Get instant access to thousands of Steam games. Auto-generated Steam Guard codes — no waiting, no hassle. Pay once, play forever.
            </Typography>

            {/* Social proof */}
            <Typography
              variant='body2'
              sx={{
                color: '#66c0f4',
                mb: 5,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0.75,
              }}
            >
              <i className='tabler-users' style={{ fontSize: 18 }} />
              Trusted by 500+ gamers across Indonesia
            </Typography>

            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button
                component={Link}
                href='/store'
                variant='contained'
                size='large'
                startIcon={<i className='tabler-search' />}
                sx={{
                  px: 4,
                  py: 1.5,
                  fontSize: '1rem',
                  fontWeight: 700,
                  boxShadow: '0 4px 24px rgba(102,192,244,0.25)',
                  '&:hover': {
                    boxShadow: '0 6px 32px rgba(102,192,244,0.35)',
                  },
                }}
              >
                Browse Games
              </Button>
              <Button
                component={Link}
                href='/register'
                variant='outlined'
                size='large'
                sx={{
                  px: 4,
                  py: 1.5,
                  fontSize: '1rem',
                  fontWeight: 700,
                  borderColor: '#3d5a80',
                  color: '#c7d5e0',
                  '&:hover': { borderColor: '#66c0f4', bgcolor: 'rgba(102,192,244,0.04)' },
                }}
              >
                Create Account
              </Button>
            </Box>
          </Box>

          {/* Stats */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              gap: { xs: 3, md: 6 },
              mt: 8,
              flexWrap: 'wrap',
              animation: 'fadeInUp 0.8s ease-out 0.3s both',
            }}
          >
            {[
              { label: 'Starting from', value: 'Rp 50K' },
              { label: 'Access Duration', value: 'Forever' },
              { label: 'Guard Code', value: 'Instant' },
            ].map(s => (
              <Box key={s.label} sx={{ textAlign: 'center', minWidth: 100 }}>
                <Typography
                  variant='h4'
                  sx={{
                    fontWeight: 800,
                    background: 'linear-gradient(135deg, #66c0f4 0%, #4fa3d7 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  {s.value}
                </Typography>
                <Typography variant='body2' sx={{ color: '#8f98a0', mt: 0.5 }}>{s.label}</Typography>
              </Box>
            ))}
          </Box>
        </Container>

        {/* Features */}
        <Container maxWidth='lg' sx={{ pb: 10 }}>
          <Grid container spacing={3}>
            {features.map((f, idx) => (
              <Grid size={{ xs: 12, sm: 6, md: 3 }} key={f.title}>
                <Card
                  sx={{
                    bgcolor: 'rgba(30,42,58,0.6)',
                    backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(42,63,85,0.6)',
                    height: '100%',
                    transition: 'all 0.3s ease',
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      borderColor: 'rgba(102,192,244,0.3)',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                    },
                    animation: `fadeInUp 0.6s ease-out ${0.1 * idx}s both`,
                  }}
                >
                  <CardContent sx={{ textAlign: 'center', py: 4, px: 3 }}>
                    <Box sx={{
                      width: 60,
                      height: 60,
                      borderRadius: '50%',
                      mx: 'auto',
                      mb: 2.5,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'linear-gradient(135deg, rgba(102,192,244,0.12) 0%, rgba(102,192,244,0.04) 100%)',
                      border: '1px solid rgba(102,192,244,0.2)',
                    }}>
                      <i className={f.icon} style={{ fontSize: 28, color: '#66c0f4' }} />
                    </Box>
                    <Typography variant='subtitle1' sx={{ fontWeight: 700, mb: 1 }}>{f.title}</Typography>
                    <Typography variant='body2' sx={{ color: '#8f98a0', lineHeight: 1.6 }}>{f.desc}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>

        {/* How it Works */}
        <Box sx={{ py: 10, bgcolor: 'rgba(0,0,0,0.15)' }}>
          <Container maxWidth='md'>
            <Typography variant='h4' sx={{ fontWeight: 700, textAlign: 'center', mb: 1 }}>
              How It Works
            </Typography>
            <Typography variant='body1' sx={{ textAlign: 'center', color: '#8f98a0', mb: 6 }}>
              Get playing in four simple steps
            </Typography>
            <Grid container spacing={4}>
              {steps.map((s, idx) => (
                <Grid size={{ xs: 12, sm: 6 }} key={s.num}>
                  <Box
                    sx={{
                      display: 'flex',
                      gap: 2.5,
                      alignItems: 'flex-start',
                      p: 2.5,
                      borderRadius: 2,
                      transition: 'background 0.2s',
                      '&:hover': { bgcolor: 'rgba(102,192,244,0.04)' },
                    }}
                  >
                    <Box sx={{
                      minWidth: 44,
                      height: 44,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'linear-gradient(135deg, #66c0f4 0%, #4fa3d7 100%)',
                      color: '#0a0e17',
                      fontWeight: 800,
                      fontSize: '1.1rem',
                      boxShadow: '0 4px 12px rgba(102,192,244,0.3)',
                    }}>
                      {s.num}
                    </Box>
                    <Box>
                      <Typography variant='subtitle1' sx={{ fontWeight: 700, mb: 0.5 }}>{s.title}</Typography>
                      <Typography variant='body2' sx={{ color: '#8f98a0', lineHeight: 1.6 }}>{s.desc}</Typography>
                    </Box>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* Featured Games */}
        {(gamesLoading || games.length > 0) && (
          <Container maxWidth='lg' sx={{ py: 10 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
              <Box>
                <Typography variant='h4' sx={{ fontWeight: 700 }}>
                  Featured Games
                </Typography>
                <Typography variant='body2' sx={{ color: '#8f98a0', mt: 0.5 }}>
                  Popular titles available right now
                </Typography>
              </Box>
              <Button
                component={Link}
                href='/store'
                variant='text'
                endIcon={<i className='tabler-arrow-right' />}
                sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
              >
                View All
              </Button>
            </Box>
            <Grid container spacing={3}>
              {gamesLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                  <Grid size={{ xs: 12, sm: 6, md: 3 }} key={i}>
                    <Card sx={{ bgcolor: 'rgba(30,42,58,0.6)', border: '1px solid rgba(42,63,85,0.6)' }}>
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
                    <Card
                      sx={{
                        bgcolor: 'rgba(30,42,58,0.6)',
                        border: '1px solid rgba(42,63,85,0.6)',
                        transition: 'all 0.3s ease',
                        '&:hover': {
                          transform: 'translateY(-4px)',
                          borderColor: '#66c0f4',
                          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                        },
                      }}
                    >
                      <CardActionArea onClick={() => router.push(`/game/${game.appid}`)}>
                        <CardMedia
                          component='img'
                          height={130}
                          image={`https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/header.jpg`}
                          alt={game.name}
                          sx={{ objectFit: 'cover' }}
                        />
                        <CardContent sx={{ p: 2 }}>
                          <Typography variant='subtitle2' noWrap sx={{ fontWeight: 600, mb: 0.5 }}>{game.name}</Typography>
                          <Typography variant='h6' color='primary.main' sx={{ fontWeight: 700 }}>
                            {formatIDR(game.price)}
                          </Typography>
                        </CardContent>
                      </CardActionArea>
                    </Card>
                  </Grid>
                ))}
            </Grid>
            <Box sx={{ textAlign: 'center', mt: 4, display: { xs: 'block', sm: 'none' } }}>
              <Button component={Link} href='/store' variant='outlined' endIcon={<i className='tabler-arrow-right' />}>
                View All Games
              </Button>
            </Box>
          </Container>
        )}

        {/* FAQ Section */}
        <Box sx={{ py: 10, bgcolor: 'rgba(0,0,0,0.15)' }}>
          <Container maxWidth='md'>
            <Typography variant='h4' sx={{ fontWeight: 700, textAlign: 'center', mb: 1 }}>
              Frequently Asked Questions
            </Typography>
            <Typography variant='body1' sx={{ textAlign: 'center', color: '#8f98a0', mb: 5 }}>
              Everything you need to know about Playfast
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {faqs.map((faq, idx) => (
                <Card
                  key={idx}
                  sx={{
                    bgcolor: 'rgba(30,42,58,0.5)',
                    border: '1px solid',
                    borderColor: openFaq === idx ? 'rgba(102,192,244,0.3)' : 'rgba(42,63,85,0.6)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    '&:hover': { borderColor: 'rgba(102,192,244,0.2)' },
                  }}
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                >
                  <CardContent sx={{ py: 2, px: 3, '&:last-child': { pb: openFaq === idx ? 2 : undefined } }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
                      <Typography variant='subtitle1' sx={{ fontWeight: 600 }}>
                        {faq.q}
                      </Typography>
                      <i
                        className={openFaq === idx ? 'tabler-chevron-up' : 'tabler-chevron-down'}
                        style={{ fontSize: 20, color: '#8f98a0', flexShrink: 0 }}
                      />
                    </Box>
                    <Collapse in={openFaq === idx}>
                      <Typography variant='body2' sx={{ color: '#8f98a0', mt: 1.5, lineHeight: 1.7 }}>
                        {faq.a}
                      </Typography>
                    </Collapse>
                  </CardContent>
                </Card>
              ))}
            </Box>
          </Container>
        </Box>

        {/* CTA */}
        <Box
          sx={{
            py: 10,
            textAlign: 'center',
            background: 'linear-gradient(180deg, rgba(102,192,244,0.03) 0%, rgba(102,192,244,0.08) 100%)',
            borderTop: '1px solid rgba(42,63,85,0.6)',
          }}
        >
          <Container maxWidth='sm'>
            <i className='tabler-rocket' style={{ fontSize: 48, color: '#66c0f4', marginBottom: 16 }} />
            <Typography variant='h4' sx={{ fontWeight: 700, mb: 2 }}>
              Ready to Play?
            </Typography>
            <Typography sx={{ color: '#8f98a0', mb: 4, lineHeight: 1.7 }}>
              Create your free account and start playing in under a minute. No credit card required.
            </Typography>
            <Button
              component={Link}
              href='/register'
              variant='contained'
              size='large'
              sx={{
                px: 5,
                py: 1.5,
                fontSize: '1rem',
                fontWeight: 700,
                boxShadow: '0 4px 24px rgba(102,192,244,0.25)',
                '&:hover': {
                  boxShadow: '0 6px 32px rgba(102,192,244,0.35)',
                },
              }}
            >
              Get Started Free
            </Button>
          </Container>
        </Box>

        {/* Footer */}
        <Box sx={{ py: 4, textAlign: 'center', borderTop: '1px solid #1e2a3a' }}>
          <Typography variant='body2' sx={{ color: '#4a5568' }}>
            Playfast {new Date().getFullYear()}. Not affiliated with Valve or Steam.
          </Typography>
        </Box>
      </Box>
    </Box>
  )
}

export default LandingPage
