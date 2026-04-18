import { RENDER_SERVICE_URL } from '../deployConfig.js'

const envBase = (import.meta.env.VITE_API_BASE || '').trim()
const normalizedEnvBase = envBase.replace(/\/+$/, '')
const fileBase = (RENDER_SERVICE_URL || '').trim().replace(/\/+$/, '')
const currentHost = (typeof window !== 'undefined' && window.location?.hostname) || ''
const runningLocal = currentHost === 'localhost' || currentHost === '127.0.0.1'

/**
 * - Local dev: '' → Vite proxy to Flask (see vite.config.js).
 * - Production: RENDER_SERVICE_URL from deployConfig.js (or VITE_API_BASE if set).
 * - If both empty on host, '' → same-origin only (vercel.json must rewrite to API).
 */
function resolveApiBase() {
  if (runningLocal) {
    if (normalizedEnvBase && normalizedEnvBase !== '/') return normalizedEnvBase
    return ''
  }
  if (normalizedEnvBase && normalizedEnvBase !== '/') return normalizedEnvBase
  if (fileBase && fileBase !== '/') return fileBase
  return ''
}

export const API_BASE = resolveApiBase()
const ADMIN_TOKEN_KEY = 'cemetery_admin_token'

function joinUrl(base, path) {
  if (!base) return path
  if (!path) return base
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  if (!path.startsWith('/')) return `${base}/${path}`
  return `${base}${path}`
}

function apiOrigin() {
  if (!API_BASE) return null
  try {
    return new URL(API_BASE).origin
  } catch {
    return null
  }
}

export function isApiCrossOrigin() {
  if (typeof window === 'undefined') return false
  const o = apiOrigin()
  if (!o) return false
  return o !== window.location.origin
}

export async function apiFetch(path, options = {}) {
  const url = joinUrl(API_BASE, path)
  const headers = new Headers(options.headers || {})
  const token = typeof window !== 'undefined' ? window.localStorage.getItem(ADMIN_TOKEN_KEY) : ''
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const cross = isApiCrossOrigin()
  const defaultCredentials = cross ? 'omit' : 'include'

  const requestOptions = {
    ...options,
    headers,
    credentials: options.credentials !== undefined ? options.credentials : defaultCredentials,
  }

  return fetch(url, requestOptions)
}

export function setAdminToken(token) {
  if (typeof window === 'undefined') return
  if (!token) {
    window.localStorage.removeItem(ADMIN_TOKEN_KEY)
    return
  }
  window.localStorage.setItem(ADMIN_TOKEN_KEY, token)
}
