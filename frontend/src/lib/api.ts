const API_BASE = process.env.NEXT_PUBLIC_API_URL || ''  // Empty = same origin (proxied via next.config rewrites)

let isRefreshing = false
let refreshPromise: Promise<boolean> | null = null

/**
 * Try to obtain a new access token using the refresh token cookie.
 * Returns true on success, false on failure.
 */
async function refreshAccessToken(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    })
    return res.ok
  } catch {
    return false
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    },
    ...options
  })

  // On 401, attempt a single token refresh and retry the original request
  // Skip for auth endpoints that are expected to fail when not logged in
  const skipRefreshUrls = ['/api/auth/refresh', '/api/auth/me', '/api/auth/login', '/api/auth/register']
  if (res.status === 401 && !skipRefreshUrls.some(u => url.includes(u))) {
    // Deduplicate concurrent refresh attempts
    if (!isRefreshing) {
      isRefreshing = true
      refreshPromise = refreshAccessToken().finally(() => {
        isRefreshing = false
        refreshPromise = null
      })
    }

    const refreshed = await (refreshPromise ?? refreshAccessToken())

    if (refreshed) {
      // Retry the original request with the new access token cookie
      const retryRes = await fetch(`${API_BASE}${url}`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers
        },
        ...options
      })

      if (!retryRes.ok) {
        const body = await retryRes.json().catch(() => ({ error: retryRes.statusText }))
        throw new ApiError(retryRes.status, body.error || body.message || retryRes.statusText)
      }

      if (retryRes.status === 204) return undefined as T
      return retryRes.json()
    }

    // Refresh failed — throw so callers can handle it
    const body = await res.json().catch(() => ({ error: 'Session expired' }))
    throw new ApiError(401, body.error || 'Session expired')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new ApiError(res.status, body.error || body.message || res.statusText)
  }

  if (res.status === 204) return undefined as T
  return res.json()
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface User {
  id: number
  email: string
  role: 'user' | 'admin'
  email_verified: boolean
  created_at: string
}

export interface AuthResponse {
  user: User
  message?: string
}

export const authApi = {
  login(email: string, password: string) {
    return request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    })
  },
  register(email: string, password: string) {
    return request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    })
  },
  logout() {
    return request<{ message: string }>('/api/auth/logout', { method: 'POST' })
  },
  async me() {
    const res = await request<{ user: User }>('/api/auth/me')
    return res.user
  },
  updateProfile(data: { email?: string; password?: string; current_password: string }) {
    return request<AuthResponse>('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(data)
    })
  },
  forgotPassword(email: string) {
    return request<{ message: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email })
    })
  },
  resetPassword(token: string, password: string) {
    return request<{ message: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password })
    })
  },
  verifyEmail(token: string) {
    return request<{ message: string }>('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token })
    })
  },
  resendVerification() {
    return request<{ message: string }>('/api/auth/resend-verification', {
      method: 'POST'
    })
  }
}

// ─── Store ───────────────────────────────────────────────────────────────────

export interface Game {
  id: number
  appid: number
  name: string
  icon: string
  price: number
  is_enabled: boolean
  is_featured: boolean
  description?: string
  header_image?: string
  genres?: string
  available_accounts?: number
  accounts?: { id: number; account_name: string; is_active: boolean }[]
  created_at: string
}

export interface GamesResponse {
  games: Game[]
  total: number
  page: number
  per_page: number
  pages: number
}

export interface Order {
  id: number
  user_id: number
  user_email?: string
  game_id: number
  game: Game | null
  assignment_id: number | null
  is_revoked: boolean
  snap_token?: string
  payment_type?: string
  amount?: number
  paid_at?: string
  credentials?: {
    account_name: string
    password: string
  }
  status: string
  type?: 'purchase' | 'subscription'
  created_at: string
}

export interface SteamGuardCode {
  code: string
  remaining: number
}

export interface PlayInstructions {
  instructions: {
    game_id: number
    content: string
    is_custom: boolean
    id?: number
    updated_at?: string
  }
}

export interface SubscriptionPlan {
  plan: string
  label: string
  price: number
  duration_days: number
}

export interface Subscription {
  id: number
  user_id: number
  plan: string
  plan_label: string
  status: string
  amount: number
  starts_at: string | null
  expires_at: string | null
  payment_type: string | null
  paid_at: string | null
  created_at: string
  user_email?: string
}

export const storeApi = {
  getGames(params?: { q?: string; page?: number; genre?: string; sort?: string }) {
    const search = new URLSearchParams()

    if (params?.q) search.set('q', params.q)
    if (params?.page) search.set('page', String(params.page))
    if (params?.genre) search.set('genre', params.genre)
    if (params?.sort) search.set('sort', params.sort)

    const qs = search.toString()

    return request<GamesResponse>(`/api/store/games${qs ? `?${qs}` : ''}`)
  },
  async getGenres() {
    const res = await request<{ genres: string[] }>('/api/store/genres')
    return res.genres
  },
  async getFeaturedGames() {
    const res = await request<{ games: Game[] }>('/api/store/games/featured')
    return res.games
  },
  async getGame(appid: number | string) {
    const res = await request<{ game: Game }>(`/api/store/games/${appid}`)
    return res.game
  },
  getPaymentConfig() {
    return request<{ payment_mode: string; client_key?: string; snap_url?: string; qris_image_url?: string; whatsapp_number?: string; instructions?: string }>('/api/store/payment-config')
  },
  getSubscriptionPlans() {
    return request<{ plans: SubscriptionPlan[] }>('/api/store/subscription/plans')
  },
  subscribe(plan: string) {
    return request<{
      subscription: Subscription
      payment_mode: string
      snap_token?: string
      manual_info?: { qris_image_url: string; whatsapp_number: string; instructions: string }
    }>('/api/store/subscription/subscribe', {
      method: 'POST',
      body: JSON.stringify({ plan })
    })
  },
  getSubscriptionStatus() {
    return request<{ is_subscribed: boolean; subscription: Subscription | null }>('/api/store/subscription/status')
  },
  async createOrder(appid: number | string) {
    return request<{
      order: Order
      payment_mode: string
      snap_token?: string
      manual_info?: { qris_image_url: string; whatsapp_number: string; instructions: string }
    }>('/api/store/orders', {
      method: 'POST',
      body: JSON.stringify({ appid: Number(appid) })
    })
  },
  async getMyGames() {
    const res = await request<{ games: (Game & { type: 'purchased' | 'bonus' | 'subscription'; order_id: number; account_name: string; assignment_id: number })[] }>('/api/store/my-games')
    return res.games
  },
  getOrderStatus(orderId: number | string) {
    return request<{ status: string; payment_type?: string; paid_at?: string }>(`/api/store/orders/${orderId}/status`)
  },
  async getOrders() {
    const res = await request<{ orders: Order[] }>('/api/store/orders')
    return res.orders
  },
  async getOrder(id: number | string) {
    const res = await request<{ order: Order }>(`/api/store/orders/${id}`)
    return res.order
  },
  getCode(orderId: number | string) {
    return request<SteamGuardCode>(`/api/store/orders/${orderId}/code`, {
      method: 'POST'
    })
  },
  getInstructions(orderId: number | string) {
    return request<PlayInstructions>(`/api/store/orders/${orderId}/instructions`)
  }
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export interface SteamAccount {
  id: number
  account_name: string
  steam_id: string | null
  game_count: number
  is_active: boolean
  created_at: string
}

export interface DashboardStats {
  total_accounts: number
  active_accounts: number
  total_games: number
  enabled_games: number
  featured_games: number
  total_orders: number
  fulfilled_orders: number
  revoked_orders: number
  total_users: number
  recent_orders: Order[]
  recent_codes: AuditEntry[]
  top_games: { name: string; appid: number; order_count: number }[]
  order_trend: { date: string; count: number }[]
  revenue_total: number
}

export interface AuditEntry {
  id: number
  user_email: string
  account_name: string
  timestamp: string
  ip_address: string
}

export const adminApi = {
  getDashboard() {
    return request<DashboardStats>('/api/admin/dashboard')
  },
  async getAccounts() {
    const res = await request<{ accounts: SteamAccount[] }>('/api/admin/accounts')
    return res.accounts
  },
  addAccount(formData: FormData) {
    return fetch(`/api/admin/accounts`, {
      method: 'POST',
      credentials: 'include',
      body: formData
    }).then(async res => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }))
        throw new ApiError(res.status, body.error || body.message || res.statusText)
      }

      return res.json()
    })
  },
  deleteAccount(id: number) {
    return request<{ message: string }>(`/api/admin/accounts/${id}`, { method: 'DELETE' })
  },
  updateAccount(id: number, data: Partial<{ password: string; is_active: boolean }>) {
    return request<{ account: SteamAccount }>(`/api/admin/accounts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    })
  },
  syncAccount(id: number) {
    return request<{ success: boolean; total_games?: number; error?: string }>(`/api/admin/accounts/${id}/sync`, { method: 'POST' })
  },
  getAccountCode(id: number) {
    return request<{ code: string; remaining: number }>(`/api/admin/accounts/${id}/code`, { method: 'POST' })
  },
  loginAccount(id: number) {
    return request<{ message: string }>(`/api/admin/accounts/${id}/login`, { method: 'POST' })
  },
  getConfirmations(id: number) {
    return request<{ confirmations: any[] }>(`/api/admin/accounts/${id}/confirmations`)
  },
  actOnConfirmation(accountId: number, confId: string, nonce: string, action: 'allow' | 'cancel') {
    return request<{ success: boolean; message: string }>(`/api/admin/accounts/${accountId}/confirmations/${confId}`, {
      method: 'POST',
      body: JSON.stringify({ action, nonce })
    })
  },
  async getAccountAssignments(id: number) {
    const res = await request<{ assignments: { id: number; user_email: string; user_id: number; game_name: string; game_appid: number; is_revoked: boolean; created_at: string }[] }>(`/api/admin/accounts/${id}/assignments`)
    return res.assignments
  },
  syncGames() {
    return request<{ message: string }>('/api/admin/accounts/sync-games', { method: 'POST' })
  },
  async getGames(params?: { q?: string; genre?: string; is_enabled?: string; is_featured?: string; year?: string; page?: number; per_page?: number }) {
    const searchParams = new URLSearchParams()
    if (params?.q) searchParams.set('q', params.q)
    if (params?.genre) searchParams.set('genre', params.genre)
    if (params?.is_enabled) searchParams.set('is_enabled', params.is_enabled)
    if (params?.is_featured) searchParams.set('is_featured', params.is_featured)
    if (params?.year) searchParams.set('year', params.year)
    if (params?.page) searchParams.set('page', String(params.page))
    if (params?.per_page) searchParams.set('per_page', String(params.per_page))
    const qs = searchParams.toString()
    return request<{ games: Game[]; total: number; page: number; per_page: number; pages: number; genres: string[]; years: number[] }>(`/api/admin/games${qs ? `?${qs}` : ''}`)
  },
  async updateGame(id: number, data: Partial<{ price: number; is_enabled: boolean; is_featured: boolean }>) {
    const res = await request<{ game: Game }>(`/api/admin/games/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    })
    return res.game
  },
  bulkUpdateGames(ids: number[], data: Partial<{ price: number; is_enabled: boolean; is_featured: boolean }>) {
    return request<{ message: string; updated: number }>('/api/admin/games/bulk-update', {
      method: 'PUT',
      body: JSON.stringify({ ids, data })
    })
  },
  updateGameInstructions(id: number, instructions: string) {
    return request<{ message: string }>(`/api/admin/games/${id}/instructions`, {
      method: 'PUT',
      body: JSON.stringify({ content: instructions })
    })
  },
  async getOrders() {
    const res = await request<{ orders: Order[] }>('/api/admin/orders')
    return res.orders
  },
  revokeAccess(orderId: number) {
    return request<{ message: string }>(`/api/admin/orders/${orderId}/revoke`, { method: 'POST' })
  },
  restoreAccess(orderId: number) {
    return request<{ message: string }>(`/api/admin/orders/${orderId}/restore`, { method: 'POST' })
  },
  async getUsers() {
    const res = await request<{ users: (User & { order_count: number; is_admin: boolean; is_active: boolean })[] }>('/api/admin/users')
    return res.users
  },
  updateUser(id: number, data: Partial<{ is_admin: boolean; is_active: boolean; password: string }>) {
    return request<{ user: User }>(`/api/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    })
  },
  deleteUser(id: number) {
    return request<{ message: string }>(`/api/admin/users/${id}`, { method: 'DELETE' })
  },
  getSettings() {
    return request<{ settings: Record<string, string> }>('/api/admin/settings').then(r => r.settings)
  },
  updateSettings(data: Record<string, string>) {
    return request<{ settings: Record<string, string> }>('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(data)
    }).then(r => r.settings)
  },
  confirmManualPayment(orderId: number) {
    return request<{ message: string }>(`/api/admin/orders/${orderId}/confirm-manual`, { method: 'POST' })
  },
  async getAuditCodes() {
    const res = await request<{ logs: AuditEntry[] }>('/api/admin/audit/codes')
    return res.logs
  },
  async getSubscriptions(params?: { status?: string; page?: number }) {
    const search = new URLSearchParams()
    if (params?.status) search.set('status', params.status)
    if (params?.page) search.set('page', String(params.page))
    const qs = search.toString()
    return request<{ subscriptions: Subscription[]; total: number; page: number; pages: number }>(`/api/admin/subscriptions${qs ? `?${qs}` : ''}`)
  },
  confirmSubscription(id: number) {
    return request<{ message: string; subscription: Subscription }>(`/api/admin/subscriptions/${id}/confirm`, { method: 'POST' })
  },
  grantLifetime(userId: number) {
    return request<{ message: string; subscription: Subscription }>('/api/admin/subscriptions/grant-lifetime', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId })
    })
  },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function formatIDR(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}
