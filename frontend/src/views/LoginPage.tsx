'use client'

import { useState } from 'react'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Box from '@mui/material/Box'

import CustomTextField from '@core/components/mui/TextField'
import { useAuth } from '@/contexts/AuthContext'

const LoginPage = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isPasswordShown, setIsPasswordShown] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await login(email, password)
    } catch (err: any) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className='flex bs-full justify-center items-center min-bs-[100dvh] p-6'>
      <Card sx={{ maxWidth: 440, width: '100%' }}>
        <CardContent sx={{ p: theme => `${theme.spacing(10, 9, 8)} !important` }}>
          <Box sx={{ mb: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className='tabler-brand-steam' style={{ fontSize: 40, marginRight: 12, color: 'var(--mui-palette-primary-main)' }} />
            <Typography variant='h4' sx={{ fontWeight: 700 }}>
              Playfast
            </Typography>
          </Box>
          <Box sx={{ mb: 6 }}>
            <Typography variant='h5' sx={{ mb: 1.5 }}>
              Welcome back!
            </Typography>
            <Typography color='text.secondary'>
              Sign in to access your Steam games
            </Typography>
          </Box>
          {error && (
            <Alert severity='error' sx={{ mb: 4 }}>
              {error}
            </Alert>
          )}
          <form noValidate autoComplete='off' onSubmit={handleSubmit} className='flex flex-col gap-5'>
            <CustomTextField
              autoFocus
              fullWidth
              label='Email'
              placeholder='your@email.com'
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
            <CustomTextField
              fullWidth
              label='Password'
              placeholder='Enter your password'
              type={isPasswordShown ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position='end'>
                      <IconButton edge='end' onClick={() => setIsPasswordShown(s => !s)} onMouseDown={e => e.preventDefault()}>
                        <i className={isPasswordShown ? 'tabler-eye-off' : 'tabler-eye'} />
                      </IconButton>
                    </InputAdornment>
                  )
                }
              }}
            />
            <Button fullWidth variant='contained' type='submit' disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
            <div className='flex justify-center items-center flex-wrap gap-2'>
              <Typography>New here?</Typography>
              <Typography component={Link} href={redirect ? `/register?redirect=${encodeURIComponent(redirect)}` : '/register'} color='primary.main'>
                Create an account
              </Typography>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default LoginPage
