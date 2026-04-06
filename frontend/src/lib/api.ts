const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'

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
  me() {
    return request<User>('/api/auth/me')
  }
}

// ─── Store ───────────────────────────────────────────────────────────────────

export interface Game {
  id: number
  appid: number
  name: string
  icon_url?: string
  header_image_url?: string
  price: number
  enabled: boolean
  available_slots: number
  account_count?: number
  order_count?: number
  instructions?: string
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
  game_name: string
  game_appid: number
  account_id: number
  account_name: string
  steam_username?: string
  steam_password?: string
  status: string
  created_at: string
}

export interface SteamGuardCode {
  code: string
  expires_in: number
}

export interface PlayInstructions {
  instructions: string
}

export const storeApi = {
  getGames(params?: { q?: string; page?: number }) {
    const search = new URLSearchParams()

    if (params?.q) search.set('q', params.q)
    if (params?.page) search.set('page', String(params.page))

    const qs = search.toString()

    return request<GamesResponse>(`/api/store/games${qs ? `?${qs}` : ''}`)
  },
  getGame(appid: number | string) {
    return request<Game>(`/api/store/games/${appid}`)
  },
  createOrder(appid: number | string) {
    return request<Order>('/api/store/orders', {
      method: 'POST',
      body: JSON.stringify({ appid: Number(appid) })
    })
  },
  getOrders() {
    return request<Order[]>('/api/store/orders')
  },
  getOrder(id: number | string) {
    return request<Order>(`/api/store/orders/${id}`)
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
  username: string
  steam_id?: string
  game_count: number
  status: string
  created_at: string
}

export interface DashboardStats {
  total_accounts: number
  total_games: number
  total_orders: number
  total_users: number
  recent_orders: Order[]
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
  getAccounts() {
    return request<SteamAccount[]>('/api/admin/accounts')
  },
  addAccount(formData: FormData) {
    return fetch(`${API_BASE}/api/admin/accounts`, {
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
  getGames() {
    return request<Game[]>('/api/admin/games')
  },
  updateGame(id: number, data: Partial<Pick<Game, 'price' | 'enabled'>>) {
    return request<Game>(`/api/admin/games/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    })
  },
  updateGameInstructions(id: number, instructions: string) {
    return request<Game>(`/api/admin/games/${id}/instructions`, {
      method: 'PUT',
      body: JSON.stringify({ instructions })
    })
  },
  getOrders() {
    return request<Order[]>('/api/admin/orders')
  },
  getAuditCodes() {
    return request<AuditEntry[]>('/api/admin/audit/codes')
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
