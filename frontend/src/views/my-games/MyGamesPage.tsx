'use client'

import { useState } from 'react'

import { useRouter } from 'next/navigation'

import { useQuery } from '@tanstack/react-query'

import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardMedia from '@mui/material/CardMedia'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import Grid from '@mui/material/Grid'
import Skeleton from '@mui/material/Skeleton'
import Chip from '@mui/material/Chip'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'

import { storeApi } from '@/lib/api'

const MyGamesPage = () => {
  const router = useRouter()
  const [tab, setTab] = useState(0) // 0 = all, 1 = purchased, 2 = bonus
  const [bonusInfoOpen, setBonusInfoOpen] = useState(false)

  const { data: games, isLoading } = useQuery({
    queryKey: ['my-games'],
    queryFn: () => storeApi.getMyGames()
  })

  const purchasedCount = games?.filter(g => g.type === 'purchased').length ?? 0
  const bonusCount = games?.filter(g => g.type === 'bonus').length ?? 0

  const filtered = games?.filter(g => {
    if (tab === 1) return g.type === 'purchased'
    if (tab === 2) return g.type === 'bonus'
    return true
  }) ?? []

  return (
    <div className='flex flex-col gap-6'>
      <Box>
        <Typography variant='h4' sx={{ fontWeight: 700, mb: 0.5 }}>
          Game Saya
        </Typography>
        <Typography color='text.secondary'>
          {purchasedCount} game dibeli{bonusCount > 0 ? ` · ${bonusCount} bonus tersedia` : ''}
        </Typography>
      </Box>

      {isLoading ? (
        <Grid container spacing={3}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={i}>
              <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
                <Skeleton variant='rectangular' height={140} />
                <CardContent>
                  <Skeleton width='70%' height={24} />
                  <Skeleton width='50%' height={20} sx={{ mt: 1 }} />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      ) : !games || games.length === 0 ? (
        <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
          <CardContent sx={{ textAlign: 'center', py: 10, px: 4 }}>
            <Box
              sx={{
                width: 96, height: 96, borderRadius: '50%', mx: 'auto', mb: 3,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                bgcolor: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.15)',
              }}
            >
              <i className='tabler-device-gamepad-2' style={{ fontSize: 48, color: '#c9a84c', opacity: 0.6 }} />
            </Box>
            <Typography variant='h5' sx={{ fontWeight: 600, mb: 1 }}>Belum ada game</Typography>
            <Typography color='text.secondary' sx={{ mb: 3, maxWidth: 400, mx: 'auto' }}>
              Cari game di toko untuk mulai bermain
            </Typography>
            <Button variant='contained' size='large' onClick={() => router.push('/store')} startIcon={<i className='tabler-building-store' />} sx={{ fontWeight: 700 }}>
              Cari di Toko
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Tabs filter */}
          {bonusCount > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: 1, borderColor: 'divider' }}>
              <Tabs value={tab} onChange={(_, v) => setTab(v)}>
                <Tab label={`Semua (${games.length})`} />
                <Tab label={`Dibeli (${purchasedCount})`} />
                <Tab label={`Bonus (${bonusCount})`} />
              </Tabs>
              <Typography
                variant='body2'
                onClick={() => setBonusInfoOpen(true)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  color: 'text.secondary',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  '&:hover': { color: 'primary.main' },
                  transition: 'color 0.2s ease',
                }}
              >
                Apa itu game bonus?
                <i className='tabler-info-circle' style={{ fontSize: 16 }} />
              </Typography>
            </Box>
          )}

          <Grid container spacing={3}>
            {filtered.map((game, idx) => {
              const isBonus = game.type === 'bonus'
              const headerImage = `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/header.jpg`

              return (
                <Grid size={{ xs: 12, sm: 6, md: 4 }} key={`${game.id}-${idx}`}>
                  <Card
                    sx={{
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      border: '1px solid',
                      borderColor: isBonus ? 'rgba(201,168,76,0.3)' : 'divider',
                      transition: 'all 0.25s ease',
                      '&:hover': {
                        transform: 'translateY(-3px)',
                        borderColor: isBonus ? 'primary.main' : 'primary.main',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                      },
                    }}
                  >
                    {/* Game header image */}
                    <Box sx={{ position: 'relative' }}>
                      <CardMedia
                        component='img'
                        height={140}
                        image={headerImage}
                        alt={game.name}
                        sx={{ objectFit: 'cover' }}
                      />
                      {/* Badge */}
                      <Box sx={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 0.5 }}>
                        {isBonus ? (
                          <Chip
                            label='BONUS'
                            size='small'
                            icon={<i className='tabler-gift' style={{ fontSize: 14 }} />}
                            sx={{
                              fontWeight: 700,
                              fontSize: '0.7rem',
                              bgcolor: 'rgba(201,168,76,0.9)',
                              color: '#0a0e17',
                              backdropFilter: 'blur(4px)',
                            }}
                          />
                        ) : (
                          <Chip
                            label='Dibeli'
                            size='small'
                            color='success'
                            icon={<i className='tabler-check' style={{ fontSize: 14 }} />}
                            sx={{
                              fontWeight: 600,
                              fontSize: '0.7rem',
                              bgcolor: 'rgba(76,175,80,0.9)',
                              backdropFilter: 'blur(4px)',
                            }}
                          />
                        )}
                      </Box>
                    </Box>

                    {/* Card content */}
                    <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', p: 2.5 }}>
                      <Typography variant='subtitle1' sx={{ fontWeight: 700, mb: 0.5, lineHeight: 1.3 }} noWrap>
                        {game.name}
                      </Typography>

                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        <i className='tabler-user' style={{ fontSize: 14, color: '#8f98a0' }} />
                        <Typography variant='body2' sx={{ fontFamily: 'monospace', color: '#8f98a0' }} noWrap>
                          {game.account_name || 'N/A'}
                        </Typography>
                      </Box>

                      {isBonus && (
                        <Typography variant='caption' sx={{ color: 'primary.main', fontWeight: 600, mb: 'auto' }}>
                          Bonus · Selama akun tersedia
                        </Typography>
                      )}

                      {!isBonus && (
                        <Typography variant='caption' color='text.secondary' sx={{ mb: 'auto' }}>
                          {game.price ? `${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(game.price)}` : ''}
                        </Typography>
                      )}

                      {/* Action button */}
                      <Button
                        variant='contained'
                        size='small'
                        fullWidth
                        startIcon={<i className='tabler-player-play' />}
                        onClick={() => router.push(`/play/${game.order_id}`)}
                        sx={{ fontWeight: 600, mt: 2 }}
                      >
                        Main & Ambil Kode
                      </Button>
                    </CardContent>
                  </Card>
                </Grid>
              )
            })}
          </Grid>
        </>
      )}
      {/* Bonus info dialog */}
      <Dialog open={bonusInfoOpen} onClose={() => setBonusInfoOpen(false)} maxWidth='sm' fullWidth>
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
          <i className='tabler-gift' style={{ fontSize: 24, color: '#c9a84c' }} />
          Apa itu Game Bonus?
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: '8px !important' }}>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Box sx={{ width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(201,168,76,0.08)', flexShrink: 0, mt: 0.5 }}>
              <i className='tabler-gift' style={{ fontSize: 20, color: '#c9a84c' }} />
            </Box>
            <Box>
              <Typography variant='subtitle2' sx={{ fontWeight: 700, mb: 0.5 }}>Apa itu bonus?</Typography>
              <Typography variant='body2' color='text.secondary'>
                Game bonus adalah game tambahan yang kebetulan tersedia di akun Steam yang sama dengan game yang kamu beli. Selama akun tersebut aktif, kamu bisa memainkan game bonus secara gratis.
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', gap: 2 }}>
            <Box sx={{ width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(255,152,0,0.08)', flexShrink: 0, mt: 0.5 }}>
              <i className='tabler-refresh' style={{ fontSize: 20, color: '#ff9800' }} />
            </Box>
            <Box>
              <Typography variant='subtitle2' sx={{ fontWeight: 700, mb: 0.5 }}>Bonus bisa berubah</Typography>
              <Typography variant='body2' color='text.secondary'>
                Akun Steam yang kamu gunakan bisa diganti sewaktu-waktu. Jika akun diganti, game bonus dari akun sebelumnya tidak akan tersedia lagi. Game bonus baru mungkin muncul dari akun pengganti.
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', gap: 2 }}>
            <Box sx={{ width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(102,192,244,0.08)', flexShrink: 0, mt: 0.5 }}>
              <i className='tabler-shield-check' style={{ fontSize: 20, color: '#66c0f4' }} />
            </Box>
            <Box>
              <Typography variant='subtitle2' sx={{ fontWeight: 700, mb: 0.5 }}>Game yang kamu beli tetap aman</Typography>
              <Typography variant='body2' color='text.secondary'>
                Jika terjadi sesuatu pada akun (banned, masalah teknis, dll), kami akan mengganti akun kamu agar tetap bisa memainkan game yang kamu beli. Game bonus tidak termasuk dalam jaminan ini.
              </Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button variant='contained' onClick={() => setBonusInfoOpen(false)} sx={{ fontWeight: 600 }}>
            Mengerti
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  )
}

export default MyGamesPage
