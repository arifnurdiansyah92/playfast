'use client'

import { useState } from 'react'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import Skeleton from '@mui/material/Skeleton'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Snackbar from '@mui/material/Snackbar'
import Tooltip from '@mui/material/Tooltip'

import { adminApi } from '@/lib/api'
import type { CreatorApplication, CreatorAppStatus } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

type Tab = CreatorAppStatus | 'all'

const STATUS_COLORS: Record<CreatorAppStatus, 'warning' | 'info' | 'success' | 'error'> = {
  pending: 'warning',
  contacted: 'info',
  approved: 'success',
  rejected: 'error',
}

const STATUS_LABELS: Record<CreatorAppStatus, string> = {
  pending: 'Pending',
  contacted: 'Contacted',
  approved: 'Approved',
  rejected: 'Rejected',
}

const PLATFORM_LABELS: Record<string, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
  x: 'X / Twitter',
  facebook: 'Facebook',
  other: 'Other',
}

const formatDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString('id-ID', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : '-'

const AdminCreatorApplicationsPage = () => {
  const { user } = useAuth()
  const qc = useQueryClient()

  const [tab, setTab] = useState<Tab>('pending')
  const [detail, setDetail] = useState<CreatorApplication | null>(null)
  const [adminNote, setAdminNote] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<CreatorApplication | null>(null)
  const [snack, setSnack] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin-creator-applications', tab],
    queryFn: () => adminApi.getCreatorApplications({ status: tab, per_page: 100 }),
    enabled: user?.role === 'admin',
  })

  const updateM = useMutation({
    mutationFn: (params: { id: number; data: { status?: CreatorAppStatus; admin_note?: string | null } }) =>
      adminApi.updateCreatorApplication(params.id, params.data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['admin-creator-applications'] })
      setSnack(res.message || 'Updated')

      if (detail) setDetail(res.application)
    },
    onError: (e: any) => setSnack(e?.message || 'Update failed'),
  })

  const deleteM = useMutation({
    mutationFn: (id: number) => adminApi.deleteCreatorApplication(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-creator-applications'] })
      setConfirmDelete(null)
      setDetail(null)
      setSnack('Application deleted')
    },
    onError: (e: any) => setSnack(e?.message || 'Delete failed'),
  })

  if (user?.role !== 'admin') return <Alert severity='error'>Access denied</Alert>

  const items = data?.items ?? []
  const counts = data?.counts ?? { pending: 0, contacted: 0, approved: 0, rejected: 0, all: 0 }

  const tabs: { value: Tab; label: string; count: number; color: 'warning' | 'info' | 'success' | 'error' | 'primary' }[] = [
    { value: 'pending', label: 'Pending', count: counts.pending, color: 'warning' },
    { value: 'contacted', label: 'Contacted', count: counts.contacted, color: 'info' },
    { value: 'approved', label: 'Approved', count: counts.approved, color: 'success' },
    { value: 'rejected', label: 'Rejected', count: counts.rejected, color: 'error' },
    { value: 'all', label: 'All', count: counts.all, color: 'primary' },
  ]

  const openDetail = (app: CreatorApplication) => {
    setDetail(app)
    setAdminNote(app.admin_note ?? '')
  }

  const setStatus = (next: CreatorAppStatus) => {
    if (!detail) return
    updateM.mutate({ id: detail.id, data: { status: next, admin_note: adminNote || null } })
  }

  const saveNote = () => {
    if (!detail) return
    updateM.mutate({ id: detail.id, data: { admin_note: adminNote || null } })
  }

  return (
    <div className='flex flex-col gap-6'>
      <Box>
        <Typography variant='h4' sx={{ fontWeight: 700, mb: 0.5 }}>Creator Applications</Typography>
        <Typography color='text.secondary'>
          Aplikasi dari halaman <strong>/creator</strong>. Kontak via WhatsApp/email manual, lalu update status di sini.
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <Chip
            key={t.value}
            label={`${t.label} (${t.count})`}
            variant={tab === t.value ? 'filled' : 'outlined'}
            color={tab === t.value ? t.color : 'default'}
            onClick={() => setTab(t.value)}
            sx={{ fontWeight: 600 }}
          />
        ))}
      </Box>

      {isLoading ? (
        <Card><CardContent>{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={48} sx={{ mb: 1 }} />)}</CardContent></Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 8 }}>
            <i className='tabler-users' style={{ fontSize: 48, opacity: 0.5 }} />
            <Typography variant='h6' sx={{ mt: 2 }}>
              Belum ada aplikasi {tab !== 'all' && `dengan status ${tab}`}
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <TableContainer>
            <Table size='small'>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 70 }}>ID</TableCell>
                  <TableCell>Nama</TableCell>
                  <TableCell>Platform / Handle</TableCell>
                  <TableCell>Followers</TableCell>
                  <TableCell>Contact</TableCell>
                  <TableCell>Submitted</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align='right'>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map(a => (
                  <TableRow
                    key={a.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => openDetail(a)}
                  >
                    <TableCell>#{a.id}</TableCell>
                    <TableCell><Typography variant='body2' sx={{ fontWeight: 600 }}>{a.name}</Typography></TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                        <Typography variant='caption' sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {PLATFORM_LABELS[a.platform] ?? a.platform}
                        </Typography>
                        <Typography variant='body2' sx={{ fontFamily: 'monospace' }}>{a.handle}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell><Chip size='small' label={a.follower_bucket ?? '-'} variant='outlined' /></TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                        <Typography variant='caption' sx={{ color: 'text.secondary' }}>{a.email}</Typography>
                        <Typography variant='caption' sx={{ fontFamily: 'monospace' }}>{a.whatsapp}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell><Typography variant='caption'>{formatDate(a.created_at)}</Typography></TableCell>
                    <TableCell><Chip size='small' label={STATUS_LABELS[a.status]} color={STATUS_COLORS[a.status]} variant='tonal' sx={{ fontWeight: 600 }} /></TableCell>
                    <TableCell align='right' onClick={e => e.stopPropagation()}>
                      <Tooltip title='Hapus aplikasi'>
                        <IconButton size='small' onClick={() => setConfirmDelete(a)}>
                          <i className='tabler-trash' style={{ fontSize: 16, color: '#ef5350' }} />
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

      {/* Detail dialog */}
      <Dialog open={!!detail} onClose={() => setDetail(null)} maxWidth='sm' fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>
          Application #{detail?.id} · {detail?.name}
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {detail && (
            <>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                <Chip size='small' label={STATUS_LABELS[detail.status]} color={STATUS_COLORS[detail.status]} variant='tonal' sx={{ fontWeight: 600 }} />
                {detail.reviewed_at && (
                  <Typography variant='caption' color='text.secondary'>
                    Reviewed by {detail.reviewed_by_email ?? `#${detail.reviewed_by_user_id}`} on {formatDate(detail.reviewed_at)}
                  </Typography>
                )}
              </Box>

              <Box>
                <Typography variant='overline' color='text.secondary' sx={{ letterSpacing: '0.1em', fontWeight: 700, fontSize: '0.65rem' }}>Contact</Typography>
                <Typography variant='body2'><strong>{detail.email}</strong></Typography>
                <Typography variant='body2' sx={{ fontFamily: 'monospace' }}>
                  {detail.whatsapp}{' '}
                  <Button
                    size='small'
                    component='a'
                    href={`https://wa.me/${detail.whatsapp.replace(/\D/g, '')}`}
                    target='_blank'
                    rel='noopener noreferrer'
                    sx={{ ml: 1, minWidth: 0, color: '#25D366', fontWeight: 600 }}
                  >
                    Open WA →
                  </Button>
                </Typography>
              </Box>

              <Box>
                <Typography variant='overline' color='text.secondary' sx={{ letterSpacing: '0.1em', fontWeight: 700, fontSize: '0.65rem' }}>Platform</Typography>
                <Typography variant='body2'>
                  {PLATFORM_LABELS[detail.platform] ?? detail.platform} · <strong>{detail.handle}</strong> · {detail.follower_bucket ?? '—'} followers
                </Typography>
              </Box>

              <Box>
                <Typography variant='overline' color='text.secondary' sx={{ letterSpacing: '0.1em', fontWeight: 700, fontSize: '0.65rem' }}>Konten Submission</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 0.5 }}>
                  {detail.content_links.map((url, i) => (
                    <Typography key={i} variant='body2'>
                      <Box
                        component='a'
                        href={url}
                        target='_blank'
                        rel='noopener noreferrer'
                        sx={{ color: '#c9a84c', textDecoration: 'none', wordBreak: 'break-all', '&:hover': { textDecoration: 'underline' } }}
                      >
                        {url}
                      </Box>
                    </Typography>
                  ))}
                </Box>
              </Box>

              {detail.niche && (
                <Box>
                  <Typography variant='overline' color='text.secondary' sx={{ letterSpacing: '0.1em', fontWeight: 700, fontSize: '0.65rem' }}>Niche</Typography>
                  <Typography variant='body2'>{detail.niche}</Typography>
                </Box>
              )}

              {detail.pitch && (
                <Box>
                  <Typography variant='overline' color='text.secondary' sx={{ letterSpacing: '0.1em', fontWeight: 700, fontSize: '0.65rem' }}>Pitch</Typography>
                  <Typography variant='body2' sx={{ fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>&ldquo;{detail.pitch}&rdquo;</Typography>
                </Box>
              )}

              <TextField
                fullWidth
                multiline
                minRows={2}
                maxRows={5}
                label='Admin note (internal)'
                value={adminNote}
                onChange={e => setAdminNote(e.target.value)}
                placeholder='Mis. niche matches Nandika audience; offered Rp 250K base + 10% commission.'
                slotProps={{ htmlInput: { maxLength: 2000 } }}
                sx={{ mt: 1 }}
              />
              <Button size='small' onClick={saveNote} disabled={updateM.isPending} sx={{ alignSelf: 'flex-start' }}>
                Simpan note saja
              </Button>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap', gap: 1, px: 3, pb: 2.5 }}>
          {detail?.status === 'pending' && (
            <Button
              variant='contained'
              color='info'
              startIcon={<i className='tabler-message-circle' />}
              onClick={() => setStatus('contacted')}
              disabled={updateM.isPending}
            >
              Mark Contacted
            </Button>
          )}
          {(detail?.status === 'pending' || detail?.status === 'contacted') && (
            <Button
              variant='contained'
              color='success'
              startIcon={<i className='tabler-check' />}
              onClick={() => setStatus('approved')}
              disabled={updateM.isPending}
            >
              Approve
            </Button>
          )}
          {detail?.status !== 'rejected' && (
            <Button
              variant='outlined'
              color='error'
              startIcon={<i className='tabler-x' />}
              onClick={() => setStatus('rejected')}
              disabled={updateM.isPending}
            >
              Reject
            </Button>
          )}
          {detail?.status === 'rejected' && (
            <Button
              variant='outlined'
              startIcon={<i className='tabler-refresh' />}
              onClick={() => setStatus('pending')}
              disabled={updateM.isPending}
            >
              Reopen
            </Button>
          )}
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => setDetail(null)} disabled={updateM.isPending}>Tutup</Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)} maxWidth='xs' fullWidth>
        <DialogTitle>Hapus aplikasi?</DialogTitle>
        <DialogContent>
          <Typography variant='body2'>
            Aplikasi <strong>{confirmDelete?.name}</strong> akan dihapus permanen. Tidak bisa di-undo.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)}>Batal</Button>
          <Button
            color='error'
            variant='contained'
            disabled={deleteM.isPending}
            onClick={() => confirmDelete && deleteM.mutate(confirmDelete.id)}
          >
            Hapus
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack('')} message={snack} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </div>
  )
}

export default AdminCreatorApplicationsPage
