'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

import { useRouter } from 'next/navigation'

import { useQuery } from '@tanstack/react-query'

import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import Alert from '@mui/material/Alert'
import Skeleton from '@mui/material/Skeleton'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import LinearProgress from '@mui/material/LinearProgress'
import Snackbar from '@mui/material/Snackbar'

import { storeApi } from '@/lib/api'

interface Props {
  orderId: string
}

const PlayPage = ({ orderId }: Props) => {
  const router = useRouter()
  const [code, setCode] = useState<string | null>(null)
  const [codeExpiresIn, setCodeExpiresIn] = useState(0)
  const [codeLoading, setCodeLoading] = useState(false)
  const [codeError, setCodeError] = useState('')
  const [copySnack, setCopySnack] = useState('')
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { data: order, isLoading: orderLoading } = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => storeApi.getOrder(orderId)
  })

  const { data: instructionsData } = useQuery({
    queryKey: ['instructions', orderId],
    queryFn: () => storeApi.getInstructions(orderId),
    enabled: !!order
  })

  // Countdown timer for code expiry
  useEffect(() => {
    if (codeExpiresIn > 0) {
      timerRef.current = setInterval(() => {
        setCodeExpiresIn(prev => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current)
            setCode(null)

            return 0
          }

          return prev - 1
        })
      }, 1000)
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [code])

  const fetchCode = useCallback(async () => {
    setCodeError('')
    setCodeLoading(true)

    try {
      const result = await storeApi.getCode(orderId)

      setCode(result.code)
      setCodeExpiresIn(result.expires_in)
    } catch (err: any) {
      setCodeError(err.message || 'Failed to get Steam Guard code')
    } finally {
      setCodeLoading(false)
    }
  }, [orderId])

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopySnack(`${label} copied!`)
  }

  if (orderLoading) {
    return (
      <div className='flex flex-col gap-6'>
        <Skeleton variant='rectangular' height={60} />
        <Skeleton variant='rectangular' height={200} />
        <Skeleton variant='rectangular' height={200} />
      </div>
    )
  }

  if (!order) {
    return <Alert severity='error'>Order not found</Alert>
  }

  const instructions = instructionsData?.instructions

  return (
    <div className='flex flex-col gap-6'>
      <Button
        variant='text'
        startIcon={<i className='tabler-arrow-left' />}
        onClick={() => router.push('/my-games')}
        sx={{ alignSelf: 'flex-start' }}
      >
        Back to My Games
      </Button>

      {/* Game Title */}
      <Card>
        <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <i className='tabler-device-gamepad-2' style={{ fontSize: 32, color: 'var(--mui-palette-primary-main)' }} />
          <Box>
            <Typography variant='h5' sx={{ fontWeight: 700 }}>
              {order.game_name}
            </Typography>
            <Typography variant='body2' color='text.secondary'>
              Account: {order.account_name}
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {/* Credentials Section */}
      <Card>
        <CardContent sx={{ p: 4 }}>
          <Typography variant='h6' sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
            <i className='tabler-key' style={{ fontSize: 22 }} />
            Login Credentials
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Username */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                bgcolor: 'action.hover',
                borderRadius: 1,
                p: 2
              }}
            >
              <Box>
                <Typography variant='caption' color='text.secondary'>
                  Steam Username
                </Typography>
                <Typography variant='h6' sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                  {order.steam_username || order.account_name}
                </Typography>
              </Box>
              <Tooltip title='Copy username'>
                <IconButton
                  onClick={() => copyToClipboard(order.steam_username || order.account_name, 'Username')}
                  color='primary'
                >
                  <i className='tabler-copy' />
                </IconButton>
              </Tooltip>
            </Box>

            {/* Password */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                bgcolor: 'action.hover',
                borderRadius: 1,
                p: 2
              }}
            >
              <Box>
                <Typography variant='caption' color='text.secondary'>
                  Steam Password
                </Typography>
                <Typography variant='h6' sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                  {order.steam_password || '********'}
                </Typography>
              </Box>
              {order.steam_password && (
                <Tooltip title='Copy password'>
                  <IconButton
                    onClick={() => copyToClipboard(order.steam_password!, 'Password')}
                    color='primary'
                  >
                    <i className='tabler-copy' />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Steam Guard Code Section */}
      <Card
        sx={{
          border: '2px solid',
          borderColor: code ? 'primary.main' : 'divider'
        }}
      >
        <CardContent sx={{ p: 4 }}>
          <Typography variant='h6' sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
            <i className='tabler-shield-lock' style={{ fontSize: 22 }} />
            Steam Guard Code
          </Typography>

          {codeError && (
            <Alert severity='error' sx={{ mb: 2 }}>
              {codeError}
            </Alert>
          )}

          {code ? (
            <Box sx={{ textAlign: 'center', py: 2 }}>
              <Box
                onClick={() => copyToClipboard(code, 'Steam Guard code')}
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 2,
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  borderRadius: 2,
                  px: 5,
                  py: 3,
                  cursor: 'pointer',
                  transition: 'transform 0.1s',
                  '&:hover': { transform: 'scale(1.02)' },
                  mb: 2
                }}
              >
                <Typography
                  variant='h2'
                  sx={{
                    fontFamily: 'monospace',
                    fontWeight: 800,
                    letterSpacing: '0.3em',
                    fontSize: { xs: '2rem', sm: '3rem' }
                  }}
                >
                  {code}
                </Typography>
                <i className='tabler-copy' style={{ fontSize: 24 }} />
              </Box>

              <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
                Click the code to copy. It expires in {codeExpiresIn} second{codeExpiresIn !== 1 ? 's' : ''}.
              </Typography>

              <LinearProgress
                variant='determinate'
                value={(codeExpiresIn / 30) * 100}
                sx={{
                  height: 8,
                  borderRadius: 4,
                  maxWidth: 400,
                  mx: 'auto',
                  mb: 2
                }}
                color={codeExpiresIn <= 5 ? 'error' : codeExpiresIn <= 10 ? 'warning' : 'primary'}
              />

              <Button
                variant='outlined'
                onClick={fetchCode}
                disabled={codeLoading}
                startIcon={<i className='tabler-refresh' />}
              >
                Get New Code
              </Button>
            </Box>
          ) : (
            <Box sx={{ textAlign: 'center', py: 2 }}>
              <Typography color='text.secondary' sx={{ mb: 3 }}>
                When Steam asks for a Guard code, click the button below to generate one.
              </Typography>
              <Button
                variant='contained'
                size='large'
                onClick={fetchCode}
                disabled={codeLoading}
                startIcon={<i className='tabler-shield-lock' />}
                sx={{ minWidth: 250 }}
              >
                {codeLoading ? 'Generating...' : 'Get Steam Guard Code'}
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Instructions Section */}
      {instructions && (
        <Card>
          <CardContent sx={{ p: 4 }}>
            <Typography variant='h6' sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <i className='tabler-book' style={{ fontSize: 22 }} />
              How to Play
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <Typography
              variant='body1'
              sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}
            >
              {instructions}
            </Typography>
          </CardContent>
        </Card>
      )}

      <Snackbar
        open={!!copySnack}
        autoHideDuration={2000}
        onClose={() => setCopySnack('')}
        message={copySnack}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </div>
  )
}

export default PlayPage
