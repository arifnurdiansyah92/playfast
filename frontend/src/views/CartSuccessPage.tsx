'use client'

import Link from 'next/link'

import { useSearchParams } from 'next/navigation'

import { useQuery } from '@tanstack/react-query'

import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import Skeleton from '@mui/material/Skeleton'
import Chip from '@mui/material/Chip'

import { storeApi, formatIDR } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

export default function CartSuccessPage() {
  const { user } = useAuth()
  const params = useSearchParams()
  const cg = params?.get('cg') || ''

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['cart-success-orders', cg],
    queryFn: () => storeApi.getOrders(),
    enabled: !!user && !!cg,
    refetchInterval: 5000, // poll until fulfilled
  })

  const myOrders = (data || []).filter(o => o.checkout_group_id === cg)
  const allFulfilled = myOrders.length > 0 && myOrders.every(o => o.status === 'fulfilled')
  const anyPending = myOrders.some(o => o.status === 'pending_payment')

  if (!user) return <Alert severity='info'>Login dulu.</Alert>

  if (!cg) {
    return (
      <Alert severity='warning'>
        Checkout group tidak diketahui. <Link href='/cart'>Kembali ke keranjang</Link>
      </Alert>
    )
  }

  return (
    <div className='flex flex-col gap-4'>
      <Box sx={{ textAlign: 'center', py: 3 }}>
        <Typography variant='h4' sx={{ fontWeight: 700, mb: 1 }}>
          {allFulfilled ? 'Pembayaran berhasil!' : anyPending ? 'Menunggu konfirmasi pembayaran…' : 'Memproses pesanan…'}
        </Typography>
        <Typography variant='body2' color='text.secondary'>
          {allFulfilled
            ? `${myOrders.length} game sudah siap dimainkan.`
            : 'Sebentar ya — biasanya selesai dalam beberapa detik.'}
        </Typography>
      </Box>

      {isError && (
        <Alert severity='error'>
          Gagal memuat pesanan.{' '}
          <Button size='small' onClick={() => refetch()}>
            Coba lagi
          </Button>
        </Alert>
      )}

      {isLoading && <Skeleton variant='rounded' height={300} />}

      {data && myOrders.length === 0 && (
        <Alert severity='warning'>
          Belum ada pesanan untuk checkout group ini. <Link href='/orders'>Buka riwayat pesanan</Link>
        </Alert>
      )}

      {myOrders.length > 0 && (
        <Card>
          <CardContent>
            <Typography variant='h6' sx={{ mb: 2 }}>
              Pesanan
            </Typography>
            {myOrders.map(o => (
              <Box
                key={o.id}
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  py: 1.5,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Box>
                  <Typography sx={{ fontWeight: 600 }}>
                    {o.game?.custom_name || o.game?.name || `Order #${o.id}`}
                  </Typography>
                  <Typography variant='caption' color='text.secondary'>
                    Order #{o.id} · {formatIDR(o.amount || 0)}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip
                    size='small'
                    label={o.status}
                    color={o.status === 'fulfilled' ? 'success' : o.status === 'pending_payment' ? 'warning' : 'default'}
                  />
                  {o.status === 'fulfilled' && (
                    <Button component={Link} href={`/play/${o.id}`} variant='outlined' size='small'>
                      Main
                    </Button>
                  )}
                </Box>
              </Box>
            ))}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
              <Button component={Link} href='/my-games' variant='outlined'>
                Game Saya
              </Button>
              <Button component={Link} href='/store' variant='contained' color='warning'>
                Belanja Lagi
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
