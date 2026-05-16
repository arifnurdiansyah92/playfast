'use client'

import { useEffect, useState } from 'react'

import { useRouter } from 'next/navigation'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

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
import IconButton from '@mui/material/IconButton'
import Chip from '@mui/material/Chip'

import { cartApi } from '@/lib/api'
import type { CartPreviewResponse } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

const formatIDR = (n: number) => `Rp ${n.toLocaleString('id-ID')}`

export default function CartCheckoutPage() {
  const { user } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()

  const [promoInput, setPromoInput] = useState('')
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null)
  const [applyCredit, setApplyCredit] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [failedItems, setFailedItems] = useState<Array<{ game_id: number; reason: string }> | null>(null)
  const [preview, setPreview] = useState<CartPreviewResponse | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['cart'],
    queryFn: () => cartApi.list(),
    enabled: !!user,
  })

  // Initial preview (no promo) — runs when cart loads or applyCredit changes
  const previewMutation = useMutation({
    mutationFn: (body: { promo_code?: string; apply_credit: boolean }) =>
      cartApi.preview(body),
    onSuccess: res => setPreview(res),
  })

  useEffect(() => {
    if (!data || data.items.length === 0) return
    previewMutation.mutate({
      promo_code: appliedPromo || undefined,
      apply_credit: applyCredit,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.item_count, appliedPromo, applyCredit])

  const removeMutation = useMutation({
    mutationFn: (itemId: number) => cartApi.remove(itemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cart'] }),
  })

  const applyPromoMutation = useMutation({
    mutationFn: () =>
      cartApi.preview({
        promo_code: promoInput.trim(),
        apply_credit: applyCredit,
      }),
    onSuccess: res => {
      setPreview(res)
      if (res.promo_valid) {
        setAppliedPromo(promoInput.trim().toUpperCase())
        setErrorMsg(null)
      } else {
        setErrorMsg(res.promo_error || 'Kode promo tidak berlaku')
        setAppliedPromo(null)
      }
    },
    onError: (err: any) => setErrorMsg(err?.message || 'Gagal validasi promo'),
  })

  const removePromo = () => {
    setAppliedPromo(null)
    setPromoInput('')
    setErrorMsg(null)
    previewMutation.mutate({ apply_credit: applyCredit })
  }

  const checkoutMutation = useMutation({
    mutationFn: () =>
      cartApi.checkout({
        promo_code: appliedPromo || undefined,
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

  const cartTotal = preview?.cart_total ?? data.cart_subtotal
  const promoDiscount = preview?.promo_discount ?? 0
  const firstOrderDiscount = preview?.first_order_discount ?? 0
  const creditApplied = preview?.credit_applied ?? 0
  const availableCredit = preview?.available_credit ?? 0

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
              <Box key={item.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Typography sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {game.custom_name || game.name}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0 }}>
                  <Typography sx={{ fontWeight: 600, minWidth: 90, textAlign: 'right' }}>{formatIDR(game.price)}</Typography>
                  <IconButton
                    size='small'
                    color='error'
                    disabled={removeMutation.isPending}
                    onClick={() => removeMutation.mutate(item.id)}
                    aria-label='Hapus dari keranjang'
                  >
                    <i className='tabler-trash' />
                  </IconButton>
                </Box>
              </Box>
            )
          })}
          <Box sx={{ mt: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
              <Typography variant='body2' color='text.secondary'>Subtotal</Typography>
              <Typography variant='body2'>{formatIDR(data.cart_subtotal)}</Typography>
            </Box>
            {firstOrderDiscount > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                <Typography variant='body2' color='success.main'>Diskon pengguna baru</Typography>
                <Typography variant='body2' color='success.main'>−{formatIDR(firstOrderDiscount)}</Typography>
              </Box>
            )}
            {promoDiscount > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                <Typography variant='body2' color='success.main'>Promo ({appliedPromo})</Typography>
                <Typography variant='body2' color='success.main'>−{formatIDR(promoDiscount)}</Typography>
              </Box>
            )}
            {creditApplied > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                <Typography variant='body2' color='success.main'>Referral credit</Typography>
                <Typography variant='body2' color='success.main'>−{formatIDR(creditApplied)}</Typography>
              </Box>
            )}
            <Divider sx={{ my: 1.5 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant='h6' sx={{ fontWeight: 700 }}>Total</Typography>
              <Typography variant='h6' sx={{ fontWeight: 700, color: 'warning.main' }}>{formatIDR(cartTotal)}</Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant='h6' sx={{ mb: 2 }}>Promo & Credit</Typography>

          {appliedPromo ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <Chip
                label={`Promo aktif: ${appliedPromo} (−${formatIDR(promoDiscount)})`}
                color='success'
                onDelete={removePromo}
              />
            </Box>
          ) : (
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <TextField
                fullWidth
                size='small'
                label='Kode promo (opsional)'
                value={promoInput}
                onChange={e => setPromoInput(e.target.value.toUpperCase())}
                onKeyDown={e => {
                  if (e.key === 'Enter' && promoInput.trim()) {
                    e.preventDefault()
                    applyPromoMutation.mutate()
                  }
                }}
              />
              <Button
                variant='outlined'
                disabled={!promoInput.trim() || applyPromoMutation.isPending}
                onClick={() => applyPromoMutation.mutate()}
                sx={{ flexShrink: 0, minWidth: 100 }}
              >
                {applyPromoMutation.isPending ? '…' : 'Apply'}
              </Button>
            </Box>
          )}

          <FormControlLabel
            control={<Switch checked={applyCredit} onChange={e => setApplyCredit(e.target.checked)} />}
            label={`Pakai referral credit${availableCredit > 0 ? ` (tersedia ${formatIDR(availableCredit)})` : ''}`}
            disabled={availableCredit === 0}
          />
        </CardContent>
      </Card>

      {errorMsg && <Alert severity='error' onClose={() => setErrorMsg(null)}>{errorMsg}</Alert>}
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
        {checkoutMutation.isPending ? 'Memproses…' : `Bayar ${formatIDR(cartTotal)}`}
      </Button>
    </div>
  )
}
