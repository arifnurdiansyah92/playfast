'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'

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
import Switch from '@mui/material/Switch'
import FormControlLabel from '@mui/material/FormControlLabel'
import LinearProgress from '@mui/material/LinearProgress'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'

import type {
  EmailCampaign,
  EmailCampaignFilters,
  EmailCampaignStatus,
  JobStatus,
} from '@/lib/api'
import { adminApi } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

const DEFAULT_FILTERS: EmailCampaignFilters = {
  verified_only: true,
  subscribers_only: false,
  never_purchased: false,
  exclude_inactive: true,
}

const STATUS_LABEL: Record<EmailCampaignStatus, string> = {
  draft: 'Draft',
  sending: 'Mengirim',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
  failed: 'Gagal',
}

const STATUS_COLOR: Record<EmailCampaignStatus, 'default' | 'warning' | 'success' | 'error'> = {
  draft: 'default',
  sending: 'warning',
  completed: 'success',
  cancelled: 'error',
  failed: 'error',
}

const formatDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'

const filterLabels: { key: keyof EmailCampaignFilters; label: string; help: string }[] = [
  { key: 'verified_only', label: 'Hanya email terverifikasi', help: 'Skip user yang belum verifikasi email' },
  { key: 'exclude_inactive', label: 'Skip akun nonaktif', help: 'Skip user yang is_active=false' },
  { key: 'subscribers_only', label: 'Hanya subscriber aktif', help: 'Hanya yang punya subscription aktif sekarang' },
  { key: 'never_purchased', label: 'Hanya yang belum pernah beli', help: 'Win-back: skip yang punya order fulfilled' },
]

const AdminEmailBlastPage = () => {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [editor, setEditor] = useState<{
    subject: string
    body: string
    filters: EmailCampaignFilters
  }>({ subject: '', body: '', filters: { ...DEFAULT_FILTERS } })
  const [tab, setTab] = useState<'edit' | 'preview' | 'recipients'>('edit')
  const [snackMsg, setSnackMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [confirmSendOpen, setConfirmSendOpen] = useState(false)
  const [activeJob, setActiveJob] = useState<JobStatus | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ─── Queries ──────────────────────────────────────────────────────────────

  const { data: campaignsData, isLoading: listLoading } = useQuery({
    queryKey: ['admin-email-campaigns'],
    queryFn: () => adminApi.listEmailCampaigns(),
    enabled: user?.role === 'admin',
  })

  const campaigns = campaignsData?.items ?? []

  const { data: detailData } = useQuery({
    queryKey: ['admin-email-campaign', selectedId, tab === 'recipients'],
    queryFn: () =>
      selectedId ? adminApi.getEmailCampaign(selectedId, tab === 'recipients') : Promise.resolve(null),
    enabled: !!selectedId && user?.role === 'admin',
  })

  const detail = detailData?.campaign ?? null

  const { data: audienceData, refetch: refetchAudience } = useQuery({
    queryKey: ['admin-email-audience', editor.filters],
    queryFn: () => adminApi.audienceCount(editor.filters),
    enabled: user?.role === 'admin',
  })

  const audienceCount = audienceData?.count ?? 0

  // ─── Selection sync ───────────────────────────────────────────────────────

  useEffect(() => {
    if (detail) {
      setEditor({
        subject: detail.subject,
        body: detail.body_markdown ?? '',
        filters: { ...DEFAULT_FILTERS, ...detail.filters },
      })
    }
  }, [detail])

  // ─── Job polling ──────────────────────────────────────────────────────────

  const startPolling = useCallback(() => {
    if (pollRef.current) return
    pollRef.current = setInterval(async () => {
      try {
        const res = await adminApi.getJobStatus()

        if (res.job) {
          setActiveJob(res.job)

          if (res.job.status !== 'running') {
            if (pollRef.current) {
              clearInterval(pollRef.current)
              pollRef.current = null
            }
            queryClient.invalidateQueries({ queryKey: ['admin-email-campaigns'] })
            queryClient.invalidateQueries({ queryKey: ['admin-email-campaign'] })
            setSnackMsg(res.job.message || `Blast ${res.job.status}`)
            setTimeout(() => setActiveJob(null), 5000)
          } else {
            queryClient.invalidateQueries({ queryKey: ['admin-email-campaigns'] })
          }
        } else {
          if (pollRef.current) {
            clearInterval(pollRef.current)
            pollRef.current = null
          }
          setActiveJob(null)
        }
      } catch {
        /* ignore */
      }
    }, 2000)
  }, [queryClient])

  useEffect(() => {
    adminApi
      .getJobStatus()
      .then(res => {
        if (res.job && res.job.job_type === 'email_blast') {
          setActiveJob(res.job)
          if (res.job.status === 'running') startPolling()
        }
      })
      .catch(() => {})

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [startPolling])

  // ─── Mutations ────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: () =>
      adminApi.createEmailCampaign({
        subject: editor.subject || 'Untitled draft',
        body_markdown: editor.body,
        filters: editor.filters,
      }),
    onSuccess: res => {
      queryClient.invalidateQueries({ queryKey: ['admin-email-campaigns'] })
      setSelectedId(res.campaign.id)
      setSnackMsg('Draft baru dibuat')
    },
    onError: (err: any) => setErrorMsg(err?.message || 'Gagal membuat draft'),
  })

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!selectedId) throw new Error('Pilih draft dulu')

      return adminApi.updateEmailCampaign(selectedId, {
        subject: editor.subject,
        body_markdown: editor.body,
        filters: editor.filters,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-email-campaigns'] })
      queryClient.invalidateQueries({ queryKey: ['admin-email-campaign', selectedId] })
      setSnackMsg('Draft disimpan')
    },
    onError: (err: any) => setErrorMsg(err?.message || 'Gagal menyimpan'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminApi.deleteEmailCampaign(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-email-campaigns'] })
      setSelectedId(null)
      setSnackMsg('Draft dihapus')
    },
    onError: (err: any) => setSnackMsg(err?.message || 'Gagal menghapus'),
  })

  const testMutation = useMutation({
    mutationFn: () => {
      if (!selectedId) throw new Error('Save the draft first')

      return adminApi.sendEmailTest(selectedId)
    },
    onSuccess: res => setSnackMsg(res.message || 'Test terkirim'),
    onError: (err: any) => setErrorMsg(err?.message || 'Gagal kirim test'),
  })

  const sendMutation = useMutation({
    mutationFn: () => {
      if (!selectedId) throw new Error('Pilih draft dulu')

      return adminApi.sendEmailBlast(selectedId)
    },
    onSuccess: res => {
      setConfirmSendOpen(false)
      setActiveJob(res.job)
      startPolling()
      queryClient.invalidateQueries({ queryKey: ['admin-email-campaigns'] })
      setSnackMsg(res.message || 'Blast dimulai')
    },
    onError: (err: any) => {
      setConfirmSendOpen(false)
      setErrorMsg(err?.message || 'Gagal kirim blast')
    },
  })

  const cancelMutation = useMutation({
    mutationFn: () => adminApi.cancelEmailBlast(),
    onSuccess: res => setSnackMsg(res.message),
    onError: (err: any) => setSnackMsg(err?.message || 'Cancel gagal'),
  })

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const isSending = activeJob?.status === 'running' && activeJob?.job_type === 'email_blast'
  const canEdit = !detail || detail.status === 'draft'

  const handleSaveAndQueue = () => {
    setErrorMsg('')
    if (!editor.subject.trim()) {
      setErrorMsg('Subject tidak boleh kosong')

      return
    }
    if (!editor.body.trim()) {
      setErrorMsg('Body tidak boleh kosong')

      return
    }
    if (!selectedId) {
      createMutation.mutate()

      return
    }
    updateMutation.mutate()
  }

  const handleNewDraft = () => {
    setSelectedId(null)
    setEditor({ subject: '', body: '', filters: { ...DEFAULT_FILTERS } })
    setTab('edit')
    setErrorMsg('')
  }

  if (user?.role !== 'admin') return <Alert severity='error'>Access denied</Alert>

  return (
    <div className='flex flex-col gap-6'>
      <Box>
        <Typography variant='h4' sx={{ fontWeight: 700, mb: 0.5 }}>Email Blast</Typography>
        <Typography color='text.secondary'>
          Draft email dan kirim ke user terdaftar. Audience selalu skip user yang sudah unsubscribe.
        </Typography>
      </Box>

      {isSending && activeJob && (
        <Alert severity='info' icon={<i className='tabler-mail-fast' />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Box sx={{ flex: 1, minWidth: 200 }}>
              <Typography variant='body2' sx={{ fontWeight: 600 }}>
                {activeJob.message || `${activeJob.processed}/${activeJob.total} email terkirim`}
              </Typography>
              <LinearProgress
                variant='determinate'
                value={activeJob.total ? Math.min(100, (activeJob.processed / activeJob.total) * 100) : 0}
                sx={{ mt: 0.5 }}
              />
            </Box>
            <Button
              variant='outlined'
              color='error'
              size='small'
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending || activeJob.cancel_requested}
              startIcon={<i className='tabler-x' />}
            >
              {activeJob.cancel_requested ? 'Cancelling...' : 'Batalkan'}
            </Button>
          </Box>
        </Alert>
      )}

      {/* Campaign list */}
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant='h6' sx={{ fontWeight: 700 }}>Campaigns</Typography>
            <Button variant='contained' onClick={handleNewDraft} startIcon={<i className='tabler-plus' />}>
              Draft Baru
            </Button>
          </Box>
          {listLoading ? (
            <Skeleton height={64} />
          ) : campaigns.length === 0 ? (
            <Typography color='text.secondary' sx={{ textAlign: 'center', py: 4 }}>
              Belum ada campaign.
            </Typography>
          ) : (
            <TableContainer>
              <Table size='small'>
                <TableHead>
                  <TableRow>
                    <TableCell>Subject</TableCell>
                    <TableCell align='center'>Status</TableCell>
                    <TableCell align='right'>Recipients</TableCell>
                    <TableCell align='right'>Sent / Failed</TableCell>
                    <TableCell>Dibuat</TableCell>
                    <TableCell align='right'>Aksi</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {campaigns.map(c => (
                    <TableRow
                      key={c.id}
                      hover
                      selected={selectedId === c.id}
                      onClick={() => setSelectedId(c.id)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell sx={{ fontWeight: selectedId === c.id ? 700 : 500 }}>{c.subject}</TableCell>
                      <TableCell align='center'>
                        <Chip
                          size='small'
                          label={STATUS_LABEL[c.status]}
                          color={STATUS_COLOR[c.status]}
                          variant='tonal'
                        />
                      </TableCell>
                      <TableCell align='right'>{c.total_recipients || '—'}</TableCell>
                      <TableCell align='right'>
                        <Typography variant='caption'>
                          {c.sent_count} / <span style={{ color: c.failed_count ? '#ff5454' : undefined }}>{c.failed_count}</span>
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant='caption' color='text.secondary' sx={{ whiteSpace: 'nowrap' }}>
                          {formatDate(c.created_at)}
                        </Typography>
                      </TableCell>
                      <TableCell align='right'>
                        {c.status === 'draft' ? (
                          <Button
                            size='small'
                            color='error'
                            variant='text'
                            onClick={e => {
                              e.stopPropagation()
                              if (confirm(`Hapus draft "${c.subject}"?`)) deleteMutation.mutate(c.id)
                            }}
                            disabled={deleteMutation.isPending}
                          >
                            Hapus
                          </Button>
                        ) : (
                          <Typography variant='caption' color='text.secondary'>—</Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {/* Editor */}
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
            <Typography variant='h6' sx={{ fontWeight: 700 }}>
              {selectedId
                ? `${detail?.status === 'draft' ? 'Edit' : 'Lihat'} Campaign #${selectedId}`
                : 'Draft Baru'}
            </Typography>
            {detail && (
              <Chip
                size='small'
                label={STATUS_LABEL[detail.status]}
                color={STATUS_COLOR[detail.status]}
                variant='tonal'
              />
            )}
          </Box>

          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
            <Tab label='Edit' value='edit' />
            <Tab label='Preview' value='preview' />
            {detail && detail.status !== 'draft' && (
              <Tab label={`Recipients (${detail.total_recipients})`} value='recipients' />
            )}
          </Tabs>

          {tab === 'edit' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <TextField
                label='Subject'
                value={editor.subject}
                onChange={e => setEditor(s => ({ ...s, subject: e.target.value }))}
                fullWidth
                disabled={!canEdit}
                inputProps={{ maxLength: 300 }}
              />

              <Box>
                <Typography variant='subtitle2' sx={{ fontWeight: 700, mb: 1 }}>
                  Audience{' '}
                  <Chip
                    size='small'
                    label={`${audienceCount} penerima`}
                    color={audienceCount > 0 ? 'primary' : 'default'}
                    sx={{ ml: 1, fontWeight: 700 }}
                  />
                </Typography>
                <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mb: 1 }}>
                  User yang sudah unsubscribe selalu di-skip.
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                  {filterLabels.map(f => (
                    <FormControlLabel
                      key={f.key}
                      control={
                        <Switch
                          checked={editor.filters[f.key]}
                          onChange={e => {
                            const next = { ...editor.filters, [f.key]: e.target.checked }

                            setEditor(s => ({ ...s, filters: next }))
                            // Audience query is keyed on filters and refetches automatically;
                            // an explicit refetch isn't needed but helps when toggling rapidly.
                            setTimeout(() => refetchAudience(), 0)
                          }}
                          disabled={!canEdit}
                        />
                      }
                      label={
                        <Box>
                          <Typography variant='body2'>{f.label}</Typography>
                          <Typography variant='caption' color='text.secondary'>{f.help}</Typography>
                        </Box>
                      }
                    />
                  ))}
                </Box>
              </Box>

              <TextField
                label='Body (Markdown)'
                value={editor.body}
                onChange={e => setEditor(s => ({ ...s, body: e.target.value }))}
                multiline
                minRows={10}
                fullWidth
                disabled={!canEdit}
                placeholder={'# Halo!\n\nIni email blast pertama dari Playfast.\n\n- Promo terbaru\n- [Lihat di sini](https://playfast.id/store)'}
                helperText='Markdown didukung: heading (#), bold (**text**), list (- item), link [text](url)'
              />

              {errorMsg && <Alert severity='error' onClose={() => setErrorMsg('')}>{errorMsg}</Alert>}

              {canEdit && (
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Button
                    variant='contained'
                    color='primary'
                    onClick={handleSaveAndQueue}
                    disabled={updateMutation.isPending || createMutation.isPending}
                    startIcon={<i className='tabler-device-floppy' />}
                  >
                    {selectedId ? 'Simpan Draft' : 'Buat Draft'}
                  </Button>
                  <Button
                    variant='outlined'
                    onClick={() => testMutation.mutate()}
                    disabled={!selectedId || testMutation.isPending}
                    startIcon={<i className='tabler-mail-check' />}
                  >
                    {testMutation.isPending ? 'Mengirim...' : 'Test ke Saya'}
                  </Button>
                  <Button
                    variant='contained'
                    color='success'
                    onClick={() => setConfirmSendOpen(true)}
                    disabled={!selectedId || isSending || audienceCount === 0}
                    startIcon={<i className='tabler-send' />}
                  >
                    Kirim ke {audienceCount} Penerima
                  </Button>
                </Box>
              )}
            </Box>
          )}

          {tab === 'preview' && (
            <Box>
              <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mb: 2 }}>
                Preview kasar (markdown only). Email asli akan dibungkus template branded Playfast saat dikirim.
              </Typography>
              <Card variant='outlined' sx={{ p: 3, bgcolor: '#0f0f1a' }}>
                <Box
                  sx={{
                    color: '#d8dee6',
                    fontSize: 14,
                    lineHeight: 1.7,
                    '& h1': { color: '#fff', fontSize: 22, fontWeight: 700, mb: 2 },
                    '& h2': { color: '#fff', fontSize: 18, fontWeight: 700, my: 2 },
                    '& h3': { color: '#fff', fontSize: 16, fontWeight: 700, my: 1.5 },
                    '& p': { mb: 1.5, color: '#c8d0d8' },
                    '& a': { color: '#c9a84c' },
                    '& strong': { color: '#fff' },
                    '& ul, & ol': { mb: 1.5, pl: 2.5, color: '#c8d0d8' },
                    '& li': { mb: 0.5 },
                    '& blockquote': {
                      borderLeft: '3px solid #c9a84c',
                      px: 2,
                      py: 0.5,
                      color: '#a8b0bc',
                      bgcolor: 'rgba(201,168,76,0.08)',
                    },
                    '& code': { bgcolor: '#1a1a2e', px: 0.5, borderRadius: 0.5, color: '#c9a84c' },
                  }}
                >
                  {editor.body.trim() ? (
                    <ReactMarkdown>{editor.body}</ReactMarkdown>
                  ) : (
                    <Typography color='text.secondary'>Body kosong.</Typography>
                  )}
                </Box>
              </Card>
            </Box>
          )}

          {tab === 'recipients' && detail?.recipients && (
            <RecipientsTable recipients={detail.recipients} />
          )}
        </CardContent>
      </Card>

      {/* Confirm send dialog */}
      <Dialog open={confirmSendOpen} onClose={() => !sendMutation.isPending && setConfirmSendOpen(false)} maxWidth='sm' fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Konfirmasi Kirim Blast</DialogTitle>
        <DialogContent>
          <Typography variant='body2' sx={{ mb: 1 }}>
            Email akan dikirim ke <strong>{audienceCount} penerima</strong> dengan subject:
          </Typography>
          <Alert severity='info' icon={false} sx={{ mb: 2 }}>
            {editor.subject || '(no subject)'}
          </Alert>
          <Typography variant='caption' color='warning.main'>
            Aksi ini tidak bisa dibatalkan setelah dimulai (cuma bisa di-cancel mid-blast).
            Pastikan kamu sudah test ke email sendiri.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setConfirmSendOpen(false)} disabled={sendMutation.isPending}>
            Batal
          </Button>
          <Button
            variant='contained'
            color='success'
            onClick={() => sendMutation.mutate()}
            disabled={sendMutation.isPending}
            startIcon={<i className={sendMutation.isPending ? 'tabler-loader-2' : 'tabler-send'} />}
          >
            {sendMutation.isPending ? 'Memulai...' : `Kirim ke ${audienceCount}`}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!snackMsg}
        autoHideDuration={3500}
        onClose={() => setSnackMsg('')}
        message={snackMsg}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </div>
  )
}

const RecipientsTable = ({ recipients }: { recipients: NonNullable<EmailCampaign['recipients']> }) => {
  const [filter, setFilter] = useState<'all' | 'sent' | 'failed' | 'pending'>('all')

  const filtered = useMemo(
    () => (filter === 'all' ? recipients : recipients.filter(r => r.status === filter)),
    [recipients, filter]
  )

  const counts = useMemo(
    () => ({
      all: recipients.length,
      sent: recipients.filter(r => r.status === 'sent').length,
      failed: recipients.filter(r => r.status === 'failed').length,
      pending: recipients.filter(r => r.status === 'pending').length,
    }),
    [recipients]
  )

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        {(['all', 'sent', 'failed', 'pending'] as const).map(f => (
          <Chip
            key={f}
            label={`${f} (${counts[f]})`}
            variant={filter === f ? 'filled' : 'outlined'}
            color={f === 'failed' ? 'error' : f === 'sent' ? 'success' : 'default'}
            onClick={() => setFilter(f)}
            sx={{ textTransform: 'capitalize', fontWeight: 600 }}
          />
        ))}
      </Box>
      <TableContainer>
        <Table size='small'>
          <TableHead>
            <TableRow>
              <TableCell>Email</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Sent at</TableCell>
              <TableCell>Error</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map(r => (
              <TableRow key={r.id} hover>
                <TableCell>{r.email}</TableCell>
                <TableCell>
                  <Chip
                    size='small'
                    label={r.status}
                    color={r.status === 'sent' ? 'success' : r.status === 'failed' ? 'error' : 'default'}
                    variant='tonal'
                  />
                </TableCell>
                <TableCell>
                  <Typography variant='caption' color='text.secondary'>
                    {formatDate(r.sent_at)}
                  </Typography>
                </TableCell>
                <TableCell sx={{ maxWidth: 320 }}>
                  {r.error ? (
                    <Typography variant='caption' color='error.main' sx={{ whiteSpace: 'pre-wrap' }}>
                      {r.error}
                    </Typography>
                  ) : (
                    <Typography variant='caption' color='text.disabled'>—</Typography>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  )
}

export default AdminEmailBlastPage
