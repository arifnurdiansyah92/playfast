'use client'

import { useState } from 'react'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Divider from '@mui/material/Divider'

import { adminApi } from '@/lib/api'
import type { EmailLogStatus } from '@/lib/api'

interface Props {
  logId: number | null
  open: boolean
  onClose: () => void
}

const STATUS_COLOR: Record<EmailLogStatus, 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  queued: 'default',
  sent: 'info',
  failed: 'error',
  delivered: 'success',
  bounced: 'error',
  soft_bounced: 'warning',
  spam: 'error',
  blocked: 'error',
  invalid_email: 'error',
  deferred: 'warning',
}

const TYPE_LABEL: Record<string, string> = {
  verification: 'Verifikasi Email',
  password_reset: 'Reset Password',
  order_welcome: 'Order Welcome',
  subscription_welcome: 'Subscription Welcome',
  game_request_fulfilled: 'Game Request Fulfilled',
  account_flag: 'Account Flag',
}

const formatTs = (s: string | null) => (s ? new Date(s).toLocaleString('id-ID') : '—')

export default function EmailLogDetailDialog({ logId, open, onClose }: Props) {
  const queryClient = useQueryClient()
  const [resendMsg, setResendMsg] = useState<string | null>(null)
  const [resendError, setResendError] = useState<string | null>(null)
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null)
  const [verifyError, setVerifyError] = useState<string | null>(null)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-email-log', logId],
    queryFn: () => adminApi.getEmailLog(logId!),
    enabled: open && logId != null,
  })

  const resendMutation = useMutation({
    mutationFn: () => adminApi.resendEmailLog(logId!),
    onSuccess: res => {
      setResendMsg(res.message)
      setResendError(null)
      queryClient.invalidateQueries({ queryKey: ['admin-email-logs'] })
    },
    onError: (err: any) => {
      setResendError(err?.message || 'Gagal kirim ulang')
      setResendMsg(null)
    },
  })

  const verifyMutation = useMutation({
    mutationFn: () => adminApi.markEmailVerified(data!.user!.id),
    onSuccess: res => {
      setVerifyMsg(res.message)
      setVerifyError(null)
      queryClient.invalidateQueries({ queryKey: ['admin-email-log', logId] })
      queryClient.invalidateQueries({ queryKey: ['admin-user-profile'] })
    },
    onError: (err: any) => {
      setVerifyError(err?.message || 'Gagal mark verified')
      setVerifyMsg(null)
    },
  })

  if (!open) return null

  return (
    <Dialog open={open} onClose={onClose} maxWidth='md' fullWidth>
      <DialogTitle>
        {data ? `Email Log #${data.id}` : 'Email Log'}
      </DialogTitle>
      <DialogContent dividers>
        {isLoading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>}
        {isError && <Alert severity='error'>{(error as any)?.message || 'Gagal memuat log'}</Alert>}
        {data && (
          <Stack spacing={2}>
            <Box>
              <Typography variant='caption' color='text.secondary'>Status</Typography>
              <Box><Chip size='small' label={data.status} color={STATUS_COLOR[data.status]} /></Box>
            </Box>

            <Box>
              <Typography variant='caption' color='text.secondary'>Type</Typography>
              <Typography>{TYPE_LABEL[data.type] || data.type}</Typography>
            </Box>

            <Box>
              <Typography variant='caption' color='text.secondary'>Recipient</Typography>
              <Typography sx={{ fontFamily: 'monospace' }}>{data.recipient_email}</Typography>
              {data.user && (
                <Typography variant='caption' color='text.secondary'>
                  User #{data.user.id} · {data.user.email_verified ? 'verified' : 'not verified'}
                </Typography>
              )}
            </Box>

            <Box>
              <Typography variant='caption' color='text.secondary'>Subject</Typography>
              <Typography>{data.subject}</Typography>
            </Box>

            <Divider />

            <Box>
              <Typography variant='caption' color='text.secondary'>Timeline</Typography>
              <Typography variant='body2'>queued: {formatTs(data.created_at)}</Typography>
              <Typography variant='body2'>sent: {formatTs(data.sent_at)}</Typography>
              <Typography variant='body2'>Brevo event: {formatTs(data.brevo_event_at)}</Typography>
            </Box>

            {data.smtp_response && (
              <Box>
                <Typography variant='caption' color='text.secondary'>SMTP response</Typography>
                <Typography component='pre' sx={{ fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap', m: 0 }}>
                  {data.smtp_response}
                </Typography>
              </Box>
            )}

            {data.brevo_message_id && (
              <Box>
                <Typography variant='caption' color='text.secondary'>Brevo message id</Typography>
                <Typography sx={{ fontFamily: 'monospace' }}>{data.brevo_message_id}</Typography>
              </Box>
            )}

            {data.error_message && (
              <Box>
                <Typography variant='caption' color='text.secondary'>Error / reason</Typography>
                <Alert severity='error' sx={{ mt: 0.5 }}>{data.error_message}</Alert>
              </Box>
            )}

            {data.metadata && Object.keys(data.metadata).length > 0 && (
              <Box>
                <Typography variant='caption' color='text.secondary'>Metadata</Typography>
                <Typography component='pre' sx={{ fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap', m: 0 }}>
                  {JSON.stringify(data.metadata, null, 2)}
                </Typography>
              </Box>
            )}

            {resendMsg && <Alert severity='success'>{resendMsg}</Alert>}
            {resendError && <Alert severity='error'>{resendError}</Alert>}
            {verifyMsg && <Alert severity='success'>{verifyMsg}</Alert>}
            {verifyError && <Alert severity='error'>{verifyError}</Alert>}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        {data && (
          <Button
            color='warning'
            onClick={() => resendMutation.mutate()}
            disabled={resendMutation.isPending}
          >
            Kirim Ulang
          </Button>
        )}
        {data && data.type === 'verification' && data.user && !data.user.email_verified && (
          <Button
            color='success'
            onClick={() => {
              if (window.confirm(`Tandai email ${data.user!.email} sebagai verified secara manual?`)) {
                verifyMutation.mutate()
              }
            }}
            disabled={verifyMutation.isPending}
          >
            Mark Verified
          </Button>
        )}
        <Button onClick={onClose}>Tutup</Button>
      </DialogActions>
    </Dialog>
  )
}
