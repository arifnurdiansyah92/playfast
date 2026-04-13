'use client'

import { useState, useRef } from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { useQuery } from '@tanstack/react-query'

import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardMedia from '@mui/material/CardMedia'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import Skeleton from '@mui/material/Skeleton'
import Divider from '@mui/material/Divider'
import Breadcrumbs from '@mui/material/Breadcrumbs'
import IconButton from '@mui/material/IconButton'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Grid from '@mui/material/Grid'

import { storeApi, formatIDR, gameHeaderImage, gameThumbnail, handleImageError } from '@/lib/api'
import type { ApiError } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

interface Props {
  appid: string
}

const GameDetailPage = ({ appid }: Props) => {
  const router = useRouter()
  const { user } = useAuth()
  const [buying, setBuying] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState('')
  const [selectedMedia, setSelectedMedia] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  const { data: game, isLoading } = useQuery({
    queryKey: ['game', appid],
    queryFn: () => storeApi.getGame(appid)
  })

  // Check if user already owns the game (only when logged in)
  const { data: orders } = useQuery({
    queryKey: ['my-orders'],
    queryFn: () => storeApi.getOrders(),
    enabled: !!user
  })

  const { data: subStatus } = useQuery({
    queryKey: ['subscription-status'],
    queryFn: () => storeApi.getSubscriptionStatus(),
    enabled: !!user,
  })

  const isSubscribed = subStatus?.is_subscribed ?? false

  const existingOrder = orders?.find(o => String(o.game?.appid) === String(appid))

  const handleBuy = async () => {
    // Force register if not logged in
    if (!user) {
      router.push(`/register?redirect=/game/${appid}`)
      return
    }

    setError('')
    setBuying(true)

    try {
      const result = await storeApi.createOrder(appid)

      if (result.payment_mode === 'subscription') {
        router.push(`/play/${result.order.id}`)
        return
      }

      const { order, payment_mode, snap_token } = result

      if (payment_mode === 'midtrans' && snap_token && typeof window !== 'undefined' && (window as any).snap) {
        // Midtrans Snap popup
        (window as any).snap.pay(snap_token, {
          onSuccess: () => router.push(`/order/${order.id}`),
          onPending: () => router.push(`/order/${order.id}`),
          onError: () => setError('Pembayaran gagal. Silakan coba lagi.'),
          onClose: () => setBuying(false)
        })
      } else {
        // Manual mode or fallback — go to order page
        router.push(`/order/${order.id}`)
      }
    } catch (err) {
      const apiErr = err as ApiError

      setError(apiErr.message || 'Gagal membeli game')
      setBuying(false)
    }
  }

  if (isLoading) {
    return (
      <div className='flex flex-col gap-6'>
        <Skeleton width={200} height={24} />
        <Card>
          <Grid container>
            <Grid size={{ xs: 12, md: 5 }}>
              <Skeleton variant='rectangular' height={280} />
            </Grid>
            <Grid size={{ xs: 12, md: 7 }}>
              <CardContent sx={{ p: 4 }}>
                <Skeleton width='70%' height={40} />
                <Skeleton width='40%' height={30} sx={{ mt: 2 }} />
                <Skeleton width='100%' height={20} sx={{ mt: 3 }} />
                <Skeleton width='80%' height={20} sx={{ mt: 1 }} />
                <Skeleton width={200} height={48} sx={{ mt: 4 }} />
              </CardContent>
            </Grid>
          </Grid>
        </Card>
      </div>
    )
  }

  if (!game) {
    return (
      <div className='flex flex-col gap-4'>
        <Breadcrumbs sx={{ color: 'text.secondary' }}>
          <Link href='/store' style={{ color: 'inherit', textDecoration: 'none' }}>
            Toko
          </Link>
          <Typography color='text.primary'>Tidak Ditemukan</Typography>
        </Breadcrumbs>
        <Alert severity='error' sx={{ mb: 2 }}>Game tidak ditemukan atau sudah dihapus</Alert>
        <Button component={Link} href='/store' variant='contained' startIcon={<i className='tabler-building-store' />}>
          Kembali ke Toko
        </Button>
      </div>
    )
  }

  const headerImage = gameHeaderImage(game.appid)
  const genreList = game.genres ? game.genres.split(',').map(g => g.trim()).filter(Boolean) : []

  return (
    <div className='flex flex-col gap-5'>
      {/* Breadcrumb */}
      <Breadcrumbs
        separator={<i className='tabler-chevron-right' style={{ fontSize: 14, color: '#8f98a0' }} />}
        sx={{ '& a': { color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } } }}
      >
        <Link href='/store'>Toko</Link>
        <Typography color='text.primary' sx={{ fontWeight: 600 }}>{game.name}</Typography>
      </Breadcrumbs>

      {/* Main card */}
      <Card sx={{ border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
        <Grid container>
          {/* Image side */}
          <Grid size={{ xs: 12, md: 5 }}>
            <CardMedia
              component='img'
              image={headerImage}
              alt={game.name}
              onError={handleImageError}
              sx={{
                height: { xs: 220, sm: 280, md: '100%' },
                minHeight: { md: 320 },
                objectFit: 'cover',
              }}
            />
          </Grid>

          {/* Info side */}
          <Grid size={{ xs: 12, md: 7 }}>
            <CardContent sx={{ p: { xs: 3, md: 4 }, display: 'flex', flexDirection: 'column', height: '100%' }}>
              <Box sx={{ flexGrow: 1 }}>
                <Typography variant='h4' sx={{ fontWeight: 700, mb: 0.5, lineHeight: 1.2 }}>
                  {game.name}
                </Typography>

                <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
                  App ID: {game.appid}
                </Typography>

                {/* Genre chips */}
                {genreList.length > 0 && (
                  <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 2.5 }}>
                    {genreList.map(genre => (
                      <Chip
                        key={genre}
                        label={genre}
                        size='small'
                        variant='outlined'
                        sx={{
                          borderColor: 'rgba(201,168,76,0.3)',
                          color: '#8f98a0',
                          fontSize: '0.75rem',
                          fontWeight: 500,
                        }}
                      />
                    ))}
                  </Box>
                )}

                {/* Description */}
                {game.description && (
                  <Typography
                    variant='body2'
                    sx={{
                      color: '#8f98a0',
                      lineHeight: 1.7,
                      mb: 2.5,
                      maxHeight: 120,
                      overflow: 'auto',
                    }}
                  >
                    {game.description}
                  </Typography>
                )}

                <Divider sx={{ my: 2 }} />

                {/* Price */}
                <Typography variant='h3' color='primary.main' sx={{ fontWeight: 700, mb: 3 }}>
                  {formatIDR(game.price)}
                </Typography>
              </Box>

              {/* Action area */}
              {error && (
                <Alert severity='error' sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}

              {existingOrder ? (
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Chip
                    label='Sudah Dimiliki'
                    color='info'
                    variant='tonal'
                    icon={<i className='tabler-check' style={{ fontSize: 16 }} />}
                  />
                  <Button
                    variant='contained'
                    size='large'
                    startIcon={<i className='tabler-player-play' />}
                    onClick={() => router.push(`/play/${existingOrder.id}`)}
                  >
                    Buka Halaman Main
                  </Button>
                </Box>
              ) : user && isSubscribed ? (
                <Button
                  variant='contained'
                  size='large'
                  disabled={buying}
                  onClick={handleBuy}
                  startIcon={<i className='tabler-player-play' />}
                  sx={{
                    minWidth: 220, py: 1.5, fontSize: '1rem', fontWeight: 700,
                    boxShadow: '0 4px 16px rgba(201,168,76,0.2)',
                    '&:hover': { boxShadow: '0 6px 24px rgba(201,168,76,0.3)' },
                  }}
                >
                  {buying ? 'Memproses...' : 'Main Sekarang (Premium)'}
                </Button>
              ) : user ? (
                <Button
                  variant='contained'
                  size='large'
                  disabled={buying}
                  onClick={() => setConfirmOpen(true)}
                  startIcon={<i className='tabler-shopping-cart' />}
                  sx={{
                    minWidth: 220, py: 1.5, fontSize: '1rem', fontWeight: 700,
                    boxShadow: '0 4px 16px rgba(201,168,76,0.2)',
                    '&:hover': { boxShadow: '0 6px 24px rgba(201,168,76,0.3)' },
                  }}
                >
                  {buying ? 'Memproses...' : 'Dapatkan Game Ini'}
                </Button>
              ) : (
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  <Button
                    component={Link}
                    href={`/login?redirect=/game/${appid}`}
                    variant='contained'
                    size='large'
                    startIcon={<i className='tabler-login' />}
                    sx={{
                      py: 1.5, fontSize: '1rem', fontWeight: 700,
                      boxShadow: '0 4px 16px rgba(201,168,76,0.2)',
                      '&:hover': { boxShadow: '0 6px 24px rgba(201,168,76,0.3)' },
                    }}
                  >
                    Masuk untuk Beli
                  </Button>
                  <Button
                    component={Link}
                    href={`/register?redirect=/game/${appid}`}
                    variant='outlined'
                    size='large'
                    startIcon={<i className='tabler-user-plus' />}
                    sx={{ py: 1.5, fontSize: '1rem', fontWeight: 700 }}
                  >
                    Daftar
                  </Button>
                </Box>
              )}
            </CardContent>
          </Grid>
        </Grid>
      </Card>

      {/* Media Gallery */}
      {(() => {
        const mediaItems: { type: 'video' | 'screenshot'; thumbnail: string; full: string; mp4?: string; name?: string }[] = []
        for (const mv of game.movies ?? []) {
          mediaItems.push({ type: 'video', thumbnail: mv.thumbnail, full: mv.thumbnail, mp4: mv.mp4_max || mv.mp4_480, name: mv.name })
        }
        for (const ss of game.screenshots ?? []) {
          mediaItems.push({ type: 'screenshot', thumbnail: ss.thumbnail, full: ss.full })
        }
        if (mediaItems.length === 0) return null

        const current = mediaItems[selectedMedia] || mediaItems[0]

        return (
          <Card sx={{ border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
            {/* Main viewer */}
            <Box
              sx={{ position: 'relative', bgcolor: '#000', cursor: 'pointer' }}
              onClick={() => { if (current.type === 'screenshot') setLightboxOpen(true) }}
            >
              {current.type === 'video' && current.mp4 ? (
                <video
                  key={current.mp4}
                  controls
                  autoPlay
                  style={{ width: '100%', maxHeight: 480, display: 'block' }}
                  poster={current.thumbnail}
                >
                  <source src={current.mp4} type='video/mp4' />
                </video>
              ) : (
                <Box
                  component='img'
                  src={current.full}
                  alt={current.name || game.name}
                  onError={handleImageError}
                  sx={{ width: '100%', maxHeight: 480, objectFit: 'contain', display: 'block' }}
                />
              )}
            </Box>

            {/* Thumbnail strip */}
            <Box
              sx={{
                display: 'flex',
                gap: 0.5,
                p: 1,
                overflowX: 'auto',
                bgcolor: 'background.paper',
                '&::-webkit-scrollbar': { height: 4 },
                '&::-webkit-scrollbar-thumb': { bgcolor: 'divider', borderRadius: 2 },
              }}
            >
              {mediaItems.map((item, idx) => (
                <Box
                  key={idx}
                  onClick={() => setSelectedMedia(idx)}
                  sx={{
                    flexShrink: 0,
                    width: 120,
                    height: 68,
                    borderRadius: 0.5,
                    overflow: 'hidden',
                    cursor: 'pointer',
                    border: '2px solid',
                    borderColor: idx === selectedMedia ? 'primary.main' : 'transparent',
                    opacity: idx === selectedMedia ? 1 : 0.6,
                    transition: 'all 0.2s ease',
                    '&:hover': { opacity: 1 },
                    position: 'relative',
                  }}
                >
                  <Box
                    component='img'
                    src={item.thumbnail}
                    alt=''
                    onError={handleImageError}
                    sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  {item.type === 'video' && (
                    <Box sx={{
                      position: 'absolute', inset: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      bgcolor: 'rgba(0,0,0,0.3)',
                    }}>
                      <i className='tabler-player-play-filled' style={{ fontSize: 20, color: '#fff' }} />
                    </Box>
                  )}
                </Box>
              ))}
            </Box>
          </Card>
        )
      })()}

      {/* Screenshot lightbox */}
      <Dialog open={lightboxOpen} onClose={() => setLightboxOpen(false)} maxWidth='xl' fullWidth
        slotProps={{ paper: { sx: { bgcolor: '#000', backgroundImage: 'none' } } }}
      >
        {(() => {
          const mediaItems: { type: 'video' | 'screenshot'; full: string }[] = []
          for (const mv of game.movies ?? []) mediaItems.push({ type: 'video', full: mv.thumbnail })
          for (const ss of game.screenshots ?? []) mediaItems.push({ type: 'screenshot', full: ss.full })
          const current = mediaItems[selectedMedia]
          if (!current) return null
          return (
            <Box sx={{ position: 'relative' }}>
              <Box
                component='img'
                src={current.full}
                alt=''
                sx={{ width: '100%', maxHeight: '85vh', objectFit: 'contain', display: 'block' }}
              />
              <IconButton
                onClick={() => setLightboxOpen(false)}
                sx={{ position: 'absolute', top: 8, right: 8, color: '#fff', bgcolor: 'rgba(0,0,0,0.5)' }}
              >
                <i className='tabler-x' />
              </IconButton>
              {selectedMedia > 0 && (
                <IconButton
                  onClick={() => setSelectedMedia(selectedMedia - 1)}
                  sx={{ position: 'absolute', top: '50%', left: 8, transform: 'translateY(-50%)', color: '#fff', bgcolor: 'rgba(0,0,0,0.5)' }}
                >
                  <i className='tabler-chevron-left' />
                </IconButton>
              )}
              {selectedMedia < mediaItems.length - 1 && (
                <IconButton
                  onClick={() => setSelectedMedia(selectedMedia + 1)}
                  sx={{ position: 'absolute', top: '50%', right: 8, transform: 'translateY(-50%)', color: '#fff', bgcolor: 'rgba(0,0,0,0.5)' }}
                >
                  <i className='tabler-chevron-right' />
                </IconButton>
              )}
            </Box>
          )
        })()}
      </Dialog>

      {/* Features */}
      <Grid container spacing={2}>
        {[
          { icon: 'tabler-bolt', title: 'Akses Instan', desc: 'Dapatkan kredensial langsung setelah pembelian' },
          { icon: 'tabler-shield-lock', title: 'Steam Guard', desc: 'Kode 2FA otomatis, tanpa ribet' },
          { icon: 'tabler-infinity', title: 'Main Selamanya', desc: 'Bayar sekali, akses selamanya' },
        ].map(f => (
          <Grid size={{ xs: 12, sm: 4 }} key={f.title}>
            <Card sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2.5 }}>
                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: 'rgba(201,168,76,0.08)',
                    flexShrink: 0,
                  }}
                >
                  <i className={f.icon} style={{ fontSize: 22, color: '#c9a84c' }} />
                </Box>
                <Box>
                  <Typography variant='subtitle2' sx={{ fontWeight: 700 }}>{f.title}</Typography>
                  <Typography variant='caption' color='text.secondary'>{f.desc}</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Purchase confirmation dialog */}
      {game && (
        <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth='xs' fullWidth>
          <DialogTitle sx={{ fontWeight: 700 }}>Konfirmasi Pembelian</DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2 }}>
              <Box
                component='img'
                src={gameThumbnail(game.appid)}
                alt={game.name}
                onError={handleImageError}
                sx={{ width: 80, height: 38, borderRadius: 0.5, objectFit: 'cover' }}
              />
              <Box>
                <Typography variant='subtitle2' sx={{ fontWeight: 600 }}>{game.name}</Typography>
                <Typography variant='h6' color='primary.main' sx={{ fontWeight: 700 }}>{formatIDR(game.price)}</Typography>
              </Box>
            </Box>
            <Typography variant='body2' color='text.secondary'>
              Akses berlaku selamanya. Kode Steam Guard otomatis tersedia setelah pembayaran.
            </Typography>
          </DialogContent>
          <DialogActions sx={{ p: 3, pt: 1 }}>
            <Button onClick={() => setConfirmOpen(false)}>Batal</Button>
            <Button
              variant='contained'
              disabled={buying}
              onClick={() => { setConfirmOpen(false); handleBuy() }}
              startIcon={<i className='tabler-shopping-cart' />}
            >
              {buying ? 'Memproses...' : 'Beli Sekarang'}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </div>
  )
}

export default GameDetailPage
