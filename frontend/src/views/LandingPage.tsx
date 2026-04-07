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
    // Try featured first, fall back to first page of all games
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

  // If already logged in, redirect to store
  useEffect(() => {
    if (!loading && user) {
      router.replace('/store')
    }
  }, [loading, user, router])

  const features = [
    { icon: 'tabler-bolt', title: 'Akses Instan', desc: 'Dapatkan kredensial Steam dan kode guard langsung setelah pembelian' },
    { icon: 'tabler-shield-lock', title: 'Kode Steam Guard', desc: 'Kode 2FA otomatis — nggak perlu nunggu seller bales' },
    { icon: 'tabler-infinity', title: 'Main Selamanya', desc: 'Bayar sekali, akses selamanya. Tanpa langganan atau batas waktu' },
    { icon: 'tabler-currency-dollar', title: 'Harga Terjangkau', desc: 'Mulai dari Rp 50.000 per game — jauh lebih murah dari harga asli' },
  ]

  const steps = [
    { num: '1', title: 'Cari Game', desc: 'Temukan game yang kamu mau dari katalog kami' },
    { num: '2', title: 'Daftar & Bayar', desc: 'Buat akun dan selesaikan pembayaran' },
    { num: '3', title: 'Dapat Akses Login', desc: 'Terima username, password & kode guard Steam secara instan' },
    { num: '4', title: 'Main Offline', desc: 'Login, download, masuk offline mode, dan nikmati' },
  ]

  const faqs = [
    {
      q: 'Bagaimana cara kerja Playfast?',
      a: 'Playfast menyediakan kredensial akun Steam yang sudah terinstall game yang kamu inginkan. Setelah pembelian, kamu akan menerima username, password, dan kode Steam Guard otomatis. Tinggal login ke Steam, download game-nya, masuk offline mode, dan langsung main.'
    },
    {
      q: 'Ini langganan atau beli putus?',
      a: 'Ini beli putus. Begitu kamu beli akses ke sebuah game, kamu bisa pakai kredensial dan generate kode Steam Guard tanpa batas waktu. Nggak ada biaya berulang atau timer sewa.'
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
            background: 'radial-gradient(ellipse, rgba(0,230,118,0.06) 0%, transparent 70%)',
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
              Masuk
            </Button>
            <Button component={Link} href='/register' variant='contained' size='small'>
              Daftar
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
              Main Game Steam Apapun,{' '}
              <Box
                component='span'
                sx={{
                  color: 'primary.main',
                  background: 'linear-gradient(135deg, #00E676 0%, #00C853 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Langsung Main!
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
              Akses ribuan game Steam secara instan. Kode Steam Guard otomatis — tanpa ribet. Bayar sekali, main selamanya.
            </Typography>

            {/* Social proof */}
            <Typography
              variant='body2'
              sx={{
                color: '#00E676',
                mb: 5,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0.75,
              }}
            >
              <i className='tabler-users' style={{ fontSize: 18 }} />
              Dipercaya 500+ gamer di seluruh Indonesia
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
                  boxShadow: '0 4px 24px rgba(0,230,118,0.25)',
                  '&:hover': {
                    boxShadow: '0 6px 32px rgba(0,230,118,0.35)',
                  },
                }}
              >
                Cari Game
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
                  '&:hover': { borderColor: '#00E676', bgcolor: 'rgba(0,230,118,0.04)' },
                }}
              >
                Buat Akun
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
              { label: 'Mulai dari', value: 'Rp 50K' },
              { label: 'Durasi Akses', value: 'Selamanya' },
              { label: 'Kode Guard', value: 'Instan' },
            ].map(s => (
              <Box key={s.label} sx={{ textAlign: 'center', minWidth: 100 }}>
                <Typography
                  variant='h4'
                  sx={{
                    fontWeight: 800,
                    background: 'linear-gradient(135deg, #00E676 0%, #00C853 100%)',
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
                      borderColor: 'rgba(0,230,118,0.3)',
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
                      background: 'linear-gradient(135deg, rgba(0,230,118,0.12) 0%, rgba(0,230,118,0.04) 100%)',
                      border: '1px solid rgba(0,230,118,0.2)',
                    }}>
                      <i className={f.icon} style={{ fontSize: 28, color: '#00E676' }} />
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
              Cara Mainnya
            </Typography>
            <Typography variant='body1' sx={{ textAlign: 'center', color: '#8f98a0', mb: 6 }}>
              Mulai main dalam empat langkah mudah
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
                      '&:hover': { bgcolor: 'rgba(0,230,118,0.04)' },
                    }}
                  >
                    <Box sx={{
                      minWidth: 44,
                      height: 44,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'linear-gradient(135deg, #00E676 0%, #00C853 100%)',
                      color: '#0a0e17',
                      fontWeight: 800,
                      fontSize: '1.1rem',
                      boxShadow: '0 4px 12px rgba(0,230,118,0.3)',
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
                  Game Pilihan
                </Typography>
                <Typography variant='body2' sx={{ color: '#8f98a0', mt: 0.5 }}>
                  Judul populer yang tersedia sekarang
                </Typography>
              </Box>
              <Button
                component={Link}
                href='/store'
                variant='text'
                endIcon={<i className='tabler-arrow-right' />}
                sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
              >
                Lihat Semua
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
                          borderColor: '#00E676',
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
                Lihat Semua Game
              </Button>
            </Box>
          </Container>
        )}

        {/* FAQ Section */}
        <Box sx={{ py: 10, bgcolor: 'rgba(0,0,0,0.15)' }}>
          <Container maxWidth='md'>
            <Typography variant='h4' sx={{ fontWeight: 700, textAlign: 'center', mb: 1 }}>
              Pertanyaan yang Sering Ditanyakan
            </Typography>
            <Typography variant='body1' sx={{ textAlign: 'center', color: '#8f98a0', mb: 5 }}>
              Semua yang perlu kamu tahu tentang Playfast
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {faqs.map((faq, idx) => (
                <Card
                  key={idx}
                  sx={{
                    bgcolor: 'rgba(30,42,58,0.5)',
                    border: '1px solid',
                    borderColor: openFaq === idx ? 'rgba(0,230,118,0.3)' : 'rgba(42,63,85,0.6)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    '&:hover': { borderColor: 'rgba(0,230,118,0.2)' },
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
            background: 'linear-gradient(180deg, rgba(0,230,118,0.03) 0%, rgba(0,230,118,0.08) 100%)',
            borderTop: '1px solid rgba(42,63,85,0.6)',
          }}
        >
          <Container maxWidth='sm'>
            <i className='tabler-rocket' style={{ fontSize: 48, color: '#00E676', marginBottom: 16 }} />
            <Typography variant='h4' sx={{ fontWeight: 700, mb: 2 }}>
              Siap Main?
            </Typography>
            <Typography sx={{ color: '#8f98a0', mb: 4, lineHeight: 1.7 }}>
              Buat akun gratis dan mulai main dalam hitungan menit.
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
                boxShadow: '0 4px 24px rgba(0,230,118,0.25)',
                '&:hover': {
                  boxShadow: '0 6px 32px rgba(0,230,118,0.35)',
                },
              }}
            >
              Daftar Gratis
            </Button>
          </Container>
        </Box>

        {/* Footer */}
        <Box sx={{ py: 4, textAlign: 'center', borderTop: '1px solid #1e2a3a' }}>
          <Typography variant='body2' sx={{ color: '#4a5568' }}>
            Playfast {new Date().getFullYear()}. Tidak berafiliasi dengan Valve atau Steam.
          </Typography>
        </Box>
      </Box>
    </Box>
  )
}

export default LandingPage
