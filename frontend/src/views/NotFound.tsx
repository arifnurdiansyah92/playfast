'use client'

import Link from 'next/link'

import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'

const NotFound = ({ mode }: { mode?: string }) => {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100dvh',
        textAlign: 'center',
        p: 4,
        background: 'linear-gradient(180deg, #0a0e17 0%, #1b2838 100%)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background glow effect */}
      <Box
        sx={{
          position: 'absolute',
          top: '30%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '600px',
          height: '600px',
          borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(102,192,244,0.06) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      <Box sx={{ position: 'relative', zIndex: 1 }}>
        {/* Branding */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, mb: 5 }}>
          <i className='tabler-brand-steam' style={{ fontSize: 32, color: '#66c0f4' }} />
          <Typography variant='h5' sx={{ fontWeight: 800, letterSpacing: '-0.01em' }}>
            Playfast
          </Typography>
        </Box>

        {/* 404 display */}
        <Typography
          variant='h1'
          sx={{
            fontWeight: 800,
            fontSize: { xs: '5rem', md: '8rem' },
            lineHeight: 1,
            background: 'linear-gradient(135deg, #66c0f4 0%, #4fa3d7 50%, #66c0f4 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            mb: 2,
          }}
        >
          404
        </Typography>

        <Typography variant='h5' sx={{ mt: 1, mb: 1.5, fontWeight: 600 }}>
          Page not found
        </Typography>

        <Typography color='text.secondary' sx={{ mb: 5, maxWidth: 420, mx: 'auto', lineHeight: 1.6 }}>
          The page you are looking for does not exist, has been moved, or is temporarily unavailable. Let us get you back on track.
        </Typography>

        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button
            component={Link}
            href='/store'
            variant='contained'
            size='large'
            startIcon={<i className='tabler-building-store' />}
            sx={{
              px: 4,
              fontWeight: 700,
              boxShadow: '0 4px 24px rgba(102,192,244,0.25)',
              '&:hover': { boxShadow: '0 6px 32px rgba(102,192,244,0.35)' },
            }}
          >
            Browse Games
          </Button>
          <Button
            component={Link}
            href='/'
            variant='outlined'
            size='large'
            sx={{
              px: 4,
              fontWeight: 700,
              borderColor: '#3d5a80',
              color: '#c7d5e0',
              '&:hover': { borderColor: '#66c0f4', bgcolor: 'rgba(102,192,244,0.04)' },
            }}
          >
            Home
          </Button>
        </Box>
      </Box>
    </Box>
  )
}

export default NotFound
