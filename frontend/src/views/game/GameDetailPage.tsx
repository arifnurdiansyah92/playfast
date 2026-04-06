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
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import Skeleton from '@mui/material/Skeleton'
import Divider from '@mui/material/Divider'

import { storeApi, formatIDR } from '@/lib/api'
import type { ApiError } from '@/lib/api'

interface Props {
  appid: string
}

const GameDetailPage = ({ appid }: Props) => {
  const router = useRouter()
  const [buying, setBuying] = useState(false)
  const [error, setError] = useState('')

  const { data: game, isLoading } = useQuery({
    queryKey: ['game', appid],
    queryFn: () => storeApi.getGame(appid)
  })

  // Check if user already owns the game
  const { data: orders } = useQuery({
    queryKey: ['my-orders'],
    queryFn: () => storeApi.getOrders()
  })

  const existingOrder = orders?.find(o => String(o.game_appid) === String(appid))

  const handleBuy = async () => {
    setError('')
    setBuying(true)

    try {
      const order = await storeApi.createOrder(appid)

      router.push(`/play/${order.id}`)
    } catch (err) {
      const apiErr = err as ApiError

      setError(apiErr.message || 'Failed to purchase game')
    } finally {
      setBuying(false)
    }
  }

  if (isLoading) {
    return (
      <Card>
        <Skeleton variant='rectangular' height={300} />
        <CardContent>
          <Skeleton width='60%' height={40} />
          <Skeleton width='30%' height={30} sx={{ mt: 2 }} />
          <Skeleton width='40%' height={30} sx={{ mt: 1 }} />
        </CardContent>
      </Card>
    )
  }

  if (!game) {
    return (
      <Alert severity='error'>Game not found</Alert>
    )
  }

  const headerImage = game.header_image_url || `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/header.jpg`

  return (
    <div className='flex flex-col gap-6'>
      <Button
        variant='text'
        startIcon={<i className='tabler-arrow-left' />}
        onClick={() => router.push('/store')}
        sx={{ alignSelf: 'flex-start' }}
      >
        Back to Store
      </Button>

      <Card>
        <CardMedia
          component='img'
          height={300}
          image={headerImage}
          alt={game.name}
          sx={{ objectFit: 'cover' }}
        />
        <CardContent sx={{ p: 6 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 3 }}>
            <Box>
              <Typography variant='h4' sx={{ fontWeight: 700, mb: 1 }}>
                {game.name}
              </Typography>
              <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
                App ID: {game.appid}
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant='h3' color='primary.main' sx={{ fontWeight: 700 }}>
                {formatIDR(game.price)}
              </Typography>
            </Box>
          </Box>

          <Divider sx={{ my: 3 }} />

          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 3 }}>
            <Chip
              icon={<i className='tabler-users' style={{ fontSize: 16 }} />}
              label={`${game.available_slots} slot${game.available_slots !== 1 ? 's' : ''} available`}
              color={game.available_slots > 0 ? 'success' : 'error'}
              variant='tonal'
            />
          </Box>

          {error && (
            <Alert severity='error' sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          {existingOrder ? (
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <Chip label='Already Owned' color='info' variant='tonal' icon={<i className='tabler-check' style={{ fontSize: 16 }} />} />
              <Button
                variant='contained'
                size='large'
                startIcon={<i className='tabler-player-play' />}
                onClick={() => router.push(`/play/${existingOrder.id}`)}
              >
                Go to Play Page
              </Button>
            </Box>
          ) : (
            <Button
              variant='contained'
              size='large'
              disabled={game.available_slots === 0 || buying}
              onClick={handleBuy}
              startIcon={<i className='tabler-shopping-cart' />}
              sx={{ minWidth: 200 }}
            >
              {buying ? 'Processing...' : game.available_slots === 0 ? 'Sold Out' : 'Get This Game'}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default GameDetailPage
