'use client'

import { useState, useEffect } from 'react'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import Skeleton from '@mui/material/Skeleton'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import IconButton from '@mui/material/IconButton'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import RadioGroup from '@mui/material/RadioGroup'
import Radio from '@mui/material/Radio'
import FormControl from '@mui/material/FormControl'
import FormLabel from '@mui/material/FormLabel'
import Autocomplete from '@mui/material/Autocomplete'
import CircularProgress from '@mui/material/CircularProgress'

import type { Review } from '@/lib/api'
import { adminApi } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

const gold = '#c9a84c'

type StatusTab = 'pending' | 'approved' | 'rejected' | 'all'

const STATUS_COLORS: Record<Review['status'], 'warning' | 'success' | 'error'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
}

const STATUS_LABELS: Record<Review['status'], string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
}

const PLAN_LABELS = [
  'Subscriber Lifetime',
  'Subscriber Yearly',
  'Subscriber 3 Bulan',
  'Subscriber Monthly',
  'Beli Satuan',
]

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

const StarsDisplay = ({ rating }: { rating: number }) => (
  <Box sx={{ display: 'flex', gap: 0.5 }}>
    {[1, 2, 3, 4, 5].map(s => (
      <i
        key={s}
        className={s <= rating ? 'tabler-star-filled' : 'tabler-star'}
        style={{ fontSize: 16, color: s <= rating ? gold : 'rgba(154,160,166,0.3)' }}
      />
    ))}
  </Box>
)

interface UserOption { id: number; email: string }

const ComposeDialog = ({
  open, onClose, onSaved,
}: { open: boolean; onClose: () => void; onSaved: () => void }) => {
  const [mode, setMode] = useState<'user' | 'manual'>('manual')
  const [userOpts, setUserOpts] = useState<UserOption[]>([])
  const [userQuery, setUserQuery] = useState('')
  const [user, setUser] = useState<UserOption | null>(null)
  const [searching, setSearching] = useState(false)
  const [manualEmail, setManualEmail] = useState('')
  const [manualPlan, setManualPlan] = useState<string>('Subscriber Lifetime')
  const [rating, setRating] = useState(5)
  const [headline, setHeadline] = useState('')
  const [body, setBody] = useState('')
  const [status, setStatus] = useState<'approved' | 'pending'>('approved')
  const [isFeatured, setIsFeatured] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      // Reset form
      setMode('manual')
      setUser(null)
      setUserQuery('')
      setManualEmail('')
      setManualPlan('Subscriber Lifetime')
      setRating(5)
      setHeadline('')
      setBody('')
      setStatus('approved')
      setIsFeatured(false)
      setFiles([])
      previews.forEach(p => URL.revokeObjectURL(p))
      setPreviews([])
      setError(null)
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Debounced user search
  useEffect(() => {
    if (mode !== 'user' || !userQuery || userQuery.length < 2) {
      setUserOpts([])

      return
    }

    const t = setTimeout(() => {
      setSearching(true)
      adminApi.searchUsersForReview(userQuery)
        .then(res => setUserOpts(res.users))
        .finally(() => setSearching(false))
    }, 250)

    return () => clearTimeout(t)
  }, [userQuery, mode])

  const handleFiles = (fs: FileList | File[]) => {
    const arr = Array.from(fs).slice(0, 4 - files.length)

    setFiles(prev => [...prev, ...arr])
    setPreviews(prev => [...prev, ...arr.map(f => URL.createObjectURL(f))])
  }

  const removeFile = (idx: number) => {
    URL.revokeObjectURL(previews[idx])
    setFiles(f => f.filter((_, i) => i !== idx))
    setPreviews(p => p.filter((_, i) => i !== idx))
  }

  const handleSubmit = async () => {
    setError(null)

    if (!body.trim()) return setError('Body wajib diisi.')
    if (mode === 'user' && !user) return setError('Pilih user dulu.')
    if (mode === 'manual' && !manualEmail.trim()) return setError('Email manual wajib diisi.')

    setSubmitting(true)

    try {
      await adminApi.createReview({
        user_id: mode === 'user' ? user!.id : null,
        manual_email: mode === 'manual' ? manualEmail.trim() : undefined,
        manual_plan_label: mode === 'manual' ? manualPlan : undefined,
        rating,
        headline: headline.trim() || undefined,
        body: body.trim(),
        status,
        is_featured: isFeatured,
        images: files,
      })
      onSaved()
      onClose()
    } catch (e: any) {
      setError(e?.message || 'Gagal membuat review.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onClose={() => !submitting && onClose()} maxWidth='sm' fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Tambah Review (Admin)</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
        <FormControl>
          <FormLabel sx={{ mb: 0.5 }}>Mode</FormLabel>
          <RadioGroup
            row
            value={mode}
            onChange={e => setMode(e.target.value as 'user' | 'manual')}
          >
            <FormControlLabel value='manual' control={<Radio size='small' />} label='Manual seed (no user)' />
            <FormControlLabel value='user' control={<Radio size='small' />} label='Link ke user existing' />
          </RadioGroup>
        </FormControl>

        {mode === 'user' ? (
          <Autocomplete
            options={userOpts}
            value={user}
            onChange={(_, v) => setUser(v)}
            inputValue={userQuery}
            onInputChange={(_, v) => setUserQuery(v)}
            getOptionLabel={o => o.email}
            isOptionEqualToValue={(o, v) => o.id === v.id}
            loading={searching}
            renderInput={params => (
              <TextField
                {...params}
                label='Cari user (email)'
                slotProps={{
                  input: {
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {searching ? <CircularProgress size={18} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  },
                }}
              />
            )}
          />
        ) : (
          <>
            <TextField
              label='Email manual (akan disensor jadi ris***@...)'
              value={manualEmail}
              onChange={e => setManualEmail(e.target.value)}
              placeholder='riski@gmail.com'
              required
            />
            <FormControl>
              <FormLabel sx={{ mb: 0.5, fontSize: '0.875rem' }}>Plan badge</FormLabel>
              <RadioGroup row value={manualPlan} onChange={e => setManualPlan(e.target.value)}>
                {PLAN_LABELS.map(p => (
                  <FormControlLabel key={p} value={p} control={<Radio size='small' />} label={p} />
                ))}
              </RadioGroup>
            </FormControl>
          </>
        )}

        <Box>
          <Typography variant='subtitle2' sx={{ mb: 1 }}>Rating</Typography>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            {[1, 2, 3, 4, 5].map(s => (
              <IconButton key={s} onClick={() => setRating(s)} size='small' sx={{ p: 0.25 }}>
                <i
                  className={s <= rating ? 'tabler-star-filled' : 'tabler-star'}
                  style={{ fontSize: 30, color: s <= rating ? gold : 'rgba(154,160,166,0.4)' }}
                />
              </IconButton>
            ))}
          </Box>
        </Box>

        <TextField
          label='Headline (opsional)'
          value={headline}
          onChange={e => setHeadline(e.target.value)}
          slotProps={{ htmlInput: { maxLength: 200 } }}
        />
        <TextField
          label='Body'
          value={body}
          onChange={e => setBody(e.target.value)}
          multiline
          minRows={3}
          required
          slotProps={{ htmlInput: { maxLength: 5000 } }}
        />

        <Box>
          <Typography variant='subtitle2' sx={{ mb: 1 }}>Foto (opsional, max 4)</Typography>
          <Button variant='outlined' component='label' size='small' startIcon={<i className='tabler-upload' />}>
            Upload
            <input
              type='file'
              hidden
              multiple
              accept='image/*'
              onChange={e => {
                if (e.target.files?.length) handleFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </Button>
          {previews.length > 0 && (
            <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
              {previews.map((src, idx) => (
                <Box key={idx} sx={{ position: 'relative', width: 80, height: 80 }}>
                  <Box component='img' src={src} sx={{ width: 80, height: 80, borderRadius: 1, objectFit: 'cover' }} />
                  <IconButton
                    size='small'
                    onClick={() => removeFile(idx)}
                    sx={{ position: 'absolute', top: -8, right: -8, bgcolor: 'rgba(0,0,0,0.85)', color: '#fff', width: 22, height: 22 }}
                  >
                    <i className='tabler-x' style={{ fontSize: 14 }} />
                  </IconButton>
                </Box>
              ))}
            </Box>
          )}
        </Box>

        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <FormControl>
            <FormLabel sx={{ fontSize: '0.875rem', mb: 0.25 }}>Status awal</FormLabel>
            <RadioGroup row value={status} onChange={e => setStatus(e.target.value as 'approved' | 'pending')}>
              <FormControlLabel value='approved' control={<Radio size='small' />} label='Approved (langsung tampil)' />
              <FormControlLabel value='pending' control={<Radio size='small' />} label='Pending' />
            </RadioGroup>
          </FormControl>
          <FormControlLabel
            control={<Switch checked={isFeatured} onChange={e => setIsFeatured(e.target.checked)} size='small' />}
            label='Featured'
          />
        </Box>

        {error && <Alert severity='error'>{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={submitting}>Batal</Button>
        <Button onClick={handleSubmit} variant='contained' disabled={submitting}>
          {submitting ? 'Menyimpan...' : 'Tambah Review'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

const AdminReviewsPage = () => {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [statusTab, setStatusTab] = useState<StatusTab>('pending')
  const [page, setPage] = useState(1)
  const [snack, setSnack] = useState('')
  const [composeOpen, setComposeOpen] = useState(false)
  const [rejectTarget, setRejectTarget] = useState<Review | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<Review | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-reviews', statusTab, page],
    queryFn: () => adminApi.getReviews({ status: statusTab, page, per_page: 20 }),
    enabled: user?.role === 'admin',
  })

  const items = data?.items ?? []
  const stats = data?.stats ?? { pending: 0, approved: 0, rejected: 0 }
  const pages = data?.pages ?? 1

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-reviews'] })

  const approveM = useMutation({
    mutationFn: (id: number) => adminApi.approveReview(id),
    onSuccess: () => { invalidate(); setSnack('Review disetujui.') },
    onError: (e: any) => setSnack(e?.message || 'Gagal approve.'),
  })

  const rejectM = useMutation({
    mutationFn: ({ id, note }: { id: number; note: string }) => adminApi.rejectReview(id, note),
    onSuccess: () => {
      invalidate()
      setSnack('Review ditolak.')
      setRejectTarget(null)
      setRejectNote('')
    },
    onError: (e: any) => setSnack(e?.message || 'Gagal reject.'),
  })

  const featureM = useMutation({
    mutationFn: (id: number) => adminApi.toggleReviewFeatured(id),
    onSuccess: () => { invalidate(); setSnack('Featured toggled.') },
    onError: (e: any) => setSnack(e?.message || 'Gagal.'),
  })

  const deleteM = useMutation({
    mutationFn: (id: number) => adminApi.deleteReview(id),
    onSuccess: () => { invalidate(); setSnack('Review dihapus.'); setConfirmDelete(null) },
    onError: (e: any) => setSnack(e?.message || 'Gagal hapus.'),
  })

  if (user?.role !== 'admin') return <Alert severity='error'>Access denied</Alert>

  const tabs: { value: StatusTab; label: string; count: number; color: 'warning' | 'success' | 'error' | 'primary' }[] = [
    { value: 'pending', label: 'Pending', count: stats.pending, color: 'warning' },
    { value: 'approved', label: 'Approved', count: stats.approved, color: 'success' },
    { value: 'rejected', label: 'Rejected', count: stats.rejected, color: 'error' },
    { value: 'all', label: 'All', count: stats.pending + stats.approved + stats.rejected, color: 'primary' },
  ]

  return (
    <div className='flex flex-col gap-6'>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant='h4' sx={{ fontWeight: 700, mb: 0.5 }}>Reviews</Typography>
          <Typography color='text.secondary'>
            Moderasi review dari pelanggan. Hanya yang disetujui muncul publik.
          </Typography>
        </Box>
        <Button
          variant='contained'
          onClick={() => setComposeOpen(true)}
          startIcon={<i className='tabler-plus' />}
          sx={{ fontWeight: 600 }}
        >
          Tambah Review (Manual / Seed)
        </Button>
      </Box>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <Chip
            key={t.value}
            label={`${t.label} (${t.count})`}
            variant={statusTab === t.value ? 'filled' : 'outlined'}
            color={statusTab === t.value ? t.color : 'default'}
            onClick={() => { setStatusTab(t.value); setPage(1) }}
            sx={{ fontWeight: 600 }}
          />
        ))}
      </Box>

      {isLoading ? (
        <Card><CardContent>{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={100} sx={{ mb: 1.5 }} />)}</CardContent></Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 8 }}>
            <i className='tabler-message-off' style={{ fontSize: 48, opacity: 0.5 }} />
            <Typography variant='h6' sx={{ mt: 2 }}>
              Belum ada review {statusTab !== 'all' && `dengan status ${statusTab}`}
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {items.map(r => (
            <Card key={r.id}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 1.5, mb: 1.5 }}>
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5, flexWrap: 'wrap' }}>
                      <StarsDisplay rating={r.rating} />
                      <Chip size='small' label={STATUS_LABELS[r.status]} color={STATUS_COLORS[r.status]} sx={{ fontWeight: 600 }} />
                      {r.is_featured && <Chip size='small' label='Featured' sx={{ bgcolor: 'rgba(201,168,76,0.15)', color: gold, fontWeight: 600 }} />}
                    </Box>
                    <Typography variant='caption' color='text.secondary'>
                      {r.user_email
                        ? <>User: <strong>{r.user_email}</strong> · {r.plan_label || '—'} · {formatDate(r.created_at)}</>
                        : <>Manual seed: <strong>{r.manual_email}</strong> · {r.manual_plan_label || '—'} · {formatDate(r.created_at)}</>
                      }
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {r.status !== 'approved' && (
                      <Button
                        size='small'
                        variant='contained'
                        color='success'
                        startIcon={<i className='tabler-check' />}
                        onClick={() => approveM.mutate(r.id)}
                      >
                        Approve
                      </Button>
                    )}
                    {r.status !== 'rejected' && (
                      <Button
                        size='small'
                        variant='outlined'
                        color='error'
                        startIcon={<i className='tabler-x' />}
                        onClick={() => { setRejectTarget(r); setRejectNote(r.admin_note ?? '') }}
                      >
                        Reject
                      </Button>
                    )}
                    {r.status === 'approved' && (
                      <Button
                        size='small'
                        variant={r.is_featured ? 'contained' : 'outlined'}
                        startIcon={<i className={r.is_featured ? 'tabler-star-filled' : 'tabler-star'} />}
                        onClick={() => featureM.mutate(r.id)}
                        sx={r.is_featured ? { bgcolor: gold, color: '#000', '&:hover': { bgcolor: '#dfc06a' } } : {}}
                      >
                        {r.is_featured ? 'Featured' : 'Feature'}
                      </Button>
                    )}
                    <IconButton size='small' onClick={() => setConfirmDelete(r)} title='Hapus review'>
                      <i className='tabler-trash' style={{ fontSize: 18, color: '#ef5350' }} />
                    </IconButton>
                  </Box>
                </Box>

                {r.headline && (
                  <Typography variant='subtitle1' sx={{ fontWeight: 700, mb: 0.5 }}>
                    {r.headline}
                  </Typography>
                )}
                <Typography variant='body2' sx={{ color: 'text.secondary', fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>
                  &ldquo;{r.body}&rdquo;
                </Typography>

                {r.images.length > 0 && (
                  <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
                    {r.images.map(img => (
                      <Box
                        key={img.id}
                        component='img'
                        src={img.url}
                        sx={{ width: 80, height: 80, borderRadius: 1, objectFit: 'cover', border: '1px solid', borderColor: 'divider' }}
                      />
                    ))}
                  </Box>
                )}

                {r.status === 'rejected' && r.admin_note && (
                  <Alert severity='warning' sx={{ mt: 1.5 }}>
                    Catatan reject: {r.admin_note}
                  </Alert>
                )}
              </CardContent>
            </Card>
          ))}

          {pages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mt: 2 }}>
              <Button disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
              <Typography sx={{ alignSelf: 'center' }}>{page} / {pages}</Typography>
              <Button disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </Box>
          )}
        </Box>
      )}

      {/* Reject dialog */}
      <Dialog open={!!rejectTarget} onClose={() => setRejectTarget(null)} maxWidth='sm' fullWidth>
        <DialogTitle>Tolak Review #{rejectTarget?.id}</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <TextField
            label='Catatan (opsional)'
            value={rejectNote}
            onChange={e => setRejectNote(e.target.value)}
            multiline
            minRows={3}
            fullWidth
            placeholder='Mis. konten tidak relevan / spam.'
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectTarget(null)}>Batal</Button>
          <Button
            color='error'
            variant='contained'
            onClick={() => rejectTarget && rejectM.mutate({ id: rejectTarget.id, note: rejectNote })}
            disabled={rejectM.isPending}
          >
            Reject
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)} maxWidth='xs' fullWidth>
        <DialogTitle>Hapus review?</DialogTitle>
        <DialogContent>
          <Typography variant='body2'>
            Review ini akan dihapus permanen termasuk gambar yang terlampir.
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

      <ComposeDialog open={composeOpen} onClose={() => setComposeOpen(false)} onSaved={invalidate} />

      <Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack('')} message={snack} />
    </div>
  )
}

export default AdminReviewsPage
