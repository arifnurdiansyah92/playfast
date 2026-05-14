'use client'

import { Fragment, useEffect, useState } from 'react'

import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'

import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import InputAdornment from '@mui/material/InputAdornment'
import Snackbar from '@mui/material/Snackbar'
import Skeleton from '@mui/material/Skeleton'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Collapse from '@mui/material/Collapse'
import IconButton from '@mui/material/IconButton'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TablePagination from '@mui/material/TablePagination'

import type { GameRequest } from '@/lib/api'
import { adminApi, formatIDR, gameHeaderImage, handleImageError } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

type StatusTab = 'pending' | 'added' | 'rejected' | 'all'

const STATUS_LABELS: Record<GameRequest['status'], string> = {
  pending: 'Pending',
  added: 'Added',
  rejected: 'Rejected',
}

const STATUS_COLORS: Record<GameRequest['status'], 'warning' | 'success' | 'error'> = {
  pending: 'warning',
  added: 'success',
  rejected: 'error',
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)

    return () => clearTimeout(t)
  }, [value, delayMs])

  return debounced
}

const AdminGameRequestsPage = () => {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [statusTab, setStatusTab] = useState<StatusTab>('all')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [rejectTarget, setRejectTarget] = useState<GameRequest | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [snackMsg, setSnackMsg] = useState('')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)
  const [page, setPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(25)

  useEffect(() => {
    setPage(1)
  }, [statusTab, debouncedSearch, rowsPerPage])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['admin-game-requests', { statusTab, page, rowsPerPage, debouncedSearch }],
    queryFn: () => adminApi.getGameRequests({
      status: statusTab,
      page,
      per_page: rowsPerPage,
      q: debouncedSearch.trim() || undefined,
    }),
    enabled: user?.role === 'admin',
    placeholderData: keepPreviousData,
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const stats = data?.stats ?? { pending: 0, added: 0, rejected: 0 }

  const updateMutation = useMutation({
    mutationFn: (params: { id: number; status: GameRequest['status']; admin_note?: string }) =>
      adminApi.updateGameRequest(params.id, { status: params.status, admin_note: params.admin_note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-game-requests'] })
      setSnackMsg('Status diperbarui')
      setRejectTarget(null)
      setRejectNote('')
    },
    onError: (err: any) => setSnackMsg(err?.message || 'Update gagal'),
  })

  if (user?.role !== 'admin') return <Alert severity='error'>Access denied</Alert>

  const tabs: { value: StatusTab; label: string; count: number; color: 'warning' | 'success' | 'error' | 'primary' }[] = [
    { value: 'pending', label: 'Pending', count: stats.pending, color: 'warning' },
    { value: 'added', label: 'Added', count: stats.added, color: 'success' },
    { value: 'rejected', label: 'Rejected', count: stats.rejected, color: 'error' },
    { value: 'all', label: 'All', count: stats.pending + stats.added + stats.rejected, color: 'primary' },
  ]

  return (
    <div className='flex flex-col gap-6'>
      <Box>
        <Typography variant='h4' sx={{ fontWeight: 700, mb: 0.5 }}>Game Requests</Typography>
        <Typography color='text.secondary'>
          Game yang di-request user. Sortir berdasarkan jumlah pemilih untuk lihat yang paling diminati.
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <Chip
            key={t.value}
            label={`${t.label} (${t.count})`}
            variant={statusTab === t.value ? 'filled' : 'outlined'}
            color={statusTab === t.value ? t.color : 'default'}
            onClick={() => setStatusTab(t.value)}
            sx={{ fontWeight: 600 }}
          />
        ))}
      </Box>

      <TextField
        fullWidth size='small'
        placeholder='Cari berdasarkan nama game atau appid…'
        value={search}
        onChange={e => setSearch(e.target.value)}
        slotProps={{
          input: {
            startAdornment: <InputAdornment position='start'><i className='tabler-search' /></InputAdornment>,
            endAdornment: search ? (
              <InputAdornment position='end'>
                <IconButton size='small' onClick={() => setSearch('')}>
                  <i className='tabler-x' />
                </IconButton>
              </InputAdornment>
            ) : null,
          }
        }}
      />

      {isLoading ? (
        <Card><CardContent>{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={56} sx={{ mb: 1 }} />)}</CardContent></Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 8 }}>
            <i className='tabler-bulb-off' style={{ fontSize: 48, opacity: 0.5 }} />
            <Typography variant='h6' sx={{ mt: 2 }}>
              {debouncedSearch.trim()
                ? 'Tidak ada request yang cocok dengan pencarian'
                : `Belum ada request ${statusTab !== 'all' ? `dengan status ${statusTab}` : ''}`}
            </Typography>
            {debouncedSearch.trim() && (
              <Button variant='outlined' sx={{ mt: 2 }} onClick={() => setSearch('')}>Clear search</Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card sx={{ opacity: isFetching ? 0.7 : 1, transition: 'opacity 0.15s' }}>
          <TableContainer>
            <Table size='small'>
              <TableHead>
                <TableRow>
                  <TableCell width={40} />
                  <TableCell>Game</TableCell>
                  <TableCell align='center'>Requests</TableCell>
                  <TableCell>Harga Steam</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Dibuat</TableCell>
                  <TableCell align='right'>Aksi</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map(req => {
                  const isExpanded = expandedId === req.id

                  return (
                    <Fragment key={req.id}>
                      <TableRow hover>
                        <TableCell>
                          <IconButton
                            size='small'
                            onClick={() => setExpandedId(isExpanded ? null : req.id)}
                          >
                            <i className={isExpanded ? 'tabler-chevron-down' : 'tabler-chevron-right'} />
                          </IconButton>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Box
                              component='img'
                              src={req.header_image || gameHeaderImage(req.appid)}
                              alt={req.name}
                              onError={handleImageError}
                              sx={{ width: 80, height: 'auto', borderRadius: 0.5, flexShrink: 0 }}
                            />
                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant='body2' sx={{ fontWeight: 600 }}>{req.name}</Typography>
                              <Typography variant='caption' color='text.secondary' sx={{ fontFamily: 'monospace' }}>
                                appid: {req.appid}
                              </Typography>
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell align='center'>
                          <Chip
                            label={req.request_count}
                            size='small'
                            color={req.request_count >= 5 ? 'success' : req.request_count >= 2 ? 'primary' : 'default'}
                            sx={{ fontWeight: 700, minWidth: 56 }}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant='body2'>
                            {req.original_price ? formatIDR(req.original_price) : '—'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            size='small'
                            label={STATUS_LABELS[req.status]}
                            color={STATUS_COLORS[req.status]}
                            variant='tonal'
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant='caption' color='text.secondary' sx={{ whiteSpace: 'nowrap' }}>
                            {formatDate(req.created_at)}
                          </Typography>
                        </TableCell>
                        <TableCell align='right'>
                          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            <Button
                              size='small'
                              variant='text'
                              href={req.store_url}
                              target='_blank'
                              rel='noopener noreferrer'
                              startIcon={<i className='tabler-external-link' />}
                            >
                              Steam
                            </Button>
                            {req.status !== 'added' && (
                              <Button
                                size='small'
                                variant='contained'
                                color='success'
                                onClick={() => updateMutation.mutate({ id: req.id, status: 'added' })}
                                disabled={updateMutation.isPending}
                                startIcon={<i className='tabler-check' />}
                              >
                                Added
                              </Button>
                            )}
                            {req.status !== 'rejected' && (
                              <Button
                                size='small'
                                variant='outlined'
                                color='error'
                                onClick={() => {
                                  setRejectTarget(req)
                                  setRejectNote(req.admin_note || '')
                                }}
                                disabled={updateMutation.isPending}
                                startIcon={<i className='tabler-x' />}
                              >
                                Tolak
                              </Button>
                            )}
                            {req.status !== 'pending' && (
                              <Button
                                size='small'
                                variant='text'
                                color='warning'
                                onClick={() => updateMutation.mutate({ id: req.id, status: 'pending' })}
                                disabled={updateMutation.isPending}
                                startIcon={<i className='tabler-rotate' />}
                              >
                                Reset
                              </Button>
                            )}
                          </Box>
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell colSpan={7} sx={{ py: 0, borderBottom: isExpanded ? undefined : 'none' }}>
                          <Collapse in={isExpanded} unmountOnExit>
                            <Box sx={{ py: 2, px: 1 }}>
                              <Typography variant='subtitle2' sx={{ fontWeight: 700, mb: 1 }}>
                                {req.request_count} orang request:
                              </Typography>
                              {req.voters && req.voters.length > 0 ? (
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                  {req.voters.map(v => (
                                    <Box
                                      key={v.user_id}
                                      sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 1.5,
                                        py: 0.5,
                                        borderBottom: '1px dashed',
                                        borderColor: 'divider',
                                      }}
                                    >
                                      <i className='tabler-user' style={{ fontSize: 16, opacity: 0.6 }} />
                                      <Typography variant='body2' sx={{ flex: 1 }}>
                                        {v.email || `User #${v.user_id}`}
                                      </Typography>
                                      <Typography variant='caption' color='text.secondary'>
                                        {formatDate(v.voted_at)}
                                      </Typography>
                                    </Box>
                                  ))}
                                </Box>
                              ) : (
                                <Typography variant='caption' color='text.secondary'>Belum ada voter</Typography>
                              )}
                              {req.admin_note && (
                                <Alert severity='info' icon={false} sx={{ mt: 2 }}>
                                  <Typography variant='caption'>
                                    <strong>Catatan admin:</strong> {req.admin_note}
                                    {req.resolved_by_email && ` — ${req.resolved_by_email}`}
                                  </Typography>
                                </Alert>
                              )}
                              {req.notified_at && (
                                <Alert severity='success' icon={<i className='tabler-mail-check' />} sx={{ mt: 2 }}>
                                  <Typography variant='caption'>
                                    Notifikasi dikirim ke <strong>{req.notified_count ?? 0} voter</strong> pada {formatDate(req.notified_at)}
                                  </Typography>
                                </Alert>
                              )}
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component='div'
            count={total}
            page={page - 1}
            onPageChange={(_, p) => setPage(p + 1)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={e => setRowsPerPage(parseInt(e.target.value, 10))}
            rowsPerPageOptions={[10, 25, 50, 100]}
          />
        </Card>
      )}

      <Dialog
        open={!!rejectTarget}
        onClose={() => !updateMutation.isPending && setRejectTarget(null)}
        maxWidth='sm'
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Tolak Request Game</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          {rejectTarget && (
            <>
              <Typography variant='body2' color='text.secondary'>
                Game: <strong>{rejectTarget.name}</strong> · {rejectTarget.request_count} orang request
              </Typography>
              <TextField
                label='Catatan (akan ditampilkan ke user)'
                value={rejectNote}
                onChange={e => setRejectNote(e.target.value)}
                multiline
                minRows={2}
                fullWidth
                placeholder='Misal: harga terlalu mahal, sudah ada di alternatif, dll.'
                inputProps={{ maxLength: 500 }}
              />
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setRejectTarget(null)} disabled={updateMutation.isPending}>Batal</Button>
          <Button
            variant='contained'
            color='error'
            onClick={() =>
              rejectTarget &&
              updateMutation.mutate({
                id: rejectTarget.id,
                status: 'rejected',
                admin_note: rejectNote.trim() || undefined,
              })
            }
            disabled={updateMutation.isPending}
            startIcon={<i className={updateMutation.isPending ? 'tabler-loader-2' : 'tabler-x'} />}
          >
            {updateMutation.isPending ? 'Menyimpan...' : 'Tolak'}
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

export default AdminGameRequestsPage
