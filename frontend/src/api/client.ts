import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
apiClient.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Auth ──────────────────────────────────────────────────────────
export const authApi = {
  register: (email: string, password: string, displayName?: string) =>
    apiClient.post('/auth/register', { email, password, displayName }),

  login: (email: string, password: string) =>
    apiClient.post('/auth/login', { email, password }),
};

// ─── Reminders ─────────────────────────────────────────────────────
export const remindersApi = {
  getAll: () => apiClient.get('/reminders'),
  getToday: () => apiClient.get('/reminders/today'),
  getMissed: () => apiClient.get('/reminders/missed'),
  getOne: (id: string) => apiClient.get(`/reminders/${id}`),
  create: (data: object) => apiClient.post('/reminders', data),
  update: (id: string, data: object) => apiClient.patch(`/reminders/${id}`, data),
  complete: (id: string) => apiClient.patch(`/reminders/${id}/complete`),
  remove: (id: string) => apiClient.delete(`/reminders/${id}`),
};

// ─── Parser ────────────────────────────────────────────────────────
export const parserApi = {
  parseText: (text: string) => apiClient.post('/parser/text', { text }),
};
