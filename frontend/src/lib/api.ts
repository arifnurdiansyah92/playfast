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

        throw new ApiError(retryRes.status, body.error || body.message || retryRes.statusText, body)
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

    throw new ApiError(res.status, body.error || body.message || res.statusText, body)
  }

  if (res.status === 204) return undefined as T
  
return res.json()
}

export class ApiError extends Error {
  status: number

  // Extra fields from the response body (e.g. `retry_after`, `code`). Callers
  // that need rate-limit info can introspect this without parsing the message.
  body: Record<string, any>

  constructor(status: number, message: string, body: Record<string, any> = {}) {
    super(message)
    this.status = status
    this.body = body
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
  register(email: string, password: string, referral_code?: string) {
    return request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, ...(referral_code ? { referral_code } : {}) })
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

export interface GameScreenshot {
  thumbnail: string
  full: string
}

export interface GameMovie {
  id: number
  name: string
  thumbnail: string
  mp4_480: string
  mp4_max: string
}

export interface Game {
  id: number
  appid: number
  name: string
  icon: string
  price: number
  original_price?: number | null
  is_enabled: boolean
  is_featured: boolean
  description?: string
  header_image?: string
  genres?: string
  screenshots?: GameScreenshot[]
  movies?: GameMovie[]
  available_accounts?: number
  accounts?: { id: number; account_name: string; is_shared?: boolean }[]
  release_date?: string | null
  created_at: string

  // Admin-only: override fields
  steam_name?: string
  steam_description?: string
  steam_header_image?: string
  steam_screenshots?: GameScreenshot[]
  custom_name?: string | null
  custom_description?: string | null
  custom_header_image?: string | null
  custom_screenshots?: GameScreenshot[] | null
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
  amount_subtotal: number | null
  promo_discount: number
  credit_applied: number
  promo_code_id: number | null
  checkout_group_id?: string | null
  tripay_reference?: string | null
  refunded_at?: string | null
  refund_note?: string | null
  refunded_by_user_id?: number | null
}

export interface CartItem {
  id: number
  user_id: number
  game_id: number
  game: {
    id: number
    appid: number
    name: string
    price: number
    header_image: string | null
    custom_header_image: string | null
    custom_name: string | null
  } | null
  created_at: string
}

export interface CartResponse {
  items: CartItem[]
  cart_subtotal: number
  item_count: number
}

export interface CartCheckoutBody {
  promo_code?: string
  apply_credit?: boolean
}

export interface CartPreviewResponse {
  cart_subtotal: number
  first_order_discount: number
  promo_discount: number
  credit_applied: number
  cart_total: number
  promo_valid: boolean
  promo_error: string | null
  available_credit: number
}

export interface CartCheckoutResponse {
  message: string
  checkout_group_id: string
  orders: Order[]
  payment_mode: 'manual' | 'midtrans' | 'tripay' | 'credit'
  total: number
  snap_token?: string
  checkout_url?: string
  tripay_reference?: string
  manual_info?: { qris_image_url: string; whatsapp_number: string; instructions: string }
}

export interface SteamGuardCode {
  code: string
  remaining: number
}

export type AccountFlagReason =
  | 'locked'
  | 'banned'
  | 'password_changed'
  | 'credentials_invalid'
  | 'guard_code_failed'
  | 'slow_response'
  | 'other'

export interface AccountFlag {
  id: number
  user_id: number
  steam_account_id: number
  assignment_id: number | null
  order_id: number | null
  reason: AccountFlagReason
  description: string | null
  status: 'new' | 'resolved'
  created_at: string
  resolved_at: string | null

  // admin-only enriched fields
  user_email?: string | null
  account_name?: string | null
  game_name?: string | null
  resolved_by_user_id?: number | null
  resolved_by_email?: string | null
  resolution_note?: string | null
}

export interface GameRequest {
  id: number
  appid: number
  name: string
  header_image: string | null
  original_price: number | null
  store_url: string
  status: 'pending' | 'added' | 'rejected'
  admin_note: string | null
  request_count: number
  resolved_at: string | null
  created_at: string
  voted?: boolean

  // admin-only enriched fields
  voters?: { user_id: number; email: string | null; voted_at: string }[]
  resolved_by_email?: string | null
  notified_at?: string | null
  notified_count?: number
}

export type RefillReason = 'no_assignment' | 'revoked' | 'account_disabled'

export interface RefillPriorityAffectedUser {
  user_id: number
  email: string | null
  order_id: number
  order_created_at: string | null
  reason: RefillReason
}

export interface RefillPriorityItem {
  game_id: number
  appid: number
  name: string
  header_image: string | null
  affected_user_count: number
  affected_order_count: number
  oldest_affected_at: string | null
  breakdown: {
    no_assignment: number
    revoked: number
    account_disabled: number
  }
  available_account_count: number
  total_account_count: number
  affected_users: RefillPriorityAffectedUser[]
}

export interface RefillPriorityResponse {
  items: RefillPriorityItem[]
  total_games: number
  total_affected_users: number
  total_affected_orders: number
}

export interface ReportTransaction {
  id: string
  raw_id: number
  type: 'order' | 'subscription'
  type_label: string
  detail: string
  user_email: string | null
  amount_subtotal: number
  promo_code: string | null
  promo_discount: number
  credit_applied: number
  amount: number
  status: string
  payment_type: string | null
  paid_at: string | null
  created_at: string | null
}

export interface ReportSummary {
  total_transactions: number
  order_count: number
  subscription_count: number
  total_revenue: number
  order_revenue: number
  subscription_revenue: number
  total_promo_discount: number
  total_credit_used: number
  transactions_with_promo: number
}

export type ReportPreset = 'today' | '7d' | '30d' | 'custom'

export interface ReportResponse {
  transactions: ReportTransaction[]
  summary: ReportSummary
  date_range: {
    label: string
    start: string
    end: string
    preset: ReportPreset
    from?: string | null
    to?: string | null
  }
}

export interface EmailCampaignFilters {
  verified_only: boolean
  subscribers_only: boolean
  never_purchased: boolean
  exclude_inactive: boolean
}

export type EmailAudienceMode = 'filters' | 'specific'

export interface EmailAudienceCountResponse {
  audience_mode: EmailAudienceMode
  count: number

  // 'filters' mode echoes back the filters
  filters?: EmailCampaignFilters

  // 'specific' mode breakdown
  matched_count?: number
  guest_count?: number
  opted_out_count?: number
  invalid_count?: number
  opted_out_emails?: string[]
  invalid_entries?: string[]
}

export type EmailCampaignStatus = 'draft' | 'sending' | 'completed' | 'cancelled' | 'failed'

export interface EmailCampaign {
  id: number
  subject: string
  filters: EmailCampaignFilters
  audience_mode: EmailAudienceMode
  target_emails: string[]
  status: EmailCampaignStatus
  total_recipients: number
  sent_count: number
  failed_count: number
  created_by_email: string | null
  created_at: string
  updated_at: string
  started_at: string | null
  finished_at: string | null
  body_markdown?: string
  recipients?: EmailCampaignRecipient[]
}

export interface EmailCampaignRecipient {
  id: number
  campaign_id: number
  user_id: number | null
  email: string
  status: 'pending' | 'sent' | 'failed'
  error: string | null
  sent_at: string | null
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

export interface PromoBannerConfig {
  enabled: boolean
  now_in_range: boolean
  start_date: string
  end_date: string
  target_plan: string
  plan_label: string
  promo_price: number
  regular_price: number
  eyebrow: string
  headline: string
  subhead: string
  features: string[]
  cta_text: string
  wa_message_template: string
  session_key_suffix: string
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
  midtrans_order_id: string | null
  snap_token?: string | null
  payment_type: string | null
  paid_at: string | null
  created_at: string
  user_email?: string
  amount_subtotal: number | null
  promo_discount: number
  credit_applied: number
  promo_code_id: number | null
  tripay_reference?: string | null
  refunded_at?: string | null
  refund_note?: string | null
  refunded_by_user_id?: number | null
}

export interface PromoCode {
  id: number
  code: string
  description: string | null
  discount_type: 'percentage' | 'fixed'
  discount_value: number
  scope: string
  min_order_amount: number
  max_uses_total: number | null
  max_uses_per_user: number
  expires_at: string | null
  is_active: boolean
  assigned_user_id: number | null
  assigned_user_email: string | null
  created_at: string
  uses_count?: number
}

export interface MyPromoUse {
  email_masked: string
  discount_amount: number
  revenue_amount: number
  paid: boolean
  used_at: string
  order_id: number | null
  subscription_id: number | null
}

export interface MyPromo {
  id: number
  code: string
  description: string | null
  discount_type: 'percentage' | 'fixed'
  discount_value: number
  scope: string
  min_order_amount: number
  max_uses_total: number | null
  max_uses_per_user: number
  expires_at: string | null
  is_active: boolean
  expired: boolean
  total_uses: number
  paid_redemptions: number
  total_discount_given: number
  total_revenue_contributed: number
  recent_uses: MyPromoUse[]
}

export interface PromoCodeUsage {
  id: number
  promo_code_id: number
  user_id: number
  order_id: number | null
  subscription_id: number | null
  discount_amount: number
  used_at: string
  user_email?: string | null
  paid_to_creator_at?: string | null
  paid_to_creator_note?: string | null
}

export interface RevenueSharingItem {
  id: number
  promo_code_id: number
  user_id: number
  user_email: string | null
  order_id: number | null
  subscription_id: number | null
  type: 'order' | 'subscription' | null
  transaction_label: string | null
  subtotal: number
  amount_paid: number
  discount_amount: number
  used_at: string
  transaction_paid_at: string | null
  paid_to_creator_at: string | null
  paid_to_creator_note: string | null
}

export interface RevenueSharingStats {
  total_count: number
  paid_count: number
  unpaid_count: number
  total_revenue: number
  paid_revenue: number
  unpaid_revenue: number
}

export interface RevenueSharingResponse {
  items: RevenueSharingItem[]
  total: number
  page: number
  per_page: number
  pages: number
  stats: RevenueSharingStats
  promo_code: {
    id: number
    code: string
    description: string | null
    assigned_user_email: string | null
  }
}

export interface MyReferralResponse {
  code: string
  credit: number
  total_earned: number
  referrals: Array<{
    email_masked: string
    joined_at: string
    status: 'pending' | 'rewarded'
    credit_awarded: number
  }>
}

export interface PromoValidateResponse {
  valid: boolean
  discount_amount?: number
  code?: string
  discount_type?: 'percentage' | 'fixed'
  discount_value?: number
  error?: string
}

// ─── Redeem code campaigns (giveaways) ──────────────────────────────────────

export type RedeemRewardType = 'subscription' | 'game'

export interface RedeemCampaign {
  id: number
  name: string
  description: string | null
  reward_type: RedeemRewardType
  reward_subscription_plan: string | null
  reward_subscription_duration_days: number | null
  reward_game_id: number | null
  reward_game_name: string | null
  reward_label: string
  max_redemptions_per_user: number
  starts_at: string | null
  expires_at: string | null
  is_active: boolean
  created_at: string
  created_by_user_id: number | null
  total_codes?: number
  redeemed_codes?: number
  available_codes?: number
}

export interface RedeemCode {
  id: number
  code: string
  campaign_id: number
  redeemed_by_user_id: number | null
  redeemed_by_email: string | null
  redeemed_at: string | null
  granted_subscription_id: number | null
  granted_order_id: number | null
  created_at: string
  is_redeemed: boolean
}

export interface RedeemResponse {
  message: string
  reward_label: string
  reward_type: RedeemRewardType
  redirect_to: string
  granted_subscription_id: number | null
  granted_order_id: number | null
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
  getTutorialUrl() {
    return request<{ url: string }>('/api/store/site/tutorial-url')
  },
  getSubscriptionPlans() {
    return request<{ plans: SubscriptionPlan[] }>('/api/store/subscription/plans')
  },
  getPromoBannerConfig() {
    return request<PromoBannerConfig>('/api/store/promo-banner-config')
  },
  subscribe(plan: string, options?: { promo_code?: string; apply_credit?: boolean }) {
    return request<{
      subscription: Subscription
      payment_mode: string
      snap_token?: string
      checkout_url?: string
      tripay_reference?: string
      manual_info?: { qris_image_url: string; whatsapp_number: string; instructions: string }
    }>('/api/store/subscription/subscribe', {
      method: 'POST',
      body: JSON.stringify({ plan, ...(options || {}) })
    })
  },
  getSubscriptionStatus() {
    return request<{ is_subscribed: boolean; subscription: Subscription | null }>('/api/store/subscription/status')
  },
  getSubscriptionById(subId: number | string) {
    return request<{
      subscription: Subscription
      payment_mode: string
      manual_info?: { qris_image_url: string; whatsapp_number: string; instructions: string }
    }>(`/api/store/subscription/${subId}`)
  },
  pollSubscriptionStatus(subId: number | string) {
    return request<{ status: string; paid_at: string | null; expires_at: string | null }>(`/api/store/subscription/${subId}/status`)
  },
  getMySubscriptions() {
    return request<{ subscriptions: Subscription[] }>('/api/store/my-subscriptions')
  },
  async createOrder(appid: number | string, options?: { promo_code?: string; apply_credit?: boolean }) {
    return request<{
      order: Order
      payment_mode: string
      snap_token?: string
      checkout_url?: string
      tripay_reference?: string
      manual_info?: { qris_image_url: string; whatsapp_number: string; instructions: string }
      already_owned?: boolean
    }>('/api/store/orders', {
      method: 'POST',
      body: JSON.stringify({ appid: Number(appid), ...(options || {}) })
    })
  },
  async getMyGames() {
    const res = await request<{
      games: (Game & {
        type: 'purchased' | 'bonus' | 'subscription'
        order_id: number | null
        account_name: string | null
        assignment_id: number | null
        claimable?: boolean
      })[]
    }>('/api/store/my-games')


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
  getInstructions(orderId: number | string, appid?: number | string) {
    const qs = appid ? `?appid=${encodeURIComponent(appid)}` : ''

    return request<PlayInstructions>(`/api/store/orders/${orderId}/instructions${qs}`)
  },
  flagOrder(orderId: number | string, params: { reason: AccountFlagReason; description?: string }) {
    return request<{ message: string; flag: AccountFlag }>(`/api/store/orders/${orderId}/flag`, {
      method: 'POST',
      body: JSON.stringify(params),
    })
  },
  validatePromoCode(params: { code: string; order_type: 'game' | 'subscription'; subtotal: number; game_id?: number; plan?: string }) {
    return request<PromoValidateResponse>('/api/store/promo-codes/validate', {
      method: 'POST',
      body: JSON.stringify(params),
    })
  },
  validateReferralCode(code: string) {
    return request<{ valid: boolean; referrer_name?: string; error?: string }>('/api/store/referral/validate', {
      method: 'POST',
      body: JSON.stringify({ code }),
    })
  },
  getMyReferral() {
    return request<MyReferralResponse>('/api/store/my-referral')
  },
  getMyPromos() {
    return request<{ promos: MyPromo[] }>('/api/store/my-promos').then(r => r.promos)
  },
}

// ─── Game Requests ───────────────────────────────────────────────────────────

export const gameRequestsApi = {
  submit(steam_url: string) {
    return request<{ message: string; game_request: GameRequest }>(
      '/api/game-requests',
      {
        method: 'POST',
        body: JSON.stringify({ steam_url }),
      }
    )
  },
  async listMine() {
    const res = await request<{ items: GameRequest[] }>('/api/game-requests/mine')

    return res.items
  },
  async listAll() {
    const res = await request<{ items: GameRequest[] }>('/api/game-requests')

    return res.items
  },
  listPublic() {
    return request<{
      pending: GameRequest[]
      added: GameRequest[]
      pending_total: number
      added_total: number
    }>('/api/game-requests/public')
  },
  removeMyVote(requestId: number) {
    return request<{ message: string; game_request: GameRequest }>(
      `/api/game-requests/${requestId}/vote`,
      { method: 'DELETE' }
    )
  },
}

// ─── Reviews ─────────────────────────────────────────────────────────────────

export interface ReviewImage {
  id: number
  url: string
  sort_order: number
}

export interface Review {
  id: number
  rating: number
  headline: string | null
  body: string
  status: 'pending' | 'approved' | 'rejected'
  is_featured: boolean
  display_email: string
  plan_label: string
  images: ReviewImage[]
  created_at: string
  updated_at: string
  approved_at: string | null

  // admin-only fields
  user_id?: number | null
  user_email?: string | null
  manual_email?: string | null
  manual_plan_label?: string | null
  admin_note?: string | null
  moderated_by_user_id?: number | null
  moderated_by_email?: string | null
}

export interface ReviewListResponse {
  items: Review[]
  total: number
  page: number
  per_page: number
  pages: number
}

export interface ReviewEligibility {
  eligible: boolean
  has_review: boolean
  review: Review | null
}

export const reviewsApi = {
  async listPublic(params: {
    page?: number
    per_page?: number
    rating_gte?: number
    has_photo?: boolean
    sort?: 'newest' | 'rating'
  } = {}) {
    const qs = new URLSearchParams()

    if (params.page) qs.set('page', String(params.page))
    if (params.per_page) qs.set('per_page', String(params.per_page))
    if (params.rating_gte) qs.set('rating_gte', String(params.rating_gte))
    if (params.has_photo) qs.set('has_photo', '1')
    if (params.sort) qs.set('sort', params.sort)

    const query = qs.toString()

    return request<ReviewListResponse>(`/api/reviews${query ? `?${query}` : ''}`)
  },
  async featured(limit = 3) {
    const res = await request<{ items: Review[] }>(`/api/reviews/featured?limit=${limit}`)

    return res.items
  },
  eligibility() {
    return request<ReviewEligibility>('/api/reviews/eligibility')
  },
  myReview() {
    return request<{ review: Review | null }>('/api/reviews/me')
  },
  async submit(form: { rating: number; body: string; headline?: string; images: File[] }): Promise<Review> {
    const fd = new FormData()

    fd.append('rating', String(form.rating))
    fd.append('body', form.body)
    if (form.headline) fd.append('headline', form.headline)
    form.images.forEach(f => fd.append('images', f))

    const res = await fetch(`${API_BASE}/api/reviews`, {
      method: 'POST',
      credentials: 'include',
      body: fd,
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))

      throw new ApiError(res.status, err.error || 'Submit gagal')
    }

    const data = await res.json()

    return data.review
  },
  async editMine(form: {
    rating?: number
    body?: string
    headline?: string | null
    images?: File[]
    delete_image_ids?: number[]
  }): Promise<Review> {
    const fd = new FormData()

    if (form.rating !== undefined) fd.append('rating', String(form.rating))
    if (form.body !== undefined) fd.append('body', form.body)
    if (form.headline !== undefined) fd.append('headline', form.headline ?? '')
    if (form.delete_image_ids?.length) fd.append('delete_image_ids', form.delete_image_ids.join(','))
    form.images?.forEach(f => fd.append('images', f))

    const res = await fetch(`${API_BASE}/api/reviews/me`, {
      method: 'PATCH',
      credentials: 'include',
      body: fd,
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))

      throw new ApiError(res.status, err.error || 'Update gagal')
    }

    const data = await res.json()

    return data.review
  },
  deleteMine() {
    return request<{ message: string }>('/api/reviews/me', { method: 'DELETE' })
  },
}

// ─── Creator Program ────────────────────────────────────────────────────────

export type CreatorPlatform = 'tiktok' | 'instagram' | 'youtube' | 'x' | 'facebook' | 'other'
export type CreatorAppStatus = 'pending' | 'contacted' | 'approved' | 'rejected'
export type CreatorFollowerBucket = '<1K' | '1-10K' | '10-50K' | '50-100K' | '100K+'

export interface CreatorApplication {
  id: number
  name: string
  email: string
  whatsapp: string
  platform: CreatorPlatform
  handle: string
  follower_bucket: CreatorFollowerBucket | null
  content_links: string[]
  niche: string | null
  pitch: string | null
  status: CreatorAppStatus
  created_at: string

  // admin-only
  admin_note?: string | null
  reviewed_by_user_id?: number | null
  reviewed_by_email?: string | null
  reviewed_at?: string | null
}

export interface CreatorApplicationSubmit {
  name: string
  email: string
  whatsapp: string
  platform: CreatorPlatform
  handle: string
  follower_bucket?: CreatorFollowerBucket | null
  content_links: string[]
  niche?: string
  pitch?: string
}

export const creatorApi = {
  submitApplication(payload: CreatorApplicationSubmit) {
    return request<{ message: string; application: CreatorApplication }>(
      '/api/creator-applications',
      { method: 'POST', body: JSON.stringify(payload) }
    )
  },
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export interface SteamAccount {
  id: number
  account_name: string
  steam_id: string | null
  game_count: number
  is_active: boolean
  show_in_catalog_when_disabled: boolean
  allowed_appids: number[] | null
  created_at: string
}

export interface SteamAccountGame {
  id: number
  appid: number
  name: string
  header_image: string | null
  is_shared: boolean
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

export interface JobStatus {
  job_type: string
  status: 'running' | 'completed' | 'failed' | 'interrupted' | 'cancelled'
  total: number
  processed: number
  message: string
  started_at: string
  finished_at: string | null
  cancel_requested?: boolean
}

export interface AuditEntry {
  id: number
  user_email: string
  account_name: string
  game_name: string | null
  created_at: string
  ip_address: string
}

export interface UserProfileStats {
  total_orders: number
  fulfilled_orders: number
  total_spent: number
  purchase_spent: number
  subscription_spent: number
  subscription_count: number
  active_subscription: Subscription | null
  code_request_count: number
  last_code_request_at: string | null
  referrals_made: number
  referrals_rewarded: number
  total_credit_earned: number
  promo_usage_count: number
  promo_total_discount: number
}

export interface UserProfileAssignment {
  id: number
  order_id: number
  is_revoked: boolean
  revoked_at: string | null
  created_at: string
  steam_account_id: number
  steam_account_name: string | null
  steam_id: string | null
  game_id: number
  game_name: string | null
  game_appid: number | null
}

export interface UserProfilePromoUsage {
  id: number
  code: string
  order_id: number | null
  subscription_id: number | null
  discount_amount: number
  used_at: string
}

export interface UserProfileReferralMade {
  user_id: number
  email: string
  joined_at: string
  credit_awarded: number | null
}

export interface UserProfileReview {
  id: number
  rating: number
  headline: string | null
  body: string
  status: 'pending' | 'approved' | 'rejected'
  is_featured: boolean
  admin_note: string | null
  created_at: string
  approved_at: string | null
}

export interface UserProfileGameRequest {
  id: number
  appid: number
  name: string
  status: 'pending' | 'added' | 'rejected'
  request_count: number
  voted_at: string
}

export interface UserProfile {
  user: User & {
    is_admin: boolean
    is_active: boolean
    referral_code: string | null
    referral_credit: number
    referred_by_user_id: number | null
    email_opted_out: boolean
  }
  referrer: { id: number; email: string; referral_code: string | null } | null
  stats: UserProfileStats
  orders: Order[]
  subscriptions: Subscription[]
  assignments: UserProfileAssignment[]
  promo_usages: UserProfilePromoUsage[]
  referrals_made: UserProfileReferralMade[]
  referral_rewards: { id: number; referee_user_id: number; credit_awarded: number; awarded_at: string }[]
  review: UserProfileReview | null
  account_flags: AccountFlag[]
  game_requests: UserProfileGameRequest[]
}

export type EmailLogStatus =
  | 'queued' | 'sent' | 'failed'
  | 'delivered' | 'bounced' | 'soft_bounced'
  | 'spam' | 'blocked' | 'invalid_email' | 'deferred'

export type EmailLogType =
  | 'verification' | 'password_reset' | 'order_welcome'
  | 'subscription_welcome' | 'game_request_fulfilled' | 'account_flag'

export interface EmailLog {
  id: number
  user_id: number | null
  recipient_email: string
  type: EmailLogType
  subject: string
  status: EmailLogStatus
  smtp_response: string | null
  brevo_message_id: string | null
  error_message: string | null
  metadata: Record<string, any> | null
  created_at: string
  sent_at: string | null
  brevo_event_at: string | null
}

export interface EmailLogDetail extends EmailLog {
  user?: { id: number; email: string; email_verified: boolean }
}

export interface EmailLogsListResponse {
  logs: EmailLog[]
  total: number
  page: number
  per_page: number
  pages: number
}

export interface EmailLogsFilters {
  recipient?: string
  type?: EmailLogType[]
  status?: EmailLogStatus[]
  user_id?: number
  from?: string
  to?: string
  failed_only?: boolean
  page?: number
  per_page?: number
}

export const adminApi = {
  getDashboard() {
    return request<DashboardStats>('/api/admin/dashboard')
  },
  async getAccounts() {
    const res = await request<{ accounts: SteamAccount[] }>('/api/admin/accounts')


    return res.accounts
  },
  getAccountsPaginated(params: { page: number; per_page: number; q?: string }) {
    const sp = new URLSearchParams()

    sp.set('page', String(params.page))
    sp.set('per_page', String(params.per_page))
    if (params.q) sp.set('q', params.q)

    return request<{
      accounts: SteamAccount[]
      total: number
      page: number
      per_page: number
      pages: number
    }>(`/api/admin/accounts?${sp.toString()}`)
  },
  async getAccount(id: number) {
    const res = await request<{ account: SteamAccount & { password: string; games: SteamAccountGame[] } }>(
      `/api/admin/accounts/${id}`
    )


    return res.account
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
  updateAccount(id: number, data: Partial<{ password: string; is_active: boolean; show_in_catalog_when_disabled: boolean; allowed_appids: number[] | null }>) {
    return request<{ message: string; account: SteamAccount; reassigned_orders?: number[]; orphaned_orders?: number[] }>(`/api/admin/accounts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    })
  },
  syncAccount(id: number) {
    return request<{ message: string; job?: JobStatus }>(`/api/admin/accounts/${id}/sync`, { method: 'POST' })
  },
  getAccountCode(id: number) {
    return request<{ code: string; remaining: number }>(`/api/admin/accounts/${id}/code`, { method: 'POST' })
  },
  loginAccount(id: number) {
    return request<{ message: string }>(`/api/admin/accounts/${id}/login`, { method: 'POST' })
  },
  logoutAllDevices(id: number) {
    return request<{
      message: string
      revoked_count: number
      failed_count: number
      devices: string[]
      relogin_success: boolean
    }>(`/api/admin/accounts/${id}/logout-all`, { method: 'POST' })
  },
  logoutAllBulk() {
    return request<{ message: string; job?: JobStatus }>(
      '/api/admin/accounts/logout-all-bulk',
      { method: 'POST' }
    )
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
    return request<{ message: string; job?: JobStatus }>('/api/admin/accounts/sync-games', { method: 'POST' })
  },
  refreshGameMetadata(scope?: string) {
    const qs = scope ? `?scope=${scope}` : ''

    
return request<{ message: string; job?: JobStatus }>(`/api/admin/games/refresh-metadata${qs}`, { method: 'POST' })
  },
  getJobStatus() {
    return request<{ job: JobStatus | null }>('/api/admin/jobs/current')
  },
  cancelJob() {
    return request<{ message: string }>('/api/admin/jobs/cancel', { method: 'POST' })
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
  async updateGame(id: number, data: Partial<{ price: number; is_enabled: boolean; is_featured: boolean; custom_name: string | null; custom_description: string | null; custom_header_image: string | null; custom_screenshots: GameScreenshot[] | null }>) {
    const res = await request<{ game: Game }>(`/api/admin/games/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    })

    
return res.game
  },
  async uploadGameImage(gameId: number, file: File): Promise<string> {
    const formData = new FormData()

    formData.append('file', file)

    const res = await fetch(`${API_BASE}/api/admin/games/${gameId}/upload-image`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Upload failed' }))

      throw new ApiError(res.status, err.error || 'Upload failed')
    }

    const data = await res.json()

    
return data.url
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
  getRefillPriority(params?: { q?: string }) {
    const sp = new URLSearchParams()

    if (params?.q) sp.set('q', params.q)
    const suffix = sp.toString() ? `?${sp.toString()}` : ''

    return request<RefillPriorityResponse>(`/api/admin/refill-priority${suffix}`)
  },
  getOrders(params?: { page?: number; per_page?: number; status?: string; q?: string }) {
    const sp = new URLSearchParams()

    if (params?.page) sp.set('page', String(params.page))
    if (params?.per_page) sp.set('per_page', String(params.per_page))
    if (params?.status) sp.set('status', params.status)
    if (params?.q) sp.set('q', params.q)

    const suffix = sp.toString() ? `?${sp.toString()}` : ''

    return request<{
      orders: Order[]
      total: number
      page: number
      per_page: number
      pages: number
      stats: Record<string, number>
    }>(`/api/admin/orders${suffix}`)
  },
  revokeAccess(orderId: number) {
    return request<{ message: string }>(`/api/admin/orders/${orderId}/revoke`, { method: 'POST' })
  },
  restoreAccess(orderId: number) {
    return request<{ message: string }>(`/api/admin/orders/${orderId}/restore`, { method: 'POST' })
  },
  refundOrder(orderId: number, note?: string) {
    return request<{ message: string; order: Order }>(`/api/admin/orders/${orderId}/refund`, {
      method: 'POST',
      body: JSON.stringify({ note: note || null }),
    })
  },
  retryFulfillOrder(orderId: number) {
    return request<{ message: string; order: Order }>(`/api/admin/orders/${orderId}/retry-fulfill`, { method: 'POST' })
  },
  retryFulfillAllOrders() {
    return request<{ message: string; healed: number[]; failed: { order_id: number; reason: string }[]; scanned: number }>(`/api/admin/orders/retry-fulfill-all`, { method: 'POST' })
  },
  getOrderCandidateAccounts(orderId: number) {
    return request<{
      order_id: number
      game_id: number
      current_account_id: number | null
      candidates: {
        id: number
        account_name: string
        steam_id: string | null
        is_shared: boolean
        active_assignment_count: number
        is_current: boolean
      }[]
    }>(`/api/admin/orders/${orderId}/candidate-accounts`)
  },
  reassignOrder(orderId: number, steam_account_id: number) {
    return request<{ message: string; order: Order }>(`/api/admin/orders/${orderId}/reassign`, {
      method: 'POST',
      body: JSON.stringify({ steam_account_id }),
    })
  },
  async getUsers() {
    const res = await request<{ users: (User & { order_count: number; is_admin: boolean; is_active: boolean })[] }>('/api/admin/users')


    return res.users
  },
  getUsersPaginated(params: { page: number; per_page: number; q?: string }) {
    const sp = new URLSearchParams()

    sp.set('page', String(params.page))
    sp.set('per_page', String(params.per_page))
    if (params.q) sp.set('q', params.q)

    return request<{
      users: (User & { order_count: number; is_admin: boolean; is_active: boolean; referral_code: string | null })[]
      total: number
      page: number
      per_page: number
      pages: number
    }>(`/api/admin/users?${sp.toString()}`)
  },
  getUserProfile(id: number) {
    return request<UserProfile>(`/api/admin/users/${id}/profile`)
  },
  updateUser(id: number, data: Partial<{ is_admin: boolean; is_active: boolean; password: string; referral_code: string; email: string }>) {
    return request<{ user: User }>(`/api/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    })
  },
  regenerateUserReferralCode(id: number) {
    return request<{ message: string; referral_code: string; user: any }>(`/api/admin/users/${id}/regenerate-referral-code`, { method: 'POST' })
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
  async getAccountFlags(status: 'new' | 'resolved' | 'all' = 'new') {
    return request<{ flags: AccountFlag[]; counts: { new: number; resolved: number; all: number } }>(
      `/api/admin/account-flags?status=${status}`
    )
  },
  resolveAccountFlag(flagId: number, resolutionNote?: string) {
    return request<{ message: string; flag: AccountFlag }>(
      `/api/admin/account-flags/${flagId}/resolve`,
      {
        method: 'POST',
        body: JSON.stringify({ resolution_note: resolutionNote ?? null }),
      }
    )
  },
  reopenAccountFlag(flagId: number) {
    return request<{ message: string; flag: AccountFlag }>(
      `/api/admin/account-flags/${flagId}/reopen`,
      { method: 'POST' }
    )
  },
  getAuditCodes(params: {
    page?: number
    per_page?: number
    email?: string
    account?: string
    game?: string
    user_id?: number
    steam_account_id?: number
  } = {}) {
    const qs = new URLSearchParams()

    if (params.page) qs.set('page', String(params.page))
    if (params.per_page) qs.set('per_page', String(params.per_page))
    if (params.email) qs.set('email', params.email)
    if (params.account) qs.set('account', params.account)
    if (params.game) qs.set('game', params.game)
    if (params.user_id) qs.set('user_id', String(params.user_id))
    if (params.steam_account_id) qs.set('steam_account_id', String(params.steam_account_id))
    const query = qs.toString()

    return request<{
      logs: AuditEntry[]
      total: number
      page: number
      per_page: number
      pages: number
    }>(`/api/admin/audit/codes${query ? `?${query}` : ''}`)
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
  revokeSubscription(id: number) {
    return request<{ message: string; subscription: Subscription }>(`/api/admin/subscriptions/${id}/revoke`, { method: 'POST' })
  },
  refundSubscription(id: number, note?: string) {
    return request<{ message: string; subscription: Subscription; revoked_claim_count: number }>(`/api/admin/subscriptions/${id}/refund`, {
      method: 'POST',
      body: JSON.stringify({ note: note || null }),
    })
  },
  grantLifetime(userId: number) {
    return request<{ message: string; subscription: Subscription }>('/api/admin/subscriptions/grant-lifetime', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId })
    })
  },
  getPromoCodes(params?: { page?: number; per_page?: number; q?: string }) {
    const sp = new URLSearchParams()

    if (params?.page) sp.set('page', String(params.page))
    if (params?.per_page) sp.set('per_page', String(params.per_page))
    if (params?.q) sp.set('q', params.q)

    const suffix = sp.toString() ? `?${sp.toString()}` : ''

    return request<{
      promo_codes: PromoCode[]
      total?: number
      page?: number
      per_page?: number
      pages?: number
    }>(`/api/admin/promo-codes${suffix}`)
  },
  createPromoCode(data: Partial<PromoCode>) {
    return request<{ promo_code: PromoCode }>('/api/admin/promo-codes', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },
  updatePromoCode(id: number, data: Partial<PromoCode>) {
    return request<{ promo_code: PromoCode }>(`/api/admin/promo-codes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },
  deletePromoCode(id: number) {
    return request<{ message: string }>(`/api/admin/promo-codes/${id}`, { method: 'DELETE' })
  },
  getPromoCodeUsages(id: number) {
    return request<{ usages: PromoCodeUsage[]; total_discount: number }>(`/api/admin/promo-codes/${id}/usages`)
  },
  getReport(params: { preset: ReportPreset; from?: string; to?: string }) {
    const qs = new URLSearchParams({ preset: params.preset })

    if (params.from) qs.set('from', params.from)
    if (params.to) qs.set('to', params.to)

    return request<ReportResponse>(`/api/admin/reports/transactions?${qs.toString()}`)
  },
  reportCsvUrl(params: { preset: ReportPreset; from?: string; to?: string }): string {
    const qs = new URLSearchParams({ preset: params.preset, format: 'csv' })

    if (params.from) qs.set('from', params.from)
    if (params.to) qs.set('to', params.to)

    return `${API_BASE}/api/admin/reports/transactions?${qs.toString()}`
  },
  getRevenueSharingPromoCodes() {
    return request<{
      items: Array<{
        id: number
        code: string
        description: string | null
        usage_count: number
      }>
    }>(`/api/admin/revenue-sharing/promo-codes`)
  },
  getRevenueSharing(params: {
    promo_code_id: number
    status?: 'all' | 'paid' | 'unpaid'
    page?: number
    per_page?: number
    date_start?: string  // YYYY-MM-DD inclusive
    date_end?: string    // YYYY-MM-DD inclusive (interpreted as end of day server-side)
  }) {
    const sp = new URLSearchParams()

    sp.set('promo_code_id', String(params.promo_code_id))
    if (params.status) sp.set('status', params.status)
    if (params.page) sp.set('page', String(params.page))
    if (params.per_page) sp.set('per_page', String(params.per_page))
    if (params.date_start) sp.set('date_start', params.date_start)
    if (params.date_end) sp.set('date_end', params.date_end)

    return request<RevenueSharingResponse>(`/api/admin/revenue-sharing?${sp.toString()}`)
  },
  markRevenueSharingPaid(usage_ids: number[], note?: string) {
    return request<{ updated: number }>(`/api/admin/revenue-sharing/mark-paid`, {
      method: 'POST',
      body: JSON.stringify({ usage_ids, note }),
    })
  },
  markRevenueSharingUnpaid(usage_ids: number[]) {
    return request<{ updated: number }>(`/api/admin/revenue-sharing/mark-unpaid`, {
      method: 'POST',
      body: JSON.stringify({ usage_ids }),
    })
  },
  getReferrals(params?: { page?: number; per_page?: number; q?: string }) {
    const sp = new URLSearchParams()

    if (params?.page) sp.set('page', String(params.page))
    if (params?.per_page) sp.set('per_page', String(params.per_page))
    if (params?.q) sp.set('q', params.q)

    const suffix = sp.toString() ? `?${sp.toString()}` : ''

    return request<{
      referrals: any[]
      total_credit_awarded: number
      total_count: number
      total?: number
      page?: number
      per_page?: number
      pages?: number
    }>(`/api/admin/referrals${suffix}`)
  },
  getGameRequests(params: {
    status?: 'pending' | 'added' | 'rejected' | 'all'
    page?: number
    per_page?: number
    q?: string
  } = {}) {
    const sp = new URLSearchParams()

    sp.set('status', params.status ?? 'all')
    if (params.page) sp.set('page', String(params.page))
    if (params.per_page) sp.set('per_page', String(params.per_page))
    if (params.q) sp.set('q', params.q)

    return request<{
      items: GameRequest[]
      total: number
      page: number
      per_page: number
      pages: number
      stats: { pending: number; added: number; rejected: number }
    }>(`/api/admin/game-requests?${sp.toString()}`)
  },
  updateGameRequest(
    id: number,
    data: { status: 'pending' | 'added' | 'rejected'; admin_note?: string }
  ) {
    return request<{ message: string; game_request: GameRequest }>(
      `/api/admin/game-requests/${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      }
    )
  },

  // ─── Email Blast ────────────────────────────────────────────────────────
  audienceCount(payload: {
    audience_mode: EmailAudienceMode
    filters?: EmailCampaignFilters
    target_emails?: string[]
  }) {
    return request<EmailAudienceCountResponse>(
      '/api/admin/email-blast/audience-count',
      { method: 'POST', body: JSON.stringify(payload) }
    )
  },
  listEmailCampaigns() {
    return request<{ items: EmailCampaign[] }>('/api/admin/email-blast/campaigns')
  },
  createEmailCampaign(data: {
    subject: string
    body_markdown: string
    filters: EmailCampaignFilters
    audience_mode?: EmailAudienceMode
    target_emails?: string[]
  }) {
    return request<{ campaign: EmailCampaign }>(
      '/api/admin/email-blast/campaigns',
      { method: 'POST', body: JSON.stringify(data) }
    )
  },
  getEmailCampaign(id: number, withRecipients = false) {
    const qs = withRecipients ? '?recipients=1' : ''

    return request<{ campaign: EmailCampaign }>(`/api/admin/email-blast/campaigns/${id}${qs}`)
  },
  updateEmailCampaign(
    id: number,
    data: {
      subject?: string
      body_markdown?: string
      filters?: EmailCampaignFilters
      audience_mode?: EmailAudienceMode
      target_emails?: string[]
    }
  ) {
    return request<{ campaign: EmailCampaign }>(
      `/api/admin/email-blast/campaigns/${id}`,
      { method: 'PUT', body: JSON.stringify(data) }
    )
  },
  deleteEmailCampaign(id: number) {
    return request<{ message: string }>(
      `/api/admin/email-blast/campaigns/${id}`,
      { method: 'DELETE' }
    )
  },
  sendEmailTest(id: number) {
    return request<{ message: string }>(
      `/api/admin/email-blast/campaigns/${id}/send-test`,
      { method: 'POST' }
    )
  },
  sendEmailBlast(id: number) {
    return request<{ message: string; campaign: EmailCampaign; job: JobStatus }>(
      `/api/admin/email-blast/campaigns/${id}/send`,
      { method: 'POST' }
    )
  },
  cancelEmailBlast() {
    return request<{ message: string }>(
      '/api/admin/email-blast/cancel',
      { method: 'POST' }
    )
  },

  // ─── Reviews moderation ─────────────────────────────────────────────────
  getReviews(params: { status?: 'pending' | 'approved' | 'rejected' | 'all'; page?: number; per_page?: number } = {}) {
    const qs = new URLSearchParams()

    if (params.status) qs.set('status', params.status)
    if (params.page) qs.set('page', String(params.page))
    if (params.per_page) qs.set('per_page', String(params.per_page))
    const query = qs.toString()

    return request<{
      items: Review[]
      stats: { pending: number; approved: number; rejected: number }
      total: number
      page: number
      per_page: number
      pages: number
    }>(`/api/admin/reviews${query ? `?${query}` : ''}`)
  },
  approveReview(id: number) {
    return request<{ message: string; review: Review }>(`/api/admin/reviews/${id}/approve`, { method: 'POST' })
  },
  rejectReview(id: number, admin_note?: string) {
    return request<{ message: string; review: Review }>(`/api/admin/reviews/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ admin_note: admin_note ?? null }),
    })
  },
  toggleReviewFeatured(id: number, is_featured?: boolean) {
    return request<{ review: Review }>(`/api/admin/reviews/${id}/feature`, {
      method: 'POST',
      body: JSON.stringify(is_featured === undefined ? {} : { is_featured }),
    })
  },
  async createReview(form: {
    user_id?: number | null
    manual_email?: string
    manual_plan_label?: string
    rating: number
    headline?: string
    body: string
    status?: 'pending' | 'approved' | 'rejected'
    is_featured?: boolean
    images?: File[]
  }): Promise<Review> {
    const fd = new FormData()

    if (form.user_id) fd.append('user_id', String(form.user_id))
    if (form.manual_email) fd.append('manual_email', form.manual_email)
    if (form.manual_plan_label) fd.append('manual_plan_label', form.manual_plan_label)
    fd.append('rating', String(form.rating))
    if (form.headline) fd.append('headline', form.headline)
    fd.append('body', form.body)
    if (form.status) fd.append('status', form.status)
    if (form.is_featured) fd.append('is_featured', 'true')
    form.images?.forEach(f => fd.append('images', f))

    const res = await fetch(`${API_BASE}/api/admin/reviews`, {
      method: 'POST',
      credentials: 'include',
      body: fd,
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))

      throw new ApiError(res.status, err.error || 'Create gagal')
    }

    const data = await res.json()

    return data.review
  },
  async updateReview(id: number, form: {
    rating?: number
    headline?: string | null
    body?: string
    status?: 'pending' | 'approved' | 'rejected'
    is_featured?: boolean
    manual_email?: string
    manual_plan_label?: string
    images?: File[]
    delete_image_ids?: number[]
  }): Promise<Review> {
    const fd = new FormData()

    if (form.rating !== undefined) fd.append('rating', String(form.rating))
    if (form.headline !== undefined) fd.append('headline', form.headline ?? '')
    if (form.body !== undefined) fd.append('body', form.body)
    if (form.status !== undefined) fd.append('status', form.status)
    if (form.is_featured !== undefined) fd.append('is_featured', form.is_featured ? 'true' : 'false')
    if (form.manual_email !== undefined) fd.append('manual_email', form.manual_email)
    if (form.manual_plan_label !== undefined) fd.append('manual_plan_label', form.manual_plan_label)
    if (form.delete_image_ids?.length) fd.append('delete_image_ids', form.delete_image_ids.join(','))
    form.images?.forEach(f => fd.append('images', f))

    const res = await fetch(`${API_BASE}/api/admin/reviews/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      body: fd,
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))

      throw new ApiError(res.status, err.error || 'Update gagal')
    }

    const data = await res.json()

    return data.review
  },
  deleteReview(id: number) {
    return request<{ message: string }>(`/api/admin/reviews/${id}`, { method: 'DELETE' })
  },
  searchUsersForReview(q: string) {
    return request<{ users: { id: number; email: string }[] }>(
      `/api/admin/reviews/users-search?q=${encodeURIComponent(q)}`
    )
  },

  // ─── Creator Applications ──────────────────────────────────────────────
  getCreatorApplications(params: {
    status?: CreatorAppStatus | 'all'
    page?: number
    per_page?: number
  } = {}) {
    const qs = new URLSearchParams()

    if (params.status) qs.set('status', params.status)
    if (params.page) qs.set('page', String(params.page))
    if (params.per_page) qs.set('per_page', String(params.per_page))
    const query = qs.toString()

    return request<{
      items: CreatorApplication[]
      counts: Record<CreatorAppStatus | 'all', number>
      total: number
      page: number
      per_page: number
      pages: number
    }>(`/api/admin/creator-applications${query ? `?${query}` : ''}`)
  },
  updateCreatorApplication(
    id: number,
    data: { status?: CreatorAppStatus; admin_note?: string | null }
  ) {
    return request<{ message: string; application: CreatorApplication }>(
      `/api/admin/creator-applications/${id}`,
      { method: 'PATCH', body: JSON.stringify(data) }
    )
  },
  deleteCreatorApplication(id: number) {
    return request<{ message: string }>(
      `/api/admin/creator-applications/${id}`,
      { method: 'DELETE' }
    )
  },
  listEmailLogs(filters: EmailLogsFilters = {}) {
    const sp = new URLSearchParams()
    if (filters.recipient) sp.set('recipient', filters.recipient)
    if (filters.type?.length) sp.set('type', filters.type.join(','))
    if (filters.status?.length) sp.set('status', filters.status.join(','))
    if (filters.user_id != null) sp.set('user_id', String(filters.user_id))
    if (filters.from) sp.set('from', filters.from)
    if (filters.to) sp.set('to', filters.to)
    if (filters.failed_only) sp.set('failed_only', '1')
    if (filters.page) sp.set('page', String(filters.page))
    if (filters.per_page) sp.set('per_page', String(filters.per_page))
    return request<EmailLogsListResponse>(`/api/admin/email-logs?${sp.toString()}`)
  },

  getEmailLog(id: number) {
    return request<EmailLogDetail>(`/api/admin/email-logs/${id}`)
  },

  resendEmailLog(id: number) {
    return request<{ message: string }>(`/api/admin/email-logs/${id}/resend`, { method: 'POST' })
  },

  markEmailVerified(userId: number) {
    return request<{ message: string }>(`/api/admin/users/${userId}/mark-email-verified`, { method: 'POST' })
  },

  // ── Redeem code campaigns (giveaways) ─────────────────────────────────
  getRedeemCampaigns(params?: { page?: number; per_page?: number; q?: string }) {
    const sp = new URLSearchParams()

    if (params?.page) sp.set('page', String(params.page))
    if (params?.per_page) sp.set('per_page', String(params.per_page))
    if (params?.q) sp.set('q', params.q)

    const suffix = sp.toString() ? `?${sp.toString()}` : ''

    return request<{
      campaigns: RedeemCampaign[]
      total: number
      page: number
      per_page: number
      pages: number
    }>(`/api/admin/redeem/campaigns${suffix}`)
  },
  getRedeemCampaign(id: number) {
    return request<{ campaign: RedeemCampaign }>(`/api/admin/redeem/campaigns/${id}`)
  },
  createRedeemCampaign(data: Partial<RedeemCampaign>) {
    return request<{ message: string; campaign: RedeemCampaign }>(
      '/api/admin/redeem/campaigns',
      { method: 'POST', body: JSON.stringify(data) }
    )
  },
  updateRedeemCampaign(id: number, data: Partial<RedeemCampaign>) {
    return request<{ message: string; campaign: RedeemCampaign }>(
      `/api/admin/redeem/campaigns/${id}`,
      { method: 'PATCH', body: JSON.stringify(data) }
    )
  },
  deleteRedeemCampaign(id: number) {
    return request<{ message: string }>(
      `/api/admin/redeem/campaigns/${id}`,
      { method: 'DELETE' }
    )
  },
  generateRedeemCodes(id: number, count: number) {
    return request<{
      message: string
      generated: number
      requested: number
      codes: string[]
    }>(`/api/admin/redeem/campaigns/${id}/generate`, {
      method: 'POST',
      body: JSON.stringify({ count }),
    })
  },
  getRedeemCodes(id: number, params?: {
    page?: number
    per_page?: number
    status?: 'all' | 'redeemed' | 'unredeemed'
  }) {
    const sp = new URLSearchParams()

    if (params?.page) sp.set('page', String(params.page))
    if (params?.per_page) sp.set('per_page', String(params.per_page))
    if (params?.status) sp.set('status', params.status)

    const suffix = sp.toString() ? `?${sp.toString()}` : ''

    return request<{
      codes: RedeemCode[]
      total: number
      page: number
      per_page: number
      pages: number
      campaign: RedeemCampaign
    }>(`/api/admin/redeem/campaigns/${id}/codes${suffix}`)
  },
  redeemCodesCsvUrl(id: number): string {
    return `${API_BASE}/api/admin/redeem/campaigns/${id}/codes.csv`
  },
}

export const redeemApi = {
  redeem(code: string) {
    return request<RedeemResponse>('/api/redeem/redeem', {
      method: 'POST',
      body: JSON.stringify({ code }),
    })
  },
}

export const cartApi = {
  list() {
    return request<CartResponse>('/api/store/cart')
  },

  add(gameId: number) {
    return request<{ item: CartItem; cart_item_count: number }>(
      '/api/store/cart/items',
      { method: 'POST', body: JSON.stringify({ game_id: gameId }) }
    )
  },

  remove(itemId: number) {
    return request<{ message: string }>(`/api/store/cart/items/${itemId}`, { method: 'DELETE' })
  },

  clear() {
    return request<{ message: string }>('/api/store/cart', { method: 'DELETE' })
  },

  preview(body: CartCheckoutBody) {
    return request<CartPreviewResponse>('/api/store/cart/preview', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  checkout(body: CartCheckoutBody) {
    return request<CartCheckoutResponse>('/api/store/checkout-cart', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },
}

// ─── Public (no auth) ────────────────────────────────────────────────────────

export const publicApi = {
  unsubscribe(token: string) {
    return request<{ message: string; email: string }>(
      `/api/unsubscribe/${encodeURIComponent(token)}`,
      { method: 'POST' }
    )
  },
  unsubscribeGuest(token: string) {
    return request<{ message: string; email: string }>(
      `/api/unsubscribe-guest/${encodeURIComponent(token)}`,
      { method: 'POST' }
    )
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

const GAME_PLACEHOLDER = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="460" height="215" viewBox="0 0 460 215">' +
  '<rect fill="#1a1a2e" width="460" height="215"/>' +
  '<text x="230" y="100" text-anchor="middle" fill="#333" font-family="sans-serif" font-size="40">&#127918;</text>' +
  '<text x="230" y="135" text-anchor="middle" fill="#555" font-family="sans-serif" font-size="14">Image not available</text>' +
  '</svg>'
)

export function gameHeaderImage(appid: number | string): string {
  return `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg`
}

export function gameThumbnail(appid: number | string): string {
  return `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/capsule_sm_120.jpg`
}

export function handleImageError(e: any) {
  e.target.onerror = null
  e.target.src = GAME_PLACEHOLDER
}
