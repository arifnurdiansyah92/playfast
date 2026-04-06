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
import Pagination from '@mui/material/Pagination'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Skeleton from '@mui/material/Skeleton'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'

import { storeApi, formatIDR } from '@/lib/api'

const StorePage = () => {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [availableOnly, setAvailableOnly] = useState(false)
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

  const { data, isLoading } = useQuery({
    queryKey: ['store-games', debouncedSearch, page],
    queryFn: () => storeApi.getGames({ q: debouncedSearch || undefined, page })
  })

  const games = data?.games || []
  const totalPages = data?.pages || 1

  const filteredGames = availableOnly ? games.filter(g => g.available_slots > 0) : games

  return (
    <div className='flex flex-col gap-6'>
      <Box>
        <Typography variant='h4' sx={{ mb: 1 }}>
          Game Store
        </Typography>
        <Typography color='text.secondary'>
          Browse and get access to Steam games
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          placeholder='Search games...'
          value={search}
          onChange={e => handleSearchChange(e.target.value)}
          sx={{ flexGrow: 1, maxWidth: 500 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position='start'>
                  <i className='tabler-search' />
                </InputAdornment>
              )
            }
          }}
        />
        <FormControlLabel
          control={
            <Switch
              checked={availableOnly}
              onChange={(_, checked) => setAvailableOnly(checked)}
            />
          }
          label='Available only'
        />
      </Box>

      {isLoading ? (
        <Grid container spacing={4}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={i}>
              <Card>
                <Skeleton variant='rectangular' height={140} />
                <CardContent>
                  <Skeleton width='80%' height={28} />
                  <Skeleton width='40%' height={20} sx={{ mt: 1 }} />
                  <Skeleton width='60%' height={20} sx={{ mt: 1 }} />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      ) : filteredGames.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 8 }}>
            <i className='tabler-mood-empty' style={{ fontSize: 48, opacity: 0.5 }} />
            <Typography variant='h6' sx={{ mt: 2 }}>
              No games found
            </Typography>
            <Typography color='text.secondary'>
              {search ? 'Try a different search term' : 'No games are available right now'}
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <>
          <Grid container spacing={4}>
            {filteredGames.map(game => (
              <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={game.id}>
                <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <CardActionArea onClick={() => router.push(`/game/${game.appid}`)}>
                    <CardMedia
                      component='img'
                      height={140}
                      image={
                        game.header_image_url ||
                        `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/header.jpg`
                      }
                      alt={game.name}
                      sx={{ objectFit: 'cover' }}
                      onError={(e: any) => {
                        e.target.src = `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/header.jpg`
                      }}
                    />
                    <CardContent sx={{ flexGrow: 1 }}>
                      <Typography variant='subtitle1' sx={{ fontWeight: 600, mb: 1, lineHeight: 1.3 }} noWrap>
                        {game.name}
                      </Typography>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                        <Typography variant='h6' color='primary.main' sx={{ fontWeight: 700 }}>
                          {formatIDR(game.price)}
                        </Typography>
                        <Chip
                          size='small'
                          label={game.available_slots > 0 ? `${game.available_slots} slot${game.available_slots > 1 ? 's' : ''}` : 'Sold out'}
                          color={game.available_slots > 0 ? 'success' : 'default'}
                          variant='tonal'
                        />
                      </Box>
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
              />
            </Box>
          )}
        </>
      )}
    </div>
  )
}

export default StorePage
