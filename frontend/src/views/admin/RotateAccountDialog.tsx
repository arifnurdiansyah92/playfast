'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import Skeleton from '@mui/material/Skeleton'

import { adminApi } from '@/lib/api'

interface Props {

  /** Order ID to rotate. null/undefined = closed. */
  orderId: number | null

  /** Optional context for the header (game name, current account). */
  gameName?: string | null
  currentAccountName?: string | null
  onClose: () => void

  /** Called after a successful reassignment so the parent can show a snackbar. */
  onSuccess?: (message: string) => void

  /** React-query keys to invalidate after a successful reassignment. */
  invalidateKeys?: unknown[][]
}

/**
 * Reusable dialog for rotating an order to a different Steam account that
 * owns the same game. Used in:
 *   - /admin/orders (Rotate button per row)
 *   - /admin/users/<id> (rotate from the user's Assignments tab)
 *
 * Shows candidate accounts with Denuvo-relevant context (active user
 * count proxy) and lets admin pick which account to swap onto.
 */
const RotateAccountDialog = ({
  orderId,
  gameName,
  currentAccountName,
  onClose,
  onSuccess,
  invalidateKeys = [],
}: Props) => {
  const queryClient = useQueryClient()
  const open = orderId != null

  const { data, isLoading } = useQuery({
    queryKey: ['admin-order-candidates', orderId],
    queryFn: () => adminApi.getOrderCandidateAccounts(orderId!),
    enabled: open,
  })

  const reassignMutation = useMutation({
    mutationFn: (steamAccountId: number) =>
      adminApi.reassignOrder(orderId!, steamAccountId),
    onSuccess: (res) => {
      // Invalidate caller-supplied keys (orders list, user profile, etc.)
      // plus the candidate query so a re-open shows fresh "is_current" flags.
      invalidateKeys.forEach(key => queryClient.invalidateQueries({ queryKey: key }))
      queryClient.invalidateQueries({ queryKey: ['admin-order-candidates'] })
      onSuccess?.(res.message || 'Order reassigned')
      onClose()
    },
    onError: (err: any) => onSuccess?.(err?.message || 'Reassign failed'),
  })

  const candidates = data?.candidates ?? []
  const otherCandidates = candidates.filter(c => !c.is_current)

  // Prefer info from the API response (authoritative), fall back to caller-supplied
  // hints when the dialog opens before the candidate-accounts query resolves.
  const headerAccount =
    candidates.find(c => c.is_current)?.account_name ||
    currentAccountName ||
    '-'

  return (
    <Dialog
      open={open}
      onClose={() => !reassignMutation.isPending && onClose()}
      maxWidth='sm'
      fullWidth
    >
      <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
        <i className='tabler-arrows-shuffle' />
        Rotate Account — Order #{orderId}
      </DialogTitle>
      <DialogContent>
        <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
          {gameName && <>Game: <strong>{gameName}</strong> · </>}
          Saat ini: <strong>{headerAccount}</strong>
        </Typography>

        {isLoading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={48} />)}
          </Box>
        ) : otherCandidates.length === 0 ? (
          <Alert severity='info'>
            Tidak ada akun aktif lain yang punya game ini. Tambahkan akun baru atau aktifkan akun yang ada untuk membuka opsi rotate.
          </Alert>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography variant='caption' color='text.secondary' sx={{ mb: 0.5 }}>
              Pilih akun tujuan. Angka users = berapa user lain yang sedang aktif pakai pasangan account+game ini (proxy buat Denuvo activation slot).
            </Typography>
            {otherCandidates.map(c => (
              <Card key={c.id} variant='outlined'>
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2, '&:last-child': { pb: 2 } }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant='subtitle2' sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                      {c.account_name}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
                      {c.steam_id && (
                        <Typography variant='caption' color='text.secondary' sx={{ fontFamily: 'monospace' }}>
                          {c.steam_id}
                        </Typography>
                      )}
                      <Chip
                        size='small'
                        label={`${c.active_assignment_count} user${c.active_assignment_count === 1 ? '' : 's'}`}
                        variant='tonal'
                        color={c.active_assignment_count === 0 ? 'success' : c.active_assignment_count < 3 ? 'info' : 'warning'}
                        sx={{ height: 20, fontSize: '0.7rem' }}
                      />
                      {c.is_shared && (
                        <Chip size='small' label='shared' variant='tonal' color='default' sx={{ height: 20, fontSize: '0.7rem' }} />
                      )}
                    </Box>
                  </Box>
                  <Button
                    variant='contained'
                    size='small'
                    onClick={() => reassignMutation.mutate(c.id)}
                    disabled={reassignMutation.isPending}
                  >
                    Reassign
                  </Button>
                </CardContent>
              </Card>
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={reassignMutation.isPending}>Tutup</Button>
      </DialogActions>
    </Dialog>
  )
}

export default RotateAccountDialog
