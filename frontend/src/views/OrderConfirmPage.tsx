'use client'

import { useEffect, useState, useCallback } from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Skeleton from '@mui/material/Skeleton'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'

import { storeApi, formatIDR } from '@/lib/api'
import type { Order } from '@/lib/api'

interface Props {
  orderId: string
}

const OrderConfirmPage = ({ orderId }: Props) => {
  const router = useRouter()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchOrder = useCallback(() => {
    storeApi.getOrder(orderId).then(o => {
      setOrder(o)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [orderId])

  useEffect(() => {
    fetchOrder()
  }, [fetchOrder])

  // Poll for status updates if pending_payment
  useEffect(() => {
    if (!order || order.status !== 'pending_payment') return

    const interval = setInterval(() => {
      storeApi.getOrderStatus(orderId).then(res => {
        if (res.status !== 'pending_payment') {
          fetchOrder() // Refresh full order data
        }
      }).catch(() => {})
    }, 3000)

    return () => clearInterval(interval)
  }, [order?.status, orderId, fetchOrder])

  if (loading) {
    return (
      <Box sx={{ maxWidth: 600, mx: 'auto', mt: 4 }}>
        <Skeleton height={60} />
        <Skeleton height={200} sx={{ mt: 2 }} />
      </Box>
    )
  }

  if (!order) return <Alert severity='error'>Pesanan tidak ditemukan</Alert>

  const isPending = order.status === 'pending_payment'
  const isFulfilled = order.status === 'fulfilled'
  const isCancelled = order.status === 'cancelled'

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto' }}>
      {/* Status header */}
      <Box sx={{ textAlign: 'center', mb: 4 }}>
        {isPending && (
          <>
            <CircularProgress size={56} sx={{ mb: 2 }} />
            <Typography variant='h4' sx={{ fontWeight: 700, mb: 1 }}>
              Menunggu Pembayaran
            </Typography>
            <Typography color='text.secondary'>
              Selesaikan pembayaran untuk mendapatkan akses game.
            </Typography>
            {order.snap_token && (
              <Button
                variant='contained'
                size='large'
                sx={{ mt: 3, px: 4 }}
                onClick={() => {
                  if (typeof window !== 'undefined' && (window as any).snap) {
                    (window as any).snap.pay(order.snap_token, {
                      onSuccess: () => fetchOrder(),
                      onPending: () => {},
                      onError: () => {},
                      onClose: () => {}
                    })
                  }
                }}
              >
                Bayar Sekarang
              </Button>
            )}
          </>
        )}
        {isFulfilled && (
          <>
            <Box sx={{
              width: 72, height: 72, borderRadius: '50%', mx: 'auto', mb: 2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: 'success.lightOpacity',
            }}>
              <i className='tabler-check' style={{ fontSize: 36, color: 'var(--mui-palette-success-main)' }} />
            </Box>
            <Typography variant='h4' sx={{ fontWeight: 700, mb: 1 }}>
              Pembayaran Berhasil!
            </Typography>
            <Typography color='text.secondary'>
              Akses kamu sudah aktif. Kamu bisa langsung main sekarang.
            </Typography>
          </>
        )}
        {isCancelled && (
          <>
            <Box sx={{
              width: 72, height: 72, borderRadius: '50%', mx: 'auto', mb: 2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: 'error.lightOpacity',
            }}>
              <i className='tabler-x' style={{ fontSize: 36, color: 'var(--mui-palette-error-main)' }} />
            </Box>
            <Typography variant='h4' sx={{ fontWeight: 700, mb: 1 }}>
              Pembayaran Dibatalkan
            </Typography>
            <Typography color='text.secondary'>
              Pesanan ini telah dibatalkan. Silakan coba lagi.
            </Typography>
          </>
        )}
      </Box>

      {/* Order details card */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', gap: 3, alignItems: 'center', mb: 3 }}>
            <Box
              component='img'
              src={`https://cdn.akamai.steamstatic.com/steam/apps/${order.game?.appid}/header.jpg`}
              alt={order.game?.name}
              sx={{ width: 120, borderRadius: 1, objectFit: 'cover' }}
              onError={(e: any) => { e.target.style.display = 'none' }}
            />
            <Box>
              <Typography variant='h6' sx={{ fontWeight: 700 }}>{order.game?.name}</Typography>
              <Typography variant='body2' color='text.secondary'>Pesanan #{order.id}</Typography>
              <Typography variant='body2' color='text.secondary'>
                {new Date(order.created_at).toLocaleDateString('id-ID', {
                  day: 'numeric', month: 'long', year: 'numeric',
                  hour: '2-digit', minute: '2-digit'
                })}
              </Typography>
            </Box>
          </Box>

          <Divider sx={{ mb: 3 }} />

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography color='text.secondary'>Status</Typography>
              <Typography sx={{ fontWeight: 600, color: isFulfilled ? 'success.main' : isPending ? 'warning.main' : 'error.main' }}>
                {isFulfilled ? 'Aktif' : isPending ? 'Menunggu Pembayaran' : 'Dibatalkan'}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography color='text.secondary'>Harga</Typography>
              <Typography sx={{ fontWeight: 600 }}>{formatIDR(order.amount ?? order.game?.price ?? 0)}</Typography>
            </Box>
            {order.payment_type && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography color='text.secondary'>Metode Pembayaran</Typography>
                <Typography sx={{ fontWeight: 600, textTransform: 'capitalize' }}>{order.payment_type.replace(/_/g, ' ')}</Typography>
              </Box>
            )}
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography color='text.secondary'>Akses</Typography>
              <Typography sx={{ fontWeight: 600 }}>Selamanya</Typography>
            </Box>
            {order.credentials && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography color='text.secondary'>Akun</Typography>
                <Typography sx={{ fontWeight: 600, fontFamily: 'monospace' }}>{order.credentials.account_name}</Typography>
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>

      {/* Next steps (only for fulfilled) */}
      {isFulfilled && (
        <Card sx={{ mb: 3, bgcolor: 'rgba(0,230,118,0.05)', border: '1px solid rgba(0,230,118,0.2)' }}>
          <CardContent sx={{ p: 3 }}>
            <Typography variant='subtitle1' sx={{ fontWeight: 700, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
              <i className='tabler-info-circle' style={{ fontSize: 20 }} />
              Langkah Selanjutnya
            </Typography>
            <Box component='ol' sx={{ pl: 2.5, m: 0, color: 'text.secondary', '& li': { mb: 0.5 } }}>
              <li>Klik "Mulai Main" untuk melihat kredensial login</li>
              <li>Buat kode Steam Guard saat diminta</li>
              <li>Setelah download, aktifkan mode offline</li>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <Box sx={{ display: 'flex', gap: 2 }}>
        {isFulfilled && (
          <Button
            variant='contained'
            size='large'
            fullWidth
            startIcon={<i className='tabler-player-play' />}
            onClick={() => router.push(`/play/${order.id}`)}
            sx={{ py: 1.5, fontWeight: 700 }}
          >
            Mulai Main
          </Button>
        )}
        <Button
          variant='outlined'
          size='large'
          component={Link}
          href='/store'
          sx={{ minWidth: 140, py: 1.5, borderColor: '#3d5a80', color: '#c7d5e0', ...(isFulfilled ? {} : { flex: 1 }) }}
        >
          {isCancelled ? 'Kembali ke Toko' : 'Cari Game Lain'}
        </Button>
      </Box>
    </Box>
  )
}

export default OrderConfirmPage
