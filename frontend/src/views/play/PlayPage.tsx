'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

import { useRouter } from 'next/navigation'

import { useQuery } from '@tanstack/react-query'

import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardMedia from '@mui/material/CardMedia'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import Alert from '@mui/material/Alert'
import Skeleton from '@mui/material/Skeleton'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Snackbar from '@mui/material/Snackbar'

import ReactMarkdown from 'react-markdown'

import { storeApi } from '@/lib/api'

interface Props {
  orderId: string
}

/** Circular countdown ring rendered with SVG */
const CountdownRing = ({ seconds, total }: { seconds: number; total: number }) => {
  const size = 64
  const strokeWidth = 5
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const progress = seconds / total
  const dashOffset = circumference * (1 - progress)
  const isLow = seconds <= 5
  const isWarn = seconds <= 10 && !isLow

  const color = isLow ? '#f44336' : isWarn ? '#ff9800' : '#66c0f4'

  return (
    <Box sx={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill='none'
          stroke='rgba(255,255,255,0.08)'
          strokeWidth={strokeWidth}
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill='none'
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap='round'
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s ease' }}
        />
      </svg>
      <Typography
        variant='body2'
        sx={{
          position: 'absolute',
          fontWeight: 700,
          fontFamily: 'monospace',
          color,
          fontSize: '1rem',
        }}
      >
        {seconds}s
      </Typography>
    </Box>
  )
}

const PlayPage = ({ orderId }: Props) => {
  const router = useRouter()
  const [code, setCode] = useState<string | null>(null)
  const [codeExpiresIn, setCodeExpiresIn] = useState(0)
  const [codeLoading, setCodeLoading] = useState(false)
  const [codeError, setCodeError] = useState('')
  const [copySnack, setCopySnack] = useState('')
  const [justCopied, setJustCopied] = useState<string | null>(null)
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

  const fetchCode = useCallback(async () => {
    setCodeError('')
    setCodeLoading(true)

    try {
      const result = await storeApi.getCode(orderId)

      setCode(result.code)
      setCodeExpiresIn(result.remaining)
    } catch (err: any) {
      setCodeError(err.message || 'Failed to get Steam Guard code')
    } finally {
      setCodeLoading(false)
    }
  }, [orderId])

  // Countdown timer for code expiry — auto-refresh when reaching 0
  useEffect(() => {
    if (codeExpiresIn > 0) {
      timerRef.current = setInterval(() => {
        setCodeExpiresIn(prev => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current)

            // Auto-refresh the code
            fetchCode()

            return 0
          }

          return prev - 1
        })
      }, 1000)
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [code, fetchCode])

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopySnack(`${label} copied!`)
    setJustCopied(label)
    setTimeout(() => setJustCopied(null), 1500)
  }

  if (orderLoading) {
    return (
      <div className='flex flex-col gap-6'>
        <Skeleton variant='rectangular' height={200} sx={{ borderRadius: 1 }} />
        <Skeleton variant='rectangular' height={160} sx={{ borderRadius: 1 }} />
        <Skeleton variant='rectangular' height={200} sx={{ borderRadius: 1 }} />
      </div>
    )
  }

  if (!order) {
    return <Alert severity='error'>Order not found</Alert>
  }

  const instructions = instructionsData?.instructions?.content
  const headerImage = order.game?.appid
    ? `https://cdn.akamai.steamstatic.com/steam/apps/${order.game.appid}/header.jpg`
    : null

  return (
    <div className='flex flex-col gap-5'>
      <Button
        variant='text'
        startIcon={<i className='tabler-arrow-left' />}
        onClick={() => router.push('/my-games')}
        sx={{ alignSelf: 'flex-start' }}
      >
        Back to My Games
      </Button>

      {/* Game Header with Image */}
      <Card sx={{ border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
        {headerImage && (
          <CardMedia
            component='img'
            image={headerImage}
            alt={order.game?.name || 'Game'}
            sx={{ height: { xs: 140, sm: 180 }, objectFit: 'cover' }}
          />
        )}
        <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'rgba(102,192,244,0.08)',
              flexShrink: 0,
            }}
          >
            <i className='tabler-device-gamepad-2' style={{ fontSize: 24, color: '#66c0f4' }} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant='h5' sx={{ fontWeight: 700 }} noWrap>
              {order.game?.name}
            </Typography>
            <Typography variant='body2' color='text.secondary'>
              Account: <Box component='span' sx={{ fontFamily: 'monospace' }}>{order.credentials?.account_name}</Box>
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {order.is_revoked && (
        <Alert severity='error' sx={{ fontSize: '1rem' }}>
          <Typography variant='subtitle1' sx={{ fontWeight: 700 }}>
            Access Revoked
          </Typography>
          <Typography variant='body2'>
            Your access to this game has been revoked by an administrator. You can no longer generate Steam Guard codes or use the credentials below.
          </Typography>
        </Alert>
      )}

      {/* Credentials Section */}
      <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
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
                borderRadius: 2,
                p: 2.5,
                border: '1px solid',
                borderColor: 'divider',
                gap: 2,
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography variant='caption' color='text.secondary'>
                  Steam Username
                </Typography>
                <Typography variant='h6' sx={{ fontFamily: 'monospace', fontWeight: 600 }} noWrap>
                  {order.credentials?.account_name || 'N/A'}
                </Typography>
              </Box>
              <Tooltip title={justCopied === 'Username' ? 'Copied!' : 'Copy username'}>
                <IconButton
                  onClick={() => copyToClipboard(order.credentials?.account_name || 'N/A', 'Username')}
                  color={justCopied === 'Username' ? 'success' : 'primary'}
                  sx={{ flexShrink: 0 }}
                >
                  <i className={justCopied === 'Username' ? 'tabler-check' : 'tabler-copy'} />
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
                borderRadius: 2,
                p: 2.5,
                border: '1px solid',
                borderColor: 'divider',
                gap: 2,
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography variant='caption' color='text.secondary'>
                  Steam Password
                </Typography>
                <Typography variant='h6' sx={{ fontFamily: 'monospace', fontWeight: 600 }} noWrap>
                  {order.credentials?.password || '********'}
                </Typography>
              </Box>
              {order.credentials?.password && (
                <Tooltip title={justCopied === 'Password' ? 'Copied!' : 'Copy password'}>
                  <IconButton
                    onClick={() => copyToClipboard(order.credentials!.password, 'Password')}
                    color={justCopied === 'Password' ? 'success' : 'primary'}
                    sx={{ flexShrink: 0 }}
                  >
                    <i className={justCopied === 'Password' ? 'tabler-check' : 'tabler-copy'} />
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
          borderColor: code ? 'primary.main' : 'divider',
          transition: 'border-color 0.3s ease',
        }}
      >
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
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
              {/* Large code display */}
              <Box
                onClick={() => copyToClipboard(code, 'Steam Guard code')}
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 2,
                  background: 'linear-gradient(135deg, rgba(102,192,244,0.15) 0%, rgba(79,163,215,0.1) 100%)',
                  border: '2px solid',
                  borderColor: 'primary.main',
                  borderRadius: 3,
                  px: { xs: 3, sm: 6 },
                  py: { xs: 2, sm: 3 },
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    transform: 'scale(1.02)',
                    boxShadow: '0 0 32px rgba(102,192,244,0.2)',
                  },
                  mb: 3,
                  animation: codeLoading ? undefined : 'codeAppear 0.4s ease-out',
                  '@keyframes codeAppear': {
                    '0%': { opacity: 0, transform: 'scale(0.9)' },
                    '100%': { opacity: 1, transform: 'scale(1)' },
                  },
                  // Pulsing glow when refreshing
                  ...(codeExpiresIn <= 3 && codeExpiresIn > 0 ? {
                    animation: 'codePulse 1s ease-in-out infinite',
                    '@keyframes codePulse': {
                      '0%, 100%': { boxShadow: '0 0 16px rgba(244,67,54,0.2)' },
                      '50%': { boxShadow: '0 0 32px rgba(244,67,54,0.4)' },
                    },
                  } : {}),
                }}
              >
                <Typography
                  variant='h1'
                  sx={{
                    fontFamily: 'monospace',
                    fontWeight: 800,
                    letterSpacing: '0.35em',
                    fontSize: { xs: '2.2rem', sm: '3.5rem' },
                    color: 'primary.main',
                    userSelect: 'all',
                  }}
                >
                  {code}
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                  <i
                    className={justCopied === 'Steam Guard code' ? 'tabler-check' : 'tabler-copy'}
                    style={{
                      fontSize: 24,
                      color: justCopied === 'Steam Guard code' ? '#4caf50' : '#66c0f4',
                    }}
                  />
                  <Typography variant='caption' sx={{ color: '#8f98a0', fontSize: '0.65rem' }}>
                    {justCopied === 'Steam Guard code' ? 'Copied!' : 'Click'}
                  </Typography>
                </Box>
              </Box>

              {/* Countdown ring + text */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, mb: 3 }}>
                <CountdownRing seconds={codeExpiresIn} total={30} />
                <Box sx={{ textAlign: 'left' }}>
                  <Typography variant='body2' sx={{ fontWeight: 600 }}>
                    {codeExpiresIn > 0 ? `Expires in ${codeExpiresIn}s` : 'Refreshing...'}
                  </Typography>
                  <Typography variant='caption' color='text.secondary'>
                    Auto-refreshes when expired
                  </Typography>
                </Box>
              </Box>

              <Button
                variant='outlined'
                onClick={fetchCode}
                disabled={codeLoading}
                startIcon={<i className='tabler-refresh' />}
                size='small'
              >
                Get New Code
              </Button>
            </Box>
          ) : (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <Box
                sx={{
                  width: 80,
                  height: 80,
                  borderRadius: '50%',
                  mx: 'auto',
                  mb: 3,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: 'rgba(102,192,244,0.08)',
                  border: '1px solid rgba(102,192,244,0.15)',
                }}
              >
                <i className='tabler-shield-lock' style={{ fontSize: 36, color: '#66c0f4' }} />
              </Box>
              <Typography variant='body1' sx={{ mb: 1, fontWeight: 500 }}>
                Need a Steam Guard code?
              </Typography>
              <Typography color='text.secondary' sx={{ mb: 3, maxWidth: 400, mx: 'auto' }}>
                When Steam asks for a verification code during login, click the button below to generate one instantly.
              </Typography>
              <Button
                variant='contained'
                size='large'
                onClick={fetchCode}
                disabled={codeLoading}
                startIcon={<i className={codeLoading ? 'tabler-loader-2' : 'tabler-shield-lock'} />}
                sx={{
                  minWidth: 260,
                  py: 1.5,
                  fontWeight: 700,
                  boxShadow: '0 4px 16px rgba(102,192,244,0.2)',
                }}
              >
                {codeLoading ? 'Generating...' : 'Generate Steam Guard Code'}
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Instructions Section */}
      {instructions && (
        <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
          <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
            <Typography variant='h6' sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <i className='tabler-book' style={{ fontSize: 22 }} />
              How to Play
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <Box
              sx={{
                color: '#c7d5e0',
                lineHeight: 1.8,
                '& h1, & h2, & h3, & h4, & h5, & h6': {
                  color: '#fff',
                  mt: 2,
                  mb: 1,
                  fontWeight: 700,
                },
                '& h1': { fontSize: '1.5rem' },
                '& h2': { fontSize: '1.3rem' },
                '& h3': { fontSize: '1.15rem' },
                '& p': { mb: 1.5 },
                '& a': { color: '#66c0f4', textDecoration: 'underline' },
                '& code': {
                  fontFamily: 'monospace',
                  bgcolor: 'rgba(102,192,244,0.1)',
                  px: 0.8,
                  py: 0.2,
                  borderRadius: 0.5,
                  fontSize: '0.9em',
                },
                '& pre': {
                  bgcolor: 'rgba(0,0,0,0.3)',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  p: 2,
                  overflow: 'auto',
                  '& code': {
                    bgcolor: 'transparent',
                    px: 0,
                    py: 0,
                  },
                },
                '& ul, & ol': { pl: 3, mb: 1.5 },
                '& li': { mb: 0.5 },
                '& blockquote': {
                  borderLeft: '3px solid',
                  borderColor: '#66c0f4',
                  pl: 2,
                  ml: 0,
                  color: '#8f98a0',
                  fontStyle: 'italic',
                },
                '& hr': {
                  border: 'none',
                  borderTop: '1px solid',
                  borderColor: 'divider',
                  my: 2,
                },
                '& img': { maxWidth: '100%', borderRadius: 1 },
              }}
            >
              <ReactMarkdown>{instructions}</ReactMarkdown>
            </Box>
          </CardContent>
        </Card>
      )}

      <Snackbar
        open={!!copySnack}
        autoHideDuration={1500}
        onClose={() => setCopySnack('')}
        message={copySnack}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        ContentProps={{
          sx: {
            bgcolor: 'success.main',
            color: 'success.contrastText',
            fontWeight: 600,
            '& .MuiSnackbarContent-message': {
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            },
          },
        }}
      />
    </div>
  )
}

export default PlayPage
