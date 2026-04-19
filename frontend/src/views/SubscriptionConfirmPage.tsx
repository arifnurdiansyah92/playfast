'use client'

import { useEffect, useState, useCallback } from 'react'

import Link from 'next/link'

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
import type { Subscription } from '@/lib/api'

type DetailResponse = {
  subscription: Subscription
  payment_mode: string
  manual_info?: { qris_image_url: string; whatsapp_number: string; instructions: string }
}

const ManualPaymentSection = ({ subId, amount, planLabel, manualInfo }: {
  subId: number
  amount: number
  planLabel: string
  manualInfo: { qris_image_url: string; whatsapp_number: string; instructions: string }
}) => {
  const waNumber = manualInfo.whatsapp_number || ''
  const waMessage = encodeURIComponent(
    `Halo admin, saya sudah transfer untuk subscription #${subId} - ${planLabel} (${formatIDR(amount)}). Mohon dikonfirmasi.`
  )

  return (
    <Box sx={{ mt: 3, textAlign: 'left' }}>
      {manualInfo.instructions && (
        <Typography color='text.secondary' sx={{ mb: 2, textAlign: 'center' }}>
          {manualInfo.instructions}
        </Typography>
      )}
      {manualInfo.qris_image_url ? (
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <Box
            component='img'
            src={manualInfo.qris_image_url}
            alt='QRIS'
            sx={{ maxWidth: 280, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
          />
        </Box>
      ) : (
        <Alert severity='info' sx={{ mb: 3 }}>
          QRIS belum tersedia. Silakan hubungi admin via WhatsApp.
        </Alert>
      )}
      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
        <Typography variant='h5' sx={{ fontWeight: 700 }}>{formatIDR(amount)}</Typography>
      </Box>
      {waNumber && (
        <Box sx={{ textAlign: 'center' }}>
          <Button
            variant='contained'
            size='large'
            href={`https://wa.me/${waNumber}?text=${waMessage}`}
            target='_blank'
            rel='noreferrer'
            startIcon={<i className='tabler-brand-whatsapp' />}
            sx={{ bgcolor: '#25D366', '&:hover': { bgcolor: '#1da851' }, fontWeight: 700, px: 4 }}
          >
            Konfirmasi via WhatsApp
          </Button>
        </Box>
      )}
    </Box>
  )
}

interface Props {
  subId: string
}

const SubscriptionConfirmPage = ({ subId }: Props) => {
  const [data, setData] = useState<DetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const fetchDetail = useCallback(() => {
    storeApi.getSubscriptionById(subId).then(d => {
      setData(d)
      setLoading(false)
    }).catch(() => {
      setNotFound(true)
      setLoading(false)
    })
  }, [subId])

  useEffect(() => {
    fetchDetail()
  }, [fetchDetail])

  const shouldPoll = data?.subscription.status === 'pending_payment'

  useEffect(() => {
    if (!shouldPoll) return

    const interval = setInterval(() => {
      storeApi.pollSubscriptionStatus(subId).then(res => {
        if (res.status !== 'pending_payment') {
          fetchDetail()
        }
      }).catch(() => {})
    }, 8000)

    return () => clearInterval(interval)
  }, [shouldPoll, subId, fetchDetail])

  if (loading) {
    return (
      <Box sx={{ maxWidth: 600, mx: 'auto', mt: 4 }}>
        <Skeleton height={60} />
        <Skeleton height={200} sx={{ mt: 2 }} />
      </Box>
    )
  }

  if (notFound || !data) return (
    <Box sx={{ maxWidth: 600, mx: 'auto', mt: 4 }}>
      <Alert severity='error' sx={{ mb: 3 }}>Subscription tidak ditemukan</Alert>
      <Button
        variant='contained'
        component={Link}
        href='/subscribe'
        fullWidth
        size='large'
      >
        Kembali ke Subscribe
      </Button>
    </Box>
  )

  const sub = data.subscription
  const isPending = sub.status === 'pending_payment'
  const isActive = sub.status === 'active'
  const isExpired = sub.status === 'expired' || sub.status === 'cancelled'
  const isMidtrans = data.payment_mode !== 'manual'

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto' }}>
      <Box sx={{ textAlign: 'center', mb: 4 }}>
        {isPending && (
          <>
            <CircularProgress size={56} sx={{ mb: 2 }} />
            <Typography variant='h4' sx={{ fontWeight: 700, mb: 1 }}>
              Menunggu Pembayaran
            </Typography>
            <Typography color='text.secondary'>
              Selesaikan pembayaran untuk mengaktifkan subscription.
            </Typography>
            {isMidtrans && sub.snap_token ? (
              <Button
                variant='contained'
                size='large'
                sx={{ mt: 3, px: 4 }}
                onClick={() => {
                  if (typeof window !== 'undefined' && (window as any).snap) {
                    (window as any).snap.pay(sub.snap_token, {
                      onSuccess: () => fetchDetail(),
                      onPending: () => {},
                      onError: () => {},
                      onClose: () => {},
                    })
                  }
                }}
              >
                Bayar Sekarang
              </Button>
            ) : data.manual_info ? (
              <ManualPaymentSection
                subId={sub.id}
                amount={sub.amount}
                planLabel={sub.plan_label}
                manualInfo={data.manual_info}
              />
            ) : isMidtrans ? (
              <Alert severity='warning' sx={{ mt: 3 }}>
                Menunggu token pembayaran. Silakan refresh halaman dalam beberapa saat atau hubungi admin jika berlangsung lama.
              </Alert>
            ) : null}
          </>
        )}
        {isActive && (
          <>
            <Box sx={{
              width: 72, height: 72, borderRadius: '50%', mx: 'auto', mb: 2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: 'success.lightOpacity',
            }}>
              <i className='tabler-check' style={{ fontSize: 36, color: 'var(--mui-palette-success-main)' }} />
            </Box>
            <Typography variant='h4' sx={{ fontWeight: 700, mb: 1 }}>
              Subscription Aktif!
            </Typography>
            <Typography color='text.secondary'>
              Kamu sekarang bisa akses semua game di Playfast.
              {sub.expires_at && (
                <> Aktif hingga <strong>{new Date(sub.expires_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>.</>
              )}
            </Typography>
          </>
        )}
        {isExpired && (
          <>
            <Box sx={{
              width: 72, height: 72, borderRadius: '50%', mx: 'auto', mb: 2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: 'error.lightOpacity',
            }}>
              <i className='tabler-x' style={{ fontSize: 36, color: 'var(--mui-palette-error-main)' }} />
            </Box>
            <Typography variant='h4' sx={{ fontWeight: 700, mb: 1 }}>
              Subscription Berakhir
            </Typography>
            <Typography color='text.secondary'>
              Subscription ini sudah tidak aktif. Silakan subscribe lagi untuk melanjutkan akses.
            </Typography>
          </>
        )}
      </Box>

      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ mb: 3 }}>
            <Typography variant='h6' sx={{ fontWeight: 700 }}>Playfast {sub.plan_label}</Typography>
            <Typography variant='body2' color='text.secondary'>Subscription #{sub.id}</Typography>
            <Typography variant='body2' color='text.secondary'>
              {new Date(sub.created_at).toLocaleDateString('id-ID', {
                day: 'numeric', month: 'long', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </Typography>
          </Box>

          <Divider sx={{ mb: 3 }} />

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography color='text.secondary'>Status</Typography>
              <Typography sx={{ fontWeight: 600, color: isActive ? 'success.main' : isPending ? 'warning.main' : 'error.main' }}>
                {isActive ? 'Aktif' : isPending ? 'Menunggu Pembayaran' : 'Berakhir'}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography color='text.secondary'>Harga</Typography>
              <Typography sx={{ fontWeight: 600 }}>{formatIDR(sub.amount)}</Typography>
            </Box>
            {sub.payment_type && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography color='text.secondary'>Metode Pembayaran</Typography>
                <Typography sx={{ fontWeight: 600, textTransform: 'capitalize' }}>{sub.payment_type.replace(/_/g, ' ')}</Typography>
              </Box>
            )}
            {sub.expires_at && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography color='text.secondary'>Berlaku Sampai</Typography>
                <Typography sx={{ fontWeight: 600 }}>
                  {new Date(sub.expires_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                </Typography>
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>

      <Box sx={{ display: 'flex', gap: 2 }}>
        {isActive && (
          <Button
            variant='contained'
            size='large'
            fullWidth
            startIcon={<i className='tabler-device-gamepad-2' />}
            component={Link}
            href='/store'
            sx={{ py: 1.5, fontWeight: 700 }}
          >
            Browse Games
          </Button>
        )}
        {isExpired && (
          <Button
            variant='contained'
            size='large'
            fullWidth
            component={Link}
            href='/subscribe'
            sx={{ py: 1.5, fontWeight: 700 }}
          >
            Subscribe Lagi
          </Button>
        )}
        <Button
          variant='outlined'
          size='large'
          component={Link}
          href='/orders'
          sx={{ minWidth: 140, py: 1.5, ...(isActive || isExpired ? {} : { flex: 1 }) }}
        >
          Riwayat Transaksi
        </Button>
      </Box>
    </Box>
  )
}

export default SubscriptionConfirmPage
