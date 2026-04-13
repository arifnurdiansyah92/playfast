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

            <Typography
              variant='h2'
              sx={{
                fontWeight: 800, mb: 2.5,
                fontSize: { xs: '2.2rem', sm: '2.8rem', md: '3.5rem' },
                lineHeight: 1.15, letterSpacing: '-0.02em',
              }}
            >
              Main Game Steam Apapun,{' '}
              <Box
                component='span'
                sx={{
                  background: `linear-gradient(135deg, ${goldLight} 0%, ${gold} 100%)`,
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
                color: textSecondary, mb: 2, maxWidth: 620, mx: 'auto',
                fontWeight: 400, lineHeight: 1.7, fontSize: { xs: '1rem', md: '1.15rem' },
              }}
            >
              Akses ribuan game Steam secara instan. Kode Steam Guard otomatis — tanpa ribet. Bayar sekali, main selamanya.
            </Typography>

            {/* Social proof */}
            <Typography variant='body2' sx={{ color: gold, mb: 5, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75 }}>
              <i className='tabler-users' style={{ fontSize: 18 }} />
              Dipercaya 500+ gamer di seluruh Indonesia
            </Typography>

            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button
                component={Link} href='/store' variant='contained' size='large'
                startIcon={<i className='tabler-search' />}
                sx={{
                  px: 4, py: 1.5, fontSize: '1rem', fontWeight: 700,
                  bgcolor: gold, color: dark,
                  boxShadow: `0 4px 24px rgba(201,168,76,0.3)`,
                  '&:hover': { bgcolor: goldLight, boxShadow: `0 6px 32px rgba(201,168,76,0.4)` },
                }}
              >
                Cari Game
              </Button>
              <Button
                component={Link} href='/register' variant='outlined' size='large'
                sx={{
                  px: 4, py: 1.5, fontSize: '1rem', fontWeight: 700,
                  borderColor: 'rgba(201,168,76,0.35)', color: textPrimary,
                  '&:hover': { borderColor: gold, bgcolor: goldGlow },
                }}
              >
                Buat Akun
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
              { label: 'Mulai dari', value: 'Rp 50K' },
              { label: 'Durasi Akses', value: 'Selamanya' },
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
                            image={gameHeaderImage(game.appid)}
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
              Buat akun gratis dan mulai main dalam hitungan menit.
            </Typography>
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
    </Box>
  )
}

export default LandingPage
