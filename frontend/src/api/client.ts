import axios from 'axios';
import { secureStorage } from '../storage';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Token helpers ──────────────────────────────────────────────────────────

export const tokenStore = {
  async getAccess()  { return secureStorage.getItem('access_token'); },
  async getRefresh() { return secureStorage.getItem('refresh_token'); },
  async save(accessToken: string, refreshToken: string) {
    await Promise.all([
      secureStorage.setItem('access_token', accessToken),
      secureStorage.setItem('refresh_token', refreshToken),
    ]);
  },
  async clear() {
    await Promise.all([
      secureStorage.removeItem('access_token'),
      secureStorage.removeItem('refresh_token'),
    ]);
  },
};

// ── Request interceptor — attach access token ──────────────────────────────

apiClient.interceptors.request.use(async (config) => {
  const token = await tokenStore.getAccess();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Response interceptor — silent token refresh on 401 ────────────────────

let refreshing: Promise<void> | null = null;

apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error?.response?.status !== 401 || original._retried) {
      return Promise.reject(error);
    }

    original._retried = true;

    // Deduplicate concurrent refresh attempts
    if (!refreshing) {
      refreshing = (async () => {
        try {
          const rt = await tokenStore.getRefresh();
          if (!rt) throw new Error('no refresh token');
          const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken: rt });
          await tokenStore.save(data.accessToken, data.refreshToken);
        } catch {
          await tokenStore.clear();
          // Don't redirect if already on an auth screen — avoids reload loops
          const onAuthPage = typeof window !== 'undefined' &&
            window.location.pathname.startsWith('/auth');
          if (!onAuthPage && typeof window !== 'undefined') {
            window.location.href = '/auth/login';
          }
        } finally {
          refreshing = null;
        }
      })();
    }

    await refreshing;

    // Retry original request with new access token
    const newToken = await tokenStore.getAccess();
    if (!newToken) return Promise.reject(error);
    original.headers.Authorization = `Bearer ${newToken}`;
    return apiClient(original);
  },
);

// ── Auth ──────────────────────────────────────────────────────────────────

export const authApi = {
  register: (email: string, password: string, displayName?: string) =>
    apiClient.post('/auth/register', { email, password, displayName }),

  login: (email: string, password: string) =>
    apiClient.post('/auth/login', { email, password }),

  refresh: (refreshToken: string) =>
    apiClient.post('/auth/refresh', { refreshToken }),

  logout: async () => {
    const rt = await tokenStore.getRefresh();
    if (rt) await apiClient.post('/auth/logout', { refreshToken: rt }).catch(() => {});
    await tokenStore.clear();
  },

  // #7 — SSE ticket (short-lived, one-time, never logged)
  getSseTicket: () => apiClient.post<{ ticket: string }>('/auth/sse-ticket'),

  // Email OTP
  sendEmailOtp: (email: string) =>
    apiClient.post('/auth/otp/email/send', { email }),
  verifyEmailOtp: (email: string, code: string) =>
    apiClient.post('/auth/otp/email/verify', { email, code }),

  // Phone OTP
  sendPhoneOtp: (phone: string) =>
    apiClient.post('/auth/otp/phone/send', { phone }),
  verifyPhoneOtp: (phone: string, code: string) =>
    apiClient.post('/auth/otp/phone/verify', { phone, code }),

  // Google OAuth URL
  googleAuthUrl: () => `${BASE_URL}/auth/google`,

  // Password reset
  forgotPassword: (email: string) =>
    apiClient.post('/auth/password/forgot', { email }),
  resetPassword: (email: string, code: string, newPassword: string) =>
    apiClient.post('/auth/password/reset', { email, code, newPassword }),
};

// ── Reminders ─────────────────────────────────────────────────────────────

export const remindersApi = {
  getAll: () => apiClient.get('/reminders'),
  getToday: () => apiClient.get('/reminders/today'),
  getMissed: () => apiClient.get('/reminders/missed'),
  getFiring: () => apiClient.get('/reminders/firing'),
  getOne: (id: string) => apiClient.get(`/reminders/${id}`),
  create: (data: object) => apiClient.post('/reminders', data),
  update: (id: string, data: object) => apiClient.patch(`/reminders/${id}`, data),
  complete: (id: string) => apiClient.patch(`/reminders/${id}/complete`),
  snooze: (id: string, minutes?: number) =>
    apiClient.patch(`/reminders/${id}/snooze${minutes !== undefined ? `?minutes=${minutes}` : ''}`),
  remove: (id: string) => apiClient.delete(`/reminders/${id}`),
};

// ── Users ─────────────────────────────────────────────────────────────────

export const usersApi = {
  getMe: () => apiClient.get('/users/me'),
  updateMe: (data: { displayName?: string; timezone?: string }) =>
    apiClient.patch('/users/me', data),
};

// ── Parser ────────────────────────────────────────────────────────────────

export const parserApi = {
  parseText: (text: string) =>
    apiClient.post(
      `/parser/text?tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`,
      { text },
    ),
};
