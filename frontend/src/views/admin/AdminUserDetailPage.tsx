'use client'

import { useState } from 'react'

import Link from 'next/link'

import { keepPreviousData, useQuery } from '@tanstack/react-query'

import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import Grid from '@mui/material/Grid'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import Skeleton from '@mui/material/Skeleton'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Pagination from '@mui/material/Pagination'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Snackbar from '@mui/material/Snackbar'

import { adminApi, formatIDR } from '@/lib/api'
import type { UserProfile, UserProfileAssignment } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import RotateAccountDialog from '@/views/admin/RotateAccountDialog'
import EmailLogDetailDialog from './EmailLogDetailDialog'

const PER_PAGE_OTP = 25

interface Props {
  userId: number
}

const formatDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('id-ID', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : '-'

const formatDateOnly = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('id-ID', {
        day: 'numeric', month: 'short', year: 'numeric',
      })
    : '-'

const StatCard = ({ label, value, sublabel }: { label: string; value: string | number; sublabel?: string }) => (
  <Card variant='outlined' sx={{ height: '100%' }}>
    <CardContent>
      <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mb: 0.5 }}>
        {label}
      </Typography>
      <Typography variant='h5' sx={{ fontWeight: 700 }}>
        {value}
      </Typography>
      {sublabel && (
        <Typography variant='caption' color='text.secondary'>
          {sublabel}
        </Typography>
      )}
    </CardContent>
  </Card>
)

const orderStatusColor = (status: string): 'success' | 'warning' | 'error' | 'default' => {
  if (status === 'fulfilled') return 'success'
  if (status === 'pending_payment') return 'warning'
  if (status === 'revoked' || status === 'cancelled' || status === 'expired') return 'error'
  
return 'default'
}

const subStatusColor = (status: string): 'success' | 'warning' | 'error' | 'default' => {
  if (status === 'active') return 'success'
  if (status === 'pending_payment') return 'warning'
  if (status === 'expired' || status === 'cancelled') return 'error'
  
return 'default'
}

const reviewStatusColor = (status: string): 'success' | 'warning' | 'error' => {
  if (status === 'approved') return 'success'
  if (status === 'rejected') return 'error'
  
return 'warning'
}

const AdminUserDetailPage = ({ userId }: Props) => {
  const { user: currentUser } = useAuth()
  const [tab, setTab] = useState(0)
  const [otpPage, setOtpPage] = useState(1)
  const [rotateAssignment, setRotateAssignment] = useState<UserProfileAssignment | null>(null)
  const [snackMsg, setSnackMsg] = useState('')
  const [emailLogPage, setEmailLogPage] = useState(1)
  const [emailLogOpenId, setEmailLogOpenId] = useState<number | null>(null)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-user-profile', userId],
    queryFn: () => adminApi.getUserProfile(userId),
    enabled: currentUser?.role === 'admin' && Number.isFinite(userId),
  })

  const { data: otpData, isFetching: otpFetching } = useQuery({
    queryKey: ['admin-user-otp', userId, otpPage],
    queryFn: () => adminApi.getAuditCodes({ user_id: userId, page: otpPage, per_page: PER_PAGE_OTP }),
    enabled: currentUser?.role === 'admin' && Number.isFinite(userId) && tab === 3,
    placeholderData: keepPreviousData,
  })

  const { data: emailLogData, isFetching: emailLogFetching } = useQuery({
    queryKey: ['admin-user-email-logs', userId, emailLogPage],
    queryFn: () => adminApi.listEmailLogs({ user_id: userId, page: emailLogPage, per_page: 50 }),
    enabled: currentUser?.role === 'admin' && Number.isFinite(userId) && tab === 6,
    placeholderData: keepPreviousData,
  })

  if (currentUser?.role !== 'admin') {
    return <Alert severity='error'>Access denied</Alert>
  }

  if (isError) {
    return (
      <Alert severity='error'>
        Gagal memuat profil user: {(error as any)?.message || 'unknown error'}
      </Alert>
    )
  }

  if (isLoading || !data) {
    return (
      <div className='flex flex-col gap-4'>
        <Skeleton variant='rounded' height={120} />
        <Grid container spacing={2}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Grid size={{ xs: 6, md: 3 }} key={i}>
              <Skeleton variant='rounded' height={100} />
            </Grid>
          ))}
        </Grid>
        <Skeleton variant='rounded' height={400} />
      </div>
    )
  }

  const profile: UserProfile = data
  const { user, stats, orders, subscriptions, assignments, promo_usages, referrals_made, review, account_flags, game_requests, referrer } = profile

  const tabPanels = [
    'Overview',
    `Orders (${orders.length})`,
    `Subscriptions (${subscriptions.length})`,
    `OTP History (${stats.code_request_count})`,
    `Assignments (${assignments.length})`,
    `Misc`,
    `Email History`,
  ]

  return (
    <div className='flex flex-col gap-5'>
      {/* Top: identity + meta */}
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
                <Typography variant='h4' sx={{ fontWeight: 700 }}>{user.email}</Typography>
                <Chip size='small' label={user.is_admin ? 'Admin' : 'User'} color={user.is_admin ? 'warning' : 'default'} variant='tonal' />
                <Chip size='small' label={user.is_active ? 'Active' : 'Disabled'} color={user.is_active ? 'success' : 'error'} variant='tonal' />
                {user.email_verified
                  ? <Chip size='small' label='Verified' color='success' variant='tonal' />
                  : <Chip size='small' label='Unverified' color='warning' variant='tonal' />}
              </Box>
              <Typography variant='body2' color='text.secondary'>
                User #{user.id} · Bergabung {formatDate(user.created_at)}
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, mt: 1, flexWrap: 'wrap' }}>
                {user.referral_code && (
                  <Typography variant='caption' color='text.secondary'>
                    Referral code: <strong style={{ fontFamily: 'monospace', letterSpacing: 1 }}>{user.referral_code}</strong>
                  </Typography>
                )}
                {referrer && (
                  <Typography variant='caption' color='text.secondary'>
                    Direferensikan oleh{' '}
                    <Link href={`/admin/users/${referrer.id}`} style={{ color: '#c9a84c' }}>
                      {referrer.email}
                    </Link>
                  </Typography>
                )}
                {user.email_opted_out && (
                  <Chip size='small' label='Email opted out' color='default' variant='outlined' />
                )}
              </Box>
            </Box>
            <Button component={Link} href='/admin/users' variant='outlined' size='small' startIcon={<i className='tabler-arrow-left' />}>
              Kembali ke daftar user
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Stats grid */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatCard label='Total Spent' value={formatIDR(stats.total_spent)} sublabel={`${formatIDR(stats.purchase_spent)} satuan + ${formatIDR(stats.subscription_spent)} subs`} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatCard label='Orders' value={`${stats.fulfilled_orders}/${stats.total_orders}`} sublabel='fulfilled / total' />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatCard
            label='Subscription'
            value={stats.active_subscription ? stats.active_subscription.plan_label : '—'}
            sublabel={stats.active_subscription
              ? `aktif s/d ${formatDateOnly(stats.active_subscription.expires_at)}`
              : `${stats.subscription_count} total subs`}
          />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatCard
            label='OTP / Steam Guard'
            value={stats.code_request_count.toLocaleString('id-ID')}
            sublabel={stats.last_code_request_at ? `terakhir ${formatDate(stats.last_code_request_at)}` : 'belum pernah'}
          />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatCard
            label='Referral Credit'
            value={formatIDR(user.referral_credit ?? 0)}
            sublabel={`${stats.referrals_made} undangan · ${stats.referrals_rewarded} rewarded`}
          />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatCard
            label='Promo Used'
            value={stats.promo_usage_count}
            sublabel={`hemat ${formatIDR(stats.promo_total_discount)}`}
          />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatCard
            label='Review'
            value={review ? `${review.rating}★ ${review.status}` : '—'}
            sublabel={review ? formatDateOnly(review.created_at) : 'belum mengisi review'}
          />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatCard
            label='Account Flags'
            value={account_flags.length}
            sublabel={`${account_flags.filter(f => f.status === 'new').length} unresolved`}
          />
        </Grid>
      </Grid>

      {/* Tabs */}
      <Card>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant='scrollable' scrollButtons='auto'>
          {tabPanels.map((label, i) => <Tab key={i} label={label} />)}
        </Tabs>

        {/* Overview */}
        {tab === 0 && (
          <CardContent>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant='subtitle2' sx={{ fontWeight: 700, mb: 1 }}>Review</Typography>
                {review ? (
                  <Card variant='outlined'>
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                        <Chip size='small' label={review.status} color={reviewStatusColor(review.status)} variant='tonal' />
                        <Typography variant='body2' sx={{ color: '#c9a84c' }}>
                          {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
                        </Typography>
                        {review.is_featured && <Chip size='small' label='Featured' variant='outlined' color='warning' />}
                      </Box>
                      {review.headline && (
                        <Typography variant='subtitle2' sx={{ fontWeight: 700, mb: 0.5 }}>{review.headline}</Typography>
                      )}
                      <Typography variant='body2' sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                        &ldquo;{review.body}&rdquo;
                      </Typography>
                      <Button
                        component={Link}
                        href='/admin/reviews'
                        size='small'
                        sx={{ mt: 1 }}
                        endIcon={<i className='tabler-external-link' style={{ fontSize: 14 }} />}
                      >
                        Kelola review
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <Typography variant='body2' color='text.secondary'>User belum mengisi review.</Typography>
                )}
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant='subtitle2' sx={{ fontWeight: 700, mb: 1 }}>Akun yg sedang aktif untuk user ini</Typography>
                {assignments.filter(a => !a.is_revoked).length === 0 ? (
                  <Typography variant='body2' color='text.secondary'>Tidak ada assignment aktif.</Typography>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {assignments.filter(a => !a.is_revoked).slice(0, 8).map(a => (
                      <Box key={a.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography variant='body2' sx={{ fontWeight: 600 }}>{a.game_name}</Typography>
                          <Typography variant='caption' color='text.secondary' sx={{ fontFamily: 'monospace' }}>
                            {a.steam_account_name} {a.steam_id ? `· ${a.steam_id}` : ''}
                          </Typography>
                        </Box>
                        <Typography variant='caption' color='text.secondary'>{formatDateOnly(a.created_at)}</Typography>
                      </Box>
                    ))}
                  </Box>
                )}
              </Grid>
            </Grid>
          </CardContent>
        )}

        {/* Orders */}
        {tab === 1 && (
          <TableContainer>
            <Table size='small'>
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Game</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align='right'>Subtotal</TableCell>
                  <TableCell align='right'>Discount</TableCell>
                  <TableCell align='right'>Credit</TableCell>
                  <TableCell align='right'>Paid</TableCell>
                  <TableCell>Date</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {orders.length === 0 ? (
                  <TableRow><TableCell colSpan={9} sx={{ textAlign: 'center', py: 4 }}>Belum ada order</TableCell></TableRow>
                ) : orders.map(o => (
                  <TableRow key={o.id} hover>
                    <TableCell>#{o.id}</TableCell>
                    <TableCell>
                      <Chip size='small' label={o.type} variant='tonal' color={o.type === 'subscription' ? 'info' : 'default'} />
                    </TableCell>
                    <TableCell>{o.game?.name ?? '-'}</TableCell>
                    <TableCell>
                      <Chip size='small' label={o.status} color={orderStatusColor(o.status)} variant='tonal' />
                      {o.is_revoked && <Chip size='small' label='revoked' color='error' variant='outlined' sx={{ ml: 0.5 }} />}
                    </TableCell>
                    <TableCell align='right'>{formatIDR(o.amount_subtotal ?? o.amount ?? 0)}</TableCell>
                    <TableCell align='right'>{o.promo_discount ? `-${formatIDR(o.promo_discount)}` : '-'}</TableCell>
                    <TableCell align='right'>{o.credit_applied ? `-${formatIDR(o.credit_applied)}` : '-'}</TableCell>
                    <TableCell align='right'><strong>{formatIDR(o.amount ?? 0)}</strong></TableCell>
                    <TableCell>{formatDate(o.paid_at ?? o.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {/* Subscriptions */}
        {tab === 2 && (
          <TableContainer>
            <Table size='small'>
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Plan</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Starts</TableCell>
                  <TableCell>Expires</TableCell>
                  <TableCell align='right'>Amount</TableCell>
                  <TableCell>Payment</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {subscriptions.length === 0 ? (
                  <TableRow><TableCell colSpan={7} sx={{ textAlign: 'center', py: 4 }}>Belum pernah subscribe</TableCell></TableRow>
                ) : subscriptions.map(s => (
                  <TableRow key={s.id} hover>
                    <TableCell>#{s.id}</TableCell>
                    <TableCell><strong>{s.plan_label}</strong></TableCell>
                    <TableCell>
                      <Chip size='small' label={s.status} color={subStatusColor(s.status)} variant='tonal' />
                    </TableCell>
                    <TableCell>{formatDateOnly(s.starts_at)}</TableCell>
                    <TableCell>{formatDateOnly(s.expires_at)}</TableCell>
                    <TableCell align='right'><strong>{formatIDR(s.amount)}</strong></TableCell>
                    <TableCell>{s.payment_type ?? '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {/* OTP History */}
        {tab === 3 && (
          <Box>
            <TableContainer>
              <Table size='small'>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 80 }}>ID</TableCell>
                    <TableCell>Account</TableCell>
                    <TableCell>Game</TableCell>
                    <TableCell>IP</TableCell>
                    <TableCell>Timestamp</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {!otpData ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={5}><Skeleton height={32} /></TableCell>
                      </TableRow>
                    ))
                  ) : otpData.logs.length === 0 ? (
                    <TableRow><TableCell colSpan={5} sx={{ textAlign: 'center', py: 4 }}>Belum ada request OTP</TableCell></TableRow>
                  ) : otpData.logs.map(log => (
                    <TableRow key={log.id} hover>
                      <TableCell>#{log.id}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{log.account_name ?? '-'}</TableCell>
                      <TableCell>{log.game_name ?? '-'}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{log.ip_address ?? '-'}</TableCell>
                      <TableCell>{formatDate(log.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {otpData && otpData.pages > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                <Pagination
                  count={otpData.pages}
                  page={otpPage}
                  onChange={(_, p) => setOtpPage(p)}
                  showFirstButton
                  showLastButton
                  size='small'
                  disabled={otpFetching}
                />
              </Box>
            )}
          </Box>
        )}

        {/* Assignments */}
        {tab === 4 && (
          <TableContainer>
            <Table size='small'>
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Game</TableCell>
                  <TableCell>Steam Account</TableCell>
                  <TableCell>Steam ID</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Assigned</TableCell>
                  <TableCell>Revoked</TableCell>
                  <TableCell align='right'>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {assignments.length === 0 ? (
                  <TableRow><TableCell colSpan={8} sx={{ textAlign: 'center', py: 4 }}>Belum pernah dapat akun</TableCell></TableRow>
                ) : assignments.map(a => (
                  <TableRow key={a.id} hover>
                    <TableCell>#{a.id}</TableCell>
                    <TableCell>{a.game_name ?? '-'}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace' }}>
                      <Link href={`/admin/accounts/${a.steam_account_id}`} style={{ color: '#c9a84c' }}>
                        {a.steam_account_name ?? `#${a.steam_account_id}`}
                      </Link>
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{a.steam_id ?? '-'}</TableCell>
                    <TableCell>
                      <Chip size='small' label={a.is_revoked ? 'revoked' : 'active'} color={a.is_revoked ? 'error' : 'success'} variant='tonal' />
                    </TableCell>
                    <TableCell>{formatDate(a.created_at)}</TableCell>
                    <TableCell>{formatDate(a.revoked_at)}</TableCell>
                    <TableCell align='right'>
                      {!a.is_revoked && (
                        <Tooltip title='Rotasi ke akun lain (mis. Denuvo activation limit)'>
                          <IconButton size='small' onClick={() => setRotateAssignment(a)}>
                            <i className='tabler-arrows-shuffle' style={{ fontSize: 18 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {/* Misc — promos, referrals, flags, game requests */}
        {tab === 5 && (
          <CardContent>
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant='subtitle2' sx={{ fontWeight: 700, mb: 1 }}>Promo Codes Used ({promo_usages.length})</Typography>
                {promo_usages.length === 0 ? (
                  <Typography variant='body2' color='text.secondary'>Belum pernah pakai promo.</Typography>
                ) : (
                  <Table size='small'>
                    <TableHead>
                      <TableRow>
                        <TableCell>Code</TableCell>
                        <TableCell>For</TableCell>
                        <TableCell align='right'>Saved</TableCell>
                        <TableCell>Used</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {promo_usages.map(p => (
                        <TableRow key={p.id}>
                          <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{p.code}</TableCell>
                          <TableCell>{p.order_id ? `Order #${p.order_id}` : p.subscription_id ? `Sub #${p.subscription_id}` : '-'}</TableCell>
                          <TableCell align='right'>{formatIDR(p.discount_amount)}</TableCell>
                          <TableCell>{formatDateOnly(p.used_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Grid>

              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant='subtitle2' sx={{ fontWeight: 700, mb: 1 }}>Referrals Made ({referrals_made.length})</Typography>
                {referrals_made.length === 0 ? (
                  <Typography variant='body2' color='text.secondary'>Belum mereferensikan siapapun.</Typography>
                ) : (
                  <Table size='small'>
                    <TableHead>
                      <TableRow>
                        <TableCell>User</TableCell>
                        <TableCell>Joined</TableCell>
                        <TableCell align='right'>Credit Awarded</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {referrals_made.map(r => (
                        <TableRow key={r.user_id}>
                          <TableCell>
                            <Link href={`/admin/users/${r.user_id}`} style={{ color: '#c9a84c' }}>{r.email}</Link>
                          </TableCell>
                          <TableCell>{formatDateOnly(r.joined_at)}</TableCell>
                          <TableCell align='right'>
                            {r.credit_awarded != null
                              ? <strong style={{ color: '#4caf50' }}>+{formatIDR(r.credit_awarded)}</strong>
                              : <Typography variant='caption' color='text.secondary'>belum bertransaksi</Typography>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Grid>

              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant='subtitle2' sx={{ fontWeight: 700, mb: 1 }}>Account Flags ({account_flags.length})</Typography>
                {account_flags.length === 0 ? (
                  <Typography variant='body2' color='text.secondary'>Belum pernah lapor masalah akun.</Typography>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {account_flags.map(f => (
                      <Card key={f.id} variant='outlined'>
                        <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
                            <Chip size='small' label={f.reason} variant='tonal' />
                            <Chip size='small' label={f.status} color={f.status === 'resolved' ? 'success' : 'warning'} variant='tonal' />
                            <Typography variant='caption' color='text.secondary'>{formatDateOnly(f.created_at)}</Typography>
                          </Box>
                          {f.description && (
                            <Typography variant='body2' sx={{ fontStyle: 'italic' }}>{f.description}</Typography>
                          )}
                          {f.resolution_note && (
                            <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mt: 0.5 }}>
                              ↳ {f.resolution_note}
                            </Typography>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </Box>
                )}
              </Grid>

              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant='subtitle2' sx={{ fontWeight: 700, mb: 1 }}>Game Requests Voted ({game_requests.length})</Typography>
                {game_requests.length === 0 ? (
                  <Typography variant='body2' color='text.secondary'>Belum vote game request manapun.</Typography>
                ) : (
                  <Table size='small'>
                    <TableHead>
                      <TableRow>
                        <TableCell>Game</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell align='right'>Total Votes</TableCell>
                        <TableCell>Voted</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {game_requests.map(g => (
                        <TableRow key={g.id}>
                          <TableCell>{g.name}</TableCell>
                          <TableCell>
                            <Chip size='small' label={g.status} variant='tonal' color={g.status === 'added' ? 'success' : g.status === 'rejected' ? 'error' : 'warning'} />
                          </TableCell>
                          <TableCell align='right'>{g.request_count}</TableCell>
                          <TableCell>{formatDateOnly(g.voted_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Grid>
            </Grid>
          </CardContent>
        )}

        {/* Email History */}
        {tab === 6 && (
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant='h6'>Email yang dikirim ke user ini</Typography>
              {!user.email_verified && (
                <Button
                  size='small'
                  color='warning'
                  startIcon={<i className='tabler-mail-fast' />}
                  onClick={async () => {
                    const logs = emailLogData?.logs || []
                    const lastVerification = logs.find(l => l.type === 'verification')

                    if (lastVerification) {
                      try {
                        await adminApi.resendEmailLog(lastVerification.id)
                        setSnackMsg('Email verifikasi dikirim ulang')
                      } catch (e: any) {
                        setSnackMsg(e?.message || 'Gagal kirim ulang')
                      }
                    } else {
                      setSnackMsg('Belum ada log verifikasi — minta user register ulang atau pakai resend dari sisi user')
                    }
                  }}
                >
                  Kirim ulang verifikasi
                </Button>
              )}
            </Box>
            <TableContainer>
              <Table size='small'>
                <TableHead>
                  <TableRow>
                    <TableCell>Time</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Error</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {emailLogFetching && (
                    <TableRow><TableCell colSpan={4}><Skeleton variant='text' /></TableCell></TableRow>
                  )}
                  {emailLogData?.logs.map(log => (
                    <TableRow
                      key={log.id}
                      hover
                      sx={{ cursor: 'pointer' }}
                      onClick={() => setEmailLogOpenId(log.id)}
                    >
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(log.created_at).toLocaleString('id-ID')}</TableCell>
                      <TableCell>{log.type}</TableCell>
                      <TableCell>
                        <Chip
                          size='small'
                          label={log.status}
                          color={
                            log.status === 'delivered' || log.status === 'sent' ? 'success' :
                            log.status === 'queued' ? 'default' :
                            log.status === 'soft_bounced' || log.status === 'deferred' ? 'warning' :
                            'error'
                          }
                        />
                      </TableCell>
                      <TableCell sx={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {log.error_message || ''}
                      </TableCell>
                    </TableRow>
                  ))}
                  {emailLogData && emailLogData.logs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} align='center' sx={{ py: 4, color: 'text.secondary' }}>
                        Belum ada email yang ter-track untuk user ini.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            {emailLogData && emailLogData.pages > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2, gap: 1 }}>
                <Button size='small' disabled={emailLogPage <= 1} onClick={() => setEmailLogPage(p => p - 1)}>Prev</Button>
                <Typography variant='body2' sx={{ alignSelf: 'center' }}>{emailLogPage} / {emailLogData.pages}</Typography>
                <Button size='small' disabled={emailLogPage >= emailLogData.pages} onClick={() => setEmailLogPage(p => p + 1)}>Next</Button>
              </Box>
            )}
          </CardContent>
        )}
      </Card>

      <RotateAccountDialog
        orderId={rotateAssignment?.order_id ?? null}
        gameName={rotateAssignment?.game_name}
        currentAccountName={rotateAssignment?.steam_account_name ?? null}
        onClose={() => setRotateAssignment(null)}
        onSuccess={(msg) => setSnackMsg(msg)}
        invalidateKeys={[['admin-user-profile', userId]]}
      />

      <EmailLogDetailDialog
        logId={emailLogOpenId}
        open={emailLogOpenId != null}
        onClose={() => setEmailLogOpenId(null)}
      />

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

export default AdminUserDetailPage
