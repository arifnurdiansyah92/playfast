'use client'

import { useState } from 'react'

import { useRouter } from 'next/navigation'

import { useQuery } from '@tanstack/react-query'

import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import Grid from '@mui/material/Grid'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import Skeleton from '@mui/material/Skeleton'

import { storeApi, formatIDR } from '@/lib/api'
import type { ApiError } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

const SubscribePage = () => {
  const router = useRouter()
  const { user } = useAuth()
  const [buying, setBuying] = useState<string | null>(null)
  const [error, setError] = useState('')

  const { data: plansData, isLoading: plansLoading } = useQuery({
    queryKey: ['subscription-plans'],
    queryFn: () => storeApi.getSubscriptionPlans(),
  })

  const { data: statusData, isLoading: statusLoading } = useQuery({
    queryKey: ['subscription-status'],
    queryFn: () => storeApi.getSubscriptionStatus(),
    enabled: !!user,
  })

  const plans = plansData?.plans ?? []
  const isSubscribed = statusData?.is_subscribed ?? false
  const currentSub = statusData?.subscription

  const handleSubscribe = async (plan: string) => {
    if (!user) {
      router.push('/register?redirect=/subscribe')
      return
    }

    setError('')
    setBuying(plan)

    try {
      const result = await storeApi.subscribe(plan)

      // All payment modes go through the detail page for consistent UX.
      // The detail page renders QR (manual) or Snap button (midtrans).
      setBuying(null)
      router.push(`/subscription/${result.subscription.id}`)
    } catch (err) {
      const apiErr = err as ApiError
      setError(apiErr.message || 'Failed to subscribe')
      setBuying(null)
    }
  }

  const bestValue = 'yearly'

  return (
    <div className='flex flex-col gap-6'>
      <Box sx={{ textAlign: 'center' }}>
        <Typography variant='h3' sx={{ fontWeight: 800, mb: 1 }}>
          Playfast Premium
        </Typography>
        <Typography variant='h6' color='text.secondary' sx={{ maxWidth: 600, mx: 'auto' }}>
          Subscribe once, play everything. Access all games with a single subscription.
        </Typography>
      </Box>

      {isSubscribed && currentSub && (
        <Alert severity='success' sx={{ maxWidth: 600, mx: 'auto', width: '100%' }}>
          You are subscribed to the <strong>{currentSub.plan_label}</strong> plan.
          {currentSub.expires_at && (
            <> Expires on <strong>{new Date(currentSub.expires_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>.</>
          )}
        </Alert>
      )}

      {error && (
        <Alert severity='error' sx={{ maxWidth: 600, mx: 'auto', width: '100%' }}>{error}</Alert>
      )}

      {plansLoading || statusLoading ? (
        <Grid container spacing={3} justifyContent='center'>
          {[1, 2, 3].map(i => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={i}>
              <Skeleton variant='rounded' height={280} />
            </Grid>
          ))}
        </Grid>
      ) : (
        <Grid container spacing={3} justifyContent='center'>
          {plans.map(plan => {
            const isBest = plan.plan === bestValue
            const monthlyEquiv = plan.plan === 'monthly'
              ? plan.price
              : plan.plan === '3monthly'
                ? Math.round(plan.price / 3)
                : Math.round(plan.price / 12)

            return (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={plan.plan}>
                <Card
                  sx={{
                    height: '100%',
                    border: '2px solid',
                    borderColor: isBest ? 'primary.main' : 'divider',
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  {isBest && (
                    <Chip
                      label='Best Value'
                      color='primary'
                      size='small'
                      sx={{
                        position: 'absolute',
                        top: -12,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        fontWeight: 700,
                      }}
                    />
                  )}
                  <CardContent sx={{ textAlign: 'center', py: 4, px: 3, display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
                    <Typography variant='h6' sx={{ fontWeight: 700, mb: 1 }}>
                      {plan.label}
                    </Typography>
                    <Typography variant='h3' color='primary.main' sx={{ fontWeight: 800, mb: 0.5 }}>
                      {formatIDR(plan.price)}
                    </Typography>
                    <Typography variant='body2' color='text.secondary' sx={{ mb: 3 }}>
                      {plan.plan !== 'monthly' && `${formatIDR(monthlyEquiv)}/month · `}{plan.duration_days} days
                    </Typography>

                    <Box sx={{ flexGrow: 1 }} />

                    <Button
                      variant={isBest ? 'contained' : 'outlined'}
                      size='large'
                      fullWidth
                      disabled={isSubscribed || buying !== null}
                      onClick={() => handleSubscribe(plan.plan)}
                      sx={{ fontWeight: 700, py: 1.5 }}
                    >
                      {buying === plan.plan ? 'Processing...' : isSubscribed ? 'Already Subscribed' : 'Subscribe'}
                    </Button>
                  </CardContent>
                </Card>
              </Grid>
            )
          })}
        </Grid>
      )}

      {/* Features */}
      <Grid container spacing={2} sx={{ mt: 2, maxWidth: 900, mx: 'auto' }}>
        {[
          { icon: 'tabler-device-gamepad-2', title: 'All Games', desc: 'Access every game in the catalog' },
          { icon: 'tabler-shield-lock', title: 'Steam Guard', desc: 'Automatic 2FA codes included' },
          { icon: 'tabler-bolt', title: 'Instant Access', desc: 'Get credentials immediately after subscribing' },
          { icon: 'tabler-refresh', title: 'Auto-Renew Ready', desc: 'Renew anytime before expiry' },
        ].map(f => (
          <Grid size={{ xs: 12, sm: 6 }} key={f.title}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2 }}>
              <Box
                sx={{
                  width: 44, height: 44, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  bgcolor: 'rgba(201,168,76,0.08)', flexShrink: 0,
                }}
              >
                <i className={f.icon} style={{ fontSize: 22, color: '#c9a84c' }} />
              </Box>
              <Box>
                <Typography variant='subtitle2' sx={{ fontWeight: 700 }}>{f.title}</Typography>
                <Typography variant='caption' color='text.secondary'>{f.desc}</Typography>
              </Box>
            </Box>
          </Grid>
        ))}
      </Grid>

    </div>
  )
}

export default SubscribePage
