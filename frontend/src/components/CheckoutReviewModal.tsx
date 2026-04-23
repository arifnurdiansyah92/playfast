'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Alert from '@mui/material/Alert'
import Switch from '@mui/material/Switch'
import Divider from '@mui/material/Divider'
import CircularProgress from '@mui/material/CircularProgress'

import { storeApi, formatIDR } from '@/lib/api'

export interface CheckoutItem {
  type: 'game' | 'subscription'
  label: string
  imageUrl?: string
  subtotal: number
  gameId?: number
  plan?: string
}

interface Props {
  open: boolean
  onClose: () => void
  item: CheckoutItem
  onConfirm: (args: { promo_code: string | null; apply_credit: boolean }) => Promise<void>
  isSubmitting: boolean
  initialPromoCode?: string
}

const CheckoutReviewModal = ({ open, onClose, item, onConfirm, isSubmitting, initialPromoCode }: Props) => {
  const [promoInput, setPromoInput] = useState('')
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; discount: number } | null>(null)
  const [promoError, setPromoError] = useState('')
  const [promoLoading, setPromoLoading] = useState(false)
  const [applyCredit, setApplyCredit] = useState(true)

  const { data: referralData } = useQuery({
    queryKey: ['my-referral'],
    queryFn: () => storeApi.getMyReferral(),
    enabled: open,
  })

  const credit = referralData?.credit ?? 0
  const promoDiscount = appliedPromo?.discount ?? 0
  const interimTotal = Math.max(0, item.subtotal - promoDiscount)
  const creditApplied = applyCredit ? Math.min(credit, interimTotal) : 0
  const finalTotal = Math.max(0, interimTotal - creditApplied)

  useEffect(() => {
    if (!open) {
      setPromoInput('')
      setAppliedPromo(null)
      setPromoError('')
      setApplyCredit(true)
    }
  }, [open])

  useEffect(() => {
    if (open && initialPromoCode && !appliedPromo && !promoLoading) {
      setPromoInput(initialPromoCode)
      const code = initialPromoCode.trim().toUpperCase()
      if (code) {
        setPromoLoading(true)
        setPromoError('')
        storeApi.validatePromoCode({
          code,
          order_type: item.type,
          subtotal: item.subtotal,
          game_id: item.gameId,
          plan: item.plan,
        }).then(res => {
          if (res.valid && res.discount_amount) {
            setAppliedPromo({ code: res.code!, discount: res.discount_amount })
            setPromoError('')
          } else {
            setPromoError(res.error || 'Kode promo tidak valid')
            setAppliedPromo(null)
          }
        }).catch((e: any) => {
          setPromoError(e?.message || 'Gagal validasi kode')
        }).finally(() => {
          setPromoLoading(false)
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPromoCode])

  const handleApplyPromo = async () => {
    const code = promoInput.trim()
    if (!code) return
    setPromoLoading(true)
    setPromoError('')
    try {
      const res = await storeApi.validatePromoCode({
        code,
        order_type: item.type,
        subtotal: item.subtotal,
        game_id: item.gameId,
        plan: item.plan,
      })
      if (res.valid && res.discount_amount) {
        setAppliedPromo({ code: res.code!, discount: res.discount_amount })
        setPromoError('')
      } else {
        setPromoError(res.error || 'Kode promo tidak valid')
        setAppliedPromo(null)
      }
    } catch (e: any) {
      setPromoError(e.message || 'Gagal validasi kode')
    } finally {
      setPromoLoading(false)
    }
  }

  const handleRemovePromo = () => {
    setAppliedPromo(null)
    setPromoInput('')
    setPromoError('')
  }

  const handleConfirm = () => {
    onConfirm({
      promo_code: appliedPromo?.code ?? null,
      apply_credit: applyCredit,
    })
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle>Review Pesanan</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
          {item.imageUrl && (
            <Box component='img' src={item.imageUrl} alt={item.label}
              sx={{ width: 100, height: 56, objectFit: 'cover', borderRadius: 1 }}
            />
          )}
          <Box sx={{ flex: 1 }}>
            <Typography variant='subtitle1' sx={{ fontWeight: 700 }}>{item.label}</Typography>
            <Typography variant='body2' color='text.secondary'>Subtotal: {formatIDR(item.subtotal)}</Typography>
          </Box>
        </Box>

        <Box sx={{ mb: 3 }}>
          <Typography variant='subtitle2' sx={{ mb: 1 }}>Kode Promo</Typography>
          {appliedPromo ? (
            <Alert severity='success' action={
              <Button size='small' onClick={handleRemovePromo}>Hapus</Button>
            }>
              Kode <strong>{appliedPromo.code}</strong> dipakai — diskon {formatIDR(appliedPromo.discount)}
            </Alert>
          ) : (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                size='small'
                value={promoInput}
                onChange={e => setPromoInput(e.target.value.toUpperCase())}
                placeholder='Masukkan kode promo'
                fullWidth
                disabled={promoLoading}
              />
              <Button
                variant='outlined'
                onClick={handleApplyPromo}
                disabled={promoLoading || !promoInput.trim()}
              >
                {promoLoading ? 'Cek...' : 'Apply'}
              </Button>
            </Box>
          )}
          {promoError && <Alert severity='error' sx={{ mt: 1 }}>{promoError}</Alert>}
        </Box>

        {credit > 0 && (
          <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 2, bgcolor: 'rgba(201,168,76,0.1)', borderRadius: 2 }}>
            <Box>
              <Typography variant='subtitle2'>Credit: {formatIDR(credit)}</Typography>
              <Typography variant='caption' color='text.secondary'>
                {applyCredit ? `Akan dipakai ${formatIDR(creditApplied)}` : 'Tidak dipakai'}
              </Typography>
            </Box>
            <Switch checked={applyCredit} onChange={e => setApplyCredit(e.target.checked)} />
          </Box>
        )}

        <Divider sx={{ my: 2 }} />

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography color='text.secondary'>Subtotal</Typography>
            <Typography>{formatIDR(item.subtotal)}</Typography>
          </Box>
          {promoDiscount > 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between', color: 'error.main' }}>
              <Typography>Diskon Promo</Typography>
              <Typography>-{formatIDR(promoDiscount)}</Typography>
            </Box>
          )}
          {creditApplied > 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between', color: 'error.main' }}>
              <Typography>Credit Dipakai</Typography>
              <Typography>-{formatIDR(creditApplied)}</Typography>
            </Box>
          )}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1, pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
            <Typography variant='subtitle1' sx={{ fontWeight: 700 }}>Total</Typography>
            <Typography variant='subtitle1' sx={{ fontWeight: 700 }}>{formatIDR(finalTotal)}</Typography>
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 3 }}>
        <Button onClick={onClose} disabled={isSubmitting}>Batal</Button>
        <Button
          variant='contained'
          onClick={handleConfirm}
          disabled={isSubmitting}
          startIcon={isSubmitting ? <CircularProgress size={16} /> : null}
        >
          {isSubmitting ? 'Proses...' : finalTotal === 0 ? 'Konfirmasi (Gratis)' : 'Lanjut Bayar'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default CheckoutReviewModal
