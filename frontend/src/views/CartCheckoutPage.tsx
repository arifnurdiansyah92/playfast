'use client'

import { useState } from 'react'

import { useRouter } from 'next/navigation'

import { useQuery, useMutation } from '@tanstack/react-query'

import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import Alert from '@mui/material/Alert'
import Divider from '@mui/material/Divider'
import Skeleton from '@mui/material/Skeleton'

import { cartApi } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

const formatIDR = (n: number) => `Rp ${n.toLocaleString('id-ID')}`

export default function CartCheckoutPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [promo, setPromo] = useState('')
  const [applyCredit, setApplyCredit] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [failedItems, setFailedItems] = useState<Array<{ game_id: number; reason: string }> | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['cart'],
    queryFn: () => cartApi.list(),
    enabled: !!user,
  })

  const checkoutMutation = useMutation({
    mutationFn: () => cartApi.checkout({
      promo_code: promo || undefined,
      apply_credit: applyCredit,
    }),
    onSuccess: res => {
      setErrorMsg(null)
      setFailedItems(null)
      if (res.payment_mode === 'midtrans' && res.snap_token) {
        const w = window as any
        if (w.snap) {
          w.snap.pay(res.snap_token, {
            onSuccess: () => router.push(`/cart/success?cg=${res.checkout_group_id}`),
            onPending: () => router.push(`/cart/success?cg=${res.checkout_group_id}`),
            onError: () => setErrorMsg('Pembayaran gagal'),
          })
        } else {
          setErrorMsg('Midtrans Snap belum di-load')
        }
      } else if (res.payment_mode === 'tripay' && res.checkout_url) {
        window.location.href = res.checkout_url
      } else if (res.payment_mode === 'credit') {
        router.push(`/cart/success?cg=${res.checkout_group_id}`)
      } else {
        router.push(`/cart/success?cg=${res.checkout_group_id}`)
      }
    },
    onError: (err: any) => {
      setFailedItems(err?.body?.failed_items || null)
      setErrorMsg(err?.message || 'Gagal checkout')
    },
  })

  if (!user) return <Alert severity='info'>Login dulu.</Alert>
  if (isLoading) return <Skeleton variant='rounded' height={400} />
  if (!data || data.items.length === 0) {
    return <Alert severity='info'>Keranjang kosong. <a href='/cart'>Kembali ke keranjang</a></Alert>
  }

  return (
    <div className='flex flex-col gap-4'>
      <Typography variant='h4' sx={{ fontWeight: 700 }}>Checkout Keranjang</Typography>

      <Card>
        <CardContent>
          <Typography variant='h6' sx={{ mb: 2 }}>Ringkasan</Typography>
          {data.items.map(item => {
            const game = item.game
            if (!game) return null
            return (
              <Box key={item.id} sx={{ display: 'flex', justifyContent: 'space-between', py: 1 }}>
                <Typography>{game.custom_name || game.name}</Typography>
                <Typography>{formatIDR(game.price)}</Typography>
              </Box>
            )
          })}
          <Divider sx={{ my: 2 }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant='subtitle1' sx={{ fontWeight: 700 }}>Subtotal</Typography>
            <Typography variant='subtitle1' sx={{ fontWeight: 700 }}>{formatIDR(data.cart_subtotal)}</Typography>
          </Box>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant='h6' sx={{ mb: 2 }}>Promo & Credit</Typography>
          <TextField
            fullWidth
            size='small'
            label='Kode promo (opsional)'
            value={promo}
            onChange={e => setPromo(e.target.value.toUpperCase())}
            sx={{ mb: 2 }}
          />
          <FormControlLabel
            control={<Switch checked={applyCredit} onChange={e => setApplyCredit(e.target.checked)} />}
            label='Pakai referral credit jika tersedia'
          />
        </CardContent>
      </Card>

      {errorMsg && <Alert severity='error'>{errorMsg}</Alert>}
      {failedItems && failedItems.length > 0 && (
        <Alert severity='warning'>
          Beberapa game tidak bisa di-checkout:
          <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
            {failedItems.map(f => (
              <li key={f.game_id}>Game #{f.game_id}: {f.reason}</li>
            ))}
          </ul>
          Buka <a href='/cart'>keranjang</a> dan hapus item yang bermasalah, lalu coba lagi.
        </Alert>
      )}

      <Button
        variant='contained'
        color='warning'
        size='large'
        disabled={checkoutMutation.isPending}
        onClick={() => checkoutMutation.mutate()}
        sx={{ alignSelf: 'flex-end', minWidth: 200 }}
      >
        {checkoutMutation.isPending ? 'Memproses…' : 'Bayar Sekarang'}
      </Button>
    </div>
  )
}
