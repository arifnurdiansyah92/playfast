const API_BASE = process.env.NEXT_PUBLIC_API_URL || ''  // Empty = same origin (proxied via next.config rewrites)

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    },
    ...options
  })

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
  credentials?: {
    account_name: string
    password: string
  }
  status: string
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

export const storeApi = {
  getGames(params?: { q?: string; page?: number }) {
    const search = new URLSearchParams()

    if (params?.q) search.set('q', params.q)
    if (params?.page) search.set('page', String(params.page))

    const qs = search.toString()

    return request<GamesResponse>(`/api/store/games${qs ? `?${qs}` : ''}`)
  },
  async getGame(appid: number | string) {
    const res = await request<{ game: Game }>(`/api/store/games/${appid}`)
    return res.game
  },
  async createOrder(appid: number | string) {
    const res = await request<{ order: Order }>('/api/store/orders', {
      method: 'POST',
      body: JSON.stringify({ appid: Number(appid) })
    })
    return res.order
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
  total_orders: number
  fulfilled_orders: number
  total_users: number
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
  syncGames() {
    return request<{ message: string }>('/api/admin/accounts/sync-games', { method: 'POST' })
  },
  async getGames() {
    const res = await request<{ games: Game[] }>('/api/admin/games')
    return res.games
  },
  async updateGame(id: number, data: Partial<{ price: number; is_enabled: boolean }>) {
    const res = await request<{ game: Game }>(`/api/admin/games/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    })
    return res.game
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
  async getAuditCodes() {
    const res = await request<{ logs: AuditEntry[] }>('/api/admin/audit/codes')
    return res.logs
  }
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
