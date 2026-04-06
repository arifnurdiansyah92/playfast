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
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import IconButton from '@mui/material/IconButton'
import Snackbar from '@mui/material/Snackbar'

import CustomTextField from '@core/components/mui/TextField'
import { adminApi } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

const AdminAccountsPage = () => {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [addOpen, setAddOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [addError, setAddError] = useState('')
  const [snackMsg, setSnackMsg] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['admin-accounts'],
    queryFn: () => adminApi.getAccounts(),
    enabled: user?.role === 'admin'
  })

  const addMutation = useMutation({
    mutationFn: (formData: FormData) => adminApi.addAccount(formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-accounts'] })
      setAddOpen(false)
      setPassword('')
      setFile(null)
      setAddError('')
      setSnackMsg('Account added successfully')
    },
    onError: (err: any) => {
      setAddError(err.message || 'Failed to add account')
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminApi.deleteAccount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-accounts'] })
      setDeleteConfirm(null)
      setSnackMsg('Account deleted')
    },
    onError: (err: any) => {
      setSnackMsg(`Delete failed: ${err.message}`)
      setDeleteConfirm(null)
    }
  })

  const syncMutation = useMutation({
    mutationFn: () => adminApi.syncGames(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-accounts'] })
      queryClient.invalidateQueries({ queryKey: ['admin-games'] })
      setSnackMsg('Game sync started')
    },
    onError: (err: any) => {
      setSnackMsg(`Sync failed: ${err.message}`)
    }
  })

  const handleAdd = () => {
    if (!file) {
      setAddError('Please select a maFile')

      return
    }

    if (!password) {
      setAddError('Password is required')

      return
    }

    const formData = new FormData()

    formData.append('mafile', file)
    formData.append('password', password)
    addMutation.mutate(formData)
  }

  if (user?.role !== 'admin') {
    return <Alert severity='error'>Access denied</Alert>
  }

  return (
    <div className='flex flex-col gap-6'>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant='h4' sx={{ mb: 1 }}>
            Steam Accounts
          </Typography>
          <Typography color='text.secondary'>
            Manage Steam accounts for game sharing
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant='outlined'
            startIcon={<i className='tabler-refresh' />}
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
          >
            {syncMutation.isPending ? 'Syncing...' : 'Sync All Games'}
          </Button>
          <Button
            variant='contained'
            startIcon={<i className='tabler-plus' />}
            onClick={() => setAddOpen(true)}
          >
            Add Account
          </Button>
        </Box>
      </Box>

      {isLoading ? (
        <Card>
          <CardContent>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} height={60} sx={{ mb: 1 }} />
            ))}
          </CardContent>
        </Card>
      ) : !accounts || accounts.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 8 }}>
            <i className='tabler-users' style={{ fontSize: 48, opacity: 0.5 }} />
            <Typography variant='h6' sx={{ mt: 2 }}>
              No accounts yet
            </Typography>
            <Typography color='text.secondary'>
              Add a Steam account to get started
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Username</TableCell>
                  <TableCell>Steam ID</TableCell>
                  <TableCell>Games</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell align='right'>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {accounts.map(account => (
                  <TableRow key={account.id} hover>
                    <TableCell>
                      <Typography variant='subtitle2' sx={{ fontWeight: 600, fontFamily: 'monospace' }}>
                        {account.username}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant='body2' sx={{ fontFamily: 'monospace' }}>
                        {account.steam_id || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip size='small' label={account.game_count} variant='tonal' color='info' />
                    </TableCell>
                    <TableCell>
                      <Chip
                        size='small'
                        label={account.status || 'Active'}
                        color={account.status === 'active' || !account.status ? 'success' : 'warning'}
                        variant='tonal'
                      />
                    </TableCell>
                    <TableCell>
                      {new Date(account.created_at).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </TableCell>
                    <TableCell align='right'>
                      <IconButton
                        color='error'
                        size='small'
                        onClick={() => setDeleteConfirm(account.id)}
                      >
                        <i className='tabler-trash' />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      {/* Add Account Dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth='sm' fullWidth>
        <DialogTitle>Add Steam Account</DialogTitle>
        <DialogContent>
          {addError && (
            <Alert severity='error' sx={{ mb: 3, mt: 1 }}>
              {addError}
            </Alert>
          )}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 1 }}>
            <Box>
              <Typography variant='body2' sx={{ mb: 1 }}>
                Steam Guard maFile
              </Typography>
              <Button variant='outlined' component='label' startIcon={<i className='tabler-upload' />}>
                {file ? file.name : 'Choose maFile'}
                <input
                  type='file'
                  hidden
                  accept='.maFile,.json'
                  onChange={e => setFile(e.target.files?.[0] || null)}
                />
              </Button>
            </Box>
            <CustomTextField
              fullWidth
              label='Steam Password'
              type='password'
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder='Enter the Steam account password'
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant='contained' onClick={handleAdd} disabled={addMutation.isPending}>
            {addMutation.isPending ? 'Adding...' : 'Add Account'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirm !== null} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>Delete Account?</DialogTitle>
        <DialogContent>
          <Typography>
            This will permanently remove the Steam account and all associated data. This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button
            variant='contained'
            color='error'
            onClick={() => deleteConfirm !== null && deleteMutation.mutate(deleteConfirm)}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
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

export default AdminAccountsPage
