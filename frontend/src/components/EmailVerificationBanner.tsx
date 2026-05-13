'use client'

import { useEffect, useState } from 'react'

import { useMutation } from '@tanstack/react-query'

import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import Snackbar from '@mui/material/Snackbar'

import { authApi } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

const RESEND_COOLDOWN_S = 60
const COOLDOWN_KEY_PREFIX = 'pf:verify-resend-until:'

const EmailVerificationBanner = () => {
  const { user, loading, refreshUser } = useAuth()
  const [snack, setSnack] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [currentPw, setCurrentPw] = useState('')
  const [editError, setEditError] = useState('')
  const [cooldownLeft, setCooldownLeft] = useState(0)

  // Persist cooldown end-time in localStorage so a page reload doesn't
  // grant the user a free resend before the server cooldown expires.
  const cooldownKey = user ? `${COOLDOWN_KEY_PREFIX}${user.id}` : null

  useEffect(() => {
    if (!cooldownKey) return

    const tick = () => {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(cooldownKey) : null
      const until = raw ? parseInt(raw, 10) : 0
      const left = Math.max(0, Math.ceil((until - Date.now()) / 1000))

      setCooldownLeft(left)
      if (left === 0 && raw) localStorage.removeItem(cooldownKey)
    }

    tick()
    const id = setInterval(tick, 1000)

    return () => clearInterval(id)
  }, [cooldownKey])

  const startCooldown = (seconds = RESEND_COOLDOWN_S) => {
    if (!cooldownKey) return
    const until = Date.now() + seconds * 1000

    localStorage.setItem(cooldownKey, String(until))
    setCooldownLeft(seconds)
  }

  const resendMut = useMutation({
    mutationFn: () => authApi.resendVerification(),
    onSuccess: r => {
      startCooldown(RESEND_COOLDOWN_S)
      setSnack(r.message || 'Link verifikasi sudah dikirim.')
    },
    onError: (e: any) => {
      // Backend rate-limit returns 429 with retry_after seconds — honour it
      // so the local cooldown matches even after a hard refresh.
      const retryAfter = e?.body?.retry_after

      if (typeof retryAfter === 'number' && retryAfter > 0) {
        startCooldown(retryAfter)
      }

      setSnack(e?.message || 'Gagal kirim ulang.')
    },
  })

  const updateMut = useMutation({
    mutationFn: (data: { email: string; current_password: string }) => authApi.updateProfile(data),
    onSuccess: async r => {
      await refreshUser()
      setEditOpen(false)
      setNewEmail('')
      setCurrentPw('')
      setEditError('')
      setSnack(r.message || 'Email diperbarui. Cek inbox baru untuk verifikasi.')
    },
    onError: (e: any) => setEditError(e?.message || 'Gagal memperbarui email.'),
  })

  // Hide while auth resolves, for signed-out visitors, and for already-verified users.
  if (loading || !user || user.email_verified) return null

  const handleSubmitEdit = () => {
    const email = newEmail.trim().toLowerCase()

    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setEditError('Format email tidak valid')

      return
    }

    if (!currentPw) {
      setEditError('Password saat ini wajib diisi')

      return
    }

    updateMut.mutate({ email, current_password: currentPw })
  }

  return (
    <>
      <Alert
        severity='warning'
        icon={<i className='tabler-mail-exclamation' style={{ fontSize: 22 }} />}
        sx={{ mb: 3, alignItems: { xs: 'flex-start', sm: 'center' } }}
        action={
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: { xs: 1, sm: 0 } }}>
            <Button
              size='small'
              variant='contained'
              color='warning'
              onClick={() => resendMut.mutate()}
              disabled={resendMut.isPending || cooldownLeft > 0}
              startIcon={<i className={cooldownLeft > 0 ? 'tabler-clock' : 'tabler-send'} style={{ fontSize: 16 }} />}
            >
              {resendMut.isPending
                ? 'Mengirim…'
                : cooldownLeft > 0
                  ? `Tunggu ${cooldownLeft}s`
                  : 'Kirim Ulang Verifikasi'}
            </Button>
            <Button
              size='small'
              variant='outlined'
              color='warning'
              onClick={() => { setEditOpen(true); setNewEmail(user.email); setEditError(''); setCurrentPw('') }}
              startIcon={<i className='tabler-pencil' style={{ fontSize: 16 }} />}
            >
              Ubah Email
            </Button>
          </Box>
        }
      >
        <AlertTitle sx={{ fontWeight: 700, mb: 0.25 }}>
          Verifikasi email kamu dulu yuk
        </AlertTitle>
        <Typography variant='body2' sx={{ lineHeight: 1.6 }}>
          Kami kirim link verifikasi ke <strong>{user.email}</strong>. Verifikasi email biar kamu nggak ketinggalan:
          notifikasi status pesanan, promo terbatas waktu, dan kabar game baru yang masuk katalog.
        </Typography>
      </Alert>

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth='xs' fullWidth>
        <DialogTitle>Ubah Email</DialogTitle>
        <DialogContent>
          <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
            Email baru perlu diverifikasi lagi — kami kirim link verifikasi setelah update sukses.
          </Typography>
          <TextField
            fullWidth
            type='email'
            label='Email Baru'
            value={newEmail}
            onChange={e => { setNewEmail(e.target.value); setEditError('') }}
            sx={{ mb: 2 }}
            autoComplete='email'
          />
          <TextField
            fullWidth
            type='password'
            label='Password Saat Ini'
            value={currentPw}
            onChange={e => { setCurrentPw(e.target.value); setEditError('') }}
            helperText='Diperlukan untuk konfirmasi pemilik akun.'
            autoComplete='current-password'
            error={!!editError}
          />
          {editError && (
            <Alert severity='error' sx={{ mt: 2 }} onClose={() => setEditError('')}>
              {editError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Batal</Button>
          <Button
            variant='contained'
            color='warning'
            onClick={handleSubmitEdit}
            disabled={updateMut.isPending || !newEmail.trim() || !currentPw}
          >
            {updateMut.isPending ? 'Menyimpan…' : 'Simpan'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snack} autoHideDuration={4000} onClose={() => setSnack('')} message={snack} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </>
  )
}

export default EmailVerificationBanner
