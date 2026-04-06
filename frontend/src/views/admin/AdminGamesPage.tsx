'use client'

import { useState } from 'react'

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

import CustomTextField from '@core/components/mui/TextField'
import { adminApi, formatIDR } from '@/lib/api'
import type { Game } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

const AdminGamesPage = () => {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [editPriceId, setEditPriceId] = useState<number | null>(null)
  const [editPriceValue, setEditPriceValue] = useState('')
  const [instructionsOpen, setInstructionsOpen] = useState<Game | null>(null)
  const [instructionsText, setInstructionsText] = useState('')
  const [snackMsg, setSnackMsg] = useState('')

  const { data: games, isLoading } = useQuery({
    queryKey: ['admin-games'],
    queryFn: () => adminApi.getGames(),
    enabled: user?.role === 'admin'
  })

  const updateGameMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Pick<Game, 'price' | 'enabled'>> }) =>
      adminApi.updateGame(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-games'] })
      setSnackMsg('Game updated')
    },
    onError: (err: any) => {
      setSnackMsg(`Update failed: ${err.message}`)
    }
  })

  const updateInstructionsMutation = useMutation({
    mutationFn: ({ id, instructions }: { id: number; instructions: string }) =>
      adminApi.updateGameInstructions(id, instructions),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-games'] })
      setInstructionsOpen(null)
      setSnackMsg('Instructions updated')
    },
    onError: (err: any) => {
      setSnackMsg(`Update failed: ${err.message}`)
    }
  })

  const handleToggleEnabled = (game: Game) => {
    updateGameMutation.mutate({ id: game.id, data: { enabled: !game.enabled } })
  }

  const handleSavePrice = (id: number) => {
    const price = parseInt(editPriceValue)

    if (isNaN(price) || price < 0) {
      setSnackMsg('Invalid price')

      return
    }

    updateGameMutation.mutate({ id, data: { price } })
    setEditPriceId(null)
  }

  const openInstructions = (game: Game) => {
    setInstructionsOpen(game)
    setInstructionsText(game.instructions || '')
  }

  if (user?.role !== 'admin') {
    return <Alert severity='error'>Access denied</Alert>
  }

  return (
    <div className='flex flex-col gap-6'>
      <Box>
        <Typography variant='h4' sx={{ mb: 1 }}>
          Game Catalog
        </Typography>
        <Typography color='text.secondary'>
          Manage game pricing and availability
        </Typography>
      </Box>

      {isLoading ? (
        <Card>
          <CardContent>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} height={60} sx={{ mb: 1 }} />
            ))}
          </CardContent>
        </Card>
      ) : !games || games.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 8 }}>
            <i className='tabler-device-gamepad' style={{ fontSize: 48, opacity: 0.5 }} />
            <Typography variant='h6' sx={{ mt: 2 }}>
              No games in catalog
            </Typography>
            <Typography color='text.secondary'>
              Add Steam accounts and sync games to populate the catalog
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Game</TableCell>
                  <TableCell>App ID</TableCell>
                  <TableCell>Price</TableCell>
                  <TableCell>Enabled</TableCell>
                  <TableCell>Accounts</TableCell>
                  <TableCell>Orders</TableCell>
                  <TableCell align='right'>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {games.map(game => (
                  <TableRow key={game.id} hover>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Box
                          component='img'
                          src={`https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/capsule_sm_120.jpg`}
                          alt={game.name}
                          sx={{ width: 48, height: 18, borderRadius: 0.5, objectFit: 'cover' }}
                          onError={(e: any) => { e.target.style.display = 'none' }}
                        />
                        <Typography variant='subtitle2' sx={{ fontWeight: 600 }}>
                          {game.name}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant='body2' sx={{ fontFamily: 'monospace' }}>
                        {game.appid}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {editPriceId === game.id ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <CustomTextField
                            size='small'
                            type='number'
                            value={editPriceValue}
                            onChange={e => setEditPriceValue(e.target.value)}
                            sx={{ width: 120 }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleSavePrice(game.id)
                              if (e.key === 'Escape') setEditPriceId(null)
                            }}
                            autoFocus
                          />
                          <IconButton size='small' color='success' onClick={() => handleSavePrice(game.id)}>
                            <i className='tabler-check' />
                          </IconButton>
                          <IconButton size='small' onClick={() => setEditPriceId(null)}>
                            <i className='tabler-x' />
                          </IconButton>
                        </Box>
                      ) : (
                        <Box
                          sx={{ cursor: 'pointer', '&:hover': { color: 'primary.main' } }}
                          onClick={() => {
                            setEditPriceId(game.id)
                            setEditPriceValue(String(game.price))
                          }}
                        >
                          <Typography variant='body2' sx={{ fontWeight: 600 }}>
                            {formatIDR(game.price)}
                          </Typography>
                        </Box>
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={game.enabled}
                        onChange={() => handleToggleEnabled(game)}
                        size='small'
                      />
                    </TableCell>
                    <TableCell>
                      <Chip size='small' label={game.account_count ?? 0} variant='tonal' color='info' />
                    </TableCell>
                    <TableCell>
                      <Chip size='small' label={game.order_count ?? 0} variant='tonal' color='success' />
                    </TableCell>
                    <TableCell align='right'>
                      <Tooltip title='Edit Instructions'>
                        <IconButton size='small' onClick={() => openInstructions(game)}>
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
        <DialogTitle>
          Edit Play Instructions - {instructionsOpen?.name}
        </DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            multiline
            minRows={8}
            maxRows={20}
            value={instructionsText}
            onChange={e => setInstructionsText(e.target.value)}
            placeholder={`Enter step-by-step play instructions for this game.\n\nExample:\n1. Open Steam client\n2. Log in with the credentials above\n3. Enter the Steam Guard code when prompted\n4. Go to Library and find the game\n5. Click Install / Play`}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setInstructionsOpen(null)}>Cancel</Button>
          <Button
            variant='contained'
            onClick={() => {
              if (instructionsOpen) {
                updateInstructionsMutation.mutate({ id: instructionsOpen.id, instructions: instructionsText })
              }
            }}
            disabled={updateInstructionsMutation.isPending}
          >
            {updateInstructionsMutation.isPending ? 'Saving...' : 'Save Instructions'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!snackMsg}
        autoHideDuration={3000}
        onClose={() => setSnackMsg('')}
        message={snackMsg}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </div>
  )
}

export default AdminGamesPage
