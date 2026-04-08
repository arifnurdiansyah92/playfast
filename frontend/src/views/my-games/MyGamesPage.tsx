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

import { storeApi } from '@/lib/api'

const MyGamesPage = () => {
  const router = useRouter()
  const [tab, setTab] = useState(0) // 0 = all, 1 = purchased, 2 = bonus

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
          {purchasedCount} game dibeli{bonusCount > 0 ? ` + ${bonusCount} bonus` : ''}
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
                bgcolor: 'rgba(0,230,118,0.08)', border: '1px solid rgba(0,230,118,0.15)',
              }}
            >
              <i className='tabler-device-gamepad-2' style={{ fontSize: 48, color: '#00E676', opacity: 0.6 }} />
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
            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <Tab label={`Semua (${games.length})`} />
              <Tab label={`Dibeli (${purchasedCount})`} />
              <Tab label={`Bonus (${bonusCount})`} />
            </Tabs>
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
                      borderColor: isBonus ? 'rgba(0,230,118,0.3)' : 'divider',
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
                              bgcolor: 'rgba(0,230,118,0.9)',
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
                          Gratis dari akun yang sama
                        </Typography>
                      )}

                      {!isBonus && (
                        <Typography variant='caption' color='text.secondary' sx={{ mb: 'auto' }}>
                          {game.price ? `${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(game.price)}` : ''}
                        </Typography>
                      )}

                      {/* Action buttons */}
                      <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                        <Button
                          variant='contained'
                          size='small'
                          fullWidth
                          startIcon={<i className='tabler-shield-lock' />}
                          onClick={() => router.push(`/play/${game.order_id}`)}
                          sx={{ fontWeight: 600 }}
                        >
                          Ambil Kode
                        </Button>
                        <Button
                          variant='outlined'
                          size='small'
                          onClick={() => router.push(`/play/${game.order_id}`)}
                          startIcon={<i className='tabler-player-play' />}
                          sx={{ fontWeight: 600, minWidth: 0, px: 2 }}
                        >
                          Main
                        </Button>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              )
            })}
          </Grid>
        </>
      )}
    </div>
  )
}

export default MyGamesPage
