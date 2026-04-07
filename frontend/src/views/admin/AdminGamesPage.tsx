'use client'

import { useState, useMemo } from 'react'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Skeleton from '@mui/material/Skeleton'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import Switch from '@mui/material/Switch'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Snackbar from '@mui/material/Snackbar'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import InputAdornment from '@mui/material/InputAdornment'
import Grid from '@mui/material/Grid'

import CustomTextField from '@core/components/mui/TextField'
import { adminApi, formatIDR } from '@/lib/api'
import type { Game } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

const AdminGamesPage = () => {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [editPriceId, setEditPriceId] = useState<number | null>(null)
  const [editPriceValue, setEditPriceValue] = useState('')
  const [instructionsOpen, setInstructionsOpen] = useState<Game | null>(null)
  const [instructionsText, setInstructionsText] = useState('')
  const [snackMsg, setSnackMsg] = useState('')
  const [filterFeatured, setFilterFeatured] = useState(false)
  const [filterDisabled, setFilterDisabled] = useState(false)

  const { data: games, isLoading } = useQuery({
    queryKey: ['admin-games'],
    queryFn: () => adminApi.getGames(),
    enabled: user?.role === 'admin'
  })

  const filteredGames = useMemo(() => {
    if (!games) return []
    let result = games
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(g => g.name.toLowerCase().includes(q) || String(g.appid).includes(q))
    }
    if (filterFeatured) result = result.filter(g => g.is_featured)
    if (filterDisabled) result = result.filter(g => !g.is_enabled)
    return result
  }, [games, search, filterFeatured, filterDisabled])

  const updateGameMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<{ price: number; is_enabled: boolean; is_featured: boolean }> }) =>
      adminApi.updateGame(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-games'] })
      setSnackMsg('Game updated')
    },
    onError: (err: any) => setSnackMsg(`Update failed: ${err.message}`)
  })

  const updateInstructionsMutation = useMutation({
    mutationFn: ({ id, instructions }: { id: number; instructions: string }) =>
      adminApi.updateGameInstructions(id, instructions),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-games'] })
      setInstructionsOpen(null)
      setSnackMsg('Instructions updated')
    },
    onError: (err: any) => setSnackMsg(`Update failed: ${err.message}`)
  })

  const handleSavePrice = (id: number) => {
    const price = parseInt(editPriceValue)
    if (isNaN(price) || price < 0) { setSnackMsg('Invalid price'); return }
    updateGameMutation.mutate({ id, data: { price } })
    setEditPriceId(null)
  }

  if (user?.role !== 'admin') return <Alert severity='error'>Access denied</Alert>

  const totalGames = games?.length ?? 0
  const enabledCount = games?.filter(g => g.is_enabled).length ?? 0
  const featuredCount = games?.filter(g => g.is_featured).length ?? 0

  return (
    <div className='flex flex-col gap-6'>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant='h4' sx={{ mb: 1 }}>Game Catalog</Typography>
          <Typography color='text.secondary'>
            {totalGames} games &middot; {enabledCount} enabled &middot; {featuredCount} featured
          </Typography>
        </Box>
      </Box>

      {/* Stats row */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card sx={{ cursor: 'pointer', border: filterFeatured ? '2px solid' : '1px solid', borderColor: filterFeatured ? 'warning.main' : 'divider' }} onClick={() => setFilterFeatured(!filterFeatured)}>
            <CardContent sx={{ py: 2, px: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
              <i className='tabler-star' style={{ fontSize: 24, color: filterFeatured ? '#e5c07b' : '#8f98a0' }} />
              <Box>
                <Typography variant='h6' sx={{ fontWeight: 700 }}>{featuredCount}</Typography>
                <Typography variant='caption' color='text.secondary'>Featured</Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card sx={{ cursor: 'pointer', border: filterDisabled ? '2px solid' : '1px solid', borderColor: filterDisabled ? 'error.main' : 'divider' }} onClick={() => setFilterDisabled(!filterDisabled)}>
            <CardContent sx={{ py: 2, px: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
              <i className='tabler-eye-off' style={{ fontSize: 24, color: filterDisabled ? '#c44' : '#8f98a0' }} />
              <Box>
                <Typography variant='h6' sx={{ fontWeight: 700 }}>{totalGames - enabledCount}</Typography>
                <Typography variant='caption' color='text.secondary'>Disabled</Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Search */}
      <TextField
        fullWidth
        placeholder='Search games by name or app ID...'
        value={search}
        onChange={e => setSearch(e.target.value)}
        size='small'
        slotProps={{
          input: {
            startAdornment: <InputAdornment position='start'><i className='tabler-search' /></InputAdornment>,
            endAdornment: search ? (
              <InputAdornment position='end'>
                <IconButton size='small' onClick={() => setSearch('')}><i className='tabler-x' /></IconButton>
              </InputAdornment>
            ) : null,
          }
        }}
      />

      {isLoading ? (
        <Card><CardContent>{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={60} sx={{ mb: 1 }} />)}</CardContent></Card>
      ) : filteredGames.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 8 }}>
            <i className='tabler-device-gamepad' style={{ fontSize: 48, opacity: 0.5 }} />
            <Typography variant='h6' sx={{ mt: 2 }}>
              {games?.length === 0 ? 'No games in catalog' : 'No games match your filter'}
            </Typography>
            <Typography color='text.secondary'>
              {games?.length === 0 ? 'Add Steam accounts and sync games to populate the catalog' : 'Try a different search or clear filters'}
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <TableContainer>
            <Table size='small'>
              <TableHead>
                <TableRow>
                  <TableCell>Game</TableCell>
                  <TableCell>Price</TableCell>
                  <TableCell align='center'>Enabled</TableCell>
                  <TableCell align='center'>Featured</TableCell>
                  <TableCell align='center'>Accounts</TableCell>
                  <TableCell align='right'>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredGames.map(game => (
                  <TableRow key={game.id} hover sx={{ opacity: game.is_enabled ? 1 : 0.5 }}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Box
                          component='img'
                          src={`https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/capsule_sm_120.jpg`}
                          alt={game.name}
                          sx={{ width: 64, height: 30, borderRadius: 0.5, objectFit: 'cover' }}
                          onError={(e: any) => { e.target.style.display = 'none' }}
                        />
                        <Box>
                          <Typography variant='subtitle2' sx={{ fontWeight: 600 }}>{game.name}</Typography>
                          <Typography variant='caption' color='text.secondary'>{game.appid}</Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      {editPriceId === game.id ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <CustomTextField
                            size='small'
                            type='number'
                            value={editPriceValue}
                            onChange={e => setEditPriceValue(e.target.value)}
                            sx={{ width: 110 }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleSavePrice(game.id)
                              if (e.key === 'Escape') setEditPriceId(null)
                            }}
                            autoFocus
                          />
                          <IconButton size='small' color='success' onClick={() => handleSavePrice(game.id)}><i className='tabler-check' /></IconButton>
                          <IconButton size='small' onClick={() => setEditPriceId(null)}><i className='tabler-x' /></IconButton>
                        </Box>
                      ) : (
                        <Typography
                          variant='body2'
                          sx={{ fontWeight: 600, cursor: 'pointer', '&:hover': { color: 'primary.main' } }}
                          onClick={() => { setEditPriceId(game.id); setEditPriceValue(String(game.price)) }}
                        >
                          {formatIDR(game.price)}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align='center'>
                      <Switch
                        checked={game.is_enabled}
                        onChange={() => updateGameMutation.mutate({ id: game.id, data: { is_enabled: !game.is_enabled } })}
                        size='small'
                      />
                    </TableCell>
                    <TableCell align='center'>
                      <Tooltip title={game.is_featured ? 'Remove from featured' : 'Add to featured'}>
                        <IconButton
                          size='small'
                          onClick={() => updateGameMutation.mutate({ id: game.id, data: { is_featured: !game.is_featured } })}
                          sx={{ color: game.is_featured ? 'warning.main' : 'text.disabled' }}
                        >
                          <i className={game.is_featured ? 'tabler-star-filled' : 'tabler-star'} />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                    <TableCell align='center'>
                      <Chip size='small' label={game.accounts?.length ?? 0} variant='tonal' color='info' />
                    </TableCell>
                    <TableCell align='right'>
                      <Tooltip title='Edit Instructions'>
                        <IconButton size='small' onClick={() => { setInstructionsOpen(game); setInstructionsText('') }}>
                          <i className='tabler-book-2' />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      {/* Instructions Dialog */}
      <Dialog open={instructionsOpen !== null} onClose={() => setInstructionsOpen(null)} maxWidth='md' fullWidth>
        <DialogTitle>Edit Play Instructions - {instructionsOpen?.name}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth multiline minRows={8} maxRows={20}
            value={instructionsText}
            onChange={e => setInstructionsText(e.target.value)}
            placeholder={`Enter step-by-step play instructions...\n\n1. Open Steam\n2. Log in with credentials\n3. Enter Steam Guard code\n4. Go to Library\n5. Install and play in offline mode`}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setInstructionsOpen(null)}>Cancel</Button>
          <Button
            variant='contained'
            onClick={() => instructionsOpen && updateInstructionsMutation.mutate({ id: instructionsOpen.id, instructions: instructionsText })}
            disabled={updateInstructionsMutation.isPending}
          >
            {updateInstructionsMutation.isPending ? 'Saving...' : 'Save Instructions'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snackMsg} autoHideDuration={3000} onClose={() => setSnackMsg('')} message={snackMsg} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </div>
  )
}

export default AdminGamesPage
