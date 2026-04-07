'use client'

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

import { storeApi } from '@/lib/api'

const MyGamesPage = () => {
  const router = useRouter()

  const { data: orders, isLoading } = useQuery({
    queryKey: ['my-orders'],
    queryFn: () => storeApi.getOrders()
  })

  return (
    <div className='flex flex-col gap-6'>
      <Box>
        <Typography variant='h4' sx={{ fontWeight: 700, mb: 0.5 }}>
          My Games
        </Typography>
        <Typography color='text.secondary'>
          Your purchased games and access credentials
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
                  <Skeleton width={120} height={36} sx={{ mt: 2 }} />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      ) : !orders || orders.length === 0 ? (
        <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
          <CardContent sx={{ textAlign: 'center', py: 10, px: 4 }}>
            <Box
              sx={{
                width: 96,
                height: 96,
                borderRadius: '50%',
                mx: 'auto',
                mb: 3,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'rgba(102,192,244,0.08)',
                border: '1px solid rgba(102,192,244,0.15)',
              }}
            >
              <i className='tabler-device-gamepad-2' style={{ fontSize: 48, color: '#00E676', opacity: 0.6 }} />
            </Box>
            <Typography variant='h5' sx={{ fontWeight: 600, mb: 1 }}>
              No games yet
            </Typography>
            <Typography color='text.secondary' sx={{ mb: 3, maxWidth: 400, mx: 'auto' }}>
              You haven't purchased any games yet. Visit the store to browse our catalog and get your first game!
            </Typography>
            <Button
              variant='contained'
              size='large'
              onClick={() => router.push('/store')}
              startIcon={<i className='tabler-building-store' />}
              sx={{ fontWeight: 700 }}
            >
              Browse Store
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Grid container spacing={3}>
          {orders.map(order => {
            const isRevoked = order.is_revoked
            const headerImage = order.game?.appid
              ? `https://cdn.akamai.steamstatic.com/steam/apps/${order.game.appid}/header.jpg`
              : null

            return (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={order.id}>
                <Card
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    border: '1px solid',
                    borderColor: isRevoked ? 'error.main' : 'divider',
                    transition: 'all 0.25s ease',
                    opacity: isRevoked ? 0.7 : 1,
                    '&:hover': {
                      transform: isRevoked ? 'none' : 'translateY(-3px)',
                      borderColor: isRevoked ? 'error.main' : 'primary.main',
                      boxShadow: isRevoked ? 'none' : '0 8px 24px rgba(0,0,0,0.3)',
                    },
                  }}
                >
                  {/* Game header image */}
                  <Box sx={{ position: 'relative' }}>
                    {headerImage && (
                      <CardMedia
                        component='img'
                        height={140}
                        image={headerImage}
                        alt={order.game?.name || 'Game'}
                        sx={{
                          objectFit: 'cover',
                          filter: isRevoked ? 'grayscale(1) brightness(0.5)' : 'none',
                        }}
                      />
                    )}
                    {/* Status badges */}
                    <Box sx={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 0.5 }}>
                      {isRevoked ? (
                        <Chip
                          label='Revoked'
                          size='small'
                          color='error'
                          icon={<i className='tabler-ban' style={{ fontSize: 14 }} />}
                          sx={{
                            fontWeight: 700,
                            fontSize: '0.7rem',
                            bgcolor: 'rgba(244,67,54,0.9)',
                            backdropFilter: 'blur(4px)',
                          }}
                        />
                      ) : (
                        <Chip
                          label='Active'
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
                      {order.game?.name || 'Unknown Game'}
                    </Typography>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <i className='tabler-user' style={{ fontSize: 14, color: '#8f98a0' }} />
                      <Typography variant='body2' sx={{ fontFamily: 'monospace', color: '#8f98a0' }} noWrap>
                        {order.credentials?.account_name || 'N/A'}
                      </Typography>
                    </Box>

                    <Typography variant='caption' color='text.secondary' sx={{ mb: 'auto' }}>
                      {new Date(order.created_at).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </Typography>

                    {/* Action buttons */}
                    <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                      {!isRevoked && (
                        <Button
                          variant='contained'
                          size='small'
                          fullWidth
                          startIcon={<i className='tabler-shield-lock' />}
                          onClick={() => router.push(`/play/${order.id}`)}
                          sx={{ fontWeight: 600 }}
                        >
                          Get Code
                        </Button>
                      )}
                      <Button
                        variant={isRevoked ? 'contained' : 'outlined'}
                        size='small'
                        fullWidth={isRevoked}
                        onClick={() => router.push(`/play/${order.id}`)}
                        startIcon={<i className='tabler-player-play' />}
                        sx={isRevoked ? { fontWeight: 600 } : { fontWeight: 600, minWidth: 0, px: 2 }}
                        disabled={isRevoked}
                      >
                        {isRevoked ? 'Revoked' : 'Play'}
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            )
          })}
        </Grid>
      )}
    </div>
  )
}

export default MyGamesPage
