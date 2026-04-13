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
import Checkbox from '@mui/material/Checkbox'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Pagination from '@mui/material/Pagination'

import CustomTextField from '@core/components/mui/TextField'
import { adminApi, formatIDR, gameThumbnail, handleImageError } from '@/lib/api'
import type { Game } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

const AdminGamesPage = () => {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  // Filters
  const [search, setSearch] = useState('')
  const [filterGenre, setFilterGenre] = useState('')
  const [filterEnabled, setFilterEnabled] = useState('')
  const [filterFeatured, setFilterFeatured] = useState('')
  const [filterYear, setFilterYear] = useState('')
  const [page, setPage] = useState(1)
  const perPage = 50

  // Inline edit
  const [editPriceId, setEditPriceId] = useState<number | null>(null)
  const [editPriceValue, setEditPriceValue] = useState('')
  const [instructionsOpen, setInstructionsOpen] = useState<Game | null>(null)
  const [instructionsText, setInstructionsText] = useState('')

  // Selection
  const [selected, setSelected] = useState<Set<number>>(new Set())

  // Bulk action dialog
  const [bulkDialog, setBulkDialog] = useState<'price' | null>(null)
  const [bulkPriceValue, setBulkPriceValue] = useState('')

  const [snackMsg, setSnackMsg] = useState('')

  const queryKey = ['admin-games', search, filterGenre, filterEnabled, filterFeatured, filterYear, page]

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => adminApi.getGames({
      q: search || undefined,
      genre: filterGenre || undefined,
      is_enabled: filterEnabled || undefined,
      is_featured: filterFeatured || undefined,
      year: filterYear || undefined,
      page,
      per_page: perPage,
    }),
    enabled: user?.role === 'admin'
  })

  const games = data?.games ?? []
  const total = data?.total ?? 0
  const totalPages = data?.pages ?? 1
  const genres = data?.genres ?? []
  const years = data?.years ?? []

  const updateGameMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<{ price: number; is_enabled: boolean; is_featured: boolean }> }) =>
      adminApi.updateGame(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-games'] })
      setSnackMsg('Game updated')
    },
    onError: (err: any) => setSnackMsg(`Update failed: ${err.message}`)
  })

  const bulkUpdateMutation = useMutation({
    mutationFn: ({ ids, data }: { ids: number[]; data: Partial<{ price: number; is_enabled: boolean; is_featured: boolean }> }) =>
      adminApi.bulkUpdateGames(ids, data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin-games'] })
      setSelected(new Set())
      setBulkDialog(null)
      setSnackMsg(res.message)
    },
    onError: (err: any) => setSnackMsg(`Bulk update failed: ${err.message}`)
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

  // Selection helpers
  const selectedIds = useMemo(() => [...selected], [selected])
  const allOnPageSelected = games.length > 0 && games.every(g => selected.has(g.id))
  const someOnPageSelected = games.some(g => selected.has(g.id))

  const toggleSelectAll = () => {
    if (allOnPageSelected) {
      const next = new Set(selected)
      games.forEach(g => next.delete(g.id))
      setSelected(next)
    } else {
      const next = new Set(selected)
      games.forEach(g => next.add(g.id))
      setSelected(next)
    }
  }

  const toggleSelect = (id: number) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  // Bulk actions
  const handleBulkEnable = (enable: boolean) => {
    bulkUpdateMutation.mutate({ ids: selectedIds, data: { is_enabled: enable } })
  }

  const handleBulkFeatured = (featured: boolean) => {
    bulkUpdateMutation.mutate({ ids: selectedIds, data: { is_featured: featured } })
  }

  const handleBulkPrice = () => {
    const price = parseInt(bulkPriceValue)
    if (isNaN(price) || price < 0) { setSnackMsg('Invalid price'); return }
    bulkUpdateMutation.mutate({ ids: selectedIds, data: { price } })
  }

  const clearFilters = () => {
    setSearch('')
    setFilterGenre('')
    setFilterEnabled('')
    setFilterFeatured('')
    setFilterYear('')
    setPage(1)
  }

  const hasActiveFilters = !!(search || filterGenre || filterEnabled || filterFeatured || filterYear)

  if (user?.role !== 'admin') return <Alert severity='error'>Access denied</Alert>

  return (
    <div className='flex flex-col gap-6'>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant='h4' sx={{ mb: 1 }}>Game Catalog</Typography>
          <Typography color='text.secondary'>
            {total} games{hasActiveFilters ? ' (filtered)' : ''}
          </Typography>
        </Box>
      </Box>

      {/* Filters */}
      <Card>
        <CardContent sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
          <TextField
            placeholder='Search by name or app ID...'
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            size='small'
            sx={{ minWidth: 240, flex: 1 }}
            slotProps={{
              input: {
                startAdornment: <InputAdornment position='start'><i className='tabler-search' /></InputAdornment>,
                endAdornment: search ? (
                  <InputAdornment position='end'>
                    <IconButton size='small' onClick={() => { setSearch(''); setPage(1) }}><i className='tabler-x' /></IconButton>
                  </InputAdornment>
                ) : null,
              }
            }}
          />
          <FormControl size='small' sx={{ minWidth: 160 }}>
            <InputLabel>Genre</InputLabel>
            <Select value={filterGenre} label='Genre' onChange={e => { setFilterGenre(e.target.value); setPage(1) }}>
              <MenuItem value=''>All Genres</MenuItem>
              {genres.map(g => <MenuItem key={g} value={g}>{g}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size='small' sx={{ minWidth: 130 }}>
            <InputLabel>Status</InputLabel>
            <Select value={filterEnabled} label='Status' onChange={e => { setFilterEnabled(e.target.value); setPage(1) }}>
              <MenuItem value=''>All</MenuItem>
              <MenuItem value='true'>Enabled</MenuItem>
              <MenuItem value='false'>Disabled</MenuItem>
            </Select>
          </FormControl>
          <FormControl size='small' sx={{ minWidth: 130 }}>
            <InputLabel>Featured</InputLabel>
            <Select value={filterFeatured} label='Featured' onChange={e => { setFilterFeatured(e.target.value); setPage(1) }}>
              <MenuItem value=''>All</MenuItem>
              <MenuItem value='true'>Featured</MenuItem>
            </Select>
          </FormControl>
          <FormControl size='small' sx={{ minWidth: 120 }}>
            <InputLabel>Year</InputLabel>
            <Select value={filterYear} label='Year' onChange={e => { setFilterYear(e.target.value); setPage(1) }}>
              <MenuItem value=''>All Years</MenuItem>
              {years.map(y => <MenuItem key={y} value={String(y)}>{y}</MenuItem>)}
            </Select>
          </FormControl>
          {hasActiveFilters && (
            <Button size='small' variant='text' color='secondary' onClick={clearFilters} startIcon={<i className='tabler-x' />}>
              Clear
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Bulk Action Bar */}
      {selected.size > 0 && (
        <Card sx={{ border: '1px solid', borderColor: 'primary.main' }}>
          <CardContent sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center', py: '12px !important' }}>
            <Chip label={`${selected.size} selected`} color='primary' variant='tonal' onDelete={() => setSelected(new Set())} />
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button size='small' variant='outlined' color='success' onClick={() => handleBulkEnable(true)} disabled={bulkUpdateMutation.isPending}>
                Enable
              </Button>
              <Button size='small' variant='outlined' color='error' onClick={() => handleBulkEnable(false)} disabled={bulkUpdateMutation.isPending}>
                Disable
              </Button>
              <Button size='small' variant='outlined' color='warning' onClick={() => handleBulkFeatured(true)} disabled={bulkUpdateMutation.isPending}>
                Feature
              </Button>
              <Button size='small' variant='outlined' onClick={() => handleBulkFeatured(false)} disabled={bulkUpdateMutation.isPending}>
                Unfeature
              </Button>
              <Button size='small' variant='contained' onClick={() => { setBulkDialog('price'); setBulkPriceValue('') }} disabled={bulkUpdateMutation.isPending}>
                Set Price
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <Card><CardContent>{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={60} sx={{ mb: 1 }} />)}</CardContent></Card>
      ) : games.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 8 }}>
            <i className='tabler-device-gamepad' style={{ fontSize: 48, opacity: 0.5 }} />
            <Typography variant='h6' sx={{ mt: 2 }}>
              {!hasActiveFilters ? 'No games in catalog' : 'No games match your filters'}
            </Typography>
            <Typography color='text.secondary'>
              {!hasActiveFilters ? 'Add Steam accounts and sync games to populate the catalog' : 'Try different filters or clear them'}
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <TableContainer>
            <Table size='small'>
              <TableHead>
                <TableRow>
                  <TableCell padding='checkbox'>
                    <Checkbox
                      checked={allOnPageSelected}
                      indeterminate={someOnPageSelected && !allOnPageSelected}
                      onChange={toggleSelectAll}
                    />
                  </TableCell>
                  <TableCell>Game</TableCell>
                  <TableCell>Price</TableCell>
                  <TableCell align='center'>Enabled</TableCell>
                  <TableCell align='center'>Featured</TableCell>
                  <TableCell align='center'>Accounts</TableCell>
                  <TableCell align='right'>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {games.map(game => (
                  <TableRow key={game.id} hover sx={{ opacity: game.is_enabled ? 1 : 0.5 }} selected={selected.has(game.id)}>
                    <TableCell padding='checkbox'>
                      <Checkbox checked={selected.has(game.id)} onChange={() => toggleSelect(game.id)} />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Box
                          component='img'
                          src={gameThumbnail(game.appid)}
                          alt={game.name}
                          sx={{ width: 64, height: 30, borderRadius: 0.5, objectFit: 'cover' }}
                          onError={handleImageError}
                        />
                        <Box>
                          <Typography variant='subtitle2' sx={{ fontWeight: 600 }}>{game.name}</Typography>
                          <Typography variant='caption' color='text.secondary'>{game.appid}</Typography>
                          {game.genres && (
                            <Typography variant='caption' color='text.disabled' sx={{ display: 'block', fontSize: '0.7rem' }}>
                              {game.genres}
                            </Typography>
                          )}
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
                      <Chip size='small' label={game.available_accounts ?? 0} variant='tonal' color='info' />
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
          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <Pagination count={totalPages} page={page} onChange={(_, p) => setPage(p)} color='primary' />
            </Box>
          )}
        </Card>
      )}

      {/* Bulk Set Price Dialog */}
      <Dialog open={bulkDialog === 'price'} onClose={() => setBulkDialog(null)} maxWidth='xs' fullWidth>
        <DialogTitle>Set Price for {selected.size} Games</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth type='number' label='Price (IDR)' value={bulkPriceValue}
            onChange={e => setBulkPriceValue(e.target.value)}
            sx={{ mt: 2 }}
            onKeyDown={e => { if (e.key === 'Enter') handleBulkPrice() }}
            autoFocus
          />
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setBulkDialog(null)}>Cancel</Button>
          <Button variant='contained' onClick={handleBulkPrice} disabled={bulkUpdateMutation.isPending}>
            {bulkUpdateMutation.isPending ? 'Updating...' : 'Apply'}
          </Button>
        </DialogActions>
      </Dialog>

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
