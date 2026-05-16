'use client'

import Link from 'next/link'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Alert from '@mui/material/Alert'
import Skeleton from '@mui/material/Skeleton'
import Divider from '@mui/material/Divider'

import { cartApi } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

const formatIDR = (n: number) => `Rp ${n.toLocaleString('id-ID')}`

export default function CartPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['cart'],
    queryFn: () => cartApi.list(),
    enabled: !!user,
  })

  const removeMutation = useMutation({
    mutationFn: (itemId: number) => cartApi.remove(itemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cart'] }),
  })

  const clearMutation = useMutation({
    mutationFn: () => cartApi.clear(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cart'] }),
  })

  if (!user) return <Alert severity='info'>Login dulu untuk lihat keranjang.</Alert>

  return (
    <div className='flex flex-col gap-4'>
      <Box>
        <Typography variant='h4' sx={{ fontWeight: 700 }}>Keranjang</Typography>
        <Typography variant='body2' color='text.secondary'>
          Game yang siap di-checkout. Bayar sekali, semua langsung dimainkan.
        </Typography>
      </Box>

      {isError && <Alert severity='error'>{(error as any)?.message || 'Gagal memuat keranjang'}</Alert>}

      {isLoading && (
        <Card><CardContent><Skeleton variant='rounded' height={120} /></CardContent></Card>
      )}

      {data && data.items.length === 0 && (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 6 }}>
            <Typography variant='h6' sx={{ mb: 1 }}>Keranjang kosong</Typography>
            <Typography variant='body2' color='text.secondary' sx={{ mb: 3 }}>
              Mulai jelajahi katalog game di Playfast.
            </Typography>
            <Button component={Link} href='/store' variant='contained' color='warning'>
              Buka Toko
            </Button>
          </CardContent>
        </Card>
      )}

      {data && data.items.length > 0 && (
        <Card>
          <CardContent>
            {data.items.map((item, idx) => {
              const game = item.game
              if (!game) return null
              const displayName = game.custom_name || game.name
              const image = game.custom_header_image || game.header_image
              return (
                <Box key={item.id}>
                  <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', py: 2 }}>
                    {image && (
                      <Box
                        component='img'
                        src={image}
                        alt={displayName}
                        sx={{ width: 120, height: 56, objectFit: 'cover', borderRadius: 1, flexShrink: 0 }}
                      />
                    )}
                    <Box sx={{ flex: 1 }}>
                      <Typography sx={{ fontWeight: 600 }}>{displayName}</Typography>
                      <Typography variant='caption' color='text.secondary'>
                        AppID {game.appid}
                      </Typography>
                    </Box>
                    <Typography sx={{ fontWeight: 700, minWidth: 100, textAlign: 'right' }}>
                      {formatIDR(game.price)}
                    </Typography>
                    <IconButton
                      size='small'
                      color='error'
                      disabled={removeMutation.isPending}
                      onClick={() => removeMutation.mutate(item.id)}
                    >
                      <i className='tabler-trash' />
                    </IconButton>
                  </Box>
                  {idx < data.items.length - 1 && <Divider />}
                </Box>
              )
            })}
            <Divider sx={{ my: 2 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant='caption' color='text.secondary'>Subtotal ({data.item_count} game)</Typography>
                <Typography variant='h5' sx={{ fontWeight: 700 }}>{formatIDR(data.cart_subtotal)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant='outlined'
                  color='error'
                  disabled={clearMutation.isPending}
                  onClick={() => clearMutation.mutate()}
                >
                  Kosongkan
                </Button>
                <Button
                  component={Link}
                  href='/cart/checkout'
                  variant='contained'
                  color='warning'
                  size='large'
                >
                  Lanjut Bayar
                </Button>
              </Box>
            </Box>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
