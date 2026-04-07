'use client'

import { useState } from 'react'

import { useRouter } from 'next/navigation'

import { useQuery } from '@tanstack/react-query'

import Grid from '@mui/material/Grid'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardMedia from '@mui/material/CardMedia'
import CardActionArea from '@mui/material/CardActionArea'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import IconButton from '@mui/material/IconButton'
import Pagination from '@mui/material/Pagination'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Skeleton from '@mui/material/Skeleton'
import Button from '@mui/material/Button'

import { storeApi, formatIDR } from '@/lib/api'

const StorePage = () => {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Debounce search
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null)

  const handleSearchChange = (value: string) => {
    setSearch(value)

    if (timer) clearTimeout(timer)

    const newTimer = setTimeout(() => {
      setDebouncedSearch(value)
      setPage(1)
    }, 400)

    setTimer(newTimer)
  }

  const clearSearch = () => {
    setSearch('')
    setDebouncedSearch('')
    setPage(1)
    if (timer) clearTimeout(timer)
  }

  const { data, isLoading } = useQuery({
    queryKey: ['store-games', debouncedSearch, page],
    queryFn: () => storeApi.getGames({ q: debouncedSearch || undefined, page })
  })

  const games = data?.games || []
  const totalPages = data?.pages || 1
  const totalGames = data?.total || 0

  return (
    <div className='flex flex-col gap-6'>
      <Box>
        <Typography variant='h4' sx={{ fontWeight: 700, mb: 0.5 }}>
          Game Store
        </Typography>
        <Typography color='text.secondary'>
          Browse and get instant access to Steam games
        </Typography>
      </Box>

      {/* Search bar */}
      <Card
        sx={{
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
          <TextField
            placeholder='Search games by name...'
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
            fullWidth
            variant='outlined'
            sx={{
              '& .MuiOutlinedInput-root': {
                fontSize: '1.05rem',
              },
            }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position='start'>
                    <i className='tabler-search' style={{ fontSize: 22 }} />
                  </InputAdornment>
                ),
                endAdornment: search ? (
                  <InputAdornment position='end'>
                    <IconButton
                      size='small'
                      onClick={clearSearch}
                      aria-label='Clear search'
                      sx={{ color: 'text.secondary' }}
                    >
                      <i className='tabler-x' style={{ fontSize: 18 }} />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              }
            }}
          />
          {!isLoading && debouncedSearch && (
            <Typography variant='body2' color='text.secondary' sx={{ mt: 1 }}>
              {totalGames} result{totalGames !== 1 ? 's' : ''} for &quot;{debouncedSearch}&quot;
            </Typography>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <Grid container spacing={3}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={i}>
              <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
                <Skeleton variant='rectangular' height={140} />
                <CardContent>
                  <Skeleton width='80%' height={24} />
                  <Skeleton width='50%' height={28} sx={{ mt: 1 }} />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      ) : games.length === 0 ? (
        <Card
          sx={{
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <CardContent sx={{ textAlign: 'center', py: 10, px: 4 }}>
            <Box
              sx={{
                width: 96,
                height: 96,
                borderRadius: '50%',
                mx: 'auto',
                mb: 3,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'action.hover',
              }}
            >
              <i className='tabler-search-off' style={{ fontSize: 48, opacity: 0.4 }} />
            </Box>
            <Typography variant='h5' sx={{ fontWeight: 600, mb: 1 }}>
              No games found
            </Typography>
            <Typography color='text.secondary' sx={{ mb: 3, maxWidth: 400, mx: 'auto' }}>
              {search
                ? `We couldn't find any games matching "${search}". Try a different search term or browse all games.`
                : 'No games are available right now. Please check back later!'}
            </Typography>
            {search && (
              <Button
                variant='outlined'
                onClick={clearSearch}
                startIcon={<i className='tabler-x' />}
              >
                Clear Search
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <Grid container spacing={3}>
            {games.map(game => (
              <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={game.id}>
                <Card
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    border: '1px solid',
                    borderColor: 'divider',
                    transition: 'all 0.25s ease',
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      borderColor: 'primary.main',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.3), 0 0 0 1px rgba(102,192,244,0.1)',
                    },
                  }}
                >
                  <CardActionArea
                    onClick={() => router.push(`/game/${game.appid}`)}
                    sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}
                  >
                    <Box sx={{ position: 'relative', overflow: 'hidden' }}>
                      <CardMedia
                        component='img'
                        height={140}
                        image={`https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/header.jpg`}
                        alt={game.name}
                        sx={{
                          objectFit: 'cover',
                          transition: 'transform 0.3s ease',
                          '.MuiCardActionArea-root:hover &': {
                            transform: 'scale(1.05)',
                          },
                        }}
                      />
                      {game.genres && (
                        <Box
                          sx={{
                            position: 'absolute',
                            bottom: 8,
                            left: 8,
                            display: 'flex',
                            gap: 0.5,
                            flexWrap: 'wrap',
                          }}
                        >
                          {game.genres.split(',').slice(0, 2).map(genre => (
                            <Chip
                              key={genre.trim()}
                              label={genre.trim()}
                              size='small'
                              sx={{
                                height: 22,
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                bgcolor: 'rgba(0,0,0,0.7)',
                                backdropFilter: 'blur(4px)',
                                color: '#c7d5e0',
                              }}
                            />
                          ))}
                        </Box>
                      )}
                    </Box>
                    <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', p: 2.5 }}>
                      <Typography
                        variant='subtitle1'
                        sx={{ fontWeight: 600, mb: 'auto', lineHeight: 1.3 }}
                        noWrap
                      >
                        {game.name}
                      </Typography>
                      <Typography variant='h6' color='primary.main' sx={{ fontWeight: 700, mt: 1.5 }}>
                        {formatIDR(game.price)}
                      </Typography>
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            ))}
          </Grid>

          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
              <Pagination
                count={totalPages}
                page={page}
                onChange={(_, val) => setPage(val)}
                color='primary'
                size='large'
              />
            </Box>
          )}
        </>
      )}
    </div>
  )
}

export default StorePage
