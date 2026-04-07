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
          background: 'radial-gradient(ellipse, rgba(0,230,118,0.06) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      <Box sx={{ position: 'relative', zIndex: 1 }}>
        {/* Branding */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, mb: 5 }}>
          <i className='tabler-brand-steam' style={{ fontSize: 32, color: '#00E676' }} />
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
            background: 'linear-gradient(135deg, #00E676 0%, #00C853 50%, #00E676 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            mb: 2,
          }}
        >
          404
        </Typography>

        <Typography variant='h5' sx={{ mt: 1, mb: 1.5, fontWeight: 600 }}>
          Halaman tidak ditemukan
        </Typography>

        <Typography color='text.secondary' sx={{ mb: 5, maxWidth: 420, mx: 'auto', lineHeight: 1.6 }}>
          Halaman yang kamu cari tidak ada atau sudah dipindahkan.
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
              boxShadow: '0 4px 24px rgba(0,230,118,0.25)',
              '&:hover': { boxShadow: '0 6px 32px rgba(0,230,118,0.35)' },
            }}
          >
            Cari Game
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
              '&:hover': { borderColor: '#00E676', bgcolor: 'rgba(0,230,118,0.04)' },
            }}
          >
            Beranda
          </Button>
        </Box>
      </Box>
    </Box>
  )
}

export default NotFound
