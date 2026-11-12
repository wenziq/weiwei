export const API_STORAGE_KEY = 'weiwei-api-base-url';
const defaultApiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000/api/v1';

export const env = {
  get apiBaseUrl() {
    try { return localStorage.getItem(API_STORAGE_KEY) ?? defaultApiBaseUrl; }
    catch { return defaultApiBaseUrl; }
  },
  isTauri: '__TAURI__' in window,
} as const;
