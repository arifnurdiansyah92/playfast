'use client'

import { useEffect, useState } from 'react'

import { useQuery } from '@tanstack/react-query'

import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'

import { reviewsApi } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import ReviewSubmitDialog from '@/views/components/ReviewSubmitDialog'

const SNOOZE_KEY = 'playfast.reviewNudge.snoozedUntil'
const SESSION_KEY = 'playfast.reviewNudge.shownThisSession'
const SNOOZE_DAYS = 7

const gold = '#c9a84c'
const goldLight = '#dfc06a'

/**
 * Lightweight prompt that asks paying customers (non-admin) who haven't
 * written a review yet to share their experience.
 *
 * Visibility rules — all must pass:
 *   - User is logged in and not an admin
 *   - reviewsApi.eligibility says eligible=true and has_review=false
 *   - User hasn't snoozed within the last 7 days (localStorage)
 *   - Modal hasn't already been shown this browser session (sessionStorage)
 *
 * Action options:
 *   - "Tulis Review Sekarang": opens the existing ReviewSubmitDialog
 *   - "Ingatkan saya 7 hari lagi": persistent snooze
 *   - X (close): session-only dismiss; reappears on next visit unless snoozed
 *
 * Mounted once in (dashboard)/layout.tsx so it can fire on any logged-in page.
 */
const ReviewNudgeModal = () => {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)

  const isAdmin = user?.role === 'admin'

  const { data: eligibility } = useQuery({
    queryKey: ['my-review-eligibility'],
    queryFn: () => reviewsApi.eligibility(),
    enabled: !!user && !isAdmin,
    staleTime: 5 * 60 * 1000,
  })

  // Decide whether to open. Only runs once per fetch — gating logic skews
  // toward NOT showing if anything is uncertain.
  useEffect(() => {
    if (!user || isAdmin) return
    if (!eligibility) return
    if (!eligibility.eligible) return
    if (eligibility.has_review) return

    // Check snooze (persists across sessions)
    try {
      const snoozedUntil = localStorage.getItem(SNOOZE_KEY)

      if (snoozedUntil && Date.parse(snoozedUntil) > Date.now()) return
    } catch {
      /* localStorage may be unavailable in some contexts — fall through */
    }

    // Skip if we already opened this session
    try {
      if (sessionStorage.getItem(SESSION_KEY) === '1') return
    } catch {
      /* ignore */
    }

    // Small delay so the modal doesn't pop the instant a page loads —
    // gives the user a moment to land before being asked for something.
    const t = setTimeout(() => {
      setOpen(true)

      try {
        sessionStorage.setItem(SESSION_KEY, '1')
      } catch {
        /* ignore */
      }
    }, 2500)

    return () => clearTimeout(t)
  }, [user, isAdmin, eligibility])

  const snoozeFor7Days = () => {
    try {
      const until = new Date(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000)

      localStorage.setItem(SNOOZE_KEY, until.toISOString())
    } catch {
      /* ignore */
    }

    setOpen(false)
  }

  const close = () => setOpen(false)

  const openCompose = () => {
    // Snooze briefly so the nudge doesn't reappear if the user closes the
    // compose dialog without submitting; eligibility query will refetch on
    // submit success and naturally keep the nudge hidden afterward.
    try {
      const until = new Date(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000)

      localStorage.setItem(SNOOZE_KEY, until.toISOString())
    } catch {
      /* ignore */
    }

    setOpen(false)
    setComposeOpen(true)
  }

  if (!user || isAdmin) return null

  return (
    <>
      <Dialog
        open={open}
        onClose={close}
        maxWidth='xs'
        fullWidth
        slotProps={{
          paper: {
            sx: {
              bgcolor: '#14161c',
              backgroundImage: 'none',
              border: '1px solid rgba(201,168,76,0.3)',
              borderRadius: 2.5,
              overflow: 'visible',
              position: 'relative',
            },
          },
        }}
      >
        {/* Close button (X) — sits at the corner so it's always reachable */}
        <IconButton
          onClick={close}
          aria-label='Tutup'
          size='small'
          sx={{
            position: 'absolute',
            top: 10,
            right: 10,
            color: 'rgba(255,255,255,0.6)',
            '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.06)' },
          }}
        >
          <i className='tabler-x' style={{ fontSize: 18 }} />
        </IconButton>

        <DialogContent sx={{ pt: 4, pb: 2, px: 3, textAlign: 'center' }}>
          <Box
            sx={{
              width: 64, height: 64, mx: 'auto', mb: 2,
              borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `linear-gradient(135deg, rgba(201,168,76,0.25) 0%, rgba(201,168,76,0.08) 100%)`,
              border: `1px solid rgba(201,168,76,0.4)`,
            }}
          >
            <i className='tabler-message-star' style={{ fontSize: 32, color: gold }} />
          </Box>

          <Typography variant='h6' sx={{ fontWeight: 700, mb: 1, color: '#fff' }}>
            Bagikan Pengalaman Kamu
          </Typography>
          <Typography variant='body2' sx={{ color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>
            Sudah pernah pakai Playfast? Cerita singkat dari kamu bantu calon
            pelanggan baru memutuskan — dan pelanggan baru lebih banyak
            artinya katalog game kami terus tumbuh.
          </Typography>
        </DialogContent>

        <DialogActions sx={{ flexDirection: 'column', gap: 1, px: 3, pb: 3 }}>
          <Button
            onClick={openCompose}
            variant='contained'
            fullWidth
            startIcon={<i className='tabler-pencil-plus' />}
            sx={{
              bgcolor: gold,
              color: '#000',
              fontWeight: 700,
              py: 1.25,
              '&:hover': { bgcolor: goldLight },
            }}
          >
            Tulis Review Sekarang
          </Button>
          <Button
            onClick={snoozeFor7Days}
            variant='text'
            fullWidth
            size='small'
            sx={{ color: 'rgba(255,255,255,0.55)', fontWeight: 500, '&:hover': { color: 'rgba(255,255,255,0.85)' } }}
          >
            Ingatkan saya 7 hari lagi
          </Button>
        </DialogActions>
      </Dialog>

      <ReviewSubmitDialog
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        existing={eligibility?.review ?? null}
      />
    </>
  )
}

export default ReviewNudgeModal
